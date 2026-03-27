# KMS — Master Feature Overview

> Single source of truth for all modules, their scope, and task breakdown across every layer.
> Status updated as modules progress. Each module links to its detailed PRD.

---

## Module Index

| ID | Module | PRD | Status | Services Affected |
|----|--------|-----|--------|-------------------|
| M00 | [Project Setup & Boilerplate](#m00--project-setup--boilerplate) | [PRD-M00](./PRD-M00-project-setup.md) | Not Started | All |
| M01 | [Authentication & User Management](#m01--authentication--user-management) | [PRD-M01](./PRD-M01-authentication.md) | Not Started | kms-api, frontend |
| M02 | [Source Integration](#m02--source-integration) | [PRD-M02](./PRD-M02-source-integration.md) | Not Started | kms-api, scan-worker, frontend |
| M03 | [Content Extraction & Processing](#m03--content-extraction--processing) | [PRD-M03](./PRD-M03-content-extraction.md) | Not Started | embed-worker |
| M04 | [Embedding & Indexing Pipeline](#m04--embedding--indexing-pipeline) | [PRD-M04](./PRD-M04-embedding-pipeline.md) | Not Started | embed-worker, kms-api |
| M05 | [Search & Discovery](#m05--search--discovery) | [PRD-M05](./PRD-M05-search.md) | Not Started | search-api, kms-api, frontend |
| M06 | [Deduplication](#m06--deduplication) | [PRD-M06](./PRD-M06-deduplication.md) | Not Started | dedup-worker, kms-api, frontend |
| M07 | [Junk Detection & Cleanup](#m07--junk-detection--cleanup) | [PRD-M07](./PRD-M07-junk-detection.md) | Not Started | dedup-worker, kms-api, frontend |
| M08 | [Voice Transcription Integration](#m08--voice-transcription-integration) | [PRD-M08](./PRD-M08-transcription.md) | Not Started | voice-app, kms-api, frontend |
| M09 | [Knowledge Graph](#m09--knowledge-graph) | [PRD-M09](./PRD-M09-knowledge-graph.md) | Not Started | graph-worker, kms-api, search-api, frontend |
| M10 | [RAG Chat & Agents](#m10--rag-chat--agents) | [PRD-M10](./PRD-M10-rag-chat.md) | Not Started | rag-service, kms-api, frontend |
| M11 | [Web UI — Design System & Shell](#m11--web-ui--design-system--shell) | [PRD-M11](./PRD-M11-web-ui.md) | Not Started | frontend |
| M12 | [Obsidian Plugin Integration](#m12--obsidian-plugin-integration) | [PRD-M12](./PRD-M12-obsidian.md) | Not Started | kms-api, obsidian-sync, frontend |

---

## M00 — Project Setup & Boilerplate

**What it looks like**: Every developer can `git clone` + `./scripts/kms-start.sh` and have a fully running system. Each service has its skeleton: module structure, DI wiring, config, health check, logging, OTel, error handling. CI/CD pipeline runs lint + tests on every PR.

**Prerequisite for**: Everything. This gate must close before M01 begins.

### NestJS (kms-api)
- [ ] SWC compiler configured (`.swcrc`, `nest-cli.json`)
- [ ] Fastify adapter wired (`NestFastifyApplication`)
- [ ] OTel instrumentation (`instrumentation.ts` — line 1 of `main.ts`)
- [ ] `nestjs-pino` `LoggerModule` configured globally
- [ ] Prisma `schema.prisma` with all domain schemas (auth, kms, voice)
- [ ] `PrismaService` module + `BaseRepository` pattern
- [ ] `@kb/errors` `AppException` + `AllExceptionsFilter` + `PrismaExceptionFilter`
- [ ] Zod `ConfigModule` with env validation schema
- [ ] `ThrottlerModule` rate limiting
- [ ] `CorsModule` configured for frontend origin
- [ ] `SwaggerModule` on `/api/v1/docs`
- [ ] `HealthModule` with `/health/live`, `/health/ready`, `/health/startup`
- [ ] `RequestIdMiddleware` injecting `x-request-id`
- [ ] Initial Prisma migration (`001_initial_schema`)
- [ ] Jest + `@swc/jest` configured; sample spec passing

### NestJS (search-api)
- [ ] Identical boilerplate: SWC, Fastify, OTel, pino, errors, config, health
- [ ] `pg.Pool` configured for read-only PostgreSQL connection
- [ ] `RedisModule` for query result caching
- [ ] Swagger on `/api/v1/docs`
- [ ] Jest configured

### Python (voice-app)
- [ ] `structlog` configured with `contextvars` middleware
- [ ] `configure_telemetry(app)` OTel init in lifespan
- [ ] `pydantic-settings` config with all env vars
- [ ] `/health/live`, `/health/ready` endpoints
- [ ] Domain-driven folder restructure: `src/transcription/`, `src/jobs/`, `src/config.py`
- [ ] Google-style docstrings on all existing `def`/classes
- [ ] `ruff` + `mypy` configured in `pyproject.toml`

### Python (scan-worker, embed-worker, dedup-worker, graph-worker)
- [ ] `structlog` + OTel configured for each
- [ ] `aio-pika connect_robust()` worker skeleton
- [ ] Graceful SIGTERM / SIGINT shutdown handler
- [ ] `/health/live` FastAPI wrapper around worker task
- [ ] `pydantic-settings` config
- [ ] `pyproject.toml` with `ruff`, `mypy`, `pytest-asyncio`
- [ ] `Dockerfile` multi-stage: base → dependencies → development → production
- [ ] Sample `test_worker.py` in `tests/unit/`

### Python (rag-service)
- [ ] FastAPI lifespan with OTel + structlog
- [ ] ACP endpoint skeleton: `GET /agents`, `POST /runs`, `GET /runs/{id}`, `GET /runs/{id}/stream`
- [ ] `pydantic-settings` config (LLM_ENABLED, LLM_PROVIDER gates)
- [ ] Health endpoints

### Frontend (Next.js 15)
- [ ] Next.js 15 App Router scaffolded (`create-next-app`)
- [ ] TailwindCSS v4 + `@theme` design token system (primitive → semantic → component)
- [ ] Dark/light mode toggle (CSS variables)
- [ ] Zustand store skeleton (`useAuthStore`, `useSearchStore`)
- [ ] React Query (`@tanstack/react-query`) provider
- [ ] API client module (`lib/api-client.ts`) with JWT injection
- [ ] Base layout: sidebar nav, topbar, main content area
- [ ] `jest.config.ts` + `@testing-library/react`
- [ ] Playwright E2E config

### DB / Schema
- [ ] PostgreSQL `init.sql`: create schemas (`auth`, `kms`, `voice`), extensions (`uuid-ossp`, `pg_trgm`, `vector`)
- [ ] `auth_users`, `auth_api_keys`, `auth_sessions` tables
- [ ] `kms_sources`, `kms_files`, `kms_chunks`, `kms_collections` tables
- [ ] `voice_jobs`, `voice_transcriptions` tables
- [ ] GIN indexes on `tsvector` columns
- [ ] Full Alembic migration (Python services) or Prisma migration (NestJS)

### Queue / Redis / Infra
- [ ] RabbitMQ: declare exchanges (`kms.direct`, `kms.dlx`) + queues (`kms.scan`, `kms.embed`, `kms.dedup`, `kms.graph`, `voice.transcription`) with DLX policy
- [ ] Redis: keyspace naming convention documented (`kms:{domain}:{key}`)
- [ ] Qdrant: `kms_chunks` collection created (1024-dim, m=16, ef_construct=200, INT8 quantization)
- [ ] Neo4j: constraints + indexes for `File`, `Folder`, `Entity`, `Concept` nodes
- [ ] Docker Compose: all 20 services in `docker-compose.kms.yml` with health checks
- [ ] OTel Collector config: receives traces from all services → Jaeger
- [ ] Prometheus scrape config: all `/metrics` endpoints
- [ ] Grafana: `kms-overview` dashboard provisioned

### CI/CD
- [ ] `.github/workflows/ci.yml`: lint + test on PR (NestJS + Python)
- [ ] `.github/workflows/docker-build.yml`: build all service images
- [ ] `.env.kms.example` complete with all required variables documented

---

## M01 — Authentication & User Management

**What it looks like**: Users register with email/password. Login returns JWT access + refresh tokens. API keys (prefixed `kms_`) for programmatic access. Role-based access: `ADMIN`, `USER`. Account lockout after 5 failed logins.

### NestJS (kms-api)
- [ ] `AuthModule`: register, login, refresh, logout, change-password endpoints
- [ ] `UsersModule`: CRUD for user management (admin only)
- [ ] `ApiKeysModule`: create, list, revoke API keys
- [ ] JWT strategy (Passport) + `JwtAuthGuard`
- [ ] API key strategy + `ApiKeyAuthGuard`
- [ ] `CombinedAuthGuard` (auto-detect JWT vs API key)
- [ ] `RolesGuard` + `@Roles()` decorator
- [ ] `@Public()` decorator for open routes
- [ ] bcrypt 12 rounds password hashing
- [ ] Account lockout: 5 failures → 30-min lock (`auth_login_attempts` table)
- [ ] Error codes: `KBAUT0001`–`KBAUT0015`, `KBAUЗ0001`–`KBAUЗ0005`
- [ ] TSDoc + Swagger on all endpoints
- [ ] Unit + E2E tests (>80% coverage)

### Frontend
- [ ] Register page (`/auth/register`)
- [ ] Login page (`/auth/login`) with error states (locked, bad password)
- [ ] Forgot password page (`/auth/forgot-password`) — stub
- [ ] Protected route HOC / middleware
- [ ] `useAuthStore` (Zustand): persist JWT, handle refresh
- [ ] Axios interceptor: auto-refresh on 401
- [ ] API keys settings page (`/settings/api-keys`)

### DB
- [ ] `auth_users` (id, email, password_hash, role, status, failed_login_count, locked_until)
- [ ] `auth_api_keys` (id, user_id, key_hash, prefix, name, expires_at, revoked_at)
- [ ] `auth_login_attempts` (id, user_id, attempted_at, success)
- [ ] Migration: `002_auth_tables`

### Queue / Redis
- [ ] Redis: session TTL `auth:session:{userId}` = 24h
- [ ] Redis: rate limiting `auth:ratelimit:{ip}` = 100 req/15min

---

## M02 — Source Integration

**What it looks like**: Users connect file sources: local folder, Google Drive (OAuth). kms-api persists the source config. scan-worker discovers all files, computes SHA-256, publishes to downstream queues. Sync is incremental (delta on re-scan).

### NestJS (kms-api)
- [ ] `SourcesModule`: create, list, get, delete, trigger-scan endpoints
- [ ] Source types: `local`, `google_drive`, `obsidian` (obsidian = M12)
- [ ] `ScanJobsModule`: track scan status, file counts, errors
- [ ] Google Drive OAuth flow: `GET /auth/google`, callback, token storage
- [ ] `GET /sources/{id}/status` — live scan progress via SSE or polling
- [ ] Webhook to receive scan completion from scan-worker
- [ ] Error codes: `KBSRC0001`–`KBSRC0020`
- [ ] Swagger + TSDoc

### Python (scan-worker)
- [ ] `LocalFileConnector` — recursive walk, SHA-256 per file, extension filter
- [ ] `GoogleDriveConnector` — Drive API v3, paginated file list, delta token (nextPageToken)
- [ ] `ConnectorRegistry` — `get_connector(source_type)` factory
- [ ] `ScanHandler` — orchestrates connector → publish `FileDiscoveredMessage` to `kms.embed` + `kms.dedup`
- [ ] PATCH kms-api source status on start / complete / error
- [ ] Google Drive rate limit: exponential backoff on 429
- [ ] Structured error logging per file failure (non-fatal, scan continues)
- [ ] Unit tests: `LocalFileConnector`, `ScanHandler`

### Frontend
- [ ] Sources page (`/sources`) — list connected sources with status badges
- [ ] Add source modal — type picker (local / Google Drive)
- [ ] Google Drive OAuth redirect flow
- [ ] Source detail page (`/sources/{id}`) — scan history, file count, errors
- [ ] "Scan Now" button + live progress indicator

### DB
- [ ] `kms_sources` (id, user_id, type, name, config_json, last_scanned_at, status)
- [ ] `kms_scan_jobs` (id, source_id, started_at, completed_at, file_count, error_count, status)
- [ ] Migration: `003_sources`

### Queue / Redis
- [ ] Queue `kms.scan`: `ScanJobMessage { source_id, user_id, connector_type }`
- [ ] Queue `kms.embed`: `FileDiscoveredMessage { file_id, path, mime_type, checksum_sha256 }`
- [ ] Queue `kms.dedup`: `DedupCheckMessage { file_id, checksum_sha256 }`
- [ ] Redis: `kms:scan:progress:{source_id}` — scan progress counter (TTL 1h)

---

## M03 — Content Extraction & Processing

**What it looks like**: embed-worker receives `FileDiscoveredMessage` from `kms.embed` queue. It extracts raw text from PDF, DOCX, XLSX, TXT, MD, images (OCR). Text is then split into overlapping chunks (512 tokens, 64 overlap).

### Python (embed-worker — extractors)
- [ ] `BaseExtractor` ABC with `extract(file_path) -> str`
- [ ] `PlainTextExtractor` — TXT, MD, CSV
- [ ] `PdfExtractor` — `pdfminer.six`, handles multi-column layout
- [ ] `DocxExtractor` — `python-docx`
- [ ] `XlsxExtractor` — `openpyxl`, sheet → markdown table
- [ ] `ImageExtractor` — `pytesseract` + `Pillow` (feature-flagged)
- [ ] `AudioMetadataExtractor` — extract title, duration from media (not full transcription)
- [ ] `ExtractorRegistry` — MIME type → extractor mapping
- [ ] `TextChunker` — character-level with word-boundary snap, configurable chunk_size/overlap
- [ ] Store chunks in `kms_chunks` with checksum and position metadata
- [ ] Structured logging per extraction step: `kb.extract_text` span
- [ ] Error: `ExtractionError` (non-retryable) → file marked `extraction_failed`, nack to DLQ
- [ ] Unit tests: each extractor, chunker edge cases

### NestJS (kms-api)
- [ ] `FilesModule`: track extraction status per file (`kms_files.extraction_status`)
- [ ] `GET /files/{id}/content` — return extracted text chunks (paginated)

### DB
- [ ] `kms_files` (id, source_id, user_id, name, path, mime_type, size_bytes, sha256, extraction_status, extracted_at)
- [ ] `kms_chunks` (id, file_id, source_id, user_id, chunk_index, content, checksum_sha256, token_count, created_at)
- [ ] Migration: `004_files_chunks`

### Queue / Redis
- [ ] DLQ: `kms.embed.dlq` — extraction failures routed here for manual review
- [ ] Redis: `kms:extraction:stats:{user_id}` — total bytes processed, files completed

---

## M04 — Embedding & Indexing Pipeline

**What it looks like**: After chunking, embed-worker generates BGE-M3 dense + sparse vectors for each chunk. Vectors upserted into Qdrant with payload metadata (user_id, source_id, file_id). PostgreSQL chunk records updated with `embedding_status = completed`.

### Python (embed-worker — embeddings)
- [ ] `BGEEmbeddingProvider` — `FlagEmbedding` library, `BAAI/bge-m3` model, batch inference
- [ ] Dense vector (1024-dim) + sparse vector generation per chunk
- [ ] Batch upsert to Qdrant: `kms_chunks` collection with payload `{ user_id, source_id, file_id, chunk_index }`
- [ ] `kb.vector_upsert` OTel span with `upserted_count` attribute
- [ ] DB: UPDATE `kms_chunks SET embedding_status = 'completed'` after upsert
- [ ] Fallback: if Qdrant unreachable → retryable error, nack with requeue
- [ ] Model loading: singleton on worker startup (not per-message)
- [ ] GPU detection: use CUDA if available, CPU fallback
- [ ] Unit tests: mock Qdrant client, verify payload structure

### NestJS (kms-api)
- [ ] `GET /files/{id}/embedding-status` — check indexing progress
- [ ] `POST /files/{id}/reindex` — trigger re-embedding for a single file

### DB
- [ ] `kms_chunks`: add `embedding_status ENUM('pending','completed','failed')`, `embedded_at`
- [ ] `kms_files`: add `embedding_status`, `embedded_chunk_count`

### Queue / Redis
- [ ] Queue `kms.embed`: message includes `file_id`, `chunk_batch` (list of chunk IDs)
- [ ] Redis: `kms:embed:model:loaded` flag — prevents duplicate model loads in multi-worker scenario

---

## M05 — Search & Discovery

**What it looks like**: search-api provides three search modes. Keyword: PostgreSQL GIN tsvector FTS. Semantic: Qdrant ANN with BGE-M3 query embedding. Hybrid: RRF-combined (keyword + semantic). Results include highlighted snippets, relevance score, file metadata. Redis caches results 60s.

### NestJS (search-api)
- [ ] `SearchModule`: `GET /search?q=&type=keyword|semantic|hybrid&page=&limit=`
- [ ] `KeywordSearchService` — `plainto_tsquery`, `ts_headline` snippets, `ts_rank`
- [ ] `SemanticSearchService` — embed query with BGE-M3, Qdrant `search()` with payload filter
- [ ] `HybridSearchService` — RRF merge: `score = 1/(k + rank_keyword) + 1/(k + rank_semantic)`, k=60
- [ ] `kb.search` OTel span with `search_type`, `result_count` attributes
- [ ] `kb.embed_query` OTel span for query embedding
- [ ] Redis cache: `kms:search:{user_id}:{hash(query+params)}` TTL=60s
- [ ] Throttle: 30 req/min per user
- [ ] Error codes: `KBSCH0001`–`KBSCH0010`
- [ ] Swagger + TSDoc
- [ ] Unit + integration tests

### Python (embed-worker — query embedding)
- [ ] `QueryEmbedder` exposed as HTTP endpoint: `POST /embed` → `{ dense: [], sparse: {} }`
- [ ] search-api calls this to embed query before Qdrant search

### Frontend
- [ ] Search bar (global, in topbar — always visible)
- [ ] Search results page (`/search?q=`)
- [ ] Type tabs: All | Keyword | Semantic | Hybrid
- [ ] Result card: file name, source, snippet with highlights, date, score badge
- [ ] Filter panel: date range, source, file type, mime type
- [ ] Infinite scroll or pagination

### DB
- [ ] GIN index: `CREATE INDEX idx_kms_chunks_fts ON kms_chunks USING gin(search_vector)`
- [ ] `search_vector` column: `tsvector` generated from `content`
- [ ] Trigger: auto-update `search_vector` on chunk insert/update

### Queue / Redis
- [ ] Redis: search result cache (`kms:search:*` pattern), TTL 60s
- [ ] Redis: semantic search cache off by default when embedding disabled

---

## M06 — Deduplication

**What it looks like**: dedup-worker compares each new file's SHA-256 against existing files. Exact duplicates are grouped and flagged. Semantic deduplication (>95% cosine similarity) optional (requires embedding). Users see duplicate groups in UI and can decide to keep/delete.

### Python (dedup-worker)
- [ ] `DedupHandler` — consumes `kms.dedup` queue
- [ ] `ExactMatchStrategy` — SHA-256 lookup in `kms_files` table
- [ ] `SemanticMatchStrategy` — Qdrant query for nearest neighbors, filter by `score > 0.95` (feature-flagged)
- [ ] `VersionGroupStrategy` — detect files with same name but different timestamps → version cluster
- [ ] On duplicate found: PATCH kms-api `POST /files/{id}/mark-duplicate { group_id }`
- [ ] Error codes: `KBDUP0001`–`KBDUP0010`
- [ ] Unit tests: exact match, semantic match, version grouping

### NestJS (kms-api)
- [ ] `DuplicatesModule`: `GET /duplicates` (paginated groups), `DELETE /duplicates/{groupId}/keep/{fileId}` (delete all others in group)
- [ ] `kms_duplicate_groups` and `kms_file_duplicates` tables
- [ ] Webhook endpoint: `POST /internal/files/{id}/mark-duplicate`

### Frontend
- [ ] Duplicates page (`/duplicates`)
- [ ] Duplicate group card: shows all copies with file metadata
- [ ] "Keep this one" button — deletes all other copies
- [ ] Bulk action: "Auto-resolve all exact duplicates"
- [ ] Stats: total space saved

### DB
- [ ] `kms_duplicate_groups` (id, user_id, strategy, file_count, total_size_bytes, created_at)
- [ ] `kms_file_duplicates` (id, group_id, file_id, is_canonical, similarity_score)
- [ ] Migration: `006_deduplication`

### Queue / Redis
- [ ] Queue `kms.dedup`: `DedupCheckMessage { file_id, checksum_sha256, user_id }`
- [ ] Redis: `kms:dedup:sha256:{checksum}` → existing `file_id` (fast exact match cache)

---

## M07 — Junk Detection & Cleanup

**What it looks like**: dedup-worker (or separate junk-worker) classifies files as junk based on rules: temp files (`~$`, `.DS_Store`, `Thumbs.db`), empty files (<1KB), corrupted (unreadable), and optionally ML-based classification. Users see junk files in UI and can bulk delete.

### Python (dedup-worker / junk-detector)
- [ ] `JunkDetector` service
- [ ] `RuleBasedClassifier`: filename patterns, size threshold, extension blacklist
- [ ] `CorruptedFileDetector`: attempt extract → if fails with certain errors → junk
- [ ] `MLClassifier` (optional, feature-flagged): simple TF-IDF or content-based classifier
- [ ] On junk detected: PATCH kms-api `POST /files/{id}/mark-junk { reason, confidence }`
- [ ] Confidence score (0.0–1.0) attached to each junk determination
- [ ] Unit tests: each classifier, edge cases

### NestJS (kms-api)
- [ ] `JunkModule`: `GET /junk` (paginated), `DELETE /junk/bulk` (batch delete)
- [ ] `kms_files.junk_status`, `junk_reason`, `junk_confidence` columns
- [ ] `POST /internal/files/{id}/mark-junk` webhook

### Frontend
- [ ] Junk page (`/junk`)
- [ ] Junk file list with reason badge (temp, empty, corrupted, ml-classified)
- [ ] Confidence threshold slider (hide below X%)
- [ ] Bulk delete with confirmation ("This will permanently delete N files")
- [ ] Stats: space to be reclaimed

### DB
- [ ] `kms_files`: add `junk_status`, `junk_reason`, `junk_confidence`, `junk_reviewed_at`
- [ ] Migration: `007_junk_columns`

### Queue / Redis
- [ ] Redis: `kms:junk:count:{user_id}` — cached junk file count for dashboard badge

---

## M08 — Voice Transcription Integration

**What it looks like**: Audio/video files discovered by scan-worker are automatically queued for transcription. Users can also manually trigger transcription on any media file. Transcription results (text + timestamps + confidence) are stored, indexed into `kms_chunks` for search, and displayed in file detail view.

### Python (voice-app — existing + extension)
- [ ] Alembic migrations for `voice_jobs`, `voice_transcriptions` (replace `create_all`)
- [ ] Webhook: `POST /internal/transcription-complete { file_id, transcript_id }` → notify kms-api
- [ ] KMS file linking: `kms_transcription_links` table (voice_transcription_id → kms_file_id)
- [ ] Auto-trigger: scan-worker publishes audio files to `voice.transcription` queue
- [ ] Provider fallback chain: Whisper → Groq → Deepgram (existing, verify working)
- [ ] Batch transcription: process multiple files in sequence
- [ ] Structured logging migration: `structlog` (currently uses stdlib `logging`)

### NestJS (kms-api)
- [ ] `TranscriptionsModule`: `POST /files/{id}/transcribe`, `GET /files/{id}/transcription`
- [ ] Webhook handler: `POST /internal/voice/transcription-complete`
- [ ] On transcript received: insert chunks into `kms_chunks` → publish to `kms.embed`
- [ ] `GET /transcriptions/{id}` — full transcript with segments + timestamps
- [ ] `GET /transcriptions/{id}/download?format=txt|srt|json`

### Frontend
- [ ] File detail page: media player + transcript panel side-by-side
- [ ] Transcript viewer: click timestamp → seek player to that position
- [ ] "Transcribe" button with provider selector (auto / whisper / groq / deepgram)
- [ ] Transcription status badge (queued / processing / done / failed)
- [ ] Download transcript (TXT, SRT, JSON)

### DB
- [ ] `kms_transcription_links` (id, kms_file_id, voice_transcription_id, linked_at)
- [ ] Migration: `008_transcription_links`

### Queue / Redis
- [ ] Queue `voice.transcription`: `TranscriptionJobMessage { file_id, kms_file_id, provider }`
- [ ] DLQ: `voice.transcription.dlq`
- [ ] Redis: `kms:transcription:status:{file_id}` — poll status cache (TTL 5min)

---

## M09 — Knowledge Graph

**What it looks like**: graph-worker builds a Neo4j knowledge graph from extracted content. Entities (people, orgs, topics) extracted from file content using spaCy. Files linked to entities, entities linked to each other via co-occurrence. Users can explore the graph visually, see related files, and navigate by concept.

### Python (graph-worker)
- [ ] `EntityExtractor` — spaCy `en_core_web_sm` NER: PERSON, ORG, GPE, PRODUCT, EVENT
- [ ] `GraphBuilder` — Neo4j `AsyncDriver` (official `neo4j` package)
- [ ] Nodes: `File`, `Folder`, `Entity`, `Concept`, `Chunk`
- [ ] Relationships: `CONTAINS`, `MENTIONS`, `CO_OCCURS_WITH`, `SIMILAR_TO`, `BELONGS_TO_FOLDER`
- [ ] Community detection: Neo4j GDS Leiden algorithm (`CALL gds.leiden.write(...)`)
- [ ] `kb.graph_traversal` OTel span
- [ ] Batch processing: process chunks in groups of 100
- [ ] Unit tests: entity extraction, graph node creation

### NestJS (kms-api)
- [ ] `GraphModule`: `GET /graph/entities`, `GET /graph/entity/{id}/related`, `GET /graph/file/{id}/neighbors`
- [ ] `GET /graph/communities` — list community clusters with member count
- [ ] `GET /graph/path?from={entityId}&to={entityId}` — shortest path
- [ ] Feature-gated behind `.kms/config.json` → `features.graph.enabled`

### Frontend
- [ ] Knowledge graph page (`/graph`)
- [ ] React Flow canvas: nodes (files, entities, concepts) + edges (relationships)
- [ ] Node click: show detail panel (file preview, related entities)
- [ ] Community view: color-coded clusters
- [ ] Search in graph: find entity, highlight subgraph
- [ ] Zoom/pan/filter controls

### DB (Neo4j)
- [ ] `CREATE CONSTRAINT file_id_unique FOR (f:File) REQUIRE f.id IS UNIQUE`
- [ ] `CREATE CONSTRAINT entity_name_unique FOR (e:Entity) REQUIRE (e.name, e.type) IS UNIQUE`
- [ ] Index on `File.user_id`, `Entity.type`, `Chunk.file_id`

### Queue / Redis
- [ ] Queue `kms.graph`: `GraphBuildMessage { file_id, chunk_ids, user_id }`
- [ ] Redis: `kms:graph:community:{community_id}` — community member list cache (TTL 1h)

---

## M10 — RAG Chat & Agents

**What it looks like**: Users ask natural-language questions. rag-service retrieves relevant chunks via hybrid search, optionally expands via knowledge graph, reranks, then generates an answer using the configured LLM (local Ollama or cloud OpenRouter). Response streamed via SSE with inline citations. kms-api orchestrates agents via ACP protocol.

### Python (rag-service)
- [ ] ACP endpoint implementation: `GET /agents`, `POST /runs`, `GET /runs/{id}`, `GET /runs/{id}/stream`, `DELETE /runs/{id}`
- [ ] `RAGAgent` internal LangGraph pipeline: retrieve → grade → rewrite (max 2x) → generate
- [ ] `HybridRetriever` — calls search-api hybrid search
- [ ] `GraphExpander` — calls kms-api graph neighbors (feature-gated)
- [ ] `Reranker` — BGE-M3 cross-encoder OR RRF merge
- [ ] `LLMGenerator` — Ollama (`llama3.2:3b`) + OpenRouter fallback
- [ ] SSE streaming: chunked token output with citations
- [ ] Citation format: `[1] filename.pdf (chunk 3)`
- [ ] `kb.llm_generate` OTel span with `gen_ai.*` semantic conventions

### NestJS (kms-api)
- [ ] `AgentOrchestratorService` — calls rag-service via ACP HTTP
- [ ] `ChatModule`: `POST /chat/completions`, `GET /chat/sessions`, `GET /chat/sessions/{id}`
- [ ] `ChatSession` model: persists conversation history (user messages + AI responses)
- [ ] SSE relay: forward rag-service stream to browser client
- [ ] Feature-gated: `features.rag.enabled = false` → 503 with helpful message

### Frontend
- [ ] Chat page (`/chat`)
- [ ] Message thread: user bubbles (right) + AI bubbles (left) with citation chips
- [ ] Streaming: text appears token-by-token
- [ ] Source panel: expandable list of cited documents with snippets
- [ ] Session history sidebar: past conversations
- [ ] "New Chat" button
- [ ] Suggested questions (based on recent file activity)

### DB
- [ ] `kms_chat_sessions` (id, user_id, title, created_at, updated_at)
- [ ] `kms_chat_messages` (id, session_id, role, content, citations_json, created_at)
- [ ] Migration: `010_chat_tables`

### Queue / Redis
- [ ] Redis: `kms:chat:session:{session_id}` — recent context cache (TTL 30min)
- [ ] Redis: `kms:rag:run:{run_id}` — ACP run state (TTL 10min)

---

## M11 — Web UI — Design System & Shell

**What it looks like**: Production-quality Next.js 15 web app. Consistent design system (tokens → components). 14 pages: dashboard, sources, files, search, duplicates, junk, graph, chat, transcriptions, settings, profile, API keys, collections, admin.

### Frontend
- [ ] **Design Tokens**: Primitive (colors, spacing, radius) → Semantic (background, foreground, border) → Component tokens
- [ ] **Component Library** (all with dark/light): `Button`, `Input`, `Select`, `Badge`, `Card`, `Modal`, `Drawer`, `Toast`, `Table`, `Pagination`, `Tabs`, `Skeleton`, `Avatar`, `ProgressBar`, `DropZone`, `MediaPlayer`
- [ ] **Dashboard** (`/`): stats cards (files, sources, search queries, storage used), recent activity feed, quick actions
- [ ] **Sources** (`/sources`): list + add/edit/delete sources, scan history
- [ ] **File Browser** (`/files`): table view + grid view, filters, bulk select, preview panel
- [ ] **File Detail** (`/files/{id}`): metadata, extracted text, chunks, transcription, graph neighbors
- [ ] **Search** (`/search`): results with highlighting, type toggle, filters
- [ ] **Duplicates** (`/duplicates`): group view, keep/delete actions
- [ ] **Junk** (`/junk`): list with reason badges, bulk delete
- [ ] **Knowledge Graph** (`/graph`): React Flow canvas
- [ ] **Chat** (`/chat`): RAG chat UI
- [ ] **Transcriptions** (`/transcriptions`): list of transcription jobs + player
- [ ] **Collections** (`/collections`): user-created file groups
- [ ] **Settings** (`/settings`): profile, API keys, notification preferences
- [ ] **Admin** (`/admin`): user management (ADMIN role only)
- [ ] Responsive: desktop + tablet (mobile = phase 2)
- [ ] Accessibility: WCAG 2.1 AA

### NestJS (kms-api)
- [ ] `CollectionsModule`: CRUD for user file collections
- [ ] `DashboardModule`: `GET /dashboard/stats` — aggregated counts + activity

### DB
- [ ] `kms_collections` (id, user_id, name, description, created_at)
- [ ] `kms_collection_files` (collection_id, file_id)
- [ ] Migration: `011_collections`

---

## M12 — Obsidian Plugin Integration

**What it looks like**: Obsidian plugin watches a vault folder. On save, syncs note to KMS. On open, shows related KMS files in sidebar. Backlinks resolved across KMS and vault. Two-way sync: KMS notes → vault, vault edits → KMS.

### Python (obsidian-sync worker — new)
- [ ] Vault watcher: `watchfiles` library, debounced on save
- [ ] Frontmatter parser: YAML/TOML frontmatter, extract tags and links
- [ ] Backlink extractor: `[[wiki-links]]` → resolve to kms_file_id
- [ ] `ObsidianSyncHandler` — upsert note content to kms-api via HTTP
- [ ] Two-way sync: poll kms-api for updates, write back to vault

### NestJS (kms-api)
- [ ] `NotesModule`: `POST /notes` (upsert), `GET /notes/{id}`, `GET /notes/{id}/backlinks`
- [ ] `ObsidianSyncModule`: `POST /obsidian/sync/batch` — batch upsert from plugin
- [ ] `GET /notes/{id}/related` — related KMS files by embedding similarity

### Frontend
- [ ] Notes page (`/notes`): list + editor (basic Markdown preview)
- [ ] Backlink panel: shows all notes/files that link to this note

### DB
- [ ] `kms_notes` (id, user_id, source_id, title, content, frontmatter_json, vault_path, last_synced_at)
- [ ] `kms_note_backlinks` (source_note_id, target_note_id, target_file_id)
- [ ] Migration: `012_notes`

### Queue / Redis
- [ ] Queue `kms.obsidian`: `ObsidianSyncMessage { note_path, content, action: upsert|delete }`

---

## Summary: Task Counts

| Module | NestJS | Python | Frontend | DB | Queue/Redis | Total |
|--------|--------|--------|----------|----|-------------|-------|
| M00 Boilerplate | 15 | 28 | 10 | 8 | 9 | **70** |
| M01 Auth | 11 | — | 7 | 4 | 2 | **24** |
| M02 Sources | 7 | 7 | 5 | 3 | 4 | **26** |
| M03 Extraction | 2 | 11 | — | 3 | 2 | **18** |
| M04 Embedding | 2 | 8 | — | 2 | 2 | **14** |
| M05 Search | 8 | 1 | 6 | 3 | 2 | **20** |
| M06 Dedup | 4 | 8 | 4 | 3 | 2 | **21** |
| M07 Junk | 3 | 7 | 4 | 2 | 1 | **17** |
| M08 Transcription | 4 | 7 | 5 | 2 | 3 | **21** |
| M09 Graph | 5 | 8 | 6 | 3 | 2 | **24** |
| M10 RAG Chat | 5 | 8 | 7 | 3 | 2 | **25** |
| M11 Web UI Shell | 2 | — | 20 | 2 | — | **24** |
| M12 Obsidian | 4 | 6 | 2 | 3 | 1 | **16** |
| **Total** | **72** | **99** | **76** | **38** | **32** | **~320** |
