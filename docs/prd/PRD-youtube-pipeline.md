# PRD: YouTube Transcription + Content Generation Pipeline

## Status

`Draft`

**Created**: 2026-03-27
**Author**: Gaurav (Ved)
**Reviewer**: —

---

## Business Context

Users frequently encounter valuable YouTube content (tutorials, talks, interviews, podcasts) that
they want inside their knowledge base for search and RAG. Today, importing YouTube content requires
the user to find, download, and upload files manually — a multi-step process with no content
generation benefit. This feature lets the user paste a single YouTube URL and receive: (a) a
searchable, embeddable transcript stored as a first-class KMS file, and (b) AI-generated derivative
content (blog post, LinkedIn post, Twitter thread, newsletter section, key takeaways) generated
directly from the transcript using the existing Claude integration in kms-api. When this ships,
YouTube videos become a one-click knowledge source, and the user gets immediately usable content
without leaving the product.

---

## User Stories

| As a... | I want to... | So that... |
|---------|-------------|-----------|
| Registered user | Paste a YouTube URL and have the transcript automatically extracted and indexed | I can search or ask questions over video content the same way I do with documents |
| Registered user | Monitor the status of a YouTube transcript job while it processes | I know when the content is ready without repeatedly checking |
| Registered user | Generate a blog post from a YouTube transcript with one click | I can publish content derived from videos quickly |
| Registered user | Generate LinkedIn posts, Twitter threads, and newsletter sections from a transcript | I can repurpose video content across different platforms |
| Registered user | Copy any generated content format to my clipboard | I can paste it into my publishing tool without extra steps |
| Registered user | See all my past YouTube jobs in one place | I can revisit and re-generate content from earlier videos |
| Registered user | View the raw transcript for any indexed YouTube video | I can review the source material before publishing generated content |

---

## Scope

**In scope:**
- YouTube URL validation (video URLs only — `youtube.com/watch?v=...` and `youtu.be/...`)
- Transcript extraction via `yt-dlp` using YouTube's built-in auto-captions (no video download)
- Transcript stored as a `kms_files` row with `source_type = 'youtube'` and queued for embedding
- Async job lifecycle with a status-poll endpoint
- Content generation via Claude API (already wired in kms-api) for five formats:
  - Blog post (800–1200 words, SEO-friendly)
  - LinkedIn post (200–300 words, professional tone)
  - Twitter/X thread (10 tweets, numbered)
  - Newsletter section (intro + 3 bullets + call-to-action)
  - Key takeaways / summary (5–7 bullet points)
- Frontend section "YouTube" accessible from the main nav or Files page
- Generated content displayed in the UI and copyable to clipboard
- Feature flag `features.youtubePipeline.enabled` in `.kms/config.json`

