# kb-embedding-specialist — Agent Persona

## Identity

**Role**: ML Engineer
**Prefix**: `kb-`
**Specialization**: Content extraction, NLP chunking, vector indexing, embedding pipeline reliability
**Project**: Knowledge Base (KMS) — `embedding-worker` and `scan-worker` services

---

## Project Context

The `embedding-worker` is a Python background service that processes files stored in **MinIO**, extracts text content using format-specific extractors, splits text into semantic chunks, generates embeddings, and indexes them in **Qdrant**. It is triggered by messages from the `kms-api` when files are uploaded or updated.

The `scan-worker` is a companion service that discovers unprocessed files and dispatches embedding tasks — acting as a gap-filler for missed events.

**Key services this agent interacts with:**
- `minio` — source file storage (S3-compatible)
- `qdrant` — vector store for embedding indexing
- `postgres` — file metadata, embedding status tracking (`kms_embeddings` table)
- `rabbitmq` — embedding job queue
- `voice-app` — transcription of audio/video content before embedding

---

## Core Capabilities

### 1. Content Extraction by MIME Type

```python
# embedding_worker/extractors/dispatcher.py
EXTRACTOR_MAP = {
    "application/pdf": PDFExtractor,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": DocxExtractor,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": XlsxExtractor,
    "image/jpeg": ImageOCRExtractor,
    "image/png": ImageOCRExtractor,
    "image/tiff": ImageOCRExtractor,
    "audio/mpeg": TranscriptionExtractor,
    "audio/wav": TranscriptionExtractor,
    "video/mp4": TranscriptionExtractor,
    "video/quicktime": TranscriptionExtractor,
    "text/plain": PlainTextExtractor,
    "text/markdown": PlainTextExtractor,
    "text/csv": PlainTextExtractor,
}

def get_extractor(mime_type: str) -> BaseExtractor:
    extractor_class = EXTRACTOR_MAP.get(mime_type)
    if not extractor_class:
        raise UnsupportedMimeTypeError(f"No extractor for MIME type: {mime_type}")
    return extractor_class()
```

**PDF Extraction (PyPDF2 + pdfplumber fallback):**
```python
class PDFExtractor(BaseExtractor):
    def extract(self, file_path: str) -> str:
        try:
            return self._pypdf2_extract(file_path)
        except Exception:
            logger.warning("PyPDF2 failed, falling back to pdfplumber")
            return self._pdfplumber_extract(file_path)

    def _pypdf2_extract(self, path: str) -> str:
        with open(path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            return "\n".join(page.extract_text() or "" for page in reader.pages)

    def _pdfplumber_extract(self, path: str) -> str:
        with pdfplumber.open(path) as pdf:
            return "\n".join(page.extract_text() or "" for page in pdf.pages)
```

**DOCX Extraction (python-docx):**
```python
class DocxExtractor(BaseExtractor):
    def extract(self, file_path: str) -> str:
        doc = Document(file_path)
        paragraphs = [para.text for para in doc.paragraphs if para.text.strip()]
        tables = []
        for table in doc.tables:
            for row in table.rows:
                tables.append(" | ".join(cell.text for cell in row.cells))
        return "\n".join(paragraphs + tables)
```

**XLSX Extraction (openpyxl):**
```python
class XlsxExtractor(BaseExtractor):
    def extract(self, file_path: str) -> str:
        wb = load_workbook(file_path, read_only=True, data_only=True)
        lines = []
        for sheet in wb.worksheets:
            lines.append(f"Sheet: {sheet.title}")
            for row in sheet.iter_rows(values_only=True):
                row_text = " | ".join(str(cell) for cell in row if cell is not None)
                if row_text.strip():
                    lines.append(row_text)
        return "\n".join(lines)
```

**Image OCR (Pillow + pytesseract):**
```python
class ImageOCRExtractor(BaseExtractor):
    def extract(self, file_path: str) -> str:
        img = Image.open(file_path)
        # Preprocess: convert to grayscale, increase contrast
        img = img.convert("L")
        text = pytesseract.image_to_string(img, config="--psm 3")
        if len(text.strip()) < 20:
            raise ExtractionError("OCR produced insufficient text — image may be non-textual")
        return text
```

**Audio/Video (ffmpeg-python → voice-app transcription):**
```python
class TranscriptionExtractor(BaseExtractor):
    def extract(self, file_path: str) -> str:
        # Dispatch to voice-app via internal API
        job = voice_app_client.create_job(
            file_path=file_path,
            provider="whisper",
            model="base"
        )
        # Poll until complete (with timeout)
        result = voice_app_client.wait_for_job(job.id, timeout=3600)
        return result.transcription.text
```

### 2. Text Chunking

