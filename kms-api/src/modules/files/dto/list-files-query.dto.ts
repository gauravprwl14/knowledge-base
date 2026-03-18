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
  @IsOptional()
  @IsString()
  cursor?: string;

  /** Number of items per page. Default 50, maximum 200. */
  @ApiPropertyOptional({ description: 'Page size (default: 50, max: 200)', example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
