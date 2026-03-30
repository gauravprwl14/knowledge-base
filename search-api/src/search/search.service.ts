import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { Bm25Service } from "./bm25.service";
import { SemanticService } from "./semantic.service";
import { RrfService } from "./rrf.service";
import { SearchRequestDto, SearchType } from "./dto/search-request.dto";
import { SearchResponseDto, SearchResult } from "./dto/search-response.dto";

/**
 * SearchService orchestrates the three-stage hybrid search pipeline:
 *
 * 1. **BM25** — PostgreSQL full-text search (keyword recall)
 * 2. **Semantic** — Qdrant ANN vector search (semantic recall)
 * 3. **RRF** — Reciprocal Rank Fusion merges both lists into a single ranking
 *
 * Each stage can be bypassed by setting `searchType` to 'keyword' or 'semantic'.
 * For 'hybrid' (default) both stages run in parallel via `Promise.all`.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly bm25: Bm25Service,
    private readonly semantic: SemanticService,
    private readonly rrf: RrfService,
    @InjectPinoLogger(SearchService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Executes a search request and returns a ranked, fused response.
   *
   * @param dto    - Validated search request (query, limit, searchType, sourceIds)
   * @param userId - Caller user ID extracted from x-user-id header
   * @returns SearchResponseDto with ranked results, total, searchType, and took (ms)
   * @throws HttpException(400) if the query is empty after trimming
   * @throws HttpException(500) if an underlying search stage fails unexpectedly
   */
  async search(
    dto: SearchRequestDto,
    userId: string,
  ): Promise<SearchResponseDto> {
    // Guard: ensure the query contains meaningful content after whitespace trim
    const query = dto.query.trim();
    if (!query) {
      throw new HttpException(
        "Search query must not be empty",
        HttpStatus.BAD_REQUEST,
      );
    }

    // Resolve effective limit — caller may omit it, default is 10 capped at 50
    const limit = Math.min(dto.limit ?? 10, 50);
    const searchType = dto.searchType ?? SearchType.HYBRID;

    // Start wall-clock timer for the `took` field in the response
    const startedAt = Date.now();

    let results: SearchResult[];

    try {
      // Dispatch to the appropriate search stage(s) based on searchType
      if (searchType === SearchType.KEYWORD) {
        // Keyword-only path: run BM25 and skip RRF (single list, no fusion needed)
        const bm25Results = await this.bm25.search(
          query,
          userId,
          limit,
          dto.sourceIds,
        );
        results = bm25Results;
      } else if (searchType === SearchType.SEMANTIC) {
        // Semantic-only path: run vector search and skip RRF
        const semanticResults = await this.semantic.search(
          query,
          userId,
          limit,
          dto.sourceIds,
        );
        results = semanticResults;
      } else {
        // Hybrid path: run both stages in parallel, then fuse with RRF
        // Using Promise.all ensures BM25 and semantic latencies overlap
        const [bm25Results, semanticResults] = await Promise.all([
          this.bm25.search(query, userId, limit, dto.sourceIds),
          this.semantic.search(query, userId, limit, dto.sourceIds),
        ]);

        // RRF fusion: merge two ranked lists into a single deduplicated ranking
        results = this.rrf.fuse([bm25Results, semanticResults], limit);
      }
    } catch (err) {
      // Log the full error but surface a clean 500 to the caller
      this.logger.error(
        { err, query, userId, searchType },
        "search: pipeline error",
      );
      throw new HttpException(
        "Search pipeline encountered an error",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Compute wall-clock time taken in milliseconds
    const took = Date.now() - startedAt;

    // Structured log on every search — useful for latency dashboards
    this.logger.info(
      { query, userId, searchType, resultCount: results.length, took },
      "search: completed",
    );

    return {
      results,
      total: results.length,
      searchType,
      took,
    };
  }
}
