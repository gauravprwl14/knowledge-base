import { Injectable, Logger } from '@nestjs/common';
import { KeywordSearchService } from './keyword-search.service';
import { SemanticSearchService } from './semantic-search.service';
import { SearchQuery, SearchResultDto } from '../dto/search-query.dto';

/**
 * HybridSearchService merges keyword and semantic results using
 * Reciprocal Rank Fusion (RRF) with k=60.
 *
 * RRF formula per result:
 *   score = 1 / (rank_keyword + 60) + 1 / (rank_semantic + 60)
 *
 * Results that appear in both lists receive contributions from both ranks.
 * The merged list is sorted by RRF score descending and truncated to `limit`.
 */
@Injectable()
export class HybridSearchService {
  private readonly logger = new Logger(HybridSearchService.name);
  private static readonly RRF_K = 60;

  constructor(
    private readonly keywordSearch: KeywordSearchService,
    private readonly semanticSearch: SemanticSearchService,
  ) {}

  /**
   * Runs keyword and semantic search in parallel then merges using RRF.
   *
   * @param query - Validated search query.
   * @returns Top N results sorted by RRF score descending.
   */
  async search(query: SearchQuery): Promise<SearchResultDto[]> {
    this.logger.log({ msg: 'hybrid_search_start', query: query.q, user_id: query.user_id });

    const [keywordResults, semanticResults] = await Promise.all([
      this.keywordSearch.search(query).catch((err) => {
        this.logger.error({ msg: 'keyword_search_error_in_hybrid', error: err });
        return [] as SearchResultDto[];
      }),
      this.semanticSearch.search(query).catch((err) => {
        this.logger.error({ msg: 'semantic_search_error_in_hybrid', error: err });
        return [] as SearchResultDto[];
      }),
    ]);

    return this.mergeWithRRF(keywordResults, semanticResults, query.limit);
  }

  /**
   * Applies Reciprocal Rank Fusion to two ranked result lists.
   *
   * @param keywordResults - Ranked keyword search results (best first).
   * @param semanticResults - Ranked semantic search results (best first).
   * @param limit - Maximum number of results to return.
   * @returns Merged and re-ranked result list.
   */
  private mergeWithRRF(
    keywordResults: SearchResultDto[],
    semanticResults: SearchResultDto[],
    limit: number,
  ): SearchResultDto[] {
    const k = HybridSearchService.RRF_K;

    // Map from chunk_id (or file_id fallback) to accumulated RRF score
    const scores = new Map<string, number>();
    // Map from chunk_id to the full SearchResultDto for the final output
    const resultMap = new Map<string, SearchResultDto>();

    keywordResults.forEach((result, index) => {
      const id = result.chunk_id || result.fileId || `kw-${index}`;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
      resultMap.set(id, result);
    });

    semanticResults.forEach((result, index) => {
      const id = result.chunk_id || result.fileId || `sem-${index}`;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
      if (!resultMap.has(id)) {
        resultMap.set(id, result);
      }
    });

    return [...scores.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([id, score]) => {
        const result = resultMap.get(id)!;
        return { ...result, score };
      });
  }
}
