# Complete Database Schema — Knowledge Base System

**Version**: 1.0
**Date**: 2026-03-17
**Coverage**: All services — kms-api, voice-app (prototype reuse), search-api

---

## Schema Domains

```
PostgreSQL database: kms
├── Schema: auth          → Users, API keys, sessions
├── Schema: kms           → Files, notes, sources, scan jobs, duplicates
├── Schema: voice         → Transcription jobs, results, translations (from prototype)
└── Schema: graph_cache   → Precomputed traversal cache (Redis-backed, PG fallback)
```

---

## Schema: `auth`

### `auth.users`
```sql
CREATE TABLE auth.users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    display_name    TEXT,
    avatar_url      TEXT,
    role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    email_verified  BOOLEAN NOT NULL DEFAULT false,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_email ON auth.users (email);
```

### `auth.api_keys`
```sql
CREATE TABLE auth.api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key_hash        TEXT NOT NULL UNIQUE,          -- SHA-256 of raw key, never store raw
    name            TEXT NOT NULL,                 -- "My Obsidian Plugin", "CLI Tool"
    is_active       BOOLEAN NOT NULL DEFAULT true,
    scopes          TEXT[] NOT NULL DEFAULT '{}',  -- ['read', 'write', 'admin']
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,                   -- NULL = no expiry
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_api_keys_hash ON auth.api_keys (key_hash);
CREATE INDEX idx_api_keys_user_id ON auth.api_keys (user_id);
```

### `auth.refresh_tokens`
```sql
CREATE TABLE auth.refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user ON auth.refresh_tokens (user_id);
```

---

## Schema: `kms`

### `kms.sources`
```sql
CREATE TABLE kms.sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN (
                        'google_drive', 'obsidian', 'local_fs',
                        'external_drive', 'notion', 'github'
                    )),
    display_name    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
                        'active', 'paused', 'error', 'disconnected', 'syncing'
                    )),
    -- Encrypted OAuth tokens / credentials (AES-256-GCM, base64)
    credentials     JSONB,
    -- Source-specific config (paths, scopes, sync_interval, etc.)
    config          JSONB NOT NULL DEFAULT '{}',
    -- Stats
    total_files     INTEGER NOT NULL DEFAULT 0,
    indexed_files   INTEGER NOT NULL DEFAULT 0,
    failed_files    INTEGER NOT NULL DEFAULT 0,
    storage_bytes   BIGINT NOT NULL DEFAULT 0,
    -- Sync tracking
    last_sync_at    TIMESTAMPTZ,
    last_error      TEXT,
    next_sync_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sources_user_id ON kms.sources (user_id);
CREATE INDEX idx_sources_type ON kms.sources (type);
CREATE INDEX idx_sources_status ON kms.sources (status);
```

