# Sprint 4 Board — File Scanning
**Milestone**: M2 — Google Drive Integration
**Sprint Goal**: File discovery worker processes Drive, files indexed in DB, visible in UI
**Dates**: Weeks 7–8 of project

---

## TODO

### Scan Worker (Python)
- [ ] [L] scan_worker: AMQP consumer listening on kms.scan queue
- [ ] [M] ScanJobMessage schema (sourceId, userId, scanType: full/incremental)
- [ ] [M] GoogleDriveScanner: paginate Drive API, emit file records
- [ ] [S] FileSyncService: upsert file records to DB (asyncpg)
- [ ] [S] Incremental scan: only process files changed since last_scanned_at
- [ ] [S] Handle pagination tokens (Google Drive pageToken)
- [ ] [S] Error handling: nack(requeue=True) for rate limits, reject() for auth errors
- [ ] [S] LocalFileConnector: recursive walk, SHA-256, MIME detection, skip hidden files

### Backend — Files Module
- [ ] [M] kms_files Prisma model (sourceId, userId, driveId, name, mimeType, size, webViewLink, status, checksumSha256)
- [ ] [M] FilesModule: service + controller + repository
- [ ] [S] GET /files — list files with cursor-based pagination
- [ ] [S] GET /files/:id — get file details
- [ ] [S] POST /sources/:id/scan — trigger scan job (publish to kms.scan queue)
- [ ] [S] GET /sources/:id/status — poll scan progress (reads Redis kms:scan:progress:{id})
- [ ] [S] GET /sources/:id/scan-history — list past scan jobs

### Message Queue
- [ ] [S] ScanJobPublisher: publish ScanJobMessage to kms.scan queue via RabbitMQ
- [ ] [S] Dead letter queue (kms.scan.dlq) for failed scan jobs
- [ ] [S] Redis scan lock: kms:scan:lock:{source_id} prevents concurrent scans
- [ ] [S] Redis progress tracking: kms:scan:progress:{source_id}

### Frontend — Files List
- [ ] [M] Files page (/[locale]/drive) — show scanned files
- [ ] [S] File list with name, type, size, last modified
- [ ] [S] "Scan Now" button → triggers scan → shows progress
- [ ] [S] Empty state when no files scanned yet
- [ ] [S] Pagination (load more)
- [ ] [S] Scan progress indicator (live polling)

### Infrastructure
- [ ] [M] services/scan-worker/ Docker setup (Dockerfile + requirements.txt)
- [ ] [S] Add scan-worker to docker-compose.kms.yml
- [ ] [S] Add AMQP_URL, PYTHONPATH to scan-worker env

---

## IN PROGRESS

(empty — sprint not started)

---

## DONE

(empty — sprint not started)

---

## Blocked / Risks
| Risk | Impact | Mitigation |
|------|--------|-----------|
| Google Drive API pagination for 10k+ files | High | Use pageToken, stream results, never load all in memory |
| scan-worker auth token expiry mid-scan | High | Refresh token before each API call; reject() message if token invalid |
| RabbitMQ message ordering | Low | Scans are idempotent; ordering not required |

---

## Definition of Done (Sprint 4)
- [ ] Scan worker processes files from a real Google Drive
- [ ] Files appear in kms_files table after scan
- [ ] GET /files returns paginated file list
- [ ] Frontend shows files from Drive
- [ ] Worker handles errors gracefully (rate limits, auth failures)
- [ ] Incremental scan skips unchanged files (same SHA-256)
- [ ] Integration test: trigger scan → verify files in DB
- [ ] Dead letter queue configured and tested