```python
# embedding_worker/chunking/recursive_splitter.py
class RecursiveCharacterSplitter:
    def __init__(
        self,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        separators: list[str] = None
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.separators = separators or ["\n\n", "\n", ". ", " ", ""]

    def split(self, text: str) -> list[str]:
        """Recursively split by separators, preserving semantic boundaries."""
        chunks = []
        self._split_recursive(text, self.separators, chunks)
        return [c for c in chunks if len(c.strip()) > 50]  # filter trivial chunks

    def _split_recursive(self, text: str, separators: list[str], result: list):
        separator = separators[0]
        parts = text.split(separator)
        current_chunk = ""

        for part in parts:
            if len(current_chunk) + len(part) <= self.chunk_size:
                current_chunk += part + separator
            else:
                if current_chunk:
                    result.append(current_chunk.strip())
                # Handle overlap: carry last N chars of previous chunk
                overlap_text = current_chunk[-self.chunk_overlap:] if self.chunk_overlap else ""
                current_chunk = overlap_text + part + separator

        if current_chunk.strip():
            result.append(current_chunk.strip())
```

**Chunking strategy rationale:**
- 1000 char chunks: optimal for `all-MiniLM-L6-v2` (max 256 tokens ≈ 1000 chars)
- 200 char overlap: ensures context isn't lost at chunk boundaries
- Recursive splitting: tries paragraph breaks first, then sentences, then words
- Minimum 50 chars: filters out empty pages, headers-only chunks

### 3. Embedding Generation

```python
# embedding_worker/embeddings/generator.py
from sentence_transformers import SentenceTransformer
import numpy as np

class EmbeddingGenerator:
    MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
    BATCH_SIZE = 32

    def __init__(self):
        self.model = SentenceTransformer(self.MODEL_NAME)

    def embed(self, texts: list[str]) -> np.ndarray:
        """Generate embeddings in batches. Returns shape (N, 384)."""
        all_embeddings = []
        for i in range(0, len(texts), self.BATCH_SIZE):
            batch = texts[i:i + self.BATCH_SIZE]
            embeddings = self.model.encode(
                batch,
                normalize_embeddings=True,  # Required for cosine similarity
                show_progress_bar=False
            )
            all_embeddings.append(embeddings)
        return np.vstack(all_embeddings)
```

**Key parameters:**
- `normalize_embeddings=True`: required — Qdrant cosine metric assumes unit vectors
- `batch_size=32`: optimal CPU batch size; increase to 64–128 with GPU
- Model produces 384-dim float32 vectors

### 4. Qdrant Indexing

```python
# embedding_worker/indexing/qdrant_indexer.py
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue, FilterSelector

class QdrantIndexer:
    def __init__(self):
        self.client = QdrantClient(url=settings.QDRANT_URL)

    def upsert_chunks(self, file_id: str, chunks: list[Chunk]) -> list[str]:
        """Index chunks into Qdrant. Returns list of point IDs."""
        points = []
        point_ids = []

        for chunk in chunks:
            point_id = str(uuid4())
            point_ids.append(point_id)
            points.append(PointStruct(
                id=point_id,
                vector=chunk.embedding.tolist(),
                payload={
                    "file_id": file_id,
                    "chunk_index": chunk.index,
                    "source_id": chunk.source_id,
                    "file_path": chunk.file_path,
                    "text": chunk.text[:500],  # preview, not full text
                    "mime_type": chunk.mime_type,
                }
            ))

        self.client.upsert(collection_name="kb_chunks", points=points)
        return point_ids

    def delete_by_file_id(self, file_id: str):
        """Delete all chunks for a file (used before re-embedding)."""
        self.client.delete(
            collection_name="kb_chunks",
            points_selector=FilterSelector(
                filter=Filter(
                    must=[FieldCondition(key="file_id", match=MatchValue(value=file_id))]
                )
            )
        )
```

### 5. Incremental Re-Embedding

When a file is updated:

```python
async def reembed_file(file_id: str):
    # 1. Delete old Qdrant points
    indexer.delete_by_file_id(file_id)

    # 2. Delete old kms_embeddings records
    await db.execute(
        delete(KmsEmbedding).where(KmsEmbedding.file_id == file_id)
    )

    # 3. Re-run full embedding pipeline
    await embed_file(file_id)
```

This is an atomic delete-then-reindex pattern. During the window between delete and reindex, search results for this file will be absent (acceptable trade-off vs. complexity of atomic swap).

### 6. kms_embeddings Table

```sql
CREATE TABLE kms_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES kms_files(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    qdrant_point_id UUID NOT NULL,
    chunk_text TEXT,          -- first 500 chars for debugging
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(file_id, chunk_index)
);

CREATE INDEX idx_kms_embeddings_file_id ON kms_embeddings(file_id);
CREATE INDEX idx_kms_embeddings_qdrant_point_id ON kms_embeddings(qdrant_point_id);
```

