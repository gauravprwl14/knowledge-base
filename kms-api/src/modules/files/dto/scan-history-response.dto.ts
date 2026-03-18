import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Summary of a single scan job for use in scan history listings.
 *
 * Intentionally excludes internal fields (e.g. raw errorMsg duplicate column)
 * and exposes only what the UI needs to render a scan history timeline.
 */
export class ScanJobSummaryDto {
  /** Scan job UUID */
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  /** Current job status */
  @ApiProperty({ enum: ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] })
  status!: string;

  /** Scan type: FULL or INCREMENTAL */
  @ApiProperty({ enum: ['FULL', 'INCREMENTAL'] })
  scanType!: string;

  /** Number of files discovered during the scan */
  @ApiPropertyOptional({ example: 42 })
  filesDiscovered?: number;

  /** Error message if the job failed */
  @ApiPropertyOptional({ example: 'Connection refused' })
  errorMessage?: string | null;

  /** Timestamp when the job transitioned to RUNNING */
  @ApiPropertyOptional()
  startedAt?: Date | null;

  /** Timestamp when the job completed or failed */
  @ApiPropertyOptional()
  finishedAt?: Date | null;

  /** Timestamp when the job record was created (= queued time) */
  @ApiProperty()
  createdAt!: Date;
}

/**
 * Response envelope for the scan history endpoint.
 */
export class ScanHistoryResponseDto {
  /** Array of scan job summaries, newest first */
  @ApiProperty({ type: [ScanJobSummaryDto] })
  items!: ScanJobSummaryDto[];
}
