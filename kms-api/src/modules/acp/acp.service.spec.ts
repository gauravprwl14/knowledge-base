import { Test, TestingModule } from '@nestjs/testing';
import { firstValueFrom, toArray } from 'rxjs';
import { AcpService } from './acp.service';
import { AcpSessionStore, AcpSession } from './acp-session.store';
import { AcpToolRegistry } from './acp-tool.registry';
import { AnthropicAdapter } from './external-agent/anthropic.adapter';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { CreateSessionDto } from './dto/create-session.dto';
import { PromptSessionDto } from './dto/prompt-session.dto';
import { KmsSearchResponse } from './external-agent/external-agent.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<AcpSession> = {}): AcpSession {
  return {
    sessionId: 'sess-001',
    userId: 'user-001',
    createdAt: new Date('2024-01-01').toISOString(),
    lastTouchedAt: new Date('2024-01-01').toISOString(),
    ...overrides,
  };
}

function makeSearchResponse(overrides: Partial<KmsSearchResponse> = {}): KmsSearchResponse {
  return {
    results: [],
    total: 0,
    took_ms: 5,
    mode: 'hybrid',
    ...overrides,
  };
}

function makePromptDto(text: string): PromptSessionDto {
  return {
    prompt: [{ type: 'text', text }],
  };
}

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

describe('AcpService', () => {
  let service: AcpService;

  const sessionStoreCreate = jest.fn();
  const sessionStoreGet = jest.fn();
  const sessionStoreDelete = jest.fn();
  const toolRegistryKmsSearch = jest.fn();
  const anthropicStreamAnswer = jest.fn();

  const mockSessionStore = {
    create: sessionStoreCreate,
    get: sessionStoreGet,
    delete: sessionStoreDelete,
  };

  const mockToolRegistry = {
    kmsSearch: toolRegistryKmsSearch,
  };

  const mockAnthropicAdapter = {
    streamAnswer: anthropicStreamAnswer,
  };

  const mockChildLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const mockLogger = {
    child: jest.fn().mockReturnValue(mockChildLogger),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AcpService,
        { provide: AcpSessionStore, useValue: mockSessionStore },
        { provide: AcpToolRegistry, useValue: mockToolRegistry },
        { provide: AnthropicAdapter, useValue: mockAnthropicAdapter },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AcpService>(AcpService);
  });

  // -------------------------------------------------------------------------
  // createSession()
  // -------------------------------------------------------------------------

  describe('createSession()', () => {
    it('delegates to sessionStore.create and returns the session', async () => {
      const dto: CreateSessionDto = { cwd: '/home/dev' };
      const session = makeSession();
      sessionStoreCreate.mockResolvedValue(session);

      const result = await service.createSession('user-001', dto);

      expect(result).toEqual(session);
      expect(sessionStoreCreate).toHaveBeenCalledWith('user-001', dto.cwd);
    });

    it('returns sessionId in the created session', async () => {
      const dto: CreateSessionDto = {};
      const session = makeSession();
      sessionStoreCreate.mockResolvedValue(session);

      const result = await service.createSession('user-001', dto);

      expect(result.sessionId).toBe('sess-001');
    });
  });

  // -------------------------------------------------------------------------
  // closeSession()
  // -------------------------------------------------------------------------

  describe('closeSession()', () => {
    it('delegates to sessionStore.delete', async () => {
      sessionStoreDelete.mockResolvedValue(undefined);

      await service.closeSession('sess-001');

      expect(sessionStoreDelete).toHaveBeenCalledWith('sess-001');
    });

    it('resolves without throwing when deletion succeeds', async () => {
      sessionStoreDelete.mockResolvedValue(undefined);

      await expect(service.closeSession('sess-001')).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // runPrompt()
  // -------------------------------------------------------------------------

  describe('runPrompt()', () => {
    it('returns an Observable immediately (does not block)', () => {
      const session = makeSession();
      sessionStoreGet.mockResolvedValue(session);
      toolRegistryKmsSearch.mockResolvedValue(makeSearchResponse());
      anthropicStreamAnswer.mockResolvedValue(undefined);

      const observable = service.runPrompt('sess-001', makePromptDto('hello'), 'user-001');

      // Must be an Observable (has subscribe method)
      expect(observable).toBeDefined();
      expect(typeof observable.subscribe).toBe('function');
    });

    it('emits error event when session is not found (store throws)', async () => {
      sessionStoreGet.mockRejectedValue(
        new AppError({ code: ERROR_CODES.EXT.ACP_SESSION_NOT_FOUND.code }),
      );

      const observable = service.runPrompt('nonexistent', makePromptDto('hello'), 'user-001');

      // Collect all events from the observable
      const events = await firstValueFrom(observable.pipe(toArray()));
      expect(events.length).toBeGreaterThanOrEqual(1);

      // The last event should be an error type
      const lastEvent = events[events.length - 1];
      const parsed = JSON.parse(lastEvent.data as string);
      expect(parsed.type).toBe('error');
    });

    it('emits error event when callerId does not match session.userId', async () => {
      // Session belongs to user-001 but caller is user-999
      const session = makeSession({ userId: 'user-001' });
      sessionStoreGet.mockResolvedValue(session);

      const observable = service.runPrompt('sess-001', makePromptDto('hello'), 'user-999');

      const events = await firstValueFrom(observable.pipe(toArray()));
      expect(events.length).toBeGreaterThanOrEqual(1);

      const lastEvent = events[events.length - 1];
      const parsed = JSON.parse(lastEvent.data as string);
      expect(parsed.type).toBe('error');
      expect(parsed.data.message).toMatch(/denied/i);
    });

    it('emits error event when prompt contains no text content', async () => {
      const session = makeSession();
      sessionStoreGet.mockResolvedValue(session);

      // Empty prompt array → no text content
      const emptyDto: PromptSessionDto = { prompt: [] };
      const observable = service.runPrompt('sess-001', emptyDto, 'user-001');

      const events = await firstValueFrom(observable.pipe(toArray()));
      const lastEvent = events[events.length - 1];
      const parsed = JSON.parse(lastEvent.data as string);
      expect(parsed.type).toBe('error');
      expect(parsed.data.message).toMatch(/no text/i);
    });

    it('calls toolRegistry.kmsSearch with the correct query for a valid prompt', async () => {
      const session = makeSession();
      sessionStoreGet.mockResolvedValue(session);
      toolRegistryKmsSearch.mockResolvedValue(makeSearchResponse());
      anthropicStreamAnswer.mockResolvedValue(undefined);

      const observable = service.runPrompt('sess-001', makePromptDto('What is BGE-M3?'), 'user-001');

      // Drain the observable to let the async pipeline execute
      await firstValueFrom(observable.pipe(toArray()));

      expect(toolRegistryKmsSearch).toHaveBeenCalledWith(
        'What is BGE-M3?',
        'user-001',
        'hybrid',
        5,
      );
    });

    it('calls anthropicAdapter.streamAnswer after kmsSearch completes', async () => {
      const session = makeSession();
      const searchResp = makeSearchResponse({ results: [], total: 0 });
      sessionStoreGet.mockResolvedValue(session);
      toolRegistryKmsSearch.mockResolvedValue(searchResp);
      anthropicStreamAnswer.mockResolvedValue(undefined);

      const observable = service.runPrompt('sess-001', makePromptDto('hello'), 'user-001');

      await firstValueFrom(observable.pipe(toArray()));

      expect(anthropicStreamAnswer).toHaveBeenCalledWith(
        'hello',
        searchResp.results,
        expect.any(Object),
      );
    });
  });
});
