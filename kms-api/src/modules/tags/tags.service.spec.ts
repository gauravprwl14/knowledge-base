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
  update: jest.fn(),
  delete: jest.fn(),
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
      const newTag = { id: 'tag-new', name: 'Inbox', userId, _count: { fileTags: 0 } };
      mockTagsRepo.create.mockResolvedValue(newTag);

      const result = await service.createTag(userId, { name: 'Inbox' });
      expect(result.name).toBe('Inbox');
      expect(mockTagsRepo.create).toHaveBeenCalledWith({ name: 'Inbox', userId });
    });

    it('throws AppError TAG0003 when user has 50 tags', async () => {
      mockTagsRepo.countByUserId.mockResolvedValue(50);
      await expect(service.createTag(userId, { name: 'Over50' })).rejects.toThrow(AppError);
    });

    it('propagates unique constraint violation as AppError TAG0002', async () => {
      mockTagsRepo.countByUserId.mockResolvedValue(5);
      const prismaError = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      mockTagsRepo.create.mockRejectedValue(prismaError);
      await expect(service.createTag(userId, { name: 'Dup' })).rejects.toThrow(AppError);
    });
  });

  describe('updateTag', () => {
    it('updates tag name when owned by user', async () => {
      mockTagsRepo.findById.mockResolvedValue({ id: 'tag-1', userId, name: 'Old' });
      mockTagsRepo.update.mockResolvedValue({ id: 'tag-1', userId, name: 'New', _count: { fileTags: 0 } });

      const result = await service.updateTag('tag-1', userId, { name: 'New' });
      expect(result.name).toBe('New');
    });

    it('throws AppError TAG0001 when tag belongs to another user', async () => {
      mockTagsRepo.findById.mockResolvedValue({ id: 'tag-1', userId: 'other-user', name: 'X' });
      await expect(service.updateTag('tag-1', userId, { name: 'Y' })).rejects.toThrow(AppError);
    });

    it('throws AppError when tag not found', async () => {
      mockTagsRepo.findById.mockResolvedValue(null);
      await expect(service.updateTag('missing', userId, { name: 'Z' })).rejects.toThrow(AppError);
    });
  });

  describe('deleteTag', () => {
    it('deletes tag when owned by user', async () => {
      mockTagsRepo.findById.mockResolvedValue({ id: 'tag-1', userId, name: 'ToDelete' });
      mockTagsRepo.delete.mockResolvedValue(undefined);

      await expect(service.deleteTag('tag-1', userId)).resolves.toBeUndefined();
      expect(mockTagsRepo.delete).toHaveBeenCalledWith('tag-1');
    });

    it('throws when deleting another user\'s tag', async () => {
      mockTagsRepo.findById.mockResolvedValue({ id: 'tag-1', userId: 'other', name: 'X' });
      await expect(service.deleteTag('tag-1', userId)).rejects.toThrow(AppError);
    });
  });
});
