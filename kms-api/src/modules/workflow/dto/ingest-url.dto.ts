import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUrl, IsOptional } from 'class-validator';

/**
 * DTO for submitting a URL for asynchronous ingestion into the KMS knowledge base.
 *
 * Accepted URL types:
 * - YouTube video URLs (content extracted via transcript API)
 * - General web page URLs (content extracted via scraping)
 */
export class IngestUrlDto {
  /**
   * The fully-qualified URL to ingest.
   * WorkflowProcessor will detect whether it is a YouTube or general web URL.
   */
  @ApiProperty({
    description: 'URL to ingest (YouTube or web page)',
    example: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
  })
  @IsUrl()
  url: string;

  /**
   * Optional collection ID to associate the ingested content with a specific
   * KMS collection. When omitted the content lands in the default workspace.
   */
  @ApiPropertyOptional({
    description: 'Collection ID to associate this content with',
    example: 'clxyz1234abcd',
  })
  @IsOptional()
  @IsString()
  collectionId?: string;
}

/**
 * Response DTO returned immediately after a URL is accepted for ingestion.
 * Processing happens asynchronously — poll GET /workflow/jobs/:jobId for status.
 */
export class WorkflowJobDto {
  /** Unique identifier for this workflow job (UUID v4). */
  @ApiProperty({ description: 'Unique job identifier (UUID v4)' })
  jobId: string;

  /** The URL that was submitted for ingestion. */
  @ApiProperty({ description: 'URL submitted for ingestion' })
  url: string;

  /**
   * Current lifecycle status of the job.
   * - `queued`     — accepted, waiting for async processing
   * - `processing` — actively being processed by WorkflowProcessor
   * - `completed`  — content extracted, summarised, and stored
   * - `failed`     — processing failed after error
   * - `not_found`  — job ID is unknown or expired
   */
  @ApiProperty({ enum: ['queued', 'processing', 'completed', 'failed', 'not_found'] })
  status: string;

  /** ISO-8601 timestamp when the job was enqueued. */
  @ApiProperty({ description: 'ISO-8601 timestamp when the job was enqueued' })
  queuedAt: string;
}
