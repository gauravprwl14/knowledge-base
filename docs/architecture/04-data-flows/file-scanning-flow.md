# File Scanning Flow

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The file scanning flow discovers and indexes files from connected sources (Google Drive, local filesystems). It's the entry point for all files into the KMS system.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           FILE SCANNING FLOW                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌────────┐
    │  User  │
    └────┬───┘
         │ 1. POST /scan-jobs
         ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                            KMS-API                                       │
    │                                                                          │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ ScanJobsController                                                │   │
    │  │                                                                   │   │
    │  │  1. Validate source exists and is active                         │   │
    │  │  2. Create scan_job record (status: pending)                     │   │
    │  │  3. Publish SCAN_REQUESTED to scan.queue                         │   │
    │  │  4. Return job ID to user                                        │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                                                                          │
    └─────────────────────────────────┬───────────────────────────────────────┘
                                      │ 2. Publish message
                                      ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                            RabbitMQ                                      │
    │  ┌─────────────────────────────────────────────────────────────────┐    │
    │  │                      scan.queue                                  │    │
    │  │                                                                  │    │
    │  │  Message: {                                                      │    │
    │  │    event_type: "SCAN_REQUESTED",                                │    │
    │  │    payload: { scan_job_id, source_id, user_id }                 │    │
    │  │  }                                                              │    │
    │  └─────────────────────────────────────────────────────────────────┘    │
    └─────────────────────────────────┬───────────────────────────────────────┘
                                      │ 3. Consume message
                                      ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                          SCAN-WORKER                                     │
    │                                                                          │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Worker.process_scan()                                             │   │
    │  │                                                                   │   │
    │  │  1. Update job status → 'scanning'                               │   │
    │  │  2. Load source config (decrypt OAuth tokens)                    │   │
    │  │  3. Initialize appropriate scanner (GoogleDrive/LocalFS)         │   │
    │  │  4. Connect to source                                            │   │
    │  │  5. Begin file enumeration                                       │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │                              │ 4. Scan files                             │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Scanner.scan() - yields FileInfo objects                          │   │
    │  │                                                                   │   │
    │  │  FOR EACH file in source:                                        │   │
    │  │    - Extract metadata (name, size, mime_type, dates)             │   │
    │  │    - Calculate hash (for local files)                            │   │
    │  │    - Check if file exists in DB                                  │   │
    │  │    - INSERT or UPDATE kms_files record                           │   │
    │  │    - Update scan job progress                                    │   │
    │  │    - YIELD file for next stage                                   │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │                              │ 5. Batch publish                          │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Publisher.batch_publish()                                         │   │
    │  │                                                                   │   │
    │  │  Every 100 files:                                                │   │
    │  │    - Publish batch to embed.queue                                │   │
    │  │    - Update job.files_processed                                  │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │                              │ 6. Complete scan                          │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Finalize                                                          │   │
    │  │                                                                   │   │
    │  │  1. Update job status → 'completed'                              │   │
    │  │  2. Update source.last_scan_at                                   │   │
    │  │  3. Update source statistics (total_files, total_size)           │   │
    │  │  4. Send completion webhook (if configured)                      │   │
    │  │  5. ACK message to RabbitMQ                                      │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    └─────────────────────────────────┬───────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
    ┌───────────────────────────┐       ┌───────────────────────────┐
    │       PostgreSQL          │       │       RabbitMQ            │
    │                           │       │                           │
    │  kms_scan_jobs (updated)  │       │  embed.queue (populated)  │
    │  kms_files (inserted)     │       │                           │
    │  kms_sources (updated)    │       │                           │
    └───────────────────────────┘       └───────────────────────────┘
```

---

## Sequence Diagram

```
User        kms-api       PostgreSQL      RabbitMQ      scan-worker     GoogleDrive
  │            │              │              │              │               │
  │─POST scan──►              │              │              │               │
  │            │──INSERT job──►              │              │               │
  │            │              │              │              │               │
  │            │─────────────────publish────►│              │               │
  │            │              │              │              │               │
  │◄──job_id───│              │              │              │               │
  │            │              │              │──consume────►│               │
  │            │              │              │              │               │
  │            │              │◄─update job─│              │               │
  │            │              │              │              │               │
  │            │              │              │              │──connect─────►│
  │            │              │              │              │◄─files list──│
  │            │              │              │              │               │
  │            │              │              │              │ (loop)        │
  │            │              │◄─insert file─│              │               │
  │            │              │              │              │               │
  │            │              │              │◄─batch pub──│               │
  │            │              │              │              │               │
  │            │              │◄─complete───│              │               │
  │            │              │              │              │               │
