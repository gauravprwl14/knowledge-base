# embedding-worker Service

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The `embedding-worker` is a Python-based background worker responsible for content extraction, text chunking, and vector embedding generation. It processes files discovered by the scan-worker and stores embeddings in Qdrant for semantic search.

---

## Service Identity

| Property | Value |
|----------|-------|
| **Name** | embedding-worker |
| **Language** | Python 3.11+ |
| **Framework** | asyncio + sentence-transformers |
| **Port** | None (worker) |
| **Type** | Worker Service (Asynchronous) |
| **Queue** | embed.queue |
| **Repository** | /embedding-worker |

---

## Responsibilities

### Primary Responsibilities

1. **Content Extraction**
   - Extract text from PDFs, Office documents, Google Docs
   - Process images for OCR (future)
   - Extract metadata from media files

2. **Text Chunking**
   - Split large documents into semantic chunks
   - Maintain context overlap between chunks
   - Handle different document structures

3. **Embedding Generation**
   - Generate vector embeddings using sentence-transformers
   - Support multiple embedding models
   - Batch processing for efficiency

4. **Vector Storage**
   - Store embeddings in Qdrant
   - Manage collection lifecycle
   - Handle upserts for re-processed files

5. **Pipeline Handoff**
   - Publish processed files to dedup.queue
   - Trigger deduplication after embedding

---

## Tech Stack

| Category | Library | Version | Purpose |
|----------|---------|---------|---------|
| **Runtime** | Python | 3.11+ | Language runtime |
| **ML** | sentence-transformers | 2.x | Vector embeddings |
| **ML** | torch | 2.x | Deep learning framework |
| **PDF** | PyPDF2 | 3.x | PDF text extraction |
| **PDF** | pdfplumber | 0.10.x | Complex PDF handling |
| **Word** | python-docx | 1.x | DOCX extraction |
| **Excel** | openpyxl | 3.x | XLSX extraction |
| **CSV** | pandas | 2.x | CSV/Excel processing |
| **Images** | Pillow | 10.x | Image metadata |
| **Media** | ffmpeg-python | 0.2.x | Audio/video metadata |
| **Chunking** | langchain | 0.1.x | Text splitter |
| **Vector DB** | qdrant-client | 1.x | Qdrant API client |
| **Queue** | aio-pika | 9.x | RabbitMQ client |
| **Database** | asyncpg | 0.29.x | PostgreSQL driver |
| **Validation** | pydantic | 2.x | Data validation |
| **Logging** | structlog | 23.x | Structured logging |

---

## Project Structure

```
embedding-worker/
├── app/
│   ├── __init__.py
│   ├── main.py                    # Entry point
│   ├── config.py                  # Configuration
│   ├── worker.py                  # Queue consumer
│   │
│   ├── extractors/
│   │   ├── __init__.py
│   │   ├── base.py               # Extractor interface
│   │   ├── pdf.py                # PDF extractor
│   │   ├── office.py             # Word/Excel/PowerPoint
│   │   ├── google_docs.py        # Google Docs export
│   │   ├── text.py               # Plain text files
│   │   ├── code.py               # Source code files
│   │   └── media.py              # Audio/video metadata
│   │
│   ├── chunking/
│   │   ├── __init__.py
│   │   ├── base.py               # Chunker interface
│   │   ├── semantic.py           # Semantic chunking
│   │   ├── recursive.py          # Recursive text splitter
│   │   └── document.py           # Document-aware chunking
│   │
│   ├── embedding/
│   │   ├── __init__.py
│   │   ├── generator.py          # Embedding generator
│   │   ├── models.py             # Model management
│   │   └── batch.py              # Batch processing
│   │
│   ├── storage/
│   │   ├── __init__.py
│   │   ├── qdrant.py             # Qdrant client
│   │   └── postgres.py           # PostgreSQL client
│   │
│   ├── queue/
│   │   ├── __init__.py
│   │   ├── consumer.py           # Message consumer
│   │   └── publisher.py          # Message publisher
│   │
│   └── utils/
│       ├── __init__.py
│       ├── download.py           # File download helper
│       └── mime_types.py         # MIME type handling
│
├── models/                        # Downloaded ML models
├── tests/
│   ├── unit/
│   └── integration/
│
├── requirements.txt
├── Dockerfile
└── README.md
```

---

## Content Extraction

### Extractor Interface

