import { Injectable } from '@nestjs/common';
import { Prisma, KmsFile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * MIME type groupings used to translate a human-readable `mimeGroup` filter
 * into a set of concrete MIME type strings for the SQL WHERE clause.
 */
export const MIME_GROUPS: Record<string, string[]> = {
  documents: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
  ],
  images: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
  video: ['video/mp4', 'video/mov', 'video/avi'],
  data: [
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
};

/**
 * Filter parameters accepted by `FileRepository.findFiltered`.
 */
export interface FileFilters {
  /** Filter by source UUID */
  sourceId?: string;
  /** Filter by Prisma FileStatus string ('PENDING' | 'PROCESSING' | 'INDEXED' | 'ERROR') */
  status?: string;
  /** Filter by MIME group (maps to concrete MIME types in the query) */
  mimeGroup?: string;
}

/**
 * Repository for KmsFile entity operations.
 * Provides multi-tenant isolation by scoping all queries to userId.
 * Uses cursor-based pagination (never offset) for tables that can grow
 * to millions of rows.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class FilesService {
 *   constructor(private readonly fileRepository: FileRepository) {}
 *
 *   async getUserFiles(userId: string) {
 *     return this.fileRepository.findPage(userId);
 *   }
 * }
 * ```
 */
@Injectable()
export class FileRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds files matching the given criteria.
   * @param args - Prisma findMany arguments
   * @returns Array of matching files
   */
  async findMany(args: Prisma.KmsFileFindManyArgs): Promise<KmsFile[]> {
    return this.prisma.kmsFile.findMany(args);
  }

  /**
   * Finds a file by its unique identifier.
   * @param where - Unique where input
   * @returns The matching file or null
   */
  async findUnique(where: Prisma.KmsFileWhereUniqueInput): Promise<KmsFile | null> {
    return this.prisma.kmsFile.findUnique({ where });
  }

  /**
   * Finds the first file matching the given criteria.
   * @param args - Prisma findFirst arguments
   * @returns The first matching file or null
   */
  async findFirst(args: Prisma.KmsFileFindFirstArgs): Promise<KmsFile | null> {
    return this.prisma.kmsFile.findFirst(args);
  }

  /**
   * Creates a new file record.
   * @param data - File creation input
   * @returns The created file
   */
  async create(data: Prisma.KmsFileCreateInput): Promise<KmsFile> {
    return this.prisma.kmsFile.create({ data });
  }

  /**
   * Upserts a file record.
   * @param args - Prisma upsert arguments
   * @returns The upserted file
   */
  async upsert(args: Prisma.KmsFileUpsertArgs): Promise<KmsFile> {
    return this.prisma.kmsFile.upsert(args);
  }

  /**
   * Updates a file record.
   * @param where - Unique identifier
   * @param data - Update payload
   * @returns The updated file
   */
  async update(where: Prisma.KmsFileWhereUniqueInput, data: Prisma.KmsFileUpdateInput): Promise<KmsFile> {
    return this.prisma.kmsFile.update({ where, data });
  }

  /**
   * Counts files matching the given where clause.
   * @param where - Where input
   * @returns Count of matching files
   */
  async count(where: Prisma.KmsFileWhereInput): Promise<number> {
    return this.prisma.kmsFile.count({ where });
  }

  /**
   * Returns a cursor-based page of files for a user.
   * Never uses offset pagination — tables can be millions of rows.
   *
   * @param userId - Owner user UUID for multi-tenant isolation
   * @param cursor - Opaque cursor (file ID) from the previous page
   * @param limit - Maximum number of items to return (default: 20)
   * @returns Items plus an opaque nextCursor (null if last page)
   */
  async findPage(
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ items: KmsFile[]; nextCursor: string | null }> {
    const items = await this.prisma.kmsFile.findMany({
      where: { userId },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
    const hasMore = items.length > limit;
    return {
      items: hasMore ? items.slice(0, limit) : items,
      nextCursor: hasMore ? items[limit - 1].id : null,
    };
  }

  /**
   * Returns a filtered, cursor-based page of files scoped to a user.
   *
   * When `filters.mimeGroup` is provided the query uses `$queryRaw` to
   * leverage a SQL `ANY(ARRAY[...])` expression for efficient MIME filtering.
   * All other filter combinations use the typed Prisma client.
   *
   * @param userId  - Owner user UUID (multi-tenant isolation)
   * @param filters - Optional source, status and MIME group filters
   * @param cursor  - Opaque cursor (file UUID) from the previous page
   * @param limit   - Maximum items to return (default: 50)
   * @returns Items plus an opaque nextCursor (null if last page)
   */
  async findFiltered(
    userId: string,
    filters: FileFilters = {},
    cursor?: string,
    limit = 50,
  ): Promise<{ items: KmsFile[]; nextCursor: string | null }> {
    const { sourceId, status, mimeGroup } = filters;

    if (mimeGroup) {
      const mimeTypes = MIME_GROUPS[mimeGroup] ?? [];
      if (mimeTypes.length === 0) {
        return { items: [], nextCursor: null };
      }

      // Build raw SQL — cursor pagination using createdAt DESC, id DESC ordering
      // to guarantee a stable page boundary even for files created at the same instant.
      const cursorCondition = cursor
        ? Prisma.sql`AND f.id < ${cursor}::uuid`
        : Prisma.empty;

      const sourceCondition = sourceId
        ? Prisma.sql`AND f.source_id = ${sourceId}::uuid`
        : Prisma.empty;

      const statusCondition = status
        ? Prisma.sql`AND f.status = ${status}::"FileStatus"`
        : Prisma.empty;

      const mimeArray = Prisma.join(
        mimeTypes.map((m) => Prisma.sql`${m}`),
        ', ',
      );

      const rows = await this.prisma.$queryRaw<KmsFile[]>`
        SELECT f.*
        FROM kms_files f
        WHERE f.user_id = ${userId}::uuid
          AND f.mime_type = ANY(ARRAY[${mimeArray}])
          ${sourceCondition}
          ${statusCondition}
          ${cursorCondition}
        ORDER BY f.created_at DESC, f.id DESC
        LIMIT ${limit + 1}
      `;

      const hasMore = rows.length > limit;
      return {
        items: hasMore ? rows.slice(0, limit) : rows,
        nextCursor: hasMore ? rows[limit - 1].id : null,
      };
    }

    // No mimeGroup filter — use typed Prisma client for full type safety.
    const where: Prisma.KmsFileWhereInput = { userId };
    if (sourceId) where.sourceId = sourceId;
    if (status) where.status = status as Prisma.EnumFileStatusFilter;

    const items = await this.prisma.kmsFile.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = items.length > limit;
    return {
      items: hasMore ? items.slice(0, limit) : items,
      nextCursor: hasMore ? items[limit - 1].id : null,
    };
  }

  /**
   * Counts files matching filters for the given user.
   *
   * @param userId  - Owner user UUID (multi-tenant isolation)
   * @param filters - Optional source, status and MIME group filters
   * @returns Count of matching files
   */
  async countFiltered(userId: string, filters: FileFilters = {}): Promise<number> {
    const { sourceId, status, mimeGroup } = filters;

    if (mimeGroup) {
      const mimeTypes = MIME_GROUPS[mimeGroup] ?? [];
      if (mimeTypes.length === 0) return 0;

      const sourceCondition = sourceId
        ? Prisma.sql`AND f.source_id = ${sourceId}::uuid`
        : Prisma.empty;

      const statusCondition = status
        ? Prisma.sql`AND f.status = ${status}::"FileStatus"`
        : Prisma.empty;

      const mimeArray = Prisma.join(
        mimeTypes.map((m) => Prisma.sql`${m}`),
        ', ',
      );

      const result = await this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) AS count
        FROM kms_files f
        WHERE f.user_id = ${userId}::uuid
          AND f.mime_type = ANY(ARRAY[${mimeArray}])
          ${sourceCondition}
          ${statusCondition}
      `;
      return Number(result[0]?.count ?? 0);
    }

    const where: Prisma.KmsFileWhereInput = { userId };
    if (sourceId) where.sourceId = sourceId;
    if (status) where.status = status as Prisma.EnumFileStatusFilter;

    return this.prisma.kmsFile.count({ where });
  }

  /**
   * Finds a file by ID scoped to the given user.
   *
   * @param id     - File UUID
   * @param userId - Owner user UUID (multi-tenant isolation)
   * @returns The file record or null
   */
  async findById(id: string, userId: string): Promise<KmsFile | null> {
    return this.prisma.kmsFile.findFirst({ where: { id, userId } });
  }

  /**
   * Deletes a single file record scoped to the given user.
   * No-ops silently if the file does not exist or belongs to another user —
   * callers should check existence first if they need a 404.
   *
   * @param id     - File UUID
   * @param userId - Owner user UUID (multi-tenant isolation)
   */
  async deleteById(id: string, userId: string): Promise<void> {
    await this.prisma.kmsFile.deleteMany({ where: { id, userId } });
  }

  /**
   * Deletes multiple file records scoped to the given user.
   * Only files owned by `userId` are deleted; IDs belonging to other users are
   * silently ignored (multi-tenant isolation is enforced by the WHERE clause).
   *
   * @param ids    - Array of file UUIDs to delete
   * @param userId - Owner user UUID (multi-tenant isolation)
   * @returns Number of records actually deleted
   */
  async bulkDelete(ids: string[], userId: string): Promise<number> {
    const result = await this.prisma.kmsFile.deleteMany({
      where: { id: { in: ids }, userId },
    });
    return result.count;
  }

  /**
   * Marks a file as a duplicate by updating its SHA-256 checksum.
   * The canonical file reference is stored externally (e.g. via KmsFileDuplicate).
   * This method only updates the checksum column on the target file.
   *
   * @param id          - UUID of the file to mark
   * @param _duplicateOf - UUID of the canonical file (recorded by caller)
   * @param checksum    - SHA-256 checksum establishing the duplicate relationship
   */
  async markDuplicate(id: string, _duplicateOf: string, checksum: string): Promise<void> {
    await this.prisma.kmsFile.update({
      where: { id },
      data: { checksumSha256: checksum },
    });
  }
}
