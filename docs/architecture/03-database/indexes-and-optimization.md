# Indexes and Optimization

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

This document outlines the indexing strategy and query optimization techniques for the KMS database. Proper indexing is critical for search performance, especially as the file index grows to millions of records.

---

## Index Types Used

| Type | PostgreSQL | Use Case |
|------|------------|----------|
| **B-tree** | Default | Equality, range queries |
| **GIN** | `USING GIN` | Full-text search, JSONB |
| **GiST** | `USING GiST` | Geometric, range types |
| **Trigram** | `gin_trgm_ops` | Fuzzy text matching |
| **BRIN** | `USING BRIN` | Large sequential data |

---

## Index Strategy by Table

### kms_files (Primary Table)

This is the largest table and requires careful indexing.

#### Primary Indexes

```sql
-- Primary key (auto-created)
-- Already exists: PRIMARY KEY (id)

-- Foreign key lookups
CREATE INDEX idx_kms_files_user_id ON kms_files(user_id);
CREATE INDEX idx_kms_files_source_id ON kms_files(source_id);

-- Duplicate detection
CREATE INDEX idx_kms_files_hash ON kms_files(hash_sha256)
    WHERE hash_sha256 IS NOT NULL;

-- Duplicate group membership
CREATE INDEX idx_kms_files_dup_group ON kms_files(duplicate_group_id)
    WHERE duplicate_group_id IS NOT NULL;
```

#### Search Indexes

```sql
-- Full-text search on name and path
CREATE INDEX idx_kms_files_search ON kms_files USING GIN(search_vector);

-- Fuzzy filename matching (requires pg_trgm extension)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_kms_files_name_trgm ON kms_files USING GIN(name gin_trgm_ops);

-- MIME type filtering
CREATE INDEX idx_kms_files_mime_type ON kms_files(mime_type);
```

#### Status Filtering Indexes (Partial)

```sql
-- Pending embeddings (partial index)
CREATE INDEX idx_kms_files_embedding_pending ON kms_files(source_id)
    WHERE embedding_status = 'pending' AND is_deleted = false;

-- Junk files (partial index)
CREATE INDEX idx_kms_files_junk ON kms_files(user_id)
    WHERE is_junk = true AND is_deleted = false;

-- Active files (partial index)
CREATE INDEX idx_kms_files_active ON kms_files(user_id, source_modified_at DESC)
    WHERE is_deleted = false;
```

#### Composite Indexes for Common Queries

```sql
-- User's files by source (listing page)
CREATE INDEX idx_kms_files_user_source ON kms_files(user_id, source_id, source_modified_at DESC)
    WHERE is_deleted = false;

-- Search with user scope
CREATE INDEX idx_kms_files_user_search ON kms_files(user_id)
    INCLUDE (name, path, mime_type, size_bytes)
    WHERE is_deleted = false;
```

---

### kms_sources

```sql
-- User's sources
CREATE INDEX idx_kms_sources_user_id ON kms_sources(user_id);

-- Active sources for scheduled scans
CREATE INDEX idx_kms_sources_next_scan ON kms_sources(next_scan_at)
    WHERE status = 'active';

-- Status filtering
CREATE INDEX idx_kms_sources_status ON kms_sources(status);
```

---

### kms_scan_jobs

```sql
-- User's jobs
CREATE INDEX idx_kms_scan_jobs_user_id ON kms_scan_jobs(user_id);

-- Source's jobs
CREATE INDEX idx_kms_scan_jobs_source_id ON kms_scan_jobs(source_id);

-- Active jobs (partial)
CREATE INDEX idx_kms_scan_jobs_active ON kms_scan_jobs(status, created_at)
    WHERE status IN ('pending', 'queued', 'scanning');

-- Recent jobs listing
CREATE INDEX idx_kms_scan_jobs_recent ON kms_scan_jobs(user_id, created_at DESC);
```

---

### kms_embeddings

```sql
-- File's chunks
CREATE INDEX idx_kms_embeddings_file_id ON kms_embeddings(file_id);

-- Qdrant reference lookup
CREATE INDEX idx_kms_embeddings_qdrant ON kms_embeddings(qdrant_collection, qdrant_point_id);
```

---

### kms_duplicate_groups

```sql
-- Primary file lookup
CREATE INDEX idx_kms_dup_groups_primary ON kms_duplicate_groups(primary_file_id);

-- Savings ranking
CREATE INDEX idx_kms_dup_groups_savings ON kms_duplicate_groups(savings_bytes DESC);

-- Type filtering
CREATE INDEX idx_kms_dup_groups_type ON kms_duplicate_groups(group_type);
```

---

### auth_users

```sql
-- Email lookup (login)
CREATE UNIQUE INDEX idx_auth_users_email ON auth_users(email);

-- Google OAuth lookup
CREATE UNIQUE INDEX idx_auth_users_google_id ON auth_users(google_id)
    WHERE google_id IS NOT NULL;

-- Name search
CREATE INDEX idx_auth_users_name_search ON auth_users
    USING GIN(to_tsvector('english', name));
```

---

### auth_api_keys

```sql
-- Key hash lookup (authentication)
CREATE INDEX idx_auth_api_keys_hash ON auth_api_keys(key_hash);

-- User's keys
CREATE INDEX idx_auth_api_keys_user_id ON auth_api_keys(user_id);

-- Active keys (partial)
CREATE INDEX idx_auth_api_keys_active ON auth_api_keys(user_id)
    WHERE is_active = true;
```

---

### voice_jobs

