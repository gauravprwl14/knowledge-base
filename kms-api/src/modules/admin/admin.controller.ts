import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
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
import {
  AdminListResponseDto,
  AdminUserItemDto,
  AdminSourceItemDto,
  AdminScanJobItemDto,
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
  // Reindex All
  // ---------------------------------------------------------------------------

  /**
   * Re-queues all files with status ERROR or PENDING across all users for
   * re-embedding.
   *
   * Cursor-paginates through the `kms_files` table in batches of 100, deletes
   * existing `kms_chunks` for each file, resets their status to PENDING, and
   * publishes an embed job message to the `kms.embed` RabbitMQ queue.
   *
   * This endpoint is intentionally synchronous from the caller's perspective —
   * it does not return until all pages are processed.  For very large tables
   * (millions of files) this will be slow; callers should fire-and-forget and
   * watch the admin stats endpoint for the pending count to drop.
   *
   * @returns `{ queued: N }` where N is the number of files successfully queued.
   */
  @Post('reindex-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-queue all ERROR/PENDING files for re-embedding (admin only)' })
  @ApiResponse({ status: 200, description: 'Files queued for re-indexing' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — ADMIN role required (KBAUT0010)' })
  async reindexAll(): Promise<{ queued: number }> {
    return this.adminService.reindexAll();
  }
}
