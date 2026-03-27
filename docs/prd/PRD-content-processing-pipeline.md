---
title: Content Processing Pipeline — Engineering Spec PRD
status: Draft
version: 1.0
created: 2026-03-17
milestone: M3/M4 (overlapping)
owner: Product
---

# PRD: Content Processing Pipeline

Engineering-level specification for the pipeline that transforms raw file bytes into indexed, embeddable, searchable knowledge. This document is the authoritative reference for the `embed-worker` Python service and its interaction with `kms-api`, Qdrant, PostgreSQL, and RabbitMQ.

See [PRD-document-intelligence.md](./PRD-document-intelligence.md) for the product-level specification (discovery UI, search UX, ranking).

---

## 1. Problem Statement

When a file is discovered by `scan-worker` and a `FileDiscoveredMessage` is published to the `kms.embed` queue, nothing happens until a worker processes it. That worker must:

1. Detect the file's true type (not trust the extension)
2. Select the right extractor for that type
3. Extract text faithfully, preserving structure signals (headings, pages, tables)
4. Split text into chunks that fit the embedding model's context window
5. Generate dense + sparse vectors via BGE-M3
6. Upsert those vectors to Qdrant
7. Store chunk metadata in PostgreSQL
8. Update the file's status throughout the process
9. Handle every failure mode with the correct retry/DLQ strategy

This PRD defines every stage in that pipeline precisely enough that an engineer can implement it without ambiguity.

---

## 2. Target Users & Personas

This PRD is written for:
- **Backend engineers** implementing `embed-worker` and related kms-api endpoints
- **DevOps** configuring worker concurrency and queue routing
- **QA** writing integration tests for the pipeline

End users are indirectly served — they see the result (searchable content, accurate status badges) but do not interact with this pipeline directly.

---

## 3. Goals & Non-Goals

### Goals

| # | Goal |
|---|------|
| G1 | 100% of supported MIME types have a defined extractor and chunking strategy |
| G2 | Extraction failure for one file must not affect any other file in the queue |
| G3 | The same file processed twice must produce bit-identical chunk checksums (idempotency) |
| G4 | Every pipeline stage emits an OTel span and structured log entry |
| G5 | Engineers can add a new extractor by implementing one interface and registering one MIME mapping |

### Non-Goals

- LLM-based summarisation during pipeline (post-MVP, requires `features.rag.enabled`)
- Real-time streaming extraction results to frontend (status is polled)
- Virus scanning beyond a logging stub (third-party AV integration is post-MVP)

---

## 4. User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-P1 | Engineer | Add support for a new file type by implementing `BaseExtractor` | New formats can be added without touching pipeline orchestration |
| US-P2 | Engineer | See exactly which extraction stage failed and why in logs | I can debug extraction failures without replaying messages |
| US-P3 | User | Have failed files visible with a human-readable error message | I can investigate and retry without guessing what went wrong |
| US-P4 | User | Have a re-indexed file's old chunks replaced, not duplicated | Retrying doesn't pollute search results |
| US-P5 | DevOps | Configure worker concurrency and batch size via config | I can tune throughput without code changes |

**BDD Acceptance Criteria — US-P1:**
```
Given an engineer creates a new class `MarkdownExtractor` inheriting `BaseExtractor`
And registers it in MIME_TO_EXTRACTOR under "text/markdown"
When embed-worker receives a FileDiscoveredMessage for a .md file
Then the MarkdownExtractor.extract() method is called
And the resulting chunks are stored in kms_chunks
And the file status transitions to INDEXED
Without any changes to the pipeline orchestration code
```

**BDD Acceptance Criteria — US-P4:**
```
Given a PDF file has been indexed and has 30 chunks in kms_chunks
When the user triggers a reindex via POST /api/v1/files/{id}/reindex
Then the pipeline deletes the existing 30 chunks from kms_chunks before extracting
And removes the existing Qdrant vectors by file_id payload filter before upserting new ones
And the file ends up with exactly the new chunk set (no duplicates)
```

---