```

---

## Message Formats

### SCAN_REQUESTED (scan.queue)

```json
{
  "event_type": "SCAN_REQUESTED",
  "correlation_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-01-07T10:00:00Z",
  "version": "1.0",
  "payload": {
    "scan_job_id": "550e8400-e29b-41d4-a716-446655440001",
    "source_id": "550e8400-e29b-41d4-a716-446655440002",
    "source_type": "google_drive",
    "user_id": "550e8400-e29b-41d4-a716-446655440003",
    "options": {
      "incremental": true,
      "include_hidden": false
    }
  }
}
```

### FILE_DISCOVERED (embed.queue)

```json
{
  "event_type": "FILE_DISCOVERED",
  "correlation_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-01-07T10:00:05Z",
  "version": "1.0",
  "payload": {
    "file_id": "550e8400-e29b-41d4-a716-446655440010",
    "scan_job_id": "550e8400-e29b-41d4-a716-446655440001",
    "source_id": "550e8400-e29b-41d4-a716-446655440002",
    "source_file_id": "1ABC123xyz",
    "user_id": "550e8400-e29b-41d4-a716-446655440003",
    "name": "Q4_Report.pdf",
    "path": "/Finance/Reports/Q4_Report.pdf",
    "mime_type": "application/pdf",
    "size_bytes": 1048576,
    "hash_sha256": "abc123def456..."
  }
}
```

---

## Database Operations

### Create Scan Job

```sql
INSERT INTO kms_scan_jobs (
    id, source_id, user_id, scan_type, status
)
VALUES ($1, $2, $3, $4, 'pending')
RETURNING id;
```

### Update Job Progress

```sql
UPDATE kms_scan_jobs
SET
    status = 'scanning',
    progress = $2,
    files_found = $3,
    files_processed = $4,
    current_path = $5,
    started_at = COALESCE(started_at, NOW())
WHERE id = $1;
```

### Upsert File Record

```sql
INSERT INTO kms_files (
    id, source_id, user_id, source_file_id,
    name, path, mime_type, size_bytes, hash_sha256,
    source_created_at, source_modified_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
ON CONFLICT (source_id, source_file_id)
DO UPDATE SET
    name = EXCLUDED.name,
    path = EXCLUDED.path,
    size_bytes = EXCLUDED.size_bytes,
    source_modified_at = EXCLUDED.source_modified_at,
    updated_at = NOW()
WHERE kms_files.source_modified_at < EXCLUDED.source_modified_at
RETURNING id, (xmax = 0) AS is_new;
```

### Complete Scan Job

```sql
UPDATE kms_scan_jobs
SET
    status = 'completed',
    progress = 100,
    completed_at = NOW()
WHERE id = $1;

UPDATE kms_sources
SET
    last_scan_at = NOW(),
    total_files = (SELECT COUNT(*) FROM kms_files WHERE source_id = $1 AND is_deleted = false),
    total_size_bytes = (SELECT COALESCE(SUM(size_bytes), 0) FROM kms_files WHERE source_id = $1 AND is_deleted = false)
WHERE id = $1;
```

---

## Incremental Scanning

### Strategy

```
IF last_scan_at IS NOT NULL THEN
    Query only files modified after last_scan_at
    Compare with existing records
    Mark missing files as deleted
ELSE
    Full scan of all files
```

### Detecting Deleted Files

```sql
-- Mark files that weren't seen in this scan as deleted
UPDATE kms_files
SET is_deleted = true, deleted_at = NOW()
WHERE source_id = $1
  AND indexed_at < $2  -- Before this scan started
  AND is_deleted = false;
```

---

## Error Handling

### Recoverable Errors

| Error | Action | Retry |
|-------|--------|-------|
| Rate limit (429) | Exponential backoff | Yes, 3x |
| Network timeout | Wait and retry | Yes, 3x |
| Token expired | Refresh token | Yes, 1x |

### Fatal Errors

| Error | Action | Retry |
|-------|--------|-------|
| Auth failed (after refresh) | Fail job, mark source error | No |
| Source not found | Fail job | No |
| Database error | Fail job, send to DLQ | Manual |

### Error Recording

```sql
UPDATE kms_scan_jobs
SET
    status = 'failed',
    error_message = $2,
    completed_at = NOW()
WHERE id = $1;
```

---

## Performance Optimization

### Batch Processing

```python
BATCH_SIZE = 100

files_batch = []
for file_info in scanner.scan():
    files_batch.append(file_info)

    if len(files_batch) >= BATCH_SIZE:
        # Batch insert to PostgreSQL
        await db.insert_many(files_batch)
        # Batch publish to queue
        await queue.publish_batch(files_batch)
        files_batch = []
```

### Connection Pooling

```python
# Scanner maintains single connection
async with scanner.connect() as connection:
    async for file in connection.list_files():
        yield file
```

### Parallel Processing

```python
# Multiple scan workers can run concurrently
# Each processes different sources
# prefetch_count = 1 ensures one scan per worker
```

---

## Monitoring

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `scan_jobs_active` | Active scan jobs | > 10 |
| `scan_files_per_minute` | Files processed | < 100 |
| `scan_errors_total` | Total errors | > 5/hour |
| `scan_queue_depth` | Queue backlog | > 50 |

### Logging

```json
{
  "level": "info",
  "service": "scan-worker",
  "event": "file_indexed",
  "scan_job_id": "...",
  "file_id": "...",
  "file_name": "Q4_Report.pdf",
  "duration_ms": 15
}
```

