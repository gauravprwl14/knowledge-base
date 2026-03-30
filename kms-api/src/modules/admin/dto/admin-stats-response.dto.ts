import { ApiProperty } from '@nestjs/swagger';

/**
 * AdminStatsResponseDto — system-wide counters returned by GET /admin/stats.
 */
export class AdminStatsResponseDto {
  /** Total number of registered users. */
  @ApiProperty({ description: 'Total registered users' })
  totalUsers: number;

  /** Total number of knowledge sources (across all users). */
  @ApiProperty({ description: 'Total knowledge sources' })
  totalSources: number;

  /** Total number of indexed files (across all users). */
  @ApiProperty({ description: 'Total indexed files' })
  totalFiles: number;

  /** Number of files with PENDING embedding status. */
  @ApiProperty({ description: 'Files awaiting embedding' })
  pendingEmbeds: number;

  /** Number of files currently being embedded (PROCESSING status). */
  @ApiProperty({ description: 'Files currently being embedded' })
  processingEmbeds: number;

  /** Number of files in ERROR status. */
  @ApiProperty({ description: 'Files in error state' })
  failedFiles: number;

  /** Sum of sizeBytes across all non-deleted files, in bytes. */
  @ApiProperty({ description: 'Total storage used across all files, in bytes' })
  storageUsageBytes: number;
}