**Out of scope:**
- Live / in-progress YouTube video support (no streaming transcription)
- Video file download or media storage (no audio, no video blobs)
- Whisper-based re-transcription (yt-dlp captions are the sole transcript source for this feature)
- YouTube Data API v3 / OAuth integration (avoids quota and key management overhead)
- YouTube playlist or channel ingestion (single video URLs only)
- Custom prompt templates or system prompt editing by the user
- Scheduled / recurring YouTube sync
- Comments or metadata beyond title, channel name, and duration
- Translation of transcripts (returned in whatever language YouTube captioned)

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | `POST /api/v1/youtube/submit` — accept a YouTube URL, validate it, create a `kms_youtube_jobs` row, and kick off async extraction | Must | Returns 201 with `{ jobId, status: "QUEUED" }` immediately |
| FR-02 | `GET /api/v1/youtube/jobs/:id` — return current job status and metadata | Must | Statuses: QUEUED, PROCESSING, COMPLETED, FAILED |
| FR-03 | `GET /api/v1/youtube/jobs` — paginated list of the user's YouTube jobs, sorted newest-first | Must | Default page size 20; filter by status |
| FR-04 | YouTube worker (`services/youtube-worker/`) extracts the transcript using `yt-dlp --write-auto-subs --skip-download --sub-format vtt` and converts VTT to plain text | Must | Runs as a RabbitMQ consumer on `kms.youtube` queue |
| FR-05 | On successful extraction: create a `kms_files` row (`source_type = 'youtube'`, `mime_type = 'text/plain'`), store transcript text, update job to COMPLETED, publish to `kms.embed` | Must | Transcript chunks indexed via existing embed-worker |
| FR-06 | `POST /api/v1/youtube/generate-content` — accepts `{ jobId, format }` and calls Claude API to generate the requested content format | Must | `format` one of: `blog`, `linkedin`, `twitter`, `newsletter`, `takeaways` |
| FR-07 | Content generation returns the full generated text in the response body (sync, non-streaming) | Must | p95 < 15 s; Claude Haiku or Sonnet configurable |
| FR-08 | Failed jobs (network error, no captions available, private video) must set `error_msg` on the job row and not leave dangling `kms_files` rows | Must | |
| FR-09 | YouTube jobs are scoped to the authenticated user; cross-user access returns 404 | Must | Matches existing pattern for kms_files and kms_voice_jobs |
| FR-10 | All endpoints require JWT authentication | Must | |
| FR-11 | Frontend "YouTube" section in sidebar or Files page: URL input field, job list, status badge, transcript viewer, generate-content panel, copy-to-clipboard per format | Must | |
| FR-12 | Duplicate URL detection: if the same user submits a URL that is already COMPLETED, return the existing job rather than re-processing | Should | Reduces yt-dlp calls and duplicate kms_files rows |
| FR-13 | Job timeout: mark jobs still in PROCESSING after 10 minutes as FAILED | Should | Handled by a worker-side timeout, not a cron job |
| FR-14 | `DELETE /api/v1/youtube/jobs/:id` — soft-delete the job row and the associated `kms_files` row and its Qdrant vectors | Could | Follows the existing files delete pattern |

---

## Non-Functional Requirements

| Concern | Requirement |
|---------|-------------|
| Performance | `POST /youtube/submit` responds in < 200 ms (async dispatch). Content generation p95 < 15 s. Transcript extraction p95 < 30 s for videos up to 60 min. |
| Security | All endpoints require JWT. Validate YouTube URL server-side before queuing — reject non-YouTube domains. No user-supplied data interpolated into shell commands; use `yt-dlp` Python API or subprocess arg list (never shell=True). |
| Scalability | YouTube worker scales horizontally; `prefetchCount = 1` per instance (same as voice-app). Queue max length configurable. |
| Availability | If `yt-dlp` extraction fails (no captions), job moves to FAILED with a clear `error_msg`; the system does not retry indefinitely. |
| Data retention | Transcript text stored in `kms_files` / `kms_chunks` — follows existing retention policy. Generated content is ephemeral (response only, not persisted). |
| Observability | OTel spans on: URL validation, yt-dlp extraction, kms_files insert, kms.embed publish, Claude API call. Structured logs on all lifecycle transitions. |

---

## Data Model Changes

The existing schema needs one new table and one enum extension. All changes are
backward-compatible (additive only).

### New enum value

```sql
-- Extend SourceType enum to support youtube as a virtual source
ALTER TYPE "SourceType" ADD VALUE 'YOUTUBE';
```

> In Prisma: add `YOUTUBE` to the `SourceType` enum. A dedicated `KmsSource` row
> is created per user (type = YOUTUBE) to act as the virtual bucket for all
> YouTube-derived files — matching the existing per-user `LOCAL` / `GOOGLE_DRIVE`
> source model.

### New table: kms_youtube_jobs

```sql
CREATE TABLE kms_youtube_jobs (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL,
    url               TEXT        NOT NULL,
    video_id          VARCHAR(20) NOT NULL,        -- extracted YouTube video ID
    title             VARCHAR(512),                -- from yt-dlp metadata
    channel_name      VARCHAR(255),                -- from yt-dlp metadata
    duration_seconds  INTEGER,                     -- from yt-dlp metadata
    language          VARCHAR(10),                 -- detected caption language
    status            VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
    --   QUEUED | PROCESSING | COMPLETED | FAILED
    kms_file_id       UUID        REFERENCES kms_files(id) ON DELETE SET NULL,
    error_msg         TEXT,
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kms_youtube_jobs_user_id     ON kms_youtube_jobs (user_id);
CREATE INDEX idx_kms_youtube_jobs_user_status ON kms_youtube_jobs (user_id, status);
CREATE INDEX idx_kms_youtube_jobs_video_id    ON kms_youtube_jobs (user_id, video_id);
-- The (user_id, video_id) index enables fast duplicate detection
```

