import { Test, TestingModule } from '@nestjs/testing';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

const mockCollectionsService = {
  list: jest.fn(),
  findById: jest.fn(),
  get: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  addFiles: jest.fn(),
  removeFile: jest.fn(),
};

const userId = 'user-uuid-001';
const collectionId = 'col-uuid-001';

const mockCollection = {
  id: collectionId,
  userId,
  name: 'Research Papers',
  description: 'Academic research collection',
  fileCount: 12,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

describe('CollectionsController', () => {
  let controller: CollectionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CollectionsController],
      providers: [
        { provide: CollectionsService, useValue: mockCollectionsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(CollectionsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('list', () => {
    it('returns all collections for the user', async () => {
      mockCollectionsService.list.mockResolvedValue([mockCollection]);

      const result = await controller.list(userId);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(collectionId);
      expect(mockCollectionsService.list).toHaveBeenCalledWith(userId);
    });

    it('returns empty array when no collections exist', async () => {
      mockCollectionsService.list.mockResolvedValue([]);
      const result = await controller.list(userId);
      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('calls service.create with correct args and returns new collection', async () => {
      const dto = { name: 'New Collection', description: 'Desc' };
      mockCollectionsService.create.mockResolvedValue({ ...mockCollection, ...dto });

      const result = await controller.create(userId, dto);
      expect(result.name).toBe('New Collection');
      expect(mockCollectionsService.create).toHaveBeenCalledWith(userId, dto);
    });
  });

  describe('get', () => {
    it('returns the collection by id', async () => {
      mockCollectionsService.get.mockResolvedValue(mockCollection);

      const result = await controller.get(collectionId, userId);
      expect(result.id).toBe(collectionId);
      expect(mockCollectionsService.get).toHaveBeenCalledWith(collectionId, userId);
    });
  });

  describe('update', () => {
    it('delegates to service.update and returns updated collection', async () => {
      const dto = { name: 'Updated' };
      mockCollectionsService.update.mockResolvedValue({ ...mockCollection, name: 'Updated' });

      const result = await controller.update(collectionId, userId, dto);
      expect(result.name).toBe('Updated');
    });
  });

  describe('delete', () => {
    it('calls service.delete with correct args', async () => {
      mockCollectionsService.delete.mockResolvedValue(undefined);

      await controller.delete(collectionId, userId);
      expect(mockCollectionsService.delete).toHaveBeenCalledWith(collectionId, userId);
    });
  });

  describe('addFiles', () => {
    it('calls service.addFiles with file ids', async () => {
      const dto = { fileIds: ['f1', 'f2'] };
      mockCollectionsService.addFiles.mockResolvedValue(undefined);

      await controller.addFiles(collectionId, userId, dto);
      expect(mockCollectionsService.addFiles).toHaveBeenCalledWith(collectionId, userId, dto);
    });
  });

  describe('removeFile', () => {
    it('calls service.removeFile with correct args', async () => {
      mockCollectionsService.removeFile.mockResolvedValue(undefined);

      await controller.removeFile(collectionId, 'file-id', userId);
      expect(mockCollectionsService.removeFile).toHaveBeenCalledWith(collectionId, userId, 'file-id');
    });
  });
});
