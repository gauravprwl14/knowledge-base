import { Test, TestingModule } from '@nestjs/testing';
import { TagsController } from './tags.controller';
import { TagsService, TagResponse } from './tags.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTagDto } from './dto/create-tag.dto';
import { BulkTagDto } from './dto/bulk-tag.dto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const TAG_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const FILE_ID = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const FILE_ID_2 = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockTag: TagResponse = {
  id: TAG_ID,
  userId: USER_ID,
  name: 'design',
  color: '#6366f1',
  fileCount: 3,
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
};

// Fastify-style request helper
function makeReq(overrides: Record<string, unknown> = {}) {
  return { user: { id: USER_ID, email: 'user@example.com' }, ...overrides };
}

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

const mockTagsService = {
  listTags: jest.fn(),
  createTag: jest.fn(),
  deleteTag: jest.fn(),
  addTagToFile: jest.fn(),
  removeTagFromFile: jest.fn(),
  bulkTagFiles: jest.fn(),
};

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

describe('TagsController', () => {
  let controller: TagsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TagsController],
      providers: [{ provide: TagsService, useValue: mockTagsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TagsController>(TagsController);
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // JwtAuthGuard wiring
  // =========================================================================

  describe('JwtAuthGuard', () => {
    it('is applied at the controller level so all routes require authentication', async () => {
      const denyGuard = { canActivate: jest.fn().mockReturnValue(false) };

      const blockedModule: TestingModule = await Test.createTestingModule({
        controllers: [TagsController],
        providers: [{ provide: TagsService, useValue: mockTagsService }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(denyGuard)
        .compile();

      const blockedController = blockedModule.get<TagsController>(TagsController);
      expect(blockedController).toBeDefined();
      expect(denyGuard.canActivate()).toBe(false);
    });
  });

  // =========================================================================
  // GET /tags
  // =========================================================================

  describe('listTags()', () => {
    it('delegates to tagsService.listTags with userId from request', async () => {
      mockTagsService.listTags.mockResolvedValue([mockTag]);

      const result = await controller.listTags(makeReq());

      expect(mockTagsService.listTags).toHaveBeenCalledWith(USER_ID);
      expect(result).toEqual([mockTag]);
    });

    it('returns an empty array when the user has no tags', async () => {
      mockTagsService.listTags.mockResolvedValue([]);

      const result = await controller.listTags(makeReq());

      expect(result).toHaveLength(0);
    });

    it('returns multiple tags when the user has several', async () => {
      const secondTag = { ...mockTag, id: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee', name: 'notes' };
      mockTagsService.listTags.mockResolvedValue([mockTag, secondTag]);

      const result = await controller.listTags(makeReq());

      expect(result).toHaveLength(2);
    });

    it('scopes the query to the authenticated user (multi-tenant isolation)', async () => {
      mockTagsService.listTags.mockResolvedValue([mockTag]);

      await controller.listTags(makeReq());

      const [capturedUserId] = mockTagsService.listTags.mock.calls[0];
      expect(capturedUserId).toBe(USER_ID);
    });

    it('propagates errors from tagsService.listTags', async () => {
      const err = new Error('Database error');
      mockTagsService.listTags.mockRejectedValue(err);

      await expect(controller.listTags(makeReq())).rejects.toThrow('Database error');
    });
  });

  // =========================================================================
  // POST /tags
  // =========================================================================

  describe('createTag()', () => {
    const dto: CreateTagDto = { name: 'design', color: '#6366f1' };

    it('delegates to tagsService.createTag with userId, name, and color', async () => {
      mockTagsService.createTag.mockResolvedValue(mockTag);

      const result = await controller.createTag(dto, makeReq());

      expect(mockTagsService.createTag).toHaveBeenCalledWith(USER_ID, 'design', '#6366f1');
      expect(result).toEqual(mockTag);
    });

    it('passes userId from the request (not from the body)', async () => {
      mockTagsService.createTag.mockResolvedValue(mockTag);

      await controller.createTag(dto, makeReq());

      const [capturedUserId] = mockTagsService.createTag.mock.calls[0];
      expect(capturedUserId).toBe(USER_ID);
    });

    it('passes the tag name correctly', async () => {
      mockTagsService.createTag.mockResolvedValue(mockTag);

      await controller.createTag({ name: 'research' }, makeReq());

      const [, capturedName] = mockTagsService.createTag.mock.calls[0];
      expect(capturedName).toBe('research');
    });

    it('passes the optional color when provided', async () => {
      mockTagsService.createTag.mockResolvedValue(mockTag);

      await controller.createTag({ name: 'x', color: '#ff0000' }, makeReq());

      const [, , capturedColor] = mockTagsService.createTag.mock.calls[0];
      expect(capturedColor).toBe('#ff0000');
    });

    it('passes undefined color when color is omitted from the dto', async () => {
      mockTagsService.createTag.mockResolvedValue(mockTag);

      await controller.createTag({ name: 'no-color' }, makeReq());

      const [, , capturedColor] = mockTagsService.createTag.mock.calls[0];
      expect(capturedColor).toBeUndefined();
    });

    it('propagates errors from tagsService.createTag (e.g. TAG0003 limit exceeded)', async () => {
      const err = new Error('Tag limit exceeded');
      mockTagsService.createTag.mockRejectedValue(err);

      await expect(controller.createTag(dto, makeReq())).rejects.toThrow('Tag limit exceeded');
    });

    it('propagates errors from tagsService.createTag (e.g. TAG0002 duplicate name)', async () => {
      const err = new Error('Tag name already exists');
      mockTagsService.createTag.mockRejectedValue(err);

      await expect(controller.createTag(dto, makeReq())).rejects.toThrow('Tag name already exists');
    });
  });

  // =========================================================================
  // DELETE /tags/:id
  // =========================================================================

  describe('deleteTag()', () => {
    it('delegates to tagsService.deleteTag with the tag UUID and userId', async () => {
      mockTagsService.deleteTag.mockResolvedValue(undefined);

      await controller.deleteTag(TAG_ID, makeReq());

      expect(mockTagsService.deleteTag).toHaveBeenCalledWith(TAG_ID, USER_ID);
    });

    it('resolves to undefined (204 No Content)', async () => {
      mockTagsService.deleteTag.mockResolvedValue(undefined);

      const result = await controller.deleteTag(TAG_ID, makeReq());

      expect(result).toBeUndefined();
    });

    it('scopes the delete to the authenticated user', async () => {
      mockTagsService.deleteTag.mockResolvedValue(undefined);

      await controller.deleteTag(TAG_ID, makeReq());

      const [, capturedUserId] = mockTagsService.deleteTag.mock.calls[0];
      expect(capturedUserId).toBe(USER_ID);
    });

    it('propagates errors from tagsService.deleteTag', async () => {
      const err = new Error('Tag not found');
      mockTagsService.deleteTag.mockRejectedValue(err);

      await expect(controller.deleteTag('nonexistent', makeReq())).rejects.toThrow('Tag not found');
    });
  });

  // =========================================================================
  // POST /files/:fileId/tags/:tagId
  // =========================================================================

  describe('addTagToFile()', () => {
    it('delegates to tagsService.addTagToFile with fileId, tagId, and userId', async () => {
      mockTagsService.addTagToFile.mockResolvedValue(undefined);

      await controller.addTagToFile(FILE_ID, TAG_ID, makeReq());

      expect(mockTagsService.addTagToFile).toHaveBeenCalledWith(FILE_ID, TAG_ID, USER_ID);
    });

    it('resolves to undefined (204 No Content)', async () => {
      mockTagsService.addTagToFile.mockResolvedValue(undefined);

      const result = await controller.addTagToFile(FILE_ID, TAG_ID, makeReq());

      expect(result).toBeUndefined();
    });

    it('passes userId from the request for tag ownership verification', async () => {
      mockTagsService.addTagToFile.mockResolvedValue(undefined);

      await controller.addTagToFile(FILE_ID, TAG_ID, makeReq());

      const [, , capturedUserId] = mockTagsService.addTagToFile.mock.calls[0];
      expect(capturedUserId).toBe(USER_ID);
    });

    it('propagates errors (e.g. TAG0001 tag not found)', async () => {
      const err = new Error('Tag not found');
      mockTagsService.addTagToFile.mockRejectedValue(err);

      await expect(controller.addTagToFile(FILE_ID, 'bad-tag-id', makeReq())).rejects.toThrow(
        'Tag not found',
      );
    });

    it('is idempotent — second call passes through to service without error', async () => {
      mockTagsService.addTagToFile.mockResolvedValue(undefined);

      await controller.addTagToFile(FILE_ID, TAG_ID, makeReq());
      await controller.addTagToFile(FILE_ID, TAG_ID, makeReq());

      expect(mockTagsService.addTagToFile).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // DELETE /files/:fileId/tags/:tagId
  // =========================================================================

  describe('removeTagFromFile()', () => {
    it('delegates to tagsService.removeTagFromFile with fileId, tagId, and userId', async () => {
      mockTagsService.removeTagFromFile.mockResolvedValue(undefined);

      await controller.removeTagFromFile(FILE_ID, TAG_ID, makeReq());

      expect(mockTagsService.removeTagFromFile).toHaveBeenCalledWith(FILE_ID, TAG_ID, USER_ID);
    });

    it('resolves to undefined (204 No Content)', async () => {
      mockTagsService.removeTagFromFile.mockResolvedValue(undefined);

      const result = await controller.removeTagFromFile(FILE_ID, TAG_ID, makeReq());

      expect(result).toBeUndefined();
    });

    it('scopes removal to the authenticated user for tag ownership verification', async () => {
      mockTagsService.removeTagFromFile.mockResolvedValue(undefined);

      await controller.removeTagFromFile(FILE_ID, TAG_ID, makeReq());

      const [, , capturedUserId] = mockTagsService.removeTagFromFile.mock.calls[0];
      expect(capturedUserId).toBe(USER_ID);
    });

    it('propagates errors from tagsService.removeTagFromFile', async () => {
      const err = new Error('Tag not found');
      mockTagsService.removeTagFromFile.mockRejectedValue(err);

      await expect(controller.removeTagFromFile(FILE_ID, 'bad-tag-id', makeReq())).rejects.toThrow(
        'Tag not found',
      );
    });
  });

  // =========================================================================
  // POST /files/bulk-tag
  // =========================================================================

  describe('bulkTagFiles()', () => {
    const dto: BulkTagDto = { fileIds: [FILE_ID, FILE_ID_2], tagId: TAG_ID };

    it('delegates to tagsService.bulkTagFiles with fileIds, tagId, and userId', async () => {
      mockTagsService.bulkTagFiles.mockResolvedValue({ tagged: 2 });

      const result = await controller.bulkTagFiles(dto, makeReq());

      expect(mockTagsService.bulkTagFiles).toHaveBeenCalledWith([FILE_ID, FILE_ID_2], TAG_ID, USER_ID);
      expect(result).toEqual({ tagged: 2 });
    });

    it('returns tagged: 0 when no matching files are owned by the user', async () => {
      mockTagsService.bulkTagFiles.mockResolvedValue({ tagged: 0 });

      const result = await controller.bulkTagFiles(dto, makeReq());

      expect(result).toEqual({ tagged: 0 });
    });

    it('returns tagged: N where N is the count of new associations created', async () => {
      mockTagsService.bulkTagFiles.mockResolvedValue({ tagged: 2 });

      const result = await controller.bulkTagFiles(dto, makeReq());

      expect(result.tagged).toBe(2);
    });

    it('passes userId from the request for multi-tenant scoping', async () => {
      mockTagsService.bulkTagFiles.mockResolvedValue({ tagged: 1 });

      await controller.bulkTagFiles(dto, makeReq());

      const [, , capturedUserId] = mockTagsService.bulkTagFiles.mock.calls[0];
      expect(capturedUserId).toBe(USER_ID);
    });

    it('propagates errors from tagsService.bulkTagFiles (e.g. tag not found)', async () => {
      const err = new Error('Tag not found');
      mockTagsService.bulkTagFiles.mockRejectedValue(err);

      await expect(controller.bulkTagFiles(dto, makeReq())).rejects.toThrow('Tag not found');
    });
  });
});
