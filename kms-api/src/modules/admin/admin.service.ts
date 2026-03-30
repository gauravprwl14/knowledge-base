import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { FileStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { Trace } from '../../telemetry/decorators/trace.decorator';
import { EmbedJobPublisher } from '../../queue/publishers/embed-job.publisher';
import {
  AdminListResponseDto,
  AdminUserItemDto,
  AdminSourceItemDto,
  AdminScanJobItemDto,
  AdminFileItemDto,       // add this
} from './dto/admin-list-response.dto';
import { AdminStatsResponseDto } from './dto/admin-stats-response.dto';
import { AdminFilesQueryDto } from './dto/admin-files-query.dto';

/**
 * AdminService — system-wide read-only queries for the admin dashboard.
 *
 * All methods query across all users (no userId scoping).
 * Cursor-based pagination is used to avoid offset performance issues on large tables.
 *
 * @example
 * ```typescript
 * const stats = await adminService.getStats();
 * const users = await adminService.getUsers({ limit: 50 });
 * ```
 */
@Injectable()
export class AdminService {
  /** Redis key for caching the stats response. TTL=30s keeps the dashboard snappy
   *  while avoiding a full DB round-trip on every admin page load. */
  private static readonly STATS_CACHE_KEY = 'admin:stats';
  private static readonly STATS_CACHE_TTL_SECONDS = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    @InjectPinoLogger(AdminService.name)
    private readonly logger: PinoLogger,
    private readonly embedJobPublisher: EmbedJobPublisher,
  ) {}

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------

  /**
   * Returns a cursor-paginated list of all users in the system.
   *
   * @param params - Pagination parameters (cursor, limit).
   * @returns Paginated user list ordered by createdAt descending.
   */
  @Trace({ name: 'admin.getUsers' })
  async getUsers(params: {
    cursor?: string;
    limit?: number;
  }): Promise<AdminListResponseDto<AdminUserItemDto>> {
    const limit = params.limit ?? 50;
    this.logger.info({ event: 'admin.getUsers', cursor: params.cursor, limit }, 'admin: list users');

    const total = await this.prisma.user.count();

    const users = await this.prisma.user.findMany({
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    const hasNextPage = users.length > limit;
    const items = hasNextPage ? users.slice(0, limit) : users;
    const nextCursor = hasNextPage ? items[items.length - 1].id : null;

    const data: AdminUserItemDto[] = items.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    }));

    return { data, nextCursor, total };
  }

  // ---------------------------------------------------------------------------
  // Sources
  // ---------------------------------------------------------------------------

  /**
   * Returns a cursor-paginated list of all knowledge sources with the owning user's email.
   *
   * Uses a raw join via Prisma's `include` to attach the user email.
   *
   * @param params - Pagination parameters (cursor, limit).
   * @returns Paginated source list ordered by createdAt descending.
   */
  @Trace({ name: 'admin.getSources' })
  async getSources(params: {
    cursor?: string;
    limit?: number;
  }): Promise<AdminListResponseDto<AdminSourceItemDto>> {
    const limit = params.limit ?? 50;
    this.logger.info({ event: 'admin.getSources', cursor: params.cursor, limit }, 'admin: list sources');

    const total = await this.prisma.kmsSource.count();

    const sources = await this.prisma.kmsSource.findMany({
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        type: true,
        name: true,
        status: true,
        lastScannedAt: true,
        fileCount: true,
      },
    });

    const hasNextPage = sources.length > limit;
    const items = hasNextPage ? sources.slice(0, limit) : sources;
    const nextCursor = hasNextPage ? items[items.length - 1].id : null;

    // Batch-fetch user emails to avoid N+1 queries
    const userIds = [...new Set(items.map((s) => s.userId))];
    const usersMap = userIds.length > 0
      ? await this.prisma.user
          .findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
          .then((rows) => new Map(rows.map((u) => [u.id, u.email])))
      : new Map<string, string>();

    const data: AdminSourceItemDto[] = items.map((s) => ({
      id: s.id,
      userId: s.userId,
      userEmail: usersMap.get(s.userId) ?? null,
      type: s.type,
      name: s.name,
      status: s.status,
      lastScannedAt: s.lastScannedAt ? s.lastScannedAt.toISOString() : null,
      fileCount: s.fileCount,
    }));

    return { data, nextCursor, total };
  }

  // ---------------------------------------------------------------------------
  // Scan Jobs
  // ---------------------------------------------------------------------------

  /**
   * Returns the most recent 200 scan jobs across all users, with user email and source name.
   *
   * @returns List of the 200 most recent scan jobs.
   */
  @Trace({ name: 'admin.getScanJobs' })
  async getScanJobs(): Promise<AdminListResponseDto<AdminScanJobItemDto>> {
    this.logger.info({ event: 'admin.getScanJobs' }, 'admin: list scan jobs');

    const jobs = await this.prisma.kmsScanJob.findMany({
      take: 200,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        sourceId: true,
        type: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        filesFound: true,
      },
    });

    const total = jobs.length;

    if (total === 0) {
      return { data: [], nextCursor: null, total: 0 };
    }

    // Batch-fetch user emails
    const userIds = [...new Set(jobs.map((j) => j.userId))];
    const usersMap = await this.prisma.user
      .findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
      .then((rows) => new Map(rows.map((u) => [u.id, u.email])));

    // Batch-fetch source names
    const sourceIds = [...new Set(jobs.map((j) => j.sourceId))];
    const sourcesMap = await this.prisma.kmsSource
      .findMany({ where: { id: { in: sourceIds } }, select: { id: true, name: true } })
      .then((rows) => new Map(rows.map((s) => [s.id, s.name])));

    const data: AdminScanJobItemDto[] = jobs.map((j) => ({
      id: j.id,
      userId: j.userId,
      userEmail: usersMap.get(j.userId) ?? null,
      sourceId: j.sourceId,
      sourceName: sourcesMap.get(j.sourceId) ?? null,
      type: j.type,
      status: j.status,
      startedAt: j.startedAt ? j.startedAt.toISOString() : null,
      finishedAt: j.finishedAt ? j.finishedAt.toISOString() : null,
      filesFound: j.filesFound,
    }));

    return { data, nextCursor: null, total };
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  /**
   * Returns system-wide aggregate counters for the admin dashboard.
   *
   * Results are cached in Redis for 30 seconds to avoid hammering PostgreSQL
   * on every admin dashboard load. Cache is a best-effort layer — if Redis is
   * unavailable the query falls through to the DB transparently.
   *
   * @returns AdminStatsResponseDto with counters.
   */
  @Trace({ name: 'admin.getStats' })
  async getStats(): Promise<AdminStatsResponseDto> {
    this.logger.info({ event: 'admin.getStats' }, 'admin: get stats');

    // Attempt cache hit first — avoids DB round-trip within the 30 s window
    try {
      const cached = await this.cache.get<AdminStatsResponseDto>(AdminService.STATS_CACHE_KEY);
      if (cached) {
        this.logger.debug({ event: 'admin.getStats.cache_hit' }, 'admin stats: cache hit');
        return cached;
      }
    } catch (cacheErr) {
      // Redis unavailability must not break the admin panel — fall through to DB
      this.logger.warn({ event: 'admin.getStats.cache_miss', error: (cacheErr as Error).message }, 'admin stats: Redis unavailable, falling through to DB');
    }

    // Cache miss or Redis error — run parallel DB counts.
    // storageAggregate uses a Prisma aggregate to SUM sizeBytes across all
    // non-deleted files.  The result is a BigInt that we coerce to Number;
    // safe because realistic storage totals fit well within Number.MAX_SAFE_INTEGER.
    const [
      totalUsers,
      totalSources,
      totalFiles,
      pendingEmbeds,
      processingEmbeds,
      failedFiles,
      storageAggregate,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.kmsSource.count(),
      this.prisma.kmsFile.count(),
      this.prisma.kmsFile.count({ where: { status: FileStatus.PENDING } }),
      this.prisma.kmsFile.count({ where: { status: FileStatus.PROCESSING } }),
      this.prisma.kmsFile.count({ where: { status: FileStatus.ERROR } }),
      this.prisma.kmsFile.aggregate({
        _sum: { sizeBytes: true },
        where: { status: { not: FileStatus.DELETED } },
      }),
    ]);

    // Prisma returns BigInt | null for aggregated numeric fields; coerce safely
    const storageUsageBytes = Number(storageAggregate._sum.sizeBytes ?? 0);

    const result: AdminStatsResponseDto = {
      totalUsers,
      totalSources,
      totalFiles,
      pendingEmbeds,
      processingEmbeds,
      failedFiles,
      storageUsageBytes,
    };

    // Store in Redis with a 30 s TTL — best effort, never throw on cache write failure
    try {
      await this.cache.set(AdminService.STATS_CACHE_KEY, result, AdminService.STATS_CACHE_TTL_SECONDS);
    } catch (cacheErr) {
      this.logger.warn({ event: 'admin.getStats.cache_write_failed', error: (cacheErr as Error).message }, 'admin stats: failed to write to cache');
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Reindex All
  // ---------------------------------------------------------------------------

  /**
   * Re-queues all files with status ERROR or PENDING across all users for
   * re-embedding.
   *
   * The operation is cursor-paginated in batches of 100 so it can safely run
   * against arbitrarily large tables without exhausting memory or locking rows
   * for extended periods.  For each batch the following steps happen atomically
   * within NestJS (not a DB transaction — partial success is acceptable and any
   * failed publish leaves the file in PENDING for future retry):
   *
   *   1. Delete existing `kms_chunks` for the batch (raw SQL for efficiency).
   *   2. Reset `status = PENDING` for the batch via `updateMany`.
   *   3. Publish one embed job message per file to `kms.embed`.
   *
   * If publishing a single file fails the error is logged and the loop continues
   * so a RabbitMQ glitch on one message does not abort the entire operation.
   * The file remains in PENDING and will be included in the next admin reindex.
   *
   * @returns `{ queued: N }` where N is the number of files successfully published.
   */
  @Trace({ name: 'admin.reindexAll' })
  async reindexAll(): Promise<{ queued: number }> {
    this.logger.info({ event: 'admin.reindexAll.start' }, 'admin: reindexAll — beginning cursor scan');

    // Statuses that indicate the file needs to be re-processed.
    // PROCESSING is deliberately excluded: those files are actively being worked
    // on by the embed-worker and interrupting them could cause data races.
    const targetStatuses = [FileStatus.ERROR, FileStatus.PENDING];

    let cursor: string | undefined = undefined;
    let totalQueued = 0;
    const batchSize = 100;

    /**
     * Shape of each record returned by the Prisma select below.
     * Defined here so TypeScript can resolve the type without an inference cycle
     * (TS7022 occurs when the variable is referenced inside the same while-loop
     * body that assigns it).
     */
    type FileBatchItem = {
      id: string;
      userId: string;
      sourceId: string;
      name: string;
      path: string;
      mimeType: string | null;
      sizeBytes: bigint;
    };

    // Cursor-paginate through all ERROR/PENDING files to avoid loading the
    // entire table into memory.  The cursor is the last file ID in each batch.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Fetch a batch of files — select only the fields needed for publishing
      const batch: FileBatchItem[] = await this.prisma.kmsFile.findMany({
        where: { status: { in: targetStatuses } },
        take: batchSize,
        // Skip the cursor row itself on all iterations after the first
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' }, // stable ordering required for reliable cursor pagination
        select: {
          id: true,
          userId: true,
          sourceId: true,
          name: true,
          path: true,
          mimeType: true,
          sizeBytes: true,
        },
      });

      // No more files — we are done
      if (batch.length === 0) break;

      // Advance the cursor to the last ID in this batch before any mutations,
      // so a crash mid-batch doesn't replay the same files twice on the next run.
      cursor = batch[batch.length - 1].id;

      const batchIds = batch.map((f) => f.id);

      // ── Step 1: Delete existing chunks for the batch ────────────────────
      // Using Prisma deleteMany here (vs raw SQL) because the batch size is
      // bounded at 100 and Prisma generates an efficient `WHERE id IN (...)`.
      await this.prisma.kmsChunk.deleteMany({
        where: { fileId: { in: batchIds } },
      });

      // ── Step 2: Reset status to PENDING for the batch ───────────────────
      // Files in ERROR status are reset so the embed-worker picks them up.
      // Files already in PENDING remain PENDING (idempotent).
      await this.prisma.kmsFile.updateMany({
        where: { id: { in: batchIds } },
        data: { status: FileStatus.PENDING, updatedAt: new Date() },
      });

      // ── Step 3: Publish embed jobs for each file in the batch ────────────
      for (const file of batch) {
        try {
          await this.embedJobPublisher.publishEmbedJob({
            scan_job_id: file.id,
            source_id: file.sourceId,
            user_id: file.userId,
            file_path: file.path,
            original_filename: file.name,
            mime_type: file.mimeType ?? undefined,
            file_size_bytes: file.sizeBytes != null ? Number(file.sizeBytes) : undefined,
            source_type: 'admin-reindex',
            source_metadata: {},
          });
          totalQueued += 1;
        } catch (err) {
          // Log and continue — a single publish failure must not abort the
          // batch.  The file stays PENDING and will be retried on the next
          // admin reindex call.
          this.logger.error(
            { event: 'admin.reindexAll.publish_failed', fileId: file.id, error: String(err) },
            'admin: reindexAll — failed to publish embed job for file',
          );
        }
      }

      this.logger.info(
        { event: 'admin.reindexAll.batch', batchSize: batch.length, totalQueued },
        'admin: reindexAll — batch processed',
      );

      // If the batch was smaller than batchSize we've reached the last page
      if (batch.length < batchSize) break;
    }

    this.logger.info({ event: 'admin.reindexAll.done', totalQueued }, 'admin: reindexAll completed');
    return { queued: totalQueued };
  }

  // ---------------------------------------------------------------------------
  // Files
  // ---------------------------------------------------------------------------

  /**
   * Returns a cursor-paginated list of all files in the system, optionally
   * filtered by embedding status.
   *
   * Used by the admin dashboard Files tab to monitor embedding progress
   * and inspect individual file states.
   *
   * @param params - Pagination cursor, page limit, and optional status filter.
   * @returns Paginated file list with total count and next cursor.
   */
  @Trace({ name: 'admin.getFiles' })
  async getFiles(
    params: AdminFilesQueryDto,
  ): Promise<AdminListResponseDto<AdminFileItemDto>> {
    const limit = params.limit ?? 50;

    // Build the optional where clause — no status filter = all statuses
    const where = params.status
      ? { status: params.status as FileStatus }
      : {};

    // Parallel: total count + one extra record to determine if another page exists
    const [total, rows] = await Promise.all([
      this.prisma.kmsFile.count({ where }),
      this.prisma.kmsFile.findMany({
        where,
        select: {
          id: true,
          userId: true,
          sourceId: true,
          name: true,
          mimeType: true,
          sizeBytes: true,
          status: true,
          indexedAt: true,
          createdAt: true,
        },
        take: limit + 1,
        ...(params.cursor
          ? { skip: 1, cursor: { id: params.cursor } }
          : {}),
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Determine next cursor (one extra record was fetched)
    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor = hasNext ? page[page.length - 1].id : null;

    // Batch-fetch user emails and source names to avoid N+1 queries
    const userIds = [...new Set(page.map((f) => f.userId))];
    const sourceIds = [...new Set(page.map((f) => f.sourceId))];

    const [users, sources] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true },
      }),
      this.prisma.kmsSource.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, name: true },
      }),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u.email]));
    const sourceMap = new Map(sources.map((s) => [s.id, s.name]));

    const data: AdminFileItemDto[] = page.map((file) => ({
      id: file.id,
      userId: file.userId,
      userEmail: userMap.get(file.userId) ?? null,
      sourceId: file.sourceId,
      sourceName: sourceMap.get(file.sourceId) ?? null,
      name: file.name,
      mimeType: file.mimeType,
      // BigInt must be coerced to Number before JSON serialisation
      sizeBytes: file.sizeBytes !== null ? Number(file.sizeBytes) : null,
      status: file.status,
      indexedAt: file.indexedAt?.toISOString() ?? null,
      createdAt: file.createdAt.toISOString(),
    }));

    this.logger.info(
      { event: 'admin.getFiles', total, returned: data.length, status: params.status ?? 'all' },
      'admin: get files',
    );

    return { data, nextCursor, total };
  }
}