### `kms.files`
```sql
CREATE TABLE kms.files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id       UUID NOT NULL REFERENCES kms.sources(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Source system identifiers
    source_file_id  TEXT NOT NULL,                 -- ID in source system (Drive ID, path hash, etc.)
    source_url      TEXT,                          -- URL to open in source (Drive URL, Obsidian URI)
    source_path     TEXT,                          -- Path in source (Drive folder path, vault path)
    parent_folder_id UUID REFERENCES kms.files(id), -- Parent folder (self-referential)
    is_folder       BOOLEAN NOT NULL DEFAULT false,

    -- File metadata
    name            TEXT NOT NULL,
    extension       TEXT,                          -- ".pdf", ".md", ".mp4"
    mime_type       TEXT,
    size_bytes      BIGINT,
    content_hash    TEXT,                          -- SHA-256 of content (for exact dedup)
    perceptual_hash TEXT,                          -- pHash (for image near-dedup)

    -- Processing status
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                        'pending',      -- Not yet processed
                        'scanning',     -- Being scanned
                        'extracting',   -- Content being extracted
                        'embedding',    -- Being embedded
                        'indexed',      -- Fully indexed, searchable
                        'failed',       -- Processing error
                        'excluded',     -- User excluded from index
                        'deleted'       -- Soft delete
                    )),
    status_message  TEXT,                          -- Human-readable status / error

    -- Content extraction
    content_extracted   BOOLEAN NOT NULL DEFAULT false,
    extracted_text  TEXT,                          -- Extracted plain text (stored for search)
    word_count      INTEGER,
    language        TEXT,                          -- Detected language code ("en", "fr")
    extracted_at    TIMESTAMPTZ,

    -- Embedding
    embedded        BOOLEAN NOT NULL DEFAULT false,
    chunk_count     INTEGER,                       -- Number of Qdrant vectors created
    embedding_model TEXT,                          -- Model used ("nomic-embed-text", etc.)
    embedded_at     TIMESTAMPTZ,

    -- Transcription (for audio/video files)
    has_transcript  BOOLEAN NOT NULL DEFAULT false,
    transcript_job_id UUID,                        -- Links to voice.jobs (soft FK — different domain)
    transcribed_at  TIMESTAMPTZ,

    -- Metadata from source
    author          TEXT,
    source_created_at   TIMESTAMPTZ,
    source_modified_at  TIMESTAMPTZ,
    extra_metadata  JSONB,                         -- Source-specific (Drive: shared_by, Notion: properties)

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_indexed_at TIMESTAMPTZ,

    UNIQUE (source_id, source_file_id)
);

CREATE INDEX idx_files_user_id ON kms.files (user_id);
CREATE INDEX idx_files_source_id ON kms.files (source_id);
CREATE INDEX idx_files_status ON kms.files (status);
CREATE INDEX idx_files_mime_type ON kms.files (mime_type);
CREATE INDEX idx_files_content_hash ON kms.files (content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX idx_files_parent ON kms.files (parent_folder_id) WHERE parent_folder_id IS NOT NULL;
CREATE INDEX idx_files_has_transcript ON kms.files (has_transcript) WHERE has_transcript = true;

-- Full-text search index
CREATE INDEX idx_files_fts ON kms.files
    USING GIN (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(extracted_text, '')));
```

### `kms.notes`
```sql
CREATE TABLE kms.notes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Content
    title           TEXT NOT NULL,
    content         TEXT NOT NULL DEFAULT '',      -- Markdown content
    content_html    TEXT,                          -- Rendered HTML (cache)
    summary         TEXT,                          -- AI-generated summary

    -- Obsidian integration
    vault_path      TEXT,                          -- "Notes/Machine Learning.md"
    vault_source_id UUID REFERENCES kms.sources(id), -- Which Obsidian vault
    frontmatter     JSONB,                         -- YAML frontmatter as JSON
    backlinks       TEXT[] NOT NULL DEFAULT '{}',  -- [[wikilinks]] extracted
    outlinks        TEXT[] NOT NULL DEFAULT '{}',  -- [[links to other notes]]
    aliases         TEXT[] NOT NULL DEFAULT '{}',  -- Note aliases from frontmatter
    obsidian_url    TEXT,                          -- obsidian://open?vault=...

    -- Tagging
    tags            TEXT[] NOT NULL DEFAULT '{}',  -- #tags extracted

    -- Pinning and favorites
    is_pinned       BOOLEAN NOT NULL DEFAULT false,
    is_archived     BOOLEAN NOT NULL DEFAULT false,

    -- Dedup
    content_hash    TEXT,                          -- SHA-256 of content
    embedded        BOOLEAN NOT NULL DEFAULT false,
    embedding_model TEXT,
    embedded_at     TIMESTAMPTZ,

    -- Tracking
    word_count      INTEGER,
    last_edited_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    vault_synced_at TIMESTAMPTZ                    -- When last synced from Obsidian
);

CREATE INDEX idx_notes_user_id ON kms.notes (user_id);
CREATE INDEX idx_notes_vault_path ON kms.notes (vault_path) WHERE vault_path IS NOT NULL;
CREATE INDEX idx_notes_tags ON kms.notes USING GIN (tags);
CREATE INDEX idx_notes_backlinks ON kms.notes USING GIN (backlinks);

-- Full-text search
CREATE INDEX idx_notes_fts ON kms.notes
    USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')));
```