### Prisma model (equivalent)

```prisma
model KmsYoutubeJob {
  id              String    @id @default(uuid()) @db.Uuid
  userId          String    @map("user_id") @db.Uuid
  url             String    @db.Text
  videoId         String    @map("video_id") @db.VarChar(20)
  title           String?   @db.VarChar(512)
  channelName     String?   @map("channel_name") @db.VarChar(255)
  durationSeconds Int?      @map("duration_seconds")
  language        String?   @db.VarChar(10)
  status          String    @default("QUEUED") @db.VarChar(20)
  kmsFileId       String?   @map("kms_file_id") @db.Uuid
  errorMsg        String?   @map("error_msg") @db.Text
  startedAt       DateTime? @map("started_at")
  completedAt     DateTime? @map("completed_at")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  file KmsFile? @relation(fields: [kmsFileId], references: [id])

  @@index([userId])
  @@index([userId, status])
  @@index([userId, videoId])
  @@map("kms_youtube_jobs")
}
```

### kms_files changes

No schema changes required. New YouTube transcripts are stored using the existing
`kms_files` structure with these field mappings:

| kms_files field | YouTube value |
|----------------|---------------|
| `source_id`    | UUID of the user's YOUTUBE KmsSource row |
| `name`         | `<video_title>.txt` |
| `path`         | `youtube/<video_id>/transcript.txt` (logical path, not filesystem) |
| `mime_type`    | `text/plain` |
| `size_bytes`   | byte length of transcript text |
| `external_id`  | YouTube video ID (e.g. `dQw4w9WgXcQ`) |
| `web_view_link`| `https://www.youtube.com/watch?v=<video_id>` |
| `metadata`     | `{ "source_type": "youtube", "channel": "...", "duration_seconds": N }` |
| `status`       | PENDING → INDEXED (follows normal embed-worker lifecycle) |

---

## API Contract

All endpoints are prefixed `/api/v1` and require a valid JWT in the `Authorization: Bearer <token>` header.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/youtube/submit` | JWT | Submit a YouTube URL for transcript extraction |
| GET | `/api/v1/youtube/jobs` | JWT | List the user's YouTube jobs (paginated) |
| GET | `/api/v1/youtube/jobs/:id` | JWT | Get job status and metadata |
| DELETE | `/api/v1/youtube/jobs/:id` | JWT | Delete a job and its associated kms_files row |
| POST | `/api/v1/youtube/generate-content` | JWT | Generate formatted content from a completed job's transcript |

### POST /api/v1/youtube/submit

**Request body:**
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "collectionId": "optional-uuid"
}
```

**Response 201:**
```json
{
  "jobId": "uuid",
  "videoId": "dQw4w9WgXcQ",
  "status": "QUEUED",
  "queuedAt": "2026-03-27T10:00:00Z"
}
```

**Error cases:**
- `400 KBYOU0001` — invalid or non-YouTube URL
- `400 KBYOU0002` — URL is a playlist, channel, or short (not a single video)
- `409 KBYOU0003` — duplicate video already COMPLETED for this user (returns existing job)
- `401` — missing or invalid JWT

### GET /api/v1/youtube/jobs

**Query params:** `status?`, `page?` (default 1), `limit?` (default 20)

