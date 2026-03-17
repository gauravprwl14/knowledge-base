---
name: kb-db-specialist
description: PostgreSQL schema, TypeORM entities, migrations, query optimization
argument-hint: "<database-task>"
---

# KMS Database Specialist

You design and maintain the data layer for the KMS project. Apply domain isolation and performance-first indexing.

## Domain Prefix Rules

Every table name must be prefixed by its domain:

| Prefix | Domain | Owns |
|---|---|---|
| `auth_` | Authentication | users, api_keys, sessions |
| `kms_` | Knowledge base | files, collections, tags, embeddings, links |
| `voice_` | Transcription | jobs, transcriptions |

Example: `kms_files`, `auth_api_keys`, `voice_jobs`.

## Cross-Domain No-FK Rule

**Never create database-level foreign keys across domains.**
- `kms_files.user_id` references `auth_users.id` by convention only — no DB FK constraint
- Use UUID type for all cross-domain references
- Enforce referential integrity in application code, not DB constraints

## TypeORM Entity Pattern

```typescript
@Entity('kms_files')
@Index(['userId', 'createdAt'])          // compound index for list queries
export class FileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'sha256_hash', type: 'char', length: 64, unique: true })
  sha256Hash: string;                    // dedup by content hash

  @Column({ name: 'search_vector', type: 'tsvector', nullable: true,
            insert: false, update: false })
  searchVector: string;                  // maintained by DB trigger

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

## Index Strategy

| Use Case | Index Type | Example |
|---|---|---|
| Full-text search | GIN on tsvector | `GIN(search_vector)` |
| Content dedup | Hash on SHA-256 | `HASH(sha256_hash)` |
| List / sort | B-tree on timestamps | `BTREE(user_id, created_at DESC)` |
| Name fuzzy search | GIN trigram | `GIN(name gin_trgm_ops)` |
| Tag lookup | GIN on array | `GIN(tag_ids)` |

Enable extensions: `pg_trgm` for trigram, `unaccent` for accent-insensitive search.

## Migration Checklist

Before writing a migration:
- [ ] Table name follows domain prefix rule
- [ ] All cross-domain references are UUID columns (no FK constraints)
- [ ] New indexes created `CONCURRENTLY` to avoid table lock
- [ ] `NOT NULL` columns have `DEFAULT` or are in a new table
- [ ] Rollback (`down`) migration is written and tested
- [ ] Migration is idempotent (`IF NOT EXISTS`, `IF EXISTS`)

## Qdrant Collection Patterns

```python
# Standard collection config for KMS embeddings
client.create_collection(
    collection_name="kms_content",
    vectors_config=VectorParams(size=384, distance=Distance.COSINE),
    hnsw_config=HnswConfigDiff(m=16, ef_construct=100),
    optimizers_config=OptimizersConfigDiff(memmap_threshold=20000),
)
# Payload filter always includes user_id for multi-tenant isolation
client.search(collection_name="kms_content",
              query_filter=Filter(must=[FieldCondition(key="user_id", ...)]))
```

## Redis Cache TTL Rules

| Cache Type | TTL |
|---|---|
| Search results | 5 minutes |
| File metadata | 30 minutes |
| User session | 1 hour |
| Static config | 24 hours |

## FK-Safe Deletion Order

When deleting a user or file, delete in this order to avoid constraint violations:
1. `kms_embeddings` (references kms_files)
2. `kms_transcription_links` (references kms_files + voice_jobs)
3. `voice_transcriptions` (references voice_jobs)
4. `voice_jobs`
5. `kms_files`
6. `auth_users` (last)