### `kms.scan_jobs`
```sql
CREATE TABLE kms.scan_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_id       UUID NOT NULL REFERENCES kms.sources(id) ON DELETE CASCADE,

    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                        'pending', 'queued', 'processing', 'completed', 'failed', 'cancelled'
                    )),
    scan_type       TEXT NOT NULL DEFAULT 'incremental' CHECK (scan_type IN (
                        'full',         -- Scan everything
                        'incremental',  -- Only modified since last sync
                        'path'          -- Specific folder/path
                    )),
    target_path     TEXT,                          -- For path-specific scans

    -- Progress
    files_found     INTEGER NOT NULL DEFAULT 0,
    files_indexed   INTEGER NOT NULL DEFAULT 0,
    files_failed    INTEGER NOT NULL DEFAULT 0,
    files_skipped   INTEGER NOT NULL DEFAULT 0,

    -- Timing
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scan_jobs_source ON kms.scan_jobs (source_id);
CREATE INDEX idx_scan_jobs_status ON kms.scan_jobs (status);
CREATE INDEX idx_scan_jobs_user ON kms.scan_jobs (user_id);
```

### `kms.embed_jobs`
```sql
CREATE TABLE kms.embed_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id         UUID REFERENCES kms.files(id) ON DELETE CASCADE,
    note_id         UUID REFERENCES kms.notes(id) ON DELETE CASCADE,

    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                        'pending', 'queued', 'processing', 'completed', 'failed'
                    )),
    provider        TEXT,                          -- "ollama", "openai"
    model           TEXT,                          -- "nomic-embed-text"
    chunks_created  INTEGER,
    error_message   TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (
        (file_id IS NOT NULL AND note_id IS NULL) OR
        (file_id IS NULL AND note_id IS NOT NULL)
    )
);
```

### `kms.duplicates`
```sql
CREATE TABLE kms.duplicates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    type            TEXT NOT NULL CHECK (type IN (
                        'exact',        -- SHA-256 hash match (100%)
                        'semantic',     -- Embedding similarity >95%
                        'version',      -- Filename pattern (v1, v2, final, etc.)
                        'image_phash'   -- Perceptual hash match
                    )),
    similarity      FLOAT CHECK (similarity BETWEEN 0 AND 1),

    -- Can be file-to-file or note-to-file etc.
    file_id_a       UUID REFERENCES kms.files(id) ON DELETE CASCADE,
    file_id_b       UUID REFERENCES kms.files(id) ON DELETE CASCADE,
    note_id_a       UUID REFERENCES kms.notes(id) ON DELETE CASCADE,
    note_id_b       UUID REFERENCES kms.notes(id) ON DELETE CASCADE,

    -- Resolution
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                        'pending',      -- Not yet reviewed
                        'confirmed',    -- User confirmed as duplicate
                        'dismissed',    -- User dismissed (not a real duplicate)
                        'resolved'      -- Duplicate has been deleted/merged
                    )),
    canonical_file_id UUID REFERENCES kms.files(id),  -- Which one to keep
    resolved_at     TIMESTAMPTZ,
    resolved_by     UUID REFERENCES auth.users(id),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (file_id_a, file_id_b),

    CHECK (
        (file_id_a IS NOT NULL AND file_id_b IS NOT NULL) OR
        (note_id_a IS NOT NULL AND note_id_b IS NOT NULL) OR
        (file_id_a IS NOT NULL AND note_id_b IS NOT NULL)
    )
);

CREATE INDEX idx_duplicates_file_a ON kms.duplicates (file_id_a);
CREATE INDEX idx_duplicates_file_b ON kms.duplicates (file_id_b);
CREATE INDEX idx_duplicates_status ON kms.duplicates (status);
CREATE INDEX idx_duplicates_type ON kms.duplicates (type);
```

