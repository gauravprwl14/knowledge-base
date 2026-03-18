import { Test, TestingModule } from '@nestjs/testing';
import { FilesService } from './files.service';
import { FileRepository, ListFilesParams, FilesPage } from '../../database/repositories/file.repository';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { KmsFile } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(overrides: Partial<KmsFile> = {}): KmsFile {
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
  let fileRepo: jest.Mocked<FileRepository>;

  const mockFileRepo: jest.Mocked<Partial<FileRepository>> = {
    listFiles: jest.fn(),
    findByIdAndUserId: jest.fn(),
    deleteById: jest.fn(),
    bulkDelete: jest.fn(),
    bulkMoveToCollection: jest.fn(),
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
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
    fileRepo = module.get(FileRepository);
  });

  // -------------------------------------------------------------------------
  // listFiles()
  // -------------------------------------------------------------------------

  describe('listFiles()', () => {
    it('delegates to repository and returns paginated results', async () => {
      const file1 = makeFile({ id: 'file-001', name: 'alpha.pdf' });
      const file2 = makeFile({ id: 'file-002', name: 'beta.pdf' });
      const page = makeFilesPage([file1, file2]);
      mockFileRepo.listFiles!.mockResolvedValue(page);

      const params: ListFilesParams = { userId: 'user-001', limit: 20 };
      const result = await service.listFiles(params);

      expect(result).toEqual(page);
      expect(result.items).toHaveLength(2);
      expect(mockFileRepo.listFiles).toHaveBeenCalledWith(params);
    });

    it('returns empty page when user has no files', async () => {
      const emptyPage = makeFilesPage([]);
      mockFileRepo.listFiles!.mockResolvedValue(emptyPage);

      const result = await service.listFiles({ userId: 'user-001' });

      expect(result.items).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });

    it('passes all filter params to the repository', async () => {
      const page = makeFilesPage();
      mockFileRepo.listFiles!.mockResolvedValue(page);

      const params: ListFilesParams = {
        userId: 'user-001',
        sourceId: 'src-001',
        status: 'READY',
        limit: 10,
        cursor: 'cursor-abc',
      };
      await service.listFiles(params);

      expect(mockFileRepo.listFiles).toHaveBeenCalledWith(params);
    });
  });

  // -------------------------------------------------------------------------
  // findOne()
  // -------------------------------------------------------------------------

  describe('findOne()', () => {
    it('returns the file when found and owned by user', async () => {
      const file = makeFile();
      mockFileRepo.findByIdAndUserId!.mockResolvedValue(file);

      const result = await service.findOne('file-001', 'user-001');

      expect(result).toEqual(file);
      expect(mockFileRepo.findByIdAndUserId).toHaveBeenCalledWith('file-001', 'user-001');
    });

    it('throws AppError FIL0001 when file is not found', async () => {
      mockFileRepo.findByIdAndUserId!.mockResolvedValue(null);

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
      mockFileRepo.findByIdAndUserId!.mockResolvedValue(null);

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
      mockFileRepo.findByIdAndUserId!.mockResolvedValue(file);
      mockFileRepo.deleteById!.mockResolvedValue(undefined);

      const result = await service.deleteFile('file-001', 'user-001');

      expect(result).toEqual({ deleted: true });
      expect(mockFileRepo.findByIdAndUserId).toHaveBeenCalledWith('file-001', 'user-001');
      expect(mockFileRepo.deleteById).toHaveBeenCalledWith('file-001');
    });

    it('throws AppError FIL0001 when file is not found', async () => {
      mockFileRepo.findByIdAndUserId!.mockResolvedValue(null);

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
      mockFileRepo.findByIdAndUserId!.mockResolvedValue(null);

      await expect(service.deleteFile('file-001', 'other-user')).rejects.toThrow(AppError);
      expect(mockFileRepo.deleteById).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // bulkDeleteFiles()
  // -------------------------------------------------------------------------

  describe('bulkDeleteFiles()', () => {
    it('returns deleted count from repository', async () => {
      mockFileRepo.bulkDelete!.mockResolvedValue(3);

      const result = await service.bulkDeleteFiles(['f1', 'f2', 'f3'], 'user-001');

      expect(result).toEqual({ deleted: 3 });
      expect(mockFileRepo.bulkDelete).toHaveBeenCalledWith(['f1', 'f2', 'f3'], 'user-001');
    });

    it('returns deleted: 0 when no owned files match the given IDs', async () => {
      mockFileRepo.bulkDelete!.mockResolvedValue(0);

      const result = await service.bulkDeleteFiles(['foreign-1', 'foreign-2'], 'user-001');

      expect(result).toEqual({ deleted: 0 });
    });

    it('passes userId to repository for ownership scoping', async () => {
      mockFileRepo.bulkDelete!.mockResolvedValue(1);

      await service.bulkDeleteFiles(['file-001'], 'user-001');

      expect(mockFileRepo.bulkDelete).toHaveBeenCalledWith(
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
      mockFileRepo.bulkMoveToCollection!.mockResolvedValue(2);

      const result = await service.bulkMoveFiles(['f1', 'f2'], 'col-001', 'user-001');

      expect(result).toEqual({ moved: 2 });
      expect(mockFileRepo.bulkMoveToCollection).toHaveBeenCalledWith(
        ['f1', 'f2'],
        'col-001',
        'user-001',
      );
    });

    it('returns moved: 0 when no owned files match', async () => {
      mockFileRepo.bulkMoveToCollection!.mockResolvedValue(0);

      const result = await service.bulkMoveFiles(['foreign-1'], 'col-001', 'user-001');

      expect(result).toEqual({ moved: 0 });
    });

    it('passes collectionId and userId to repository', async () => {
      mockFileRepo.bulkMoveToCollection!.mockResolvedValue(1);

      await service.bulkMoveFiles(['file-001'], 'col-target', 'user-001');

      expect(mockFileRepo.bulkMoveToCollection).toHaveBeenCalledWith(
        ['file-001'],
        'col-target',
        'user-001',
      );
    });
  });
});
