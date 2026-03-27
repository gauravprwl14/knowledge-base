# 0010 — Qdrant as Vector Database

- **Status**: Accepted
- **Date**: 2026-03-17
- **Deciders**: Architecture Team
- **Tags**: [ai, search, vector-db]

## Context and Problem Statement

Semantic search and RAG require a vector store for embedding retrieval. The store must support: HNSW approximate nearest neighbor, payload filtering (by user_id, source_id), scalar quantization to reduce memory, and hybrid search (dense + sparse).

## Decision Outcome

Chosen: **Qdrant** — Native HNSW with scalar INT8 quantization, rich payload filtering, built-in sparse vector support for hybrid search, and self-hosted Docker image.

### Qdrant Collection Configuration

```python
from qdrant_client.models import Distance, VectorParams, ScalarQuantizationConfig

client.create_collection(
    collection_name="kms_chunks",
    vectors_config=VectorParams(
        size=1024,            # BGE-M3 dense dimensions
        distance=Distance.COSINE,
    ),
    hnsw_config={
        "m": 16,              # Graph connectivity — sweet spot for recall/speed
        "ef_construct": 200,  # Build-time accuracy
    },
    quantization_config=ScalarQuantizationConfig(
        type="int8",          # ~4x memory reduction vs float32
        always_ram=True,
    ),
)
```

### Consequences

**Good:**
- Scalar INT8 quantization reduces 1024-dim float32 index (4GB for 1M chunks) to ~1GB
- Payload filtering enables per-user result isolation without separate collections
- Built-in sparse vector field for BM25-style lexical recall (BGE-M3 sparse mode)
- Python and TypeScript clients available

**Bad / Trade-offs:**
- Separate infrastructure component (not co-located with Postgres)
- No ACID transactions across Qdrant + Postgres (eventual consistency accepted)
