<<<<<<< HEAD
import { IsOptional, IsString, IsInt, IsIn, Min, Max, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Valid MIME group filter values. */
export const VALID_MIME_GROUPS = ['documents', 'images', 'audio', 'video', 'data'] as const;
export type MimeGroup = (typeof VALID_MIME_GROUPS)[number];

/**
 * Query parameters for `GET /files`.
 *
 * Supports cursor-based pagination, MIME group filtering, status filtering,
 * and source scoping. All fields are optional.
 */
export class ListFilesQueryDto {
  /** Filter files belonging to a specific source UUID. */
  @ApiPropertyOptional({ description: 'Filter by source UUID', example: 'uuid-here' })
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  /** Filter by processing status. */
  @ApiPropertyOptional({
    description: 'Filter by file status',
    enum: ['PENDING', 'PROCESSING', 'INDEXED', 'ERROR'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'PROCESSING', 'INDEXED', 'ERROR'])
  status?: string;

  /**
   * Filter by MIME group.
   * Mapped to a list of concrete MIME types in the repository layer.
   */
  @ApiPropertyOptional({
    description: 'Filter by MIME group',
    enum: VALID_MIME_GROUPS,
  })
  @IsOptional()
  @IsString()
  @IsIn(VALID_MIME_GROUPS)
  mimeGroup?: MimeGroup;

  /**
   * Opaque cursor (file UUID) from a previous page response.
   * Pass `nextCursor` from the last response to retrieve the next page.
   */
  @ApiPropertyOptional({ description: 'Cursor from previous page (nextCursor)' })
=======
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, IsArray, Min, Max, IsEnum, IsUUID } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { FileStatus } from '@prisma/client';

/**
 * ListFilesQueryDto — validated query parameters for GET /files.
 *
 * All fields are optional. Cursor-based pagination is used; pass the
 * `cursor` returned by a previous page to fetch the next slice.
 */
export class ListFilesQueryDto {
  /** Opaque cursor from the previous page's `nextCursor` field. */
  @ApiPropertyOptional({ description: 'Cursor for pagination (nextCursor from previous page)' })
>>>>>>> feat/drive-backend
  @IsOptional()
  @IsString()
  cursor?: string;

<<<<<<< HEAD
  /** Number of items per page. Default 50, maximum 200. */
  @ApiPropertyOptional({ description: 'Page size (default: 50, max: 200)', example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
=======
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
>>>>>>> feat/drive-backend
}