## 5. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Worker starts up, loads BGE-M3 model into memory as singleton before consuming messages | Must |
| FR-002 | Worker consumes messages from `kms.embed` queue; prefetch = 1 (configurable) | Must |
| FR-003 | On message receipt: call `kms-api PATCH /internal/files/{id}` to set `status = PROCESSING` | Must |
| FR-004 | MIME type detection via `python-magic` on raw bytes (not filename extension) | Must |
| FR-005 | File bytes fetched from storage: local path for LOCAL sources; Drive API `files.get(alt=media)` for GOOGLE_DRIVE | Must |
| FR-006 | Virus scan stub: log `{ file_id, sha256, scan_stub: true }`; never block extraction | Could |
| FR-007 | Extractor selected from `MIME_TO_EXTRACTOR` registry; unknown MIME → `MetadataOnlyExtractor` | Must |
| FR-008 | Extractor timeout: hard 60-second timeout per file; raise `ExtractionTimeoutError` on breach | Must |
| FR-009 | Chunker splits extracted text using `TextChunker.chunk(text, size=512, overlap=64)` | Must |
| FR-010 | Each chunk assigned a `checksum_sha256 = sha256(file_id + str(chunk_index) + content)` | Must |
| FR-011 | Chunk insert: `INSERT INTO kms_chunks … ON CONFLICT (checksum_sha256, file_id) DO NOTHING` | Must |
| FR-012 | Embedding batch: group chunks in batches of 32; call `BGEEmbeddingProvider.encode_batch(texts)` | Must |
| FR-013 | BGEEmbeddingProvider returns `{ dense: list[list[float]], sparse: list[dict] }` per batch | Must |
| FR-014 | Qdrant upsert: `client.upsert(collection_name="kms_chunks", points=[...])` with payload `{ user_id, source_id, file_id, chunk_index, content_preview }` | Must |
| FR-015 | On successful upsert: `UPDATE kms_chunks SET embedding_status = 'completed', qdrant_id = <point_id>` | Must |
| FR-016 | On full pipeline success: `PATCH /internal/files/{id}` → `status = INDEXED`, `indexed_at = now()` | Must |
| FR-017 | On extraction failure: `PATCH /internal/files/{id}` → `status = ERROR`, `error_message = <human-readable>`; `nack(requeue=False)` → message goes to DLQ | Must |
| FR-018 | On Qdrant timeout/unreachable: `nack(requeue=True)` (retryable); retry up to 3 times with exponential backoff | Must |
| FR-019 | On DB unavailable: `nack(requeue=True)` (retryable) | Must |
| FR-020 | On file too large: set `status = UNSUPPORTED`, `error_message = "File exceeds 500 MB size limit"`; `reject()` (no DLQ) | Must |
| FR-021 | On MIME type with no extractor (MetadataOnlyExtractor): store 1 metadata chunk; set `status = UNSUPPORTED`; no Qdrant upsert | Must |
| FR-022 | For ZIP files: unpack to tmp dir; for each contained file create child `KmsFile` via kms-api; publish `FileDiscoveredMessage` per child; set parent status = INDEXED | Should |
| FR-023 | For Google Docs/Sheets/Slides: call Drive API export endpoint before extraction; pass exported bytes to type-specific extractor | Must |
| FR-024 | For audio/video: extract metadata via `mutagen` (duration, codec, bitrate); store as 1 metadata chunk; set `status = INDEXED`; publish `TranscriptionRequestMessage` to `kms.voice` if `features.voiceTranscription.enabled` | Should |
| FR-025 | Reindex flow: before extraction, DELETE existing kms_chunks for file_id; delete Qdrant points by `file_id` payload filter | Should |
| FR-026 | Emit OTel span `kb.extraction` with attributes: `file_id`, `mime_type`, `extractor_name`, `chunk_count`, `duration_ms` | Must |
| FR-027 | Emit OTel span `kb.embedding` with attributes: `file_id`, `chunk_count`, `batch_count`, `duration_ms` | Must |
| FR-028 | Emit OTel span `kb.vector_upsert` with attributes: `file_id`, `upserted_count`, `collection_name` | Must |
| FR-029 | `POST /embed` HTTP endpoint on embed-worker (port 8004): accepts `{ "text": string }`, returns `{ "dense": float[], "sparse": object }`; used by search-api for query embedding | Must |

---

## 6. Non-Functional Requirements

| ID | Concern | Requirement |
|----|---------|-------------|
| NFR-001 | Throughput (CPU) | ≥ 100 TXT/MD chunks/min; ≥ 20 PDF pages/min; ≥ 100 embedding chunks/min |
| NFR-002 | Throughput (GPU) | ≥ 1,000 embedding chunks/min with CUDA |
| NFR-003 | Model load time | < 30s cold start with model cached in container volume |
| NFR-004 | Memory usage | Worker RAM < 4GB with BGE-M3 loaded (CPU mode) |
| NFR-005 | Idempotency | Identical file → identical chunk checksums → no duplicate rows |
| NFR-006 | Message ACK | Message not ACKed until all DB writes AND Qdrant upserts complete |
| NFR-007 | Max retries | 3 attempts for retryable errors; then DLQ |
| NFR-008 | Max file size | 500 MB; configurable via `EMBED_WORKER_MAX_FILE_SIZE_MB` env var |
| NFR-009 | Extraction timeout | 60s per file; configurable via `EMBED_WORKER_EXTRACTION_TIMEOUT_S` |
| NFR-010 | Python version | 3.11+ |
| NFR-011 | Observability | Every message consumed logs: `{ file_id, mime_type, status, duration_ms, chunk_count, error? }` via structlog |

---

## 7. UX/UI Specification

This PRD covers a backend worker; there is no direct UI. However, the pipeline outputs surface in the UI as defined in [PRD-document-intelligence.md §7](./PRD-document-intelligence.md).

Worker-produced data that appears in UI:
- `kms_files.status` — shown as status badge on file cards
- `kms_files.error_message` — shown in quick preview panel under "Processing Error"
- `kms_files.intelligence_score` — shown as score chip on file cards (computed post-indexing)
- `kms_chunks.content` — shown in search result snippets and preview panel

---

## 8. Data Model Impact

### 8.1 `kms_chunks` — Full Schema with New Columns

```sql
CREATE TABLE kms_chunks (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id          UUID        NOT NULL REFERENCES kms_files(id) ON DELETE CASCADE,
    source_id        UUID        NOT NULL,   -- denormalised for query performance
    user_id          UUID        NOT NULL,
    chunk_index      INT         NOT NULL,
    content          TEXT        NOT NULL,
    checksum_sha256  CHAR(64)    NOT NULL,
    token_count      INT,
    page_number      INT,                    -- for PDF/PPTX; NULL for other types
    heading_context  TEXT,                   -- nearest H1/H2 above this chunk
    embedding_status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | completed | failed
    qdrant_id        UUID,                   -- Qdrant point ID after upsert
    search_vector    TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    created_at       TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (checksum_sha256, file_id)
);

CREATE INDEX idx_kms_chunks_file_id    ON kms_chunks (file_id);
CREATE INDEX idx_kms_chunks_user_id    ON kms_chunks (user_id, created_at DESC);
CREATE INDEX idx_kms_chunks_search     ON kms_chunks USING GIN (search_vector);
CREATE INDEX idx_kms_chunks_emb_status ON kms_chunks (embedding_status) WHERE embedding_status = 'pending';
```

