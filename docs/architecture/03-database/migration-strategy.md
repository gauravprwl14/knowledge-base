# Migration Strategy

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

This document outlines the strategy for migrating from a shared database to domain-specific databases. The current architecture uses logical table prefixes (`auth_`, `kms_`, `voice_`) to enable this future split with minimal application changes.

---

## Migration Phases

### Current State (Phase 0)

```
┌─────────────────────────────────────────────────────────────┐
│                      PostgreSQL                              │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│  │  auth_*   │  │   kms_*   │  │  voice_*  │               │
│  └───────────┘  └───────────┘  └───────────┘               │
│                                                              │
│  All services connect to single database                    │
│  Foreign keys exist between domains                         │
└─────────────────────────────────────────────────────────────┘
```

### Phase 1: Logical Separation

**Goal**: Remove cross-domain foreign keys, implement soft references

**Changes**:
1. Drop cross-domain foreign keys
2. Add application-level validation
3. Create integration tables
4. Implement eventual consistency patterns

```sql
-- Remove FK from kms_files to auth_users
ALTER TABLE kms_files DROP CONSTRAINT fk_files_user_id;

-- Add index for soft reference
CREATE INDEX idx_kms_files_user_id ON kms_files(user_id);

-- Application enforces: user exists before creating file
```

### Phase 2: Read Replicas

**Goal**: Scale read operations, prepare for split

```
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL Primary                        │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│  │  auth_*   │  │   kms_*   │  │  voice_*  │               │
│  └───────────┘  └───────────┘  └───────────┘               │
└────────────────────────┬────────────────────────────────────┘
                         │ Streaming Replication
              ┌──────────┴──────────┐
              ▼                     ▼
    ┌─────────────────┐   ┌─────────────────┐
    │  Read Replica 1 │   │  Read Replica 2 │
    │  (search-api)   │   │  (analytics)    │
    └─────────────────┘   └─────────────────┘
```

### Phase 3: Database per Domain

**Goal**: Full domain isolation

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Auth DB    │    │   KMS DB    │    │  Voice DB   │
│ (PostgreSQL)│    │ (PostgreSQL)│    │ (PostgreSQL)│
├─────────────┤    ├─────────────┤    ├─────────────┤
│ auth_users  │    │ kms_sources │    │ voice_jobs  │
│ auth_keys   │    │ kms_files   │    │ voice_trans │
│ auth_teams  │    │ kms_dup     │    │             │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       └──────────────────┼──────────────────┘
                          │
              ┌───────────┴───────────┐
              │    Event Bus          │
              │    (RabbitMQ)         │
              └───────────────────────┘
```

---

## Phase 1: Logical Separation (Detailed)

### Step 1.1: Audit Cross-Domain References

```sql
-- Find all foreign keys between domains
SELECT
    tc.table_name AS source_table,
    kcu.column_name AS source_column,
    ccu.table_name AS target_table,
    tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND (
    (tc.table_name LIKE 'kms_%' AND ccu.table_name LIKE 'auth_%') OR
    (tc.table_name LIKE 'voice_%' AND ccu.table_name LIKE 'auth_%') OR
    (tc.table_name LIKE 'kms_%' AND ccu.table_name LIKE 'voice_%')
  );
```

**Expected Results**:

| Source Table | Source Column | Target Table | Constraint |
|--------------|---------------|--------------|------------|
| kms_sources | user_id | auth_users | fk_sources_user |
| kms_files | user_id | auth_users | fk_files_user |
| kms_scan_jobs | user_id | auth_users | fk_jobs_user |
| voice_jobs | api_key_id | auth_api_keys | fk_jobs_key |

### Step 1.2: Create Validation Layer

```python
# app/services/validation.py - NOT executable - conceptual implementation

class CrossDomainValidator:
    """
    Application-level validation for cross-domain references.
    Replaces database foreign keys with API calls.
    """

    def __init__(self, auth_client: AuthClient, cache: RedisCache):
        self.auth_client = auth_client
        self.cache = cache

    async def validate_user_exists(self, user_id: str) -> bool:
        """
        Check if user exists in auth domain.
        Uses cache to minimize API calls.
        """
        cache_key = f"user_exists:{user_id}"

        # Check cache first
        cached = await self.cache.get(cache_key)
        if cached is not None:
            return cached == "1"

        # Call auth service
        try:
            user = await self.auth_client.get_user(user_id)
            exists = user is not None
        except Exception:
            # On error, assume valid (fail open)
            exists = True

        # Cache result
        await self.cache.set(cache_key, "1" if exists else "0", ttl=300)
        return exists

    async def validate_before_create(self, entity: str, user_id: str):
        """Validate user before creating entity"""
        if not await self.validate_user_exists(user_id):
            raise ValidationError(f"User {user_id} not found")
