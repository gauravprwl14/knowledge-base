# Hybrid Search Algorithm

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Problem Statement

Neither keyword search nor semantic search alone provides optimal results:
- **Keyword search** excels at exact matches but misses synonyms and related concepts
- **Semantic search** understands meaning but may miss specific terms and phrases

The hybrid search algorithm combines both approaches to maximize recall and precision.

---

## Conceptual Algorithm

```
ALGORITHM: Hybrid Search with Reciprocal Rank Fusion
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INPUT:
  query           : String        // User's search query
  user_id         : String        // User identifier for scoping
  filters         : Dict          // Optional filters (type, date, etc.)
  limit           : Integer       // Number of results (default: 20)
  keyword_weight  : Float         // Weight for keyword results (default: 0.4)
  semantic_weight : Float         // Weight for semantic results (default: 0.6)
  k               : Integer       // RRF constant (default: 60)

OUTPUT:
  results         : List[Result]  // Ranked search results

PROCEDURE hybrid_search(query, user_id, filters, limit, keyword_weight, semantic_weight, k):

  1. CHECK CACHE
     ─────────────
     cache_key ← hash(query, filters, user_id, limit)
     IF cache.exists(cache_key) THEN
       RETURN cache.get(cache_key)
     END IF

  2. PREPROCESS QUERY
     ──────────────────
     query ← normalize(query)
     parsed_filters ← extract_filters(query)
     clean_query ← remove_filter_syntax(query)

  3. GENERATE QUERY EMBEDDING
     ──────────────────────────
     query_embedding ← embedding_model.encode(clean_query)
     query_embedding ← normalize_l2(query_embedding)

  4. EXECUTE PARALLEL SEARCHES
     ──────────────────────────

     // Keyword Search (PostgreSQL)
     PARALLEL DO
       keyword_results ← keyword_search(clean_query, user_id, filters)
       // Returns: List of (file_id, fts_score, name_similarity)
     END PARALLEL

     // Semantic Search (Qdrant)
     PARALLEL DO
       semantic_results ← semantic_search(query_embedding, user_id, filters)
       // Returns: List of (file_id, similarity_score, chunk_index)
     END PARALLEL

     WAIT FOR ALL

  5. RECIPROCAL RANK FUSION
     ────────────────────────
     scores ← {}

     // Process keyword results
     FOR rank, result IN enumerate(keyword_results, start=1) DO
       file_id ← result.file_id
       IF file_id NOT IN scores THEN
         scores[file_id] ← {
           rrf_score: 0,
           keyword_rank: NULL,
           semantic_rank: NULL
         }
       END IF
       scores[file_id].rrf_score += keyword_weight / (k + rank)
       scores[file_id].keyword_rank ← rank
       scores[file_id].keyword_score ← result.score
     END FOR

     // Process semantic results
     FOR rank, result IN enumerate(semantic_results, start=1) DO
       file_id ← result.file_id
       IF file_id NOT IN scores THEN
         scores[file_id] ← {
           rrf_score: 0,
           keyword_rank: NULL,
           semantic_rank: NULL
         }
       END IF
       scores[file_id].rrf_score += semantic_weight / (k + rank)
       scores[file_id].semantic_rank ← rank
       scores[file_id].semantic_score ← result.score
       scores[file_id].best_chunk ← result.chunk_text
     END FOR

  6. SORT BY RRF SCORE
     ───────────────────
     fused_results ← sort_by_score_desc(scores.values())

  7. APPLY BOOST FACTORS
     ─────────────────────
     FOR EACH result IN fused_results DO
       boost ← 1.0

       // Recency boost
       IF file.modified_at > 7_days_ago THEN
         boost ← boost * 1.3
       ELSE IF file.modified_at > 30_days_ago THEN
         boost ← boost * 1.2
       ELSE IF file.modified_at > 90_days_ago THEN
         boost ← boost * 1.1
       END IF

       // Name match boost
       IF query IN lowercase(file.name) THEN
         boost ← boost * 1.3
       ELSE IF any_word_matches(query, file.name) THEN
         boost ← boost * 1.1
       END IF

       // Apply boost
       result.final_score ← result.rrf_score * boost
     END FOR

     // Re-sort after boosting
     fused_results ← sort_by_final_score_desc(fused_results)

  8. ENRICH RESULTS
     ────────────────
     FOR EACH result IN fused_results[0:limit] DO
       result.file_metadata ← fetch_file_metadata(result.file_id)
       result.highlights ← generate_highlights(query, result)
     END FOR

  9. CACHE AND RETURN
     ──────────────────
     results ← fused_results[0:limit]
     cache.set(cache_key, results, ttl=300)
     RETURN results

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PROCEDURE keyword_search(query, user_id, filters):
  // PostgreSQL full-text search with trigram fallback

  tsquery ← plainto_tsquery('english', query)

  results ← SQL """
    WITH ranked AS (
      SELECT
        f.id,
        f.name,
        ts_rank_cd(f.search_vector, tsquery, 32) AS fts_score,
        similarity(f.name, query) AS name_sim,
        (ts_rank_cd(f.search_vector, tsquery, 32) * 0.7 +
         similarity(f.name, query) * 0.3) AS combined_score
      FROM kms_files f
      WHERE f.user_id = user_id
        AND f.is_deleted = false
        AND (f.search_vector @@ tsquery OR f.name % query)
        AND apply_filters(f, filters)
      ORDER BY combined_score DESC
      LIMIT 100
    )
    SELECT * FROM ranked
  """

  RETURN results

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PROCEDURE semantic_search(query_embedding, user_id, filters):
  // Qdrant vector similarity search

  results ← qdrant.search(
    collection = "kms_files_default",
    query_vector = query_embedding,
    filter = {
      "must": [{"key": "user_id", "match": {"value": user_id}}],
      // Additional filters applied
    },
    limit = 200,  // Get more for aggregation
    score_threshold = 0.5
  )

  // Aggregate by file_id (take best chunk per file)
  file_scores ← {}
  FOR EACH result IN results DO
    file_id ← result.payload.file_id
    IF file_id NOT IN file_scores OR result.score > file_scores[file_id].score THEN
      file_scores[file_id] ← {
        score: result.score,
        chunk_index: result.payload.chunk_index,
        chunk_text: result.payload.chunk_text
      }
    END IF
  END FOR

  // Sort by score and return top 100
  RETURN sort_by_score_desc(file_scores.items())[0:100]
```