```python
# app/extractors/base.py - NOT executable - conceptual implementation

from abc import ABC, abstractmethod
from pydantic import BaseModel
from typing import List

class ExtractedContent(BaseModel):
    """Result of content extraction"""
    text: str                      # Extracted text content
    metadata: dict                 # Document metadata
    pages: int | None              # Number of pages (if applicable)
    word_count: int                # Approximate word count
    language: str | None           # Detected language
    structure: dict | None         # Document structure (headings, etc.)

class BaseExtractor(ABC):
    """
    Abstract base class for content extractors.
    Each extractor handles specific file types.
    """

    SUPPORTED_MIME_TYPES: List[str] = []

    @abstractmethod
    async def extract(self, file_path: str, mime_type: str) -> ExtractedContent:
        """
        Extract text content from file.

        Args:
            file_path: Path to downloaded file
            mime_type: MIME type of the file

        Returns:
            ExtractedContent with text and metadata
        """
        pass

    @classmethod
    def supports(cls, mime_type: str) -> bool:
        """Check if extractor supports this MIME type"""
        return mime_type in cls.SUPPORTED_MIME_TYPES
```

### PDF Extractor

```python
# app/extractors/pdf.py - NOT executable - conceptual implementation

import PyPDF2
import pdfplumber
from typing import List

class PDFExtractor(BaseExtractor):
    """
    PDF text extraction with fallback strategies.
    Uses PyPDF2 for simple PDFs, pdfplumber for complex layouts.
    """

    SUPPORTED_MIME_TYPES = ['application/pdf']

    async def extract(self, file_path: str, mime_type: str) -> ExtractedContent:
        """Extract text from PDF"""

        # Try PyPDF2 first (faster, handles simple PDFs)
        text = await self._extract_pypdf2(file_path)

        # If extraction failed or text is too short, try pdfplumber
        if not text or len(text) < 100:
            text = await self._extract_pdfplumber(file_path)

        # Extract metadata
        metadata = await self._extract_metadata(file_path)

        return ExtractedContent(
            text=self._clean_text(text),
            metadata=metadata,
            pages=metadata.get('pages'),
            word_count=len(text.split()),
            language=self._detect_language(text),
            structure=self._extract_structure(text)
        )

    async def _extract_pypdf2(self, file_path: str) -> str:
        """Fast extraction using PyPDF2"""
        text_parts = []

        with open(file_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)

            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)

        return '\n\n'.join(text_parts)

    async def _extract_pdfplumber(self, file_path: str) -> str:
        """Complex extraction using pdfplumber (tables, multi-column)"""
        text_parts = []

        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                # Extract text with layout preservation
                page_text = page.extract_text(
                    layout=True,
                    x_tolerance=3,
                    y_tolerance=3
                )
                if page_text:
                    text_parts.append(page_text)

                # Extract tables separately
                tables = page.extract_tables()
                for table in tables:
                    table_text = self._table_to_text(table)
                    text_parts.append(table_text)

        return '\n\n'.join(text_parts)
```

---

## Text Chunking Algorithm

### Conceptual Algorithm

```
ALGORITHM: Semantic Text Chunking
INPUT: text, chunk_size (1000), chunk_overlap (200), min_chunk_size (100)
OUTPUT: List of text chunks with metadata

1. PREPROCESS TEXT
   - Normalize whitespace
   - Remove control characters
   - Preserve paragraph boundaries

2. SPLIT INTO SENTENCES
   - Use regex pattern for sentence boundaries
   - Handle abbreviations (Dr., Mr., etc.)
   - Preserve list items as units

3. GROUP INTO PARAGRAPHS
   - Detect paragraph boundaries (double newline)
   - Group sentences by paragraph

4. BUILD CHUNKS
   - current_chunk = []
   - current_length = 0

   FOR EACH paragraph DO
     IF current_length + len(paragraph) <= chunk_size THEN
       - Add paragraph to current_chunk
       - current_length += len(paragraph)
     ELSE IF len(paragraph) > chunk_size THEN
       - YIELD current_chunk (if not empty)
       - Split paragraph into smaller chunks
       - YIELD each sub-chunk
       - current_chunk = [], current_length = 0
     ELSE
       - YIELD current_chunk
       - Start new chunk with overlap from previous
       - current_chunk = [overlap_text, paragraph]

5. HANDLE OVERLAP
   - Take last chunk_overlap characters from previous chunk
   - Ensure overlap doesn't split words

6. VALIDATE CHUNKS
   - Skip chunks smaller than min_chunk_size
   - Merge tiny trailing chunks with previous

7. RETURN chunks with metadata (index, start_char, end_char)
```

### High-Level Implementation

