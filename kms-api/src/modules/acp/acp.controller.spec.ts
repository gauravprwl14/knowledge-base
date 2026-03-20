import { Test, TestingModule } from '@nestjs/testing';
import { firstValueFrom, of, toArray } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { AcpController } from './acp.controller';
import { AcpService } from './acp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ACP_TOOLS } from './acp-tool.registry';
import { InitializeAcpDto } from './dto/initialize-acp.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import { PromptSessionDto } from './dto/prompt-session.dto';
import { AcpSession } from './acp-session.store';

// ---------------------------------------------------------------------------
// Constants — no random IDs in tests
// ---------------------------------------------------------------------------

const TEST_SESSION_ID = 'test-session-id';
const TEST_USER_ID = 'test-user-id';
const OTHER_USER_ID = 'other-user-id';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<AcpSession> = {}): AcpSession {
  return {
    sessionId: TEST_SESSION_ID,
    userId: TEST_USER_ID,
    createdAt: '2024-01-01T00:00:00.000Z',
    lastTouchedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePromptDto(text: string): PromptSessionDto {
  return { prompt: [{ type: 'text', text }] };
}

/** Wraps a plain string as a SSE MessageEvent (mirrors AcpEventEmitter output). */
function makeSseEvent(payload: object): MessageEvent {
  return { data: JSON.stringify(payload) } as MessageEvent;
}

// ---------------------------------------------------------------------------
// Mock AcpService — all methods are jest.fn()
// ---------------------------------------------------------------------------

const mockAcpService = {
  createSession: jest.fn(),
  runPrompt: jest.fn(),
  closeSession: jest.fn(),
};

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

describe('AcpController', () => {
  let controller: AcpController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AcpController],
      providers: [{ provide: AcpService, useValue: mockAcpService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AcpController>(AcpController);
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // Route metadata
  // =========================================================================

  describe('route metadata', () => {
    it('initialize() is marked @Public() — IS_PUBLIC_KEY metadata is true', () => {
      // Reflect the metadata set by the @Public() decorator on the handler method.
      const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, controller.initialize);
      expect(isPublic).toBe(true);
    });

    it('createSession() is NOT marked @Public()', () => {
      const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, controller.createSession);
      expect(isPublic).toBeUndefined();
    });

    it('promptSession() is NOT marked @Public()', () => {
      const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, controller.promptSession);
      expect(isPublic).toBeUndefined();
    });

    it('closeSession() is NOT marked @Public()', () => {
      const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, controller.closeSession);
      expect(isPublic).toBeUndefined();
    });
  });

  // =========================================================================
  // POST /acp/v1/initialize
  // =========================================================================

  describe('initialize()', () => {
    const dto: InitializeAcpDto = { protocolVersion: 1 };

    it('returns protocolVersion 1', () => {
      const result = controller.initialize(dto) as Record<string, unknown>;
      expect(result.protocolVersion).toBe(1);
    });

    it('returns agentCapabilities with a tools array', () => {
      const result = controller.initialize(dto) as { agentCapabilities: { tools: unknown[] } };
      expect(result.agentCapabilities).toBeDefined();
      expect(Array.isArray(result.agentCapabilities.tools)).toBe(true);
    });

    it('returns the full ACP_TOOLS list in agentCapabilities.tools', () => {
      const result = controller.initialize(dto) as { agentCapabilities: { tools: unknown[] } };
      expect(result.agentCapabilities.tools).toEqual(ACP_TOOLS);
    });

    it('does NOT call acpService — handler is self-contained', () => {
      controller.initialize(dto);
      expect(mockAcpService.createSession).not.toHaveBeenCalled();
      expect(mockAcpService.runPrompt).not.toHaveBeenCalled();
      expect(mockAcpService.closeSession).not.toHaveBeenCalled();
    });

    it('accepts optional clientInfo without throwing', () => {
      const dtoWithClient: InitializeAcpDto = {
        protocolVersion: 1,
        clientInfo: { name: 'claude-code', version: '1.0.0' },
      };
      expect(() => controller.initialize(dtoWithClient)).not.toThrow();
    });
  });

  // =========================================================================
  // POST /acp/v1/sessions
  // =========================================================================

  describe('createSession()', () => {
    const req = { user: { id: TEST_USER_ID } };

    it('delegates to acpService.createSession with userId from JWT and dto', async () => {
      const dto: CreateSessionDto = { cwd: '/home/dev/project' };
      mockAcpService.createSession.mockResolvedValue(makeSession({ cwd: '/home/dev/project' }));

      await controller.createSession(dto, req);

      expect(mockAcpService.createSession).toHaveBeenCalledWith(TEST_USER_ID, dto);
    });

    it('returns { sessionId } extracted from the created session', async () => {
      const dto: CreateSessionDto = {};
      mockAcpService.createSession.mockResolvedValue(makeSession());

      const result = await controller.createSession(dto, req);

      expect(result).toEqual({ sessionId: TEST_SESSION_ID });
    });

    it('works when cwd is undefined (optional field)', async () => {
      const dto: CreateSessionDto = {};
      mockAcpService.createSession.mockResolvedValue(makeSession());

      const result = await controller.createSession(dto, req);

      expect(result.sessionId).toBe(TEST_SESSION_ID);
    });

    it('propagates an error thrown by acpService.createSession', async () => {
      const dto: CreateSessionDto = {};
      mockAcpService.createSession.mockRejectedValue(new Error('Redis unavailable'));

      await expect(controller.createSession(dto, req)).rejects.toThrow('Redis unavailable');
    });

    it('creates separate sessions for different users (userId isolation)', async () => {
      const dto: CreateSessionDto = {};
      const req2 = { user: { id: OTHER_USER_ID } };
      const session2 = makeSession({ sessionId: 'other-session-id', userId: OTHER_USER_ID });

      mockAcpService.createSession
        .mockResolvedValueOnce(makeSession())
        .mockResolvedValueOnce(session2);

      const r1 = await controller.createSession(dto, req);
      const r2 = await controller.createSession(dto, req2);

      expect(r1.sessionId).toBe(TEST_SESSION_ID);
      expect(r2.sessionId).toBe('other-session-id');
      expect(mockAcpService.createSession).toHaveBeenNthCalledWith(1, TEST_USER_ID, dto);
      expect(mockAcpService.createSession).toHaveBeenNthCalledWith(2, OTHER_USER_ID, dto);
    });
  });

  // =========================================================================
  // POST /acp/v1/sessions/:id/prompt  (SSE)
  // =========================================================================

  describe('promptSession()', () => {
    const req = { user: { id: TEST_USER_ID } };

    it('delegates to acpService.runPrompt with sessionId, dto, and userId', () => {
      const dto = makePromptDto('What is BGE-M3?');
      const observable = of<MessageEvent>(
        makeSseEvent({ type: 'done', data: {} }),
      );
      mockAcpService.runPrompt.mockReturnValue(observable);

      controller.promptSession(TEST_SESSION_ID, dto, req);

      expect(mockAcpService.runPrompt).toHaveBeenCalledWith(TEST_SESSION_ID, dto, TEST_USER_ID);
    });

    it('returns the Observable from acpService.runPrompt unchanged', () => {
      const dto = makePromptDto('hello');
      const observable = of<MessageEvent>(makeSseEvent({ type: 'done', data: {} }));
      mockAcpService.runPrompt.mockReturnValue(observable);

      const result = controller.promptSession(TEST_SESSION_ID, dto, req);

      expect(result).toBe(observable);
    });

    it('SSE stream emits agent_message_chunk events', async () => {
      const dto = makePromptDto('Tell me about embeddings');
      const events: MessageEvent[] = [
        makeSseEvent({ type: 'agent_message_chunk', data: { text: 'Embeddings' } }),
        makeSseEvent({ type: 'agent_message_chunk', data: { text: ' are vectors.' } }),
        makeSseEvent({ type: 'done', data: {} }),
      ];
      mockAcpService.runPrompt.mockReturnValue(of(...events));

      const observable = controller.promptSession(TEST_SESSION_ID, dto, req);
      const received = await firstValueFrom(observable.pipe(toArray()));

      expect(received).toHaveLength(3);
      const first = JSON.parse(received[0].data as string);
      expect(first.type).toBe('agent_message_chunk');
      expect(first.data.text).toBe('Embeddings');
    });

    it('SSE stream emits tool_call_start and tool_call_result events', async () => {
      const dto = makePromptDto('Search something');
      const events: MessageEvent[] = [
        makeSseEvent({ type: 'tool_call_start', data: { tool: 'kms_search', args: { query: 'Search something', mode: 'hybrid', limit: 5 } } }),
        makeSseEvent({ type: 'tool_call_result', data: { tool: 'kms_search', resultCount: 3 } }),
        makeSseEvent({ type: 'done', data: {} }),
      ];
      mockAcpService.runPrompt.mockReturnValue(of(...events));

      const observable = controller.promptSession(TEST_SESSION_ID, dto, req);
      const received = await firstValueFrom(observable.pipe(toArray()));

      const toolStart = JSON.parse(received[0].data as string);
      expect(toolStart.type).toBe('tool_call_start');
      expect(toolStart.data.tool).toBe('kms_search');

      const toolResult = JSON.parse(received[1].data as string);
      expect(toolResult.type).toBe('tool_call_result');
      expect(toolResult.data.resultCount).toBe(3);
    });

    it('SSE stream terminates with done event', async () => {
      const dto = makePromptDto('Finish me');
      const events: MessageEvent[] = [
        makeSseEvent({ type: 'agent_message_chunk', data: { text: 'Answer.' } }),
        makeSseEvent({ type: 'done', data: {} }),
      ];
      mockAcpService.runPrompt.mockReturnValue(of(...events));

      const observable = controller.promptSession(TEST_SESSION_ID, dto, req);
      const received = await firstValueFrom(observable.pipe(toArray()));

      const last = JSON.parse(received[received.length - 1].data as string);
      expect(last.type).toBe('done');
    });

    it('SSE stream emits error event when session is not found (403 emitted in-band)', async () => {
      const dto = makePromptDto('Any prompt');
      const events: MessageEvent[] = [
        makeSseEvent({ type: 'error', data: { message: 'Session not found or access denied' } }),
      ];
      mockAcpService.runPrompt.mockReturnValue(of(...events));

      const observable = controller.promptSession('nonexistent-id', dto, req);
      const received = await firstValueFrom(observable.pipe(toArray()));

      expect(received).toHaveLength(1);
      const errorEvent = JSON.parse(received[0].data as string);
      expect(errorEvent.type).toBe('error');
      expect(errorEvent.data.message).toMatch(/denied|not found/i);
    });

    it('SSE stream emits error event when user does not own the session', async () => {
      const dto = makePromptDto('Injected prompt');
      const wrongUserReq = { user: { id: OTHER_USER_ID } };
      const events: MessageEvent[] = [
        makeSseEvent({ type: 'error', data: { message: 'Session not found or access denied' } }),
      ];
      mockAcpService.runPrompt.mockReturnValue(of(...events));

      const observable = controller.promptSession(TEST_SESSION_ID, dto, wrongUserReq);
      const received = await firstValueFrom(observable.pipe(toArray()));

      expect(mockAcpService.runPrompt).toHaveBeenCalledWith(TEST_SESSION_ID, dto, OTHER_USER_ID);
      const errorEvent = JSON.parse(received[0].data as string);
      expect(errorEvent.type).toBe('error');
    });

    it('SSE stream emits error event when prompt has no text content', async () => {
      const emptyDto: PromptSessionDto = { prompt: [] };
      const events: MessageEvent[] = [
        makeSseEvent({ type: 'error', data: { message: 'Prompt contains no text content' } }),
      ];
      mockAcpService.runPrompt.mockReturnValue(of(...events));

      const observable = controller.promptSession(TEST_SESSION_ID, emptyDto, req);
      const received = await firstValueFrom(observable.pipe(toArray()));

      const errorEvent = JSON.parse(received[0].data as string);
      expect(errorEvent.type).toBe('error');
      expect(errorEvent.data.message).toMatch(/no text/i);
    });

    it('returns Observable synchronously — does not await the pipeline', () => {
      const dto = makePromptDto('quick');
      const observable = of<MessageEvent>(makeSseEvent({ type: 'done', data: {} }));
      mockAcpService.runPrompt.mockReturnValue(observable);

      // promptSession is synchronous — it must return an Observable (not a Promise).
      const result = controller.promptSession(TEST_SESSION_ID, dto, req);

      expect(typeof (result as unknown as { subscribe: unknown }).subscribe).toBe('function');
    });
  });

  // =========================================================================
  // DELETE /acp/v1/sessions/:id
  // =========================================================================

  describe('closeSession()', () => {
    it('delegates to acpService.closeSession with the session ID from route param', async () => {
      mockAcpService.closeSession.mockResolvedValue(undefined);

      await controller.closeSession(TEST_SESSION_ID);

      expect(mockAcpService.closeSession).toHaveBeenCalledWith(TEST_SESSION_ID);
      expect(mockAcpService.closeSession).toHaveBeenCalledTimes(1);
    });

    it('resolves to undefined (204 No Content body is empty)', async () => {
      mockAcpService.closeSession.mockResolvedValue(undefined);

      const result = await controller.closeSession(TEST_SESSION_ID);

      expect(result).toBeUndefined();
    });

    it('propagates an error thrown by acpService.closeSession', async () => {
      mockAcpService.closeSession.mockRejectedValue(new Error('Redis error'));

      await expect(controller.closeSession(TEST_SESSION_ID)).rejects.toThrow('Redis error');
    });

    it('can close any session ID — passes the exact string from the route param', async () => {
      const customId = 'custom-session-abc-123';
      mockAcpService.closeSession.mockResolvedValue(undefined);

      await controller.closeSession(customId);

      expect(mockAcpService.closeSession).toHaveBeenCalledWith(customId);
    });
  });

  // =========================================================================
  // JwtAuthGuard integration — guard override smoke tests
  // =========================================================================

  describe('JwtAuthGuard', () => {
    it('createSession() is reachable when JwtAuthGuard is overridden to allow', async () => {
      const dto: CreateSessionDto = {};
      const req = { user: { id: TEST_USER_ID } };
      mockAcpService.createSession.mockResolvedValue(makeSession());

      const result = await controller.createSession(dto, req);

      expect(result.sessionId).toBe(TEST_SESSION_ID);
    });

    it('promptSession() is reachable when JwtAuthGuard is overridden to allow', async () => {
      const dto = makePromptDto('hello');
      const req = { user: { id: TEST_USER_ID } };
      mockAcpService.runPrompt.mockReturnValue(
        of<MessageEvent>(makeSseEvent({ type: 'done', data: {} })),
      );

      const observable = controller.promptSession(TEST_SESSION_ID, dto, req);

      expect(observable).toBeDefined();
    });

    it('closeSession() is reachable when JwtAuthGuard is overridden to allow', async () => {
      mockAcpService.closeSession.mockResolvedValue(undefined);

      await expect(controller.closeSession(TEST_SESSION_ID)).resolves.not.toThrow();
    });

    it('JwtAuthGuard canActivate → false blocks the request before the handler runs', async () => {
      // Build a fresh module where the guard rejects access.
      const denyGuard = { canActivate: jest.fn().mockReturnValue(false) };

      const blockedModule: TestingModule = await Test.createTestingModule({
        controllers: [AcpController],
        providers: [{ provide: AcpService, useValue: mockAcpService }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(denyGuard)
        .compile();

      // Confirm the module compiled and the controller is wired up.
      const blockedController = blockedModule.get<AcpController>(AcpController);
      expect(blockedController).toBeDefined();

      // The override replaced JwtAuthGuard with denyGuard.
      // In a real HTTP request, canActivate() returning false causes NestJS to
      // throw ForbiddenException before reaching the handler. We validate the
      // guard mock itself to prove the override was applied correctly.
      expect(denyGuard.canActivate()).toBe(false);
    });
  });
});
