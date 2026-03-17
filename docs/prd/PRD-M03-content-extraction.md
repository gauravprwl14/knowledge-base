# PRD: M03 — Content Extraction & Processing

## Status

`Approved`

**Created**: 2026-03-17
**Depends on**: M00, M02 (file discovery puts files in queue)

---

## Business Context

Files are useless to KMS unless their text content is extracted. This module transforms binary files (PDFs, DOCX, Excel, images) into searchable, embeddable plain text. The extractor runs inside `embed-worker`, consuming `FileDiscoveredMessage` from `kms.embed` queue. Chunking produces fixed-size overlapping text units that fit LLM context windows and embedding model limits.

---

## User Stories

| As a... | I want to... | So that... |
|---------|-------------|-----------|
| User | Upload a PDF and search its content | I can find information inside PDFs |
| User | Upload a DOCX and find text from it | Word docs are searchable |
| User | Understand which files failed extraction | I can investigate and fix them |

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | Extract text from: TXT, MD, CSV, JSON | Must |
| FR-02 | Extract text from: PDF (pdfminer.six, handles multi-column) | Must |
| FR-03 | Extract text from: DOCX (python-docx) | Must |
| FR-04 | Extract text from: XLSX (openpyxl → markdown table) | Should |
| FR-05 | Extract text from: images via OCR (pytesseract, feature-flagged) | Could |
| FR-06 | Extract metadata from audio/video: title, duration, codec (not transcription) | Should |
| FR-07 | Chunk text: 512-char chunks, 64-char overlap, word-boundary snap | Must |
| FR-08 | Store chunks in `kms_chunks` with checksum, position, token_count | Must |
| FR-09 | Skip extraction for MIME types with no extractor — log + mark `skipped` | Must |
| FR-10 | `extraction_failed` files: DLQ + mark `kms_files.extraction_status = failed` | Must |

---

## Non-Functional Requirements

| Concern | Requirement |
|---------|-------------|
| Throughput | ≥ 100 files/min (plain text); ≥ 20 files/min (PDF) |
| Max file size | 500MB (configurable) |
| PDF timeout | 60s per file (large PDFs) |
| Idempotency | Same file → same chunk checksums → `ON CONFLICT DO NOTHING` |

---

## Extractor Registry

```python
MIME_TO_EXTRACTOR = {
    "text/plain": PlainTextExtractor,
    "text/markdown": PlainTextExtractor,
    "text/csv": PlainTextExtractor,
    "application/pdf": PdfExtractor,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": DocxExtractor,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": XlsxExtractor,
    "image/png": ImageExtractor,   # feature-gated
    "image/jpeg": ImageExtractor,  # feature-gated
}
```

---

## Chunking Algorithm

```python
def chunk_text(text: str, chunk_size: int = 512, overlap: int = 64) -> list[str]:
    """Split text into overlapping chunks, snapping to word boundaries."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        if end < len(text):
            # Snap to nearest word boundary
            while end > start and text[end] not in " \n\t":
                end -= 1
        chunks.append(text[start:end].strip())
        start = end - overlap
    return [c for c in chunks if len(c) > 10]  # skip tiny chunks
```

---

## Error Codes

| Code | Retryable | Description |
|------|-----------|-------------|
| `KBWRK2001` | No | Text extraction failed (corrupted or unsupported format) |
| `KBWRK2002` | Yes | DB unavailable during chunk insert |
| `KBWRK2003` | No | File exceeds max size limit |

---

## DB Schema

```sql
CREATE TABLE kms_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES kms_sources(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    name VARCHAR(500) NOT NULL,
    path TEXT NOT NULL,
    mime_type VARCHAR(100),
    size_bytes BIGINT,
    sha256 CHAR(64),
    extraction_status VARCHAR(20) DEFAULT 'pending',
    -- pending | extracting | completed | failed | skipped
    extracted_at TIMESTAMPTZ,
    embedding_status VARCHAR(20) DEFAULT 'pending',
    junk_status VARCHAR(20),
    junk_reason TEXT,
    junk_confidence REAL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE kms_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES kms_files(id) ON DELETE CASCADE,
    source_id UUID NOT NULL,
    user_id UUID NOT NULL,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    checksum_sha256 CHAR(64),
    token_count INT,
    embedding_status VARCHAR(20) DEFAULT 'pending',
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (checksum_sha256, source_id)
);
```

---

## Testing Plan

| Test Type | Key Cases |
|-----------|-----------|
| Unit: PlainTextExtractor | TXT, MD, CSV — verify text returned |
| Unit: PdfExtractor | Simple PDF, multi-column PDF, password-protected (should fail gracefully) |
| Unit: DocxExtractor | Basic DOCX, DOCX with images (images skipped) |
| Unit: TextChunker | Short text (< chunk_size), overlap correctness, word-boundary snap |
| Unit: error handling | Corrupted file → ExtractionError raised, nack to DLQ |