```python
# app/chunking/semantic.py - NOT executable - conceptual implementation

from typing import List, Iterator
from pydantic import BaseModel
import re

class TextChunk(BaseModel):
    """A chunk of text with position metadata"""
    text: str
    index: int                     # Chunk index in document
    start_char: int                # Start position in original text
    end_char: int                  # End position in original text
    metadata: dict                 # Additional context

class SemanticChunker:
    """
    Semantic text chunking that respects document structure.
    Splits text into overlapping chunks while preserving meaning.
    """

    SENTENCE_PATTERN = re.compile(
        r'(?<=[.!?])\s+(?=[A-Z])|(?<=\n\n)',
        re.MULTILINE
    )

    def __init__(
        self,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        min_chunk_size: int = 100
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.min_chunk_size = min_chunk_size

    def chunk(self, text: str, metadata: dict = None) -> List[TextChunk]:
        """Split text into semantic chunks"""

        # Step 1: Preprocess
        text = self._preprocess(text)

        if len(text) <= self.chunk_size:
            return [TextChunk(
                text=text,
                index=0,
                start_char=0,
                end_char=len(text),
                metadata=metadata or {}
            )]

        # Step 2: Split into paragraphs
        paragraphs = self._split_paragraphs(text)

        # Step 3: Build chunks
        chunks = list(self._build_chunks(paragraphs, text))

        # Step 4: Add metadata
        for i, chunk in enumerate(chunks):
            chunk.index = i
            chunk.metadata = {**(metadata or {}), 'total_chunks': len(chunks)}

        return chunks

    def _build_chunks(
        self,
        paragraphs: List[str],
        original_text: str
    ) -> Iterator[TextChunk]:
        """Build overlapping chunks from paragraphs"""

        current_chunk = []
        current_length = 0
        current_start = 0
        char_position = 0

        for paragraph in paragraphs:
            para_length = len(paragraph)

            # Check if paragraph fits in current chunk
            if current_length + para_length <= self.chunk_size:
                current_chunk.append(paragraph)
                current_length += para_length + 1  # +1 for separator
            else:
                # Yield current chunk if it has content
                if current_chunk and current_length >= self.min_chunk_size:
                    chunk_text = '\n'.join(current_chunk)
                    yield TextChunk(
                        text=chunk_text,
                        index=0,  # Will be set later
                        start_char=current_start,
                        end_char=current_start + len(chunk_text),
                        metadata={}
                    )

                # Start new chunk with overlap
                overlap_text = self._get_overlap(current_chunk)
                current_start = char_position - len(overlap_text)
                current_chunk = [overlap_text, paragraph] if overlap_text else [paragraph]
                current_length = len(overlap_text) + para_length

            char_position += para_length + 1

        # Yield final chunk
        if current_chunk:
            chunk_text = '\n'.join(current_chunk)
            if len(chunk_text) >= self.min_chunk_size:
                yield TextChunk(
                    text=chunk_text,
                    index=0,
                    start_char=current_start,
                    end_char=current_start + len(chunk_text),
                    metadata={}
                )

    def _get_overlap(self, current_chunk: List[str]) -> str:
        """Extract overlap text from end of current chunk"""
        if not current_chunk:
            return ""

        full_text = '\n'.join(current_chunk)
        if len(full_text) <= self.chunk_overlap:
            return full_text

        # Take last N characters, but don't split words
        overlap = full_text[-self.chunk_overlap:]
        first_space = overlap.find(' ')
        if first_space > 0:
            overlap = overlap[first_space + 1:]

        return overlap

    def _split_paragraphs(self, text: str) -> List[str]:
        """Split text into paragraphs"""
        paragraphs = re.split(r'\n\s*\n', text)
        return [p.strip() for p in paragraphs if p.strip()]

    def _preprocess(self, text: str) -> str:
        """Normalize text before chunking"""
        # Normalize whitespace
        text = re.sub(r'[ \t]+', ' ', text)
        # Remove control characters except newlines
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)
        return text.strip()
```

---

## Embedding Generation

### Conceptual Algorithm

```
ALGORITHM: Batch Embedding Generation
INPUT: chunks (List[str]), model_name, batch_size (32)
OUTPUT: List of embedding vectors

1. LOAD MODEL
   - IF model not cached THEN
     - Download model from HuggingFace
     - Cache to disk
   - Load model into memory (GPU if available)

2. PREPARE BATCHES
   - Split chunks into batches of batch_size
   - Track original indices for reassembly

3. ENCODE BATCHES
   FOR EACH batch DO
     - Tokenize batch
     - Run through transformer model
     - Mean pool token embeddings
     - Normalize to unit vectors
     - YIELD batch embeddings

4. POST-PROCESS
   - Verify all embeddings have same dimension
   - Convert to numpy/list format

5. RETURN embeddings aligned with input chunks
```

