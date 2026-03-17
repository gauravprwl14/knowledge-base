# MoSCoW Feature Breakdown — Knowledge Base System

**Version**: 1.0
**Date**: 2026-03-17
**Story Point Scale**: Fibonacci (1, 2, 3, 5, 8, 13, 21)
**1 SP ≈ 1 ideal dev-day (no interruptions)**

---

## MoSCoW Legend

| Priority | Meaning |
|----------|---------|
| **M — Must Have** | MVP blocker. Cannot ship without this. |
| **S — Should Have** | High value. Include if bandwidth allows. |
| **C — Could Have** | Nice to have. Include only if core is stable. |
| **W — Won't Have** | Explicitly out of scope for MVP. |

---

## EPIC 1: Foundation & Infrastructure

### Backend

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 1.1 | Monorepo setup (pnpm workspaces + Turbo) | M | 2 | D | Root package.json, turbo.json |
| 1.2 | Docker Compose — all 20 services | M | 5 | D | postgres, redis, rabbitmq, qdrant, neo4j, minio, ollama, nginx |
| 1.3 | docker-compose.override.yml (hot reload) | M | 2 | D | Bind mounts, dev mode |
| 1.4 | docker-compose.test.yml (testcontainers) | M | 3 | D | Isolated test env |
| 1.5 | GitHub Actions CI pipeline | M | 3 | D | Run tests on PR, coverage gate |
| 1.6 | OTel Collector + Jaeger + Prometheus + Grafana | M | 5 | D | All services instrumented from day 1 |
| 1.7 | Base Grafana dashboards (service health) | M | 3 | D | Request rate, error rate, latency |
| 1.8 | `.kms/config.json` config schema + loader | M | 5 | A | Zod schema, impact resolver, hierarchy merge |
| 1.9 | `GET /api/v1/config/features` endpoint | M | 2 | A | Feature flag API |
| 1.10 | Nginx routing config | M | 2 | D | Route to kms-api, search-api, voice-app |
| 1.11 | Alembic migrations for voice-app | M | 3 | B | Fix prototype gap — create_all → migrations |
| 1.12 | Prisma schema for kms-api (auth + kms domain) | M | 5 | A | Full schema as designed |
| 1.13 | Prisma migrations (all tables) | M | 3 | A | |
| 1.14 | Neo4j constraints + indexes setup script | M | 2 | B | Schema initialization |
| 1.15 | Qdrant collection initialization | M | 2 | B | file_embeddings collection |
| 1.16 | MinIO bucket initialization | M | 1 | D | Create buckets on startup |
| 1.17 | Health check endpoints (all services) | M | 3 | A | /health, /health/ready, /health/live |
| 1.18 | `.env.example` with all required vars | M | 1 | D | Complete environment template |
| 1.19 | `scripts/setup-dev.sh` (first-time setup) | S | 2 | D | Pull models, create buckets, seed data |
| 1.20 | Semantic release + changelog automation | C | 2 | D | Auto-version on merge to main |

**Total Foundation**: M=50 SP, S=2 SP, C=2 SP

---

## EPIC 2: Authentication & API Keys

### Backend (kms-api)

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 2.1 | User registration (email + password) | M | 3 | A | Bcrypt hash, validation |
| 2.2 | User login (JWT access + refresh) | M | 3 | A | 15min access, 7d refresh |
| 2.3 | Token refresh endpoint | M | 2 | A | Rotate refresh tokens |
| 2.4 | Change password | M | 2 | A | Old password verification |
| 2.5 | API key creation (CRUD) | M | 3 | A | Hash SHA-256, scope support |
| 2.6 | API key authentication guard | M | 3 | A | X-API-Key header |
| 2.7 | JWT authentication guard | M | 2 | A | Bearer token |
| 2.8 | Role-based access control | S | 3 | A | user vs admin |
| 2.9 | API key rotation | S | 2 | A | Generate new, invalidate old |
| 2.10 | Rate limiting (per user/key) | S | 3 | A | NestJS throttler |
| 2.11 | Audit log (auth events) | C | 3 | A | Login, key create, logout |
| 2.12 | Email verification | W | — | — | Post-MVP |
| 2.13 | OAuth (Google login) | W | — | — | Post-MVP |

**Unit tests**: 2.1–2.7 must have 80%+ coverage | **SP**: 3 SP per test suite (×7)

