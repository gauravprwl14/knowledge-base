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
} from './dto/admin-list-response.dto';
import { AdminStatsResponseDto } from './dto/admin-stats-response.dto';

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
}
