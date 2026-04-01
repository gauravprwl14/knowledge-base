import { ContentJob, ContentJobStatus, ContentPiece, ContentSourceType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Serialisable representation of a single content piece for API responses.
 * Mirrors the Prisma `ContentPiece` model but omits internal housekeeping fields.
 */
export class ContentPieceResponseDto {
  /** UUID of the piece. */
  @ApiProperty() id!: string;
  /** UUID of the parent job. */
  @ApiProperty() jobId!: string;
  /** Owning user UUID. */
  @ApiProperty() userId!: string;
  /** Target platform: 'linkedin', 'blog', 'instagram', etc. */
  @ApiProperty() platform!: string;
  /** Format within the platform: 'post', 'thread', 'carousel', etc. */
  @ApiProperty() format!: string;
  /** 0 = primary variation; ≥1 = on-demand variations. */
  @ApiProperty() variationIndex!: number;
  /** The generated content text. */
  @ApiProperty() content!: string;
  /** 'draft' | 'published' */
  @ApiProperty() status!: string;
  /** Whether this variation is the currently active one for its platform+format. */
  @ApiProperty() isActive!: boolean;
  /** Optimistic locking version — client must send this back on updates. */
  @ApiProperty() version!: number;
  /** Optional free-form metadata attached by the worker. */
  @ApiPropertyOptional() metadata?: unknown;
  /** Timestamp of the last manual edit, or null if never manually edited. */
  @ApiPropertyOptional() editedAt?: Date | null;
  /** Timestamp when this variation was published, or null. */
  @ApiPropertyOptional() publishedAt?: Date | null;
  /** Creation timestamp. */
  @ApiProperty() createdAt!: Date;
  /** Last update timestamp. */
  @ApiProperty() updatedAt!: Date;
}

/**
 * Full response shape for a content job including its generated pieces.
 *
 * Returned by `ContentJobsService.createJob`, `getJob`, and `listJobs`.
 * Contains all fields from the `ContentJob` model plus the nested pieces array.
 */
export class ContentJobResponseDto {
  /** UUID of the job. */
  @ApiProperty() id!: string;

  /** Owning user UUID. */
  @ApiProperty() userId!: string;

  /** Source type used for ingestion. */
  @ApiProperty({ enum: ContentSourceType }) sourceType!: ContentSourceType;

  /** URL of the source (YOUTUBE / URL source types). */
  @ApiPropertyOptional() sourceUrl?: string | null;

  /** UUID of the KMS file used as source (KMS_FILE / DOCUMENT / VIDEO). */
  @ApiPropertyOptional() sourceFileId?: string | null;

  /** Auto-extracted or user-provided title for the job. */
  @ApiPropertyOptional() title?: string | null;

  /** Current lifecycle status of the job. */
  @ApiProperty({ enum: ContentJobStatus }) status!: ContentJobStatus;

  /** Per-step status map — e.g. `{ "yt-ingest": "done", "concept-extractor": "in_progress" }`. */
  @ApiProperty() stepsJson!: unknown;

  /** Snapshot of the user's content configuration at job creation time. */
  @ApiProperty() configSnapshot!: unknown;

  /** Error message set when the job fails. */
  @ApiPropertyOptional() errorMessage?: string | null;

  /** Tags attached to the job. */
  @ApiProperty({ type: [String] }) tags!: string[];

  /** Timestamp when all steps completed (null while in progress). */
  @ApiPropertyOptional() completedAt?: Date | null;

  /** Job creation timestamp. */
  @ApiProperty() createdAt!: Date;

  /** Last update timestamp (used for stale job detection). */
  @ApiProperty() updatedAt!: Date;

  /** Generated content pieces, if any have been created yet. */
  @ApiProperty({ type: [ContentPieceResponseDto] }) pieces!: ContentPieceResponseDto[];
}

// ---------------------------------------------------------------------------
// Mapper helpers
// ---------------------------------------------------------------------------

/**
 * Maps a Prisma `ContentPiece` to the API response DTO.
 *
 * @param piece - Raw Prisma piece record.
 * @returns Serialisable piece response.
 */
export function mapPieceToDto(piece: ContentPiece): ContentPieceResponseDto {
  return {
    id: piece.id,
    jobId: piece.jobId,
    userId: piece.userId,
    platform: piece.platform,
    format: piece.format,
    variationIndex: piece.variationIndex,
    content: piece.content,
    status: piece.status,
    isActive: piece.isActive,
    version: piece.version,
    metadata: piece.metadata ?? undefined,
    editedAt: piece.editedAt,
    publishedAt: piece.publishedAt,
    createdAt: piece.createdAt,
    updatedAt: piece.updatedAt,
  };
}

/**
 * Maps a Prisma `ContentJob` (with optional nested pieces) to the API response DTO.
 *
 * @param job - Raw Prisma job record, optionally with `pieces` relation loaded.
 * @returns Serialisable job response including any pieces.
 */
export function mapJobToDto(
  job: ContentJob & { pieces?: ContentPiece[] },
): ContentJobResponseDto {
  return {
    id: job.id,
    userId: job.userId,
    sourceType: job.sourceType,
    sourceUrl: job.sourceUrl,
    sourceFileId: job.sourceFileId,
    title: job.title,
    status: job.status,
    stepsJson: job.stepsJson,
    configSnapshot: job.configSnapshot,
    errorMessage: job.errorMessage,
    tags: job.tags,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    pieces: (job.pieces ?? []).map(mapPieceToDto),
  };
}