### Frontend

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 2.F1 | Login page (email/password) | M | 3 | C | Form validation, error states |
| 2.F2 | Register page | M | 3 | C | Password strength, confirm |
| 2.F3 | Auth context / session management | M | 3 | C | Zustand store, auto-refresh |
| 2.F4 | Protected routes (redirect to login) | M | 2 | C | Middleware |
| 2.F5 | API key management page | M | 3 | C | Create, list, revoke |
| 2.F6 | Account settings page | S | 3 | C | Change password |
| 2.F7 | `<FeatureGate>` component | M | 2 | C | Hide sections based on config |

**Total Auth**: M=36 SP, S=14 SP, C=3 SP

---

## EPIC 3: Source Management & Google Drive

### Backend

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 3.1 | Sources CRUD (kms-api) | M | 3 | A | Create, list, update, delete |
| 3.2 | Google OAuth 2.0 flow | M | 5 | A | Redirect, callback, token store |
| 3.3 | Token encryption (AES-256-GCM) | M | 3 | A | Encrypt before DB, decrypt on use |
| 3.4 | Token auto-refresh | M | 3 | A | Detect expiry, refresh silently |
| 3.5 | `BaseConnector` interface (Python) | M | 2 | B | ABC: list_files, get_content, watch |
| 3.6 | `GoogleDriveConnector` | M | 8 | B | Pagination, delta sync, retry |
| 3.7 | scan-worker RabbitMQ consumer | M | 5 | B | Consume scan.queue, update DB |
| 3.8 | File metadata extraction | M | 3 | B | name, mime, size, hash |
| 3.9 | PostgreSQL write (kms.files) | M | 3 | B | UPSERT on conflict |
| 3.10 | Publish to embed.queue | M | 2 | B | After successful scan |
| 3.11 | Scan job status API | M | 3 | A | CRUD + real-time progress |
| 3.12 | Google Drive rate limit handling | M | 5 | B | Exponential backoff, quota errors |
| 3.13 | Delta sync (modified_after) | S | 5 | B | Only sync changed files |
| 3.14 | Shared drive support | S | 3 | B | Team drives, shared folders |
| 3.15 | `LocalFSConnector` | C | 5 | B | For CLI use case |
| 3.16 | Connector health check | M | 2 | B | Test connection before scan |

**Unit tests**: 3.5, 3.6 (connector) = 5 SP | Integration: 3.7–3.11 = 5 SP

### Frontend

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 3.F1 | Sources management page | M | 3 | C | List, connect, disconnect |
| 3.F2 | "Connect Google Drive" OAuth flow | M | 5 | C | Redirect + callback + success state |
| 3.F3 | Source status indicator | M | 2 | C | Active/error/syncing badge |
| 3.F4 | Trigger scan button | M | 2 | C | Kick off manual scan |
| 3.F5 | Scan progress indicator | M | 3 | C | Poll progress, file count |
| 3.F6 | Source config editor | S | 3 | C | Sync interval, excluded paths |

**Total Sources**: M=67 SP, S=14 SP, C=5 SP

---

## EPIC 4: Voice / Audio Transcription (EXISTING PROTOTYPE INTEGRATION)

### Assessment of Prototype
- Core transcription: ✅ Working (Whisper, Groq, Deepgram)
- Audio processing: ✅ Working (FFmpeg, any format → WAV)
- Job queue: ✅ Working (RabbitMQ)
- Translation: ✅ Working (OpenAI, Gemini)
- **CRITICAL GAPS to fix**: Alembic migrations, batch completion tracking, file cleanup scheduler, KMS integration webhook

### Backend — Fix Prototype Gaps

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 4.1 | Alembic migrations (replace create_all) | M | 3 | B | Production-ready schema management |
| 4.2 | File cleanup scheduler (TTL enforcement) | M | 3 | B | APScheduler or Celery beat |
| 4.3 | KMS integration webhook | M | 5 | B | After transcription → push text to kms.files |
| 4.4 | voice.jobs.kms_file_id FK population | M | 2 | B | Link voice job to KMS file |
| 4.5 | Batch job completion tracking | S | 3 | B | Update completed_files/failed_files |
| 4.6 | Retry logic for failed transcriptions | S | 3 | B | Max 3 retries with backoff |
| 4.7 | API key creation endpoint (/admin/api-keys) | M | 2 | A | Fix manual process gap |
| 4.8 | Rate limiting (voice-app) | S | 3 | B | Per-key limits |
| 4.9 | Transcript sync to kms.files.extracted_text | M | 3 | B | Make audio searchable via KMS |
| 4.10 | Transcript embedded to Qdrant | M | 3 | B | Trigger embed-worker after sync |
| 4.11 | YouTube URL transcription (via yt-dlp) | S | 5 | B | Download → extract audio → transcribe |
| 4.12 | Voice activity detection (skip silence) | C | 3 | B | Whisper VAD filter (partially done) |