---

## High-Level Implementation

```python
# app/services/hybrid_search.py - NOT executable - conceptual implementation

from typing import List, Dict, Optional
from dataclasses import dataclass
import asyncio

@dataclass
class SearchResult:
    """A ranked search result"""
    file_id: str
    final_score: float
    rrf_score: float
    keyword_rank: Optional[int]
    semantic_rank: Optional[int]
    keyword_score: Optional[float]
    semantic_score: Optional[float]
    best_chunk: Optional[str]
    file_metadata: Optional[dict]
    highlights: List[str]


class HybridSearchService:
    """
    Hybrid search combining keyword and semantic approaches.

    Uses Reciprocal Rank Fusion (RRF) to combine results from:
    - PostgreSQL full-text search (keyword matching)
    - Qdrant vector search (semantic similarity)
    """

    # Default weights (semantic slightly preferred)
    DEFAULT_KEYWORD_WEIGHT = 0.4
    DEFAULT_SEMANTIC_WEIGHT = 0.6

    # RRF constant (higher = more emphasis on lower ranks)
    DEFAULT_K = 60

    def __init__(
        self,
        postgres_client,
        qdrant_client,
        embedding_generator,
        cache_client
    ):
        self.postgres = postgres_client
        self.qdrant = qdrant_client
        self.embedder = embedding_generator
        self.cache = cache_client

    async def search(
        self,
        query: str,
        user_id: str,
        filters: Dict = None,
        limit: int = 20,
        keyword_weight: float = None,
        semantic_weight: float = None
    ) -> List[SearchResult]:
        """
        Execute hybrid search.

        Args:
            query: User's search query
            user_id: User identifier
            filters: Optional filters (type, source, date)
            limit: Number of results to return
            keyword_weight: Weight for keyword results
            semantic_weight: Weight for semantic results

        Returns:
            List of ranked SearchResult objects
        """
        # Use defaults if not specified
        kw_weight = keyword_weight or self.DEFAULT_KEYWORD_WEIGHT
        sem_weight = semantic_weight or self.DEFAULT_SEMANTIC_WEIGHT

        # Step 1: Check cache
        cache_key = self._cache_key(query, user_id, filters, limit)
        cached = await self.cache.get(cache_key)
        if cached:
            return cached

        # Step 2: Preprocess query
        clean_query = self._preprocess_query(query)
        parsed_filters = self._extract_filters(query, filters)

        # Step 3: Generate query embedding
        query_embedding = await self.embedder.generate_single(clean_query)

        # Step 4: Execute searches in parallel
        keyword_results, semantic_results = await asyncio.gather(
            self._keyword_search(clean_query, user_id, parsed_filters),
            self._semantic_search(query_embedding, user_id, parsed_filters)
        )

        # Step 5: Reciprocal Rank Fusion
        fused = self._reciprocal_rank_fusion(
            keyword_results,
            semantic_results,
            kw_weight,
            sem_weight,
            self.DEFAULT_K
        )

        # Step 6: Apply boost factors
        boosted = self._apply_boosts(fused, clean_query)

        # Step 7: Enrich top results
        results = await self._enrich_results(boosted[:limit], clean_query)

        # Step 8: Cache and return
        await self.cache.set(cache_key, results, ttl=300)
        return results

    def _reciprocal_rank_fusion(
        self,
        keyword_results: List[dict],
        semantic_results: List[dict],
        keyword_weight: float,
        semantic_weight: float,
        k: int
    ) -> List[dict]:
        """
        Combine ranked lists using RRF.

        RRF formula: score = sum(weight / (k + rank))
        """
        scores = {}

        # Process keyword results
        for rank, result in enumerate(keyword_results, start=1):
            file_id = result['file_id']
            if file_id not in scores:
                scores[file_id] = {
                    'file_id': file_id,
                    'rrf_score': 0.0,
                    'keyword_rank': None,
                    'semantic_rank': None,
                    'keyword_score': None,
                    'semantic_score': None,
                    'best_chunk': None
                }

            scores[file_id]['rrf_score'] += keyword_weight / (k + rank)
            scores[file_id]['keyword_rank'] = rank
            scores[file_id]['keyword_score'] = result.get('score')

        # Process semantic results
        for rank, result in enumerate(semantic_results, start=1):
            file_id = result['file_id']
            if file_id not in scores:
                scores[file_id] = {
                    'file_id': file_id,
                    'rrf_score': 0.0,
                    'keyword_rank': None,
                    'semantic_rank': None,
                    'keyword_score': None,
                    'semantic_score': None,
                    'best_chunk': None
                }

            scores[file_id]['rrf_score'] += semantic_weight / (k + rank)
            scores[file_id]['semantic_rank'] = rank
            scores[file_id]['semantic_score'] = result.get('score')
            scores[file_id]['best_chunk'] = result.get('chunk_text', '')

        # Sort by RRF score
        return sorted(
            scores.values(),
            key=lambda x: x['rrf_score'],
            reverse=True
        )

    def _apply_boosts(self, results: List[dict], query: str) -> List[dict]:
        """Apply boost factors to results"""
        query_lower = query.lower()
        query_words = set(query_lower.split())

        for result in results:
            boost = 1.0

            # Get file metadata for boosting
            file_meta = result.get('_metadata', {})

            # Recency boost
            modified_at = file_meta.get('modified_at')
            if modified_at:
                boost *= self._recency_boost(modified_at)

            # Name match boost
            name = file_meta.get('name', '').lower()
            if query_lower in name:
                boost *= 1.3  # Query appears in name
            elif query_words & set(name.split()):
                boost *= 1.1  # Any word matches

            # Calculate final score
            result['final_score'] = result['rrf_score'] * boost

        # Re-sort by final score
        return sorted(results, key=lambda x: x['final_score'], reverse=True)

    def _recency_boost(self, modified_at) -> float:
        """Calculate recency boost factor"""
        from datetime import datetime, timedelta

        now = datetime.utcnow()
        if isinstance(modified_at, str):
            modified_at = datetime.fromisoformat(modified_at.replace('Z', '+00:00'))

        days_ago = (now - modified_at.replace(tzinfo=None)).days

        if days_ago <= 7:
            return 1.3
        elif days_ago <= 30:
            return 1.2
        elif days_ago <= 90:
            return 1.1
        elif days_ago <= 365:
            return 1.0
        else:
            return 0.9

    async def _keyword_search(
        self,
        query: str,
        user_id: str,
        filters: dict
    ) -> List[dict]:
        """Execute PostgreSQL full-text search"""
        results = await self.postgres.fetch("""
            WITH ranked AS (
                SELECT
                    f.id AS file_id,
                    f.name,
                    f.source_modified_at,
                    ts_rank_cd(f.search_vector, plainto_tsquery('english', $1), 32) AS fts_score,
                    similarity(f.name, $1) AS name_similarity
                FROM kms_files f
                WHERE f.user_id = $2
                  AND f.is_deleted = false
                  AND (
                    f.search_vector @@ plainto_tsquery('english', $1)
                    OR f.name % $1
                  )
                ORDER BY (fts_score * 0.7 + name_similarity * 0.3) DESC
                LIMIT 100
            )
            SELECT *,
                   (fts_score * 0.7 + name_similarity * 0.3) AS score
            FROM ranked
        """, query, user_id)

        return [dict(r) for r in results]

    async def _semantic_search(
        self,
        query_embedding: List[float],
        user_id: str,
        filters: dict
    ) -> List[dict]:
        """Execute Qdrant vector search"""
        results = await self.qdrant.search(
            collection_name="kms_files_default",
            query_vector=query_embedding,
            query_filter={
                "must": [
                    {"key": "user_id", "match": {"value": user_id}}
                ]
            },
            limit=200,
            score_threshold=0.5,
            with_payload=True
        )

        # Aggregate by file (best chunk per file)
        file_scores = {}
        for result in results:
            file_id = result.payload.get('file_id')
            if file_id not in file_scores or result.score > file_scores[file_id]['score']:
                file_scores[file_id] = {
                    'file_id': file_id,
                    'score': result.score,
                    'chunk_index': result.payload.get('chunk_index'),
                    'chunk_text': result.payload.get('chunk_text', '')[:200]
                }

        # Sort and return top 100
        sorted_results = sorted(
            file_scores.values(),
            key=lambda x: x['score'],
            reverse=True
        )
        return sorted_results[:100]
```

