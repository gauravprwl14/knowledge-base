# ADR-001: Hybrid Search Algorithm — Reciprocal Rank Fusion

**Status:** Accepted
**Date:** 2026-01-15
**Deciders:** kb-architect, kb-search-specialist

---

## Context

The KMS search feature must combine two fundamentally different retrieval signals:

1. **Semantic similarity** — Dense vector search via Qdrant using `all-MiniLM-L6-v2` embeddings (384 dimensions, cosine similarity). Excels at conceptual and paraphrase matching but assigns arbitrary float scores with no universal scale.

2. **Keyword relevance** — BM25 full-text search via PostgreSQL `tsvector`. Excels at exact term matching and proper noun retrieval but operates on a different score distribution than cosine similarity.

The core problem: how do we combine these two ranked lists into a single unified ranking without introducing systematic bias toward one signal?

**Forces at play:**
- Cosine similarity scores are bounded `[0, 1]` but cluster between `0.4–0.9` in practice.
- BM25 scores are unbounded and vary significantly by document length and query term frequency.
- A linear combination `alpha * semantic + (1 - alpha) * keyword` requires a stable, calibrated alpha per query type — this is operationally complex and fragile.
- The team has no large labeled dataset to train a learned reranker at this stage.
- Search latency budget: P95 < 200ms for the full hybrid pipeline.

---

## Decision

We will use **Reciprocal Rank Fusion (RRF)** to merge the semantic and keyword ranked lists.

```
RRF(d) = Σ 1 / (k + rank_i(d))

where:
  d       = document
  rank_i  = rank of document d in list i (1-indexed)
  k       = 60 (smoothing constant, default from original RRF paper)
  i       = {semantic, keyword}
```

Default configuration:
- `k = 60`
- Equal contribution from both lists (no list-level weighting)
- Top-N candidates from each list: `n = 50` (before fusion)
- Final result set: top 10 (configurable)

---

## Rationale

1. **Score-space agnostic.** RRF operates on ranks, not raw scores. This eliminates the normalization problem entirely — it does not matter that cosine similarity and BM25 use different scales.

2. **No training data required.** Linear combination methods and learned rerankers require labeled query-document relevance pairs. RRF delivers strong out-of-box performance with zero training data, which matches our current team capacity.

3. **Empirically strong baseline.** The original Cormack et al. (2009) paper demonstrated that RRF outperforms many more complex fusion methods on TREC benchmarks. Multiple production search systems (Elasticsearch, Vespa, Weaviate) have adopted it as their default hybrid fusion.

4. **Operationally simple.** The only tunable parameter is `k`. Increasing `k` reduces the weight of top-ranked results; decreasing `k` amplifies differences between rank positions. This is a single knob, not a per-query alpha.

5. **Latency budget met.** At `n=50` candidates per list, RRF fusion is a pure in-memory sort operation — O(n log n) with n=100. This adds < 1ms to the pipeline and comfortably fits our P95 < 200ms budget.

---

## Consequences

**Positive:**
- Immediate improvement in recall for multi-faceted queries that contain both specific terms (BM25) and conceptual intent (semantic).
- No per-query parameter calibration required at launch.
- k is tunable post-launch without a model retrain or schema migration.
- Compatible with Qdrant's existing payload-based filtering — filters can be applied before RRF.

**Negative / Trade-offs:**
- RRF gives equal weight to both lists by default. For query types where one signal is clearly dominant (e.g., code search favors BM25), we must either accept suboptimal ranking or add list-level weights — re-introducing a tuning parameter.
- A document ranked 1st in semantic and 2nd in keyword will score the same as a document ranked 2nd in semantic and 1st in keyword (symmetric). This may not always be desirable.
- RRF does not account for the gap between ranks (rank 1 vs rank 2 may be a 0.95 vs 0.94 cosine similarity, but RRF treats them identically). Score information is discarded.

**Risks:**
- If the `n=50` candidate pool is too small, strong candidates beyond position 50 in one list will never be considered. Monitor recall @ 50 vs recall @ 100 in production.
- k=60 is a default, not an optimized value. A/B testing may reveal a better k for our specific corpus.

---

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| **Linear score combination** `α * semantic + (1-α) * keyword` | Requires score normalization (min-max or z-score) which is sensitive to outliers and changes with corpus distribution. Requires tuning α per query type — operational overhead without labeled data. |
| **Learned reranker (cross-encoder)** | High quality but requires labeled training data (query-doc pairs with relevance judgments) and adds 50-150ms latency per query (cross-encoder runs sequentially). Not viable at current team scale. |
| **Semantic-only (no BM25)** | Loses exact-match retrieval quality. Users searching for a specific filename, error code, or proper noun would get poor results. |
| **Keyword-only (no semantic)** | Loses conceptual recall. Synonym and paraphrase queries would fail. A user searching "how to authenticate" would miss documents about "JWT authorization flow". |
| **Weaviate / Elasticsearch native hybrid** | Would require replacing Qdrant as the vector store. Qdrant is already deployed and our embedding pipeline is built around it. Migration cost is not justified at this stage. |

---

## Implementation Notes

1. Fetch top-50 from Qdrant (semantic) and top-50 from PostgreSQL FTS (keyword) in parallel.
2. Merge into a single dict keyed by `document_id`.
3. Apply RRF formula to compute fusion score.
4. Sort descending by RRF score, return top-N.
5. Cache full RRF result in Redis with key `search:<sha256(query+filters+limit)>`, TTL 300s.
6. Expose `k` and `n` as configurable env vars: `SEARCH_RRF_K=60`, `SEARCH_RRF_CANDIDATE_N=50`.
7. Log top-result RRF scores (not raw scores) to facilitate offline quality analysis.

Follow-up: ADR-002 will address whether to add list-level weights for query-type-specific tuning.
