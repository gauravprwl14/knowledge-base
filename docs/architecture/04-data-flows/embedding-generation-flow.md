# Embedding Generation Flow

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The embedding generation flow transforms file content into searchable vector representations. This enables semantic search by converting text into mathematical vectors that capture meaning.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        EMBEDDING GENERATION FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────┐
    │                            RabbitMQ                                      │
    │  ┌─────────────────────────────────────────────────────────────────┐    │
    │  │                      embed.queue                                 │    │
    │  │                                                                  │    │
    │  │  Message: { file_id, source_id, mime_type, ... }                │    │
    │  └─────────────────────────────────────────────────────────────────┘    │
    └─────────────────────────────────┬───────────────────────────────────────┘
                                      │ 1. Consume message
                                      ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                       EMBEDDING-WORKER                                   │
    │                                                                          │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 1: Download File Content                                     │   │
    │  │                                                                   │   │
    │  │  - Google Drive: Download via API                                │   │
    │  │  - Local FS: Read from mounted path                              │   │
    │  │  - Cache to temp directory                                       │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 2: Content Extraction                                        │   │
    │  │                                                                   │   │
    │  │  Select extractor based on mime_type:                            │   │
    │  │  - PDF → PyPDF2/pdfplumber                                       │   │
    │  │  - DOCX → python-docx                                            │   │
    │  │  - XLSX → openpyxl                                               │   │
    │  │  - Text → direct read                                            │   │
    │  │  - Code → syntax-aware extraction                                │   │
    │  │                                                                   │   │
    │  │  Output: { text, metadata, word_count, language }                │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 3: Text Chunking                                             │   │
    │  │                                                                   │   │
    │  │  Parameters:                                                      │   │
    │  │  - chunk_size: 1000 characters                                   │   │
    │  │  - chunk_overlap: 200 characters                                 │   │
    │  │  - min_chunk_size: 100 characters                                │   │
    │  │                                                                   │   │
    │  │  Algorithm:                                                       │   │
    │  │  1. Split text into paragraphs                                   │   │
    │  │  2. Group paragraphs into chunks                                 │   │
    │  │  3. Add overlap between chunks                                   │   │
    │  │  4. Preserve semantic boundaries                                 │   │
    │  │                                                                   │   │
    │  │  Output: [ {text, index, start_char, end_char}, ... ]            │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 4: Embedding Generation                                      │   │
    │  │                                                                   │   │
    │  │  Model: sentence-transformers/all-MiniLM-L6-v2                   │   │
    │  │  Dimension: 384                                                  │   │
    │  │  Batch size: 32                                                  │   │
    │  │                                                                   │   │
    │  │  For each batch of chunks:                                       │   │
    │  │  1. Tokenize text                                                │   │
    │  │  2. Run through transformer                                      │   │
    │  │  3. Mean pool token embeddings                                   │   │
    │  │  4. L2 normalize                                                 │   │
    │  │                                                                   │   │
    │  │  Output: [ [0.12, -0.45, ...], ... ] (384-dim vectors)          │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 5: Vector Storage                                            │   │
    │  │                                                                   │   │
    │  │  Qdrant Operations:                                              │   │
    │  │  1. Delete existing points for file_id                           │   │
    │  │  2. Upsert new points with payload                               │   │
    │  │                                                                   │   │
    │  │  Point structure:                                                │   │
    │  │  {                                                               │   │
    │  │    id: UUID,                                                     │   │
    │  │    vector: [0.12, -0.45, ...],                                  │   │
    │  │    payload: { file_id, chunk_index, user_id, mime_type, ... }   │   │
    │  │  }                                                              │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 6: Update Database & Publish                                 │   │
    │  │                                                                   │   │
    │  │  PostgreSQL:                                                     │   │
    │  │  - Update kms_files.embedding_status = 'completed'               │   │
    │  │  - Update kms_files.chunk_count, word_count                      │   │
    │  │  - Insert kms_embeddings references                              │   │
    │  │                                                                   │   │
    │  │  RabbitMQ:                                                       │   │
    │  │  - Publish EMBEDDING_COMPLETED to dedup.queue                    │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                                                                          │
    └─────────────────────────────────┬───────────────────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
    ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
    │    PostgreSQL     │   │      Qdrant       │   │     RabbitMQ      │
    │                   │   │                   │   │                   │
    │  kms_files        │   │  kms_files_default│   │  dedup.queue      │
    │  kms_embeddings   │   │  (vectors)        │   │                   │
    └───────────────────┘   └───────────────────┘   └───────────────────┘
