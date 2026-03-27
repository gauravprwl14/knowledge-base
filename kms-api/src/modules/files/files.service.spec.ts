import { Test, TestingModule } from '@nestjs/testing';
import { FilesService, deriveEmbeddingStatus } from './files.service';
import { FileRepository, ListFilesParams, FilesPage } from '../../database/repositories/file.repository';
import { ScanJobRepository } from '../../database/repositories/scan-job.repository';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { FileStatus, KmsFile } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { EmbedJobPublisher } from '../../queue/publishers/embed-job.publisher';
import { ScanJobPublisher } from '../../queue/publishers/scan-job.publisher';
import { MinioService } from './minio.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(overrides: Partial<any> = {}): KmsFile {
  return {
    id: 'file-001',
    userId: 'user-001',
    sourceId: 'src-001',
    externalId: 'ext-001',
    name: 'document.pdf',
    mimeType: 'application/pdf',
    status: 'READY',
    sizeBytes: null,
    checksumSha256: null,
    embeddingStatus: null,
    webUrl: null,
    downloadUrl: null,
    parentFolderId: null,
    metadata: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  } as unknown as KmsFile;
}

function makeFilesPage(items: KmsFile[] = [], overrides: Partial<FilesPage> = {}): FilesPage {
  return {
    items,
    nextCursor: null,
    total: items.length,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

describe('FilesService', () => {
  let service: FilesService;

  const repoListFiles = jest.fn();
  const repoFindByIdAndUserId = jest.fn();
  const repoDeleteById = jest.fn();
  const repoBulkDelete = jest.fn();
  const repoBulkMoveToCollection = jest.fn();

  const mockFileRepo = {
    listFiles: repoListFiles,
    findByIdAndUserId: repoFindByIdAndUserId,
    deleteById: repoDeleteById,
    bulkDelete: repoBulkDelete,
    bulkMoveToCollection: repoBulkMoveToCollection,
  };

  // PrismaService mocks
  const prismaKmsSourceFindFirst = jest.fn();
  const prismaKmsSourceCreate = jest.fn();
  const prismaKmsFileCreate = jest.fn();
  const prismaKmsFileUpdate = jest.fn().mockResolvedValue({});
  const prismaKmsFileFindMany = jest.fn();
  const prismaKmsFileUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
  const prismaExecuteRaw = jest.fn().mockResolvedValue(0);
  const mockPrisma = {
    kmsSource: { findFirst: prismaKmsSourceFindFirst, create: prismaKmsSourceCreate },
    kmsFile: {
      create: prismaKmsFileCreate,
      update: prismaKmsFileUpdate,
      findMany: prismaKmsFileFindMany,
      updateMany: prismaKmsFileUpdateMany,
    },
    $executeRaw: prismaExecuteRaw,
  };

  // EmbedJobPublisher mock
  const mockPublishEmbedJob = jest.fn().mockResolvedValue(undefined);

  // ScanJobRepository mocks
  const scanJobFindActive = jest.fn();
  const scanJobCreate = jest.fn();
  const scanJobFindBySourceId = jest.fn();
  const mockScanJobRepo = {
    findActiveBySourceId: scanJobFindActive,
    createJob: scanJobCreate,
    findBySourceId: scanJobFindBySourceId,
  };

  // ScanJobPublisher mock
  const mockPublishScanJob = jest.fn().mockResolvedValue(undefined);

  // MinioService mock
  const mockMinioGetPresignedUrl = jest.fn().mockResolvedValue('https://minio.example.com/presigned');
  const mockMinioGetTranscriptText = jest.fn().mockResolvedValue('transcript text');
  const mockMinioService = {
    getPresignedUrl: mockMinioGetPresignedUrl,
    getTranscriptText: mockMinioGetTranscriptText,
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
        FilesService,
        { provide: FileRepository, useValue: mockFileRepo },
        { provide: AppLogger, useValue: mockLogger },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmbedJobPublisher, useValue: { publishEmbedJob: mockPublishEmbedJob } },
        { provide: ScanJobRepository, useValue: mockScanJobRepo },
        { provide: ScanJobPublisher, useValue: { publishScanJob: mockPublishScanJob } },
        { provide: MinioService, useValue: mockMinioService },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  // -------------------------------------------------------------------------
  // listFiles()
  // -------------------------------------------------------------------------

  describe('listFiles()', () => {
    it('delegates to repository and returns paginated results with embeddingStatus derived', async () => {
      const file1 = makeFile({ id: 'file-001', name: 'alpha.pdf', status: 'PENDING' as any });
      const file2 = makeFile({ id: 'file-002', name: 'beta.pdf', status: 'INDEXED' as any });
      const page = makeFilesPage([file1, file2]);
      repoListFiles.mockResolvedValue(page);

      const params: ListFilesParams = { userId: 'user-001', limit: 20 };
      const result = await service.listFiles(params);

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
      expect(result.total).toBe(2);
      // embeddingStatus derived from status column
      expect(result.items[0]).toMatchObject({ id: 'file-001', embeddingStatus: 'pending' });
      expect(result.items[1]).toMatchObject({ id: 'file-002', embeddingStatus: 'embedded' });
      expect(repoListFiles).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-001', limit: 20 }));
    });

    it('returns empty page when user has no files', async () => {
      const emptyPage = makeFilesPage([]);
      repoListFiles.mockResolvedValue(emptyPage);

      const result = await service.listFiles({ userId: 'user-001' });

      expect(result.items).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });

    it('passes all filter params to the repository', async () => {
      const page = makeFilesPage();
      repoListFiles.mockResolvedValue(page);

      const params: ListFilesParams = {
        userId: 'user-001',
        sourceId: 'src-001',
        limit: 10,
        cursor: 'cursor-abc',
      };
      await service.listFiles(params);

      expect(repoListFiles).toHaveBeenCalledWith(params);
    });

    // -------------------------------------------------------------------------
    // Sort params — sortBy / sortDir forwarding
    // -------------------------------------------------------------------------

    it('forwards sortBy=createdAt with sortDir=desc to the repository', async () => {
      const page = makeFilesPage([makeFile()]);
      repoListFiles.mockResolvedValue(page);

      const params: ListFilesParams = {
        userId: 'user-001',
        sortBy: 'createdAt',
        sortDir: 'desc',
      };
      await service.listFiles(params);

      expect(repoListFiles).toHaveBeenCalledWith(params);
    });

    it('forwards sortBy=name with sortDir=asc to the repository', async () => {
      const file1 = makeFile({ id: 'file-001', name: 'alpha.pdf' });
      const file2 = makeFile({ id: 'file-002', name: 'beta.pdf' });
      const page = makeFilesPage([file1, file2]);
      repoListFiles.mockResolvedValue(page);

      const params: ListFilesParams = {
        userId: 'user-001',
        sortBy: 'name',
        sortDir: 'asc',
      };
      const result = await service.listFiles(params);

      expect(repoListFiles).toHaveBeenCalledWith(params);
      expect(result.items[0].name).toBe('alpha.pdf');
    });

    it('forwards sortBy=sizeBytes with sortDir=desc to the repository', async () => {
      const page = makeFilesPage();
      repoListFiles.mockResolvedValue(page);

      const params: ListFilesParams = {
        userId: 'user-001',
        sortBy: 'sizeBytes',
        sortDir: 'desc',
      };
      await service.listFiles(params);

      expect(repoListFiles).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-001',
        sortBy: 'sizeBytes',
        sortDir: 'desc',
      }));
    });

    it('forwards sortBy=updatedAt with sortDir=asc to the repository', async () => {
      const page = makeFilesPage();
      repoListFiles.mockResolvedValue(page);

      const params: ListFilesParams = {
        userId: 'user-001',
        sortBy: 'updatedAt',
        sortDir: 'asc',
      };
      await service.listFiles(params);

      expect(repoListFiles).toHaveBeenCalledWith(params);
    });

    it('omits sortBy when not provided — repository applies its own default (createdAt)', async () => {
      const page = makeFilesPage([makeFile()]);
      repoListFiles.mockResolvedValue(page);

      const params: ListFilesParams = { userId: 'user-001' };
      await service.listFiles(params);

      const [capturedParams] = repoListFiles.mock.calls[0];
      // sortBy is absent; the repository default (createdAt) applies
      expect(capturedParams.sortBy).toBeUndefined();
    });

    it('omits sortDir when not provided — repository applies its own default (desc)', async () => {
      const page = makeFilesPage([makeFile()]);
      repoListFiles.mockResolvedValue(page);

      const params: ListFilesParams = { userId: 'user-001' };
      await service.listFiles(params);

      const [capturedParams] = repoListFiles.mock.calls[0];
      // sortDir is absent; the repository default (desc) applies
      expect(capturedParams.sortDir).toBeUndefined();
    });

    it('passes sortBy and sortDir alongside other filter params without mutation', async () => {
      const page = makeFilesPage();
      repoListFiles.mockResolvedValue(page);

      const params: ListFilesParams = {
        userId: 'user-001',
        sourceId: 'src-001',
        limit: 10,
        sortBy: 'name',
        sortDir: 'asc',
      };
      await service.listFiles(params);

      expect(repoListFiles).toHaveBeenCalledWith(params);
      const [capturedParams] = repoListFiles.mock.calls[0];
      expect(capturedParams.sortBy).toBe('name');
      expect(capturedParams.sortDir).toBe('asc');
      expect(capturedParams.sourceId).toBe('src-001');
    });
  });

  // -------------------------------------------------------------------------
  // findOne()
  // -------------------------------------------------------------------------

  describe('findOne()', () => {
    it('returns the file when found and owned by user', async () => {
      const file = makeFile();
      repoFindByIdAndUserId.mockResolvedValue(file);

      const result = await service.findOne('file-001', 'user-001');

      expect(result).toEqual(file);
      expect(repoFindByIdAndUserId).toHaveBeenCalledWith('file-001', 'user-001');
    });

    it('throws AppError FIL0001 when file is not found', async () => {
      repoFindByIdAndUserId.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', 'user-001')).rejects.toThrow(AppError);

      try {
        await service.findOne('nonexistent', 'user-001');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).getStatus()).toBe(404);
        expect((err as AppError).code).toBe(ERROR_CODES.FIL.FILE_NOT_FOUND.code);
      }
    });

    it('throws AppError FIL0001 when file belongs to a different user', async () => {
      // Repository scopes by userId; foreign files return null
      repoFindByIdAndUserId.mockResolvedValue(null);

      await expect(service.findOne('file-001', 'other-user')).rejects.toThrow(AppError);

      try {
        await service.findOne('file-001', 'other-user');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(ERROR_CODES.FIL.FILE_NOT_FOUND.code);
      }
    });
  });

  // -------------------------------------------------------------------------
  // deleteFile()
  // -------------------------------------------------------------------------

  describe('deleteFile()', () => {
    it('soft-deletes the file when found and owned by user', async () => {
      const file = makeFile();
      repoFindByIdAndUserId.mockResolvedValue(file);

      const result = await service.deleteFile('file-001', 'user-001');

      expect(result).toEqual({ deleted: true });
      expect(repoFindByIdAndUserId).toHaveBeenCalledWith('file-001', 'user-001');
      // Service uses soft-delete via prisma.kmsFile.update — not repo.deleteById
      expect(prismaKmsFileUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'file-001' } }),
      );
      expect(repoDeleteById).not.toHaveBeenCalled();
    });

    it('deletes associated chunks before soft-deleting the file record', async () => {
      const file = makeFile();
      repoFindByIdAndUserId.mockResolvedValue(file);

      await service.deleteFile('file-001', 'user-001');

      // $executeRaw deletes chunks; kmsFile.update soft-deletes the file
      expect(prismaExecuteRaw).toHaveBeenCalled();
      expect(prismaKmsFileUpdate).toHaveBeenCalled();
    });

    it('throws AppError FIL0001 when file is not found', async () => {
      repoFindByIdAndUserId.mockResolvedValue(null);

      await expect(service.deleteFile('nonexistent', 'user-001')).rejects.toThrow(AppError);

      try {
        await service.deleteFile('nonexistent', 'user-001');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).getStatus()).toBe(404);
        expect((err as AppError).code).toBe(ERROR_CODES.FIL.FILE_NOT_FOUND.code);
      }
    });

    it('does not soft-delete when ownership check fails', async () => {
      repoFindByIdAndUserId.mockResolvedValue(null);

      await expect(service.deleteFile('file-001', 'other-user')).rejects.toThrow(AppError);
      expect(prismaKmsFileUpdate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // bulkDeleteFiles()
  // -------------------------------------------------------------------------

  describe('bulkDeleteFiles()', () => {
    it('returns deleted count from repository', async () => {
      repoBulkDelete.mockResolvedValue(3);

      const result = await service.bulkDeleteFiles(['f1', 'f2', 'f3'], 'user-001');

      expect(result).toEqual({ deleted: 3 });
      expect(repoBulkDelete).toHaveBeenCalledWith(['f1', 'f2', 'f3'], 'user-001');
    });

    it('returns deleted: 0 when no owned files match the given IDs', async () => {
      repoBulkDelete.mockResolvedValue(0);

      const result = await service.bulkDeleteFiles(['foreign-1', 'foreign-2'], 'user-001');

      expect(result).toEqual({ deleted: 0 });
    });

    it('passes userId to repository for ownership scoping', async () => {
      repoBulkDelete.mockResolvedValue(1);

      await service.bulkDeleteFiles(['file-001'], 'user-001');

      expect(repoBulkDelete).toHaveBeenCalledWith(
        expect.any(Array),
        'user-001',
      );
    });
  });

  // -------------------------------------------------------------------------
  // bulkMoveFiles()
  // -------------------------------------------------------------------------

  describe('bulkMoveFiles()', () => {
    it('returns moved count from repository', async () => {
      repoBulkMoveToCollection.mockResolvedValue(2);

      const result = await service.bulkMoveFiles(['f1', 'f2'], 'col-001', 'user-001');

      expect(result).toEqual({ moved: 2 });
      expect(repoBulkMoveToCollection).toHaveBeenCalledWith(
        ['f1', 'f2'],
        'col-001',
        'user-001',
      );
    });

    it('returns moved: 0 when no owned files match', async () => {
      repoBulkMoveToCollection.mockResolvedValue(0);

      const result = await service.bulkMoveFiles(['foreign-1'], 'col-001', 'user-001');

      expect(result).toEqual({ moved: 0 });
    });

    it('passes collectionId and userId to repository', async () => {
      repoBulkMoveToCollection.mockResolvedValue(1);

      await service.bulkMoveFiles(['file-001'], 'col-target', 'user-001');

      expect(repoBulkMoveToCollection).toHaveBeenCalledWith(
        ['file-001'],
        'col-target',
        'user-001',
      );
    });
  });

  // -------------------------------------------------------------------------
  // triggerScan()
  // -------------------------------------------------------------------------

  describe('triggerScan()', () => {
    const mockSource = {
      id: 'src-001',
      userId: 'user-001',
      type: 'GOOGLE_DRIVE',
      configJson: { driveId: 'drive-123' },
    };

    const mockJob = {
      id: 'job-001',
      sourceId: 'src-001',
      userId: 'user-001',
      status: 'QUEUED',
      type: 'FULL',
    };

    it('creates a job and publishes to scan queue', async () => {
      prismaKmsSourceFindFirst.mockResolvedValue(mockSource);
      scanJobFindActive.mockResolvedValue(null);
      scanJobCreate.mockResolvedValue(mockJob);

      const result = await service.triggerScan('src-001', 'user-001', 'FULL');

      expect(result).toEqual(mockJob);
      expect(scanJobCreate).toHaveBeenCalledWith('src-001', 'user-001', 'FULL');
      expect(mockPublishScanJob).toHaveBeenCalledWith(
        expect.objectContaining({
          scan_job_id: 'job-001',
          source_id: 'src-001',
          user_id: 'user-001',
          scan_type: 'FULL',
        }),
      );
    });

    it('returns existing active job without creating a duplicate', async () => {
      prismaKmsSourceFindFirst.mockResolvedValue(mockSource);
      scanJobFindActive.mockResolvedValue(mockJob);

      const result = await service.triggerScan('src-001', 'user-001');

      expect(result).toEqual(mockJob);
      expect(scanJobCreate).not.toHaveBeenCalled();
      expect(mockPublishScanJob).not.toHaveBeenCalled();
    });

    it('throws AppError when source is not found or not owned by user', async () => {
      prismaKmsSourceFindFirst.mockResolvedValue(null);

      await expect(service.triggerScan('src-999', 'user-001')).rejects.toThrow(AppError);
    });
  });

  // -------------------------------------------------------------------------
  // getScanHistory()
  // -------------------------------------------------------------------------

  describe('getScanHistory()', () => {
    const mockSource = {
      id: 'src-001',
      userId: 'user-001',
      type: 'GOOGLE_DRIVE',
      configJson: {},
    };

    it('returns scan jobs for a source', async () => {
      const jobs = [{ id: 'job-001' }, { id: 'job-002' }];
      prismaKmsSourceFindFirst.mockResolvedValue(mockSource);
      scanJobFindBySourceId.mockResolvedValue(jobs);

      const result = await service.getScanHistory('src-001', 'user-001');

      expect(result).toEqual(jobs);
      expect(scanJobFindBySourceId).toHaveBeenCalledWith('src-001', 'user-001');
    });

    it('throws AppError when source is not found', async () => {
      prismaKmsSourceFindFirst.mockResolvedValue(null);

      await expect(service.getScanHistory('src-999', 'user-001')).rejects.toThrow(AppError);
    });
  });

  // -------------------------------------------------------------------------
  // bulkReEmbed()
  // -------------------------------------------------------------------------

  describe('bulkReEmbed()', () => {
    const ownedFile = {
      id: 'file-001',
      userId: 'user-001',
      sourceId: 'src-001',
      name: 'doc.pdf',
      path: '/docs/doc.pdf',
      mimeType: 'application/pdf',
      sizeBytes: BigInt(1024),
    };

    it('happy path: resets status to PENDING, publishes N messages, returns { queued: N }', async () => {
      prismaKmsFileFindMany.mockResolvedValue([ownedFile]);
      prismaKmsFileUpdateMany.mockResolvedValue({ count: 1 });
      mockPublishEmbedJob.mockResolvedValue(undefined);

      const result = await service.bulkReEmbed(['file-001'], 'user-001');

      expect(result).toEqual({ queued: 1 });
      expect(prismaKmsFileUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ['file-001'] }, userId: 'user-001' },
        data: expect.objectContaining({ status: FileStatus.PENDING }),
      });
      expect(mockPublishEmbedJob).toHaveBeenCalledTimes(1);
      expect(mockPublishEmbedJob).toHaveBeenCalledWith(
        expect.objectContaining({
          scan_job_id: 'file-001',
          user_id: 'user-001',
          source_id: 'src-001',
        }),
      );
    });

    it('filters out files not owned by the requesting user', async () => {
      // Repository returns only owned files
      prismaKmsFileFindMany.mockResolvedValue([]);

      const result = await service.bulkReEmbed(['foreign-file-001', 'foreign-file-002'], 'user-001');

      expect(result).toEqual({ queued: 0 });
      expect(mockPublishEmbedJob).not.toHaveBeenCalled();
      expect(prismaKmsFileUpdateMany).not.toHaveBeenCalled();
    });

    it('returns { queued: 0 } for an empty array without throwing', async () => {
      const result = await service.bulkReEmbed([], 'user-001');

      expect(result).toEqual({ queued: 0 });
      expect(prismaKmsFileFindMany).not.toHaveBeenCalled();
      expect(mockPublishEmbedJob).not.toHaveBeenCalled();
    });

    it('rejects array > 100 items with AppError FIL0002 (422)', async () => {
      const over100Ids = Array.from({ length: 101 }, (_, i) => `file-${String(i).padStart(3, '0')}`);

      await expect(service.bulkReEmbed(over100Ids, 'user-001')).rejects.toThrow(AppError);

      try {
        await service.bulkReEmbed(over100Ids, 'user-001');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(ERROR_CODES.FIL.BULK_LIMIT_EXCEEDED.code);
        expect((err as AppError).getStatus()).toBe(422);
      }
    });

    it('queues multiple owned files and returns correct queued count', async () => {
      const file2 = { ...ownedFile, id: 'file-002', name: 'other.pdf' };
      const file3 = { ...ownedFile, id: 'file-003', name: 'third.pdf' };
      prismaKmsFileFindMany.mockResolvedValue([ownedFile, file2, file3]);
      prismaKmsFileUpdateMany.mockResolvedValue({ count: 3 });
      mockPublishEmbedJob.mockResolvedValue(undefined);

      const result = await service.bulkReEmbed(['file-001', 'file-002', 'file-003'], 'user-001');

      expect(result).toEqual({ queued: 3 });
      expect(mockPublishEmbedJob).toHaveBeenCalledTimes(3);
    });
  });

  // -------------------------------------------------------------------------
  // ingestNote()
  // -------------------------------------------------------------------------

  describe('ingestNote()', () => {
    const mockObsidianSource = { id: 'obs-src-001', userId: 'user-001', type: 'OBSIDIAN' };

    it('upserts source, creates file, publishes embed job, and returns ids', async () => {
      prismaKmsSourceFindFirst.mockResolvedValue(mockObsidianSource);
      prismaKmsFileCreate.mockResolvedValue({});

      const result = await service.ingestNote(
        { title: 'My Note', content: '# Hello' },
        'user-001',
      );

      expect(result).toHaveProperty('fileId');
      expect(result.sourceId).toBe('obs-src-001');
      expect(mockPublishEmbedJob).toHaveBeenCalledWith(
        expect.objectContaining({
          source_type: 'obsidian',
          inline_content: '# Hello',
        }),
      );
    });

    it('creates an OBSIDIAN source if none exists', async () => {
      prismaKmsSourceFindFirst.mockResolvedValue(null);
      prismaKmsSourceCreate.mockResolvedValue(mockObsidianSource);
      prismaKmsFileCreate.mockResolvedValue({});

      await service.ingestNote({ title: 'New Note', content: 'content' }, 'user-001');

      expect(prismaKmsSourceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'OBSIDIAN', userId: 'user-001' }),
        }),
      );
    });

    it('throws AppError when embed job publishing fails', async () => {
      prismaKmsSourceFindFirst.mockResolvedValue(mockObsidianSource);
      prismaKmsFileCreate.mockResolvedValue({});
      mockPublishEmbedJob.mockRejectedValue(new Error('RabbitMQ unavailable'));

      await expect(
        service.ingestNote({ title: 'Note', content: 'content' }, 'user-001'),
      ).rejects.toThrow(AppError);
    });
  });
});

// ---------------------------------------------------------------------------
// deriveEmbeddingStatus() — mapping tests (FR-01)
// ---------------------------------------------------------------------------

describe('deriveEmbeddingStatus()', () => {
  it('maps PENDING → "pending"', () => {
    expect(deriveEmbeddingStatus(FileStatus.PENDING)).toBe('pending');
  });

  it('maps PROCESSING → "processing"', () => {
    expect(deriveEmbeddingStatus(FileStatus.PROCESSING)).toBe('processing');
  });

  it('maps INDEXED → "embedded"', () => {
    expect(deriveEmbeddingStatus(FileStatus.INDEXED)).toBe('embedded');
  });

  it('maps ERROR → "failed"', () => {
    expect(deriveEmbeddingStatus(FileStatus.ERROR)).toBe('failed');
  });

  it('maps UNSUPPORTED → "unsupported"', () => {
    expect(deriveEmbeddingStatus(FileStatus.UNSUPPORTED)).toBe('unsupported');
  });

  it('maps DELETED → "deleted"', () => {
    expect(deriveEmbeddingStatus(FileStatus.DELETED)).toBe('deleted');
  });
});
