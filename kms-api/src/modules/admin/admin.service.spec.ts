import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { EmbedJobPublisher } from '../../queue/publishers/embed-job.publisher';
import { getLoggerToken } from 'nestjs-pino';
import { FileStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const USER_ID  = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const SRC_ID   = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const JOB_ID   = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';

const mockUser = {
  id: USER_ID,
  email: 'user@example.com',
  firstName: 'Alice',
  lastName: 'Smith',
  role: 'USER',
  status: 'ACTIVE',
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  lastLoginAt: new Date('2025-03-01T00:00:00.000Z'),
};

const mockSource = {
  id: SRC_ID,
  userId: USER_ID,
  type: 'LOCAL',
  name: 'My Vault',
  status: 'IDLE',
  lastScannedAt: new Date('2025-02-01T00:00:00.000Z'),
  fileCount: 42,
};

const mockScanJob = {
  id: JOB_ID,
  userId: USER_ID,
  sourceId: SRC_ID,
  type: 'FULL',
  status: 'COMPLETED',
  startedAt: new Date('2025-02-01T10:00:00.000Z'),
  finishedAt: new Date('2025-02-01T10:05:00.000Z'),
  filesFound: 42,
};

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockPrisma = {
  user: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  kmsSource: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  kmsScanJob: {
    findMany: jest.fn(),
  },
  kmsFile: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockEmbedPublisher = {
  publishEmbedJob: jest.fn().mockResolvedValue(undefined),
};

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEmbedPublisher.publishEmbedJob.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmbedJobPublisher, useValue: mockEmbedPublisher },
        { provide: getLoggerToken(AdminService.name), useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  // ── getUsers ──────────────────────────────────────────────────────────────

  describe('getUsers()', () => {
    it('returns paginated users with correct shape', async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const result = await service.getUsers({ limit: 50 });

      expect(result.total).toBe(1);
      expect(result.nextCursor).toBeNull();
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: USER_ID,
        email: 'user@example.com',
        firstName: 'Alice',
        lastName: 'Smith',
        role: 'USER',
        status: 'ACTIVE',
      });
    });

    it('sets nextCursor when there are more pages', async () => {
      const manyUsers = Array.from({ length: 51 }, (_, i) => ({
        ...mockUser,
        id: `user-${i}`,
      }));
      mockPrisma.user.count.mockResolvedValue(100);
      mockPrisma.user.findMany.mockResolvedValue(manyUsers);

      const result = await service.getUsers({ limit: 50 });

      expect(result.nextCursor).toBe('user-49');
      expect(result.data).toHaveLength(50);
    });

    it('passes cursor to Prisma when provided', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.getUsers({ cursor: 'some-cursor', limit: 50 });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'some-cursor' },
          skip: 1,
        }),
      );
    });

    it('defaults limit to 50', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.getUsers({});

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 51 }),
      );
    });
  });

  // ── getSources ────────────────────────────────────────────────────────────

  describe('getSources()', () => {
    it('returns sources with userEmail joined', async () => {
      mockPrisma.kmsSource.count.mockResolvedValue(1);
      mockPrisma.kmsSource.findMany.mockResolvedValue([mockSource]);
      // user lookup for email join
      mockPrisma.user.findMany.mockResolvedValue([{ id: USER_ID, email: 'user@example.com' }]);

      const result = await service.getSources({ limit: 50 });

      expect(result.total).toBe(1);
      expect(result.data[0]).toMatchObject({
        id: SRC_ID,
        userId: USER_ID,
        userEmail: 'user@example.com',
        type: 'LOCAL',
        name: 'My Vault',
        fileCount: 42,
      });
    });

    it('sets nextCursor when there are more pages', async () => {
      const manySources = Array.from({ length: 51 }, (_, i) => ({
        ...mockSource,
        id: `src-${i}`,
      }));
      mockPrisma.kmsSource.count.mockResolvedValue(100);
      mockPrisma.kmsSource.findMany.mockResolvedValue(manySources);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await service.getSources({ limit: 50 });

      expect(result.nextCursor).toBe('src-49');
    });

    it('sets userEmail to null when user lookup returns nothing', async () => {
      mockPrisma.kmsSource.count.mockResolvedValue(1);
      mockPrisma.kmsSource.findMany.mockResolvedValue([mockSource]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await service.getSources({ limit: 50 });

      expect(result.data[0].userEmail).toBeNull();
    });
  });

  // ── getScanJobs ───────────────────────────────────────────────────────────

  describe('getScanJobs()', () => {
    it('returns most recent jobs (up to 200)', async () => {
      mockPrisma.kmsScanJob.findMany.mockResolvedValue([mockScanJob]);
      mockPrisma.user.findMany.mockResolvedValue([{ id: USER_ID, email: 'user@example.com' }]);
      mockPrisma.kmsSource.findMany.mockResolvedValue([{ id: SRC_ID, name: 'My Vault' }]);

      const result = await service.getScanJobs();

      expect(result.total).toBe(1);
      expect(result.nextCursor).toBeNull();
      expect(result.data[0]).toMatchObject({
        id: JOB_ID,
        userId: USER_ID,
        userEmail: 'user@example.com',
        sourceId: SRC_ID,
        sourceName: 'My Vault',
        type: 'FULL',
        status: 'COMPLETED',
        filesFound: 42,
      });
    });

    it('queries with take: 200 ordered by createdAt desc', async () => {
      mockPrisma.kmsScanJob.findMany.mockResolvedValue([]);

      await service.getScanJobs();

      expect(mockPrisma.kmsScanJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 200,
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('returns empty response when no jobs exist', async () => {
      mockPrisma.kmsScanJob.findMany.mockResolvedValue([]);

      const result = await service.getScanJobs();

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.nextCursor).toBeNull();
    });
  });

  // ── getStats ──────────────────────────────────────────────────────────────

  describe('getStats()', () => {
    it('returns correct counters', async () => {
      mockPrisma.user.count.mockResolvedValue(10);
      mockPrisma.kmsSource.count.mockResolvedValue(5);
      mockPrisma.kmsFile.count
        .mockResolvedValueOnce(100)  // totalFiles
        .mockResolvedValueOnce(7)    // pendingEmbeds
        .mockResolvedValueOnce(3)    // processingEmbeds
        .mockResolvedValueOnce(2);   // failedFiles

      const stats = await service.getStats();

      expect(stats).toEqual({
        totalUsers: 10,
        totalSources: 5,
        totalFiles: 100,
        pendingEmbeds: 7,
        processingEmbeds: 3,
        failedFiles: 2,
      });
    });

    it('queries pendingEmbeds with FileStatus.PENDING', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.kmsSource.count.mockResolvedValue(0);
      mockPrisma.kmsFile.count.mockResolvedValue(0);

      await service.getStats();

      expect(mockPrisma.kmsFile.count).toHaveBeenCalledWith({
        where: { status: FileStatus.PENDING },
      });
      expect(mockPrisma.kmsFile.count).toHaveBeenCalledWith({
        where: { status: FileStatus.PROCESSING },
      });
      expect(mockPrisma.kmsFile.count).toHaveBeenCalledWith({
        where: { status: FileStatus.ERROR },
      });
    });
  });

  // ── reindexAll ────────────────────────────────────────────────────────────

  describe('reindexAll()', () => {
    const makeFile = (id: string) => ({
      id,
      sourceId: SRC_ID,
      userId: USER_ID,
      path: `/vault/${id}.md`,
      name: `${id}.md`,
      mimeType: 'text/markdown',
      sizeBytes: BigInt(1024),
      checksumSha256: 'abc123',
      source: { type: 'LOCAL' },
    });

    it('publishes one embed job per file and returns queued count', async () => {
      mockPrisma.kmsFile.findMany
        .mockResolvedValueOnce([makeFile('file-1'), makeFile('file-2')])
        .mockResolvedValueOnce([]);

      const result = await service.reindexAll();

      expect(result.queued).toBe(2);
      expect(mockEmbedPublisher.publishEmbedJob).toHaveBeenCalledTimes(2);
      expect(mockEmbedPublisher.publishEmbedJob).toHaveBeenCalledWith(
        expect.objectContaining({
          source_id: SRC_ID,
          user_id: USER_ID,
          source_type: 'LOCAL',
        }),
      );
    });

    it('returns queued: 0 when no PENDING/ERROR files exist', async () => {
      mockPrisma.kmsFile.findMany.mockResolvedValueOnce([]);

      const result = await service.reindexAll();

      expect(result.queued).toBe(0);
      expect(mockEmbedPublisher.publishEmbedJob).not.toHaveBeenCalled();
    });

    it('queries files with PENDING and ERROR status', async () => {
      mockPrisma.kmsFile.findMany.mockResolvedValueOnce([]);

      await service.reindexAll();

      expect(mockPrisma.kmsFile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: { in: [FileStatus.PENDING, FileStatus.ERROR] } },
          take: 200,
          orderBy: { id: 'asc' },
        }),
      );
    });

    it('coerces BigInt sizeBytes to Number in the published message', async () => {
      mockPrisma.kmsFile.findMany
        .mockResolvedValueOnce([makeFile('file-bigint')])
        .mockResolvedValueOnce([]);

      await service.reindexAll();

      const call = mockEmbedPublisher.publishEmbedJob.mock.calls[0][0];
      expect(typeof call.file_size_bytes).toBe('number');
      expect(call.file_size_bytes).toBe(1024);
    });
  });
});
