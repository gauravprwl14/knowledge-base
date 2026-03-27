# KMS Domain Schema

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The KMS domain manages file indexing, sources, embeddings, duplicates, and scan jobs. These tables form the core of the Knowledge Management System.

---

## Domain Boundaries

| Aspect | Value |
|--------|-------|
| **Prefix** | `kms_` |
| **Owner Service** | kms-api |
| **Write Access** | kms-api, scan-worker, embedding-worker, dedup-worker |
| **Read Access** | All KMS services |
| **Future Database** | kms-db |

---

## Tables

### kms_sources

Connected file sources (Google Drive, local filesystem, external drives).

```sql
CREATE TABLE kms_sources (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Ownership
    user_id UUID NOT NULL,  -- References auth_users

    -- Source type
    source_type VARCHAR(50) NOT NULL,

    -- Display info
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Configuration (encrypted for OAuth)
    config JSONB NOT NULL DEFAULT '{}',

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    error_message TEXT,

    -- Scanning info
    last_scan_at TIMESTAMP WITH TIME ZONE,
    next_scan_at TIMESTAMP WITH TIME ZONE,
    scan_frequency_hours INTEGER DEFAULT 24,

    -- Statistics
    total_files INTEGER NOT NULL DEFAULT 0,
    total_size_bytes BIGINT NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_source_type CHECK (source_type IN ('google_drive', 'local_fs', 'external_drive')),
    CONSTRAINT chk_status CHECK (status IN ('active', 'disconnected', 'error', 'scanning'))
);

-- Indexes
CREATE INDEX idx_kms_sources_user_id ON kms_sources(user_id);
CREATE INDEX idx_kms_sources_status ON kms_sources(status);
CREATE INDEX idx_kms_sources_next_scan ON kms_sources(next_scan_at) WHERE status = 'active';
```

#### Column Details

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | NO | Primary key |
| `user_id` | UUID | NO | Owner user |
| `source_type` | VARCHAR(50) | NO | Type of source |
| `name` | VARCHAR(255) | NO | Display name |
| `description` | TEXT | YES | Optional description |
| `config` | JSONB | NO | Source configuration |
| `status` | VARCHAR(50) | NO | Current status |
| `error_message` | TEXT | YES | Last error |
| `last_scan_at` | TIMESTAMP | YES | Last scan time |
| `next_scan_at` | TIMESTAMP | YES | Scheduled scan |
| `scan_frequency_hours` | INTEGER | YES | Scan interval |
| `total_files` | INTEGER | NO | File count |
| `total_size_bytes` | BIGINT | NO | Total size |
| `created_at` | TIMESTAMP | NO | Creation time |
| `updated_at` | TIMESTAMP | NO | Modification time |

#### Config JSON Schema (Google Drive)

```json
{
  "folder_id": "root",
  "include_shared": true,
  "encrypted_tokens": {
    "access_token": "encrypted...",
    "refresh_token": "encrypted...",
    "token_uri": "https://oauth2.googleapis.com/token",
    "expiry": "2026-01-08T10:00:00Z"
  }
}
```

#### Config JSON Schema (Local FS)

```json
{
  "root_path": "/Users/john/Documents",
  "include_hidden": false,
  "exclude_patterns": ["node_modules", ".git", "__pycache__"]
}
```

---

### kms_files

Core file metadata table with full-text search support.