**Response 200:**
```json
{
  "jobs": [
    {
      "jobId": "uuid",
      "videoId": "dQw4w9WgXcQ",
      "title": "Never Gonna Give You Up",
      "channelName": "Rick Astley",
      "durationSeconds": 213,
      "status": "COMPLETED",
      "kmsFileId": "uuid-or-null",
      "createdAt": "2026-03-27T10:00:00Z",
      "completedAt": "2026-03-27T10:00:45Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

### GET /api/v1/youtube/jobs/:id

**Response 200:** Single job object (same shape as list item above, plus `errorMsg` and `language`)

**Error cases:**
- `404 KBYOU0004` — job not found or belongs to a different user

### POST /api/v1/youtube/generate-content

**Request body:**
```json
{
  "jobId": "uuid",
  "format": "blog"
}
```

`format` must be one of: `blog` | `linkedin` | `twitter` | `newsletter` | `takeaways`

**Response 200:**
```json
{
  "jobId": "uuid",
  "format": "blog",
  "content": "...(full generated text)...",
  "generatedAt": "2026-03-27T10:01:30Z"
}
```

**Error cases:**
- `400 KBYOU0005` — invalid format value
- `400 KBYOU0006` — job is not yet COMPLETED
- `404 KBYOU0004` — job not found
- `503 KBYOU0007` — Claude API unavailable or ANTHROPIC_API_KEY not configured
- `422 KBYOU0008` — transcript too short to generate meaningful content (< 100 words)

---

## Architecture

### Component Placement Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where does yt-dlp run? | New `services/youtube-worker/` Python microservice (FastAPI + AMQP consumer) | Keeps Python dependency isolation clean; voice-app is Whisper-specific. The youtube-worker pattern mirrors voice-app exactly, reusing the same AMQP consumer skeleton, structlog, and OTel wiring. |
| Sync or async transcript extraction? | Async via RabbitMQ queue `kms.youtube` | yt-dlp makes an outbound HTTP request; latency is variable (2–30 s). Blocking the HTTP handler would time out on slow connections. Matches the voice-app / scan-worker precedent. |
| Where does content generation run? | kms-api `YoutubeModule` calls Claude API directly (same pattern as `AnthropicAdapter` in ACP module) | kms-api already holds `ANTHROPIC_API_KEY`, has the `AnthropicAdapter` pattern, and content generation is a synchronous request-response (no streaming required for v1). Adding it to rag-service would require cross-service auth and adds latency. |
| How is the transcript stored? | As a `kms_files` row (mime_type=text/plain, source_type=youtube) linked to the youtube job via `kmsFileId` | Transcripts benefit from the full pipeline: chunking, embedding, deduplication, search, RAG. Reusing `kms_files` means zero changes to search-api, embed-worker, or RAG. |
| Transcript extraction method | `yt-dlp --write-auto-subs --skip-download` (captions only, no video) | Avoids downloading potentially large video files; respects bandwidth constraints; no YouTube API key required; auto-captions available on >90% of public videos. |
| Job persistence | New `kms_youtube_jobs` table | Separate from `kms_workflow_jobs` (which is URL-ingest / web scrape). YouTube jobs have domain-specific fields (videoId, channel, duration) and a different lifecycle from generic URL ingestion. |
| Frontend placement | New `/youtube` route in the sidebar | Clean separation of concerns; avoids overloading the Files page. Can be refactored to a tab later. |

### System Topology

```
Browser / Frontend (Next.js :3000)
      |
      | POST /api/v1/youtube/submit
      v
kms-api (NestJS :8000)
  YoutubeModule
    YoutubeController
    YoutubeService
    ├── validates URL
    ├── creates kms_youtube_jobs row (status=QUEUED)
    ├── ensures YOUTUBE KmsSource row exists for user
    └── publishes YoutubeJobMessage → RabbitMQ: kms.youtube
      |
      | (async)
      v
youtube-worker (FastAPI :8005 / AMQP consumer)
  YoutubeHandler
    ├── yt-dlp: extract VTT captions + metadata
    ├── VTT → plain text converter
    ├── HTTP PATCH kms-api /internal/youtube/complete
    │     ├── INSERT kms_files (mime_type=text/plain, source_type=youtube)
    │     ├── UPDATE kms_youtube_jobs (status=COMPLETED, kms_file_id=...)
    │     └── PUBLISH TranscriptReadyMessage → RabbitMQ: kms.embed
    └── on error: HTTP PATCH kms-api /internal/youtube/fail
          └── UPDATE kms_youtube_jobs (status=FAILED, error_msg=...)

embed-worker (existing Python service)
  ├── receives TranscriptReadyMessage from kms.embed
  ├── chunks transcript text (512 tokens, 64 overlap)
  ├── BGE-M3 embeddings → Qdrant
  └── UPDATE kms_files status=INDEXED

Browser → POST /api/v1/youtube/generate-content
      |
      v
