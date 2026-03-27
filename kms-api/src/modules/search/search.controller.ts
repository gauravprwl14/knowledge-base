import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { SearchService, SearchType } from './search.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * SearchController proxies hybrid search requests to the `search-api`
 * microservice (port 8001).
 *
 * Supports three search modes:
 * - `keyword`  — BM25 full-text search via PostgreSQL
 * - `semantic` — Dense vector search via Qdrant (BGE-M3 embeddings)
 * - `hybrid`   — Reciprocal Rank Fusion of keyword + semantic results
 *
 * All routes require a valid JWT access token.
 */
@ApiTags('Search')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * Executes a search across the knowledge base.
   *
   * @param q - The search query string.
   * @param type - Search mode: `keyword`, `semantic`, or `hybrid`.
   * @param limit - Maximum number of results to return.
   * @param offset - Number of results to skip (for pagination).
   * @returns JSON response from the search-api service.
   */
  @Get()
  @ApiOperation({ summary: 'Search the knowledge base' })
  @ApiQuery({ name: 'q', type: String, required: true, description: 'Search query' })
  @ApiQuery({
    name: 'type',
    enum: ['keyword', 'semantic', 'hybrid'],
    required: false,
    description: 'Search strategy (default: hybrid)',
  })
  @ApiQuery({ name: 'limit', type: Number, required: false, description: 'Max results (default: 10)' })
  @ApiQuery({ name: 'offset', type: Number, required: false, description: 'Pagination offset (default: 0)' })
  @ApiResponse({ status: 200, description: 'Search results returned successfully' })
  @ApiResponse({ status: 400, description: 'Missing or invalid query parameter' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 502, description: 'Search service unavailable' })
  search(
    @Query('q') q: string,
    @Request() req: any,
    @Query('type') type?: SearchType,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.searchService.search({ q, type, limit, offset }, req.user.id);
  }
}
