# Knowledge Management System (KMS) - System Architecture

**Version**: 1.0
**Date**: 2026-01-07
**Status**: Design Phase

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Microservices Architecture](#microservices-architecture)
4. [Database Architecture](#database-architecture)
5. [Technology Stack](#technology-stack)
6. [Integration Points](#integration-points)
7. [Data Flow](#data-flow)
8. [Scalability & Performance](#scalability--performance)
9. [Observability & Monitoring](#observability--monitoring)
10. [Design Trade-offs](#design-trade-offs)
11. [Future Roadmap](#future-roadmap)

---

## Executive Summary

The Knowledge Management System (KMS) is a composable, microservices-based platform designed to:

- **Index and organize** files from multiple sources (Google Drive, local file systems, external drives)
- **Enable intelligent search** using semantic and keyword search with advanced filtering
- **Detect and manage duplicates** using file hashing and AI-powered semantic analysis
- **Clean up junk files** through automated detection and bulk user-approved deletion
- **Integrate with voice-app** for audio/video transcription
- **Scale to TB-scale data** with no limits on files or storage per user

### Key Design Principles

1. **Composable Architecture**: Microservices can be developed, deployed, and scaled independently
2. **Logical Database Separation**: Single PostgreSQL database initially with clear table boundaries for future database split
3. **Polyglot Microservices**: Best language for each service (NestJS for APIs, Python for Workers)
4. **Open Source First**: Prefer open source tools with optional cloud provider integration
5. **Milestone-Based Delivery**: Incremental value delivery with clear MVP definition

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │  Web UI (Next.js)│  │  External Drive  │  │   Mobile (Future)│      │
│  │                  │  │  Scan Script     │  │                  │      │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ HTTPS
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       API GATEWAY / NGINX                                │
│                    (Reverse Proxy + Load Balancer)                       │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   KMS API       │    │  Voice App API  │    │   Search API    │
│   (NestJS)      │    │   (FastAPI)     │    │   (NestJS)      │
│                 │    │                 │    │                 │
│ - File Mgmt     │    │ - Transcription │    │ - Semantic      │
│ - Scan Jobs     │    │ - Translation   │    │ - Keyword       │
│ - Deduplication │    │                 │    │ - Filters       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                        │                        │
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        MESSAGE QUEUE (RabbitMQ)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│  │ scan.queue   │  │ embed.queue  │  │ dedup.queue  │  │ trans.queue  ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Scan Worker    │    │ Embedding Worker│    │ Deduplication   │
│  (Python)       │    │  (Python)       │    │  Worker (Python)│
│                 │    │                 │    │                 │
│ - Google Drive  │    │ - Text Extract  │    │ - Hash Compare  │
│ - Local FS      │    │ - Embeddings    │    │ - Semantic Sim  │
│ - External Drive│    │ - Chunking      │    │ - Clustering    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                       │
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │   PostgreSQL     │  │  Qdrant (Vector) │  │  Neo4j (Graph)   │      │
│  │                  │  │                  │  │                  │      │
│  │ - Users/Auth     │  │ - Embeddings     │  │ - Relationships  │      │
│  │ - Files/Metadata │  │ - Semantic Index │  │ - File Hierarchy │      │
│  │ - Scan Jobs      │  │                  │  │ - Duplicates     │      │
│  │ - Transcriptions │  │                  │  │                  │      │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘      │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │              Object Storage (MinIO / S3 Compatible)          │      │
│  │           - Original files (hybrid: small files stored)      │      │
│  │           - Extracted content (text, thumbnails)             │      │
│  └──────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       OBSERVABILITY LAYER                               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │           OpenTelemetry Collector (Central Telemetry Hub)       │   │
│  │               Port: 4317 (gRPC), 4318 (HTTP)                    │   │
│  │                                                                  │   │
│  │  Receives: Traces + Metrics from all services via OTLP          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                    │                           │                        │
│                    ▼                           ▼                        │
│  ┌──────────────────────┐        ┌──────────────────────┐              │
│  │   Jaeger (Traces)    │        │ Prometheus (Metrics) │              │
│  │   Port: 16686 (UI)   │        │   Port: 9090         │              │
│  │                      │        │                      │              │
│  │  - Distributed Trace │        │  - Time-series DB    │              │
│  │  - Span Analysis     │        │  - Alerting Rules    │              │
│  │  - Service Map       │        │  - Service Metrics   │              │
│  └──────────────────────┘        └──────────────────────┘              │
│                    │                           │                        │
│                    └─────────────┬─────────────┘                        │
│                                  ▼                                      │
│                    ┌──────────────────────┐                             │
│                    │   Grafana (Dashboards)│                            │
│                    │     Port: 3001        │                            │
│                    │                       │                            │
│                    │  - Unified Dashboards │                            │
│                    │  - Trace Correlation  │                            │
│                    │  - Alert Management   │                            │
│                    └──────────────────────┘                             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Microservices Architecture

### Service Breakdown

| Service | Language | Responsibility | Scales Independently |
|---------|----------|----------------|---------------------|
| **kms-api** | NestJS | File management, user operations, scan job orchestration | ✅ Horizontal |
| **search-api** | NestJS | Search queries, filtering, ranking | ✅ Horizontal |
| **scan-worker** | Python | File discovery from sources (Google Drive, local FS, external drives) | ✅ Horizontal (worker pool) |
| **embedding-worker** | Python | Content extraction, text embedding generation, chunking | ✅ Horizontal (worker pool) |
| **dedup-worker** | Python | Duplicate detection (hash-based + semantic) | ✅ Horizontal (worker pool) |
| **junk-detector** | Python | Junk file identification using rules + ML | ✅ Horizontal (batch jobs) |
| **voice-app-api** | FastAPI | Transcription/translation (existing service) | ✅ (already exists) |
| **nginx** | Nginx | Reverse proxy, load balancing, HTTPS termination | ✅ Horizontal |

### Communication Patterns

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SYNCHRONOUS (REST APIs)                          │
├─────────────────────────────────────────────────────────────────────┤
│ Web UI → KMS API                  (CRUD operations)                  │
│ Web UI → Search API               (Search queries)                   │
│ KMS API → Voice App API           (Trigger transcription)            │
│ Search API → PostgreSQL           (Metadata queries)                 │
│ Search API → Qdrant               (Vector similarity search)         │
│ Search API → Neo4j                (Relationship queries)             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                   ASYNCHRONOUS (Message Queue)                       │
├─────────────────────────────────────────────────────────────────────┤
│ KMS API → scan.queue              (Initiate file scan)               │
│ Scan Worker → embed.queue         (Files ready for embedding)        │
│ Embedding Worker → dedup.queue    (Embeddings ready for dedup)       │
│ KMS API → trans.queue             (Audio/video files for voice-app)  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Database Architecture

### Logical Separation Strategy

**Principle**: Use table prefixes to logically separate microservice boundaries within a single PostgreSQL database. This allows for future database split with minimal code changes.

#### Schema Organization

```sql
-- ============================================================
-- SHARED DOMAIN: Authentication & User Management
-- Prefix: auth_
-- Future: Can remain shared or move to dedicated auth service
-- ============================================================

CREATE TABLE auth_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),  -- NULL for OAuth-only users
    name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login_at TIMESTAMP,

    -- OAuth fields
    oauth_provider VARCHAR(50),  -- 'google', 'github', NULL
    oauth_id VARCHAR(255),

    -- Subscription (future)
    plan VARCHAR(50) DEFAULT 'free',  -- 'free', 'pro', 'enterprise'

    INDEX idx_auth_users_email (email),
    INDEX idx_auth_users_oauth (oauth_provider, oauth_id)
);

CREATE TABLE auth_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE,
    key_hash VARCHAR(256) UNIQUE NOT NULL,
    name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    scopes JSONB,  -- ['kms:read', 'kms:write', 'voice:read', ...]
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP,

    INDEX idx_auth_api_keys_hash (key_hash),
    INDEX idx_auth_api_keys_user (user_id)
);

CREATE TABLE auth_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    owner_id UUID REFERENCES auth_users(id),
    plan VARCHAR(50) DEFAULT 'free',
    created_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_auth_teams_owner (owner_id)
);

CREATE TABLE auth_team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES auth_teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,  -- 'owner', 'admin', 'member', 'viewer'
    permissions JSONB,  -- Override defaults
    joined_at TIMESTAMP DEFAULT NOW(),

    UNIQUE (team_id, user_id),
    INDEX idx_team_members_team (team_id),
    INDEX idx_team_members_user (user_id)
);

-- ============================================================
-- KMS DOMAIN: File Management, Scanning, Deduplication
-- Prefix: kms_
-- Future: Move to dedicated kms_db
-- ============================================================

CREATE TYPE kms_source_type AS ENUM ('google_drive', 'local_fs', 'external_drive', 'onedrive', 'dropbox');
CREATE TYPE kms_scan_status AS ENUM ('pending', 'scanning', 'processing', 'completed', 'failed', 'cancelled');
CREATE TYPE kms_file_type AS ENUM ('document', 'spreadsheet', 'presentation', 'pdf', 'image', 'audio', 'video', 'code', 'archive', 'other');

CREATE TABLE kms_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES auth_teams(id) ON DELETE SET NULL,

    source_type kms_source_type NOT NULL,
    source_name VARCHAR(255) NOT NULL,  -- "My Google Drive", "External SSD"

    -- Configuration (JSON)
    config JSONB NOT NULL,
    -- Example for google_drive: {"access_token_encrypted": "...", "refresh_token_encrypted": "...", "root_folder_id": "..."}
    -- Example for local_fs: {"root_path": "/Users/name/Documents", "watch_mode": false}

    is_active BOOLEAN DEFAULT TRUE,
    last_scan_at TIMESTAMP,
    next_scan_at TIMESTAMP,
    scan_frequency_hours INTEGER DEFAULT 24,  -- Daily

    created_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_kms_sources_user (user_id),
    INDEX idx_kms_sources_team (team_id)
);

CREATE TABLE kms_scan_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES kms_sources(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE,

    status kms_scan_status DEFAULT 'pending',
    scan_type VARCHAR(50) NOT NULL,  -- 'full', 'incremental', 'manual'

    -- Progress tracking
    progress INTEGER DEFAULT 0,  -- 0-100
    files_discovered INTEGER DEFAULT 0,
    files_processed INTEGER DEFAULT 0,
    files_failed INTEGER DEFAULT 0,

    -- Timestamps
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),

    -- Error tracking
    error_message TEXT,

    -- Metadata
    metadata JSONB,  -- Store scan-specific info

    INDEX idx_kms_scan_jobs_source (source_id),
    INDEX idx_kms_scan_jobs_user (user_id),
    INDEX idx_kms_scan_jobs_status (status)
);

CREATE TABLE kms_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES kms_sources(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES auth_teams(id) ON DELETE SET NULL,

    -- File identification
    source_file_id VARCHAR(500),  -- ID in source system (Google Drive file ID, local path hash)
    file_path TEXT NOT NULL,  -- Full path or URI
    file_name VARCHAR(500) NOT NULL,
    file_extension VARCHAR(50),
    file_type kms_file_type NOT NULL,

    -- File metadata
    file_size BIGINT,  -- bytes
    file_hash VARCHAR(64),  -- SHA256 of content
    mime_type VARCHAR(255),

    -- Timestamps from source
    source_created_at TIMESTAMP,
    source_modified_at TIMESTAMP,

    -- Our timestamps
    indexed_at TIMESTAMP DEFAULT NOW(),
    last_scanned_at TIMESTAMP,

    -- Content
    extracted_text TEXT,  -- Extracted text content
    content_preview TEXT,  -- First 500 chars

    -- Storage
    is_stored BOOLEAN DEFAULT FALSE,  -- If we store the file
    storage_path TEXT,  -- Path in MinIO/S3 if stored

    -- Tags and categorization
    tags JSONB,  -- ['important', 'work', 'project-alpha']
    categories JSONB,  -- Auto-detected categories

    -- Parent/child relationships
    parent_folder_id UUID REFERENCES kms_files(id) ON DELETE CASCADE,  -- If file is in a folder
    is_folder BOOLEAN DEFAULT FALSE,

    -- Junk detection
    is_junk BOOLEAN DEFAULT FALSE,
    junk_confidence FLOAT,  -- 0.0 - 1.0
    junk_reasons JSONB,  -- ['temporary_file', 'empty', 'duplicate']

    -- Metadata from source
    source_metadata JSONB,  -- EXIF, video metadata, etc.

    INDEX idx_kms_files_source (source_id),
    INDEX idx_kms_files_user (user_id),
    INDEX idx_kms_files_hash (file_hash),
    INDEX idx_kms_files_type (file_type),
    INDEX idx_kms_files_junk (is_junk),
    INDEX idx_kms_files_parent (parent_folder_id),

    -- Full-text search index
    INDEX idx_kms_files_text_search USING GIN(to_tsvector('english', file_name || ' ' || COALESCE(extracted_text, '')))
);

CREATE TABLE kms_duplicates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Duplicate group
    group_id UUID NOT NULL,  -- All duplicates share same group_id

    file_id UUID REFERENCES kms_files(id) ON DELETE CASCADE,

    -- Deduplication method
    detection_method VARCHAR(50) NOT NULL,  -- 'hash', 'semantic', 'near_duplicate', 'version'
    similarity_score FLOAT,  -- 0.0 - 1.0 for semantic/near duplicates

    -- User decision
    is_primary BOOLEAN DEFAULT FALSE,  -- User marked as primary/original
    should_delete BOOLEAN DEFAULT FALSE,  -- User marked for deletion

    -- Auto-detected info
    auto_suggested_primary UUID,  -- System suggestion for primary file

    detected_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_kms_duplicates_group (group_id),
    INDEX idx_kms_duplicates_file (file_id),
    INDEX idx_kms_duplicates_primary (is_primary)
);

CREATE TABLE kms_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES kms_files(id) ON DELETE CASCADE,

    chunk_index INTEGER DEFAULT 0,  -- For large files split into chunks
    chunk_text TEXT,  -- The text that was embedded

    -- Embedding metadata
    embedding_provider VARCHAR(50) NOT NULL,  -- 'sentence-transformers', 'openai', 'cohere'
    embedding_model VARCHAR(100) NOT NULL,  -- 'all-MiniLM-L6-v2', 'text-embedding-ada-002'

    -- Vector stored in Qdrant, this is just the reference
    vector_id VARCHAR(100),  -- ID in Qdrant

    created_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_kms_embeddings_file (file_id),
    UNIQUE (file_id, chunk_index)
);

CREATE TABLE kms_code_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID REFERENCES kms_files(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE,

    project_name VARCHAR(255),
    project_type VARCHAR(100),  -- 'nodejs', 'python', 'java', 'mixed'

    -- Detected metadata
    languages JSONB,  -- ['JavaScript', 'TypeScript']
    dependencies JSONB,  -- From package.json, requirements.txt, etc.

    -- File counts
    total_files INTEGER,
    code_files INTEGER,

    -- Git metadata (if .git exists)
    git_remote_url TEXT,
    git_branch VARCHAR(255),
    git_last_commit_at TIMESTAMP,
    git_commit_count INTEGER,
    git_authors JSONB,

    -- README content
    readme_content TEXT,

    detected_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_kms_code_projects_folder (folder_id),
    INDEX idx_kms_code_projects_user (user_id)
);

-- ============================================================
-- VOICE APP DOMAIN: Transcription & Translation
-- Prefix: voice_ (existing tables, no changes)
-- Future: Already in separate logical domain
-- ============================================================

-- Tables: jobs, transcriptions, translations, api_keys (existing)
-- No cross-references to kms_ tables
-- Integration via API calls only

-- ============================================================
-- INTEGRATION TABLE: Link KMS files to Voice App jobs
-- ============================================================

CREATE TABLE kms_transcription_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES kms_files(id) ON DELETE CASCADE,
    voice_job_id UUID,  -- References jobs.id but no FK constraint (loose coupling)

    status VARCHAR(50),  -- 'pending', 'processing', 'completed', 'failed'

    -- Transcription result (duplicated for fast access)
    transcription_text TEXT,
    transcription_language VARCHAR(10),

    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,

    INDEX idx_kms_trans_links_file (file_id),
    INDEX idx_kms_trans_links_job (voice_job_id)
);
```

### Database Isolation Rules

**✅ ALLOWED:**
- Join tables within the same prefix (e.g., `kms_files` JOIN `kms_duplicates`)
- Reference `auth_` tables from any domain (shared authentication)

**❌ NOT ALLOWED:**
- Join `kms_` tables with `voice_` tables directly
- Cross-domain foreign keys (except to `auth_` tables)

**INTEGRATION:**
- Use integration tables (`kms_transcription_links`) with IDs but no FK constraints
- Use API calls for cross-service communication
- Use message queues for async operations

---

## Technology Stack

### Service Implementation Matrix

| Service | Primary Language | Framework | Key Libraries |
|---------|-----------------|-----------|---------------|
| **kms-api** | TypeScript | NestJS | TypeORM, class-validator, @nestjs/bull |
| **search-api** | TypeScript | NestJS | @qdrant/js-client-rest, TypeORM, ioredis |
| **scan-worker** | Python | - | google-api-python-client, watchdog, aiofiles |
| **embedding-worker** | Python | - | sentence-transformers, pypdf2, python-docx, qdrant-client |
| **dedup-worker** | Python | - | scikit-learn, qdrant-client, neo4j |
| **junk-detector** | Python | - | scikit-learn, xgboost (future ML) |
| **voice-app-api** | Python | FastAPI | (existing) |
| **web-ui** | TypeScript | Next.js 14 | App Router, TailwindCSS, shadcn/ui |

### Data Storage

| Storage | Technology | Purpose | Hosting |
|---------|-----------|---------|---------|
| **Relational DB** | PostgreSQL 15+ | Metadata, users, scan jobs | Docker / Managed (RDS) |
| **Vector DB** | Qdrant (open source) | Embeddings, semantic search | Docker / Qdrant Cloud |
| **Graph DB** | Neo4j Community | Relationships, hierarchy | Docker / Aura (future) |
| **Object Storage** | MinIO (S3-compatible) | File storage (selective) | Docker / S3 (future) |
| **Message Queue** | RabbitMQ | Async job processing | Docker (existing) |

### Embedding Models

| Provider | Model | Use Case | Dimensions |
|----------|-------|----------|------------|
| **Default (Open Source)** | sentence-transformers/all-MiniLM-L6-v2 | General text, privacy-first | 384 |
| **Optional (Cloud)** | OpenAI text-embedding-3-small | User-selected files, higher accuracy | 1536 |
| **Optional (Cloud)** | Cohere embed-english-v3.0 | Alternative cloud option | 1024 |

### Deployment

```yaml
# docker-compose.kms.yml structure
services:
  # Data Layer
  postgres:       # Shared
  rabbitmq:       # Shared
  qdrant:         # New
  neo4j:          # New
  minio:          # New

  # API Layer
  nginx:          # Reverse proxy
  kms-api:        # NestJS
  search-api:     # NestJS
  voice-app:      # FastAPI (existing)

  # Worker Layer
  scan-worker:    # Python (scalable replicas)
  embedding-worker: # Python (scalable replicas)
  dedup-worker:   # Python (scalable replicas)

  # Frontend
  web-ui:         # Next.js

  # Observability Layer
  otel-collector:  # OpenTelemetry Collector (4317, 4318)
  jaeger:          # Distributed Tracing (16686)
  prometheus:      # Metrics (9090)
  grafana:         # Dashboards (3001)
```

---

## Integration Points

### KMS ↔ Voice App Integration

**Scenario: Audio/Video File Found During Scan**

```
1. Scan Worker discovers audio/video file
   ↓
2. Scan Worker publishes to kms_files table
   ↓
3. KMS API (via cron/trigger) detects new audio/video
   ↓
4. KMS API calls Voice App API: POST /api/v1/upload
   - Uploads file OR provides file path (if accessible)
   - Configures transcription settings
   ↓
5. Voice App creates job, publishes to transcription queue
   ↓
6. Voice App Worker processes transcription
   ↓
7. Voice App sends webhook to KMS API: POST /webhooks/transcription-complete
   ↓
8. KMS API updates kms_transcription_links table
   ↓
9. Embedding Worker picks up transcription text, generates embedding
   ↓
10. Transcription now searchable in KMS
```

**Configuration: Auto-Transcribe vs Manual**

```typescript
// kms_sources.config JSONB field
{
  "google_drive": {
    "access_token_encrypted": "...",
    "auto_transcribe": {
      "enabled": true,
      "file_types": ["audio", "video"],
      "provider": "whisper",  // groq, deepgram
      "model": "base",
      "language": "en"
    }
  }
}
```

### Google Drive Integration

**OAuth Flow**

```
1. User clicks "Connect Google Drive" in Web UI
   ↓
2. Web UI redirects to Google OAuth consent screen
   ↓
3. User grants permissions (read files, access metadata)
   ↓
4. Google redirects back with authorization code
   ↓
5. KMS API exchanges code for access_token + refresh_token
   ↓
6. KMS API encrypts tokens, stores in kms_sources.config
   ↓
7. KMS API triggers initial scan job
```

**Scan Process**

```python
# Pseudo-code: scan-worker/google_drive_scanner.py

async def scan_google_drive(source_id):
    source = await get_source(source_id)
    config = decrypt_config(source.config)

    # Initialize Google Drive API client
    credentials = Credentials(
        token=config['access_token'],
        refresh_token=config['refresh_token']
    )
    drive = build('drive', 'v3', credentials=credentials)

    # List all files (paginated)
    page_token = None
    while True:
        results = drive.files().list(
            pageSize=100,
            fields="nextPageToken, files(id, name, mimeType, size, modifiedTime, md5Checksum, parents)",
            pageToken=page_token,
            supportsAllDrives=True,  # Include shared drives
            includeItemsFromAllDrives=True
        ).execute()

        files = results.get('files', [])

        for file in files:
            await process_file(file, source_id)

        page_token = results.get('nextPageToken')
        if not page_token:
            break
```

**Permission Handling**

```python
def handle_permission_change(file_id):
    """
    Called when Google Drive webhook notifies of permission change
    """
    # Re-fetch file permissions
    permissions = drive.permissions().list(fileId=file_id).execute()

    # Check if user still has access
    user_email = get_current_user_email()
    has_access = any(p['emailAddress'] == user_email for p in permissions)

    if not has_access:
        # Mark file as inaccessible, don't delete (might regain access)
        update_file(file_id, is_accessible=False, last_checked=now())
```

---

## Data Flow

### File Scanning Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER INITIATES SCAN                                          │
│    - Manual: User clicks "Scan Google Drive" button             │
│    - Auto: Cron job triggers scheduled scan                     │
└─────────────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. KMS API CREATES SCAN JOB                                     │
│    - Insert into kms_scan_jobs (status: pending)                │
│    - Publish message to scan.queue                              │
└─────────────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. SCAN WORKER PROCESSES JOB                                    │
│    - Update status: scanning                                    │
│    - Iterate through source files                               │
│    - For each file:                                             │
│      • Check if already indexed (by source_file_id)             │
│      • If new or modified:                                      │
│        - Insert/update kms_files                                │
│        - Publish to embed.queue                                 │
│    - Update progress (files_discovered, files_processed)        │
│    - On completion: status → completed                          │
└─────────────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. EMBEDDING WORKER PROCESSES FILE                              │
│    - Extract content based on file type:                        │
│      • PDF: PyPDF2 → text                                       │
│      • DOCX: python-docx → text                                 │
│      • Image: EXIF metadata (OCR future)                        │
│      • Audio/Video: Metadata + trigger transcription            │
│    - Chunk large text (semantic chunking)                       │
│    - Generate embeddings (sentence-transformers)                │
│    - Store in Qdrant vector DB                                  │
│    - Insert kms_embeddings records                              │
│    - Publish to dedup.queue                                     │
└─────────────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. DEDUPLICATION WORKER                                         │
│    - Hash-based deduplication:                                  │
│      • Group files by file_hash                                 │
│      • Create kms_duplicates entries                            │
│    - Semantic deduplication:                                    │
│      • Query Qdrant for similar embeddings (>95% similarity)    │
│      • Create kms_duplicates with similarity_score              │
│    - Update Neo4j graph:                                        │
│      • Create DUPLICATE_OF relationships                        │
└─────────────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. GRAPH RELATIONSHIPS UPDATED (Neo4j)                          │
│    - File nodes: (File {id, name, type})                        │
│    - Folder nodes: (Folder {id, name})                          │
│    - Relationships:                                             │
│      • (File)-[:IN_FOLDER]->(Folder)                            │
│      • (Folder)-[:CHILD_OF]->(Folder)                           │
│      • (File)-[:DUPLICATE_OF]->(File)                           │
│      • (User)-[:OWNS]->(File)                                   │
│      • (CodeProject)-[:CONTAINS]->(File)                        │
└─────────────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. FILE READY FOR SEARCH                                        │
│    - Metadata indexed in PostgreSQL                             │
│    - Embeddings in Qdrant                                       │
│    - Relationships in Neo4j                                     │
│    - Full-text search via PostgreSQL GIN index                  │
└─────────────────────────────────────────────────────────────────┘
```

### Search Query Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER SUBMITS SEARCH QUERY                                    │
│    Input: "find all documents about machine learning"           │
│    Filters: {file_type: 'pdf', date_range: '2024-01-01..now'}   │
└─────────────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. SEARCH API DETERMINES QUERY TYPE                             │
│    - Keyword search: "exact phrase" or simple terms             │
│    - Semantic search: Natural language query                    │
│    - Hybrid: Both (default for best results)                    │
└─────────────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. PARALLEL SEARCH EXECUTION                                    │
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────┐            │
│  │  KEYWORD SEARCH      │  │  SEMANTIC SEARCH     │            │
│  │  (PostgreSQL)        │  │  (Qdrant)            │            │
│  │                      │  │                      │            │
│  │  - Full-text search  │  │  - Generate query    │            │
│  │    on file_name +    │  │    embedding         │            │
│  │    extracted_text    │  │  - Vector similarity │            │
│  │  - Apply filters     │  │    search            │            │
│  │  - Rank by relevance │  │  - Return top 100    │            │
│  └──────────────────────┘  └──────────────────────┘            │
│           │                          │                          │
│           └──────────┬───────────────┘                          │
│                      ▼                                          │
│           ┌──────────────────────┐                              │
│           │  MERGE RESULTS       │                              │
│           │  - Combine scores    │                              │
│           │  - Re-rank           │                              │
│           └──────────────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. ENRICH RESULTS WITH METADATA                                 │
│    - Fetch full file details from PostgreSQL                    │
│    - Query Neo4j for relationships (folder path, duplicates)    │
│    - Add context snippets (highlighted matching text)           │
└─────────────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. RETURN RESULTS TO USER                                       │
│    {                                                            │
│      "results": [                                               │
│        {                                                        │
│          "file_id": "...",                                      │
│          "file_name": "ML_Research_2024.pdf",                   │
│          "file_path": "/Google Drive/Research/...",             │
│          "relevance_score": 0.92,                               │
│          "snippet": "...machine learning algorithms...",        │
│          "duplicates": 2,                                       │
│          "tags": ["research", "ml", "2024"]                     │
│        }                                                        │
│      ],                                                         │
│      "total": 45,                                               │
│      "facets": {                                                │
│        "file_type": {"pdf": 30, "docx": 15},                    │
│        "year": {"2024": 40, "2023": 5}                          │
│      }                                                          │
│    }                                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Scalability & Performance

### Horizontal Scaling Strategy

| Component | Scaling Method | Target Capacity |
|-----------|---------------|-----------------|
| **KMS API** | Load balancer + multiple instances | 100 req/s per instance |
| **Search API** | Load balancer + multiple instances | 500 searches/s total |
| **Scan Workers** | Worker pool (3-10 workers) | 1000 files/min per worker |
| **Embedding Workers** | Worker pool (2-5 workers) | 100 files/min per worker (CPU-bound) |
| **PostgreSQL** | Read replicas + connection pooling | 10,000 connections |
| **Qdrant** | Cluster mode (3+ nodes) | 100M+ vectors |
| **Neo4j** | Causal cluster (3+ nodes) | 10M+ nodes, 100M+ relationships |

### Performance Optimizations

**1. Scan Performance**

```python
# Batch insert for discovered files
async def batch_insert_files(files: List[FileMetadata]):
    """Insert 1000 files in single transaction"""
    async with db.transaction():
        await db.execute(
            """
            INSERT INTO kms_files (source_id, file_name, file_path, ...)
            VALUES ...
            ON CONFLICT (source_id, source_file_id) DO UPDATE ...
            """,
            files
        )
```

**2. Embedding Generation**

```python
# Batch embedding generation (GPU-optimized)
embeddings = model.encode(
    texts,
    batch_size=32,      # Process 32 texts at once
    show_progress_bar=True,
    device='cuda'       # Use GPU if available
)

# Batch insert to Qdrant
qdrant_client.upsert(
    collection_name="kms_files",
    points=[
        PointStruct(id=file_id, vector=embedding, payload=metadata)
        for file_id, embedding, metadata in zip(file_ids, embeddings, metadatas)
    ]
)
```

**3. Search Caching**

```go
// Redis cache for popular queries
func Search(query string, filters Filters) ([]Result, error) {
    cacheKey := fmt.Sprintf("search:%s:%v", hash(query), filters)

    // Check cache (TTL: 5 minutes)
    if cached, err := redis.Get(cacheKey); err == nil {
        return unmarshal(cached), nil
    }

    // Execute search
    results := executeSearch(query, filters)

    // Cache results
    redis.Set(cacheKey, marshal(results), 5*time.Minute)

    return results, nil
}
```

**4. Database Indexing**

```sql
-- Composite indexes for common query patterns
CREATE INDEX idx_kms_files_user_type_date
ON kms_files(user_id, file_type, indexed_at DESC);

CREATE INDEX idx_kms_files_source_hash
ON kms_files(source_id, file_hash);

-- Partial indexes for specific filters
CREATE INDEX idx_kms_files_junk
ON kms_files(user_id, junk_confidence DESC)
WHERE is_junk = TRUE;
```

---

## Observability & Monitoring

### Overview

The KMS implements comprehensive observability using the OpenTelemetry standard, enabling distributed tracing, metrics collection, and centralized monitoring across all services.

### Telemetry Stack

| Component | Version | Purpose | Port |
|-----------|---------|---------|------|
| **OpenTelemetry Collector** | 0.96+ | Central telemetry hub | 4317 (gRPC), 4318 (HTTP) |
| **Jaeger** | 1.54+ | Distributed tracing | 16686 (UI), 14250 (gRPC) |
| **Prometheus** | 2.50+ | Metrics collection | 9090 |
| **Grafana** | 10.3+ | Dashboards & alerting | 3001 |

### Telemetry Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SERVICE INSTRUMENTATION                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ kms-api  │ │search-api│ │scan-worker│ │embed-wkr │ │dedup-wkr │  │
│  │  (OTel)  │ │  (OTel)  │ │  (OTel)  │ │  (OTel)  │ │  (OTel)  │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
│       │            │            │            │            │         │
│       └────────────┴────────────┴────────────┴────────────┘         │
│                                 │                                    │
│                                 ▼ OTLP Protocol                      │
│                   ┌──────────────────────────────┐                   │
│                   │   OpenTelemetry Collector    │                   │
│                   │     (Receives, Processes,    │                   │
│                   │      Batches, Exports)       │                   │
│                   └──────────────┬───────────────┘                   │
│                                  │                                   │
│                    ┌─────────────┴─────────────┐                     │
│                    │                           │                     │
│                    ▼                           ▼                     │
│             ┌───────────┐               ┌────────────┐               │
│             │  Jaeger   │               │ Prometheus │               │
│             │ (Traces)  │               │ (Metrics)  │               │
│             └─────┬─────┘               └──────┬─────┘               │
│                   │                            │                     │
│                   └────────────┬───────────────┘                     │
│                                ▼                                     │
│                         ┌───────────┐                                │
│                         │  Grafana  │                                │
│                         └───────────┘                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Service Instrumentation

| Service | Language | OTel SDK | Traces | Metrics | Auto-Instrumentation |
|---------|----------|----------|--------|---------|---------------------|
| kms-api | TypeScript | @opentelemetry/sdk-node | ✅ | ✅ | HTTP, TypeORM, Bull |
| search-api | TypeScript | @opentelemetry/sdk-node | ✅ | ✅ | HTTP, TypeORM, Redis |
| scan-worker | Python | opentelemetry-sdk | ✅ | ✅ | asyncpg, aio-pika |
| embedding-worker | Python | opentelemetry-sdk | ✅ | ✅ | asyncpg, aio-pika |
| dedup-worker | Python | opentelemetry-sdk | ✅ | ✅ | asyncpg, aio-pika |
| web-ui | TypeScript | @opentelemetry/sdk-trace-web | ✅ | ❌ | Fetch, Navigation |

### Key Metrics

**API Services:**
- `http_requests_total` - Total HTTP requests by method, path, status
- `http_request_duration_seconds` - Request latency histogram
- `db_query_duration_seconds` - Database query latency
- `active_connections` - Current active connections

**Workers:**
- `files_processed_total` - Files processed by type and status
- `processing_duration_seconds` - Processing time per file type
- `queue_depth` - Current queue depth
- `queue_consumer_lag` - Consumer lag time

**Search:**
- `search_requests_total` - Search requests by type (keyword/semantic/hybrid)
- `search_latency_seconds` - End-to-end search latency
- `cache_hit_ratio` - Redis cache effectiveness
- `qdrant_query_latency` - Vector search latency

### Grafana Dashboards

| Dashboard | Purpose |
|-----------|---------|
| **KMS Overview** | System health, request rates, error rates, latency P50/P95/P99 |
| **API Performance** | Per-endpoint metrics, slow queries, error breakdown |
| **Worker Metrics** | Queue depth, processing throughput, failure rates |
| **Search Analytics** | Search types, query latency, cache performance |
| **Infrastructure** | CPU, memory, disk, network for all services |

### Alerting Rules

| Alert | Condition | Severity |
|-------|-----------|----------|
| High Error Rate | Error rate > 5% for 5 minutes | Critical |
| High Latency | P95 latency > 2s for 5 minutes | Warning |
| Queue Backlog | Queue depth > 1000 for 10 minutes | Warning |
| Service Down | Health check failed for 2 minutes | Critical |
| Disk Space Low | Disk usage > 85% | Warning |

---

## Design Trade-offs

### Decision Log

| Decision | Alternatives Considered | Rationale |
|----------|------------------------|-----------|
| **Single PostgreSQL initially** | Separate DBs from day 1 | Simpler development, easier transactions. Logical separation allows future split. |
| **Qdrant over pgvector** | pgvector, Pinecone, Weaviate | Open source, excellent performance, easy Docker deployment, dedicated vector DB scales better. |
| **Neo4j Community over alternatives** | PostgreSQL recursive CTEs, AWS Neptune | Industry standard for graphs, Cypher query language is expressive, Community Edition is free. |
| **NestJS for KMS API** | FastAPI (like voice-app) | TypeScript type safety, enterprise patterns, scalability, large ecosystem. Familiarity with Next.js frontend. |
| **NestJS for Search API** | Go, Rust, Python | Consistent stack with kms-api, type safety, shared code patterns. Promise.all() for concurrent searches. |
| **Hybrid search (keyword + semantic)** | Semantic-only | Best accuracy. Keyword catches exact matches, semantic handles natural language. |
| **Nginx over API Gateway** | Kong, Traefik, AWS API Gateway | Simpler for MVP. Can migrate to Kong later when needed (rate limiting, plugins). |
| **MinIO over S3 directly** | Direct S3, Local filesystem | S3-compatible, can run locally, easy migration to cloud S3 later. Cost-effective for self-hosted. |
| **No file storage by default** | Store all files | Cost optimization. Most files stay in original source. Store only when needed (small files, deleted from source). |
| **Semantic chunking over fixed size** | Fixed 512-token chunks | Better context preservation. Paragraph/section boundaries maintain meaning. |
| **Daily scheduled scans** | Real-time file watching | Simpler, less resource-intensive. Real-time adds complexity (webhook management, connection stability). |

### Known Limitations (MVP)

1. **No real-time sync**: Google Drive changes require manual re-scan (future: webhooks)
2. **No OCR**: Scanned PDFs and images won't have searchable text (future: Tesseract/Textract)
3. **Limited file preview**: Only text content preview, no in-app document viewer (future: embed viewers)
4. **Single-user focus**: Team features are schema-ready but not implemented (future: team collaboration)
5. **No encryption**: Data stored unencrypted (future: encryption at rest, HashiCorp Vault)
6. **No mobile app**: Web UI only (future: React Native)
7. **Manual junk cleanup**: No automated deletion (future: ML-based recommendations with auto-cleanup option)

---

## Future Roadmap

### Phase 1: MVP (Months 1-3)

- ✅ Google Drive integration with OAuth
- ✅ Basic file scanning and indexing
- ✅ PDF text extraction
- ✅ Keyword + semantic search
- ✅ Exact duplicate detection (hash-based)
- ✅ Manual junk cleanup with bulk approve/delete
- ✅ Audio/video transcription integration (voice-app)
- ✅ Web UI (Next.js) with responsive design

### Phase 2: Enhanced Search & Discovery (Months 4-6)

- Local file system scanning
- External drive scanning (script)
- Code project recognition
- Semantic duplicate detection
- Advanced filters and facets
- Search result ranking improvements
- File preview in UI

### Phase 3: Intelligence & Automation (Months 7-9)

- ML-based junk detection
- OCR for scanned PDFs and images
- Vision models for image content description
- Automated duplicate clustering
- Smart folder organization suggestions
- Related files discovery

### Phase 4: Collaboration & Scale (Months 10-12)

- Team workspace features
- Role-based access control
- Real-time sync (Google Drive webhooks)
- OneDrive and Dropbox integration
- File-level permissions
- Activity feed and notifications
- Mobile app (React Native)

### Phase 5: Enterprise & Security (Months 13+)

- Encryption at rest and in transit
- HashiCorp Vault integration
- Compliance (GDPR, SOC 2)
- SSO (SAML, OIDC)
- Advanced analytics and insights
- API rate limiting and quotas
- Multi-region deployment
- Data retention policies

---

## Appendix

### Technology Decisions Reference

**Why Qdrant over Pinecone?**
- Open source (no vendor lock-in, no usage fees)
- Can run locally in Docker (development & testing)
- Performance comparable to Pinecone
- Supports hybrid search out of the box
- Easy migration to Qdrant Cloud if needed

**Why Neo4j over PostgreSQL recursive queries?**
- Graph queries are more intuitive with Cypher
- Better performance for deep relationship traversal
- Visual graph exploration tools (Neo4j Browser)
- Industry standard for knowledge graphs

**Why NestJS over FastAPI for KMS API?**
- Type safety with TypeScript
- Dependency injection (similar to FastAPI but more mature)
- Microservice-ready architecture
- Better alignment with Next.js frontend (both TypeScript)
- Enterprise patterns (guards, interceptors, pipes)

**Why NestJS for Search API?**
- Consistent stack with kms-api (shared knowledge, patterns, libraries)
- TypeScript type safety throughout
- Promise.all() for concurrent search execution
- Shared code and utilities between API services

### References

- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [Neo4j Cypher Manual](https://neo4j.com/docs/cypher-manual/current/)
- [NestJS Documentation](https://docs.nestjs.com/)
- [Google Drive API Reference](https://developers.google.com/drive/api/reference/rest/v3)
- [Sentence Transformers](https://www.sbert.net/)
- [RabbitMQ Best Practices](https://www.rabbitmq.com/best-practices.html)

---

**Document Version**: 1.1
**Last Updated**: 2026-01-08
**Next Review**: After MVP Phase 1 completion
**Observability**: OpenTelemetry, Jaeger, Prometheus, Grafana