### `kms.tags`
```sql
CREATE TABLE kms.tags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    color           TEXT,                          -- Hex color for UI
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
);

CREATE TABLE kms.file_tags (
    file_id         UUID NOT NULL REFERENCES kms.files(id) ON DELETE CASCADE,
    tag_id          UUID NOT NULL REFERENCES kms.tags(id) ON DELETE CASCADE,
    PRIMARY KEY (file_id, tag_id)
);

CREATE TABLE kms.note_tags (
    note_id         UUID NOT NULL REFERENCES kms.notes(id) ON DELETE CASCADE,
    tag_id          UUID NOT NULL REFERENCES kms.tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);
```

### `kms.graph_clusters`
```sql
-- Leiden algorithm output — topic clusters detected across files/notes
CREATE TABLE kms.graph_clusters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    label           TEXT,                          -- LLM-generated cluster label
    description     TEXT,
    member_count    INTEGER NOT NULL DEFAULT 0,
    cohesion_score  FLOAT,                         -- How tightly connected
    color           TEXT,                          -- UI display color
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE kms.cluster_members (
    cluster_id      UUID NOT NULL REFERENCES kms.graph_clusters(id) ON DELETE CASCADE,
    file_id         UUID REFERENCES kms.files(id) ON DELETE CASCADE,
    note_id         UUID REFERENCES kms.notes(id) ON DELETE CASCADE,
    membership_score FLOAT,                        -- Strength of cluster membership
    PRIMARY KEY (cluster_id, COALESCE(file_id, note_id)),
    CHECK (
        (file_id IS NOT NULL AND note_id IS NULL) OR
        (file_id IS NULL AND note_id IS NOT NULL)
    )
);
```

---

## Schema: `voice`
*(Reused from existing prototype — adapted for KMS integration)*

### `voice.jobs`
```sql
CREATE TABLE voice.jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- KMS integration
    kms_file_id         UUID,                      -- Soft FK → kms.files(id)
    user_id             UUID REFERENCES auth.users(id),
    api_key_id          UUID REFERENCES auth.api_keys(id),

    status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                            'pending', 'queued', 'processing', 'completed', 'failed', 'cancelled'
                        )),
    job_type            TEXT NOT NULL DEFAULT 'transcription' CHECK (job_type IN (
                            'transcription', 'translation', 'batch'
                        )),

    -- Provider config
    provider            TEXT,                      -- "whisper", "groq", "deepgram"
    model_name          TEXT,
    language            TEXT,                      -- Source language (null = auto-detect)
    target_language     TEXT,                      -- For translation jobs

    -- File info
    file_path           TEXT NOT NULL,
    original_filename   TEXT,
    file_size_bytes     INTEGER,
    duration_seconds    FLOAT,

    -- Job settings
    priority            INTEGER NOT NULL DEFAULT 0,
    progress            INTEGER NOT NULL DEFAULT 0,
    error_message       TEXT,
    webhook_url         TEXT,
    job_metadata        JSONB,

    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ
);

CREATE INDEX idx_voice_jobs_status ON voice.jobs (status);
CREATE INDEX idx_voice_jobs_kms_file ON voice.jobs (kms_file_id) WHERE kms_file_id IS NOT NULL;
CREATE INDEX idx_voice_jobs_user ON voice.jobs (user_id);
CREATE INDEX idx_voice_jobs_created ON voice.jobs (created_at DESC);
```

### `voice.transcriptions`
```sql
CREATE TABLE voice.transcriptions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id              UUID NOT NULL REFERENCES voice.jobs(id) ON DELETE CASCADE,

    -- Core content
    text                TEXT NOT NULL,
    language            TEXT,
    confidence          FLOAT,
    word_count          INTEGER,
    processing_time_ms  INTEGER,

    -- Provider info
    provider            TEXT,
    model_name          TEXT,

    -- Segments (timing data for SRT generation)
    segments            JSONB,                     -- [{start, end, text, words:[{word, start, end}]}]

    -- KMS integration
    pushed_to_kms       BOOLEAN NOT NULL DEFAULT false,  -- Has this been synced to kms.files
    pushed_at           TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transcriptions_job ON voice.transcriptions (job_id);
CREATE INDEX idx_transcriptions_pushed ON voice.transcriptions (pushed_to_kms) WHERE pushed_to_kms = false;
```

