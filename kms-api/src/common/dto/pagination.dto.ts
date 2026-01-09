import { ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import { PAGINATION } from '../../config/constants/app.constants';

/**
 * Pagination query DTO schema
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(PAGINATION.MIN_LIMIT)
    .max(PAGINATION.MAX_LIMIT)
    .default(PAGINATION.DEFAULT_LIMIT)
    .optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
});

export type PaginationQueryDto = z.infer<typeof paginationQuerySchema>;

/**
 * Pagination query class for Swagger documentation
 */
export class PaginationQuery {
  @ApiPropertyOptional({
    description: 'Page number',
    minimum: 1,
    default: 1,
    example: 1,
  })
  page?: number;

  @ApiPropertyOptional({
    description: 'Items per page',
    minimum: 1,
    maximum: 100,
    default: 10,
    example: 10,
  })
  limit?: number;

  @ApiPropertyOptional({
    description: 'Sort field',
    example: 'createdAt',
  })
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['asc', 'desc'],
    default: 'desc',
    example: 'desc',
  })
  sortOrder?: 'asc' | 'desc';
}

/**
 * Pagination meta response schema
 */
export const paginationMetaSchema = z.object({
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

/**
 * Pagination meta class for Swagger documentation
 */
export class PaginationMetaDto {
  @ApiPropertyOptional({ description: 'Total items', example: 100 })
  total: number;

  @ApiPropertyOptional({ description: 'Current page', example: 1 })
  page: number;

  @ApiPropertyOptional({ description: 'Items per page', example: 10 })
  limit: number;

  @ApiPropertyOptional({ description: 'Total pages', example: 10 })
  totalPages: number;

  @ApiPropertyOptional({ description: 'Has next page', example: true })
  hasNextPage: boolean;

  @ApiPropertyOptional({ description: 'Has previous page', example: false })
  hasPreviousPage: boolean;
}