```sql
CREATE TABLE kms_files (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relationships
    source_id UUID NOT NULL REFERENCES kms_sources(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,  -- References auth_users

    -- Source identification
    source_file_id VARCHAR(500) NOT NULL,  -- ID within source

    -- File metadata
    name VARCHAR(500) NOT NULL,
    path TEXT NOT NULL,
    mime_type VARCHAR(255) NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,

    -- Content hash
    hash_sha256 VARCHAR(64),

    -- Timestamps from source
    source_created_at TIMESTAMP WITH TIME ZONE,
    source_modified_at TIMESTAMP WITH TIME ZONE,

    -- Indexing status
    indexed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Embedding status
    embedding_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    embedding_error TEXT,
    chunk_count INTEGER,
    word_count INTEGER,

    -- Duplicate detection
    duplicate_group_id UUID,  -- References kms_duplicate_groups

    -- Junk detection
    is_junk BOOLEAN NOT NULL DEFAULT false,
    junk_confidence NUMERIC(3, 2),
    junk_category VARCHAR(50),
    junk_reasons JSONB,
    junk_checked_at TIMESTAMP WITH TIME ZONE,

    -- Soft delete
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMP WITH TIME ZONE,

    -- Extended metadata
    metadata JSONB DEFAULT '{}',

    -- Full-text search
    search_vector tsvector,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uq_source_file UNIQUE (source_id, source_file_id),
    CONSTRAINT chk_embedding_status CHECK (
        embedding_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')
    )
);

-- Primary indexes
CREATE INDEX idx_kms_files_user_id ON kms_files(user_id);
CREATE INDEX idx_kms_files_source_id ON kms_files(source_id);
CREATE INDEX idx_kms_files_hash ON kms_files(hash_sha256) WHERE hash_sha256 IS NOT NULL;

-- Status indexes
CREATE INDEX idx_kms_files_embedding_pending ON kms_files(source_id)
    WHERE embedding_status = 'pending' AND is_deleted = false;
CREATE INDEX idx_kms_files_junk ON kms_files(user_id)
    WHERE is_junk = true AND is_deleted = false;

-- Search indexes
CREATE INDEX idx_kms_files_search ON kms_files USING GIN(search_vector);
CREATE INDEX idx_kms_files_name_trgm ON kms_files USING GIN(name gin_trgm_ops);

-- Duplicate group index
CREATE INDEX idx_kms_files_dup_group ON kms_files(duplicate_group_id)
    WHERE duplicate_group_id IS NOT NULL;

-- Trigger to update search vector
CREATE OR REPLACE FUNCTION kms_files_search_trigger() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.path, '')), 'B');
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_kms_files_search
    BEFORE INSERT OR UPDATE OF name, path ON kms_files
    FOR EACH ROW
    EXECUTE FUNCTION kms_files_search_trigger();
```

#### Column Details

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | NO | Primary key |
| `source_id` | UUID | NO | Parent source |
| `user_id` | UUID | NO | Owner user |
| `source_file_id` | VARCHAR(500) | NO | ID in source system |
| `name` | VARCHAR(500) | NO | File name |
| `path` | TEXT | NO | Full path |
| `mime_type` | VARCHAR(255) | NO | MIME type |
| `size_bytes` | BIGINT | NO | File size |
| `hash_sha256` | VARCHAR(64) | YES | Content hash |
| `source_created_at` | TIMESTAMP | YES | Creation in source |
| `source_modified_at` | TIMESTAMP | YES | Modification in source |
| `indexed_at` | TIMESTAMP | NO | Indexing time |
| `embedding_status` | VARCHAR(50) | NO | Embedding state |
| `embedding_error` | TEXT | YES | Embedding error |
| `chunk_count` | INTEGER | YES | Number of chunks |
| `word_count` | INTEGER | YES | Word count |
| `duplicate_group_id` | UUID | YES | Duplicate group |
| `is_junk` | BOOLEAN | NO | Junk flag |
| `junk_confidence` | NUMERIC | YES | Junk score (0-1) |
| `junk_category` | VARCHAR(50) | YES | Junk type |
| `junk_reasons` | JSONB | YES | Junk reasons |
| `junk_checked_at` | TIMESTAMP | YES | Junk check time |
| `is_deleted` | BOOLEAN | NO | Soft delete flag |
| `deleted_at` | TIMESTAMP | YES | Deletion time |
| `metadata` | JSONB | YES | Extended metadata |
| `search_vector` | tsvector | YES | FTS vector |
| `created_at` | TIMESTAMP | NO | Creation time |
| `updated_at` | TIMESTAMP | NO | Modification time |

---

### kms_embeddings

References to vector embeddings stored in Qdrant.