### `voice.translations`
```sql
CREATE TABLE voice.translations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transcription_id    UUID NOT NULL REFERENCES voice.transcriptions(id) ON DELETE CASCADE,
    source_language     TEXT,
    target_language     TEXT NOT NULL,
    translated_text     TEXT NOT NULL,
    provider            TEXT,                      -- "openai", "gemini"
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (transcription_id, target_language)
);
```

### `voice.batch_jobs` + `voice.batch_job_items`
```sql
CREATE TABLE voice.batch_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES auth.users(id),
    api_key_id      UUID REFERENCES auth.api_keys(id),
    name            TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    total_files     INTEGER NOT NULL DEFAULT 0,
    completed_files INTEGER NOT NULL DEFAULT 0,
    failed_files    INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE TABLE voice.batch_job_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_job_id    UUID NOT NULL REFERENCES voice.batch_jobs(id) ON DELETE CASCADE,
    job_id          UUID NOT NULL REFERENCES voice.jobs(id) ON DELETE CASCADE
);
```

---

## Schema: `graph_cache`

### `graph_cache.entity_nodes`
```sql
-- Entities extracted from files/notes (for graph building)
CREATE TABLE graph_cache.entity_nodes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN (
                        'person', 'organization', 'location', 'concept',
                        'technology', 'event', 'product', 'topic'
                    )),
    normalized_name TEXT NOT NULL,                 -- Lowercase, deduplicated
    frequency       INTEGER NOT NULL DEFAULT 1,    -- How many files mention this
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, normalized_name, type)
);

CREATE INDEX idx_entities_user ON graph_cache.entity_nodes (user_id);
CREATE INDEX idx_entities_type ON graph_cache.entity_nodes (type);
```

### `graph_cache.entity_mentions`
```sql
CREATE TABLE graph_cache.entity_mentions (
    entity_id       UUID NOT NULL REFERENCES graph_cache.entity_nodes(id) ON DELETE CASCADE,
    file_id         UUID REFERENCES kms.files(id) ON DELETE CASCADE,
    note_id         UUID REFERENCES kms.notes(id) ON DELETE CASCADE,
    mention_count   INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (entity_id, COALESCE(file_id, note_id)),
    CHECK (
        (file_id IS NOT NULL AND note_id IS NULL) OR
        (file_id IS NULL AND note_id IS NOT NULL)
    )
);
```

### `graph_cache.traversal_cache`
```sql
-- Precomputed frequent traversal paths
CREATE TABLE graph_cache.traversal_cache (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    from_node_id    TEXT NOT NULL,                 -- Neo4j node ID
    to_node_id      TEXT NOT NULL,
    path_json       JSONB NOT NULL,                -- Precomputed path
    hop_count       INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
    UNIQUE (user_id, from_node_id, to_node_id)
);
```

---

## Qdrant Collections Schema

```python
# file_embeddings collection
{
    "collection_name": "file_embeddings",
    "vectors": {
        "size": 768,          # nomic-embed-text; 1536 for OpenAI
        "distance": "Cosine"
    },
    "payload_schema": {
        "file_id": "keyword",          # UUID of kms.files
        "user_id": "keyword",          # UUID for multi-tenant filtering
        "note_id": "keyword",          # UUID of kms.notes (if note chunk)
        "source_type": "keyword",      # "google_drive", "obsidian", "local_fs"
        "chunk_index": "integer",      # Position in document
        "chunk_text": "text",          # Actual chunk content
        "file_name": "text",
        "file_path": "text",
        "mime_type": "keyword",
        "language": "keyword",
        "has_transcript": "bool",
        "tags": "keyword[]",
        "embedded_at": "datetime"
    },
    "hnsw_config": {
        "m": 16,
        "ef_construct": 100
    },
    "optimizers_config": {
        "default_segment_number": 4
    }
}
```

---

## Neo4j Graph Schema

