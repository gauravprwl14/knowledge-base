import { Injectable, Logger } from '@nestjs/common';
import { KeywordSearchService } from './services/keyword-search.service';
import { SemanticSearchService } from './services/semantic-search.service';
import { HybridSearchService } from './services/hybrid-search.service';
import { SearchQuery, SearchResponseDto, SearchResultDto } from './dto/search-query.dto';

/**
 * SearchService routes incoming search queries to the appropriate strategy
 * based on the `type` parameter:
 *
 * - `keyword`  — PostgreSQL full-text search via KeywordSearchService
 * - `semantic` — Qdrant ANN search via SemanticSearchService
 * - `hybrid`   — RRF merge of both via HybridSearchService (default)
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly keywordSearch: KeywordSearchService,
    private readonly semanticSearch: SemanticSearchService,
    private readonly hybridSearch: HybridSearchService,
  ) {}

  /**
   * Executes the search strategy indicated by `query.type` and wraps results
   * in a standardised SearchResponseDto.
   *
   * @param query - Validated search query DTO.
   * @returns SearchResponseDto with results, pagination metadata, and timing.
   */
  async search(query: SearchQuery): Promise<SearchResponseDto> {
    const start = Date.now();
    this.logger.log({ msg: 'search_start', query: query.q, type: query.type, user_id: query.user_id });

    let results: SearchResultDto[] = [];

    try {
      switch (query.type) {
        case 'keyword':
          results = await this.keywordSearch.search(query);
          break;
        case 'semantic':
          results = await this.semanticSearch.search(query);
          break;
        case 'hybrid':
        default:
          results = await this.hybridSearch.search(query);
          break;
      }
    } catch (err) {
      this.logger.error({
        msg: 'search_failed',
        type: query.type,
        query: query.q,
        error: err,
      });
      throw err;
    }

    const tookMs = Date.now() - start;
    this.logger.log({
      msg: 'search_complete',
      type: query.type,
      resultCount: results.length,
      tookMs,
    });

    return {
      results,
      total: results.length,
      limit: query.limit,
      offset: query.offset,
      query: query.q,
      type: query.type,
      tookMs,
    };
  }
}
