import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * AdminSourcesQueryDto — validated query parameters for GET /admin/sources.
 *
 * Cursor-based pagination: pass `cursor` from the previous page's `nextCursor`.
 */
export class AdminSourcesQueryDto {
  /** Opaque cursor from the previous page's `nextCursor` field. */
  @ApiPropertyOptional({ description: 'Cursor for pagination (nextCursor from previous page)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  /** Maximum number of records to return per page. Defaults to 50. */
  @ApiPropertyOptional({ description: 'Page size (1-100)', default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}