### Backend — New Voice Features

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 4.13 | KMS-triggered transcription (from file scan) | M | 5 | B | When audio/video indexed, auto-queue transcription |
| 4.14 | `GET /api/v1/voice/jobs` (in kms-api) | M | 3 | A | Proxy to voice-app for KMS context |
| 4.15 | Transcription download (TXT, JSON, SRT) | M | 1 | B | Already exists — expose in KMS |
| 4.16 | Speaker diarization | W | — | — | Post-MVP |
| 4.17 | Live/streaming transcription | W | — | — | Post-MVP |

### Frontend

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 4.F1 | Upload audio/video page (existing, refactor) | M | 5 | C | Refactor into KMS design system |
| 4.F2 | Provider + model selector | M | 3 | C | Whisper/Groq/Deepgram with feature gate |
| 4.F3 | Transcription result view | M | 3 | C | Text + segments + timestamps |
| 4.F4 | Download transcription (TXT/JSON/SRT) | M | 2 | C | Already exists — keep |
| 4.F5 | Translation panel (OpenAI/Gemini) | S | 3 | C | Already exists — refactor |
| 4.F6 | Batch upload UI | S | 3 | C | Drop multiple files |
| 4.F7 | Audio/video file preview + waveform | C | 5 | C | WaveSurfer.js |
| 4.F8 | YouTube URL input | S | 3 | C | URL field → backend yt-dlp |
| 4.F9 | Job status polling → WebSocket | S | 5 | C | Replace 5s polling |

**Total Voice**: M=47 SP, S=36 SP, C=8 SP

---

## EPIC 5: Content Extraction & Embeddings

### Backend

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 5.1 | `BaseExtractor` interface (Python ABC) | M | 2 | B | mime → extractor dispatch |
| 5.2 | PDF extractor (pymupdf) | M | 3 | B | Text + page metadata |
| 5.3 | DOCX extractor (python-docx) | M | 3 | B | Paragraphs, headings |
| 5.4 | Markdown extractor (frontmatter + body) | M | 2 | B | gray-matter equivalent |
| 5.5 | Image OCR (pytesseract) | S | 3 | B | Requires tesseract binary |
| 5.6 | XLSX extractor (openpyxl) | S | 3 | B | Cell text content |
| 5.7 | PPTX extractor (python-pptx) | S | 3 | B | Slide text |
| 5.8 | Recursive text chunker | M | 3 | B | 512 tokens, 50 overlap |
| 5.9 | Ollama embedding client | M | 3 | B | nomic-embed-text via HTTP |
| 5.10 | OpenAI embedding client | M | 3 | B | text-embedding-3-small |
| 5.11 | Provider factory (config-driven) | M | 2 | B | Switch via config |
| 5.12 | Qdrant writer (upsert vectors) | M | 3 | B | Batch upsert, payload |
| 5.13 | embed-worker RabbitMQ consumer | M | 5 | B | Consume embed.queue |
| 5.14 | Publish to graph.queue after embed | M | 2 | B | Pipeline chaining |
| 5.15 | Embedding progress tracking (DB) | M | 2 | B | Update kms.files.embedded |
| 5.16 | Re-embed on content change | S | 3 | B | Detect hash change, re-queue |
| 5.17 | GPU acceleration for Ollama | C | 2 | D | Docker GPU passthrough config |

**Unit tests**: 5.1–5.8 = 5 SP | Integration: 5.13–5.15 = 5 SP

**Total Embeddings**: M=31 SP, S=12 SP, C=4 SP

---

## EPIC 6: Search

