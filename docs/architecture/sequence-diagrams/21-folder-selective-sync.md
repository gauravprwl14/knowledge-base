# Sequence Diagram 21 — Folder Selective Sync

## Overview

Shows how a user selects specific Google Drive folders to sync, how the configuration is persisted, and how the scan-worker uses `syncFolderIds` to filter Drive queries.

```mermaid
sequenceDiagram
    actor User as User (Browser)
    participant FE as Frontend (Next.js)
    participant API as kms-api (NestJS)
    participant Drive as Google Drive API (googleapis)
    participant Worker as scan-worker (Python)
    participant PG as PostgreSQL
    participant MQ as RabbitMQ

    User->>FE: Opens source settings for connected Google Drive source
    FE->>API: GET /sources/google-drive/folders?sourceId={id}&parentId=root
    API->>PG: SELECT encryptedTokens FROM kms_sources WHERE id = {id}
    PG-->>API: encryptedTokens (AES-256-GCM ciphertext)
    API->>API: Decrypt OAuth tokens (access_token, refresh_token)
    API->>Drive: files.list(q="mimeType='application/vnd.google-apps.folder' AND 'root' in parents", fields="id,name,childCount")
    Drive-->>API: [{ id, name, childCount }, ...]
    API-->>FE: 200 OK — [{ id, name, childCount }]
    FE-->>User: Renders folder tree with checkboxes

    User->>FE: Selects 2 folders, clicks Save
    FE->>API: PATCH /sources/:id/config { syncFolderIds: ["id1", "id2"], transcribeVideos: true, transcriptionMinDurationSecs: 60 }
    API->>PG: UPDATE kms_sources SET configJson = {...} WHERE id = :id
    PG-->>API: Updated row
    API-->>FE: 200 OK — updated KmsSource object
    FE-->>User: Shows "Settings saved"

    User->>FE: Clicks "Scan Now"
    FE->>API: POST /sources/:id/scan { scanType: "FULL" }
    API->>PG: INSERT INTO kms_scan_jobs (status=QUEUED, sourceId, configJson)
    PG-->>API: KmsScanJob record (id, status=QUEUED)
    API->>MQ: publish ScanJobMessage → kms.scan<br/>{ job_id, source_id, user_id, configJson: { syncFolderIds: ["id1","id2"], ... } }
    MQ-->>API: ack
    API-->>FE: 202 Accepted — { jobId, status: "QUEUED" }
    FE-->>User: Shows scan progress indicator

    MQ->>Worker: consume ScanJobMessage from kms.scan
    Worker->>Worker: Read syncFolderIds = ["id1", "id2"] from configJson

    Note over Worker,Drive: If syncFolderIds = [] (empty array), the Drive query has no parent filter<br/>— scans entire Drive. This is the default for existing sources.

    Worker->>Worker: Build Drive query:<br/>q = "trashed=false AND ('id1' in parents OR 'id2' in parents)"
    loop Paginate Drive results
        Worker->>Drive: files.list(q=filteredQuery, pageToken=..., fields="id,name,mimeType,size,webViewLink,modifiedTime")
        Drive-->>Worker: { files: [...], nextPageToken }
        Note over Worker,Drive: Files outside selected folders are never returned by Drive API
    end

    Worker->>PG: UPSERT kms_files (id, source_id, name, mime_type, size, web_view_link, ...)<br/>ON CONFLICT (source_id, drive_file_id) DO UPDATE
    PG-->>Worker: Upserted file rows

    Worker->>MQ: publish FileDiscoveredMessage → kms.embed<br/>{ file_id, source_id, user_id, ... } for each discovered file
    MQ-->>Worker: ack

    Worker->>PG: UPDATE kms_scan_jobs SET status = COMPLETED WHERE id = :job_id
    PG-->>Worker: Updated row
    Worker->>MQ: ack ScanJobMessage

    loop Frontend polling
        FE->>API: GET /sources/:id
        API->>PG: SELECT * FROM kms_sources WHERE id = :id
        PG-->>API: Source with latest scan status
        API-->>FE: 200 OK — { ..., lastScanStatus, lastScanAt }
        FE-->>User: Updates progress UI
    end
```

## Key Design Points

| Aspect | Detail |
|--------|--------|
| Token decryption | `KmsSource.encryptedTokens` stores AES-256-GCM ciphertext; decrypted in-process, never logged |
| Empty `syncFolderIds` | No `parents` filter applied — full Drive scan (backward-compatible default) |
| Drive query scope | Filter applied at Drive API level; out-of-scope files are never fetched or stored |
| Config propagation | `configJson` is included in the RabbitMQ message so scan-worker needs no extra DB read |
| Upsert strategy | `ON CONFLICT (source_id, drive_file_id)` ensures idempotent re-scans |
