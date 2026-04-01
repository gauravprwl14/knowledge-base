import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { getLoggerToken } from 'nestjs-pino';
import { ContentJobsService } from './content-jobs.service';
import { ContentJobPublisher } from './content-job.publisher';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { ContentJobStatus, ContentSourceType } from '@prisma/client';
import { CreateContentJobDto } from './dto/create-content-job.dto';
import { ListContentJobsQueryDto } from './dto/list-content-jobs-query.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock ContentJob record with sensible defaults.
 * Override any field with `overrides`.
 */
function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-001',
    userId: 'user-001',
    sourceType: ContentSourceType.YOUTUBE,
    sourceUrl: 'https://youtube.com/watch?v=abc',
    sourceFileId: null,
    title: null,
    status: ContentJobStatus.QUEUED,
    stepsJson: {},
    configSnapshot: {},
    errorMessage: null,
    transcriptText: null,
    conceptsText: null,
    voiceBriefText: '',
    tags: [],
    completedAt: null,
    createdAt: new Date('2026-01-01T12:00:00.000Z'),
    updatedAt: new Date('2026-01-01T12:00:00.000Z'),
    pieces: [],
    ...overrides,
  };
}

/**
 * Creates a mock ContentConfiguration record.
 */
function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cfg-001',
    userId: 'user-001',
    platformConfig: { linkedin: { enabled: true } },
    voiceMode: 'auto',
    hashnodeApiKeyEncrypted: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates a mock CreatorVoiceProfile record.
 */
function makeVoiceProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vp-001',
    userId: 'user-001',
    profileText: 'I write conversational technical posts.',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

