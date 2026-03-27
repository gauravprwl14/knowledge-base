# Backlog: Scan Progress Real-Time Updates

**Type**: UX Enhancement
**Priority**: MEDIUM
**Effort**: M (2–3 days)
**Status**: Backlog — not started
**Created**: 2026-03-23

---

## Problem

When a user connects a Google Drive source and triggers a scan, the source card flips to `SCANNING` status. However, the user has no visibility into how much work has been done. There is no indication of:

- How many files have been discovered
- How many have been processed
- Estimated time remaining
- Whether the scan is making progress or stuck

This creates uncertainty and makes it difficult to distinguish a long-running scan from a broken one.

---

## Proposed Solution

Use Server-Sent Events (SSE) from `kms-api` backed by Redis pub/sub to push real-time progress counts to the frontend without requiring WebSocket infrastructure.

---

## Architecture

```
scan-worker
    │
    │  PUBLISH kms:scan:progress:{jobId}
    │  { processed: 47, total: 312, status: "SCANNING" }
    ▼
Redis pub/sub
    │
    │  SUBSCRIBE kms:scan:progress:{jobId}
    ▼
kms-api SSE endpoint
GET /sources/:id/scan-progress
    │
    │  text/event-stream
    ▼
Frontend EventSource hook
    │
    ▼
SourceCard: progress bar + "47 of 312 files"
```

---

## Required Changes

### scan-worker

- After each file is processed (or in batches of N), publish a progress event to Redis:
  ```
  PUBLISH kms:scan:progress:{jobId} '{"processed":47,"total":312,"status":"SCANNING"}'
  ```
- Publish a final event when scan completes or fails:
  ```
  PUBLISH kms:scan:progress:{jobId} '{"processed":312,"total":312,"status":"COMPLETED"}'
  ```
- `total` may be unknown at start (Drive pagination) — emit `null` until total is known, then fill it in

### kms-api: SSE endpoint

New endpoint:

```
GET /api/v1/sources/:id/scan-progress
```

- Auth: JWT required
- Response: `Content-Type: text/event-stream`
- kms-api subscribes to `kms:scan:progress:{jobId}` for the given source's active job
- Streams each Redis pub/sub message as an SSE `data:` event
- Closes stream when a COMPLETED or FAILED status event is received, or after 10-minute timeout
- Returns 404 if no active scan job for the source
- Returns 200 immediately with current DB state if scan is already completed (no streaming needed)

### kms-api: Redis subscription

- Use existing Redis client (`ioredis` or NestJS `@nestjs/microservices` Redis strategy)
- One subscription per connected SSE client (cleaned up on client disconnect)
- Do not persist progress events — they are ephemeral pub/sub only

### Frontend

- `useSourceScanProgress(sourceId)` hook using native `EventSource` API
- Hook connects to `/api/v1/sources/:id/scan-progress` when source status is `SCANNING`
- Exposes `{ processed, total, percent, status }`
- Disconnects automatically on COMPLETED or FAILED event
- `SourceCard` component renders progress bar and `"{processed} of {total} files"` text when hook is active

---

## Acceptance Criteria

- [ ] `GET /sources/:id/scan-progress` SSE endpoint implemented with JWT auth
- [ ] scan-worker publishes progress events to Redis pub/sub after each file (or batch)
- [ ] Progress event includes `processed`, `total` (nullable), `status`
- [ ] Terminal events (COMPLETED, FAILED) cause SSE stream to close
- [ ] kms-api cleans up Redis subscription on client disconnect (no resource leak)
- [ ] Frontend `SourceCard` shows progress bar and file count while scanning
- [ ] Timeout: SSE connection auto-closes after 10 minutes of inactivity
- [ ] Works when multiple users scan simultaneously (no cross-user event leakage — jobId in channel name prevents this)
- [ ] Unit tests: SSE event serialization, Redis channel naming, hook state transitions
- [ ] Manual test: connect a large Drive source, watch progress update in real time

---

## Non-Functional Requirements

| Concern | Requirement |
|---------|-------------|
| Performance | SSE overhead per connected client: < 1 MB RAM. Redis pub/sub latency: < 100 ms |
| Security | SSE endpoint requires valid JWT. Channel name includes jobId (not guessable without knowing the job) |
| Graceful degradation | If Redis pub/sub is unavailable, endpoint returns 503. Frontend falls back to polling `GET /sources/:id` every 5 seconds |
| Scalability | Multiple kms-api instances: each subscribes to Redis independently — works correctly with no coordination needed |

---

## Open Decisions

| # | Question | Options | Decision |
|---|---------|---------|----------|
| 1 | Publish per-file or batched (every N files)? | Per-file (most accurate), Every 10 files (lower Redis traffic) | Every 10 files preferred |
| 2 | SSE or WebSocket? | SSE (simpler, unidirectional), WebSocket (bidirectional, overkill here) | SSE |
| 3 | Store latest progress in Redis (SETEX) as well as pub/sub? | Yes (new clients can get current state immediately), No (only live events) | Yes — SETEX with 24h TTL for late joiners |

---

## Related

- `services/scan-worker/` — where progress events will be published
- `kms-api/src/modules/sources/` — where SSE endpoint will be added
- `PRD-M02-source-integration.md` — base source scanning feature
- Redis config: `docker-compose.kms.yml` — Redis service already present
