import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AgentsService } from './agents.service';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';

const mockConfig = {
  get: jest.fn().mockReturnValue('http://rag-service:8002'),
};

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('AgentsService', () => {
  let service: AgentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(AgentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('createRun', () => {
    it('POSTs to rag-service /runs and returns run data', async () => {
      const mockRunData = { runId: 'run-abc', status: 'pending', createdAt: '2025-01-01T00:00:00Z' };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockRunData),
      } as any);

      const result = await service.createRun({ message: 'What is KMS?' }) as any;
      expect(result).toMatchObject({ runId: 'run-abc' });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/runs'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws AppError when rag-service is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(service.createRun({ message: 'q' })).rejects.toThrow(AppError);
    });

    it('throws AppError when rag-service returns 500', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 } as any);
      await expect(service.createRun({ message: 'q' })).rejects.toThrow(AppError);
    });
  });

  describe('getRun', () => {
    it('GETs run status from rag-service', async () => {
      const runInfo = { runId: 'run-abc', status: 'completed', createdAt: '2025-01-01T00:00:00Z' };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(runInfo),
      } as any);

      const result = await service.getRun('run-abc') as any;
      expect(result.status).toBe('completed');
    });

    it('throws AppError when run is not found (404)', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 } as any);
      await expect(service.getRun('missing')).rejects.toThrow(AppError);
    });
  });

  describe('cancelRun', () => {
    it('sends DELETE to rag-service for the run', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({}) } as any);
      await expect(service.cancelRun('run-abc')).resolves.not.toThrow();
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('run-abc');
      expect(init.method).toBe('DELETE');
    });
  });
});