kms-api YoutubeService
  ├── loads transcript text from kms_files (via kmsFileId on the job)
  └── calls AnthropicAdapter.generateContent(transcript, format)
        └── Claude API (claude-sonnet-4-5 or configured model)
              └── returns formatted content text
```

### Internal Callback Endpoints (kms-api only, not exposed publicly)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/internal/youtube/complete` | Called by youtube-worker on success — creates kms_files row and publishes to kms.embed |
| POST | `/internal/youtube/fail` | Called by youtube-worker on failure — marks job FAILED with error_msg |

These endpoints are on a separate internal router (no Swagger, no public auth guard). Access is
restricted to the Docker internal network via Nginx `deny all` on the public listener, matching
the pattern used by the voice-app internal webhook.

---

## Sequence Flow

### Happy Path — Transcript Extraction

```
User          Frontend        kms-api         RabbitMQ        youtube-worker  embed-worker
 |               |               |               |                  |               |
 |--paste URL--->|               |               |                  |               |
 |               |--POST /submit->               |                  |               |
 |               |               |--validate URL |                  |               |
 |               |               |--INSERT       |                  |               |
 |               |               |  kms_youtube_ |                  |               |
 |               |               |  jobs QUEUED  |                  |               |
 |               |               |--PUBLISH----->|                  |               |
 |               |<--201 jobId---|               |                  |               |
 |               |               |               |--consume-------->|               |
 |               |               |               |                  |--yt-dlp run   |
 |               |               |               |                  |  (VTT caps)   |
 |               |               |               |                  |--POST /internal
 |               |               |<----- /internal/youtube/complete-|               |
 |               |               |--INSERT kms_files                |               |
 |               |               |--UPDATE job COMPLETED            |               |
 |               |               |--PUBLISH kms.embed-------------->|               |
 |               |               |               |                  |               |
 |               |               |               |                  |            chunk+embed
 |               |               |               |                  |            UPDATE INDEXED
 |               |               |               |                  |               |
 | (poll or SSE) |               |               |                  |               |
 |<--GET /jobs/:id status=COMPLETED              |                  |               |
```

### Happy Path — Content Generation

```
User          Frontend        kms-api             Claude API
 |               |               |                  |
 |--click Blog-->|               |                  |
 |               |--POST /generate-content---------> |
 |               |               |--load transcript  |
 |               |               |--POST messages--->|
 |               |               |<-- blog text -----|
 |               |<--200 content-|                   |
 |<--display-----|               |                   |
```

---

## Sequence Diagrams to Write

- [ ] `docs/architecture/sequence-diagrams/30-youtube-transcript-extraction.md`
- [ ] `docs/architecture/sequence-diagrams/31-youtube-content-generation.md`

---

## Decisions Required

| # | Question | Options | Decision | ADR |
|---|---------|---------|----------|-----|
| 1 | New `youtube-worker` service or extend `voice-app`? | New service / Extend voice-app | **New service** — voice-app is Whisper-specific; youtube-worker has no audio processing | ADR-0030 needed |
| 2 | Content generation sync or streaming SSE? | Sync response / SSE stream | **Sync** for v1 — simpler; p95 < 15 s is acceptable for content generation | — |
| 3 | yt-dlp captions vs. Whisper re-transcription? | yt-dlp auto-subs / Whisper on downloaded audio | **yt-dlp captions** — no video download, no GPU required, fast | ADR-0030 |
| 4 | Persist generated content or return ephemeral? | Persist in new table / Ephemeral response | **Ephemeral for v1** — avoids new table; user can regenerate cheaply | — |
| 5 | Which Claude model for content generation? | claude-haiku / claude-sonnet-4-5 | **Configurable** via `YOUTUBE_CLAUDE_MODEL` env var; default `claude-haiku-4-5` (cost/speed) | — |
| 6 | Error code namespace? | KBYOU / KBYTB | **KBYOU** — matches KB + domain abbreviation pattern | — |

---

## ADRs to Write

- [ ] [ADR-0030: youtube-worker architecture and yt-dlp transcript extraction strategy](../architecture/decisions/0030-youtube-worker-architecture.md)

---

## Feature Guides to Write

- [ ] [FOR-youtube-pipeline.md](../development/FOR-youtube-pipeline.md)

---

## Dependencies

### New External Dependencies