### 8.2 `kms_files` — Additional Columns for Pipeline Output

```sql
ALTER TABLE kms_files ADD COLUMN error_message       TEXT;
ALTER TABLE kms_files ADD COLUMN extraction_method   VARCHAR(50);   -- "pdfminer" | "python-docx" | "tesseract" | "metadata-only" | etc.
ALTER TABLE kms_files ADD COLUMN page_count          INT;
ALTER TABLE kms_files ADD COLUMN language            VARCHAR(10);   -- ISO 639-1 detected language
ALTER TABLE kms_files ADD COLUMN ai_summary          TEXT;          -- first 300 chars of extracted text
ALTER TABLE kms_files ADD COLUMN intelligence_score  REAL;
ALTER TABLE kms_files ADD COLUMN intelligence_score_computed_at TIMESTAMPTZ;
```

### 8.3 File Status State Machine

```
                    ┌──────────────────────────────────────────────────┐
                    │                  PENDING                          │  ← created by scan-worker
                    └────────────────────┬─────────────────────────────┘
                                         │ embed-worker receives message
                                         ▼
                    ┌──────────────────────────────────────────────────┐
                    │                PROCESSING                         │
                    └────────┬─────────────────────┬───────────────────┘
                             │ success              │ failure
                             ▼                      ▼
          ┌────────────────────────┐   ┌─────────────────────────────────┐
          │        INDEXED         │   │            ERROR                 │
          └────────────────────────┘   │  (error_message populated)       │
                    ▲                  └──────────┬──────────────────────┘
                    │ reindex                     │ user triggers POST /reindex
                    └─────────────────────────────┘

          ┌────────────────────────┐
          │      UNSUPPORTED       │  ← unknown MIME / file too large / encrypted
          └────────────────────────┘  (terminal; no retry path)
```

Allowed status transitions:

| From | To | Trigger |
|------|----|---------|
| PENDING | PROCESSING | embed-worker starts processing |
| PROCESSING | INDEXED | full pipeline success |
| PROCESSING | ERROR | extraction/embedding failure |
| PROCESSING | UNSUPPORTED | unknown MIME / size exceeded |
| INDEXED | PROCESSING | user triggers reindex |
| ERROR | PROCESSING | user triggers reindex |

Invalid transitions (must raise `InvalidStateTransitionError`):
- UNSUPPORTED → any (terminal)
- INDEXED → INDEXED (no-op, return 200 with message "Already indexed")

---

## 9. API Contracts

### 9.1 Internal API — Pipeline Status Updates (kms-api, internal network only)

```
PATCH /internal/files/{id}/status
  Headers: X-Internal-Key: <secret>
  Body: {
    "status":           "PROCESSING" | "INDEXED" | "ERROR" | "UNSUPPORTED",
    "error_message":    string | null,
    "extraction_method": string | null,
    "page_count":       int | null,
    "language":         string | null,
    "ai_summary":       string | null,
    "indexed_at":       ISO 8601 | null
  }
Response 200: { "data": { "id": "uuid", "status": "INDEXED" } }
Response 404: KBFIL0001
Response 409: KBFIL0010 (invalid state transition)
```

### 9.2 Embed Worker HTTP — Query Embedding Endpoint

```
POST /embed
  (no auth required — internal service-to-service, network-isolated)
  Body: {
    "text": "international expansion plans",
    "return_sparse": true
  }
Response 200: {
  "dense":  [0.023, -0.142, …],   // 1024 floats
  "sparse": { "indices": [12, 45, 890, …], "values": [0.31, 0.12, …] }
}
Response 503: { "error": "Model not loaded" }

POST /embed/batch
  Body: {
    "texts": ["text 1", "text 2", …],  // max 32
    "return_sparse": true
  }
Response 200: {
  "results": [
    { "dense": […], "sparse": { … } },
    …
  ]
}
```

### 9.3 File Reindex Endpoint (kms-api, public)

```
POST /api/v1/files/{id}/reindex
  Auth: Bearer JWT (user must own the file)
Response 202: {
  "data": {
    "file_id": "uuid",
    "status": "PROCESSING",
    "message": "File queued for reprocessing."
  }
}
Error 403: KBAUZ0001 (file belongs to another user)
Error 404: KBFIL0001 (file not found)
Error 409: KBFIL0010 (file already processing or unsupported — not reindexable)
```

---

## 10. File Type Support Matrix

Full matrix with per-type engineering details:

| Extension | MIME Type | Extractor Class | Python Library | Chunking Strategy | Chunk Size | Heading Preserved | Page Number Preserved | OCR | Timeline |
|-----------|-----------|-----------------|----------------|-------------------|------------|-------------------|-----------------------|-----|----------|
| .txt | text/plain | PlainTextExtractor | stdlib | Sequential 512-token, 64 overlap | 512 | No | No | No | M3 |
| .md | text/markdown | PlainTextExtractor | stdlib | Sequential; H1/H2/H3 as section hints | 512 | Yes (heading_context) | No | No | M3 |
| .csv | text/csv | CsvExtractor | stdlib csv | One chunk per N rows (N=50); prepend column headers | 512 | No | No | No | M3 |
| .json | application/json | JsonExtractor | stdlib json | Pretty-print → sequential 512-token | 512 | No | No | No | M3 |
| .pdf | application/pdf | PdfExtractor | pdfminer.six | Per-page text → sequential 512-token; page_number stored | 512 | Partial (font-size heuristic) | Yes | No | M3 |
| .docx | application/vnd.openxmlformats-officedocument.wordprocessingml.document | DocxExtractor | python-docx | Per heading section → sequential 512-token | 512 | Yes | No | No | M3 |
| .doc | application/msword | DocxExtractor | python-docx + libreoffice convert | Same as DOCX (after conversion) | 512 | Yes | No | No | M4 |
| .xlsx | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet | XlsxExtractor | openpyxl | Per sheet → row-by-row → 512-token; sheet name as heading | 512 | Yes (sheet name) | No | No | M3 |
| .xls | application/vnd.ms-excel | XlsxExtractor | openpyxl | Same as XLSX | 512 | Yes | No | No | M4 |
| .pptx | application/vnd.openxmlformats-officedocument.presentationml.presentation | PptxExtractor | python-pptx | Per slide: title + body + speaker notes; slide index as page_number | 512 | Yes (slide title) | Yes (slide #) | No | M3 |
| .html | text/html | HtmlExtractor | BeautifulSoup4 | Main content extraction → 512-token | 512 | Yes (h1–h3 tags) | No | No | M4 |
| .zip | application/zip | ZipExtractor | stdlib zipfile | Child files processed individually; no chunks on parent | N/A | N/A | N/A | No | M4 |
| .png | image/png | ImageExtractor | pytesseract | Full OCR text → 512-token | 512 | No | No | Yes | M4 (gated) |
| .jpg .jpeg | image/jpeg | ImageExtractor | pytesseract | Full OCR text → 512-token | 512 | No | No | Yes | M4 (gated) |
| .webp | image/webp | ImageExtractor | pytesseract | Full OCR text → 512-token | 512 | No | No | Yes | M4 (gated) |
| .mp3 .wav | audio/mpeg, audio/wav | MediaMetadataExtractor | mutagen | 1 metadata chunk (JSON of: duration, codec, bitrate, title, artist) | N/A | No | No | No | M3 (meta) / M6 (transcript) |
| .mp4 .mov | video/mp4, video/quicktime | MediaMetadataExtractor | mutagen | 1 metadata chunk (JSON of: duration, resolution, codec, title) | N/A | No | No | No | M3 (meta) / M6 (transcript) |
| Google Doc | application/vnd.google-apps.document | Drive export → PdfExtractor | google-api-python-client | Same as PDF | 512 | Partial | Yes | No | M3 |
| Google Sheet | application/vnd.google-apps.spreadsheet | Drive export → XlsxExtractor | google-api-python-client | Same as XLSX | 512 | Yes | No | No | M3 |
| Google Slides | application/vnd.google-apps.presentation | Drive export → PptxExtractor | google-api-python-client | Same as PPTX | 512 | Yes | Yes | No | M3 |
| * unknown | * | MetadataOnlyExtractor | — | 1 metadata chunk (name, mime_type, size, sha256) | N/A | No | No | No | M3 |

---

## 11. Processing Worker Architecture

### 11.1 Service Identity

| Property | Value |
|----------|-------|
| Service name | `embed-worker` |
| Language | Python 3.11 |
| Framework | asyncio + aio-pika |
| Port | 8004 (HTTP embed endpoint only) |
| Queue consumed | `kms.embed` |
| Queue published to | `kms.voice` (for transcription requests) |
| DLQ | `kms.embed.dlx` |
| Config | `.kms/config.json` → `workers.embedWorker` |

### 11.2 Worker Startup Sequence

```
1. Load configuration (EMBED_WORKER_* env vars override config.json)
2. Detect GPU: torch.cuda.is_available() → set device = 'cuda' or 'cpu'
3. Load BGE-M3 model (BAAI/bge-m3) from cache volume → singleton
4. Start FastAPI HTTP server (port 8004) in background thread → /embed, /embed/batch, /health
5. Connect to RabbitMQ via aio_pika.connect_robust() (reconnects on drop)
6. Declare kms.embed queue + kms.embed.dlx dead-letter exchange (idempotent)
7. Set QoS prefetch_count = config.workers.embedWorker.concurrency (default 2)
8. Begin consuming messages
9. Log: { event: "embed_worker_started", device: "cpu|cuda", model: "BAAI/bge-m3" }
```

### 11.3 Message Processing Flow

```python
# Pseudocode — full implementation in services/embed-worker/src/handlers/embed_handler.py

async def handle_file_discovered(message: aio_pika.IncomingMessage):
    async with message.process(ignore_processed=True):
        msg = FileDiscoveredMessage.model_validate_json(message.body)

        with tracer.start_as_current_span("kb.pipeline", attributes={"file_id": msg.file_id}):
            try:
                # Stage 1: Validate
                file_bytes = await storage.fetch(msg)          # local path or Drive API
                if len(file_bytes) > MAX_FILE_SIZE:
                    await api.set_status(msg.file_id, "UNSUPPORTED", "File exceeds size limit")
                    message.reject(requeue=False)
                    return

                # Stage 2: Detect + Set PROCESSING
                mime_type = magic.from_buffer(file_bytes, mime=True)
                await api.set_status(msg.file_id, "PROCESSING")

                # Stage 3: Extract
                extractor = MIME_TO_EXTRACTOR.get(mime_type, MetadataOnlyExtractor)
                with timeout(EXTRACTION_TIMEOUT_S):
                    extraction_result = await extractor().extract(file_bytes, msg)

                # Stage 4: Chunk
                chunks = TextChunker.chunk(extraction_result.text, size=512, overlap=64)

                # Stage 5: Store chunks in DB (idempotent)
                chunk_records = await db.upsert_chunks(msg.file_id, chunks)

                # Stage 6: Embed (batches of 32)
                for batch in batched(chunk_records, 32):
                    dense, sparse = await embedder.encode_batch([c.content for c in batch])
                    await qdrant.upsert(batch, dense, sparse, msg)
                    await db.mark_chunks_embedded([c.id for c in batch])

                # Stage 7: Success
                await api.set_status(msg.file_id, "INDEXED",
                                     indexed_at=now(),
                                     extraction_method=extractor.__name__,
                                     ai_summary=extraction_result.text[:300],
                                     page_count=extraction_result.page_count,
                                     language=extraction_result.language)
                logger.info("pipeline.success", file_id=msg.file_id, chunk_count=len(chunks))

            except ExtractionTimeoutError:
                await api.set_status(msg.file_id, "ERROR", "Extraction timed out (>60s)")
                message.nack(requeue=False)

            except ExtractionError as e:
                await api.set_status(msg.file_id, "ERROR", str(e))
                message.nack(requeue=False)

            except (QdrantUnavailableError, DatabaseUnavailableError) as e:
                # Retryable — requeue
                logger.warning("pipeline.retryable_error", error=str(e))
                message.nack(requeue=True)
                # aio-pika will re-deliver; max_retries enforced via x-death header check
```

### 11.4 Extractor Interface

```python
# services/embed-worker/src/extractors/base.py

from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class ExtractionResult:
    text: str                    # full extracted text (UTF-8)
    page_count: int | None       # pages for PDFs/PPTX; None for others
    language: str | None         # ISO 639-1 detected language; None if unknown
    metadata: dict               # extractor-specific extra metadata
    extractor_name: str          # e.g. "PdfExtractor"

class BaseExtractor(ABC):
    """Base class for all file type extractors.

    Implement extract() to return an ExtractionResult.
    Raise ExtractionError on unrecoverable failure.
    Never raise on warnings/partial extraction — return what you have.
    """

    @abstractmethod
    async def extract(
        self,
        file_bytes: bytes,
        message: FileDiscoveredMessage,
    ) -> ExtractionResult:
        """Extract text content from raw file bytes.

        Args:
            file_bytes: Raw file content in memory.
            message: The original FileDiscoveredMessage for context (file_id, user_id, etc.).

        Returns:
            ExtractionResult with text, page_count, language, metadata.

        Raises:
            ExtractionError: Unrecoverable failure (corrupted file, encrypted, etc.).
            ExtractionTimeoutError: Raised by pipeline orchestrator after 60s.
        """
        ...
```

### 11.5 Extractor Registry

```python
# services/embed-worker/src/extractors/registry.py

from .plain_text  import PlainTextExtractor
from .csv_ext     import CsvExtractor
from .json_ext    import JsonExtractor
from .pdf         import PdfExtractor
from .docx        import DocxExtractor
from .xlsx        import XlsxExtractor
from .pptx        import PptxExtractor
from .html        import HtmlExtractor
from .zip_ext     import ZipExtractor
from .image       import ImageExtractor   # feature-gated
from .media       import MediaMetadataExtractor
from .metadata    import MetadataOnlyExtractor

MIME_TO_EXTRACTOR: dict[str, type[BaseExtractor]] = {
    "text/plain":     PlainTextExtractor,
    "text/markdown":  PlainTextExtractor,
    "text/csv":       CsvExtractor,
    "application/json": JsonExtractor,
    "application/pdf": PdfExtractor,
    # DOCX
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": DocxExtractor,
    "application/msword": DocxExtractor,
    # XLSX
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": XlsxExtractor,
    "application/vnd.ms-excel": XlsxExtractor,
    # PPTX
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": PptxExtractor,
    # HTML
    "text/html": HtmlExtractor,
    # ZIP
    "application/zip": ZipExtractor,
    "application/x-zip-compressed": ZipExtractor,
    # Images (feature-gated at runtime)
    "image/png":  ImageExtractor,
    "image/jpeg": ImageExtractor,
    "image/webp": ImageExtractor,
    "image/gif":  ImageExtractor,
    # Audio/Video
    "audio/mpeg": MediaMetadataExtractor,
    "audio/wav":  MediaMetadataExtractor,
    "audio/mp4":  MediaMetadataExtractor,
    "audio/ogg":  MediaMetadataExtractor,
    "video/mp4":  MediaMetadataExtractor,
    "video/quicktime": MediaMetadataExtractor,
    "video/x-matroska": MediaMetadataExtractor,
    # Google Workspace (resolved pre-extraction via Drive API export)
    "application/vnd.google-apps.document":     PdfExtractor,
    "application/vnd.google-apps.spreadsheet":  XlsxExtractor,
    "application/vnd.google-apps.presentation": PptxExtractor,
}

def get_extractor(mime_type: str, ocr_enabled: bool = False) -> BaseExtractor:
    """Select the extractor for a given MIME type.

    Respects feature flags — ImageExtractor only returned if ocr_enabled.
    Falls back to MetadataOnlyExtractor for unknown types.
    """
    if mime_type.startswith("image/") and not ocr_enabled:
        return MetadataOnlyExtractor()
    return MIME_TO_EXTRACTOR.get(mime_type, MetadataOnlyExtractor)()
```

### 11.6 Chunking Algorithm

```python
# services/embed-worker/src/chunking/text_chunker.py

import re
from dataclasses import dataclass

@dataclass
class TextChunk:
    chunk_index: int
    content: str
    token_count: int
    heading_context: str | None  # nearest H1/H2 above this chunk

class TextChunker:
    """Splits text into overlapping chunks, snapping to word boundaries.

    Token count is approximated as len(text) // 4 (GPT-style rough estimate).
    For production, replace with tiktoken or sentencepiece tokeniser.
    """

    @staticmethod
    def chunk(
        text: str,
        size: int = 512,
        overlap: int = 64,
        heading_context: str | None = None,
    ) -> list[TextChunk]:
        """Split text into chunks of approximately `size` tokens with `overlap`.

        Args:
            text: Full extracted text.
            size: Approximate chunk size in characters (512 chars ≈ 128 tokens).
            overlap: Overlap between consecutive chunks in characters.
            heading_context: Nearest heading above this text block (for structural extractors).

        Returns:
            List of TextChunk objects.
        """
        chunks = []
        start = 0
        idx = 0
        text = text.strip()

        while start < len(text):
            end = min(start + size, len(text))

            # Snap to word boundary (scan back up to 50 chars)
            if end < len(text):
                snap_end = end
                while snap_end > start + 50 and text[snap_end] not in " \n\t":
                    snap_end -= 1
                if snap_end > start + 50:
                    end = snap_end

            content = text[start:end].strip()
            if len(content) > 10:  # discard near-empty chunks
                chunks.append(TextChunk(
                    chunk_index=idx,
                    content=content,
                    token_count=len(content) // 4,  # rough approximation
                    heading_context=heading_context,
                ))
                idx += 1

            start = end - overlap

        return chunks
```

### 11.7 BGE-M3 Embedding Provider

```python
# services/embed-worker/src/embedding/bge_provider.py

import torch
from FlagEmbedding import BGEM3FlagModel
from dataclasses import dataclass

@dataclass
class EmbeddingBatch:
    dense: list[list[float]]    # shape: (batch_size, 1024)
    sparse: list[dict]          # BGE-M3 sparse lexical output

class BGEEmbeddingProvider:
    """Singleton wrapper around BAAI/bge-m3.

    Loaded once at startup. Never reinstantiated per-message.
    Thread-safe for async use (GIL-held during torch inference).

    Attributes:
        model: Loaded BGEM3FlagModel instance.
        device: "cuda" or "cpu".
    """

    _instance: "BGEEmbeddingProvider | None" = None

    def __init__(self, model_name: str = "BAAI/bge-m3", device: str = "cpu"):
        self.model = BGEM3FlagModel(model_name, use_fp16=(device == "cuda"))
        self.device = device

    @classmethod
    def get_instance(cls) -> "BGEEmbeddingProvider":
        if cls._instance is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            cls._instance = cls(device=device)
        return cls._instance

    async def encode_batch(
        self,
        texts: list[str],
        return_dense: bool = True,
        return_sparse: bool = True,
    ) -> EmbeddingBatch:
        """Encode a batch of texts using BGE-M3.

        Args:
            texts: List of text strings (max 32).
            return_dense: Include dense 1024-dim vectors.
            return_sparse: Include sparse lexical vectors.

        Returns:
            EmbeddingBatch with dense and sparse outputs.

        Raises:
            EmbeddingError: If model inference fails.
        """
        output = self.model.encode(
            texts,
            return_dense=return_dense,
            return_sparse=return_sparse,
            batch_size=len(texts),
            max_length=512,
        )
        return EmbeddingBatch(
            dense=output["dense_vecs"].tolist() if return_dense else [],
            sparse=output["lexical_weights"] if return_sparse else [],
        )
```

### 11.8 Queue Message Schemas

```python
# services/embed-worker/src/models/messages.py

from pydantic import BaseModel
from datetime import datetime

class FileDiscoveredMessage(BaseModel):
    """Consumed from kms.embed queue. Published by scan-worker."""
    file_id:           str       # UUID of KmsFile
    source_id:         str       # UUID of KmsSource
    user_id:           str       # UUID of User
    path:              str       # local path or Google Drive file ID
    name:              str       # file name (for logging)
    mime_type:         str       # MIME type from scan-worker (may differ from detected)
    size_bytes:        int
    checksum_sha256:   str
    modified_at:       datetime
    connector_type:    str       # "local" | "google_drive"
    google_token:      str | None = None  # encrypted token for Drive download (short-lived)

class EmbedJobMessage(BaseModel):
    """Internal re-queue message (retries) — same shape as FileDiscoveredMessage."""
    file_id:     str
    chunk_ids:   list[str]   # specific chunk UUIDs to re-embed (used for partial re-indexing)
    user_id:     str
    source_id:   str
    retry_count: int = 0

class TranscriptionRequestMessage(BaseModel):
    """Published to kms.voice when audio/video file is detected."""
    file_id:     str
    user_id:     str
    path:        str
    mime_type:   str
    size_bytes:  int
    provider:    str = "whisper"  # "whisper" | "google"
```

---

## 12. Error Handling — Per-Stage Retry/Fallback Strategy

| Stage | Error Type | Error Class | Retryable | Action |
|-------|-----------|-------------|-----------|--------|
| Fetch file bytes (local) | File not found on disk | `FileNotFoundError` | No | `nack(requeue=False)` → DLQ; set `status=ERROR`, `error_message="File not found at path"` |
| Fetch file bytes (Drive) | Drive API 401 | `DriveAuthError` | No | Same as above; `error_message="Google Drive authorization expired — reconnect source"` |
| Fetch file bytes (Drive) | Drive API 429 | `DriveRateLimitError` | Yes | `nack(requeue=True)`; worker sleeps 30s before next consume |
| Fetch file bytes (Drive) | Drive API 5xx | `DriveServerError` | Yes | `nack(requeue=True)` |
| File size check | Exceeds max | `FileTooLargeError` | No | `reject(requeue=False)`; `status=UNSUPPORTED`; no DLQ |
| MIME detection | python-magic crash | `MimeDetectionError` | No | Fall back to `mime_type` from message; log warning; continue |
| PATCH status to PROCESSING | DB down | `DatabaseUnavailableError` | Yes | `nack(requeue=True)` — do not proceed without status lock |
| Text extraction | Corrupted file | `ExtractionError` | No | `nack(requeue=False)` → DLQ; `status=ERROR`, `error_message=<extractor message>` |
| Text extraction | Encrypted PDF | `EncryptedFileError` | No | `nack(requeue=False)` → DLQ; `error_message="Encrypted PDF — password required"` |
| Text extraction | Timeout (>60s) | `ExtractionTimeoutError` | No | Same as corrupted file |
| Text extraction | OOM (large PDF) | `MemoryError` | No | `status=ERROR`, `error_message="File too memory-intensive to extract"` |
| Chunk DB insert | DB down | `DatabaseUnavailableError` | Yes | `nack(requeue=True)` |
| Chunk DB insert | Constraint violation | `IntegrityError` | No (idempotent) | `DO NOTHING` — not an error |
| Qdrant upsert | Qdrant unreachable | `QdrantUnavailableError` | Yes | `nack(requeue=True)`; exponential backoff: 2s, 4s, 8s |
| Qdrant upsert | Collection not found | `QdrantCollectionError` | No | Create collection then retry once; if still fails → DLQ |
| PATCH status to INDEXED | DB down | `DatabaseUnavailableError` | Yes | `nack(requeue=True)` — vectors are in Qdrant; deduplication handles re-upsert |
| x-death count ≥ 3 (RabbitMQ) | Any retryable | — | No (max retries reached) | `reject(requeue=False)` → DLQ; `status=ERROR`, `error_message="Max retries exceeded"` |

### Dead Letter Queue Behaviour

Messages routed to `kms.embed.dlx` are retained for 7 days. An alert fires if DLQ depth > 100.

Engineers can replay DLQ messages with:
```bash
./scripts/db/replay-dlq.sh --queue kms.embed --limit 50
```

---

## 13. Observability

### 13.1 OTel Spans

| Span Name | Parent | Key Attributes |
|-----------|--------|----------------|
| `kb.pipeline` | (root) | `file_id`, `mime_type`, `user_id`, `connector_type` |
| `kb.file_fetch` | `kb.pipeline` | `file_id`, `connector_type`, `size_bytes` |
| `kb.extraction` | `kb.pipeline` | `file_id`, `extractor_name`, `chunk_count`, `duration_ms`, `page_count` |
| `kb.chunking` | `kb.pipeline` | `file_id`, `chunk_count`, `avg_chunk_length` |
| `kb.embedding` | `kb.pipeline` | `file_id`, `chunk_count`, `batch_count`, `device`, `duration_ms` |
| `kb.vector_upsert` | `kb.pipeline` | `file_id`, `upserted_count`, `collection_name` |
| `kb.status_update` | `kb.pipeline` | `file_id`, `new_status`, `error_message?` |

### 13.2 Prometheus Metrics

All metrics are prefixed `kms_`:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `kms_files_processed_total` | Counter | `mime_type`, `status` | Files fully processed (success or failure) |
| `kms_extraction_failures_total` | Counter | `mime_type`, `error_type` | Extraction failures by type and error class |
| `kms_extraction_duration_seconds` | Histogram | `mime_type`, `extractor` | Time spent in extraction stage |
| `kms_embedding_duration_seconds` | Histogram | `device` | Time spent generating embeddings (per batch) |
| `kms_chunks_created_total` | Counter | `source_type` | Total chunks created |
| `kms_qdrant_upserts_total` | Counter | `status` | Qdrant upsert operations (success/failure) |
| `kms_queue_depth` | Gauge | `queue_name` | Current depth of kms.embed queue |
| `kms_dlq_depth` | Gauge | — | Current depth of kms.embed.dlx |
| `kms_embed_worker_model_loaded` | Gauge | `model`, `device` | 1 if model loaded, 0 otherwise |

### 13.3 Structured Log Events

Every log event uses `structlog.get_logger(__name__).bind(...)`. Key events:

| Event | Level | Fields |
|-------|-------|--------|
| `pipeline.start` | INFO | `file_id`, `mime_type`, `size_bytes`, `connector_type` |
| `pipeline.success` | INFO | `file_id`, `chunk_count`, `duration_ms`, `extractor` |
| `pipeline.extraction_failed` | ERROR | `file_id`, `mime_type`, `error_type`, `error_message` |
| `pipeline.retryable_error` | WARN | `file_id`, `error_type`, `retry_count` |
| `pipeline.dlq_routed` | ERROR | `file_id`, `error_type`, `retry_count` |
| `embedding.batch_complete` | DEBUG | `file_id`, `batch_index`, `batch_size`, `duration_ms` |
| `embed_worker.started` | INFO | `device`, `model`, `concurrency` |
| `embed_worker.model_loaded` | INFO | `model`, `load_time_s`, `device` |

### 13.4 Alerting Thresholds

| Alert | Condition | Severity |
|-------|-----------|----------|
| High extraction failure rate | `kms_extraction_failures_total` rate > 5/min | Warning |
| DLQ growing | `kms_dlq_depth` > 100 | Critical |
| Queue stall | `kms_queue_depth` > 1000 AND `kms_files_processed_total` rate < 1/min | Critical |
| Embedding model down | `kms_embed_worker_model_loaded` == 0 for > 2 min | Critical |
| Slow extraction | `kms_extraction_duration_seconds` p95 > 45s | Warning |

---

## 14. Out of Scope

- LLM-based summarisation inside the pipeline (PRD-M10-rag-chat.md)
- Real-time push-based extraction triggers (webhook from Google Drive)
- Actual virus scanning (AV stub is a log-only hook)
- Multi-language chunking strategies (e.g. CJK language word boundaries)
- Differential extraction (only re-extracting changed pages in a modified PDF)
- Streaming extraction results to the frontend

---

## 15. Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| `aio-pika` | ≥ 9.x | RabbitMQ async consumer |
| `pydantic` | v2 | Message schema validation |
| `structlog` | ≥ 24.x | Structured logging |
| `opentelemetry-sdk` | ≥ 1.24 | OTel spans and metrics |
| `FlagEmbedding` | ≥ 1.2 | BGE-M3 model wrapper |
| `torch` | ≥ 2.2 | Model inference |
| `qdrant-client` | ≥ 1.9 | Qdrant upsert/query |
| `asyncpg` | ≥ 0.29 | Raw PostgreSQL async driver |
| `python-magic` | ≥ 0.4 | MIME type detection |
| `pdfminer.six` | ≥ 20221105 | PDF text extraction |
| `python-docx` | ≥ 1.1 | DOCX text extraction |
| `openpyxl` | ≥ 3.1 | XLSX text extraction |
| `python-pptx` | ≥ 0.6 | PPTX text extraction |
| `beautifulsoup4` | ≥ 4.12 | HTML extraction |
| `pytesseract` | ≥ 0.3 | OCR (feature-gated) |
| `mutagen` | ≥ 1.47 | Audio/video metadata |
| `google-api-python-client` | ≥ 2.120 | Drive API export |
| `fastapi` | ≥ 0.110 | /embed HTTP endpoint |
| `uvicorn` | ≥ 0.29 | ASGI server for FastAPI |

---

## 16. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Extraction success rate (supported types) | ≥ 95% | `(processed - extraction_failures) / processed` |
| Extraction success rate (PDF specifically) | ≥ 90% | Filter by `mime_type=application/pdf` |
| p95 extraction time (PDF) | < 30s | `kms_extraction_duration_seconds` histogram |
| p95 embedding time per batch | < 5s (CPU), < 0.5s (GPU) | `kms_embedding_duration_seconds` |
| Files processed per hour (CPU, single worker) | ≥ 500 (TXT), ≥ 60 (PDF) | `kms_files_processed_total` rate |
| DLQ depth at steady state | < 10 | `kms_dlq_depth` Grafana panel |
| Chunk idempotency violation rate | 0% | `ON CONFLICT DO NOTHING` discards as % of attempted inserts |

---

## 17. Open Questions

| # | Question | Owner | Due |
|---|----------|-------|-----|
| OQ-1 | Should we use tiktoken for accurate token counting in chunker, or accept the len//4 approximation for MVP? | Engineering | M3 sprint 1 |
| OQ-2 | ZIP archive depth limit (currently 3 levels) — is this sufficient, or do we need configurable depth? | Engineering | M4 sprint 1 |
| OQ-3 | For DOC (legacy Word) files: rely on LibreOffice in container (adds ~200MB to image) or drop DOC support to M4? | Engineering | M3 sprint planning |
| OQ-4 | Google Workspace export format for Google Docs: PDF (preserves layout, pdfminer) vs DOCX (preserves heading structure, python-docx) — which is higher quality for search? | Engineering | M3 sprint 1 |
| OQ-5 | Should MediaMetadataExtractor publish to `kms.voice` automatically when `features.voiceTranscription.enabled = true`, or should users explicitly opt-in per file? | Product | M3 kickoff |

---

## 18. Testing Plan

| Test Type | Scope | Key Cases |
|-----------|-------|-----------|
| Unit: PlainTextExtractor | TXT, MD, CSV | Short file, empty file, unicode content, very long file (>10k chars) |
| Unit: PdfExtractor | pdfminer.six | Simple 1-page PDF, multi-column PDF, password-protected (must raise ExtractionError), scanned PDF with no text layer |
| Unit: DocxExtractor | python-docx | Basic text, headings (H1/H2/H3), embedded table, DOCX with images (images silently skipped) |
| Unit: XlsxExtractor | openpyxl | Single sheet, multi-sheet, formula-only cells (no visible text), very wide sheet (>100 cols) |
| Unit: PptxExtractor | python-pptx | Slide with text only, slide with speaker notes, empty slide (skipped) |
| Unit: ImageExtractor | pytesseract | Clear English text, handwritten text (low confidence), empty image |
| Unit: ZipExtractor | stdlib zipfile | Flat zip, nested zip (3 levels), zip bomb guard (max 3 levels, max 2GB unpacked) |
| Unit: TextChunker | — | Text shorter than chunk_size (1 chunk), exact boundary case, unicode multi-byte boundary, overlap correctness |
| Unit: BGEEmbeddingProvider | mock model | 1024 dimensions, batch of 32, batch of 1, batch of 33 (must split) |
| Unit: Error handling | pipeline | Corrupted PDF → ERROR status, DB down → nack(requeue=True), Qdrant down → nack(requeue=True), max retries → DLQ |
| Integration: full pipeline (TXT) | embed-worker → DB → Qdrant | Upload TXT → consume message → verify chunks in DB → verify points in Qdrant |
| Integration: full pipeline (PDF) | embed-worker → DB → Qdrant | Upload 10-page PDF → verify 10+ chunks → verify FTS search finds content |
| Integration: reindex | embed-worker → DB → Qdrant | Index file → modify content → reindex → old chunks gone → new chunks present |
| Integration: DLQ routing | embed-worker → RabbitMQ | Provide corrupted file → verify message ends in DLQ after 1 attempt |
| E2E: Google Drive PDF | scan-worker → embed-worker → search-api | Add Drive source → scan → embed → search for content from Drive PDF → appears in results |

---

## 19. Revision History

| Version | Date | Author | Summary |
|---------|------|--------|---------|
| 1.0 | 2026-03-17 | Product | Initial draft — full pipeline engineering spec |