### High-Level Implementation

```python
# app/embedding/generator.py - NOT executable - conceptual implementation

from sentence_transformers import SentenceTransformer
from typing import List
import numpy as np

class EmbeddingGenerator:
    """
    Generate vector embeddings using sentence-transformers.
    Supports multiple models with caching.
    """

    # Default model configurations
    MODELS = {
        'default': {
            'name': 'all-MiniLM-L6-v2',
            'dimension': 384,
            'max_sequence': 256
        },
        'multilingual': {
            'name': 'paraphrase-multilingual-MiniLM-L12-v2',
            'dimension': 384,
            'max_sequence': 128
        },
        'large': {
            'name': 'all-mpnet-base-v2',
            'dimension': 768,
            'max_sequence': 384
        }
    }

    def __init__(self, model_key: str = 'default', cache_dir: str = './models'):
        self.model_config = self.MODELS[model_key]
        self.cache_dir = cache_dir
        self._model = None

    @property
    def model(self) -> SentenceTransformer:
        """Lazy load model"""
        if self._model is None:
            self._model = SentenceTransformer(
                self.model_config['name'],
                cache_folder=self.cache_dir
            )
        return self._model

    @property
    def dimension(self) -> int:
        """Get embedding dimension"""
        return self.model_config['dimension']

    async def generate(
        self,
        texts: List[str],
        batch_size: int = 32,
        show_progress: bool = False
    ) -> List[List[float]]:
        """
        Generate embeddings for a list of texts.

        Args:
            texts: List of text strings to embed
            batch_size: Number of texts per batch
            show_progress: Show progress bar

        Returns:
            List of embedding vectors (as lists of floats)
        """
        if not texts:
            return []

        # Truncate texts that exceed max sequence length
        max_length = self.model_config['max_sequence'] * 4  # ~4 chars per token
        truncated = [text[:max_length] for text in texts]

        # Generate embeddings
        embeddings = self.model.encode(
            truncated,
            batch_size=batch_size,
            show_progress_bar=show_progress,
            convert_to_numpy=True,
            normalize_embeddings=True  # L2 normalize for cosine similarity
        )

        # Convert to list format for JSON serialization
        return embeddings.tolist()

    async def generate_single(self, text: str) -> List[float]:
        """Generate embedding for a single text"""
        embeddings = await self.generate([text])
        return embeddings[0]
```

---

## Qdrant Integration

### Collection Schema

```python
# Qdrant collection configuration

collection_config = {
    "name": "kms_files_default",
    "vectors": {
        "size": 384,              # MiniLM dimension
        "distance": "Cosine"       # Similarity metric
    },
    "hnsw_config": {
        "m": 16,                   # HNSW graph connections
        "ef_construct": 100        # Index build quality
    },
    "payload_schema": {
        "file_id": "keyword",      # For filtering
        "chunk_index": "integer",
        "source_id": "keyword",
        "user_id": "keyword",
        "mime_type": "keyword",
        "created_at": "datetime"
    }
}
```

### Qdrant Client

```python
# app/storage/qdrant.py - NOT executable - conceptual implementation

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from typing import List
import uuid

class QdrantStorage:
    """
    Qdrant vector storage client.
    Handles embedding storage and similarity search.
    """

    def __init__(self, url: str, collection_name: str = 'kms_files_default'):
        self.client = QdrantClient(url=url)
        self.collection_name = collection_name

    async def ensure_collection(self, vector_size: int = 384):
        """Create collection if it doesn't exist"""
        collections = self.client.get_collections().collections
        exists = any(c.name == self.collection_name for c in collections)

        if not exists:
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=vector_size,
                    distance=Distance.COSINE
                )
            )

    async def upsert_embeddings(
        self,
        file_id: str,
        chunks: List[dict],      # {text, embedding, index}
        metadata: dict
    ) -> int:
        """
        Store embeddings for a file's chunks.
        Deletes existing embeddings for the file first.

        Returns:
            Number of points stored
        """
        # Delete existing embeddings for this file
        await self.delete_by_file(file_id)

        # Build points
        points = []
        for chunk in chunks:
            point_id = str(uuid.uuid4())
            points.append(PointStruct(
                id=point_id,
                vector=chunk['embedding'],
                payload={
                    'file_id': file_id,
                    'chunk_index': chunk['index'],
                    'chunk_text': chunk['text'][:500],  # Preview
                    **metadata
                }
            ))

        # Upsert in batches
        batch_size = 100
        for i in range(0, len(points), batch_size):
            batch = points[i:i + batch_size]
            self.client.upsert(
                collection_name=self.collection_name,
                points=batch
            )

        return len(points)

    async def delete_by_file(self, file_id: str):
        """Delete all embeddings for a file"""
        self.client.delete(
            collection_name=self.collection_name,
            points_selector={
                "filter": {
                    "must": [
                        {"key": "file_id", "match": {"value": file_id}}
                    ]
                }
            }
        )
```