### Backend

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 6.1 | search-api NestJS service (scaffold) | M | 3 | A | Port 8001, health, OTel |
| 6.2 | Keyword search (PostgreSQL FTS) | M | 5 | A | GIN index, ts_rank, snippets |
| 6.3 | Semantic search (Qdrant) | M | 5 | A | Embed query → vector search |
| 6.4 | Hybrid search (RRF merger) | M | 5 | A | Weighted combination |
| 6.5 | Search filters (type, source, date) | M | 3 | A | Applied to both search legs |
| 6.6 | Redis result caching (5 min TTL) | M | 3 | A | Cache key = query + filters hash |
| 6.7 | Faceted search (counts per filter) | S | 5 | A | Aggregation side-panel data |
| 6.8 | Search across notes | M | 3 | A | kms.notes FTS |
| 6.9 | Search within transcriptions | M | 2 | A | voice.transcriptions text |
| 6.10 | Graceful degrade (semantic off → keyword) | M | 2 | A | Config: embedding.disabled |
| 6.11 | Search highlighting / snippets | S | 3 | A | Highlight matched terms |
| 6.12 | Search analytics (popular queries) | C | 3 | A | Log to DB for insights |
| 6.13 | Spell correction | W | — | — | Post-MVP |

**Unit tests**: 6.2–6.6 = 5 SP | Integration (real Qdrant + PG) = 5 SP

### Frontend

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 6.F1 | Search page (replace placeholder) | M | 3 | C | Input, filters, results |
| 6.F2 | Search results list | M | 3 | C | File cards with snippet |
| 6.F3 | Source + type filters | M | 3 | C | Checkbox sidebar |
| 6.F4 | Keyword/semantic/hybrid toggle | S | 2 | C | Show search mode |
| 6.F5 | Search results highlighting | S | 2 | C | Bold matched terms |
| 6.F6 | Empty state + suggestions | M | 2 | C | "Try searching for..." |
| 6.F7 | Search in header (global) | S | 3 | C | Cmd+K shortcut |
| 6.F8 | Recent searches history | C | 2 | C | LocalStorage |

**Total Search**: M=40 SP, S=15 SP, C=5 SP

---

## EPIC 7: Knowledge Graph & Traversal

### Backend

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 7.1 | graph-worker scaffold (Python) | M | 3 | B | RabbitMQ consumer, OTel |
| 7.2 | Neo4j driver + schema init | M | 3 | B | Constraints, indexes |
| 7.3 | File/Folder hierarchy builder | M | 5 | B | IN_FOLDER relationships |
| 7.4 | spaCy NER entity extraction | M | 5 | B | Person, org, concept nodes |
| 7.5 | SIMILAR_TO edge builder | M | 5 | B | Cosine similarity > threshold |
| 7.6 | Leiden community detection | S | 8 | B | leidenalg library |
| 7.7 | Cluster label generation (LLM) | S | 3 | B | Name the cluster |
| 7.8 | Graph traversal API (search-api) | M | 5 | A | Cypher queries via REST |
| 7.9 | Path-finding endpoint | M | 5 | A | shortestPath between two nodes |
| 7.10 | Blast radius endpoint | S | 5 | A | What connects to this file |
| 7.11 | Community members endpoint | S | 3 | A | Files in same cluster |
| 7.12 | Graceful degrade (graph off → skip) | M | 2 | A | Config: graph.enabled=false |
| 7.13 | Backlink resolution (Obsidian) | S | 3 | B | [[link]] → Neo4j edge |

**Total Graph**: M=28 SP, S=27 SP, C=0 SP

### Frontend

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 7.F1 | Knowledge Graph page (React Flow) | S | 8 | C | Nodes, edges, zoom, pan |
| 7.F2 | Node inspector panel | S | 3 | C | Click node → see metadata |
| 7.F3 | Community cluster view | S | 3 | C | Color by cluster |
| 7.F4 | Path visualization | C | 5 | C | Show found path highlighted |
| 7.F5 | Graph filters (source, type) | C | 3 | C | Filter visible nodes |

**Total Graph (with FE)**: M=28 SP, S=49 SP, C=8 SP

---

## EPIC 8: Notes & Obsidian

### Backend

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 8.1 | Notes CRUD (kms-api) | M | 5 | A | Create, read, update, delete, list |
| 8.2 | Notes FTS index | M | 2 | A | PostgreSQL GIN index |
| 8.3 | Note sync endpoint (POST /notes/sync) | M | 3 | A | Used by Obsidian plugin |
| 8.4 | Related notes endpoint | M | 3 | A | GET /notes/related (for plugin sidebar) |
| 8.5 | obsidian-sync worker (Python) | M | 8 | B | Vault watcher, markdown parser |
| 8.6 | Frontmatter parser | M | 3 | B | YAML → JSON |
| 8.7 | Backlink extractor (`[[links]]`) | M | 3 | B | Regex + resolve to note_ids |
| 8.8 | Note embed to Qdrant | M | 3 | B | Same pipeline as files |
| 8.9 | Note → Neo4j LINKS_TO edges | S | 3 | B | Backlink graph |
| 8.10 | Note tagging | M | 2 | A | Tags CRUD, associations |
| 8.11 | Note pin / archive | S | 1 | A | Simple boolean flags |

