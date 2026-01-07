# Search Query Flow

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The search query flow implements hybrid search combining keyword matching (PostgreSQL full-text search) with semantic similarity (Qdrant vector search). Results are fused and ranked to provide the most relevant files.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SEARCH QUERY FLOW                                      │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌────────┐
    │  User  │
    └────┬───┘
         │ 1. GET /search?q=project+report&mode=hybrid
         ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                          SEARCH-API                                      │
    │                                                                          │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 1: Cache Check                                               │   │
    │  │                                                                   │   │
    │  │  cache_key = hash(query + filters + user_id + page)              │   │
    │  │  IF cache.exists(cache_key) THEN                                 │   │
    │  │    RETURN cache.get(cache_key)                                   │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │ cache miss                                │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 2: Query Preprocessing                                       │   │
    │  │                                                                   │   │
    │  │  - Normalize query text                                          │   │
    │  │  - Detect query language                                         │   │
    │  │  - Extract filters (type:pdf, source:drive)                      │   │
    │  │  - Generate search variations                                    │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 3: Generate Query Embedding                                  │   │
    │  │                                                                   │   │
    │  │  embedding = model.encode(query)  # 384-dim vector               │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │            ┌─────────────────┴─────────────────┐                        │
    │            │           PARALLEL                 │                        │
    │            ▼                                   ▼                        │
    │  ┌──────────────────────┐        ┌──────────────────────┐              │
    │  │ Keyword Search       │        │ Semantic Search      │              │
    │  │ (PostgreSQL)         │        │ (Qdrant)             │              │
    │  │                      │        │                      │              │
    │  │ ts_rank(vector, q)   │        │ cosine_similarity    │              │
    │  │ + trigram similarity │        │ vector search        │              │
    │  │                      │        │                      │              │
    │  │ Returns: file_id,    │        │ Returns: file_id,    │              │
    │  │          score       │        │          score,      │              │
    │  │                      │        │          chunk_index │              │
    │  └──────────┬───────────┘        └──────────┬───────────┘              │
    │             │                               │                           │
    │             └───────────────┬───────────────┘                           │
    │                             ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 4: Result Fusion (Reciprocal Rank Fusion)                    │   │
    │  │                                                                   │   │
    │  │  FOR each file_id in (keyword_results ∪ semantic_results):       │   │
    │  │    keyword_rank = rank in keyword_results (or 0)                 │   │
    │  │    semantic_rank = rank in semantic_results (or 0)               │   │
    │  │                                                                   │   │
    │  │    hybrid_score = (KEYWORD_WEIGHT / (k + keyword_rank)) +        │   │
    │  │                   (SEMANTIC_WEIGHT / (k + semantic_rank))        │   │
    │  │                                                                   │   │
    │  │  Weights: KEYWORD=0.4, SEMANTIC=0.6, k=60                        │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 5: Apply Boost Factors                                       │   │
    │  │                                                                   │   │
    │  │  FOR each result:                                                │   │
    │  │    boost = 1.0                                                   │   │
    │  │    IF modified_at > 30_days_ago: boost *= 1.2 (recency)         │   │
    │  │    IF exact_name_match: boost *= 1.5 (relevance)                │   │
    │  │    IF mime_type matches preferred: boost *= 1.1 (type)          │   │
    │  │                                                                   │   │
    │  │    final_score = hybrid_score * boost                           │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 6: Enrich Results                                            │   │
    │  │                                                                   │   │
    │  │  - Fetch full file metadata from PostgreSQL                      │   │
    │  │  - Add highlight snippets from matched chunks                    │   │
    │  │  - Include facet counts                                          │   │
    │  │  - Paginate results                                              │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 7: Cache & Return                                            │   │
    │  │                                                                   │   │
    │  │  cache.set(cache_key, results, ttl=300)                          │   │
    │  │  RETURN SearchResponse                                           │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                                                                          │
    └─────────────────────────────────────────────────────────────────────────┘
