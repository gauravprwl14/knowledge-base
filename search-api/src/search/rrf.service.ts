import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { SearchResult } from './dto/search-response.dto';

/**
 * RRF smoothing constant — k=60 is the value recommended in the original
 * Cormack et al. (2009) paper and confirmed in KMS ADR-0005.
 * A higher k reduces the penalty gap between adjacent ranks.
 */
const RRF_K = 60;

/**
 * Internal structure that accumulates per-result fusion data during RRF.
 * Keyed by a composite `{fileId}:{chunkIndex}` deduplication key.
 */
interface FusionEntry {
  result: SearchResult;
  /** Running sum of 1/(k + rank) contributions from all result lists. */
  rrfScore: number;
}

/**
 * RrfService implements Reciprocal Rank Fusion over multiple ranked result lists.
 *
 * Algorithm (per Cormack, Clarke & Buettcher 2009):
 * ```
 * For each result list L and each result r at 1-based rank i in L:
 *   rrfScore(r) += 1 / (k + i)
 * ```
 * Results that appear in multiple lists accumulate higher combined scores.
 * The final list is sorted descending by rrfScore and the scores are
 * normalised to the [0, 1] range so consumers get a consistent scale.
 */
@Injectable()
export class RrfService {
  constructor(
    @InjectPinoLogger(RrfService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Fuses multiple ranked result lists using Reciprocal Rank Fusion.
   *
   * @param lists - Two or more ranked arrays of SearchResult (e.g., [bm25Results, semanticResults])
   * @param limit - Maximum number of merged results to return
   * @returns Deduplicated, merged, and normalised SearchResult array sorted by descending score
   *
   * @example
   * ```typescript
   * const merged = this.rrfService.fuse([keywordResults, semanticResults], 10);
   * ```
   */
  fuse(lists: SearchResult[][], limit: number): SearchResult[] {
    // Map used to accumulate RRF scores and avoid duplicates.
    // Key: "{fileId}:{chunkIndex}" — ensures the same chunk from different sources merges.
    const fusionMap = new Map<string, FusionEntry>();

    // Iterate over each result list and compute rank contributions
    for (const list of lists) {
      list.forEach((result, index) => {
        // RRF rank is 1-based, so add 1 to the zero-based array index
        const rank = index + 1;

        // RRF: compute rank score for each result using k=60 constant
        // rank_score = 1 / (k + rank) where rank is 1-based position
        const rankScore = 1 / (RRF_K + rank);

        // Deduplication key: same chunk from different lists should merge, not duplicate
        const key = `${result.fileId}:${result.chunkIndex}`;

        if (fusionMap.has(key)) {
          // Chunk already seen from another list — accumulate the rank contribution
          const existing = fusionMap.get(key)!;
          existing.rrfScore += rankScore;
        } else {
          // First time we see this chunk — initialise its fusion entry
          fusionMap.set(key, { result, rrfScore: rankScore });
        }
      });
    }

    // Convert the fusion map values to an array sorted by descending RRF score
    const sorted = Array.from(fusionMap.values()).sort((a, b) => b.rrfScore - a.rrfScore);

    // Normalise scores to [0, 1] so the API returns a consistent range.
    // maxScore guard: if all scores are zero (empty lists), avoid division by zero.
    const maxScore = sorted[0]?.rrfScore ?? 1;

    const normalised = sorted.slice(0, limit).map((entry) => ({
      ...entry.result,
      // Normalised score: entry score / max score — top result always scores 1.0
      score: parseFloat((entry.rrfScore / maxScore).toFixed(6)),
    }));

    this.logger.debug(
      {
        inputLists: lists.length,
        totalUnique: fusionMap.size,
        returned: normalised.length,
        topScore: normalised[0]?.score ?? 0,
      },
      'rrf: fusion complete',
    );

    return normalised;
  }
}
