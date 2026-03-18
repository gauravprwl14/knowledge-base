import { Injectable } from '@nestjs/common';
import { KmsTag } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

/**
 * KmsTag enriched with the number of files it is applied to.
 */
export type TagWithCount = KmsTag & { _count: { fileTags: number } };

/**
 * TagsRepository — data-access layer for KmsTag and KmsFileTag.
 *
 * Avoids inheriting BaseRepository because the composite-key join table
 * (kms_file_tags) and the _count include don't fit the generic shape.
 * All mutations are scoped to `userId` for multi-tenant isolation.
 *
 * @example
 * ```typescript
 * const tags = await tagsRepo.findByUserId(userId);
 * ```
 */
@Injectable()
export class TagsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // TAG CRUD
  // ---------------------------------------------------------------------------

  /**
   * Returns all tags owned by the user, ordered alphabetically.
   * Includes a `_count.fileTags` field for display-side file counts.
   *
   * @param userId - Owning user UUID.
   * @returns Array of tags with file counts.
   */
  async findByUserId(userId: string): Promise<TagWithCount[]> {
    return this.prisma.kmsTag.findMany({
      where: { userId },
      include: { _count: { select: { fileTags: true } } },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Returns a single tag owned by the user, or null if not found.
   *
   * @param id - Tag UUID.
   * @param userId - Owning user UUID.
   * @returns The tag or null.
   */
  async findByIdAndUserId(id: string, userId: string): Promise<KmsTag | null> {
    return this.prisma.kmsTag.findFirst({ where: { id, userId } });
  }

  /**
   * Counts how many tags a user currently owns (used for the 50-tag limit).
   *
   * @param userId - Owning user UUID.
   * @returns Tag count for this user.
   */
  async countByUserId(userId: string): Promise<number> {
    return this.prisma.kmsTag.count({ where: { userId } });
  }

  /**
   * Creates a new tag for the user.
   *
   * @param userId - Owning user UUID.
   * @param name - Tag name.
   * @param color - Hex colour string.
   * @returns The created KmsTag.
   */
  async create(userId: string, name: string, color: string): Promise<KmsTag> {
    return this.prisma.kmsTag.create({ data: { userId, name, color } });
  }

  /**
   * Deletes a tag owned by the user. No-op if already deleted or wrong owner.
   * Cascade rules in the schema remove associated kms_file_tags rows.
   *
   * @param id - Tag UUID.
   * @param userId - Owning user UUID.
   */
  async deleteById(id: string, userId: string): Promise<void> {
    await this.prisma.kmsTag.deleteMany({ where: { id, userId } });
  }

  // ---------------------------------------------------------------------------
  // FILE-TAG ASSOCIATIONS
  // ---------------------------------------------------------------------------

  /**
   * Upserts a single file-tag association (idempotent).
   *
   * @param fileId - File UUID.
   * @param tagId - Tag UUID.
   * @param source - Origin: 'manual' (default) or 'ai'.
   */
  async addTagToFile(
    fileId: string,
    tagId: string,
    source: 'manual' | 'ai' = 'manual',
  ): Promise<void> {
    await this.prisma.kmsFileTag.upsert({
      where: { fileId_tagId: { fileId, tagId } },
      create: { fileId, tagId, source },
      update: {}, // no-op if the row already exists
    });
  }

  /**
   * Removes a file-tag association. No-op if already absent.
   *
   * @param fileId - File UUID.
   * @param tagId - Tag UUID.
   */
  async removeTagFromFile(fileId: string, tagId: string): Promise<void> {
    await this.prisma.kmsFileTag.deleteMany({ where: { fileId, tagId } });
  }

  /**
   * Bulk-applies a tag to multiple files in a single query.
   * Duplicate rows are silently skipped.
   *
   * @param fileIds - Array of file UUIDs.
   * @param tagId - Tag UUID.
   * @returns Count of new associations created.
   */
  async bulkAddTagToFiles(fileIds: string[], tagId: string): Promise<number> {
    const result = await this.prisma.kmsFileTag.createMany({
      data: fileIds.map((fileId) => ({ fileId, tagId, source: 'manual' })),
      skipDuplicates: true,
    });
    return result.count;
  }
}