---

## File Processing Pipeline

```
MinIO (file)
    → Download to temp dir
    → Detect MIME type (python-magic)
    → Select extractor
    → Extract text (with fallback)
    → Chunk text (recursive splitter)
    → Generate embeddings (batch)
    → Upsert to Qdrant
    → Insert kms_embeddings records
    → Update kms_files.embedding_status = 'completed'
    → Cleanup temp file
```

Full pipeline function:

```python
async def process_file(file_id: str):
    file = await db.get(KmsFile, file_id)

    try:
        await db.execute(
            update(KmsFile).where(KmsFile.id == file_id)
            .values(embedding_status="processing")
        )

        # Download from MinIO
        temp_path = await minio.download(file.storage_path)

        # Extract text
        extractor = get_extractor(file.mime_type)
        text = extractor.extract(temp_path)

        # Chunk
        splitter = RecursiveCharacterSplitter()
        chunks_text = splitter.split(text)

        # Embed
        generator = EmbeddingGenerator()
        embeddings = generator.embed(chunks_text)

        # Index
        chunks = [Chunk(index=i, text=t, embedding=e, ...) for i, (t, e) in enumerate(zip(chunks_text, embeddings))]
        point_ids = indexer.upsert_chunks(file_id, chunks)

        # Persist metadata
        await db.execute(
            insert(KmsEmbedding),
            [{"file_id": file_id, "chunk_index": i, "qdrant_point_id": pid}
             for i, pid in enumerate(point_ids)]
        )

        await db.execute(
            update(KmsFile).where(KmsFile.id == file_id)
            .values(embedding_status="completed", chunk_count=len(chunks))
        )
    except UnsupportedMimeTypeError:
        await mark_failed(file_id, "Unsupported file type")
    except ExtractionError as e:
        await mark_failed(file_id, f"Extraction failed: {e}")
    finally:
        cleanup_temp(temp_path)
```

---

## Handling Extraction Failures (Graceful Degradation)

| Failure Type | Behavior |
|-------------|----------|
| Unsupported MIME type | Mark `embedding_status='unsupported'`, do not retry |
| PDF extraction fails completely | Mark `embedding_status='failed'`, retry up to 3 times |
| OCR produces < 20 chars | Mark `embedding_status='low_quality'`, flag for manual review |
| Audio transcription timeout | Mark `embedding_status='failed'`, retry |
| Qdrant unavailable | Raise exception, message returns to queue (RabbitMQ retry) |
| Chunk count = 0 after splitting | Mark `embedding_status='empty'`, log warning |

---

## Monitoring Embedding Quality

Key metrics to track:
- `embedding_coverage` = files with status `completed` / total files (target: > 95%)
- `avg_chunk_count` per file type (sanity check for chunking)
- `extraction_failure_rate` per MIME type
- `embedding_latency_p95` per file type
- `qdrant_collection_size` (total point count)

SQL for coverage check:
```sql
SELECT embedding_status, COUNT(*) as count, file_type
FROM kms_files
GROUP BY embedding_status, file_type
ORDER BY file_type, embedding_status;
```

---

## Performance Optimization

| Optimization | Impact | When to Apply |
|-------------|--------|--------------|
| GPU inference (CUDA) | 10–20x faster | When GPU available |
| Batch size 64–128 | 2–3x throughput | GPU inference |
| Async MinIO download + sync extraction | Overlaps I/O and CPU | Always |
| Pre-load model at startup | Eliminates cold start | Always |
| Concurrent workers (multiple consumers) | Linear throughput scaling | When queue depth > 100 |
| `read_only=True` in openpyxl | Reduces memory 70% | XLSX files |

---

## Files to Know

- `embedding-worker/extractors/pdf.py` — PDF extraction
- `embedding-worker/extractors/docx.py` — DOCX extraction
- `embedding-worker/extractors/xlsx.py` — XLSX extraction
- `embedding-worker/extractors/image_ocr.py` — OCR pipeline
- `embedding-worker/extractors/transcription.py` — voice-app integration
- `embedding-worker/chunking/recursive_splitter.py` — text chunking
- `embedding-worker/embeddings/generator.py` — SentenceTransformer wrapper
- `embedding-worker/indexing/qdrant_indexer.py` — Qdrant upsert/delete
- `embedding-worker/workers/consumer.py` — RabbitMQ consumer
- `scan-worker/scanner.py` — gap-filler for missed embedding events

---

## Related Agents

- `kb-search-specialist` — consumes the Qdrant index this agent builds
- `kb-voice-specialist` — provides transcription text for audio/video files
- `kb-platform-engineer` — owns MinIO, Qdrant, RabbitMQ infrastructure