```sql
CREATE TABLE kms_embeddings (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relationships
    file_id UUID NOT NULL REFERENCES kms_files(id) ON DELETE CASCADE,

    -- Chunk info
    chunk_index INTEGER NOT NULL,
    chunk_text_preview VARCHAR(500),  -- First 500 chars

    -- Qdrant reference
    qdrant_collection VARCHAR(100) NOT NULL DEFAULT 'kms_files_default',
    qdrant_point_id UUID NOT NULL,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uq_file_chunk UNIQUE (file_id, chunk_index)
);

-- Indexes
CREATE INDEX idx_kms_embeddings_file_id ON kms_embeddings(file_id);
CREATE INDEX idx_kms_embeddings_qdrant ON kms_embeddings(qdrant_collection, qdrant_point_id);
```

#### Column Details

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | NO | Primary key |
| `file_id` | UUID | NO | Parent file |
| `chunk_index` | INTEGER | NO | Chunk position |
| `chunk_text_preview` | VARCHAR(500) | YES | Text preview |
| `qdrant_collection` | VARCHAR(100) | NO | Qdrant collection |
| `qdrant_point_id` | UUID | NO | Qdrant point ID |
| `created_at` | TIMESTAMP | NO | Creation time |

---

### kms_scan_jobs

Scan job history and progress tracking.

```sql
CREATE TABLE kms_scan_jobs (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relationships
    source_id UUID NOT NULL REFERENCES kms_sources(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,  -- References auth_users

    -- Job type
    scan_type VARCHAR(50) NOT NULL DEFAULT 'full',

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    error_message TEXT,

    -- Progress
    progress NUMERIC(5, 2) NOT NULL DEFAULT 0,
    current_path TEXT,

    -- Statistics
    files_found INTEGER NOT NULL DEFAULT 0,
    files_processed INTEGER NOT NULL DEFAULT 0,
    files_new INTEGER NOT NULL DEFAULT 0,
    files_updated INTEGER NOT NULL DEFAULT 0,
    files_deleted INTEGER NOT NULL DEFAULT 0,
    bytes_scanned BIGINT NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT chk_scan_type CHECK (scan_type IN ('full', 'incremental', 'targeted')),
    CONSTRAINT chk_scan_status CHECK (
        status IN ('pending', 'queued', 'scanning', 'completed', 'failed', 'cancelled')
    )
);

-- Indexes
CREATE INDEX idx_kms_scan_jobs_source_id ON kms_scan_jobs(source_id);
CREATE INDEX idx_kms_scan_jobs_user_id ON kms_scan_jobs(user_id);
CREATE INDEX idx_kms_scan_jobs_status ON kms_scan_jobs(status)
    WHERE status IN ('pending', 'queued', 'scanning');
CREATE INDEX idx_kms_scan_jobs_created_at ON kms_scan_jobs(created_at DESC);
```

#### Column Details

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | NO | Primary key |
| `source_id` | UUID | NO | Parent source |
| `user_id` | UUID | NO | Owner user |
| `scan_type` | VARCHAR(50) | NO | Type of scan |
| `status` | VARCHAR(50) | NO | Current status |
| `error_message` | TEXT | YES | Error details |
| `progress` | NUMERIC(5,2) | NO | Progress (0-100) |
| `current_path` | TEXT | YES | Currently scanning |
| `files_found` | INTEGER | NO | Total found |
| `files_processed` | INTEGER | NO | Total processed |
| `files_new` | INTEGER | NO | New files |
| `files_updated` | INTEGER | NO | Updated files |
| `files_deleted` | INTEGER | NO | Deleted files |
| `bytes_scanned` | BIGINT | NO | Total bytes |
| `created_at` | TIMESTAMP | NO | Creation time |
| `started_at` | TIMESTAMP | YES | Start time |
| `completed_at` | TIMESTAMP | YES | Completion time |

---

### kms_duplicate_groups

Groups of duplicate files with primary selection.