```

### Step 1.3: Drop Foreign Keys

```sql
-- Migration script: drop cross-domain FKs

-- kms_sources
ALTER TABLE kms_sources DROP CONSTRAINT IF EXISTS fk_sources_user_id;
ALTER TABLE kms_sources ADD CONSTRAINT chk_user_id CHECK (user_id IS NOT NULL);

-- kms_files
ALTER TABLE kms_files DROP CONSTRAINT IF EXISTS fk_files_user_id;
ALTER TABLE kms_files ADD CONSTRAINT chk_user_id CHECK (user_id IS NOT NULL);

-- kms_scan_jobs
ALTER TABLE kms_scan_jobs DROP CONSTRAINT IF EXISTS fk_scan_jobs_user_id;
ALTER TABLE kms_scan_jobs ADD CONSTRAINT chk_user_id CHECK (user_id IS NOT NULL);

-- voice_jobs (keep api_key_id reference until Phase 3)
-- No change yet
```

### Step 1.4: Add Integration Events

```python
# Event publishing for cross-domain consistency

class UserEventPublisher:
    """Publish user events for domain synchronization"""

    async def on_user_deleted(self, user_id: str):
        """
        Published when user is deleted.
        Other domains subscribe to clean up related data.
        """
        await self.publish('user.deleted', {
            'user_id': user_id,
            'deleted_at': datetime.utcnow().isoformat()
        })

class KMSEventSubscriber:
    """Subscribe to auth domain events"""

    async def handle_user_deleted(self, event: dict):
        """
        Clean up KMS data when user is deleted.
        Soft delete files, revoke sources.
        """
        user_id = event['user_id']

        # Soft delete all user's files
        await self.db.execute("""
            UPDATE kms_files
            SET is_deleted = true, deleted_at = NOW()
            WHERE user_id = $1
        """, user_id)

        # Disconnect all sources
        await self.db.execute("""
            UPDATE kms_sources
            SET status = 'disconnected'
            WHERE user_id = $1
        """, user_id)
```

---

## Phase 2: Read Replicas (Detailed)

### Step 2.1: Configure Streaming Replication

```yaml
# postgresql.conf (Primary)
wal_level = replica
max_wal_senders = 5
wal_keep_size = 1GB

# postgresql.conf (Replica)
hot_standby = on
hot_standby_feedback = on
```

### Step 2.2: Application Read/Write Splitting

```python
# Database configuration with read/write splitting

class DatabaseConfig:
    """
    Configure read/write database connections.
    Writes go to primary, reads can use replicas.
    """

    def __init__(self):
        self.write_engine = create_async_engine(
            settings.DATABASE_PRIMARY_URL,
            pool_size=10
        )
        self.read_engine = create_async_engine(
            settings.DATABASE_REPLICA_URL,
            pool_size=20
        )

    def get_session(self, read_only: bool = False):
        """Get session for read or write"""
        engine = self.read_engine if read_only else self.write_engine
        return AsyncSession(engine)

# Usage in service
class FileService:
    async def list_files(self, user_id: str):
        # Read operation - use replica
        async with db.get_session(read_only=True) as session:
            return await self.repository.find_by_user(session, user_id)

    async def create_file(self, file: FileCreate):
        # Write operation - use primary
        async with db.get_session(read_only=False) as session:
            return await self.repository.create(session, file)
```

---

## Phase 3: Database per Domain (Detailed)

### Step 3.1: Provision New Databases

```yaml
# docker-compose for separate databases
services:
  auth-db:
    image: postgres:15
    environment:
      POSTGRES_DB: auth
    volumes:
      - auth_data:/var/lib/postgresql/data

  kms-db:
    image: postgres:15
    environment:
      POSTGRES_DB: kms
    volumes:
      - kms_data:/var/lib/postgresql/data

  voice-db:
    image: postgres:15
    environment:
      POSTGRES_DB: voice
    volumes:
      - voice_data:/var/lib/postgresql/data