```

---

## Sequence Diagram

```
embed.queue    embedding-worker    MinIO/Drive    Extractor    Embedder    Qdrant    PostgreSQL    dedup.queue
    │               │                   │             │            │          │           │            │
    │──consume─────►│                   │             │            │          │           │            │
    │               │                   │             │            │          │           │            │
    │               │──download file───►│             │            │          │           │            │
    │               │◄──file content────│             │            │          │           │            │
    │               │                   │             │            │          │           │            │
    │               │──extract text────────────────►│             │          │           │            │
    │               │◄──{text, meta}────────────────│             │          │           │            │
    │               │                   │             │            │          │           │            │
    │               │──chunk text──────────────────────────────────►         │           │            │
    │               │◄──chunks[]────────────────────────────────────         │           │            │
    │               │                   │             │            │          │           │            │
    │               │──generate vectors────────────────────────────►         │           │            │
    │               │◄──embeddings[]────────────────────────────────         │           │            │
    │               │                   │             │            │          │           │            │
    │               │──delete old points────────────────────────────────────►│           │            │
    │               │──upsert points───────────────────────────────────────►│           │            │
    │               │                   │             │            │          │           │            │
    │               │──update status──────────────────────────────────────────────────►│             │
    │               │──insert embeddings────────────────────────────────────────────────►            │
    │               │                   │             │            │          │           │            │
    │               │──publish────────────────────────────────────────────────────────────────────►│
    │               │                   │             │            │          │           │            │
```

---

## Content Extraction by Type

### PDF Extraction

```python
# Strategy selection based on PDF complexity
async def extract_pdf(file_path: str) -> ExtractedContent:
    # Try fast extraction first
    text = await extract_pypdf2(file_path)

    # If poor results, use complex extraction
    if not text or len(text) < 100:
        text = await extract_pdfplumber(file_path)

    # Detect language
    language = detect_language(text)

    return ExtractedContent(
        text=clean_text(text),
        metadata=extract_pdf_metadata(file_path),
        word_count=count_words(text),
        language=language
    )
```

### Office Documents

```python
# DOCX extraction
async def extract_docx(file_path: str) -> ExtractedContent:
    doc = Document(file_path)

    # Extract paragraphs preserving structure
    text_parts = []
    for para in doc.paragraphs:
        if para.text.strip():
            # Preserve headings with markdown
            if para.style.name.startswith('Heading'):
                level = int(para.style.name[-1]) if para.style.name[-1].isdigit() else 1
                text_parts.append('#' * level + ' ' + para.text)
            else:
                text_parts.append(para.text)

    # Extract tables
    for table in doc.tables:
        table_text = convert_table_to_text(table)
        text_parts.append(table_text)

    return ExtractedContent(text='\n\n'.join(text_parts), ...)
```

### Supported MIME Types

| MIME Type | Extractor | Notes |
|-----------|-----------|-------|
| `application/pdf` | PDFExtractor | PyPDF2 + pdfplumber |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | DocxExtractor | python-docx |
| `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | ExcelExtractor | openpyxl |
| `text/plain` | TextExtractor | Direct read |
| `text/markdown` | TextExtractor | Direct read |
| `application/json` | TextExtractor | JSON pretty print |
| `text/html` | HTMLExtractor | BeautifulSoup |
| `application/vnd.google-apps.document` | GoogleDocsExtractor | Export as DOCX |

---

## Chunking Strategy

### Algorithm Visualization

```
Original Text:
┌─────────────────────────────────────────────────────────────────────┐
│ Paragraph 1 (400 chars)                                              │
│ ─────────────────────                                                │
│ Paragraph 2 (300 chars)                                              │
│ ─────────────────                                                    │
│ Paragraph 3 (500 chars)                                              │
│ ───────────────────────                                              │
│ Paragraph 4 (200 chars)                                              │
│ ────────────                                                         │
│ Paragraph 5 (400 chars)                                              │
│ ─────────────────────                                                │
└─────────────────────────────────────────────────────────────────────┘

Chunks (size=1000, overlap=200):
┌──────────────────────────────────────────┐
│ Chunk 0: P1 + P2 + P3[:300]              │ 1000 chars
│          (400 + 300 + 300)               │
└───────────────────────────────┬──────────┘
                                │ overlap
                    ┌───────────┴──────────────────────┐
                    │ Chunk 1: P3[300:] + P4 + P5[:300] │ 1000 chars
                    │          (200 + 200 + 400 + 200)  │
                    └───────────────────────┬──────────┘
                                            │ overlap
                            ┌───────────────┴──────────┐
                            │ Chunk 2: P5[300:]        │ 300 chars (final)
                            └──────────────────────────┘
```

