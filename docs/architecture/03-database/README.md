# Database Architecture

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The KMS uses a polyglot persistence strategy with PostgreSQL as the primary relational database, supplemented by Qdrant for vector storage and Neo4j for graph relationships. This section documents the database architecture, schema design, and migration strategy for future microservice database separation.

---

## Database Strategy

### Current State: Shared Database

```
┌─────────────────────────────────────────────────────────────┐
│                      PostgreSQL 15+                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  auth_*      │  │   kms_*      │  │  voice_*     │       │
│  │  (Shared)    │  │ (KMS Domain) │  │ (Voice App)  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  Tables: auth_users, auth_api_keys, auth_teams              │
│  Tables: kms_sources, kms_files, kms_duplicates, ...        │
│  Tables: voice_jobs, voice_transcriptions, ...              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Future State: Database per Service

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Auth DB    │    │   KMS DB    │    │  Voice DB   │
│ (PostgreSQL)│    │ (PostgreSQL)│    │ (PostgreSQL)│
├─────────────┤    ├─────────────┤    ├─────────────┤
│ auth_users  │◄──►│ kms_sources │◄──►│ voice_jobs  │
│ auth_api_keys│   │ kms_files   │    │ voice_trans │
│ auth_teams  │    │ kms_dup     │    │             │
└─────────────┘    └──────┬──────┘    └─────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   Supplementary DBs   │
              ├───────────────────────┤
              │ Qdrant (Vectors)      │
              │ Neo4j (Relationships) │
              │ Redis (Cache)         │
              └───────────────────────┘
```

---

## Domain Separation Strategy

### Naming Convention

All tables use domain prefixes to enable future database separation:

| Prefix | Domain | Owner Service | Description |
|--------|--------|---------------|-------------|
| `auth_` | Authentication | kms-api | User auth, API keys, teams |
| `kms_` | Knowledge Management | kms-api | Files, sources, duplicates |
| `voice_` | Transcription | voice-app | Jobs, transcriptions |

### Cross-Domain Rules

| Rule | Description |
|------|-------------|
| **FK to auth_*** | ✅ Allowed - All domains reference `auth_users` |
| **FK within domain** | ✅ Allowed - Normal foreign keys |
| **FK cross-domain** | ❌ Prohibited - Use integration tables |
| **Joins within domain** | ✅ Allowed - Normal SQL joins |
| **Joins cross-domain** | ⚠️ Discouraged - Use application-level joins |

### Integration Pattern

For cross-domain relationships, use integration tables with loose coupling:

```sql
-- Integration table for KMS-Voice relationship
CREATE TABLE kms_transcription_links (
    id UUID PRIMARY KEY,
    file_id UUID NOT NULL,           -- References kms_files (not FK)
    voice_job_id VARCHAR(255),       -- References voice_jobs (not FK)
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Application enforces consistency, not database
```

---

## Database Documentation

| Document | Description |
|----------|-------------|
| [Schema Overview](./schema-overview.md) | Complete schema visualization |
| [Auth Domain Schema](./auth-domain-schema.md) | Authentication tables |
| [KMS Domain Schema](./kms-domain-schema.md) | Knowledge management tables |
| [Voice Domain Schema](./voice-domain-schema.md) | Transcription tables |
| [Indexes & Optimization](./indexes-and-optimization.md) | Index strategy |
| [Migration Strategy](./migration-strategy.md) | Future database split |

---

## Supplementary Databases

### Qdrant (Vector Database)

| Property | Value |
|----------|-------|
| **Purpose** | Semantic search embeddings |
| **Collection** | `kms_files_default` |
| **Vector Size** | 384 (MiniLM) |
| **Index Type** | HNSW |
| **Distance** | Cosine |

### Neo4j (Graph Database)

| Property | Value |
|----------|-------|
| **Purpose** | File relationships, duplicates |
| **Node Types** | File, Folder, User, DuplicateGroup |
| **Relationships** | IN_FOLDER, DUPLICATE_OF, OWNS |
| **Protocol** | Bolt |

### Redis (Cache)

| Property | Value |
|----------|-------|
| **Purpose** | Caching, sessions, rate limiting |
| **TTL** | 5 minutes (search results) |
| **Persistence** | RDB snapshots |

---

## Schema Summary

### Table Count by Domain

| Domain | Tables | Purpose |
|--------|--------|---------|
| Auth | 4 | Users, API keys, teams |
| KMS | 7 | Files, sources, duplicates |
| Voice | 2 | Jobs, transcriptions |
| **Total** | **13** | |

### Key Relationships

```
auth_users (1) ──────┬──────► (N) auth_api_keys
                     │
                     ├──────► (N) kms_sources
                     │
                     ├──────► (N) kms_files
                     │
                     └──────► (N) voice_jobs

kms_sources (1) ────────────► (N) kms_files

kms_files (1) ──────┬──────► (N) kms_embeddings
                    │
                    ├──────► (1) kms_duplicate_groups
                    │
                    └──────► (1) kms_transcription_links

kms_duplicate_groups (1) ───► (N) kms_files
```

---

## Connection Configuration

### Primary Database (PostgreSQL)

```yaml
# Connection pool settings
pool_size: 10
max_overflow: 20
pool_timeout: 30
pool_recycle: 1800  # 30 minutes

# Performance settings
statement_cache_size: 100
prepared_statement_cache_size: 100
```

### Connection Strings by Service

| Service | Connection | Access |
|---------|------------|--------|
| kms-api | Full | READ/WRITE all domains |
| search-api | Limited | READ-ONLY kms_*, auth_users |
| scan-worker | Limited | WRITE kms_files, kms_sources |
| embedding-worker | Limited | WRITE kms_files, kms_embeddings |
| dedup-worker | Limited | WRITE kms_duplicates, kms_files |
| voice-app | Full | READ/WRITE voice_*, kms_transcription_links |

---

## Backup Strategy

| Component | Strategy | Frequency | Retention |
|-----------|----------|-----------|-----------|
| PostgreSQL | pg_dump | Daily | 30 days |
| Qdrant | Snapshot | Daily | 7 days |
| Neo4j | Dump | Weekly | 14 days |
| Redis | RDB | Hourly | 24 hours |

