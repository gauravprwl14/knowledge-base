import { Controller, Get, Query, UsePipes } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchQuery, searchQuerySchema, SearchResponseDto } from './dto/search-query.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Throttle } from '@nestjs/throttler';

/**
 * SearchController exposes the unified search endpoint for the knowledge base.
 *
 * All three search modes (keyword, semantic, hybrid) are handled by a single
 * GET /search route; the `type` query param selects the strategy. The
 * `user_id` param is required for multi-tenancy — every query is scoped to
 * the owning user's data in both PostgreSQL and Qdrant.
 */
@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * Searches the knowledge base using the specified strategy.
   *
   * @param query - Validated search query parameters.
   * @returns Ranked search results with pagination metadata and timing.
   */
  @Get()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Search the knowledge base' })
  @ApiQuery({ name: 'q', description: 'Search query', required: true })
  @ApiQuery({
    name: 'type',
    enum: ['keyword', 'semantic', 'hybrid'],
    required: false,
    description: 'Search strategy (default: hybrid)',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max results (default: 20, max: 100)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Pagination offset (default: 0)' })
  @ApiQuery({
    name: 'user_id',
    required: true,
    type: String,
    description: 'User ID — required for multi-tenancy filtering in Qdrant and PostgreSQL',
  })
  @ApiQuery({
    name: 'collection_ids',
    required: false,
    isArray: true,
    type: String,
    description: 'Optional collection UUIDs to restrict the search scope',
  })
  @ApiResponse({ status: 200, type: SearchResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error — missing or invalid query params' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @UsePipes(new ZodValidationPipe(searchQuerySchema))
  async search(@Query() query: SearchQuery): Promise<SearchResponseDto> {
    return this.searchService.search(query);
  }
}
