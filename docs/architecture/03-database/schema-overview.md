# Schema Overview

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Complete Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              AUTH DOMAIN (Shared)                                    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────────┐       ┌─────────────────────┐                              │
│  │    auth_users       │       │   auth_api_keys     │                              │
│  ├─────────────────────┤       ├─────────────────────┤                              │
│  │ id (PK)             │──1:N─►│ id (PK)             │                              │
│  │ email               │       │ user_id (FK)        │                              │
│  │ password_hash       │       │ key_hash            │                              │
│  │ name                │       │ name                │                              │
│  │ google_id           │       │ scopes              │                              │
│  │ created_at          │       │ expires_at          │                              │
│  │ updated_at          │       │ is_active           │                              │
│  └─────────────────────┘       └─────────────────────┘                              │
│           │                                                                          │
│           │ 1:N                                                                       │
│           ▼                                                                          │
│  ┌─────────────────────┐       ┌─────────────────────┐                              │
│  │    auth_teams       │──1:N─►│ auth_team_members   │                              │
│  ├─────────────────────┤       ├─────────────────────┤                              │
│  │ id (PK)             │       │ id (PK)             │                              │
│  │ name                │       │ team_id (FK)        │                              │
│  │ owner_id (FK)       │       │ user_id (FK)        │                              │
│  │ created_at          │       │ role                │                              │
│  └─────────────────────┘       └─────────────────────┘                              │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              KMS DOMAIN                                              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  auth_users                                                                          │
│       │                                                                              │
│       │ 1:N                                                                          │
│       ▼                                                                              │
│  ┌─────────────────────┐                                                            │
│  │    kms_sources      │                                                            │
│  ├─────────────────────┤                                                            │
│  │ id (PK)             │                                                            │
│  │ user_id (FK→auth)   │                                                            │
│  │ source_type         │                                                            │
│  │ name                │                                                            │
│  │ config              │ (JSONB - encrypted tokens)                                 │
│  │ status              │                                                            │
│  │ last_scan_at        │                                                            │
│  │ created_at          │                                                            │
│  └──────────┬──────────┘                                                            │
│             │                                                                        │
│             │ 1:N                                                                     │
│             ▼                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                           kms_files                                          │    │
│  ├─────────────────────────────────────────────────────────────────────────────┤    │
│  │ id (PK)              │ source_id (FK)        │ user_id (FK→auth)            │    │
│  │ source_file_id       │ name                  │ path                          │    │
│  │ mime_type            │ size_bytes            │ hash_sha256                   │    │
│  │ created_at           │ modified_at           │ indexed_at                    │    │
│  │ embedding_status     │ duplicate_group_id (FK)│ is_junk                      │    │
│  │ junk_confidence      │ junk_category         │ is_deleted                    │    │
│  │ metadata (JSONB)     │                       │                               │    │
│  └──────────┬───────────┴───────────┬───────────┴───────────────────────────────┘    │
│             │                       │                                                │
│     ┌───────┴───────┐       ┌───────┴───────┐                                       │
│     │ 1:N           │       │ N:1           │                                       │
│     ▼               │       ▼               │                                       │
│  ┌──────────────────┤    ┌──────────────────┤                                       │
│  │ kms_embeddings   │    │kms_duplicate_grps│                                       │
│  ├──────────────────┤    ├──────────────────┤                                       │
│  │ id (PK)          │    │ id (PK)          │                                       │
│  │ file_id (FK)     │    │ primary_file_id  │                                       │
│  │ chunk_index      │    │ group_type       │                                       │
│  │ qdrant_point_id  │    │ file_count       │                                       │
│  │ created_at       │    │ total_size_bytes │                                       │
│  └──────────────────┘    │ savings_bytes    │                                       │
│                          │ created_at       │                                       │
│                          └──────────────────┘                                       │
│                                                                                      │
│  ┌─────────────────────┐       ┌─────────────────────┐                              │
│  │   kms_scan_jobs     │       │kms_transcription_lnk│                              │
│  ├─────────────────────┤       ├─────────────────────┤                              │
│  │ id (PK)             │       │ id (PK)             │                              │
│  │ source_id (FK)      │       │ file_id             │  (Soft FK to kms_files)      │
│  │ user_id (FK→auth)   │       │ voice_job_id        │  (Soft FK to voice_jobs)     │
│  │ status              │       │ status              │                              │
│  │ progress            │       │ created_at          │                              │
│  │ files_found         │       └─────────────────────┘                              │
│  │ files_processed     │                                                            │
│  │ error_message       │                                                            │
│  │ started_at          │                                                            │
│  │ completed_at        │                                                            │
│  └─────────────────────┘                                                            │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              VOICE DOMAIN                                            │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  auth_users                         auth_api_keys                                    │
│       │                                   │                                          │
│       │ 1:N                               │ 1:N                                      │
│       ▼                                   ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                           voice_jobs                                         │    │
│  ├─────────────────────────────────────────────────────────────────────────────┤    │
│  │ id (PK)              │ api_key_id (FK→auth)  │ user_id (FK→auth, optional)  │    │
│  │ status               │ provider              │ model                         │    │
│  │ original_filename    │ file_path             │ file_size                     │    │
│  │ priority             │ webhook_url           │ error_message                 │    │
│  │ created_at           │ started_at            │ completed_at                  │    │
│  └──────────────────────┴───────────┬───────────┴───────────────────────────────┘    │
│                                     │                                                │
│                                     │ 1:1                                            │
│                                     ▼                                                │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                      voice_transcriptions                                    │    │
│  ├─────────────────────────────────────────────────────────────────────────────┤    │
│  │ id (PK)              │ job_id (FK, UNIQUE)   │ text                          │    │
│  │ segments (JSONB)     │ confidence            │ processing_time_ms            │    │
│  │ language             │ word_count            │ created_at                    │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Table Summary

