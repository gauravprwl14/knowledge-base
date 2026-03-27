import { Injectable } from '@nestjs/common';
import { KmsTag } from '@prisma/client';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { TagsRepository, TagWithCount } from './tags.repository';

/** Max tags allowed per user to prevent unbounded growth. */
const MAX_TAGS_PER_USER = 50;

/** Tag response shape — flattens `_count.fileTags` into `fileCount`. */
export interface TagResponse extends KmsTag {
  fileCount: number;
}

/**
 * TagsService — business logic for the tag system.
 *
 * Enforces:
 * - 50-tag per-user limit (TAG0003)
 * - Unique tag names per user (TAG0002, surfaced from Prisma unique constraint)
 * - Tag ownership verification before file associations (TAG0001)
 *
 * All mutating operations are scoped to `userId` for multi-tenant isolation.
 */
@Injectable()
export class TagsService {
  private readonly logger: AppLogger;

  constructor(
    private readonly tagsRepo: TagsRepository,
    logger: AppLogger,
  ) {
    // Bind context so every log line carries `context: TagsService`
    this.logger = logger.child({ context: TagsService.name });
  }

  // ---------------------------------------------------------------------------
  // LIST
  // ---------------------------------------------------------------------------

  /**
   * Returns all tags owned by the user, each with a `fileCount` field.
   *
   * @param userId - Authenticated user UUID.
   * @returns Array of tags sorted alphabetically.
   */
  async listTags(userId: string): Promise<TagResponse[]> {
    const tags: TagWithCount[] = await this.tagsRepo.findByUserId(userId);
    // Flatten _count.fileTags into a top-level fileCount for cleaner API responses
    return tags.map((t) => ({ ...t, fileCount: t._count.fileTags }));
  }

  // ---------------------------------------------------------------------------
  // CREATE
  // ---------------------------------------------------------------------------

  /**
   * Creates a new tag for the user.
   *
   * Validates that:
   *   - The user has not reached the 50-tag limit (TAG0003).
   *   - The hex colour is valid; falls back to default if missing/invalid.
   *
   * A duplicate name will surface as TAG0002 (unique constraint violation
   * handled by the global PrismaExceptionFilter, but re-thrown here for clarity).
   *
   * @param userId - Authenticated user UUID.
   * @param name - Tag name (max 50 chars, validated in DTO).
   * @param color - Hex colour string; defaults to #6366f1 if falsy or invalid.
   * @returns The created KmsTag.
   */
  async createTag(userId: string, name: string, color?: string): Promise<KmsTag> {
    // Guard: enforce per-user tag limit
    const existing = await this.tagsRepo.countByUserId(userId);
    if (existing >= MAX_TAGS_PER_USER) {
      throw new AppError({ code: ERROR_CODES.TAG.TAG_LIMIT_EXCEEDED.code });
    }

    // Normalise colour — validate hex format, fall back to default
    const finalColor =
      color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#6366f1';

    try {
      const tag = await this.tagsRepo.create(userId, name, finalColor);
      this.logger.info('tag created', { tagId: tag.id, userId });
      return tag;
    } catch (err: any) {
      // Unique constraint violation on (user_id, name) — surface as TAG0002
      if (err?.code === 'P2002') {
        throw new AppError({ code: ERROR_CODES.TAG.TAG_NAME_CONFLICT.code });
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // DELETE
  // ---------------------------------------------------------------------------

  /**
   * Deletes a tag. No-op (silent success) if the tag does not exist or does
   * not belong to the user — avoids leaking resource existence.
   * Cascade removes all associated kms_file_tags rows.
   *
   * @param id - Tag UUID.
   * @param userId - Authenticated user UUID.
   */
  async deleteTag(id: string, userId: string): Promise<void> {
    await this.tagsRepo.deleteById(id, userId);
    this.logger.info('tag deleted', { tagId: id, userId });
  }

  // ---------------------------------------------------------------------------
  // FILE-TAG ASSOCIATIONS
  // ---------------------------------------------------------------------------

  /**
   * Applies a tag to a single file.
   *
   * Verifies the tag belongs to the authenticated user before applying.
   * Returns 404 (TAG0001) if the tag does not exist or belongs to another user.
   *
   * @param fileId - File UUID.
   * @param tagId - Tag UUID.
   * @param userId - Authenticated user UUID.
   */
  async addTagToFile(fileId: string, tagId: string, userId: string): Promise<void> {
    // Verify tag ownership — prevents applying another user's tag to a file
    await this.assertTagOwnership(tagId, userId);
    await this.tagsRepo.addTagToFile(fileId, tagId);
    this.logger.info('tag added to file', { fileId, tagId, userId });
  }

  /**
   * Removes a tag from a single file (idempotent).
   *
   * @param fileId - File UUID.
   * @param tagId - Tag UUID.
   * @param userId - Authenticated user UUID — used to verify tag ownership.
   */
  async removeTagFromFile(fileId: string, tagId: string, userId: string): Promise<void> {
    // Verify tag ownership before dissociation
    await this.assertTagOwnership(tagId, userId);
    await this.tagsRepo.removeTagFromFile(fileId, tagId);
    this.logger.info('tag removed from file', { fileId, tagId, userId });
  }

  /**
   * Bulk-applies a tag to multiple files in one query.
   *
   * Verifies tag ownership first. Duplicate rows are silently skipped.
   *
   * @param fileIds - Array of file UUIDs (max 100, validated in DTO).
   * @param tagId - Tag UUID.
   * @param userId - Authenticated user UUID.
   * @returns `{ tagged: N }` where N is the number of new associations created.
   */
  async bulkTagFiles(
    fileIds: string[],
    tagId: string,
    userId: string,
  ): Promise<{ tagged: number }> {
    // Verify tag ownership before bulk operation
    await this.assertTagOwnership(tagId, userId);
    const count = await this.tagsRepo.bulkAddTagToFiles(fileIds, tagId);
    this.logger.info('bulk tag applied to files', { fileIds, tagId, count, userId });
    return { tagged: count };
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Verifies a tag belongs to the given user. Throws TAG0001 if not found.
   *
   * @param tagId - Tag UUID.
   * @param userId - Owner UUID.
   */
  private async assertTagOwnership(tagId: string, userId: string): Promise<void> {
    const tag = await this.tagsRepo.findByIdAndUserId(tagId, userId);
    if (!tag) {
      throw new AppError({ code: ERROR_CODES.TAG.TAG_NOT_FOUND.code });
    }
  }
}
