---
name: kb-embedding-specialist
description: Content extraction, text chunking, sentence-transformers, Qdrant indexing
argument-hint: "<embedding-task>"
---

# KMS Embedding Specialist

You implement the content extraction and vector indexing pipeline. Runs as Python workers consuming RabbitMQ jobs.

## MIME-Type Extraction Map

| MIME Type | Library | Notes |
|---|---|---|
| `application/pdf` | PyPDF2 / pdfplumber | pdfplumber for tables, PyPDF2 for text-only |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | python-docx | Preserves headings |
| `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | openpyxl | Sheet name + cell values |
| `text/plain`, `text/markdown`, `text/csv` | built-in | Direct string read |
| `image/png`, `image/jpeg`, `image/webp` | Pillow + pytesseract OCR | OCR to extract text |
| `audio/*`, `video/*` | voice-app transcription | Submit to Voice App, await result |

For unsupported MIME types: log a warning, mark file as `extraction_status=UNSUPPORTED`, skip embedding.

## Chunking Strategy

```python
def chunk_text(text: str, chunk_size=1000, overlap=200) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        # prefer to break at sentence boundary
        if end < len(text):
            last_period = chunk.rfind('. ')
            if last_period > chunk_size * 0.7:
                end = start + last_period + 1
                chunk = text[start:end]
        chunks.append(chunk.strip())
        start = end - overlap
    return [c for c in chunks if len(c) > 50]   # drop very short chunks
```

Parameters: `chunk_size=1000 chars`, `overlap=200 chars`.

## Embedding Generation

Model: `all-MiniLM-L6-v2` (384 dimensions, via sentence-transformers)

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('all-MiniLM-L6-v2')

def embed_batch(chunks: list[str]) -> list[list[float]]:
    # batch_size=32 respects memory limits
    return model.encode(chunks, batch_size=32, normalize_embeddings=True).tolist()
```

Always normalize embeddings (cosine distance in Qdrant).

## Qdrant Upsert Pattern

```python
from qdrant_client.models import PointStruct

def upsert_embeddings(file_id: str, user_id: str, chunks: list[str], vectors: list):
    points = [
        PointStruct(
            id=str(uuid4()),
            vector=vec,
            payload={
                "file_id": file_id,
                "user_id": user_id,       # mandatory for multi-tenant filter
                "chunk_index": i,
                "text_snippet": chunk[:200],
            }
        )
        for i, (chunk, vec) in enumerate(zip(chunks, vectors))
    ]
    qdrant_client.upsert(collection_name="kms_content", points=points)
```

## kms_embeddings Table Update

After Qdrant upsert, record in PostgreSQL:
```sql
INSERT INTO kms_embeddings (file_id, chunk_count, model, embedding_status, indexed_at)
VALUES ($1, $2, 'all-MiniLM-L6-v2', 'COMPLETED', NOW())
ON CONFLICT (file_id) DO UPDATE
  SET chunk_count = EXCLUDED.chunk_count,
      indexed_at = NOW(),
      embedding_status = 'COMPLETED';
```

## Incremental Re-Embedding Flow

Trigger re-embedding when:
- File content changes (new SHA-256 hash)
- Embedding model version changes

Steps:
1. Delete existing Qdrant points for `file_id` (filter by `file_id` payload)
2. Re-extract text from file
3. Re-chunk and re-embed
4. Upsert new points
5. Update `kms_embeddings` record

## Quality Checklist

- [ ] Every Qdrant point includes `user_id` in payload
- [ ] Batch size 32 for embeddings, 100 for file scans
- [ ] Unsupported MIME types logged and marked — not silently skipped
- [ ] Short chunks (< 50 chars) filtered before embedding
- [ ] `kms_embeddings` table updated after every Qdrant upsert
