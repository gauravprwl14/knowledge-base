import { Test, TestingModule } from '@nestjs/testing';
import { FilesService } from './files.service';
import { FileRepository, ListFilesParams, FilesPage } from '../../database/repositories/file.repository';
import { ScanJobRepository } from '../../database/repositories/scan-job.repository';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { KmsFile } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { EmbedJobPublisher } from '../../queue/publishers/embed-job.publisher';
import { ScanJobPublisher } from '../../queue/publishers/scan-job.publisher';

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
  const mockPrisma = {
    kmsSource: { findFirst: prismaKmsSourceFindFirst, create: prismaKmsSourceCreate },
    kmsFile: { create: prismaKmsFileCreate },
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
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  // -------------------------------------------------------------------------
  // listFiles()
  // -------------------------------------------------------------------------

  describe('listFiles()', () => {
    it('delegates to repository and returns paginated results', async () => {
      const file1 = makeFile({ id: 'file-001', name: 'alpha.pdf' });
      const file2 = makeFile({ id: 'file-002', name: 'beta.pdf' });
      const page = makeFilesPage([file1, file2]);
      repoListFiles.mockResolvedValue(page);

      const params: ListFilesParams = { userId: 'user-001', limit: 20 };
      const result = await service.listFiles(params);

      expect(result).toEqual(page);
      expect(result.items).toHaveLength(2);
      expect(repoListFiles).toHaveBeenCalledWith(params);
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
    it('deletes the file when found and owned by user', async () => {
      const file = makeFile();
      repoFindByIdAndUserId.mockResolvedValue(file);
      repoDeleteById.mockResolvedValue(undefined);

      const result = await service.deleteFile('file-001', 'user-001');

      expect(result).toEqual({ deleted: true });
      expect(repoFindByIdAndUserId).toHaveBeenCalledWith('file-001', 'user-001');
      expect(repoDeleteById).toHaveBeenCalledWith('file-001');
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

    it('does not call deleteById when ownership check fails', async () => {
      repoFindByIdAndUserId.mockResolvedValue(null);

      await expect(service.deleteFile('file-001', 'other-user')).rejects.toThrow(AppError);
      expect(repoDeleteById).not.toHaveBeenCalled();
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
