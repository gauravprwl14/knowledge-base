import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * AdminFilesQueryDto — query parameters for GET /admin/files.
 *
 * Supports cursor-based pagination and an optional status filter so the
 * admin dashboard can view files by embedding state.
 */
export class AdminFilesQueryDto {
  /** Opaque pagination cursor returned by the previous response. */
  @ApiPropertyOptional({ description: 'Pagination cursor from previous response' })
  @IsOptional()
  @IsString()
  cursor?: string;

  /** Number of records per page (1–100, default 50). */
  @ApiPropertyOptional({ description: 'Records per page (1–100)', default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  /**
   * Filter by file status. Accepted values: PENDING, PROCESSING, INDEXED,
   * ERROR, DELETED. Leave unset to return files of any status.
   */
  @ApiPropertyOptional({
    description: 'Filter files by status (PENDING | PROCESSING | INDEXED | ERROR | DELETED)',
    example: 'PENDING',
  })
  @IsOptional()
  @IsString()
  status?: string;
}
