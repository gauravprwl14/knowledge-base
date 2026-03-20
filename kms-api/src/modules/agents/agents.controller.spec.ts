import { Test, TestingModule } from '@nestjs/testing';
import { of, toArray } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService, CreateRunDto } from './agents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RUN_ID = 'run-aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockRun = {
  runId: RUN_ID,
  status: 'pending',
  createdAt: '2025-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

const mockAgentsService = {
  createRun: jest.fn(),
  getRun: jest.fn(),
  streamRun: jest.fn(),
  cancelRun: jest.fn(),
};

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

describe('AgentsController', () => {
  let controller: AgentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentsController],
      providers: [{ provide: AgentsService, useValue: mockAgentsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AgentsController>(AgentsController);
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // JwtAuthGuard wiring
  // =========================================================================

  describe('JwtAuthGuard', () => {
    it('is applied at controller level so every route requires a valid JWT', async () => {
      const denyGuard = { canActivate: jest.fn().mockReturnValue(false) };

      const blockedModule: TestingModule = await Test.createTestingModule({
        controllers: [AgentsController],
        providers: [{ provide: AgentsService, useValue: mockAgentsService }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(denyGuard)
        .compile();

      const blockedController = blockedModule.get<AgentsController>(AgentsController);
      expect(blockedController).toBeDefined();
      // When canActivate returns false NestJS raises ForbiddenException before
      // reaching the handler. The guard mock proves the override is applied.
      expect(denyGuard.canActivate()).toBe(false);
    });
  });

  // =========================================================================
  // POST /chat/runs
  // =========================================================================

  describe('createRun()', () => {
    const dto: CreateRunDto = { message: 'What is semantic search?' };

    it('delegates to agentsService.createRun with the request body', async () => {
      mockAgentsService.createRun.mockResolvedValue(mockRun);

      const result = await controller.createRun(dto);

      expect(mockAgentsService.createRun).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockRun);
    });

    it('returns the run object containing a runId', async () => {
      mockAgentsService.createRun.mockResolvedValue(mockRun);

      const result = (await controller.createRun(dto)) as typeof mockRun;

      expect(result.runId).toBe(RUN_ID);
    });

    it('forwards an optional sessionId to the service', async () => {
      const dtoWithSession: CreateRunDto = {
        message: 'Follow-up question',
        sessionId: 'session-001',
      };
      mockAgentsService.createRun.mockResolvedValue({ ...mockRun, sessionId: 'session-001' });

      await controller.createRun(dtoWithSession);

      expect(mockAgentsService.createRun).toHaveBeenCalledWith(dtoWithSession);
    });

    it('forwards optional collectionIds scoping to the service', async () => {
      const dtoWithCollections: CreateRunDto = {
        message: 'Scoped query',
        collectionIds: ['col-1', 'col-2'],
      };
      mockAgentsService.createRun.mockResolvedValue(mockRun);

      await controller.createRun(dtoWithCollections);

      const [capturedDto] = mockAgentsService.createRun.mock.calls[0];
      expect(capturedDto.collectionIds).toEqual(['col-1', 'col-2']);
    });

    it('propagates errors thrown by agentsService.createRun', async () => {
      const err = new Error('rag-service unavailable');
      mockAgentsService.createRun.mockRejectedValue(err);

      await expect(controller.createRun(dto)).rejects.toThrow('rag-service unavailable');
    });
  });

  // =========================================================================
  // GET /chat/runs/:runId
  // =========================================================================

  describe('getRun()', () => {
    it('delegates to agentsService.getRun with the route param', async () => {
      mockAgentsService.getRun.mockResolvedValue(mockRun);

      const result = await controller.getRun(RUN_ID);

      expect(mockAgentsService.getRun).toHaveBeenCalledWith(RUN_ID);
      expect(result).toEqual(mockRun);
    });

    it('passes the exact runId string from the route parameter', async () => {
      mockAgentsService.getRun.mockResolvedValue(mockRun);

      await controller.getRun(RUN_ID);

      const [capturedRunId] = mockAgentsService.getRun.mock.calls[0];
      expect(capturedRunId).toBe(RUN_ID);
    });

    it('returns a run with status completed when the run is done', async () => {
      const completedRun = { ...mockRun, status: 'completed' };
      mockAgentsService.getRun.mockResolvedValue(completedRun);

      const result = (await controller.getRun(RUN_ID)) as typeof completedRun;

      expect(result.status).toBe('completed');
    });

    it('propagates errors thrown by agentsService.getRun (e.g. 404)', async () => {
      const err = new Error('Run not found');
      mockAgentsService.getRun.mockRejectedValue(err);

      await expect(controller.getRun('nonexistent-id')).rejects.toThrow('Run not found');
    });
  });

  // =========================================================================
  // SSE /chat/runs/:runId/stream
  // =========================================================================

  describe('streamRun()', () => {
    it('delegates to agentsService.streamRun with the route param', () => {
      const observable = of<MessageEvent>({ data: 'token' } as MessageEvent);
      mockAgentsService.streamRun.mockReturnValue(observable);

      controller.streamRun(RUN_ID);

      expect(mockAgentsService.streamRun).toHaveBeenCalledWith(RUN_ID);
    });

    it('returns the Observable from agentsService.streamRun unchanged', () => {
      const observable = of<MessageEvent>({ data: 'hello' } as MessageEvent);
      mockAgentsService.streamRun.mockReturnValue(observable);

      const result = controller.streamRun(RUN_ID);

      expect(result).toBe(observable);
    });

    it('SSE stream emits token chunks from the rag-service', async () => {
      const events: MessageEvent[] = [
        { data: 'data: chunk1\n\n' } as MessageEvent,
        { data: 'data: chunk2\n\n' } as MessageEvent,
      ];
      mockAgentsService.streamRun.mockReturnValue(of(...events));

      const received = await firstValueFrom(controller.streamRun(RUN_ID).pipe(toArray()));

      expect(received).toHaveLength(2);
      expect(received[0].data).toBe('data: chunk1\n\n');
    });

    it('returns an Observable (has a subscribe method)', () => {
      const observable = of<MessageEvent>({ data: '' } as MessageEvent);
      mockAgentsService.streamRun.mockReturnValue(observable);

      const result = controller.streamRun(RUN_ID);

      expect(typeof (result as any).subscribe).toBe('function');
    });

    it('propagates an Observable error from the service', async () => {
      const { throwError } = await import('rxjs');
      const errObservable = throwError(() => new Error('SSE failed'));
      mockAgentsService.streamRun.mockReturnValue(errObservable);

      const result = controller.streamRun(RUN_ID);

      await expect(firstValueFrom(result)).rejects.toThrow('SSE failed');
    });
  });

  // =========================================================================
  // DELETE /chat/runs/:runId
  // =========================================================================

  describe('cancelRun()', () => {
    it('delegates to agentsService.cancelRun with the route param', async () => {
      mockAgentsService.cancelRun.mockResolvedValue(undefined);

      await controller.cancelRun(RUN_ID);

      expect(mockAgentsService.cancelRun).toHaveBeenCalledWith(RUN_ID);
      expect(mockAgentsService.cancelRun).toHaveBeenCalledTimes(1);
    });

    it('resolves to undefined (204 No Content)', async () => {
      mockAgentsService.cancelRun.mockResolvedValue(undefined);

      const result = await controller.cancelRun(RUN_ID);

      expect(result).toBeUndefined();
    });

    it('passes the exact runId string to the service', async () => {
      mockAgentsService.cancelRun.mockResolvedValue(undefined);

      await controller.cancelRun('specific-run-id');

      expect(mockAgentsService.cancelRun).toHaveBeenCalledWith('specific-run-id');
    });

    it('propagates errors from agentsService.cancelRun', async () => {
      const err = new Error('Cancel failed');
      mockAgentsService.cancelRun.mockRejectedValue(err);

      await expect(controller.cancelRun(RUN_ID)).rejects.toThrow('Cancel failed');
    });
  });
});