```

---

## Search Modes

### Hybrid Search (Default)

Combines keyword and semantic search for best results.

```
Score = 0.4 * keyword_score + 0.6 * semantic_score
```

### Keyword Only

Uses PostgreSQL full-text search with trigram similarity.

```
Score = ts_rank(search_vector, query) * similarity(name, query)
```

### Semantic Only

Uses vector similarity search in Qdrant.

```
Score = cosine_similarity(query_embedding, file_embedding)
```

---

## Keyword Search Implementation

### PostgreSQL Query

```sql
WITH query AS (
    SELECT
        plainto_tsquery('english', $1) AS tsq,
        $1 AS raw_query
)
SELECT
    f.id,
    f.name,
    f.path,
    f.mime_type,
    f.size_bytes,
    f.source_modified_at,
    -- Full-text score
    ts_rank_cd(f.search_vector, q.tsq, 32) AS fts_score,
    -- Trigram similarity on name
    similarity(f.name, q.raw_query) AS name_similarity,
    -- Combined score
    (ts_rank_cd(f.search_vector, q.tsq, 32) * 0.7 +
     similarity(f.name, q.raw_query) * 0.3) AS combined_score
FROM kms_files f, query q
WHERE f.user_id = $2
  AND f.is_deleted = false
  AND (
    f.search_vector @@ q.tsq
    OR f.name % q.raw_query  -- Trigram match
  )
ORDER BY combined_score DESC
LIMIT 100;
```

### Full-Text Search Configuration

```sql
-- Custom text search configuration
CREATE TEXT SEARCH CONFIGURATION kms_english (COPY = english);

-- Add synonym dictionary
ALTER TEXT SEARCH CONFIGURATION kms_english
    ALTER MAPPING FOR asciiword, word
    WITH kms_synonyms, english_stem;

-- Synonym examples
pdf → document
xlsx → spreadsheet
doc → document
jpg → image
```

---

## Semantic Search Implementation

### Qdrant Query

```python
async def semantic_search(query: str, user_id: str, limit: int = 100):
    # Generate query embedding
    query_embedding = await embedding_generator.generate_single(query)

    # Search in Qdrant
    results = await qdrant.search(
        collection_name="kms_files_default",
        query_vector=query_embedding,
        query_filter={
            "must": [
                {"key": "user_id", "match": {"value": user_id}}
            ]
        },
        limit=limit * 2,  # Get more for chunk aggregation
        with_payload=True,
        score_threshold=0.5  # Minimum similarity
    )

    # Aggregate by file_id (take best chunk score)
    file_scores = {}
    for result in results:
        file_id = result.payload["file_id"]
        if file_id not in file_scores or result.score > file_scores[file_id]["score"]:
            file_scores[file_id] = {
                "score": result.score,
                "chunk_index": result.payload["chunk_index"],
                "chunk_text": result.payload.get("chunk_text", "")
            }

    return file_scores
```

---

## Result Fusion Algorithm

### Reciprocal Rank Fusion (RRF)

```python
def reciprocal_rank_fusion(
    keyword_results: List[dict],
    semantic_results: List[dict],
    keyword_weight: float = 0.4,
    semantic_weight: float = 0.6,
    k: int = 60
) -> List[dict]:
    """
    Combine ranked lists using Reciprocal Rank Fusion.

    RRF score = sum(weight / (k + rank)) for each list
    Higher k = more emphasis on lower-ranked results
    """
    scores = {}

    # Process keyword results
    for rank, result in enumerate(keyword_results, start=1):
        file_id = result["file_id"]
        if file_id not in scores:
            scores[file_id] = {"file_id": file_id, "rrf_score": 0}
        scores[file_id]["rrf_score"] += keyword_weight / (k + rank)
        scores[file_id]["keyword_rank"] = rank
        scores[file_id]["keyword_score"] = result["score"]

    # Process semantic results
    for rank, result in enumerate(semantic_results, start=1):
        file_id = result["file_id"]
        if file_id not in scores:
            scores[file_id] = {"file_id": file_id, "rrf_score": 0}
        scores[file_id]["rrf_score"] += semantic_weight / (k + rank)
        scores[file_id]["semantic_rank"] = rank
        scores[file_id]["semantic_score"] = result["score"]
        scores[file_id]["best_chunk"] = result.get("chunk_text", "")

    # Sort by RRF score
    fused = sorted(scores.values(), key=lambda x: x["rrf_score"], reverse=True)

    return fused
