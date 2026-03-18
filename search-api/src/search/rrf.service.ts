import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { SearchResultItemDto } from './dto/search-result.dto';

/**
 * RrfService — Reciprocal Rank Fusion (RRF) for combining keyword and
 * semantic search result lists.
 *
 * ### Algorithm
 * For each document `d` in either list:
 * ```
 * rrf_score(d) = Σ  1 / (k + rank(d, list_i))
 * ```
 * where `k = 60` (standard RRF constant) and `rank` is the 1-based position.
 *
 * Documents that appear in **both** lists receive contributions from both,
 * so shared results naturally bubble to the top.
 *
 * @see https://dl.acm.org/doi/10.1145/1571941.1572114 (Cormack et al., 2009)
 *
 * @example
 * ```typescript
 * const merged = rrfService.merge(keywordResults, semanticResults);
 * ```
 */
@Injectable()
export class RrfService {
  constructor(
    @InjectPinoLogger(RrfService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Merges two ranked result lists using Reciprocal Rank Fusion.
   *
   * @param keywordResults - Results ordered by keyword relevance.
   * @param semanticResults - Results ordered by vector similarity.
   * @param k - RRF constant (default 60).
   * @returns Deduplicated results ordered by combined RRF score descending.
   */
  merge(
    keywordResults: SearchResultItemDto[],
    semanticResults: SearchResultItemDto[],
    k = 60,
  ): SearchResultItemDto[] {
    /** Map of fileId → accumulated RRF score. */
    const scoreMap = new Map<string, number>();
    /** Map of fileId → best SearchResultItemDto for metadata. */
    const itemMap = new Map<string, SearchResultItemDto>();

    const contribute = (
      list: SearchResultItemDto[],
      label: 'keyword' | 'semantic',
    ): void => {
      list.forEach((item, index) => {
        const rank = index + 1; // 1-based
        const contribution = 1 / (k + rank);
        const current = scoreMap.get(item.fileId) ?? 0;
        scoreMap.set(item.fileId, current + contribution);

        // Keep the item with the highest original score for metadata
        if (!itemMap.has(item.fileId)) {
          itemMap.set(item.fileId, item);
        } else {
          const existing = itemMap.get(item.fileId)!;
          // Prefer keyword snippet (has <mark> highlights) when available
          if (label === 'keyword') {
            itemMap.set(item.fileId, { ...existing, snippet: item.snippet });
          }
        }
      });
    };

    contribute(keywordResults, 'keyword');
    contribute(semanticResults, 'semantic');

    this.logger.debug(
      {
        keywordCount: keywordResults.length,
        semanticCount: semanticResults.length,
        mergedCount: scoreMap.size,
      },
      'RRF merge complete',
    );

    // Sort by combined RRF score, highest first
    return Array.from(scoreMap.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([fileId, rrfScore]) => ({
        ...itemMap.get(fileId)!,
        score: rrfScore,
      }));
  }
}
