import { Test, TestingModule } from '@nestjs/testing';
import { TagsService } from './tags.service';
import { TagsRepository } from './tags.repository';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';

const mockTagsRepo = {
  findByUserId: jest.fn(),
  countByUserId: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  findByIdAndUserId: jest.fn(),
  deleteById: jest.fn(),
  addTagToFile: jest.fn(),
  removeTagFromFile: jest.fn(),
  bulkAddTagToFiles: jest.fn(),
};

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const userId = 'user-uuid-001';

describe('TagsService', () => {
  let service: TagsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagsService,
        { provide: TagsRepository, useValue: mockTagsRepo },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(TagsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('listTags', () => {
    it('returns tags with fileCount flattened', async () => {
      mockTagsRepo.findByUserId.mockResolvedValue([
        { id: 'tag-1', name: 'Work', userId, _count: { fileTags: 3 } },
        { id: 'tag-2', name: 'Personal', userId, _count: { fileTags: 0 } },
      ]);

      const result = await service.listTags(userId);
      expect(result).toHaveLength(2);
      expect(result[0].fileCount).toBe(3);
      expect(result[1].fileCount).toBe(0);
    });

    it('returns empty array when user has no tags', async () => {
      mockTagsRepo.findByUserId.mockResolvedValue([]);
      const result = await service.listTags(userId);
      expect(result).toEqual([]);
    });
  });

  describe('createTag', () => {
    it('creates a tag when under the 50-tag limit', async () => {
      mockTagsRepo.countByUserId.mockResolvedValue(10);
      const newTag = { id: 'tag-new', name: 'Inbox', userId };
      mockTagsRepo.create.mockResolvedValue(newTag);

      const result = await service.createTag(userId, 'Inbox');
      expect(result.name).toBe('Inbox');
      expect(mockTagsRepo.create).toHaveBeenCalledWith(userId, 'Inbox', '#6366f1');
    });

    it('throws AppError TAG0003 when user has 50 tags', async () => {
      mockTagsRepo.countByUserId.mockResolvedValue(50);
      await expect(service.createTag(userId, 'Over50')).rejects.toThrow(AppError);
    });

    it('propagates unique constraint violation as AppError TAG0002', async () => {
      mockTagsRepo.countByUserId.mockResolvedValue(5);
      const prismaError = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      mockTagsRepo.create.mockRejectedValue(prismaError);
      await expect(service.createTag(userId, 'Dup')).rejects.toThrow(AppError);
    });
  });

  describe('createTag', () => {
    it('re-throws non-P2002 errors from the repository', async () => {
      mockTagsRepo.countByUserId.mockResolvedValue(5);
      mockTagsRepo.create.mockRejectedValue(new Error('DB connection lost'));
      await expect(service.createTag(userId, 'Test')).rejects.toThrow('DB connection lost');
    });
  });

  describe('deleteTag', () => {
    it('deletes tag (no-op, always succeeds)', async () => {
      mockTagsRepo.deleteById.mockResolvedValue(undefined);

      await expect(service.deleteTag('tag-1', userId)).resolves.toBeUndefined();
      expect(mockTagsRepo.deleteById).toHaveBeenCalledWith('tag-1', userId);
    });
  });

  describe('addTagToFile', () => {
    it('applies a tag to a file when ownership check passes', async () => {
      mockTagsRepo.findByIdAndUserId.mockResolvedValue({ id: 'tag-1', name: 'Work', userId });
      mockTagsRepo.addTagToFile.mockResolvedValue(undefined);

      await expect(service.addTagToFile('file-1', 'tag-1', userId)).resolves.toBeUndefined();
      expect(mockTagsRepo.addTagToFile).toHaveBeenCalledWith('file-1', 'tag-1');
    });

    it('throws AppError TAG0001 when tag does not belong to the user', async () => {
      mockTagsRepo.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.addTagToFile('file-1', 'tag-other', userId)).rejects.toThrow(AppError);
      expect(mockTagsRepo.addTagToFile).not.toHaveBeenCalled();
    });
  });

  describe('removeTagFromFile', () => {
    it('removes a tag from a file when ownership check passes', async () => {
      mockTagsRepo.findByIdAndUserId.mockResolvedValue({ id: 'tag-1', name: 'Work', userId });
      mockTagsRepo.removeTagFromFile.mockResolvedValue(undefined);

      await expect(service.removeTagFromFile('file-1', 'tag-1', userId)).resolves.toBeUndefined();
      expect(mockTagsRepo.removeTagFromFile).toHaveBeenCalledWith('file-1', 'tag-1');
    });

    it('throws AppError TAG0001 when tag is not owned by the user', async () => {
      mockTagsRepo.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.removeTagFromFile('file-1', 'tag-other', userId)).rejects.toThrow(AppError);
      expect(mockTagsRepo.removeTagFromFile).not.toHaveBeenCalled();
    });
  });

  describe('bulkTagFiles', () => {
    it('bulk-tags files and returns the count of new associations', async () => {
      mockTagsRepo.findByIdAndUserId.mockResolvedValue({ id: 'tag-1', name: 'Work', userId });
      mockTagsRepo.bulkAddTagToFiles.mockResolvedValue(3);

      const result = await service.bulkTagFiles(['f1', 'f2', 'f3'], 'tag-1', userId);

      expect(mockTagsRepo.bulkAddTagToFiles).toHaveBeenCalledWith(['f1', 'f2', 'f3'], 'tag-1');
      expect(result).toEqual({ tagged: 3 });
    });

    it('throws AppError TAG0001 when tag is not owned by the user', async () => {
      mockTagsRepo.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.bulkTagFiles(['f1'], 'tag-other', userId)).rejects.toThrow(AppError);
      expect(mockTagsRepo.bulkAddTagToFiles).not.toHaveBeenCalled();
    });
  });
});