```sql
-- API key's jobs
CREATE INDEX idx_voice_jobs_api_key ON voice_jobs(api_key_id);

-- Pending jobs for dispatcher
CREATE INDEX idx_voice_jobs_pending ON voice_jobs(priority DESC, created_at ASC)
    WHERE status = 'pending';

-- Status filtering
CREATE INDEX idx_voice_jobs_status ON voice_jobs(status);

-- Recent jobs listing
CREATE INDEX idx_voice_jobs_recent ON voice_jobs(api_key_id, created_at DESC);
```

---

## Full-Text Search Configuration

### Search Vector Generation

```sql
-- Function to generate search vector
CREATE OR REPLACE FUNCTION kms_files_search_trigger() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(
            regexp_replace(NEW.path, '[/\\]', ' ', 'g'), ''
        )), 'B');
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_kms_files_search
    BEFORE INSERT OR UPDATE OF name, path ON kms_files
    FOR EACH ROW
    EXECUTE FUNCTION kms_files_search_trigger();
```

### Search Query Optimization

```sql
-- Efficient full-text search with ranking
SELECT
    f.id,
    f.name,
    f.path,
    ts_rank_cd(f.search_vector, query, 32) AS rank
FROM kms_files f,
     plainto_tsquery('english', $1) query
WHERE f.user_id = $2
  AND f.is_deleted = false
  AND f.search_vector @@ query
ORDER BY rank DESC
LIMIT 20;

-- With trigram fuzzy matching fallback
SELECT id, name, similarity(name, $1) AS sim
FROM kms_files
WHERE user_id = $2
  AND is_deleted = false
  AND name % $1  -- Trigram operator
ORDER BY sim DESC
LIMIT 20;
```

---

## Query Optimization Techniques

### 1. Use Partial Indexes

Partial indexes are smaller and more efficient for common filter conditions.

```sql
-- Instead of full index
CREATE INDEX idx_files_status ON kms_files(embedding_status);

-- Use partial index for common queries
CREATE INDEX idx_files_pending ON kms_files(source_id)
    WHERE embedding_status = 'pending' AND is_deleted = false;
```

### 2. Include Columns for Index-Only Scans

```sql
-- Include frequently selected columns
CREATE INDEX idx_kms_files_listing ON kms_files(user_id, created_at DESC)
    INCLUDE (name, mime_type, size_bytes)
    WHERE is_deleted = false;

-- Query can be satisfied from index only
SELECT name, mime_type, size_bytes
FROM kms_files
WHERE user_id = $1 AND is_deleted = false
ORDER BY created_at DESC
LIMIT 20;
```

### 3. Use BRIN for Large Sequential Data

```sql
-- BRIN index for time-series data (much smaller than B-tree)
CREATE INDEX idx_kms_files_created_brin ON kms_files
    USING BRIN(created_at);

-- Good for: WHERE created_at > '2026-01-01'
-- Not good for: ORDER BY created_at (use B-tree)
```

### 4. Optimize JSONB Queries

```sql
-- Index specific JSONB paths
CREATE INDEX idx_kms_files_meta_type ON kms_files((metadata->>'document_type'));

-- GIN index for containment queries
CREATE INDEX idx_kms_files_meta_gin ON kms_files USING GIN(metadata);

-- Query with containment
SELECT * FROM kms_files
WHERE metadata @> '{"document_type": "invoice"}';
```

---

## Connection Pooling

### Recommended Settings

```yaml
# PgBouncer configuration
[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
reserve_pool_size = 5
reserve_pool_timeout = 3

# Per-database pools
[databases]
kms = host=postgres port=5432 dbname=kms pool_size=30
```

### Application Settings

```python
# SQLAlchemy async pool settings
engine = create_async_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_timeout=30,
    pool_recycle=1800,  # 30 minutes
    pool_pre_ping=True
)
```

---

## Query Plan Analysis

### Using EXPLAIN ANALYZE

```sql
-- Analyze query plan
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT f.id, f.name
FROM kms_files f
WHERE f.user_id = $1
  AND f.search_vector @@ plainto_tsquery('english', 'project report')
ORDER BY f.source_modified_at DESC
LIMIT 20;
```

### Key Metrics to Watch

| Metric | Target | Action if Exceeded |
|--------|--------|-------------------|
| Seq Scan on large tables | 0 | Add appropriate index |
| Planning Time | < 5ms | Simplify query |
| Execution Time | < 100ms | Optimize indexes/query |
| Buffers (shared hit ratio) | > 95% | Increase shared_buffers |
| Rows Removed by Filter | < 10% | Index the filter column |

---

## Maintenance Tasks

### Regular VACUUM and ANALYZE

```sql
-- Auto-vacuum settings (postgresql.conf)
autovacuum = on
autovacuum_vacuum_scale_factor = 0.1
autovacuum_analyze_scale_factor = 0.05

-- Manual maintenance for heavily updated tables
VACUUM ANALYZE kms_files;
VACUUM ANALYZE kms_scan_jobs;
```

### Index Maintenance

```sql
-- Check index usage
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Identify unused indexes
SELECT
    indexrelname,
    idx_scan,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Rebuild bloated indexes
REINDEX INDEX CONCURRENTLY idx_kms_files_search;
```

### Table Statistics

```sql
-- Check table statistics
SELECT
    relname,
    n_live_tup,
    n_dead_tup,
    last_vacuum,
    last_autovacuum,
    last_analyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;
```

---

## Performance Targets

| Query Type | Target Latency | Index Strategy |
|------------|----------------|----------------|
| Single row by ID | < 1ms | Primary key |
| User's files list | < 50ms | Composite + partial |
| Full-text search | < 100ms | GIN on tsvector |
| Fuzzy name search | < 200ms | Trigram GIN |
| Duplicate hash lookup | < 10ms | Hash column B-tree |
| Stats aggregation | < 500ms | Materialized view |

