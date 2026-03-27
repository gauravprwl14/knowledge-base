import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { FileStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Trace } from '../../telemetry/decorators/trace.decorator';
import {
  AdminListResponseDto,
  AdminUserItemDto,
  AdminSourceItemDto,
  AdminScanJobItemDto,
  AdminFileItemDto,       // add this
} from './dto/admin-list-response.dto';
import { AdminStatsResponseDto } from './dto/admin-stats-response.dto';
import { AdminFilesQueryDto } from './dto/admin-files-query.dto';
import { EmbedJobPublisher } from '../../queue/publishers/embed-job.publisher';

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
  constructor(
    private readonly prisma: PrismaService,
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
   * Counts are computed with parallel Prisma queries (no Redis caching for MVP).
   *
   * @returns AdminStatsResponseDto with counters.
   */
  @Trace({ name: 'admin.getStats' })
  async getStats(): Promise<AdminStatsResponseDto> {
    this.logger.info({ event: 'admin.getStats' }, 'admin: get stats');

    const [
      totalUsers,
      totalSources,
      totalFiles,
      pendingEmbeds,
      processingEmbeds,
      failedFiles,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.kmsSource.count(),
      this.prisma.kmsFile.count(),
      this.prisma.kmsFile.count({ where: { status: FileStatus.PENDING } }),
      this.prisma.kmsFile.count({ where: { status: FileStatus.PROCESSING } }),
      this.prisma.kmsFile.count({ where: { status: FileStatus.ERROR } }),
    ]);

    return {
      totalUsers,
      totalSources,
      totalFiles,
      pendingEmbeds,
      processingEmbeds,
      failedFiles,
    };
  }

  // ---------------------------------------------------------------------------
  // Re-index all
  // ---------------------------------------------------------------------------

  /**
   * Publishes embed jobs for every file currently in PENDING or ERROR status.
   *
   * This is the recovery path when files exist in the DB but the kms.embed
   * queue is empty — e.g. after a broker restart, a failed scan run, or a
   * bulk Drive import that populated the DB without going through the queue.
   *
   * Files are fetched in pages of 200 and published in sequence to avoid
   * overwhelming the RabbitMQ broker.  The method returns a count of jobs
   * published rather than waiting for embeddings to complete (that is async).
   *
   * @returns Object with `queued` — number of embed jobs published.
   */
  @Trace({ name: 'admin.reindexAll' })
  async reindexAll(): Promise<{ queued: number }> {
    this.logger.info({ event: 'admin.reindexAll.start' }, 'admin: re-indexing all pending/error files');

    const PAGE_SIZE = 200;
    let cursor: string | undefined;
    let queued = 0;

    // Paginate through all PENDING/ERROR files and publish an embed job per file.
    // Using cursor pagination avoids loading all 15k+ records into memory at once.
    do {
      const page = await this.prisma.kmsFile.findMany({
        where: { status: { in: [FileStatus.PENDING, FileStatus.ERROR] } },
        select: {
          id: true,
          sourceId: true,
          userId: true,
          path: true,
          name: true,
          mimeType: true,
          sizeBytes: true,
          checksumSha256: true,
          source: { select: { type: true } },
        },
        take: PAGE_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });

      if (page.length === 0) break;

      for (const file of page) {
        await this.embedJobPublisher.publishEmbedJob({
          scan_job_id: file.id,
          source_id: file.sourceId,
          user_id: file.userId,
          file_path: file.path ?? '',
          original_filename: file.name ?? file.id,
          mime_type: file.mimeType ?? undefined,
          // BigInt sizeBytes must be coerced to Number for JSON serialisation
          file_size_bytes: file.sizeBytes ? Number(file.sizeBytes) : undefined,
          checksum_sha256: file.checksumSha256 ?? undefined,
          source_type: file.source?.type ?? 'unknown',
        });
        queued++;
      }

      cursor = page[page.length - 1].id;
    } while (true);

    this.logger.info(
      { event: 'admin.reindexAll.done', queued },
      `admin: published ${queued} embed jobs`,
    );

    return { queued };
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
