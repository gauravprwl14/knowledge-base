# ADR-0034: Content Creator Pipeline — KMS Integration Architecture

**Date:** 2026-03-31
**Status:** Accepted
**Deciders:** Gaurav (Ved)
**Related POC:** `/content-creator-app/` — local Next.js + SQLite proof of concept

---

## Context

A working content creator proof-of-concept exists at `/content-creator-app/`. It takes a YouTube URL, extracts a transcript, and generates platform content (blog, LinkedIn, Instagram, Reels, newsletter) using Claude.

The POC has no path to production:
- **Single user, no auth** — flat JSON files, no user concept
- **SQLite + flat file persistence** — no sharing, no history across restarts
- **YouTube only** — no URL scraping, no raw video, no document support
- **Single output per platform** — no variations, no regeneration
- **No iteration** — no way to refine generated content without re-running the pipeline
- **Local only** — in-memory queue, no job recovery

The decision was whether to:
A. **Integrate into KMS** as a new content domain
B. **Build a separate standalone service** alongside KMS

---

## Decision

**Option A — Integrate into KMS as the `content` domain.**

---

## Rationale

KMS already provides every infrastructure piece the content pipeline needs:

| Need | KMS Already Has |
|------|----------------|
| Auth (JWT + Google OAuth) | AuthModule in kms-api |
| PostgreSQL | Running; add 5 new tables |
| RabbitMQ | Running; add kms.content queue |
| Voice transcription (Whisper) | services/voice-app (port 8003) |
| File extraction (PDF/DOCX) | services/scan-worker + embed-worker |
| OTel + structured logging | @kb/tracing, @kb/logger |
| Error handling patterns | @kb/errors, AppException |
| Docker Compose infrastructure | docker-compose.kms.yml |
| Frontend shell (Next.js) | Already running at port 3001 |

Building a standalone service would duplicate auth, DB, queue infrastructure, and Docker setup. Zero new infrastructure cost with KMS integration.

---

## Architecture

The content domain adds:

1. **NestJS ContentModule** (`kms-api/src/modules/content/`) — REST + SSE endpoints, job CRUD, piece editing, chat, configuration
2. **Python content-worker** (`services/content-worker/`) — AMQP consumer, 4 ingestion adapters, 8 step runners, chat handler
3. **5 new Prisma tables** — `content_jobs`, `content_pieces`, `content_configurations`, `creator_voice_profiles`, `content_chat_messages`
4. **RabbitMQ queues** — `kms.content` + `kms.content.dlx` (dead-letter) + `kms.content.retry`
5. **SourceType enum extension** — adds YOUTUBE, URL, VIDEO, DOCUMENT to existing enum

All existing KMS infrastructure (auth guards, error codes, logging, OTel spans, Docker networks) is reused unchanged.

---

## Key Design Decisions

### Content storage: PostgreSQL (not filesystem)
Generated text is stored in `content_pieces.content` (PostgreSQL `TEXT`). The POC used flat Markdown files in `outputs/`. PostgreSQL is simpler, survives restarts, supports queries, and handles multi-user isolation. Modern Postgres handles text fine.

### Variations: variation_index + is_active pattern
`content_pieces` has `variation_index` (0 = primary, 1-N = additional) and `is_active` (one active variation per platform). `@@unique([jobId, platform, format, variationIndex])` prevents duplicate generation. Active variation swap is atomic (single transaction updates all rows for the platform).

### Chat: SSE from ContentChatService → Anthropic API directly
The chat endpoint streams Claude responses directly from `ContentChatService`. The existing `rag-service` is NOT involved — content chat is a different context (concepts + voice brief + piece content, not KMS documents). Context window: concepts + voice brief + piece content + last 20 messages.

### Voice profile delivery: passed in AMQP message (not DB lookup in worker)
The user's voice profile is included in the `kms.content` message payload at job creation. This makes content-worker self-contained and avoids an extra DB roundtrip per step. The profile is snapshotted at creation time — consistent with `configSnapshot`.

### Stale job recovery: cron in kms-api
If content-worker crashes mid-pipeline, `job.updated_at` stops updating. A cron job in kms-api checks for jobs where `updated_at` is unchanged for >15 minutes and `status` is non-terminal — marks them FAILED. This is the sole recovery path for v1. The outbox pattern (TODO-008) would make job creation more resilient; worker heartbeat (TODO-014) would prevent false positives near the 15-minute threshold.

### URL ingestion: Firecrawl + SSRF-guarded fallback
Primary: Firecrawl API (production-grade scraping, handles JS-rendered pages). Fallback (when `FIRECRAWL_API_KEY` absent): `requests` + `BeautifulSoup4` with a DNS-resolving SSRF blocklist (RFC-1918, loopback, link-local, IPv6 loopback). The fallback resolves hostnames before checking — string matching alone is bypassable.

### Prompt injection defense: XML structural delimiters
External content (scraped URLs, documents, YouTube transcripts) is wrapped in `<external_content>...</external_content>` before being passed to any Claude prompt. This is the Anthropic-recommended approach. Regex filtering is not used — it is insufficient and bypassable.

### Hashnode API key: AES-256-GCM encryption
Stored in `content_configurations.hashnode_api_key_encrypted`. Encrypted with `ENCRYPTION_KEY` env var (32 bytes). Not base64-encoded — base64 is encoding, not encryption.

---

## Rejected Alternatives

### Option B: Standalone separate service
Rejected because it requires duplicating auth, DB, queue, and Docker infrastructure. Zero benefit over KMS integration for a solo operator. Creates two separate login systems and two separate databases to maintain.

### WebSocket for chat
Rejected in favor of SSE. Chat is unidirectional (server streams to client). SSE is simpler, matches the existing rag-service pattern, and requires no additional infrastructure.

### Filesystem for content storage
Rejected in favor of PostgreSQL. Filesystem storage requires path management, breaks multi-user isolation, and doesn't survive container restarts without volume mounting.

### In-process queue (like POC)
Rejected. The POC used an in-memory FIFO queue inside Next.js. This loses all queued jobs on restart. RabbitMQ with persistence is already running and provides retry, dead-lettering, and crash recovery.

---

## Consequences

**Positive:**
- Zero new infrastructure (auth, DB, queue, Docker networks all reused)
- Content pieces are queryable, shareable, and backed up with the rest of KMS data
- Variations are first-class (idempotency constraint prevents duplication)
- Chat history persists in PostgreSQL (searchable, auditable)
- Per-user configuration replaces flat JSON file

**Negative / Risks:**
- SourceType enum migration (ALTER TYPE ADD VALUE) is non-blocking on Postgres 12+ but Prisma wraps it in a transaction — test on populated DB before production deploy
- Stale job recovery depends on a cron — 15-minute window means up to 15-minute user-visible delay before FAILED status shown (acceptable for v1)
- `CONTENT_WORKER_CONCURRENCY > 1` requires distributed locking (deferred, TODO-009)

---

## Related ADRs

- ADR-0001: PostgreSQL as primary persistence layer
- ADR-0003: RabbitMQ for async work queue
- ADR-0005: NestJS as API framework
