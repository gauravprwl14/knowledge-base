# Sequence Diagram 25 — Source Disconnect & Clear Data

**Flow**: Two paths — disconnect only (keeps indexed files) vs. disconnect + clear all data (wipes files, vectors, Redis tokens)

```mermaid
sequenceDiagram
    actor User as User (browser)
    participant FE as Frontend (Next.js)
    participant API as kms-api (NestJS)
    participant PG as PostgreSQL
    participant QD as Qdrant
    participant RD as Redis

    rect rgb(230, 245, 255)
        Note over User,FE: Flow A — Disconnect Only (no data clear)
        User->>FE: Click "Disconnect" on source card
        FE->>User: Confirmation modal:<br/>"Disconnect only? Your indexed files will remain searchable."
        User->>FE: Confirm
        FE->>API: DELETE /sources/:id
        API->>PG: SELECT * FROM kms_sources WHERE id = :id AND userId = :userId
        alt source not found or wrong user
            PG-->>API: 0 rows
            API-->>FE: 404 Not Found
        else ownership validated
            PG-->>API: source record
            API->>PG: UPDATE kms_sources SET status = 'DISCONNECTED' WHERE id = :id
            API->>PG: UPDATE kms_sources SET encryptedTokens = NULL WHERE id = :id
            Note over PG: OAuth tokens deleted for security —<br/>re-auth required to reconnect
            API-->>FE: 204 No Content
            FE->>User: Remove source card from UI
            Note over PG,QD: kms_files, kms_chunks (Qdrant), kms_transcription_links remain intact<br/>Files are still fully searchable after disconnect
        end
    end

    rect rgb(255, 240, 225)
        Note over User,RD: Flow B — Disconnect + Clear All Data
        User->>FE: Click "Disconnect + Clear All Data"
        FE->>User: Double-confirm modal:<br/>"This will delete {N} indexed files and all search vectors.<br/>This cannot be undone."
        User->>FE: Type "DELETE" to confirm
        FE->>API: DELETE /sources/:id?clearData=true
        API->>PG: SELECT * FROM kms_sources WHERE id = :id AND userId = :userId
        API->>PG: UPDATE kms_sources SET status = 'DISCONNECTED', encryptedTokens = NULL WHERE id = :id
        API->>PG: INSERT INTO kms_clear_jobs<br/>(id, sourceId, userId, status='RUNNING', startedAt=now())
        API-->>FE: 202 Accepted { jobId: "clear-job-uuid" }
        Note over API: Background async job spawned (BullMQ / async task)

        rect rgb(255, 250, 235)
            Note over API,RD: Background Clear Job
            API->>PG: SELECT id FROM kms_files WHERE source_id = :sourceId<br/>(batches of 100)
            loop For each batch of 100 file_ids
                API->>PG: DELETE FROM kms_chunks WHERE file_id = ANY(batch_file_ids)
                API->>PG: DELETE FROM kms_transcription_links WHERE kms_file_id = ANY(batch_file_ids)
                API->>PG: DELETE FROM kms_voice_jobs WHERE file_id = ANY(batch_file_ids)
                API->>QD: DELETE /collections/kms_chunks/points<br/>{ filter: { must: [{ key: "file_id", match: { any: batch_file_ids } }] } }
                QD-->>API: Deletion confirmed
                Note over API,QD: PostgreSQL delete runs AFTER Qdrant confirms —<br/>prevents orphan vectors if PostgreSQL delete fails mid-batch
                API->>PG: DELETE FROM kms_files WHERE id = ANY(batch_file_ids)
                API->>PG: UPDATE kms_clear_jobs SET filesCleared = filesCleared + 100
            end
            API->>PG: DELETE FROM kms_scan_jobs WHERE source_id = :sourceId
            API->>RD: DEL kms:scan:drive_page_token:{sourceId}
            API->>RD: DEL kms:scan:last_sync:{sourceId}
            Note over RD: Delta-sync tokens cleared —<br/>next scan (if reconnected) starts fresh full scan
            API->>PG: UPDATE kms_clear_jobs<br/>SET status='DONE', finishedAt=now(),<br/>filesCleared, chunksCleared, vectorsCleared
            API->>PG: UPDATE kms_sources SET deletedAt = now() WHERE id = :sourceId
        end

        loop Poll every 2 seconds
            FE->>API: GET /sources/:id/clear-status
            API->>PG: SELECT * FROM kms_clear_jobs WHERE sourceId = :sourceId
            alt Still clearing
                API-->>FE: { status: "clearing", filesCleared: 150,<br/>totalFiles: 500, percentDone: 30 }
                FE->>User: Update progress bar
            else Done
                API-->>FE: { status: "done", filesCleared: 500,<br/>chunksCleared: 4800, vectorsCleared: 4800 }
                FE->>User: "Source disconnected. 500 files and 4,800 search vectors removed."
                FE->>User: Remove source card from UI
            end
        end
    end
```

## Notes

> **Step 9b — Qdrant batch delete**: Qdrant delete uses a payload filter on `file_id` (not point IDs) — safer for batch operations because point IDs may not be tracked in PostgreSQL, whereas `file_id` is always stored as a vector payload field.

> **Step 9d-9e — Redis delta-sync tokens**: Redis keys `kms:scan:drive_page_token:{sourceId}` and `kms:scan:last_sync:{sourceId}` are cleared so that if the source is later reconnected, the next scan starts a fresh full scan from scratch rather than attempting an incremental delta from a stale checkpoint.

> **Step 10 — Poll-based progress**: Poll-based progress (not WebSocket) keeps the implementation simple. 500 files with ~10 chunks each clear in under 5 seconds in practice, so polling at 2-second intervals provides sufficient UX feedback without the overhead of maintaining a persistent connection.

> **Step 9b — Delete ordering**: Qdrant delete runs before the corresponding PostgreSQL `kms_files` delete within each batch. This prevents orphan vectors: if the PostgreSQL delete fails mid-batch, the job can be retried and the Qdrant filter-delete is idempotent (deleting already-deleted points is a no-op).
