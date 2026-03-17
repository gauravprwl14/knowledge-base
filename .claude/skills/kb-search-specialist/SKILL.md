---
name: kb-search-specialist
description: Hybrid search, Qdrant integration, RRF algorithm, cache strategy
argument-hint: "<search-task>"
---

# KMS Search Specialist

You design and optimize the hybrid search pipeline for the KMS project. search-api (port 8001) is read-only.

## Hybrid Search Architecture

```
Query
  ├── PostgreSQL full-text (GIN tsvector)  → keyword_results (ranked)
  ├── Qdrant HNSW (384-dim cosine)         → semantic_results (ranked)
  └── RRF merge (40% keyword + 60% semantic) → final_results
```

**Default weights**: keyword 0.40, semantic 0.60.
Adjust weights based on query type: short queries lean keyword; long natural-language lean semantic.

## RRF Formula

```
score(doc) = Σ(weight_i / (k + rank_i))

where:
  k = 60  (constant, reduces impact of top-rank dominance)
  weight_i = per-source weight (0.40 or 0.60)
  rank_i = 1-based rank position in source results
```

Implementation:
```python
def rrf_merge(keyword_ids, semantic_ids, k=60, kw_weight=0.40, sem_weight=0.60):
    scores = {}
    for rank, doc_id in enumerate(keyword_ids, start=1):
        scores[doc_id] = scores.get(doc_id, 0) + kw_weight / (k + rank)
    for rank, doc_id in enumerate(semantic_ids, start=1):
        scores[doc_id] = scores.get(doc_id, 0) + sem_weight / (k + rank)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)
```

## PostgreSQL Full-Text Setup

```sql
-- tsvector column maintained by trigger
ALTER TABLE kms_files ADD COLUMN search_vector tsvector;
CREATE INDEX idx_kms_files_search ON kms_files USING GIN(search_vector);

-- Trigger to update on insert/update
CREATE TRIGGER trg_kms_files_search
  BEFORE INSERT OR UPDATE ON kms_files
  FOR EACH ROW EXECUTE FUNCTION
    tsvector_update_trigger(search_vector, 'pg_catalog.english', name, description, content_text);
```

Query: `WHERE search_vector @@ plainto_tsquery('english', $1)`
Rank: `ts_rank_cd(search_vector, query)` for score.

## Qdrant Semantic Search

```python
# Query with user isolation (mandatory)
results = qdrant_client.search(
    collection_name="kms_content",
    query_vector=embed(query_text),        # 384-dim
    query_filter=Filter(must=[
        FieldCondition(key="user_id", match=MatchValue(value=user_id))
    ]),
    limit=50,                              # fetch more than needed for RRF merge
    with_payload=True,
)
```

HNSW config: `m=16`, `ef_construct=100`, `ef=128` at query time for recall/speed balance.

## Boost Factors

After RRF merge, apply these multipliers:
- **Name match** (query appears in filename): +0.20
- **Recency boost**: files < 7 days old: +0.10
- **Tag match**: query matches a tag: +0.15
- **Collection boost**: file in user's active collection: +0.05

## Redis Cache Strategy

- Key: `search:{user_id}:{query_hash}:{filters_hash}`
- TTL: 5 minutes
- Invalidate on: file upload, file delete, tag change for that user
- Cache hit: return immediately, skip PostgreSQL + Qdrant

## Performance Target

- p95 latency: < 500ms end-to-end
- p99 latency: < 1000ms
- Cache hit ratio target: > 60% for repeat queries

## Quality Checklist

- [ ] Every Qdrant query includes `user_id` filter (multi-tenant isolation)
- [ ] RRF k=60 used consistently
- [ ] Cache key includes filters hash (avoid stale results on filter change)
- [ ] Top-N from each source >= 50 before RRF merge
- [ ] Boost factors applied after merge, not before
