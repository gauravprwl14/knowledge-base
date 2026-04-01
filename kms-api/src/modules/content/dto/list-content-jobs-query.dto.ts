import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ContentJobStatus, ContentSourceType } from '@prisma/client';

/**
 * Query parameters for listing content jobs.
 *
 * Supports optional filtering by status and source type, plus cursor-based
 * pagination. All queries are automatically scoped to the authenticated user —
 * it is never possible to list another user's jobs via these params.
 */
export class ListContentJobsQueryDto {
  /**
   * Optional: filter jobs to this lifecycle status.
   * Corresponds to the `ContentJobStatus` Prisma enum.
   */
  @ApiPropertyOptional({
    enum: ContentJobStatus,
    description: 'Filter by job lifecycle status',
    example: 'DONE',
  })
  @IsOptional()
  @IsEnum(ContentJobStatus)
  status?: ContentJobStatus;

  /**
   * Optional: filter jobs to this source type.
   * Corresponds to the `ContentSourceType` Prisma enum.
   */
  @ApiPropertyOptional({
    enum: ContentSourceType,
    description: 'Filter by source type',
    example: 'YOUTUBE',
  })
  @IsOptional()
  @IsEnum(ContentSourceType)
  sourceType?: ContentSourceType;

  /**
   * Pagination cursor returned by the previous page.
   * Base64-encoded `createdAt` ISO string of the last item in the previous page.
   */
  @ApiPropertyOptional({
    description: 'Cursor from the previous page (base64-encoded createdAt)',
    example: 'MjAyNi0wMy0zMVQxMjowMDowMC4wMDBa',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  /**
   * Number of jobs to return per page. Defaults to 20, maximum 50.
   * Uses `@Type(() => Number)` so query-string values are coerced to integers.
   */
  @ApiPropertyOptional({
    description: 'Page size (1–50, default 20)',
    minimum: 1,
    maximum: 50,
    default: 20,
    example: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number = 20;
}
