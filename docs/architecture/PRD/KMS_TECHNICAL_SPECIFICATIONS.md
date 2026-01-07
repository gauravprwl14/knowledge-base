# Knowledge Management System - Technical Specifications

**Version**: 1.0
**Date**: 2026-01-07
**Purpose**: Detailed technical specifications for indexing, embeddings, search, and system integration

---

## Table of Contents

1. [Indexing Strategy](#indexing-strategy)
2. [Embedding Strategy](#embedding-strategy)
3. [Search Architecture](#search-architecture)
4. [Deduplication Algorithms](#deduplication-algorithms)
5. [Integration Specifications](#integration-specifications)
6. [Performance Specifications](#performance-specifications)
7. [Security Specifications](#security-specifications)

---

## Indexing Strategy

### Overview

The KMS uses a multi-layered indexing approach for optimal search performance and semantic understanding:

1. **Metadata Index** (PostgreSQL): Fast filtering and sorting
2. **Full-Text Index** (PostgreSQL GIN): Keyword search
3. **Vector Index** (Qdrant): Semantic search
4. **Graph Index** (Neo4j): Relationship queries

### 1.1 PostgreSQL Indexing

#### Primary Indexes

```sql
-- File identification and ownership
CREATE UNIQUE INDEX idx_kms_files_source_file
ON kms_files(source_id, source_file_id);

-- User file lookup (most common query)
CREATE INDEX idx_kms_files_user_type_date
ON kms_files(user_id, file_type, indexed_at DESC)
INCLUDE (file_name, file_size, is_junk);

-- File hash for deduplication
CREATE INDEX idx_kms_files_hash
ON kms_files(file_hash)
WHERE file_hash IS NOT NULL;

-- Junk file queries
CREATE INDEX idx_kms_files_junk
ON kms_files(user_id, junk_confidence DESC)
WHERE is_junk = TRUE
INCLUDE (file_size, junk_reasons);

-- Full-text search (GIN index)
CREATE INDEX idx_kms_files_fts
ON kms_files
USING GIN(to_tsvector('english', file_name || ' ' || COALESCE(extracted_text, '')));

-- Tag search
CREATE INDEX idx_kms_files_tags
ON kms_files
USING GIN(tags);

-- Folder hierarchy
CREATE INDEX idx_kms_files_parent
ON kms_files(parent_folder_id)
WHERE parent_folder_id IS NOT NULL;
```

#### Index Maintenance

**Auto-vacuum Configuration**:
```sql
ALTER TABLE kms_files SET (
    autovacuum_vacuum_scale_factor = 0.05,  -- Vacuum at 5% dead tuples
    autovacuum_analyze_scale_factor = 0.02  -- Analyze at 2% changes
);
```

**Index Rebuild Strategy**:
- **When**: After bulk import of >10,000 files
- **How**: `REINDEX INDEX CONCURRENTLY idx_name;` (no downtime)
- **Monitoring**: Track index bloat with `pg_stat_all_indexes`

### 1.2 Qdrant Vector Indexing

#### Collection Configuration

```python
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, OptimizersConfigDiff

client = QdrantClient(url="http://qdrant:6333")

# Create collection for default embeddings (sentence-transformers)
client.create_collection(
    collection_name="kms_files_default",
    vectors_config=VectorParams(
        size=384,  # all-MiniLM-L6-v2 dimensions
        distance=Distance.COSINE  # Cosine similarity
    ),
    optimizers_config=OptimizersConfigDiff(
        indexing_threshold=10000,  # Start indexing after 10k vectors
        memmap_threshold=20000  # Use disk after 20k vectors
    ),
    hnsw_config={
        "m": 16,  # Number of edges per node
        "ef_construct": 100  # Build-time search depth
    }
)

# Create collection for cloud embeddings (OpenAI)
client.create_collection(
    collection_name="kms_files_cloud",
    vectors_config=VectorParams(
        size=1536,  # text-embedding-3-small dimensions
        distance=Distance.COSINE
    )
)
```

#### Indexing Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **m** | 16 | Balance between accuracy and memory. Higher = better accuracy, more memory. |
| **ef_construct** | 100 | Build-time search depth. Higher = better index quality, slower build. |
| **ef** (search-time) | 64 | Runtime search depth. Tuned for 95%+ recall. |
| **distance** | COSINE | Best for normalized embeddings from transformer models. |

#### Payload Storage

**Metadata stored with each vector**:
```json
{
  "file_id": "uuid",
  "user_id": "uuid",
  "file_name": "document.pdf",
  "file_type": "pdf",
  "indexed_at": "2024-01-07T12:00:00Z",
  "chunk_index": 0,  // For chunked documents
  "source_id": "uuid",
  "tags": ["important", "work"]
}
```

**Benefits**:
- Filtered search without PostgreSQL join
- Faster retrieval of top results
- No extra database round-trip

#### Indexing Workflow

```
File Scanned → Content Extracted → Text Chunked → Embeddings Generated → Qdrant Insert
     ↓              ↓                  ↓                 ↓                    ↓
 kms_files    extracted_text    [chunk1, chunk2]   [vec1, vec2]     Point(id, vector, payload)
```

### 1.3 Neo4j Graph Indexing

#### Schema Definition

```cypher
// Node labels
CREATE CONSTRAINT file_id IF NOT EXISTS FOR (f:File) REQUIRE f.id IS UNIQUE;
CREATE CONSTRAINT folder_id IF NOT EXISTS FOR (f:Folder) REQUIRE f.id IS UNIQUE;
CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE;
CREATE CONSTRAINT project_id IF NOT EXISTS FOR (p:CodeProject) REQUIRE p.id IS UNIQUE;

// Indexes for common queries
CREATE INDEX file_name IF NOT EXISTS FOR (f:File) ON (f.name);
CREATE INDEX file_hash IF NOT EXISTS FOR (f:File) ON (f.hash);
CREATE INDEX folder_path IF NOT EXISTS FOR (f:Folder) ON (f.path);
```

#### Relationship Types

```cypher
// File hierarchy
(:File)-[:IN_FOLDER]->(:Folder)
(:Folder)-[:CHILD_OF]->(:Folder)

// Ownership
(:User)-[:OWNS]->(:File)
(:User)-[:OWNS]->(:Folder)

// Duplicates
(:File)-[:DUPLICATE_OF {similarity: 0.98, method: 'hash'}]->(:File)

// Code projects
(:CodeProject)-[:CONTAINS]->(:File)
(:Folder)-[:IS_PROJECT]->(:CodeProject)
```

#### Indexing Patterns

**Pattern 1: Create file node with relationships**
```cypher
// Create file and link to folder + owner
MERGE (f:File {id: $file_id})
SET f.name = $file_name,
    f.type = $file_type,
    f.size = $file_size,
    f.hash = $file_hash
WITH f
MATCH (u:User {id: $user_id})
MATCH (folder:Folder {id: $parent_folder_id})
MERGE (u)-[:OWNS]->(f)
MERGE (f)-[:IN_FOLDER]->(folder)
```

**Pattern 2: Find all files in folder tree**
```cypher
// Get all files under folder (recursive)
MATCH (folder:Folder {id: $folder_id})
MATCH (folder)<-[:CHILD_OF*0..]-(subfolder:Folder)
MATCH (file:File)-[:IN_FOLDER]->(subfolder)
RETURN file
```

**Pattern 3: Find duplicate clusters**
```cypher
// Find all files duplicate to this one
MATCH (f:File {id: $file_id})
MATCH (f)-[:DUPLICATE_OF*1..3]-(duplicate:File)
RETURN duplicate, LENGTH(path) as hops
ORDER BY hops ASC
```

---

## Embedding Strategy

### 2.1 Embedding Models

#### Default: Sentence Transformers (Open Source)

**Model**: `sentence-transformers/all-MiniLM-L6-v2`

**Specifications**:
- **Dimensions**: 384
- **Max Sequence Length**: 512 tokens (~350 words)
- **Performance**: ~2000 sentences/sec (CPU), ~8000 sentences/sec (GPU)
- **Size**: 80MB (small, fast download)
- **Quality**: 95% accuracy on semantic textual similarity benchmarks

**Usage**:
```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('all-MiniLM-L6-v2')
model = model.to('cuda')  # Use GPU if available

# Single text
embedding = model.encode("This is a document about machine learning.")

# Batch processing (efficient)
texts = ["doc1 text", "doc2 text", ...]
embeddings = model.encode(
    texts,
    batch_size=32,
    show_progress_bar=True,
    convert_to_numpy=True
)
```

#### Optional: OpenAI Embeddings (Cloud)

**Model**: `text-embedding-3-small`

**Specifications**:
- **Dimensions**: 1536
- **Max Sequence Length**: 8191 tokens
- **Performance**: API rate limits (varies by tier)
- **Cost**: $0.02 / 1M tokens
- **Quality**: State-of-the-art semantic understanding

**Usage**:
```python
from openai import OpenAI

client = OpenAI(api_key=user_provided_key)

response = client.embeddings.create(
    model="text-embedding-3-small",
    input=["doc1 text", "doc2 text", ...]
)

embeddings = [item.embedding for item in response.data]
```

**When to use**:
- User explicitly selects files for cloud embedding
- Configuration flag `use_cloud_embeddings_by_default` is enabled
- Higher accuracy needed for critical documents

### 2.2 Text Chunking Strategy

#### Chunking Algorithm: Recursive Character Splitter

**Implementation**:
```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

def chunk_text(text: str, chunk_size: int = 1000, chunk_overlap: int = 100) -> List[str]:
    """
    Split text into semantic chunks with overlap.

    Args:
        text: Input text to chunk
        chunk_size: Target chunk size in characters (~200 tokens)
        chunk_overlap: Overlap between chunks (maintains context)

    Returns:
        List of text chunks
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],  # Prefer semantic boundaries
        length_function=len
    )

    chunks = splitter.split_text(text)
    return chunks
```

#### Chunking Rules

| Document Type | Chunk Size | Chunk Overlap | Rationale |
|---------------|-----------|---------------|-----------|
| **Short (<1000 words)** | Don't chunk | N/A | Single embedding sufficient |
| **Medium (1000-5000 words)** | 1000 chars | 100 chars | ~200 tokens, 10% overlap |
| **Long (>5000 words)** | 1500 chars | 150 chars | Larger chunks for context |
| **Code files** | By function/class | N/A | Semantic boundaries |

#### Chunk Metadata

Each chunk stored with:
```python
{
    "file_id": "uuid",
    "chunk_index": 0,
    "chunk_text": "First 1000 characters...",
    "parent_document_preview": "Full document preview (first 500 chars)",
    "position_in_document": "start"  # start, middle, end
}
```

### 2.3 Embedding Generation Pipeline

#### Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ 1. FILE CONTENT EXTRACTED                                   │
│    - PDF: PyPDF2 → text                                     │
│    - DOCX: python-docx → text                               │
│    - Image: EXIF metadata → JSON → text                     │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. TEXT PREPROCESSING                                       │
│    - Remove excessive whitespace                            │
│    - Normalize unicode                                      │
│    - Truncate if > 100k chars (safety limit)                │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. CHUNKING DECISION                                        │
│    if len(text) < 5000 words:                               │
│        chunks = [text]  # Don't chunk short docs            │
│    else:                                                    │
│        chunks = semantic_chunk(text)                        │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. EMBEDDING GENERATION                                     │
│    - Load model (cached in memory)                          │
│    - Batch process chunks (32 at a time)                    │
│    - Generate embeddings (384-dim vectors)                  │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. STORAGE                                                  │
│    - Qdrant: vectors + payload                              │
│    - PostgreSQL: kms_embeddings records                     │
└─────────────────────────────────────────────────────────────┘
```

#### Worker Implementation

```python
import asyncio
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct

class EmbeddingWorker:
    def __init__(self):
        self.model = SentenceTransformer('all-MiniLM-L6-v2', device='cuda')
        self.qdrant = QdrantClient(url="http://qdrant:6333")
        self.batch_size = 32

    async def process_file(self, file_id: str, text: str):
        """Generate and store embeddings for a file."""
        # Chunk text
        chunks = chunk_text(text) if len(text) > 5000 else [text]

        # Generate embeddings (batch)
        embeddings = self.model.encode(
            chunks,
            batch_size=self.batch_size,
            show_progress_bar=False,
            convert_to_numpy=True
        )

        # Prepare points for Qdrant
        points = []
        for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            point = PointStruct(
                id=f"{file_id}_{idx}",
                vector=embedding.tolist(),
                payload={
                    "file_id": file_id,
                    "chunk_index": idx,
                    "chunk_text": chunk[:500],  # Preview
                    "total_chunks": len(chunks)
                }
            )
            points.append(point)

        # Upsert to Qdrant
        self.qdrant.upsert(
            collection_name="kms_files_default",
            points=points
        )

        # Store references in PostgreSQL
        for idx, chunk in enumerate(chunks):
            await db.execute(
                """
                INSERT INTO kms_embeddings (file_id, chunk_index, chunk_text, embedding_provider, embedding_model, vector_id)
                VALUES ($1, $2, $3, $4, $5, $6)
                """,
                file_id, idx, chunk[:1000], 'sentence-transformers', 'all-MiniLM-L6-v2', f"{file_id}_{idx}"
            )
```

---

## Search Architecture

### 3.1 Search Types

#### A. Keyword Search (PostgreSQL Full-Text)

**Use Case**: Exact term matching, title search, fast filtering

**Implementation**:
```sql
SELECT
    id,
    file_name,
    ts_rank(to_tsvector('english', file_name || ' ' || COALESCE(extracted_text, '')), query) AS rank,
    ts_headline('english', extracted_text, query, 'MaxWords=30, MinWords=10') AS snippet
FROM kms_files, to_tsquery('english', 'machine & learning') AS query
WHERE
    user_id = $1
    AND to_tsvector('english', file_name || ' ' || COALESCE(extracted_text, '')) @@ query
ORDER BY rank DESC
LIMIT 100;
```

**Optimization**:
- GIN index on tsvector
- Pre-computed tsvector column (materialized)
- Limit result set to 100 before ranking

#### B. Semantic Search (Qdrant Vector)

**Use Case**: Natural language queries, concept search, related files

**Implementation**:
```python
async def semantic_search(query: str, user_id: str, limit: int = 100):
    # Generate query embedding
    query_vector = model.encode(query).tolist()

    # Search Qdrant
    results = qdrant_client.search(
        collection_name="kms_files_default",
        query_vector=query_vector,
        query_filter={
            "must": [{"key": "user_id", "match": {"value": user_id}}]
        },
        limit=limit,
        with_payload=True,
        score_threshold=0.5  # Minimum similarity
    )

    # Extract file IDs and scores
    file_scores = {r.payload["file_id"]: r.score for r in results}

    return file_scores
```

**Optimization**:
- HNSW index for sub-linear search
- Filter at Qdrant level (avoid fetching filtered-out results)
- Batch fetch file metadata from PostgreSQL

#### C. Hybrid Search (Combined)

**Use Case**: Best overall results, production default

**Implementation**:
```python
async def hybrid_search(query: str, user_id: str, filters: dict):
    # Run both searches in parallel
    keyword_task = asyncio.create_task(keyword_search(query, user_id, filters))
    semantic_task = asyncio.create_task(semantic_search(query, user_id))

    keyword_results, semantic_results = await asyncio.gather(keyword_task, semantic_task)

    # Merge results with weighted scores
    combined_scores = {}

    for file_id, score in keyword_results.items():
        combined_scores[file_id] = 0.4 * score  # 40% weight

    for file_id, score in semantic_results.items():
        if file_id in combined_scores:
            combined_scores[file_id] += 0.6 * score  # 60% weight
        else:
            combined_scores[file_id] = 0.6 * score

    # Sort by combined score
    sorted_files = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)

    return sorted_files[:100]
```

**Weights Rationale**:
- Semantic (60%): Handles natural language, synonyms, concepts
- Keyword (40%): Boosts exact matches, prevents missing obvious results

### 3.2 Filtering

**Supported Filters**:

```typescript
interface SearchFilters {
  file_type?: FileType[];           // ['pdf', 'docx', 'image']
  date_range?: {
    start: Date;
    end: Date;
  };
  source_id?: string[];              // Filter by source
  size_range?: {
    min: number;                     // bytes
    max: number;
  };
  tags?: string[];                   // Match any tag
  categories?: string[];
  is_junk?: boolean;                 // Exclude junk
  has_duplicates?: boolean;          // Only files with duplicates
}
```

**Application Order**:
1. Filters applied at database level (WHERE clause) for keyword search
2. Filters applied at Qdrant level (query_filter) for semantic search
3. Post-processing filters (if not supported by Qdrant)

### 3.3 Ranking Algorithm

**Hybrid Ranking Formula**:

```
final_score = (0.4 * keyword_score) + (0.6 * semantic_score) + boost_factors

boost_factors = sum of:
  - Exact filename match: +0.2
  - Recent file (< 30 days): +0.1
  - Tagged as "important": +0.1
  - Manually favorited: +0.15
```

**Example**:
- Keyword score: 0.8
- Semantic score: 0.7
- Exact filename match: Yes (+0.2)
- Recent: No
- Important tag: Yes (+0.1)

```
final_score = (0.4 * 0.8) + (0.6 * 0.7) + 0.2 + 0.1
            = 0.32 + 0.42 + 0.3
            = 1.04
```

---

## Deduplication Algorithms

### 4.1 Exact Duplicate Detection (Hash-Based)

**Algorithm**: SHA-256 file hashing

**Implementation**:
```python
import hashlib

def calculate_file_hash(file_path: str) -> str:
    """Calculate SHA-256 hash of file content."""
    sha256 = hashlib.sha256()

    with open(file_path, 'rb') as f:
        # Read in 64KB chunks (memory efficient)
        for chunk in iter(lambda: f.read(65536), b''):
            sha256.update(chunk)

    return sha256.hexdigest()

async def detect_exact_duplicates(file_id: str, file_hash: str, user_id: str):
    """Find all files with same hash."""
    # Query for same hash (excluding self)
    results = await db.fetch(
        """
        SELECT id, file_name, file_path, file_size, indexed_at
        FROM kms_files
        WHERE file_hash = $1 AND user_id = $2 AND id != $3
        ORDER BY indexed_at ASC  -- Oldest first
        """,
        file_hash, user_id, file_id
    )

    if results:
        # Create duplicate group
        group_id = str(uuid.uuid4())
        primary_file = results[0]  # Oldest = primary

        # Insert duplicate records
        for idx, dup in enumerate([primary_file] + results[1:]):
            await db.execute(
                """
                INSERT INTO kms_duplicates (group_id, file_id, detection_method, similarity_score, is_primary)
                VALUES ($1, $2, 'hash', 1.0, $3)
                """,
                group_id, dup['id'], (idx == 0)  # First is primary
            )
```

**Performance**: O(1) hash lookup, very fast

### 4.2 Semantic Duplicate Detection (Embedding Similarity)

**Algorithm**: Cosine similarity of document embeddings

**Implementation**:
```python
async def detect_semantic_duplicates(file_id: str, threshold: float = 0.95):
    """Find semantically similar files."""
    # Get embedding for this file
    file_embedding = await get_file_embedding(file_id)

    # Search Qdrant for similar vectors
    results = qdrant_client.search(
        collection_name="kms_files_default",
        query_vector=file_embedding,
        limit=10,
        score_threshold=threshold
    )

    # Filter out self
    duplicates = [r for r in results if r.payload["file_id"] != file_id]

    if duplicates:
        group_id = str(uuid.uuid4())

        # Insert duplicate records
        await db.execute(
            """
            INSERT INTO kms_duplicates (group_id, file_id, detection_method, similarity_score, is_primary)
            VALUES ($1, $2, 'semantic', $3, FALSE)
            """,
            group_id, file_id, 1.0  # Primary file
        )

        for dup in duplicates:
            await db.execute(
                """
                INSERT INTO kms_duplicates (group_id, file_id, detection_method, similarity_score, is_primary)
                VALUES ($1, $2, 'semantic', $3, FALSE)
                """,
                group_id, dup.payload["file_id"], dup.score
            )
```

**Threshold Tuning**:
- **0.98+**: Very similar (likely same content, different format)
- **0.95-0.98**: Similar (related documents)
- **0.90-0.95**: Somewhat similar (user review recommended)

### 4.3 Version Duplicate Detection (Filename Pattern)

**Algorithm**: Regex pattern matching + Levenshtein distance

**Patterns**:
```python
import re
from difflib import SequenceMatcher

VERSION_PATTERNS = [
    r'(.+)_v(\d+)',                    # file_v1.pdf, file_v2.pdf
    r'(.+)_final',                     # file_draft.pdf, file_final.pdf
    r'(.+)\s*\((\d+)\)',               # file.pdf, file (1).pdf
    r'(.+)_(\d{4}-\d{2}-\d{2})',       # file_2024-01-01.pdf
]

def detect_version_duplicates(file_name: str, user_files: List[dict]) -> List[dict]:
    """Detect files that are versions of each other."""
    base_name = extract_base_name(file_name)
    similar_files = []

    for other_file in user_files:
        other_base = extract_base_name(other_file['file_name'])

        # Calculate similarity
        similarity = SequenceMatcher(None, base_name, other_base).ratio()

        if similarity > 0.85:  # High filename similarity
            similar_files.append({
                'file': other_file,
                'similarity': similarity
            })

    return similar_files
```

**Version Ordering**:
1. Explicit version numbers (v2 > v1)
2. "final" keyword (highest priority)
3. Date suffixes (newest first)
4. Modification timestamp (newest first)

---

## Integration Specifications

### 5.1 Google Drive API Integration

**OAuth Scopes**:
```python
SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly',      # Read files
    'https://www.googleapis.com/auth/drive.metadata.readonly',  # Read metadata
    'https://www.googleapis.com/auth/userinfo.email',      # Get user email
]
```

**API Endpoints Used**:

| Endpoint | Purpose | Rate Limit |
|----------|---------|------------|
| `files.list` | List all files | 1000 queries/100 sec/user |
| `files.get` | Get file metadata | 10,000 queries/100 sec/user |
| `files.export` | Export Google Docs | 1000 queries/100 sec/user |
| `files.download` | Download binary files | Unlimited |
| `changes.list` | Incremental sync (future) | 1000 queries/100 sec/user |

**Error Handling**:
```python
from googleapiclient.errors import HttpError
import time

async def fetch_with_retry(drive_service, file_id, max_retries=3):
    """Fetch file with exponential backoff."""
    for attempt in range(max_retries):
        try:
            return drive_service.files().get(fileId=file_id).execute()
        except HttpError as e:
            if e.resp.status == 429:  # Rate limit
                wait_time = 2 ** attempt  # Exponential backoff
                await asyncio.sleep(wait_time)
            elif e.resp.status == 404:  # File deleted
                return None
            else:
                raise
```

### 5.2 Voice-App Integration

**Transcription Trigger Flow**:

```
KMS Scan Worker finds audio/video file
    ↓
Check source config: auto_transcribe enabled?
    ↓ (YES)
Publish to trans.queue
    ↓
Transcription Worker consumes message
    ↓
Download file from source (or provide path)
    ↓
Call Voice-App API:
    POST /api/v1/upload
    Headers: X-API-Key: {voice_app_key}
    Body: FormData(file, provider, model, language)
    ↓
Voice-App returns job_id
    ↓
KMS stores link: kms_transcription_links(file_id, voice_job_id, status='processing')
    ↓
Poll Voice-App:
    GET /api/v1/jobs/{job_id}
    ↓
When status = 'completed':
    ↓
Fetch transcription:
    GET /api/v1/transcriptions/{transcription_id}
    ↓
Update kms_files.extracted_text
Update kms_transcription_links.transcription_text
Trigger embedding generation
```

**API Contract**:

```typescript
// KMS → Voice-App: Initiate Transcription
POST /api/v1/upload
Content-Type: multipart/form-data

Request:
  file: File
  provider: 'whisper' | 'groq' | 'deepgram'
  model: string
  language?: string
  webhook_url?: string  // KMS callback URL

Response:
{
  "job_id": "uuid",
  "status": "queued",
  "created_at": "2024-01-07T12:00:00Z"
}

// Voice-App → KMS: Webhook Notification
POST /webhooks/transcription-complete
Content-Type: application/json

Request:
{
  "job_id": "uuid",
  "transcription_id": "uuid",
  "status": "completed",
  "result": {
    "text": "Transcribed text...",
    "language": "en",
    "confidence": 0.95
  }
}
```

### 5.3 External Drive Scanning Script

**CLI Tool Specification**:

```bash
# Install
pip install kms-cli

# Authenticate
kms-cli login --api-key YOUR_API_KEY

# Scan external drive
kms-cli scan /Volumes/ExternalDrive \
  --source-name "My USB Drive" \
  --include-pattern "*.pdf,*.docx,*.jpg" \
  --exclude-pattern "*/node_modules/*,*/.git/*" \
  --progress

# Output:
# Scanning /Volumes/ExternalDrive...
# [████████████████████████████████] 1523/1523 files (100%)
#
# Results:
#   Files discovered: 1523
#   Files uploaded: 1520
#   Files skipped: 3 (too large)
#   Total size: 4.2 GB
#   Duration: 2m 34s
```

**Implementation**:
```python
import os
import hashlib
from pathlib import Path

class ExternalDriveScanner:
    def __init__(self, api_key: str, api_url: str):
        self.api_key = api_key
        self.api_url = api_url

    async def scan(self, root_path: str, source_name: str):
        """Scan external drive and upload metadata."""
        # Create source
        source_id = await self.create_source(source_name, 'external_drive', root_path)

        # Walk directory
        files_found = []
        for dirpath, dirnames, filenames in os.walk(root_path):
            # Exclude patterns
            dirnames[:] = [d for d in dirnames if not self.is_excluded(d)]

            for filename in filenames:
                if self.is_excluded(filename):
                    continue

                file_path = os.path.join(dirpath, filename)
                file_info = self.extract_file_info(file_path)
                files_found.append(file_info)

                # Upload in batches of 100
                if len(files_found) >= 100:
                    await self.upload_batch(source_id, files_found)
                    files_found = []

        # Upload remaining
        if files_found:
            await self.upload_batch(source_id, files_found)

    def extract_file_info(self, file_path: str) -> dict:
        """Extract metadata from file."""
        stat = os.stat(file_path)
        return {
            'file_path': file_path,
            'file_name': os.path.basename(file_path),
            'file_size': stat.st_size,
            'file_hash': self.calculate_hash(file_path),
            'source_created_at': stat.st_ctime,
            'source_modified_at': stat.st_mtime,
        }
```

---

## Performance Specifications

### 6.1 Latency Requirements

| Operation | Target Latency | Measurement |
|-----------|----------------|-------------|
| **Keyword Search** | <100ms (p50), <300ms (p99) | Time from API call to response |
| **Semantic Search** | <300ms (p50), <800ms (p99) | Time from API call to response |
| **Hybrid Search** | <500ms (p50), <1000ms (p99) | Time from API call to response |
| **File Metadata Fetch** | <50ms (p50), <150ms (p99) | Single file by ID |
| **Scan Job Initiation** | <200ms | API call to message published |
| **Embedding Generation** | <2s per file (small), <10s per file (large) | Time to embed 1000-word document |

### 6.2 Throughput Requirements

| Operation | Target Throughput | Measurement |
|-----------|-------------------|-------------|
| **File Scanning** | 1000 files/min per worker | Google Drive file discovery |
| **Embedding Generation** | 100 files/min per worker (CPU), 500 files/min (GPU) | Text extraction + embedding |
| **Search Queries** | 50 queries/sec per API instance | Concurrent users searching |
| **Deduplication** | 10,000 files/hour per worker | Hash + semantic comparison |

### 6.3 Scalability Targets

| Metric | MVP (Individual) | Phase 2 (Teams) | Phase 3 (Enterprise) |
|--------|-----------------|-----------------|---------------------|
| **Files per user** | 100,000 | 1,000,000 | 10,000,000 |
| **Total users** | 1,000 | 10,000 | 100,000 |
| **Total files** | 100M | 10B | 1T |
| **Search QPS** | 100 | 1,000 | 10,000 |
| **Concurrent scans** | 10 | 100 | 1,000 |

### 6.4 Resource Allocation

**Per Service Limits (Docker)**:

```yaml
# docker-compose.kms.yml
services:
  kms-api:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M

  search-api:
    deploy:
      resources:
        limits:
          cpus: '4.0'      # CPU-bound search
          memory: 4G

  embedding-worker:
    deploy:
      resources:
        limits:
          cpus: '4.0'
          memory: 8G       # GPU memory if available
        reservations:
          memory: 2G

  qdrant:
    deploy:
      resources:
        limits:
          memory: 16G      # Vector storage
        reservations:
          memory: 4G

  neo4j:
    deploy:
      resources:
        limits:
          memory: 8G       # Graph storage
        reservations:
          memory: 2G
```

---

## Security Specifications

### 7.1 Token Encryption (Google Drive)

**Algorithm**: AES-256-GCM

**Implementation**:
```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os
import base64

class TokenEncryption:
    def __init__(self, encryption_key: bytes):
        """
        Args:
            encryption_key: 32-byte key (from environment variable)
        """
        self.gcm = AESGCM(encryption_key)

    def encrypt(self, plaintext: str) -> str:
        """Encrypt OAuth token."""
        nonce = os.urandom(12)  # 96-bit nonce
        plaintext_bytes = plaintext.encode('utf-8')

        ciphertext = self.gcm.encrypt(nonce, plaintext_bytes, None)

        # Combine nonce + ciphertext
        encrypted = nonce + ciphertext
        return base64.urlsafe_b64encode(encrypted).decode('ascii')

    def decrypt(self, encrypted: str) -> str:
        """Decrypt OAuth token."""
        encrypted_bytes = base64.urlsafe_b64decode(encrypted.encode('ascii'))

        nonce = encrypted_bytes[:12]
        ciphertext = encrypted_bytes[12:]

        plaintext_bytes = self.gcm.decrypt(nonce, ciphertext, None)
        return plaintext_bytes.decode('utf-8')
```

**Key Management**:
- Encryption key stored in environment variable: `ENCRYPTION_KEY`
- Generated once: `python -c "import os; print(os.urandom(32).hex())"`
- Never committed to version control
- Rotated annually (re-encrypt all tokens)

### 7.2 API Key Security (Future: HashiCorp Vault)

**Vault Integration** (Roadmap):

```python
import hvac

class VaultClient:
    def __init__(self, vault_url: str, vault_token: str):
        self.client = hvac.Client(url=vault_url, token=vault_token)

    def store_token(self, source_id: str, token: str):
        """Store OAuth token in Vault."""
        self.client.secrets.kv.v2.create_or_update_secret(
            path=f'kms/sources/{source_id}/token',
            secret={'token': token}
        )

    def retrieve_token(self, source_id: str) -> str:
        """Retrieve OAuth token from Vault."""
        secret = self.client.secrets.kv.v2.read_secret_version(
            path=f'kms/sources/{source_id}/token'
        )
        return secret['data']['data']['token']
```

### 7.3 File Access Control (Future)

**Row-Level Security (PostgreSQL)**:

```sql
-- Enable RLS
ALTER TABLE kms_files ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own files
CREATE POLICY user_files_policy ON kms_files
FOR ALL
USING (user_id = current_setting('app.current_user_id')::UUID);

-- Policy: Team members can see team files
CREATE POLICY team_files_policy ON kms_files
FOR SELECT
USING (
    team_id IN (
        SELECT team_id FROM auth_team_members
        WHERE user_id = current_setting('app.current_user_id')::UUID
    )
);
```

**Usage**:
```python
# Set user context for session
await db.execute("SET app.current_user_id = $1", user_id)

# Now queries automatically filtered by RLS
files = await db.fetch("SELECT * FROM kms_files")  # Only user's files returned
```

---

**Document Version**: 1.0
**Last Updated**: 2026-01-07
**Next Review**: After MVP implementation
