import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import { AdminSourcesQueryDto } from './dto/admin-sources-query.dto';
import { AdminFilesQueryDto } from './dto/admin-files-query.dto';
import {
  AdminListResponseDto,
  AdminUserItemDto,
  AdminSourceItemDto,
  AdminScanJobItemDto,
  AdminFileItemDto,
} from './dto/admin-list-response.dto';
import { AdminStatsResponseDto } from './dto/admin-stats-response.dto';

/**
 * AdminController — system-wide admin endpoints for the KMS admin dashboard.
 *
 * All routes require a valid JWT access token AND ADMIN role.
 * Non-ADMIN users receive HTTP 403 with error code KBAUT0010.
 *
 * @example Routes:
 * - GET /api/v1/admin/stats      — system-wide counters
 * - GET /api/v1/admin/users      — paginated list of all users
 * - GET /api/v1/admin/sources    — paginated list of all sources
 * - GET /api/v1/admin/scan-jobs  — most recent 200 scan jobs
 */
@ApiTags('Admin')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  /**
   * Returns system-wide aggregate counters.
   *
   * @returns AdminStatsResponseDto with totalUsers, totalSources, totalFiles, and embed counts.
   */
  @Get('stats')
  @ApiOperation({ summary: 'Get system-wide statistics (admin only)' })
  @ApiResponse({ status: 200, description: 'System stats', type: AdminStatsResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — ADMIN role required (KBAUT0010)' })
  async getStats(): Promise<AdminStatsResponseDto> {
    return this.adminService.getStats();
  }

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------

  /**
   * Returns a cursor-paginated list of all registered users.
   *
   * @param query - Optional cursor and limit for pagination.
   * @returns Paginated user list.
   */
  @Get('users')
  @ApiOperation({ summary: 'List all users with cursor pagination (admin only)' })
  @ApiResponse({ status: 200, description: 'Paginated users', type: AdminListResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — ADMIN role required (KBAUT0010)' })
  async getUsers(
    @Query() query: AdminUsersQueryDto,
  ): Promise<AdminListResponseDto<AdminUserItemDto>> {
    return this.adminService.getUsers({
      cursor: query.cursor,
      limit: query.limit ?? 50,
    });
  }

  // ---------------------------------------------------------------------------
  // Sources
  // ---------------------------------------------------------------------------

  /**
   * Returns a cursor-paginated list of all knowledge sources across all users.
   *
   * @param query - Optional cursor and limit for pagination.
   * @returns Paginated source list with user email.
   */
  @Get('sources')
  @ApiOperation({ summary: 'List all sources with cursor pagination (admin only)' })
  @ApiResponse({ status: 200, description: 'Paginated sources', type: AdminListResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — ADMIN role required (KBAUT0010)' })
  async getSources(
    @Query() query: AdminSourcesQueryDto,
  ): Promise<AdminListResponseDto<AdminSourceItemDto>> {
    return this.adminService.getSources({
      cursor: query.cursor,
      limit: query.limit ?? 50,
    });
  }

  // ---------------------------------------------------------------------------
  // Scan Jobs
  // ---------------------------------------------------------------------------

  /**
   * Returns the most recent 200 scan jobs across all users.
   *
   * @returns List of scan jobs (not paginated — fixed limit of 200).
   */
  @Get('scan-jobs')
  @ApiOperation({ summary: 'List most recent 200 scan jobs across all users (admin only)' })
  @ApiResponse({ status: 200, description: 'Recent scan jobs', type: AdminListResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — ADMIN role required (KBAUT0010)' })
  async getScanJobs(): Promise<AdminListResponseDto<AdminScanJobItemDto>> {
    return this.adminService.getScanJobs();
  }

  // ---------------------------------------------------------------------------
  // Re-index all
  // ---------------------------------------------------------------------------

  /**
   * Publishes embed jobs for every PENDING or ERROR file in the system.
   *
   * Recovery endpoint for when files are in the DB but the kms.embed queue
   * is empty — i.e. the embed-worker is running but has nothing to process.
   *
   * @returns `{ queued: number }` — count of embed jobs published to the queue.
   */
  @Post('reindex-all')
  @ApiOperation({ summary: 'Re-queue all PENDING/ERROR files for embedding (admin only)' })
  @ApiResponse({ status: 201, description: 'Jobs queued', schema: { example: { queued: 15488 } } })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — ADMIN role required (KBAUT0010)' })
  async reindexAll(): Promise<{ queued: number }> {
    return this.adminService.reindexAll();
  }

  // ---------------------------------------------------------------------------
  // Files
  // ---------------------------------------------------------------------------

  /**
   * Returns a cursor-paginated list of all files, optionally filtered by status.
   *
   * Used by the admin dashboard Files tab. Returns files across ALL users.
   *
   * @param query - Pagination cursor, limit, and optional status filter.
   * @returns Paginated file list.
   */
  @Get('files')
  @ApiOperation({ summary: 'List all files with cursor pagination and optional status filter (admin only)' })
  @ApiResponse({ status: 200, description: 'Paginated file list', type: AdminListResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — ADMIN role required (KBAUT0010)' })
  async getFiles(
    @Query() query: AdminFilesQueryDto,
  ): Promise<AdminListResponseDto<AdminFileItemDto>> {
    return this.adminService.getFiles(query);
  }
}
