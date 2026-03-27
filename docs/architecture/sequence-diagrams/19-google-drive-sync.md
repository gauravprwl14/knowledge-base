---
id: 19-google-drive-sync
created_at: 2026-03-18
content_type: sequence-diagram
status: accepted
generator_model: claude-sonnet-4-6
---

# 19 — Google Drive Sync

## Overview

After a Google Drive source is connected via OAuth, a sync can be triggered
manually (via `POST /sources/:id/sync`) or automatically by a `SyncScheduler`
cron every 5 minutes. `kms-api` creates a `kms_scan_jobs` record and publishes a
`ScanJobMessage` to `kms.scan`. The `scan-worker` decrypts OAuth tokens, lists
Drive files (with optional time filter for incremental scans), batch-upserts file
records into `kms_files`, and fans out messages to `kms.embed` and `kms.dedup`.
The `embed-worker` downloads content, chunks it, generates BGE-M3 embeddings, and
upserts to Qdrant. A separate background `SyncScheduler` cron every 25 minutes
refreshes tokens that are nearing expiry.

## Participants

| Alias | Service |
|-------|---------|
| `UC` | User / Cron (SyncScheduler) |
| `A` | kms-api |
| `MQ` | RabbitMQ |
| `SW` | scan-worker |
| `GD` | Google Drive API |
| `DB` | PostgreSQL |
| `EW` | embed-worker |
| `QD` | Qdrant |

## Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant UC as User / Cron
    participant A as kms-api
    participant MQ as RabbitMQ
    participant SW as scan-worker
    participant GD as Google Drive API
    participant DB as PostgreSQL
    participant EW as embed-worker
    participant QD as Qdrant

    UC->>A: POST /api/v1/sources/:id/sync OR SyncScheduler @Cron every 5min

    A->>DB: INSERT INTO kms_scan_jobs (source_id, user_id, status='QUEUED', scan_type=INCREMENTAL|FULL)
    DB-->>A: { scan_job_id }

    A->>MQ: publish ScanJobMessage to kms.scan (durable)
    A-->>UC: 202 Accepted { scan_job_id }

    Note over MQ,SW: Async — worker picks up when ready

    MQ-->>SW: consume ScanJobMessage
    SW->>DB: SELECT encrypted_tokens FROM kms_sources WHERE id = source_id
    DB-->>SW: { encrypted_tokens }
    SW->>SW: AES-256-GCM decrypt → OAuth2 credentials

    alt Token expiring in < 5min
        SW->>GD: POST https://oauth2.googleapis.com/token { refresh_token, grant_type }
        GD-->>SW: { access_token, expires_in }
        SW->>SW: AES-256-GCM re-encrypt new credentials
        SW->>DB: UPDATE kms_sources SET encrypted_tokens = $1 WHERE id = $2
    end

    SW->>GD: GET /drive/v3/files?pageSize=100&q=... (INCREMENTAL adds modifiedTime>'...')
    GD-->>SW: { files: [...], nextPageToken? }

    loop For each Drive file
        SW->>SW: Determine export MIME for Workspace files (Docs/Sheets/Slides)<br/>mark is_workspace_file=true, set export_mime
        SW->>DB: Batch upsert kms_files (50/batch) ON CONFLICT(source_id, external_id) DO UPDATE
        SW->>MQ: publish FileDiscoveredMessage to kms.embed
        SW->>MQ: publish DedupCheckMessage to kms.dedup
    end

    Note over MQ,EW: Async — embed-worker processes independently

    MQ-->>EW: consume FileDiscoveredMessage
    EW->>DB: UPDATE kms_files SET embed_status='PROCESSING'

    alt Regular file
        EW->>GD: GET /drive/v3/files/:id?alt=media
    else Google Workspace file
        EW->>GD: GET /drive/v3/files/:id/export?mimeType={export_mime}
    end

    GD-->>EW: file bytes

    EW->>EW: extract text → chunk (chunk_size=512, overlap=64)

    loop For each chunk batch
        EW->>EW: BGE-M3 encode_batch → dense float[1024] vectors
        EW->>QD: upsert ChunkPoints { id, vector, payload: { file_id, source_id, user_id } }
        EW->>DB: INSERT INTO kms_chunks ON CONFLICT DO NOTHING
    end

    EW->>DB: UPDATE kms_files SET embed_status='DONE', updated_at=now()
    EW->>MQ: ack message

    opt Embedding fails — retryable
        EW->>DB: UPDATE kms_files SET embed_attempts = embed_attempts + 1
        alt embed_attempts < 4
            EW->>MQ: nack(requeue=True)
        else embed_attempts >= 4
            EW->>DB: UPDATE kms_files SET embed_status='FAILED'
            EW->>MQ: reject(requeue=False) — routes to DLQ
        end
    end

    Note over A: SyncScheduler @Cron every 25min
    A->>DB: SELECT * FROM kms_sources WHERE token_expires_at < now() + interval '10min'
    loop For each expiring source
        A->>GD: POST https://oauth2.googleapis.com/token { refresh_token }
        GD-->>A: { access_token, expires_in }
        A->>A: AES-256-GCM re-encrypt
        A->>DB: UPDATE kms_sources SET encrypted_tokens = $1
    end
```

## Notes

1. **Incremental scan** passes a `modifiedTime>'...'` filter to the Drive files list API, using the `last_synced_at` timestamp of the previous scan job. Full scan omits the filter.
2. **Google Workspace files** (Docs, Sheets, Slides) cannot be downloaded directly — they are exported via the Drive export endpoint using the `export_mime` field set by scan-worker (`text/plain` for Docs, `text/csv` for Sheets).
3. **Batch upsert** uses `ON CONFLICT(source_id, external_id) DO UPDATE` so incremental scans update changed files without duplicating rows.
4. **Token refresh in scan-worker** happens inline when the current access token is within 5 minutes of expiry. The re-encrypted token is written back to `kms_sources` so the next worker that picks up a message gets fresh credentials.
5. **`embed_attempts`** is incremented per failed embed attempt. At 4 attempts the file is moved to `FAILED` status and the message is dead-lettered. This prevents infinite retry loops.
6. **SyncScheduler** in kms-api runs a separate cron every 25 minutes as a proactive sweep, refreshing tokens for any source whose access token will expire in the next 10 minutes.

## Failure Paths

| Step | Failure | Handling |
|------|---------|----------|
| Token decrypt | Corrupt credentials | `ConnectorError(retryable=False)` → `reject()` → DLQ |
| Drive API 401 | Token expired | scan-worker refreshes inline then retries |
| Drive API 403 | Quota exceeded | `ConnectorError(retryable=True)` → `nack(requeue=True)` with backoff |
| Extraction fails | Unsupported MIME / corrupt file | `ExtractionError(retryable=False)` → `reject()` → DLQ |
| BGE-M3 OOM | Model unavailable | `EmbeddingError(retryable=True)` → `nack` up to 4 attempts |
| Qdrant down | Connection error | `retryable=True` → `nack(requeue=True)` |

## Dependencies

- `kms-api`: Scan job creation, queue publish, SyncScheduler cron
- `scan-worker`: Drive file discovery, batch upsert, queue fanout
- `embed-worker`: Content extraction, BGE-M3 embedding, Qdrant upsert
- `Google Drive API`: File listing, content download, export, token refresh
- `PostgreSQL`: `kms_scan_jobs`, `kms_sources`, `kms_files`, `kms_chunks`
- `RabbitMQ`: `kms.scan`, `kms.embed`, `kms.dedup` (durable, with DLQ)
- `Qdrant`: Dense vector storage (`kms_chunks` collection, 1024-dim)