### Auth Domain Tables

| Table | Description | Row Estimate |
|-------|-------------|--------------|
| `auth_users` | User accounts | 10K |
| `auth_api_keys` | API keys for authentication | 50K |
| `auth_teams` | Team/organization records | 1K |
| `auth_team_members` | Team membership | 20K |

### KMS Domain Tables

| Table | Description | Row Estimate |
|-------|-------------|--------------|
| `kms_sources` | Connected file sources | 50K |
| `kms_files` | File metadata index | 10M |
| `kms_embeddings` | Embedding references | 50M |
| `kms_scan_jobs` | Scan job history | 500K |
| `kms_duplicate_groups` | Duplicate file groups | 100K |
| `kms_transcription_links` | KMS↔Voice integration | 1M |

### Voice Domain Tables

| Table | Description | Row Estimate |
|-------|-------------|--------------|
| `voice_jobs` | Transcription jobs | 5M |
| `voice_transcriptions` | Transcription results | 5M |

---

## Data Types

### Common Types

| Type | PostgreSQL | Usage |
|------|------------|-------|
| Primary Key | `UUID` | All table IDs |
| Timestamps | `TIMESTAMP WITH TIME ZONE` | created_at, updated_at |
| Status Enum | `VARCHAR(50)` | Status fields |
| JSON Data | `JSONB` | Flexible metadata |
| Text Search | `tsvector` | Full-text search |

### Custom Enums

```sql
-- Source types
CREATE TYPE source_type AS ENUM (
    'google_drive',
    'local_fs',
    'external_drive'
);

-- File statuses
CREATE TYPE embedding_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);

-- Job statuses
CREATE TYPE job_status AS ENUM (
    'pending',
    'queued',
    'processing',
    'completed',
    'failed',
    'cancelled'
);

-- Duplicate types
CREATE TYPE duplicate_type AS ENUM (
    'exact',
    'semantic',
    'version'
);
```

---

## Foreign Key Relationships

### Auth Domain (Referenced by All)

```sql
-- All user-owned tables reference auth_users
user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE

-- API key references
api_key_id UUID REFERENCES auth_api_keys(id) ON DELETE SET NULL
```

### KMS Domain

```sql
-- Source references
source_id UUID REFERENCES kms_sources(id) ON DELETE CASCADE

-- File references
file_id UUID REFERENCES kms_files(id) ON DELETE CASCADE

-- Duplicate group (nullable)
duplicate_group_id UUID REFERENCES kms_duplicate_groups(id) ON DELETE SET NULL
```

### Cross-Domain (Soft References)

```sql
-- kms_transcription_links uses soft references
file_id UUID NOT NULL,           -- Not FK (references kms_files)
voice_job_id VARCHAR(255),       -- Not FK (references voice_jobs)

-- Application-level integrity enforcement
CREATE INDEX idx_trans_links_file ON kms_transcription_links(file_id);
CREATE INDEX idx_trans_links_job ON kms_transcription_links(voice_job_id);
```

---

## Partitioning Strategy

### Candidates for Partitioning

| Table | Strategy | Partition Key | When |
|-------|----------|---------------|------|
| `kms_files` | Range | `created_at` | > 50M rows |
| `kms_embeddings` | Range | `created_at` | > 100M rows |
| `voice_jobs` | Range | `created_at` | > 10M rows |

### Example Partition Definition

```sql
-- Partition kms_files by month
CREATE TABLE kms_files (
    id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    -- ... other columns
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE kms_files_2026_01 PARTITION OF kms_files
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

---

## Data Retention

| Table | Retention | Archive Strategy |
|-------|-----------|------------------|
| `kms_files` | Indefinite | Move deleted to archive |
| `kms_scan_jobs` | 90 days | Delete completed jobs |
| `kms_embeddings` | With file | Cascade delete |
| `voice_jobs` | 1 year | Archive to cold storage |
| `auth_api_keys` | Until revoked | Soft delete |