```

### Step 3.2: Data Migration Script

```python
# migrate_to_domain_dbs.py - NOT executable - conceptual implementation

class DomainMigrator:
    """Migrate data from shared DB to domain-specific DBs"""

    async def migrate_auth_domain(self):
        """Migrate auth_* tables to auth-db"""

        # 1. Create tables in auth-db
        await self.auth_db.execute(AUTH_SCHEMA_SQL)

        # 2. Copy data in batches
        offset = 0
        batch_size = 10000

        while True:
            users = await self.shared_db.fetch("""
                SELECT * FROM auth_users
                ORDER BY id
                LIMIT $1 OFFSET $2
            """, batch_size, offset)

            if not users:
                break

            await self.auth_db.copy_records(
                'auth_users',
                users,
                columns=['id', 'email', 'password_hash', ...]
            )

            offset += batch_size

        # 3. Verify counts match
        shared_count = await self.shared_db.fetchval(
            "SELECT COUNT(*) FROM auth_users"
        )
        auth_count = await self.auth_db.fetchval(
            "SELECT COUNT(*) FROM auth_users"
        )
        assert shared_count == auth_count

    async def migrate_all(self):
        """Run full migration"""
        await self.migrate_auth_domain()
        await self.migrate_kms_domain()
        await self.migrate_voice_domain()
```

### Step 3.3: Update Service Configuration

```python
# config.py - Service-specific database connections

class Settings(BaseSettings):
    # Auth service connects to auth-db
    AUTH_DATABASE_URL: str = "postgresql://auth-db:5432/auth"

    # KMS services connect to kms-db
    KMS_DATABASE_URL: str = "postgresql://kms-db:5432/kms"

    # Voice service connects to voice-db
    VOICE_DATABASE_URL: str = "postgresql://voice-db:5432/voice"

# Service startup
if SERVICE_NAME == 'kms-api':
    database_url = settings.KMS_DATABASE_URL
elif SERVICE_NAME == 'voice-app':
    database_url = settings.VOICE_DATABASE_URL
# etc.
```

### Step 3.4: Cross-Domain Communication

```python
# After split: Use API calls instead of DB joins

class KMSApiClient:
    """Client for KMS API from other services"""

    async def get_file(self, file_id: str) -> FileInfo:
        """Get file info via API"""
        response = await self.http.get(f"/api/v1/files/{file_id}")
        return FileInfo(**response.json())

class VoiceService:
    """Voice service with cross-domain communication"""

    async def link_transcription(self, file_id: str, job_id: str):
        """
        Link transcription to KMS file.
        Uses API instead of direct DB access.
        """
        # Validate file exists in KMS
        file_info = await self.kms_client.get_file(file_id)
        if not file_info:
            raise NotFoundError(f"File {file_id} not found")

        # Create link via KMS API
        await self.kms_client.create_transcription_link(
            file_id=file_id,
            voice_job_id=job_id
        )
```

---

## Rollback Plan

### Phase 1 Rollback

```sql
-- Re-add foreign keys if needed
ALTER TABLE kms_files
ADD CONSTRAINT fk_files_user_id
FOREIGN KEY (user_id) REFERENCES auth_users(id);
```

### Phase 3 Rollback

1. Stop all services
2. Point all services back to shared database
3. Sync any data written to domain DBs back to shared
4. Resume services

---

## Success Criteria

### Phase 1 Complete When

- [ ] No cross-domain foreign keys exist
- [ ] Application validation passes all tests
- [ ] Event-based consistency working
- [ ] No data integrity issues in production (1 week)

### Phase 2 Complete When

- [ ] Read replicas serving 80%+ of read traffic
- [ ] Replication lag < 100ms
- [ ] Failover tested and documented

### Phase 3 Complete When

- [ ] Each domain on separate database instance
- [ ] All cross-domain communication via API/events
- [ ] Independent scaling verified
- [ ] Performance metrics maintained or improved

---

## Timeline Estimate

| Phase | Duration | Prerequisites |
|-------|----------|---------------|
| Phase 1 | 2-4 weeks | Application refactoring |
| Phase 2 | 1-2 weeks | Infrastructure setup |
| Phase 3 | 4-6 weeks | API contracts finalized |

**Total**: 7-12 weeks for full migration