### Chunk Metadata

```json
{
  "text": "This is the chunk content...",
  "index": 0,
  "start_char": 0,
  "end_char": 1000,
  "metadata": {
    "file_id": "uuid",
    "total_chunks": 3,
    "has_overlap": false
  }
}
```

---

## Embedding Model

### Model Configuration

```python
MODEL_CONFIG = {
    'name': 'all-MiniLM-L6-v2',
    'dimension': 384,
    'max_sequence_length': 256,
    'pooling': 'mean',
    'normalize': True
}
```

### Batch Processing

```python
async def generate_embeddings(chunks: List[str], batch_size: int = 32):
    """Generate embeddings in batches for efficiency"""
    embeddings = []

    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]

        # Tokenize and encode
        batch_embeddings = model.encode(
            batch,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False
        )

        embeddings.extend(batch_embeddings.tolist())

    return embeddings
```

---

## Qdrant Storage

### Collection Schema

```python
collection_config = {
    "collection_name": "kms_files_default",
    "vectors_config": {
        "size": 384,
        "distance": "Cosine"
    },
    "hnsw_config": {
        "m": 16,
        "ef_construct": 100
    },
    "payload_schema": {
        "file_id": "keyword",
        "chunk_index": "integer",
        "source_id": "keyword",
        "user_id": "keyword",
        "mime_type": "keyword",
        "chunk_text": "text"
    }
}
```

### Upsert Operation

```python
async def store_embeddings(file_id: str, chunks: List, embeddings: List, metadata: dict):
    # Delete existing points for this file
    await qdrant.delete(
        collection_name="kms_files_default",
        points_selector={
            "filter": {
                "must": [{"key": "file_id", "match": {"value": file_id}}]
            }
        }
    )

    # Build points
    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=embedding,
            payload={
                "file_id": file_id,
                "chunk_index": i,
                "chunk_text": chunk.text[:500],
                **metadata
            }
        )
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings))
    ]

    # Batch upsert
    await qdrant.upsert(
        collection_name="kms_files_default",
        points=points,
        batch_size=100
    )
```

---

## Database Updates

### Update File Status

```sql
UPDATE kms_files
SET
    embedding_status = 'completed',
    chunk_count = $2,
    word_count = $3,
    updated_at = NOW()
WHERE id = $1;
```

### Insert Embedding References

```sql
INSERT INTO kms_embeddings (id, file_id, chunk_index, qdrant_point_id, chunk_text_preview)
SELECT
    gen_random_uuid(),
    $1,
    (row_data->>'chunk_index')::int,
    (row_data->>'qdrant_point_id')::uuid,
    row_data->>'chunk_text'
FROM jsonb_array_elements($2::jsonb) AS row_data;
```

---

## Error Handling

### Extraction Errors

| Error | Action |
|-------|--------|
| Unsupported format | Mark as 'skipped', log warning |
| Corrupted file | Mark as 'failed', store error |
| Empty content | Mark as 'completed' with 0 chunks |
| Encoding error | Try alternative encoding, then fail |

### Recovery Strategy

```python
try:
    content = await extractor.extract(file_path)
except UnsupportedFormatError:
    await mark_file_skipped(file_id, "Unsupported format")
    return
except ExtractionError as e:
    await mark_file_failed(file_id, str(e))
    raise  # Send to DLQ
```

---

## Performance Tuning

### Optimal Batch Sizes

| Operation | Batch Size | Reason |
|-----------|------------|--------|
| Embedding generation | 32 | GPU memory optimization |
| Qdrant upsert | 100 | Network efficiency |
| DB insert | 500 | Transaction overhead |

### Resource Limits

```yaml
embedding-worker:
  resources:
    limits:
      cpu: "4"
      memory: "8Gi"
    requests:
      cpu: "2"
      memory: "4Gi"
```