### Node Labels
```cypher
// File nodes — one per indexed file
(:File {
    id: String,            // UUID from kms.files
    name: String,
    path: String,
    mime_type: String,
    source_type: String,   // "google_drive", "obsidian"
    user_id: String,
    has_transcript: Boolean,
    word_count: Integer,
    language: String,
    tags: [String],
    cluster_id: String     // Leiden cluster membership
})

// Note nodes — Obsidian notes
(:Note {
    id: String,            // UUID from kms.notes
    title: String,
    vault_path: String,
    tags: [String],
    user_id: String,
    cluster_id: String
})

// Folder nodes — directory structure
(:Folder {
    id: String,
    name: String,
    path: String,
    source_type: String,
    user_id: String
})

// Entity nodes — extracted from content
(:Entity {
    id: String,
    name: String,
    type: String,          // "person", "organization", "concept", etc.
    frequency: Integer,
    user_id: String
})

// Concept nodes — AI-labeled clusters
(:Cluster {
    id: String,
    label: String,         // "Machine Learning Fundamentals"
    description: String,
    member_count: Integer,
    cohesion_score: Float,
    user_id: String
})
```

### Relationship Types
```cypher
// Structural
(File)-[:IN_FOLDER]->(Folder)
(Folder)-[:IN_FOLDER]->(Folder)

// Semantic similarity (built by graph-worker)
(File)-[:SIMILAR_TO {similarity: 0.92}]->(File)
(Note)-[:SIMILAR_TO {similarity: 0.87}]->(Note)
(File)-[:SIMILAR_TO {similarity: 0.89}]->(Note)

// Obsidian backlinks
(Note)-[:LINKS_TO]->(Note)   // [[wikilink]]
(Note)-[:LINKS_TO]->(File)   // [[attached file]]

// Deduplication
(File)-[:DUPLICATE_OF {type: "exact", similarity: 1.0}]->(File)

// Entity mentions
(File)-[:MENTIONS {count: 5}]->(Entity)
(Note)-[:MENTIONS {count: 3}]->(Entity)

// Entity relationships (co-occurrence)
(Entity)-[:CO_OCCURS_WITH {count: 12}]->(Entity)

// Cluster membership
(File)-[:MEMBER_OF {score: 0.85}]->(Cluster)
(Note)-[:MEMBER_OF {score: 0.92}]->(Cluster)

// Tagging
(File)-[:TAGGED_BY]->(Tag)
(Note)-[:TAGGED_BY]->(Tag)

// Voice/Transcription
(File)-[:HAS_TRANSCRIPT {job_id: "..."}]->(File)  // Audio file → transcript
```

---

## Redis Key Schema

```
# Search results cache
search:{hash_of_query+filters}        TTL: 5 minutes

# Session / auth
session:{token_hash}                   TTL: 24 hours

# Rate limiting
ratelimit:{user_id}:{endpoint}        TTL: 1 minute (sliding window)

# Agent conversation memory
agent:memory:{session_id}             TTL: 24 hours

# Graph traversal cache
graph:path:{from_node}:{to_node}      TTL: 24 hours

# Config cache (avoid repeated file reads)
config:{service_name}                  TTL: 5 minutes

# Queue metrics
queue:depth:{queue_name}              TTL: 30 seconds

# Ollama model availability
ollama:available                       TTL: 30 seconds

# Scan job progress (real-time)
scan:progress:{job_id}                TTL: 1 hour
```

---

## Migration Strategy

**Tool**: Prisma Migrate (kms-api) + Alembic (voice-app, workers)

**Order**:
```
1. auth schema (users, api_keys, refresh_tokens)
2. voice schema (jobs, transcriptions, translations, batch*)
3. kms schema (sources, files, notes, tags, scan_jobs, embed_jobs, duplicates, clusters)
4. graph_cache schema (entity_nodes, entity_mentions, traversal_cache)
5. Qdrant: create collections
6. Neo4j: create constraints + indexes
```

**Alembic fix for voice-app** (currently using SQLAlchemy create_all — not production-ready):
```python
# backend/alembic/env.py — needs to be created
# backend/alembic/versions/001_initial_schema.py — needs to be created
```
