import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowService } from './workflow.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { WorkflowProcessorService } from './workflow.processor';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { IngestUrlDto } from './dto/ingest-url.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJobRecord(overrides: Partial<any> = {}): any {
  return {
    id: 'job-001',
    userId: 'user-001',
    url: 'https://example.com/article',
    status: 'QUEUED',
    collectionId: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

describe('WorkflowService', () => {
  let service: WorkflowService;

  const prismaCreate = jest.fn();
  const prismaFindUnique = jest.fn();
  const processorProcessUrlIngest = jest.fn();

  const mockPrisma = {
    kmsWorkflowJob: {
      create: prismaCreate,
      findUnique: prismaFindUnique,
    },
  };

  const mockProcessor = {
    processUrlIngest: processorProcessUrlIngest,
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

    // Prevent setImmediate from running real async work during tests
    jest.spyOn(global, 'setImmediate').mockImplementation((fn: any) => {
      return {} as NodeJS.Immediate;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WorkflowProcessorService, useValue: mockProcessor },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<WorkflowService>(WorkflowService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // queueUrlIngest()
  // -------------------------------------------------------------------------

  describe('queueUrlIngest()', () => {
    it('creates a job record in the database and returns WorkflowJobDto', async () => {
      const dto: IngestUrlDto = { url: 'https://example.com/article' } as IngestUrlDto;
      const jobRecord = makeJobRecord();
      prismaCreate.mockResolvedValue(jobRecord);

      const result = await service.queueUrlIngest(dto, 'user-001');

      expect(result.url).toBe(dto.url);
      expect(result.status).toBe('queued');
      expect(result.jobId).toBeDefined();
      expect(result.queuedAt).toBeDefined();
    });

    it('persists job with status QUEUED in the database', async () => {
      const dto: IngestUrlDto = { url: 'https://example.com/article' } as IngestUrlDto;
      const jobRecord = makeJobRecord();
      prismaCreate.mockResolvedValue(jobRecord);

      await service.queueUrlIngest(dto, 'user-001');

      expect(prismaCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-001',
          url: dto.url,
          status: 'QUEUED',
        }),
      });
    });

    it('includes collectionId in the persisted record when provided', async () => {
      const dto: IngestUrlDto = {
        url: 'https://example.com',
        collectionId: 'col-001',
      } as IngestUrlDto;
      const jobRecord = makeJobRecord({ collectionId: 'col-001' });
      prismaCreate.mockResolvedValue(jobRecord);

      await service.queueUrlIngest(dto, 'user-001');

      expect(prismaCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ collectionId: 'col-001' }),
      });
    });

    it('sets collectionId to null when not provided in dto', async () => {
      const dto: IngestUrlDto = { url: 'https://example.com' } as IngestUrlDto;
      const jobRecord = makeJobRecord();
      prismaCreate.mockResolvedValue(jobRecord);

      await service.queueUrlIngest(dto, 'user-001');

      expect(prismaCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ collectionId: null }),
      });
    });

    it('schedules processing via setImmediate (fire-and-forget)', async () => {
      const dto: IngestUrlDto = { url: 'https://example.com' } as IngestUrlDto;
      prismaCreate.mockResolvedValue(makeJobRecord());

      await service.queueUrlIngest(dto, 'user-001');

      expect(setImmediate).toHaveBeenCalledTimes(1);
    });

    it('returns queuedAt as an ISO-8601 string', async () => {
      const dto: IngestUrlDto = { url: 'https://example.com' } as IngestUrlDto;
      prismaCreate.mockResolvedValue(makeJobRecord());

      const result = await service.queueUrlIngest(dto, 'user-001');

      expect(() => new Date(result.queuedAt)).not.toThrow();
      expect(result.queuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // -------------------------------------------------------------------------
  // getJobStatus()
  // -------------------------------------------------------------------------

  describe('getJobStatus()', () => {
    it('returns jobId and lowercased status when job is found', async () => {
      prismaFindUnique.mockResolvedValue({ id: 'job-001', status: 'QUEUED' });

      const result = await service.getJobStatus('job-001');

      expect(result).toEqual({ jobId: 'job-001', status: 'queued' });
    });

    it('normalises DB UPPER_CASE status to lowercase for HTTP response', async () => {
      prismaFindUnique.mockResolvedValue({
        id: 'job-002',
        status: 'COMPLETED',
      });

      const result = await service.getJobStatus('job-002');

      expect(result.status).toBe('completed');
    });

    it('throws AppError KBWFL0001 when job is not found', async () => {
      prismaFindUnique.mockResolvedValue(null);

      await expect(service.getJobStatus('nonexistent')).rejects.toThrow(AppError);

      try {
        await service.getJobStatus('nonexistent');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).getStatus()).toBe(404);
        expect((err as AppError).code).toBe(ERROR_CODES.WFL.WORKFLOW_JOB_NOT_FOUND.code);
      }
    });

    it('queries by job id using findUnique', async () => {
      prismaFindUnique.mockResolvedValue({ id: 'job-001', status: 'PROCESSING' });

      await service.getJobStatus('job-001');

      expect(prismaFindUnique).toHaveBeenCalledWith({
        where: { id: 'job-001' },
        select: { id: true, status: true },
      });
    });

    it('returns FAILED status correctly normalised', async () => {
      prismaFindUnique.mockResolvedValue({
        id: 'job-003',
        status: 'FAILED',
      });

      const result = await service.getJobStatus('job-003');

      expect(result.status).toBe('failed');
    });
  });
});
