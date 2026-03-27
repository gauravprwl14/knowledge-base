---
id: 20-dedup-pipeline
created_at: 2026-03-18
content_type: sequence-diagram
status: accepted
generator_model: claude-sonnet-4-6
---

# 20 — Deduplication Pipeline

## Overview

When `scan-worker` discovers a file, it publishes a `DedupCheckMessage` to
`kms.dedup` in parallel with the `FileDiscoveredMessage` to `kms.embed`. The
`dedup-worker` checks a Redis SHA-256 hash cache first. On a cache hit the file
is marked as a `DUPLICATE` and no further processing is performed. On a cache
miss the worker queries PostgreSQL for the same hash (cross-source duplicate
check). If still not found, a semantic similarity check is performed against
Qdrant (threshold 0.98 cosine). Unique files are written to the Redis cache with
a 30-day TTL and marked `UNIQUE` in `kms_files`.

## Participants

| Alias | Service |
|-------|---------|
| `SW` | scan-worker |
| `MQ` | RabbitMQ (`kms.dedup` queue) |
| `DW` | dedup-worker |
| `RD` | Redis |
| `DB` | PostgreSQL |
| `QD` | Qdrant |

## Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant SW as scan-worker
    participant MQ as RabbitMQ
    participant DW as dedup-worker
    participant RD as Redis
    participant DB as PostgreSQL
    participant QD as Qdrant

    SW->>SW: compute SHA-256 hash of file content
    SW->>MQ: publish DedupCheckMessage { file_id, sha256, user_id } to kms.dedup

    Note over MQ,DW: Async — dedup-worker consumes independently of embed-worker

    MQ-->>DW: consume DedupCheckMessage
    DW->>DW: validate message via Pydantic

    alt Invalid message
        DW->>MQ: reject(requeue=False) — routes to DLQ
    end

    DW->>RD: GET dedup:{user_id}:{sha256}
    RD-->>DW: cached_file_id (or nil)

    alt Cache HIT — known duplicate
        DW->>DB: UPDATE kms_files SET dedup_status='DUPLICATE' WHERE id = $1
        DW->>MQ: ack message
        Note over DW: Stop — embed-worker already received FileDiscoveredMessage<br/>separately; dedup does NOT block embedding in current implementation
    end

    Note over DW: Cache MISS — proceed to DB check

    DW->>DB: SELECT id FROM kms_files WHERE sha256 = $1 AND user_id = $2 AND id != $3
    DB-->>DW: existing_file_id (or null)

    alt DB HIT — same hash from different source
        DW->>DB: UPDATE kms_files SET dedup_status='DUPLICATE' WHERE id = $1
        DW->>MQ: ack message
    end

    Note over DW: Not found in cache or DB — semantic check

    DW->>QD: search kms_chunks collection with query vector, filter: { user_id }, top_k=1
    QD-->>DW: { id, score, payload }

    alt Qdrant score >= 0.98 (near-duplicate)
        DW->>DB: UPDATE kms_files SET dedup_status='NEAR_DUPLICATE' WHERE id = $1
        DW->>DB: INSERT INTO kms_file_versions (canonical_file_id, duplicate_file_id)
        DW->>MQ: ack message
    end

    Note over DW: Unique file — record in cache and DB

    DW->>RD: SET dedup:{user_id}:{sha256} {file_id} EX 2592000 (30 days)
    RD-->>DW: OK
    DW->>DB: UPDATE kms_files SET dedup_status='UNIQUE' WHERE id = $1
    DW->>MQ: ack message
```

## Notes

1. **Redis cache key**: `dedup:{user_id}:{sha256}` (full 64-char hex). TTL is 30 days (2 592 000 seconds). The cache is the first and cheapest check — it short-circuits most duplicate detection.
2. **DB check** catches cross-source duplicates: the same file ingested from two different sources (e.g., local folder and Google Drive) will share a SHA-256 hash but have different `source_id` values.
3. **Semantic check** uses a Qdrant ANN search with the file's own embedding vector (if already generated). A cosine similarity >= 0.98 is classified as a near-duplicate. This check is skipped if the embedding is not yet available.
4. **`kms_file_versions`** links near-duplicates: `canonical_file_id` points to the first-seen version; `duplicate_file_id` points to the near-duplicate. Multiple versions of the same document are grouped via this table.
5. **dedup does NOT block embedding** — `kms.dedup` and `kms.embed` are published to concurrently by scan-worker. The dedup decision is advisory; the embed-worker processes files independently.
6. **AMQP error handling**: `KMSWorkerError(retryable=True)` → `nack(requeue=True)`; `KMSWorkerError(retryable=False)` → `reject(requeue=False)` → DLQ.

## Error Flows

| Step | Failure | Error Type | Handling |
|------|---------|------------|----------|
| Parse | Malformed JSON / missing fields | `ValidationError` | `reject(requeue=False)` → DLQ |
| Redis GET/SET | Connection error | `HashLookupError(retryable=True)` | `nack(requeue=True)` |
| DB UPDATE | Constraint / connection error | `DatabaseError(retryable=True)` | `nack(requeue=True)` |
| Qdrant search | Timeout or connection error | `retryable=True` | `nack(requeue=True)` |
| Unexpected | Unhandled exception | — | `nack(requeue=True)` |

## Dependencies

- `scan-worker`: Computes SHA-256, publishes `DedupCheckMessage` to `kms.dedup`
- `dedup-worker`: Hash cache lookup, DB check, semantic check, status update
- `Redis`: `dedup:{user_id}:{sha256}` key (TTL 30 days)
- `PostgreSQL`: `kms_files.dedup_status`, `kms_file_versions` table
- `Qdrant`: Near-duplicate semantic check (cosine threshold 0.98)
