import {
  Controller,
  Get,
  Post,
  Query,
  Headers,
  HttpStatus,
  HttpCode,
  BadRequestException,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchResponseDto } from './dto/search-result.dto';
import { AppError, ERROR_CODES } from '../errors/app-error';

/**
 * SearchController — exposes `GET /api/v1/search` for the search-api.
 *
 * Authentication is **not** enforced here; the kms-api gateway is responsible
 * for JWT verification.  The gateway must forward the authenticated user's
 * UUID in the `x-user-id` header.
 *
 * @example
 * ```http
 * GET /api/v1/search?q=machine+learning&mode=hybrid&limit=20
 * x-user-id: 550e8400-e29b-41d4-a716-446655440000
 * ```
 */
@ApiTags('Search')
@Controller()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * Executes a search query across the knowledge base.
   *
   * @param q - The raw search query string (required, min 1 char).
   * @param userId - User UUID forwarded by the gateway via `x-user-id`.
   * @param limit - Maximum results to return (1–100, default 20).
   * @param offset - Pagination offset (default 0).
   * @param mode - Search strategy: `keyword`, `semantic`, or `hybrid` (default).
   * @param sourceIds - Optional comma-separated source UUIDs to filter by.
   * @returns A {@link SearchResponseDto} with ranked results, total, and timing.
   */
  @Get('search')
  @ApiOperation({
    summary: 'Hybrid knowledge-base search',
    description:
      'Executes keyword (PostgreSQL FTS), semantic (Qdrant ANN), or hybrid ' +
      '(RRF-fused) search over the authenticated user\'s knowledge base.',
  })
  @ApiHeader({
    name: 'x-user-id',
    required: true,
    description: 'Authenticated user UUID — injected by the kms-api gateway',
  })
  @ApiQuery({ name: 'q', type: String, required: true, description: 'Search query string' })
  @ApiQuery({
    name: 'mode',
    enum: ['keyword', 'semantic', 'hybrid'],
    required: false,
    description: 'Search strategy (default: hybrid)',
  })
  @ApiQuery({
    name: 'limit',
    type: Number,
    required: false,
    description: 'Max results (1–100, default: 20)',
  })
  @ApiQuery({
    name: 'offset',
    type: Number,
    required: false,
    description: 'Pagination offset (default: 0)',
  })
  @ApiQuery({
    name: 'sourceIds',
    type: [String],
    required: false,
    description: 'Filter by source UUIDs',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Search results returned successfully',
    type: SearchResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Missing or invalid query parameters',
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Search backend error',
  })
  async search(
    @Query('q') q: string,
    @Headers('x-user-id') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('mode') mode?: 'keyword' | 'semantic' | 'hybrid',
    @Query('sourceIds') sourceIds?: string | string[],
  ): Promise<SearchResponseDto> {
    if (!userId) {
      throw new AppError({
        code: ERROR_CODES.SCH.INVALID_QUERY.code,
        message: 'x-user-id header is required',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }

    if (!q || q.trim().length === 0) {
      throw new AppError({
        code: ERROR_CODES.SCH.QUERY_REQUIRED.code,
      });
    }

    // Normalise sourceIds — NestJS may give us a single string or an array
    const normalizedSourceIds = sourceIds
      ? Array.isArray(sourceIds)
        ? sourceIds
        : [sourceIds]
      : undefined;

    const dto = new SearchQueryDto();
    dto.q = q.trim();
    dto.userId = userId;
    dto.limit = limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100) : 20;
    dto.offset = offset ? Math.max(parseInt(offset, 10) || 0, 0) : 0;
    dto.mode = mode ?? 'hybrid';
    dto.sourceIds = normalizedSourceIds;

    return this.searchService.search(dto);
  }

  /**
   * Inserts mock KMS documents into PostgreSQL for development/testing.
   *
   * Only available when `NODE_ENV !== 'production'`. Calling this endpoint
   * in production returns HTTP 501. The operation is idempotent — re-seeding
   * does not create duplicate rows (upsert on `source_id + external_id`).
   *
   * After seeding, run `GET /search?q=<term>&x-user-id=00000000-0000-0000-0000-000000000099`
   * to verify keyword search returns results without needing a real scan pipeline.
   *
   * @returns The number of rows upserted.
   */
  @Post('seed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Seed mock documents for dev/test (non-production only)',
    description:
      'Inserts 10 mock KMS documents into kms_files with extracted_text populated ' +
      'so PostgreSQL FTS queries return results in local development. ' +
      'Idempotent — safe to call multiple times.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Seed completed',
    schema: {
      type: 'object',
      properties: { seeded: { type: 'number', example: 10 } },
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_IMPLEMENTED,
    description: 'Seed endpoint is disabled in production',
  })
  async seed(): Promise<{ seeded: number }> {
    // Guard: seed endpoint must never run in production to avoid polluting real data
    if (process.env.NODE_ENV === 'production') {
      throw new AppError({
        code: ERROR_CODES.GEN.NOT_IMPLEMENTED.code,
        message: 'Seed endpoint is not available in production',
      });
    }
    return this.searchService.seedMockData();
  }
}