---

## Complexity Analysis

| Phase | Time Complexity | Space Complexity |
|-------|-----------------|------------------|
| Cache check | O(1) | O(1) |
| Query embedding | O(t) | O(d) |
| Keyword search | O(log n) | O(k) |
| Semantic search | O(log n) | O(k) |
| RRF fusion | O(k log k) | O(k) |
| Boost application | O(k) | O(1) |
| Result enrichment | O(limit) | O(limit) |

Where:
- n = total files in index
- k = results per search (100)
- d = embedding dimension (384)
- t = query tokens
- limit = final result count (20)

---

## Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `keyword_weight` | 0.4 | Weight for keyword search in fusion |
| `semantic_weight` | 0.6 | Weight for semantic search in fusion |
| `k` | 60 | RRF constant (higher = more uniform) |
| `cache_ttl` | 300 | Cache TTL in seconds |
| `min_score` | 0.5 | Minimum semantic similarity threshold |

### Weight Tuning Guidelines

| Scenario | keyword_weight | semantic_weight |
|----------|----------------|-----------------|
| Technical docs | 0.5 | 0.5 |
| Natural language | 0.3 | 0.7 |
| Code search | 0.6 | 0.4 |
| Exact match priority | 0.7 | 0.3 |

---

## Example

**Query**: "quarterly sales report"

**Keyword Results**:
1. `Q4_Sales_Report.xlsx` (score: 0.95)
2. `Sales_Report_2025.pdf` (score: 0.87)
3. `Quarterly_Review.docx` (score: 0.72)

**Semantic Results**:
1. `Revenue_Analysis_Q4.pdf` (score: 0.91)
2. `Q4_Sales_Report.xlsx` (score: 0.88)
3. `Sales_Forecast.xlsx` (score: 0.82)

**After RRF Fusion** (k=60, weights 0.4/0.6):
1. `Q4_Sales_Report.xlsx` - 0.0131 (appears in both)
2. `Revenue_Analysis_Q4.pdf` - 0.0098 (semantic #1)
3. `Sales_Report_2025.pdf` - 0.0065 (keyword #2)

