# Flow: File Embedding Pipeline

## Overview

After scan-worker publishes a `FileDiscoveredMessage`, embed-worker extracts text from the file, splits it into overlapping chunks, generates BGE-M3 embeddings, and upserts them into Qdrant. A PostgreSQL record is created for each chunk.

## Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant Q as RabbitMQ (kms.embed)
    participant EW as embed-worker
    participant FS as File Storage (MinIO/local)
    participant DB as PostgreSQL
    participant QD as Qdrant

    Q-->>EW: consume FileDiscoveredMessage { file_id, path, mime_type }
    EW->>EW: kb.extract_text span<br/>PlainTextExtractor | PdfExtractor | DocxExtractor
    EW->>EW: kb.chunk_text span<br/>chunk_size=512, overlap=64, word-boundary snap

    loop For each chunk batch (up to 32 chunks)
        EW->>EW: kb.embed_query span<br/>BGE-M3 dense + sparse vectors
        EW->>DB: INSERT INTO kms_chunks ON CONFLICT (checksum_sha256, source_id) DO NOTHING
        EW->>QD: kb.vector_upsert span<br/>upsert dense + sparse vectors with payload { user_id, source_id, file_id }
    end

    EW->>DB: UPDATE kms_files SET embedding_status = 'completed'
    EW->>Q: ack message
```

## Error Flows

| Step | Failure | Handling |
|---|---|---|
| Text extraction fails | `ExtractionError` raised | `nack(requeue=False)` — routes to DLQ; file marked `extraction_failed` |
| BGE-M3 model unavailable | `EmbeddingError` (retryable) | `nack(requeue=True)` — requeued with backoff |
| Qdrant unavailable | `retryable=True` | `nack(requeue=True)` — retried up to 3x |
| DB upsert conflict | `ON CONFLICT DO NOTHING` | Idempotent — already indexed |

## Chunk Storage Schema

```sql
CREATE TABLE kms_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL,
    source_id UUID NOT NULL,
    user_id UUID NOT NULL,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    checksum_sha256 CHAR(64) NOT NULL,
    token_count INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (checksum_sha256, source_id)
);
```

## Dependencies

- `RabbitMQ`: `kms.embed` queue (input)
- `embed-worker`: BGE-M3 model via `FlagEmbedding`
- `PostgreSQL`: `kms_chunks` table
- `Qdrant`: `kms_chunks` collection (1024-dim, INT8 quantized)