describe('ContentJobsService', () => {
  let service: ContentJobsService;
  // Holds the compiled TestingModule — created once in beforeAll and closed in afterAll.
  let module: TestingModule;

  // --- PrismaService mocks ---
  const prismaContentJobCreate = jest.fn();
  const prismaContentJobFindUnique = jest.fn();
  const prismaContentJobFindMany = jest.fn();
  const prismaContentJobCount = jest.fn();
  const prismaContentJobUpdate = jest.fn();
  const prismaContentJobUpdateMany = jest.fn();
  const prismaContentJobDelete = jest.fn();
  const prismaContentConfigFindUnique = jest.fn();
  const prismaVoiceProfileFindUnique = jest.fn();

  const mockPrisma = {
    contentJob: {
      create: prismaContentJobCreate,
      findUnique: prismaContentJobFindUnique,
      findMany: prismaContentJobFindMany,
      count: prismaContentJobCount,
      update: prismaContentJobUpdate,
      updateMany: prismaContentJobUpdateMany,
      delete: prismaContentJobDelete,
    },
    contentConfiguration: {
      findUnique: prismaContentConfigFindUnique,
    },
    creatorVoiceProfile: {
      findUnique: prismaVoiceProfileFindUnique,
    },
  };

  // --- ContentJobPublisher mock ---
  const mockPublishContentJob = jest.fn().mockResolvedValue(undefined);
  const mockPublisher = { publishContentJob: mockPublishContentJob };

  // --- PinoLogger mock ---
  // Uses the nestjs-pino injection token pattern: `PinoLogger:<ClassName>`.
  // `getLoggerToken(ClassName.name)` produces the same token that
  // `@InjectPinoLogger(ClassName.name)` resolves, so the DI container finds
  // the mock without needing the real nestjs-pino module wired up.
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  // Create the NestJS TestingModule ONCE per describe block to avoid creating
  // a new module (and associated async resources) for every test.
  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        ContentJobsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ContentJobPublisher, useValue: mockPublisher },
        { provide: getLoggerToken(ContentJobsService.name), useValue: mockLogger },
      ],
    }).compile();

    service = module.get<ContentJobsService>(ContentJobsService);
  });

  // Release module resources after all tests complete.
  afterAll(async () => {
    await module.close();
  });

  beforeEach(() => {
    // Clear mock call counts and per-test return values between tests.
    // Mock return values that vary per test are set inside individual `it` blocks.
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // createJob()
  // -------------------------------------------------------------------------

  describe('createJob()', () => {
    const dto: CreateContentJobDto = {
      sourceType: ContentSourceType.YOUTUBE,
      sourceUrl: 'https://youtube.com/watch?v=abc',
    };

    it('creates job with QUEUED status', async () => {
      const job = makeJob();
      prismaContentConfigFindUnique.mockResolvedValue(makeConfig());
      prismaVoiceProfileFindUnique.mockResolvedValue(makeVoiceProfile());
      prismaContentJobCreate.mockResolvedValue(job);

      const result = await service.createJob(dto, 'user-001');

      expect(prismaContentJobCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ContentJobStatus.QUEUED,
            userId: 'user-001',
            sourceType: ContentSourceType.YOUTUBE,
          }),
        }),
      );
      expect(result.status).toBe(ContentJobStatus.QUEUED);
      expect(result.id).toBe('job-001');
    });

    it('saves config snapshot at creation time from user ContentConfiguration', async () => {
      const config = makeConfig({ platformConfig: { linkedin: { enabled: true, maxLength: 1200 } } });
      prismaContentConfigFindUnique.mockResolvedValue(config);
      prismaVoiceProfileFindUnique.mockResolvedValue(null);
      prismaContentJobCreate.mockResolvedValue(
        makeJob({ configSnapshot: { platforms: config.platformConfig } }),
      );

      await service.createJob(dto, 'user-001');

      // configSnapshot must be wrapped under { platforms: ... } so the content
      // worker can read config_snapshot["platforms"] without treating every top-level
      // key as a platform name.
      expect(prismaContentJobCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            configSnapshot: { platforms: { linkedin: { enabled: true, maxLength: 1200 } } },
          }),
        }),
      );
    });

    it('uses empty config snapshot when no ContentConfiguration exists', async () => {
      prismaContentConfigFindUnique.mockResolvedValue(null);
      prismaVoiceProfileFindUnique.mockResolvedValue(null);
      prismaContentJobCreate.mockResolvedValue(makeJob());

      await service.createJob(dto, 'user-001');

      // Even the empty-config case must use the wrapper so the worker always
      // receives a consistent { platforms: {} } shape rather than {}.
      expect(prismaContentJobCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ configSnapshot: { platforms: {} } }),
        }),
      );
    });

    it('includes voice profile text when profile is set', async () => {
      prismaContentConfigFindUnique.mockResolvedValue(null);
      prismaVoiceProfileFindUnique.mockResolvedValue(
        makeVoiceProfile({ profileText: 'My writing voice.' }),
      );
      prismaContentJobCreate.mockResolvedValue(makeJob({ voiceBriefText: 'My writing voice.' }));

      await service.createJob(dto, 'user-001');

      expect(prismaContentJobCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ voiceBriefText: 'My writing voice.' }),
        }),
      );
    });

    it('includes empty string voice profile when profile is not set', async () => {
      prismaContentConfigFindUnique.mockResolvedValue(null);
      prismaVoiceProfileFindUnique.mockResolvedValue(null); // No profile
      prismaContentJobCreate.mockResolvedValue(makeJob());

      await service.createJob(dto, 'user-001');

      // voiceBriefText should be empty string when no profile exists
      expect(prismaContentJobCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ voiceBriefText: '' }),
        }),
      );
    });

    it('publishes to kms.content queue after creating the job', async () => {
      prismaContentConfigFindUnique.mockResolvedValue(null);
      prismaVoiceProfileFindUnique.mockResolvedValue(null);
      prismaContentJobCreate.mockResolvedValue(makeJob());

      await service.createJob(dto, 'user-001');

      expect(mockPublishContentJob).toHaveBeenCalledWith(
        expect.objectContaining({
          job_id: 'job-001',
          user_id: 'user-001',
          step: 'full',
        }),
      );
    });

    it('throws KBCNT0012 when RabbitMQ publish fails and marks job FAILED', async () => {
      prismaContentConfigFindUnique.mockResolvedValue(null);
      prismaVoiceProfileFindUnique.mockResolvedValue(null);
      prismaContentJobCreate.mockResolvedValue(makeJob());
      // Publisher fails
      mockPublishContentJob.mockRejectedValueOnce(new Error('RabbitMQ down'));
      prismaContentJobUpdate.mockResolvedValue(makeJob({ status: ContentJobStatus.FAILED }));

      await expect(service.createJob(dto, 'user-001')).rejects.toBeInstanceOf(AppError);

      // Verify the error code
      try {
        await service.createJob(dto, 'user-001');
      } catch (err) {
        expect((err as AppError).code).toBe(ERROR_CODES.CNT.QUEUE_PUBLISH_FAILED.code);
      }

      // Job should have been marked FAILED
      expect(prismaContentJobUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ContentJobStatus.FAILED }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // getJob()
  // -------------------------------------------------------------------------

  describe('getJob()', () => {
    it('returns job with pieces for the owner', async () => {
      const job = makeJob({ pieces: [{ id: 'piece-001', platform: 'linkedin' }] });
      prismaContentJobFindUnique.mockResolvedValue(job);

      const result = await service.getJob('job-001', 'user-001');

      expect(result.id).toBe('job-001');
      expect(result.pieces).toHaveLength(1);
    });

    it('throws KBCNT0001 when job not found', async () => {
      prismaContentJobFindUnique.mockResolvedValue(null);

      await expect(service.getJob('missing-job', 'user-001')).rejects.toBeInstanceOf(AppError);

      try {
        await service.getJob('missing-job', 'user-001');
      } catch (err) {
        expect((err as AppError).code).toBe(ERROR_CODES.CNT.JOB_NOT_FOUND.code);
      }
    });

    it('throws ForbiddenException (403) when userId does not match job owner', async () => {
      // Job belongs to user-999, not user-001
      prismaContentJobFindUnique.mockResolvedValue(makeJob({ userId: 'user-999' }));

      await expect(service.getJob('job-001', 'user-001')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // -------------------------------------------------------------------------
  // listJobs()
  // -------------------------------------------------------------------------

  describe('listJobs()', () => {
    it('returns only jobs for the requesting user', async () => {
      const jobs = [makeJob({ userId: 'user-001' }), makeJob({ id: 'job-002', userId: 'user-001' })];
      prismaContentJobFindMany.mockResolvedValue(jobs);
      prismaContentJobCount.mockResolvedValue(2);

      const query = new ListContentJobsQueryDto();
      query.limit = 20;
      const result = await service.listJobs(query, 'user-001');

      // Confirm userId was passed in the WHERE clause
      expect(prismaContentJobFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-001' }),
        }),
      );
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('filters by status when provided', async () => {
      prismaContentJobFindMany.mockResolvedValue([]);
      prismaContentJobCount.mockResolvedValue(0);

      const query = new ListContentJobsQueryDto();
      query.status = ContentJobStatus.DONE;
      query.limit = 20;

      await service.listJobs(query, 'user-001');

      expect(prismaContentJobFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-001',
            status: ContentJobStatus.DONE,
          }),
        }),
      );
    });

    it('filters by sourceType when provided', async () => {
      prismaContentJobFindMany.mockResolvedValue([]);
      prismaContentJobCount.mockResolvedValue(0);

      const query = new ListContentJobsQueryDto();
      query.sourceType = ContentSourceType.URL;
      query.limit = 20;

      await service.listJobs(query, 'user-001');

      expect(prismaContentJobFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-001',
            sourceType: ContentSourceType.URL,
          }),
        }),
      );
    });

    it('applies cursor pagination — decodes base64 cursor as createdAt lt filter', async () => {
      prismaContentJobFindMany.mockResolvedValue([]);
      prismaContentJobCount.mockResolvedValue(0);

      const cursorDate = new Date('2026-01-01T12:00:00.000Z');
      const cursor = Buffer.from(cursorDate.toISOString()).toString('base64');

      const query = new ListContentJobsQueryDto();
      query.cursor = cursor;
      query.limit = 20;

      await service.listJobs(query, 'user-001');

      expect(prismaContentJobFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { lt: expect.any(Date) },
          }),
        }),
      );
    });

    it('returns nextCursor when more items exist beyond the page', async () => {
      // Return limit+1 items to signal there is a next page
      const limit = 2;
      const jobs = [
        makeJob({ id: 'job-001', createdAt: new Date('2026-01-03T00:00:00.000Z') }),
        makeJob({ id: 'job-002', createdAt: new Date('2026-01-02T00:00:00.000Z') }),
        makeJob({ id: 'job-003', createdAt: new Date('2026-01-01T00:00:00.000Z') }),
      ];
      prismaContentJobFindMany.mockResolvedValue(jobs);
      prismaContentJobCount.mockResolvedValue(10);

      const query = new ListContentJobsQueryDto();
      query.limit = limit;

      const result = await service.listJobs(query, 'user-001');

      expect(result.nextCursor).not.toBeNull();
      expect(result.items).toHaveLength(limit);
    });

    it('never returns jobs owned by other users (always filters WHERE userId=userId)', async () => {
      prismaContentJobFindMany.mockResolvedValue([makeJob({ userId: 'user-001' })]);
      prismaContentJobCount.mockResolvedValue(1);

      const query = new ListContentJobsQueryDto();
      query.limit = 20;

      await service.listJobs(query, 'user-001');

      // Both findMany and count must include userId filter
      const findManyCall = prismaContentJobFindMany.mock.calls[0][0];
      const countCall = prismaContentJobCount.mock.calls[0][0];

      expect(findManyCall.where.userId).toBe('user-001');
      expect(countCall.where.userId).toBe('user-001');
    });
  });

  // -------------------------------------------------------------------------
  // deleteJob()
  // -------------------------------------------------------------------------

  describe('deleteJob()', () => {
    it('deletes job for the owner', async () => {
      prismaContentJobFindUnique.mockResolvedValue(makeJob());
      prismaContentJobDelete.mockResolvedValue(makeJob());

      await service.deleteJob('job-001', 'user-001');

      expect(prismaContentJobDelete).toHaveBeenCalledWith({ where: { id: 'job-001' } });
    });

    it('throws KBCNT0001 when job not found', async () => {
      prismaContentJobFindUnique.mockResolvedValue(null);

      await expect(service.deleteJob('missing', 'user-001')).rejects.toBeInstanceOf(AppError);

      try {
        await service.deleteJob('missing', 'user-001');
      } catch (err) {
        expect((err as AppError).code).toBe(ERROR_CODES.CNT.JOB_NOT_FOUND.code);
      }
    });

    it('throws ForbiddenException when user does not own the job', async () => {
      prismaContentJobFindUnique.mockResolvedValue(makeJob({ userId: 'user-999' }));

      await expect(service.deleteJob('job-001', 'user-001')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prismaContentJobDelete).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // detectStaleJobs()
  // -------------------------------------------------------------------------

  describe('detectStaleJobs()', () => {
    it('marks QUEUED job stale after 15 minutes', async () => {
      const staleJob = makeJob({
        status: ContentJobStatus.QUEUED,
        updatedAt: new Date(Date.now() - 20 * 60 * 1000), // 20 min ago
      });
      prismaContentJobFindMany.mockResolvedValue([staleJob]);
      prismaContentJobUpdateMany.mockResolvedValue({ count: 1 });

      const count = await service.detectStaleJobs();

      expect(count).toBe(1);
      expect(prismaContentJobUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ContentJobStatus.FAILED }),
        }),
      );
    });

    it('marks INGESTING, EXTRACTING, and GENERATING jobs as stale', async () => {
      const staleJobs = [
        makeJob({ id: 'j1', status: ContentJobStatus.INGESTING }),
        makeJob({ id: 'j2', status: ContentJobStatus.EXTRACTING }),
        makeJob({ id: 'j3', status: ContentJobStatus.GENERATING }),
      ];
      prismaContentJobFindMany.mockResolvedValue(staleJobs);
      prismaContentJobUpdateMany.mockResolvedValue({ count: 3 });

      const count = await service.detectStaleJobs();

      expect(count).toBe(3);
    });

    it('does NOT mark DONE, FAILED, or CANCELLED jobs as stale', async () => {
      // When query returns empty (the WHERE clause filters out terminal states)
      prismaContentJobFindMany.mockResolvedValue([]);
      prismaContentJobUpdateMany.mockResolvedValue({ count: 0 });

      const count = await service.detectStaleJobs();

      expect(count).toBe(0);
      expect(prismaContentJobUpdateMany).not.toHaveBeenCalled();
    });

    it('queries with status IN the active statuses list', async () => {
      prismaContentJobFindMany.mockResolvedValue([]);

      await service.detectStaleJobs();

      expect(prismaContentJobFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: {
              in: expect.arrayContaining([
                ContentJobStatus.QUEUED,
                ContentJobStatus.INGESTING,
                ContentJobStatus.EXTRACTING,
                ContentJobStatus.GENERATING,
              ]),
            },
          }),
        }),
      );
    });

    it('queries with updatedAt less than the 15-minute cutoff', async () => {
      prismaContentJobFindMany.mockResolvedValue([]);

      await service.detectStaleJobs();

      const whereArg = prismaContentJobFindMany.mock.calls[0][0].where;
      expect(whereArg.updatedAt).toHaveProperty('lt');
      const cutoff: Date = whereArg.updatedAt.lt;
      // The cutoff should be approximately 15 minutes ago
      const expectedCutoff = Date.now() - 15 * 60 * 1000;
      expect(Math.abs(cutoff.getTime() - expectedCutoff)).toBeLessThan(5000); // within 5s
    });

    it('logs at warn level with job_id for each stale job found', async () => {
      const staleJob = makeJob({ id: 'stale-001', status: ContentJobStatus.QUEUED });
      prismaContentJobFindMany.mockResolvedValue([staleJob]);
      prismaContentJobUpdateMany.mockResolvedValue({ count: 1 });

      await service.detectStaleJobs();

      // PinoLogger logs as warn(context, message) — context object first, message string second
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ job_id: 'stale-001' }),
        expect.any(String),
      );
    });

    it('returns 0 when no stale jobs found', async () => {
      prismaContentJobFindMany.mockResolvedValue([]);

      const count = await service.detectStaleJobs();

      expect(count).toBe(0);
      expect(prismaContentJobUpdateMany).not.toHaveBeenCalled();
    });
  });
});