| Dependency | Where | Reason |
|-----------|-------|--------|
| `yt-dlp` (Python) | `services/youtube-worker/` | CLI / Python library for caption extraction without YouTube API |
| `webvtt-py` or custom VTT parser (Python) | `services/youtube-worker/` | Convert `.vtt` caption file to clean plain text |

### Existing Dependencies Used

| Dependency | Where | How used |
|-----------|-------|----------|
| `@anthropic-ai/sdk` | kms-api | Content generation via `AnthropicAdapter` pattern (already wired in ACP module) |
| `ANTHROPIC_API_KEY` env var | kms-api | Already present; no new secrets required |
| `aio-pika` | youtube-worker | RabbitMQ consumer — same pattern as voice-app |
| `structlog` | youtube-worker | Structured logging — mandatory pattern |
| `asyncpg` | youtube-worker | DB writes from worker — mandatory pattern for Python workers |
| `embed-worker` (existing) | kms.embed queue | Embedding and Qdrant indexing — zero changes required |
| `kms_files` table | kms-api / embed-worker | Transcript stored as text/plain file — zero schema changes |
| `KmsTranscriptionLink` table | kms-api | **Not used** — this links voice-app jobs; youtube uses `kms_youtube_jobs.kms_file_id` directly |

### New Environment Variables Required

| Variable | Service | Description | Required |
|---------|---------|-------------|----------|
| `YOUTUBE_WORKER_QUEUE` | youtube-worker | Queue name (default `kms.youtube`) | No (has default) |
| `KMS_API_INTERNAL_URL` | youtube-worker | Internal callback URL (default `http://kms-api:8000`) | No (has default) |
| `YOUTUBE_CLAUDE_MODEL` | kms-api | Claude model for content generation (default `claude-haiku-4-5`) | No (has default) |

> No new secrets are introduced. `ANTHROPIC_API_KEY` is already in `.env.prod`.

---

## Testing Plan

| Test Type | Scope | Coverage Target |
|-----------|-------|----------------|
| Unit — kms-api | `YoutubeService.submitUrl()`: URL validation, duplicate detection, job creation | 80% |
| Unit — kms-api | `YoutubeService.generateContent()`: format routing, transcript loading, Claude call mocked | 80% |
| Unit — kms-api | `YoutubeController`: DTO validation, 400/404/409 error paths | 80% |
| Unit — youtube-worker | VTT-to-plaintext converter: multi-speaker, timestamps stripped, dedup of repeated lines | 80% |
| Unit — youtube-worker | `YoutubeHandler`: yt-dlp success, no captions error, network timeout, internal callback retry | 80% |
| Integration — kms-api | Full submit → poll cycle against real DB (SQLite/test PG) | Key paths |
| Integration — youtube-worker | AMQP consume → yt-dlp mock → callback → DB state | Key paths |
| E2E | Submit URL → COMPLETED → generate blog post → 200 with content | Happy path + 3 error cases |

---

## Rollout

| Item | Value |
|------|-------|
| Feature flag | `.kms/config.json` → `features.youtubePipeline.enabled` (default `false`) |
| Requires migration | Yes — new `kms_youtube_jobs` table; SourceType enum extension |
| Requires seed data | No |
| New Docker service | Yes — `youtube-worker` added to `docker-compose.kms.yml` and `docker-compose.prod.yml` |
| Dependencies | M01 (auth), M02 (KmsSource model), M04 (embed-worker running) |
| Rollback plan | Set `features.youtubePipeline.enabled = false`. Jobs already COMPLETED remain as searchable `kms_files`. No cascade delete on rollback. |

---

## Linked Resources

- Architecture: `docs/architecture/ENGINEERING_STANDARDS.md`
- Prior transcription work: [PRD-M08-transcription.md](./PRD-M08-transcription.md)
- Existing voice-app skeleton: `services/voice-app/` (mirror structure for youtube-worker)
- Existing AnthropicAdapter: `kms-api/src/modules/acp/external-agent/anthropic.adapter.ts`
- Existing workflow service (async job pattern): `kms-api/src/modules/workflow/workflow.service.ts`
- ADR-0028 (no BullMQ, setImmediate vs queue): `docs/architecture/decisions/0028-dual-queue-boundary.md`