### Obsidian Plugin

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 8.P1 | Plugin scaffold (TypeScript) | M | 3 | C | manifest.json, main.ts |
| 8.P2 | Settings tab (KMS URL + API key) | M | 2 | C | Obsidian settings UI |
| 8.P3 | Vault watcher (modify/create/delete) | M | 5 | C | vault.on('modify', ...) |
| 8.P4 | Sync manager (debounce + queue) | M | 3 | C | 2s debounce, retry on fail |
| 8.P5 | Push note on change | M | 3 | C | POST /api/v1/notes/sync |
| 8.P6 | Frontmatter + backlink extraction | M | 3 | C | gray-matter, regex |
| 8.P7 | Sidebar panel (related files) | S | 5 | C | ItemView, fetch from KMS |
| 8.P8 | Search modal (global search) | S | 5 | C | SuggestModal → all sources |
| 8.P9 | Status bar sync indicator | S | 2 | C | Show "Synced 2m ago" |
| 8.P10 | Conflict resolution (edit in vault vs KMS) | C | 8 | C | Vault wins by default |

### Frontend

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 8.F1 | Notes list page | M | 3 | C | List, filter, search |
| 8.F2 | Note editor (markdown) | M | 5 | C | CodeMirror / Monaco |
| 8.F3 | Note detail view | M | 3 | C | Rendered markdown + metadata |
| 8.F4 | Backlinks visualization in note | S | 3 | C | Show what links here |
| 8.F5 | Tag management | S | 3 | C | Create, assign, filter by tag |
| 8.F6 | Quick capture (global shortcut) | C | 3 | C | Cmd+Shift+N → modal |

**Total Notes/Obsidian**: M=55 SP, S=22 SP, C=11 SP

---

## EPIC 9: Duplicate Detection

### Backend

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 9.1 | dedup-worker scaffold | M | 3 | B | RabbitMQ consumer |
| 9.2 | Exact dedup (SHA-256 lookup) | M | 3 | B | Query kms.files by content_hash |
| 9.3 | Create duplicate records (kms.duplicates) | M | 2 | B | UPSERT, avoid re-creation |
| 9.4 | Neo4j DUPLICATE_OF edge | M | 2 | B | Mirror PG in graph |
| 9.5 | Semantic dedup (Qdrant similarity) | S | 5 | B | Query near-duplicates >95% |
| 9.6 | Image pHash dedup | S | 5 | B | imagehash library |
| 9.7 | Version dedup (filename pattern) | C | 3 | B | Regex: _v1, _v2, _final, _draft |
| 9.8 | Duplicate resolution API | M | 3 | A | Review, confirm, dismiss, resolve |
| 9.9 | Bulk delete duplicates | M | 3 | A | Keep canonical, delete others |
| 9.10 | Config-driven threshold | M | 1 | B | workers.dedup.semantic.threshold |

### Frontend

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 9.F1 | Duplicates manager page | M | 5 | C | Group view, review workflow |
| 9.F2 | Duplicate group card | M | 3 | C | Show original + duplicates |
| 9.F3 | Mark canonical action | M | 2 | C | Choose which to keep |
| 9.F4 | Bulk delete UI | M | 3 | C | Confirmation dialog |
| 9.F5 | Similarity score display | S | 2 | C | Show % similarity |

**Total Dedup**: M=32 SP, S=12 SP, C=3 SP

---

## EPIC 10: RAG Chat & Agents