---

## Processing Pipeline

### Queue Message Flow

```
embed.queue (consume) → Process → dedup.queue (publish)
```

### Processing Steps

```python
# app/worker.py - NOT executable - conceptual implementation

class EmbeddingWorker:
    """Main worker that processes files from embed.queue"""

    async def process_file(self, message: dict):
        """
        Process a single file:
        1. Download content
        2. Extract text
        3. Chunk text
        4. Generate embeddings
        5. Store in Qdrant
        6. Update database
        7. Publish to dedup.queue
        """
        file_id = message['payload']['file_id']

        try:
            # Step 1: Download file content
            file_path = await self.downloader.download(
                source_type=message['payload']['source_type'],
                source_file_id=message['payload']['source_file_id']
            )

            # Step 2: Extract text
            extractor = self.extractor_factory.get_extractor(
                message['payload']['mime_type']
            )
            content = await extractor.extract(
                file_path,
                message['payload']['mime_type']
            )

            # Step 3: Chunk text
            chunks = self.chunker.chunk(
                content.text,
                metadata={'file_id': file_id}
            )

            # Step 4: Generate embeddings
            chunk_texts = [c.text for c in chunks]
            embeddings = await self.embedding_generator.generate(chunk_texts)

            # Step 5: Store in Qdrant
            chunk_data = [
                {'text': c.text, 'embedding': e, 'index': c.index}
                for c, e in zip(chunks, embeddings)
            ]
            await self.qdrant.upsert_embeddings(
                file_id=file_id,
                chunks=chunk_data,
                metadata={
                    'source_id': message['payload']['source_id'],
                    'user_id': message['payload']['user_id'],
                    'mime_type': message['payload']['mime_type']
                }
            )

            # Step 6: Update database
            await self.db.update_file_embedding_status(
                file_id=file_id,
                status='completed',
                chunk_count=len(chunks),
                word_count=content.word_count
            )

            # Step 7: Publish to dedup.queue
            await self.publisher.publish(
                queue='dedup.queue',
                message={
                    'event_type': 'EMBEDDING_COMPLETED',
                    'payload': {
                        'file_id': file_id,
                        'chunk_count': len(chunks)
                    }
                }
            )

        except Exception as e:
            await self.db.update_file_embedding_status(
                file_id=file_id,
                status='failed',
                error=str(e)
            )
            raise

        finally:
            # Cleanup downloaded file
            await self.downloader.cleanup(file_path)
```

---

## Configuration

```yaml
# Environment variables
RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672
DATABASE_URL: postgresql://user:pass@postgres:5432/kms
QDRANT_URL: http://qdrant:6333

# Embedding settings
EMBEDDING_MODEL: default           # default, multilingual, large
EMBEDDING_BATCH_SIZE: 32
MODELS_CACHE_DIR: /app/models

# Chunking settings
CHUNK_SIZE: 1000
CHUNK_OVERLAP: 200
MIN_CHUNK_SIZE: 100

# Processing limits
MAX_FILE_SIZE_MB: 100
PROCESSING_TIMEOUT_MINUTES: 30
```

---

## Resource Requirements

| Resource | Requirement | Notes |
|----------|-------------|-------|
| CPU | 4 cores | For embedding generation |
| Memory | 8 GB | Model loading + batch processing |
| GPU | Optional | CUDA support for faster inference |
| Storage | 10 GB | Model cache |

---

## Scaling Strategy

| Metric | Threshold | Action |
|--------|-----------|--------|
| Queue depth | > 500 | Scale up workers |
| Processing time | > 5 min/file | Investigate |
| Memory usage | > 80% | Scale up |
| GPU utilization | < 50% | Increase batch size |
| Worker instances | 2-8 | Auto-scale on queue depth |

