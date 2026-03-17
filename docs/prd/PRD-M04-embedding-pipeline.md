# PRD: M04 — Embedding & Indexing Pipeline

## Status

`Approved`

**Created**: 2026-03-17
**Depends on**: M00, M03 (chunks exist in DB)
**Feature gate**: `features.embedding.enabled` — all tasks below are no-ops when false

---

## Business Context

Embeddings transform text chunks into dense + sparse vectors that enable semantic search. BGE-M3 was chosen for its multilingual capability, 8K context window, and three retrieval modes (dense, sparse, ColBERT). Vectors are stored in Qdrant. Enabling this module unlocks semantic search (M05) and RAG chat (M10). Without embeddings, KMS falls back to keyword-only search — still useful, just less powerful.

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | Load `BAAI/bge-m3` model once on worker startup (singleton, not per-message) | Must |
| FR-02 | Generate dense vector (1024-dim) + sparse vector per chunk | Must |
| FR-03 | Batch chunks (up to 32 per batch) for GPU-efficient inference | Must |
| FR-04 | Upsert to Qdrant: `kms_chunks` collection, payload `{ user_id, source_id, file_id, chunk_index }` | Must |
| FR-05 | On upsert success: UPDATE `kms_chunks SET embedding_status = 'completed'` | Must |
| FR-06 | On Qdrant unreachable: retryable error, nack + requeue | Must |
| FR-07 | `kb.vector_upsert` OTel span with `upserted_count` attribute | Must |
| FR-08 | Expose `POST /embed` HTTP endpoint for search-api query embedding | Must |
| FR-09 | GPU detection at startup: CUDA if available, CPU fallback | Should |
| FR-10 | `POST /api/v1/files/{id}/reindex` — kms-api endpoint to re-trigger embedding | Should |

---

## Non-Functional Requirements

| Concern | Requirement |
|---------|-------------|
| Throughput | ≥ 100 chunks/min on CPU; ≥ 1000 chunks/min on GPU |
| Model load | < 30s cold start (model cached in container volume) |
| Qdrant collection | 1024-dim, m=16, ef_construct=200, INT8 scalar quantization |
| Idempotency | Re-embedding same chunk = upsert (Qdrant idempotent) |

---

## Qdrant Collection Config

```python
client.create_collection(
    collection_name="kms_chunks",
    vectors_config=VectorParams(
        size=1024,
        distance=Distance.COSINE,
    ),
    sparse_vectors_config={
        "sparse": SparseVectorParams()  # BGE-M3 sparse output
    },
    hnsw_config=HnswConfigDiff(m=16, ef_construct=200),
    quantization_config=ScalarQuantization(
        scalar=ScalarQuantizationConfig(type=ScalarType.INT8, always_ram=True)
    ),
)
```

---

## Queue Message

```python
class EmbedJobMessage(BaseModel):
    file_id: str
    chunk_ids: list[str]  # batch of chunk UUIDs to embed
    user_id: str
    source_id: str
```

---

## Testing Plan

| Test Type | Key Cases |
|-----------|-----------|
| Unit | BGEEmbeddingProvider — mock model, verify vector dimensions (1024) |
| Unit | Batch chunking — 32 chunks per batch, remainder handled |
| Integration | Qdrant upsert — mock client, verify payload structure |
| Integration | Retry on Qdrant down — nack with requeue, not to DLQ |
