import { Injectable } from '@nestjs/common';
import { Prisma, KmsFile, FileStatus } from '@prisma/client';
import { BaseRepository } from './base.repository';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Filter parameters accepted by the paginated list query.
 */
export interface ListFilesParams {
  userId: string;
  cursor?: string;
  limit?: number;
  sourceId?: string;
  mimeGroup?: string;
  status?: FileStatus;
  collectionId?: string;
  tags?: string[];
  search?: string;
}

/**
 * Cursor-paginated response wrapper for file list queries.
 */
export interface FilesPage {
  items: KmsFile[];
  nextCursor: string | null;
  total: number;
}

/**
 * FileRepository — data-access layer for the KmsFile entity.
 *
 * All queries are scoped to `userId` to enforce multi-tenant isolation.
 * Uses cursor-based pagination (never offset) for tables that can grow
 * to millions of rows.
 * Tag filtering uses `kms_file_tags` join via Prisma relations.
 *
 * @example
 * ```typescript
 * const page = await fileRepo.listFiles({ userId, limit: 20 });
 * ```
 */
@Injectable()
export class FileRepository extends BaseRepository<
  KmsFile,
  Prisma.KmsFileCreateInput,
  Prisma.KmsFileUpdateInput,
  Prisma.KmsFileWhereInput,
  Prisma.KmsFileWhereUniqueInput,
  Prisma.KmsFileOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma, 'kmsFile');
  }

  /**
   * Finds a single file scoped to the given user — prevents cross-user access.
   *
   * @param id - File UUID.
   * @param userId - Owning user UUID.
   * @returns The file or null if not found / wrong owner.
   */
  async findByIdAndUserId(id: string, userId: string): Promise<KmsFile | null> {
    return this.findFirst({ id, userId });
  }

  /**
   * Returns a cursor-paginated slice of files matching optional filter params.
   *
   * @param params - Filter, pagination, and sort options.
   * @returns A page of files with a nextCursor and total count.
   */
  async listFiles(params: ListFilesParams): Promise<FilesPage> {
    const {
      userId,
      cursor,
      limit = 20,
      sourceId,
      mimeGroup,
      status,
      collectionId,
      tags,
      search,
    } = params;

    // Build the where clause starting with mandatory userId scope
    const where: Prisma.KmsFileWhereInput = { userId };

    // Optional source filter
    if (sourceId) where.sourceId = sourceId;

    // Optional status filter
    if (status) where.status = status;

    // Optional MIME group filter — match mimeType prefix (e.g. 'image/', 'text/')
    if (mimeGroup) where.mimeType = { startsWith: mimeGroup };

    // Optional filename text search (case-insensitive)
    if (search) where.name = { contains: search, mode: 'insensitive' };

    // Optional collection filter — file must belong to the given collection
    if (collectionId) {
      where.collectionFiles = { some: { collectionId } };
    }

    // Optional tag filter — file must have all specified tag names
    if (tags && tags.length > 0) {
      where.fileTags = {
        some: {
          tag: { name: { in: tags }, userId },
        },
      };
    }

    // Parallel: fetch page + total count
    const [items, total] = await Promise.all([
      this.prisma.kmsFile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1, // fetch one extra to detect next page
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      this.prisma.kmsFile.count({ where }),
    ]);

    // Determine next cursor from the extra item
    let nextCursor: string | null = null;
    if (items.length > limit) {
      const nextItem = items.pop();
      nextCursor = nextItem!.id;
    }

    return { items, nextCursor, total };
  }

  /**
   * Hard-deletes a single file by its UUID.
   *
   * @param id - File UUID.
   */
  async deleteById(id: string): Promise<void> {
    await this.prisma.kmsFile.delete({ where: { id } });
  }

  /**
   * Bulk hard-deletes files that belong to `userId`, ignoring foreign IDs.
   * Multi-tenant isolation enforced by the WHERE clause.
   *
   * @param ids - Array of file UUIDs to delete.
   * @param userId - Owner UUID for isolation.
   * @returns Number of deleted records.
   */
  async bulkDelete(ids: string[], userId: string): Promise<number> {
    const result = await this.prisma.kmsFile.deleteMany({
      where: { id: { in: ids }, userId },
    });
    return result.count;
  }

  /**
   * Moves multiple files to a target collection by upserting KmsCollectionFile rows.
   * Files not owned by `userId` are silently skipped via the WHERE filter.
   *
   * @param fileIds - Array of file UUIDs to move.
   * @param collectionId - Target collection UUID.
   * @param userId - Owner UUID for isolation.
   * @returns Count of rows created/updated.
   */
  async bulkMoveToCollection(fileIds: string[], collectionId: string, userId: string): Promise<number> {
    // Verify the files belong to this user before touching join table
    const ownedFiles = await this.prisma.kmsFile.findMany({
      where: { id: { in: fileIds }, userId },
      select: { id: true },
    });

    const ownedIds = ownedFiles.map((f) => f.id);
    if (ownedIds.length === 0) return 0;

    // Upsert collection membership rows; skipDuplicates avoids unique-constraint errors
    const result = await this.prisma.kmsCollectionFile.createMany({
      data: ownedIds.map((fileId) => ({ fileId, collectionId })),
      skipDuplicates: true,
    });

    return result.count;
  }

  /**
   * Marks a file as a duplicate by updating its SHA-256 checksum.
   * The canonical file reference is stored externally (e.g. via KmsFileDuplicate).
   *
   * @param id - UUID of the file to mark
   * @param _duplicateOf - UUID of the canonical file (recorded by caller)
   * @param checksum - SHA-256 checksum establishing the duplicate relationship
   */
  async markDuplicate(id: string, _duplicateOf: string, checksum: string): Promise<void> {
    await this.prisma.kmsFile.update({
      where: { id },
      data: { checksumSha256: checksum },
    });
  }
}
