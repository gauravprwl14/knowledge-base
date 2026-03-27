import { Test, TestingModule } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';
import { CollectionsService } from './collections.service';
import { CollectionsRepository } from './collections.repository';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { AddFilesToCollectionDto } from './dto/add-files-to-collection.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCollection(overrides: Partial<any> = {}): any {
  return {
    id: 'col-001',
    userId: 'user-001',
    name: 'My Collection',
    description: null,
    color: null,
    icon: null,
    isDefault: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

describe('CollectionsService', () => {
  let service: CollectionsService;

  const mockRepository = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    addFiles: jest.fn(),
    removeFile: jest.fn(),
    getFileCount: jest.fn(),
  };

  const mockPrisma = {
    kmsFile: {
      findMany: jest.fn(),
    },
  };

  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollectionsService,
        { provide: CollectionsRepository, useValue: mockRepository },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getLoggerToken(CollectionsService.name), useValue: mockLogger },
      ],
    }).compile();

    service = module.get<CollectionsService>(CollectionsService);
  });

  // -------------------------------------------------------------------------
  // list()
  // -------------------------------------------------------------------------

  describe('list()', () => {
    it('returns all collections for a user with fileCount populated', async () => {
      const col1 = makeCollection({ id: 'col-001', name: 'Alpha' });
      const col2 = makeCollection({ id: 'col-002', name: 'Beta' });
      mockRepository.findAll.mockResolvedValue([col1, col2]);
      mockRepository.getFileCount.mockResolvedValueOnce(3).mockResolvedValueOnce(7);

      const result = await service.list('user-001');

      expect(result).toHaveLength(2);
      expect(result[0].fileCount).toBe(3);
      expect(result[1].fileCount).toBe(7);
      expect(mockRepository.findAll).toHaveBeenCalledWith('user-001');
    });

    it('returns an empty array when the user has no collections', async () => {
      mockRepository.findAll.mockResolvedValue([]);

      const result = await service.list('user-001');

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // get()
  // -------------------------------------------------------------------------

  describe('get()', () => {
    it('returns the collection DTO when found', async () => {
      const col = makeCollection();
      mockRepository.findById.mockResolvedValue(col);
      mockRepository.getFileCount.mockResolvedValue(5);

      const result = await service.get('col-001', 'user-001');

      expect(result.id).toBe('col-001');
      expect(result.fileCount).toBe(5);
    });

    it('throws a 404 AppError when collection is not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(service.get('nonexistent', 'user-001')).rejects.toThrow(AppError);

      try {
        await service.get('nonexistent', 'user-001');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).getStatus()).toBe(404);
        expect((err as AppError).code).toBe(ERROR_CODES.DAT.NOT_FOUND.code);
      }
    });
  });

  // -------------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------------

  describe('create()', () => {
    it('creates and returns a new collection with fileCount 0', async () => {
      const dto: CreateCollectionDto = { name: 'New Collection' };
      const created = makeCollection({ id: 'col-new', name: 'New Collection' });
      mockRepository.create.mockResolvedValue(created);

      const result = await service.create('user-001', dto);

      expect(result.id).toBe('col-new');
      expect(result.fileCount).toBe(0);
      expect(mockRepository.create).toHaveBeenCalledWith('user-001', dto);
    });
  });

  // -------------------------------------------------------------------------
  // delete()
  // -------------------------------------------------------------------------

  describe('delete()', () => {
    it('deletes a normal collection successfully', async () => {
      const col = makeCollection({ isDefault: false });
      mockRepository.findById.mockResolvedValue(col);
      mockRepository.delete.mockResolvedValue(undefined);

      await expect(service.delete('col-001', 'user-001')).resolves.not.toThrow();
      expect(mockRepository.delete).toHaveBeenCalledWith('col-001', 'user-001');
    });

    it('throws a 404 AppError when collection is not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(service.delete('nonexistent', 'user-001')).rejects.toThrow(AppError);
    });

    it('throws a 409 AppError when attempting to delete the default collection', async () => {
      const col = makeCollection({ isDefault: true });
      mockRepository.findById.mockResolvedValue(col);

      await expect(service.delete('col-001', 'user-001')).rejects.toThrow(AppError);

      try {
        await service.delete('col-001', 'user-001');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).getStatus()).toBe(409);
        expect((err as AppError).code).toBe(ERROR_CODES.DAT.CONFLICT.code);
      }
    });
  });

  // -------------------------------------------------------------------------
  // addFiles()
  // -------------------------------------------------------------------------

  describe('addFiles()', () => {
    it('adds files when all IDs are valid and owned by the user', async () => {
      const col = makeCollection();
      const dto: AddFilesToCollectionDto = {
        fileIds: ['file-001', 'file-002'],
      };
      mockRepository.findById.mockResolvedValue(col);
      mockPrisma.kmsFile.findMany.mockResolvedValue([
        { id: 'file-001' },
        { id: 'file-002' },
      ]);
      mockRepository.addFiles.mockResolvedValue(undefined);

      await expect(service.addFiles('col-001', 'user-001', dto)).resolves.not.toThrow();
      expect(mockRepository.addFiles).toHaveBeenCalledWith('col-001', 'user-001', dto.fileIds);
    });

    it('throws a 404 AppError when the collection is not found', async () => {
      mockRepository.findById.mockResolvedValue(null);
      const dto: AddFilesToCollectionDto = { fileIds: ['file-001'] };

      await expect(service.addFiles('nonexistent', 'user-001', dto)).rejects.toThrow(AppError);
    });

    it('throws a 404 AppError when one or more fileIds do not exist for the user', async () => {
      const col = makeCollection();
      const dto: AddFilesToCollectionDto = { fileIds: ['file-001', 'file-bad'] };
      mockRepository.findById.mockResolvedValue(col);
      // Only one file returned — file-bad does not exist for this user
      mockPrisma.kmsFile.findMany.mockResolvedValue([{ id: 'file-001' }]);

      await expect(service.addFiles('col-001', 'user-001', dto)).rejects.toThrow(AppError);

      try {
        await service.addFiles('col-001', 'user-001', dto);
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).getStatus()).toBe(404);
      }
    });

    it('does nothing when fileIds array is empty', async () => {
      const col = makeCollection();
      mockRepository.findById.mockResolvedValue(col);
      const dto: AddFilesToCollectionDto = { fileIds: [] };

      await expect(service.addFiles('col-001', 'user-001', dto)).resolves.not.toThrow();
      expect(mockRepository.addFiles).not.toHaveBeenCalled();
    });
  });
});