```sql
CREATE TABLE kms_duplicate_groups (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Group type
    group_type VARCHAR(50) NOT NULL,

    -- Primary file
    primary_file_id UUID,  -- References kms_files

    -- Statistics
    file_count INTEGER NOT NULL DEFAULT 0,
    total_size_bytes BIGINT NOT NULL DEFAULT 0,
    savings_bytes BIGINT NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_group_type CHECK (group_type IN ('exact', 'semantic', 'version'))
);

-- Indexes
CREATE INDEX idx_kms_dup_groups_primary ON kms_duplicate_groups(primary_file_id);
CREATE INDEX idx_kms_dup_groups_type ON kms_duplicate_groups(group_type);
CREATE INDEX idx_kms_dup_groups_savings ON kms_duplicate_groups(savings_bytes DESC);

-- Add foreign key to kms_files
ALTER TABLE kms_files
ADD CONSTRAINT fk_files_dup_group
FOREIGN KEY (duplicate_group_id) REFERENCES kms_duplicate_groups(id)
ON DELETE SET NULL;
```

#### Column Details

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | NO | Primary key |
| `group_type` | VARCHAR(50) | NO | Duplicate type |
| `primary_file_id` | UUID | YES | Recommended keep |
| `file_count` | INTEGER | NO | Files in group |
| `total_size_bytes` | BIGINT | NO | Total size |
| `savings_bytes` | BIGINT | NO | Deletable bytes |
| `created_at` | TIMESTAMP | NO | Creation time |
| `updated_at` | TIMESTAMP | NO | Modification time |

---

### kms_transcription_links

Integration table linking KMS files to voice-app transcription jobs.

```sql
CREATE TABLE kms_transcription_links (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Soft references (no foreign keys for cross-domain)
    file_id UUID NOT NULL,           -- References kms_files
    voice_job_id VARCHAR(255),       -- References voice_jobs

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uq_file_transcription UNIQUE (file_id),
    CONSTRAINT chk_link_status CHECK (
        status IN ('pending', 'processing', 'completed', 'failed')
    )
);

-- Indexes
CREATE INDEX idx_kms_trans_links_file ON kms_transcription_links(file_id);
CREATE INDEX idx_kms_trans_links_job ON kms_transcription_links(voice_job_id)
    WHERE voice_job_id IS NOT NULL;
CREATE INDEX idx_kms_trans_links_status ON kms_transcription_links(status)
    WHERE status IN ('pending', 'processing');
```

#### Column Details

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | NO | Primary key |
| `file_id` | UUID | NO | KMS file reference |
| `voice_job_id` | VARCHAR(255) | YES | Voice-app job ID |
| `status` | VARCHAR(50) | NO | Link status |
| `error_message` | TEXT | YES | Error details |
| `created_at` | TIMESTAMP | NO | Creation time |
| `updated_at` | TIMESTAMP | NO | Modification time |

---

## Common Queries

### Get User's Files with Stats

```sql
SELECT
    f.id,
    f.name,
    f.path,
    f.mime_type,
    f.size_bytes,
    f.embedding_status,
    f.is_junk,
    s.name AS source_name,
    dg.id AS duplicate_group_id,
    dg.file_count AS duplicates_count
FROM kms_files f
JOIN kms_sources s ON f.source_id = s.id
LEFT JOIN kms_duplicate_groups dg ON f.duplicate_group_id = dg.id
WHERE f.user_id = $1
  AND f.is_deleted = false
ORDER BY f.source_modified_at DESC
LIMIT 50 OFFSET 0;
```

### Full-Text Search

```sql
SELECT
    f.id,
    f.name,
    f.path,
    ts_rank(f.search_vector, query) AS rank
FROM kms_files f,
     to_tsquery('english', $1) query
WHERE f.user_id = $2
  AND f.is_deleted = false
  AND f.search_vector @@ query
ORDER BY rank DESC
LIMIT 20;
```

### Get Duplicate Groups with Savings

```sql
SELECT
    dg.id,
    dg.group_type,
    dg.file_count,
    dg.savings_bytes,
    pf.name AS primary_file_name,
    array_agg(f.name) AS all_files
FROM kms_duplicate_groups dg
JOIN kms_files pf ON dg.primary_file_id = pf.id
JOIN kms_files f ON f.duplicate_group_id = dg.id
WHERE pf.user_id = $1
GROUP BY dg.id, pf.name
ORDER BY dg.savings_bytes DESC;
```