### Backend

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 10.1 | rag-service scaffold (FastAPI) | S | 3 | B | Port 8002, OTel |
| 10.2 | Ollama LLM provider | S | 3 | B | llama3.2 HTTP client |
| 10.3 | OpenRouter LLM provider | S | 3 | B | OpenAI-compatible API |
| 10.4 | Context retriever (Qdrant top-K) | S | 5 | B | Semantic retrieval |
| 10.5 | Prompt builder | S | 3 | B | System + context + question |
| 10.6 | Citation tracker | S | 3 | B | Map answer segments to sources |
| 10.7 | SSE streaming endpoint | S | 3 | B | Server-sent events |
| 10.8 | Conversation memory (Redis) | S | 3 | B | Session history |
| 10.9 | Graph-aware retrieval | C | 5 | B | Enrich context with graph |
| 10.10 | OrchestratorAgent (ACP) | C | 8 | A | Route to search/graph/rag |
| 10.11 | SearchAgent | C | 3 | A | ACP-wrapped search |
| 10.12 | GraphAgent | C | 3 | A | ACP-wrapped graph |
| 10.13 | RAGAgent | C | 3 | A | ACP-wrapped RAG |
| 10.14 | MCP tool exposure | W | — | — | Post-MVP |
| 10.15 | Editor ACP server (Zed/Cursor) | W | — | — | Post-MVP |

### Frontend

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 10.F1 | Chat page (if rag.enabled) | S | 5 | C | Full chat UI |
| 10.F2 | Message input + send | S | 3 | C | Enter to send, shift+enter newline |
| 10.F3 | Streaming response rendering | S | 3 | C | Token-by-token display |
| 10.F4 | Citation cards | S | 3 | C | Click to open source file |
| 10.F5 | Conversation history sidebar | C | 3 | C | List previous sessions |
| 10.F6 | FeatureGate: hide if disabled | M | 1 | C | Already built in 2.F7 |

**Total RAG/Agents**: M=1 SP, S=44 SP, C=29 SP

---

## EPIC 11: File Browser & Management

### Backend

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 11.1 | Files CRUD (kms-api) | M | 5 | A | List, get, delete, update tags |
| 11.2 | Files list with pagination + filters | M | 3 | A | status, source, mime, date |
| 11.3 | File download proxy | M | 3 | A | Proxy to source (Drive / MinIO) |
| 11.4 | File preview generation | S | 5 | B | Thumbnail for images, PDF |
| 11.5 | File reindex trigger | S | 2 | A | Force re-embed |
| 11.6 | Soft delete files | M | 2 | A | status = 'deleted' |
| 11.7 | Bulk file operations | S | 3 | A | Bulk delete, tag, reindex |
| 11.8 | File type statistics | S | 2 | A | Dashboard counts by type |

### Frontend

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 11.F1 | Files browser page | M | 5 | C | Grid/list view, filters |
| 11.F2 | File card component | M | 3 | C | Icon, name, source badge, actions |
| 11.F3 | File detail panel | M | 3 | C | Metadata, transcript, actions |
| 11.F4 | File filter sidebar | M | 3 | C | Source, type, date, status |
| 11.F5 | Breadcrumb folder navigation | S | 3 | C | Drive folder structure |
| 11.F6 | Bulk select + operations | S | 3 | C | Checkbox + action bar |
| 11.F7 | File preview (image, PDF) | S | 5 | C | In-page preview |

**Total File Browser**: M=27 SP, S=23 SP

---

## EPIC 12: Observability & Monitoring

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 12.1 | OTel on kms-api (auto-instrument) | M | 2 | D | HTTP, DB, Redis |
| 12.2 | OTel on search-api | M | 2 | D | |
| 12.3 | OTel on rag-service | M | 2 | D | + custom LLM spans |
| 12.4 | OTel on voice-app | M | 2 | D | + transcription spans |
| 12.5 | OTel on all workers | M | 3 | D | scan, embed, dedup, graph |
| 12.6 | Custom metrics (LLM tokens, search latency) | M | 3 | D | See list in MASTER_ARCH |
| 12.7 | Grafana: service health dashboard | M | 3 | D | Request rate, p95, errors |
| 12.8 | Grafana: search performance dashboard | M | 3 | D | Keyword vs semantic latency |
| 12.9 | Grafana: worker health dashboard | M | 3 | D | Queue depth, throughput |
| 12.10 | Grafana: LLM usage dashboard | S | 3 | D | Token counts, cost estimate |
| 12.11 | Alerting rules (Prometheus) | S | 3 | D | Down, high latency, high error rate |
| 12.12 | Distributed trace correlation | M | 2 | D | Request ID in all logs |

**Total Observability**: M=25 SP, S=6 SP

---

## EPIC 13: Design System & UI Foundation

