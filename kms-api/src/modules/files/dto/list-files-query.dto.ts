import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, IsArray, Min, Max, IsEnum, IsUUID, IsIn } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { FileStatus } from '@prisma/client';

/**
 * Embedding status values exposed in the API response.
 * Derived from the underlying FileStatus enum — no extra DB column required.
 *
 * Mapping:
 *   PENDING       → "pending"
 *   PROCESSING    → "processing"
 *   INDEXED       → "embedded"
 *   ERROR         → "failed"
 *   UNSUPPORTED   → "unsupported"
 *   DELETED       → "deleted"
 */
export type EmbeddingStatus = 'pending' | 'processing' | 'embedded' | 'failed' | 'unsupported' | 'deleted';

/**
 * Maps an EmbeddingStatus filter value to the underlying FileStatus enum value
 * used in database queries.
 */
export const EMBEDDING_STATUS_TO_FILE_STATUS: Record<EmbeddingStatus, FileStatus> = {
  pending: FileStatus.PENDING,
  processing: FileStatus.PROCESSING,
  embedded: FileStatus.INDEXED,
  failed: FileStatus.ERROR,
  unsupported: FileStatus.UNSUPPORTED,
  deleted: FileStatus.DELETED,
} as const;

/**
 * Maps a FileStatus enum value to the derived EmbeddingStatus string exposed
 * in the API response.
 */
export const FILE_STATUS_TO_EMBEDDING_STATUS: Record<FileStatus, EmbeddingStatus> = {
  [FileStatus.PENDING]: 'pending',
  [FileStatus.PROCESSING]: 'processing',
  [FileStatus.INDEXED]: 'embedded',
  [FileStatus.ERROR]: 'failed',
  [FileStatus.UNSUPPORTED]: 'unsupported',
  [FileStatus.DELETED]: 'deleted',
} as const;

/** Sortable column names accepted by GET /files. Must match Prisma KmsFile field names. */
export type FilesSortBy = 'createdAt' | 'updatedAt' | 'name' | 'sizeBytes';
/** Sort direction accepted by GET /files. */
export type FilesSortDir = 'asc' | 'desc';

/**
 * ListFilesQueryDto — validated query parameters for GET /files.
 *
 * All fields are optional. Cursor-based pagination is used; pass the
 * `cursor` returned by a previous page to fetch the next slice.
 */
export class ListFilesQueryDto {
  /** Opaque cursor from the previous page's `nextCursor` field. */
  @ApiPropertyOptional({ description: 'Cursor for pagination (nextCursor from previous page)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  /** Maximum number of records to return per page. Defaults to 20. */
  @ApiPropertyOptional({ description: 'Page size (1-100)', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  /** Filter to files from a specific source. */
  @ApiPropertyOptional({ description: 'Filter by source UUID' })
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  /** Filter by MIME type prefix, e.g. "image/" or "application/pdf". */
  @ApiPropertyOptional({ description: 'Filter by MIME group prefix (e.g. "image/")' })
  @IsOptional()
  @IsString()
  mimeGroup?: string;

  /** Filter by file processing status. */
  @ApiPropertyOptional({ enum: FileStatus, description: 'Filter by file status' })
  @IsOptional()
  @IsEnum(FileStatus)
  status?: FileStatus;

  /** Filter to files belonging to a specific collection. */
  @ApiPropertyOptional({ description: 'Filter by collection UUID' })
  @IsOptional()
  @IsUUID()
  collectionId?: string;

  /**
   * Filter files that have at least one of the specified tag names.
   * Passed as repeated query params: `?tags=design&tags=notes`.
   */
  @ApiPropertyOptional({ type: [String], description: 'Filter by tag names' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  tags?: string[];

  /** Case-insensitive substring search on the file name. */
  @ApiPropertyOptional({ description: 'Search within filename (case-insensitive)' })
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Filter by embedding status (FR-13).
   * Maps to the underlying `FileStatus` column:
   *   pending→PENDING, processing→PROCESSING, embedded→INDEXED,
   *   failed→ERROR, unsupported→UNSUPPORTED, deleted→DELETED.
   *
   * When both `status` and `embeddingStatus` are supplied, `embeddingStatus`
   * takes precedence and `status` is ignored.
   */
  @ApiPropertyOptional({
    enum: ['pending', 'processing', 'embedded', 'failed', 'unsupported', 'deleted'],
    description: 'Filter by derived embedding status (maps to FileStatus column)',
  })
  @IsOptional()
  @IsIn(['pending', 'processing', 'embedded', 'failed', 'unsupported', 'deleted'])
  embeddingStatus?: EmbeddingStatus;

  /** Column to sort by. Defaults to createdAt. */
  @ApiPropertyOptional({ enum: ['createdAt', 'updatedAt', 'name', 'sizeBytes'], description: 'Sort column' })
  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'name', 'sizeBytes'])
  sortBy?: FilesSortBy;

  /** Sort direction. Defaults to desc. */
  @ApiPropertyOptional({ enum: ['asc', 'desc'], description: 'Sort direction' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: FilesSortDir;
}