```

---

## Boost Factors

### Recency Boost

```python
def recency_boost(modified_at: datetime) -> float:
    """Boost recent files"""
    days_ago = (datetime.utcnow() - modified_at).days

    if days_ago <= 7:
        return 1.3  # Last week
    elif days_ago <= 30:
        return 1.2  # Last month
    elif days_ago <= 90:
        return 1.1  # Last quarter
    elif days_ago <= 365:
        return 1.0  # Last year
    else:
        return 0.9  # Older
```

### Name Match Boost

```python
def name_match_boost(file_name: str, query: str) -> float:
    """Boost exact or partial name matches"""
    name_lower = file_name.lower()
    query_lower = query.lower()

    if name_lower == query_lower:
        return 1.5  # Exact match
    elif query_lower in name_lower:
        return 1.3  # Contains query
    elif any(word in name_lower for word in query_lower.split()):
        return 1.1  # Partial word match
    return 1.0
```

### Type Preference Boost

```python
def type_boost(mime_type: str, preferred_types: List[str]) -> float:
    """Boost preferred file types"""
    if not preferred_types:
        return 1.0

    if mime_type in preferred_types:
        return 1.2
    return 1.0
```

---

## Filters

### Filter Syntax

```
query=project report type:pdf source:google_drive modified:last_week
```

### Supported Filters

| Filter | Values | Example |
|--------|--------|---------|
| `type` | pdf, doc, image, video, code | `type:pdf` |
| `source` | google_drive, local, external | `source:google_drive` |
| `modified` | today, week, month, year | `modified:last_month` |
| `size` | small, medium, large | `size:large` |
| `is` | duplicate, junk | `is:duplicate` |

### Filter Application

```sql
-- Applied to both keyword and semantic queries
WHERE f.user_id = $1
  AND f.is_deleted = false
  AND ($2::text[] IS NULL OR f.mime_type = ANY($2))  -- type filter
  AND ($3::uuid IS NULL OR f.source_id = $3)         -- source filter
  AND ($4::timestamp IS NULL OR f.source_modified_at >= $4)  -- modified filter
```

---

## Response Structure

```json
{
  "query": "project report",
  "mode": "hybrid",
  "total": 145,
  "page": 1,
  "per_page": 20,
  "results": [
    {
      "file_id": "uuid",
      "name": "Q4 Project Report.pdf",
      "path": "/Documents/Reports/Q4 Project Report.pdf",
      "mime_type": "application/pdf",
      "size_bytes": 1048576,
      "source_name": "Google Drive",
      "modified_at": "2026-01-05T10:00:00Z",
      "score": 0.89,
      "highlight": "...the **project report** shows significant progress...",
      "match_info": {
        "keyword_rank": 3,
        "semantic_rank": 1,
        "best_chunk_index": 2
      }
    }
  ],
  "facets": {
    "mime_types": [
      {"value": "application/pdf", "count": 45},
      {"value": "application/vnd.google-apps.document", "count": 32}
    ],
    "sources": [
      {"value": "Google Drive", "count": 120},
      {"value": "Local Files", "count": 25}
    ]
  },
  "timing": {
    "total_ms": 85,
    "keyword_ms": 25,
    "semantic_ms": 45,
    "fusion_ms": 5,
    "enrichment_ms": 10
  }
}
```

---

## Caching Strategy

### Cache Key Generation

```python
def generate_cache_key(
    query: str,
    filters: dict,
    user_id: str,
    page: int
) -> str:
    """Generate deterministic cache key"""
    normalized = {
        "q": query.lower().strip(),
        "f": sorted(filters.items()),
        "u": user_id,
        "p": page
    }
    return f"search:{hashlib.md5(json.dumps(normalized).encode()).hexdigest()}"
```

### Cache Configuration

```python
CACHE_CONFIG = {
    "ttl_seconds": 300,        # 5 minutes
    "max_entries": 10000,
    "eviction": "lru"
}
```

### Cache Invalidation

```python
# Invalidate on file changes
async def on_file_updated(file_id: str, user_id: str):
    # Delete all search caches for this user
    pattern = f"search:*{user_id}*"
    await cache.delete_pattern(pattern)
```

---

## Performance Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| p50 latency | < 100ms | Time to first byte |
| p95 latency | < 200ms | Time to first byte |
| p99 latency | < 500ms | Time to first byte |
| Cache hit rate | > 60% | Hits / (Hits + Misses) |
| Throughput | > 100 req/s | Requests per second |