| # | Feature | Priority | SP | Stream | Notes |
|---|---------|----------|----|--------|-------|
| 13.1 | `@kb/tokens` design token package | M | 3 | C | Primitive → Semantic → Component |
| 13.2 | `globals.css` @theme (Tailwind v4) | M | 2 | C | CSS custom properties |
| 13.3 | Dark mode support | M | 2 | C | `[data-theme="dark"]` |
| 13.4 | `@kb/ui` base components | M | 5 | C | Button, Card, Input, Badge, etc. |
| 13.5 | Navigation (sidebar + topbar) | M | 3 | C | Responsive |
| 13.6 | `<FeatureGate>` component | M | 2 | C | Hide feature-disabled sections |
| 13.7 | Loading skeletons | M | 2 | C | All list views |
| 13.8 | Toast/notification system | M | 2 | C | Success, error, warning, info |
| 13.9 | Error boundary with fallback UI | M | 2 | C | Per-page error recovery |
| 13.10 | Empty state components | M | 2 | C | No results, no files, not connected |
| 13.11 | Responsive mobile layout | S | 5 | C | Bottom nav on mobile |
| 13.12 | Storybook component docs | C | 5 | C | Component library docs |

**Total Design System**: M=25 SP, S=5 SP, C=5 SP

---

## Sprint Plan — Prototype (Weeks 1-6)

**Goal**: Working prototype with Google Drive scan + search + voice transcription

### Sprint 1 (Week 1-2) — Foundation
```
D: Docker Compose full stack (1.1–1.6, 1.8–1.10) = 19 SP
A: Prisma schema + migrations (1.12, 1.13) = 8 SP
B: Alembic for voice-app (1.11, 4.1) = 6 SP
C: Design tokens + layout (13.1–13.5, 13.7–13.10) = 18 SP

Total: 51 SP | Team capacity (5 devs × 10 days × 0.6): ~30 SP/dev
```

### Sprint 2 (Week 3-4) — Auth + Voice
```
A: Full auth (2.1–2.7) = 18 SP
B: Voice-app fixes (4.2–4.4, 4.7, 4.9, 4.13) = 21 SP
C: Login/register/dashboard UI (2.F1–2.F4, 2.F7) = 13 SP

Total: 52 SP
```

### Sprint 3 (Week 5-6) — Google Drive + Search
```
A: Sources + scan-jobs API (3.1, 3.11) = 6 SP
B: scan-worker + GoogleDriveConnector (3.5–3.12) = 31 SP
A: Search API keyword (6.1–6.3, 6.6, 6.10) = 18 SP
C: Sources page + file browser (3.F1–3.F5, 11.F1–11.F4) = 19 SP
C: Search page (6.F1–6.F3, 6.F6) = 8 SP

Total: 82 SP ← Scale back to what 5 devs can do
```

### Prototype Definition of Done
```
✅ User can register and login
✅ User can connect Google Drive via OAuth
✅ Files are scanned and appear in file browser
✅ Search returns keyword results (<500ms)
✅ User can upload audio/video and get transcription
✅ Transcription text is searchable
✅ All services report health (Grafana)
✅ Feature flags: disable ollama → keyword-only mode works
```

---

## Summary Table

| Epic | Must | Should | Could | Won't | Total M |
|------|------|--------|-------|-------|---------|
| 1. Foundation | 50 | 2 | 2 | 0 | 50 |
| 2. Auth | 36 | 14 | 3 | — | 36 |
| 3. Google Drive | 67 | 14 | 5 | — | 67 |
| 4. Voice | 47 | 36 | 8 | — | 47 |
| 5. Embeddings | 31 | 12 | 4 | — | 31 |
| 6. Search | 40 | 15 | 5 | — | 40 |
| 7. Graph | 28 | 49 | 8 | — | 28 |
| 8. Notes/Obsidian | 55 | 22 | 11 | — | 55 |
| 9. Dedup | 32 | 12 | 3 | — | 32 |
| 10. RAG/Agents | 1 | 44 | 29 | — | 1 |
| 11. File Browser | 27 | 23 | 0 | — | 27 |
| 12. Observability | 25 | 6 | 0 | — | 25 |
| 13. Design System | 25 | 5 | 5 | — | 25 |
| **TOTAL** | **464** | **254** | **83** | — | **464** |

**MVP (Must Have only)**: 464 SP ÷ 5 devs ÷ 10 SP/week = ~9.3 weeks
**With Should Have**: 718 SP ÷ 5 devs ÷ 10 SP/week = ~14 weeks

**Recommendation**: Target 7-week prototype (Must Have only, Epics 1-6 + Voice fixes), then iterate.
