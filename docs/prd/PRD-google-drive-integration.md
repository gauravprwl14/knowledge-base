# PRD: Google Drive Integration

## Status

`Draft`

**Created**: 2026-03-17
**Parent PRD**: [PRD-M02-source-integration.md](./PRD-M02-source-integration.md)
**Milestone**: M2 (Weeks 5–8)
**Sprints**: Sprint 3 (OAuth + Connection), Sprint 4 (File Scanning)
**Depends on**: M01 (Auth), M00 (Infrastructure)

---

## Overview

This PRD scopes the Google Drive-specific implementation within M2. It covers the OAuth 2.0 flow, encrypted token storage, Drive API file listing, and the scan-worker integration. The local folder connector is covered by the parent PRD; this document focuses exclusively on Google Drive.

---

## Goals

1. Users can connect their Google Drive via OAuth in under 60 seconds.
2. OAuth tokens are stored encrypted at rest; plaintext tokens never touch the DB.
3. A scan job discovers all Drive files and indexes metadata into `kms_files`.
4. Incremental re-scans only process files changed since the last scan.
5. Token refresh is transparent — users are not prompted to re-authenticate unless the refresh token is revoked.

---

## User Stories

| As a... | I want to... | So that... |
|---------|-------------|-----------|
| User | Click "Connect Google Drive" | KMS starts an OAuth flow in my browser |
| User | Grant KMS read-only access to Drive | KMS can list and read my files |
| User | See my Drive listed as "Connected" | I know the connection succeeded |
| User | Click "Scan Now" | KMS discovers all my Drive files |
| User | See file count and status after scan | I know how many files were indexed |
| User | Disconnect Drive | KMS removes the source and all its file records |
| User | Re-connect after token expiry | OAuth re-runs; tokens are refreshed transparently where possible |

---

## API Design

### OAuth Endpoints (kms-api)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/auth/google | Initiate OAuth — returns redirect URL |
| GET | /api/v1/auth/google/callback | Exchange code, encrypt + store tokens, redirect to /drive |

### Sources Endpoints (kms-api)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/sources | Create Google Drive source record |
| GET | /api/v1/sources | List user's sources with status |
| GET | /api/v1/sources/:id/status | Poll scan progress + token validity |
| POST | /api/v1/sources/:id/scan | Trigger full or incremental scan |
| GET | /api/v1/sources/:id/scan-history | Past scan jobs |
| DELETE | /api/v1/sources/:id | Disconnect source + cascade-delete files |

### Files Endpoints (kms-api)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/files | List files (cursor-based pagination, filter by sourceId) |
| GET | /api/v1/files/:id | Get file detail |

---

## Database Schema

```sql
-- Source record (one per connected Drive account)
CREATE TABLE kms_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,                -- references auth_users(id)
    type VARCHAR(20) NOT NULL,            -- 'google_drive' | 'local'
    name VARCHAR(255) NOT NULL,
    config_json JSONB NOT NULL DEFAULT '{}', -- { google_token_encrypted, drive_email }
    status VARCHAR(20) DEFAULT 'idle',    -- idle | scanning | completed | error
    last_scanned_at TIMESTAMPTZ,
    file_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scan job log
CREATE TABLE kms_scan_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES kms_sources(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'queued', -- queued | running | completed | failed
    scan_type VARCHAR(20) DEFAULT 'full', -- full | incremental
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    files_discovered INT DEFAULT 0,
    files_failed INT DEFAULT 0,
    error_message TEXT
);

-- File metadata (one row per Drive file)
CREATE TABLE kms_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES kms_sources(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    drive_file_id VARCHAR(255) NOT NULL,  -- Google Drive file ID
    name VARCHAR(1024) NOT NULL,
    mime_type VARCHAR(255),
    size_bytes BIGINT,
    web_view_link TEXT,
    checksum_sha256 VARCHAR(64),
    status VARCHAR(20) DEFAULT 'discovered', -- discovered | indexed | failed
    drive_modified_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_id, drive_file_id)
);
```

---

## Token Encryption

- Algorithm: AES-256-GCM
- Key source: `API_KEY_ENCRYPTION_SECRET` environment variable (≥ 32 bytes)
- Storage: encrypted blob stored in `kms_sources.config_json.google_token_encrypted`
- Plaintext tokens exist only in memory during the OAuth callback and when making API calls
- Auto-refresh: `TokenEncryptionService` wraps `googleapis` OAuth2 client; re-encrypts and stores updated tokens after each refresh

---

## Scan Worker Design

```
kms.scan queue → ScanHandler → GoogleDriveConnector → FileSyncService → kms_files
                                     ↓
                              kms.embed queue (FileDiscoveredMessage per file)
                              kms.dedup queue (DedupCheckMessage per file)
```

Key behaviours:
- Full scan: list all files via Drive API v3 with `pageToken` pagination
- Incremental scan: pass `modifiedTime > last_scanned_at` filter to Drive API
- Rate limiting: exponential backoff (initial 1s, max 32s) on HTTP 429 from Drive API
- Error handling: `nack(requeue=True)` for transient errors (rate limit, network); `reject()` for terminal errors (token revoked, source deleted)
- File status: each discovered file is upserted into `kms_files` with `status = 'discovered'`

---

## Out of Scope

- Shared Drive (Google Workspace Team Drives) — post-MVP
- Google Docs native export (handled in M03 content extraction)
- Real-time change notifications via Drive webhooks — post-MVP
- Automatic scheduled scans — post-MVP
- Obsidian vault sync — M12

---

## Success Metrics

| Metric | Target |
|--------|--------|
| OAuth flow completion time | < 60 seconds |
| Scan throughput (Drive files/min) | ≥ 500 files/min |
| Token plaintext exposure | Zero (never written to DB or logs) |
| Incremental scan skips unchanged files | 100% (by SHA-256 or modifiedTime) |
| Drive API 429 handling | Zero scan failures from rate limits |
| Files visible in UI after scan | < 5 seconds after scan completes |

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `KBSRC0001` | 404 | Source not found |
| `KBSRC0002` | 409 | Source already connected for this user |
| `KBSRC0003` | 400 | Invalid source type |
| `KBSRC0005` | 400 | Scan already in progress |
| `KBSRC0010` | 401 | Google OAuth token expired — user must reconnect |
| `KBSRC0011` | 429 | Google Drive rate limit hit — retry with backoff |

---

## Testing Plan

| Test Type | Scope | Key Cases |
|-----------|-------|-----------|
| Unit | `TokenEncryptionService` | Encrypt/decrypt round-trip, wrong key rejects |
| Unit | `GoogleDriveConnector` | pageToken pagination, 429 backoff, auth error handling |
| Unit | `ScanHandler` | nack vs reject routing, progress Redis updates |
| Integration | OAuth callback endpoint | Code exchange, encrypted token stored, source record created |
| Integration | POST /sources/:id/scan | Message published to kms.scan queue |
| E2E | Full Drive scan | Connect → scan → files in GET /files |

---

## ADR Links

- [ADR-0006](../architecture/decisions/0006-aio-pika-over-celery.md) — aio-pika for scan-worker AMQP
- [ADR-0007](../architecture/decisions/0007-structlog-over-loguru.md) — structlog for scan-worker logging
