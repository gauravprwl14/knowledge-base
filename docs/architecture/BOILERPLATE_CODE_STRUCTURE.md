# KMS Boilerplate Code Structure

**Version**: 1.0.0
**Date**: 2026-03-17
**Status**: Active — reflects actual implemented code

This document describes the boilerplate code structure for each service in the KMS platform. Every service follows consistent patterns for error handling, observability, config, and health checks.

---

## Common Patterns Across All Services

### Error Response Format
All services — Python and Node.js — return errors in this exact format:

```json
{
  "errors": [{
    "errorCode": "SVC1000",
    "message": "Human-readable message",
    "type": "validation_error | not_found | internal_error | service_unavailable",
    "category": "input_validation | resource | system | external_service",
    "data": {}
  }],
  "meta": {
    "timestamp": "2026-03-17T00:00:00.000Z",
    "service": "service-name",
    "requestId": "uuid (NestJS services)",
    "traceId": "hex (when OTel active)"
  }
}
```

### Error Code Namespace Registry

| Prefix | Service | Example |
|--------|---------|---------|
| VAL | Generic validation | VAL1000 |
| AUT | Authentication (kms-api) | AUT1001 |
| AUZ | Authorization (kms-api) | AUZ2001 |
| DAT | Database (kms-api) | DAT3001 |
| SRC | Search API | SRC1000 |
| SCN | Scan Worker | SCN1001 |
| EMB | Embed Worker | EMB2000 |
| RAG | RAG Service | RAG3000 |
| GRF | Graph Worker | GRF1000 |

### Graceful Degradation
All services implement feature-flag-aware degradation:
- `LLM_ENABLED=false` → RAG service returns search excerpts instead of LLM answer
- `EMBEDDING_ENABLED=false` → embed-worker skips Qdrant step, stores text only
- Search API falls back keyword → semantic → hybrid based on feature flag

### Observability (All Services)
- **OpenTelemetry**: Traces exported to `OTEL_EXPORTER_OTLP_ENDPOINT` (gRPC)
- **NestJS**: OTel SDK initialized at the very top of `main.ts` before any imports
- **Python**: `opentelemetry-instrumentation-fastapi` auto-instruments FastAPI
- **Health Endpoints**: Every service exposes `GET /health` and `GET /health/ready`

---

## 1. kms-api (NestJS 11 + Fastify)

**Port**: 8000 | **Builder**: SWC | **Auth**: JWT + API Key

### Directory Structure
```
kms-api/
├── .swcrc                          # SWC compiler: decoratorMetadata, keepClassNames
├── nest-cli.json                   # builder: { type: "swc" }, typeCheck: true
├── prisma/
│   ├── schema.prisma               # User, ApiKey, RefreshToken, AuditLog models
│   └── migrations/                 # Prisma-managed migration files
├── src/
│   ├── main.ts                     # OTel init → NestFastifyApplication → Swagger → listen
│   ├── app.module.ts               # Root module wiring all feature modules
│   ├── bootstrap/
│   │   └── processHandlers.ts      # SIGTERM/SIGINT, uncaughtException, unhandledRejection
│   ├── config/
│   │   ├── config.module.ts        # NestJS ConfigModule with Zod validation
│   │   ├── config.service.ts       # AppConfigService — typed getters for each config group
│   │   ├── schemas/                # Zod schemas: app, auth, database, redis, queue, otel
│   │   └── constants/
│   │       └── app.constants.ts    # HTTP_STATUS, CACHE_TTL, QUEUE_NAMES, AUDIT_ACTIONS
│   ├── database/
│   │   ├── prisma/
│   │   │   └── prisma.service.ts   # PrismaClient with query logging, health check, transaction helper
│   │   └── repositories/
│   │       ├── base.repository.ts  # Generic CRUD + paginate<T>()
│   │       ├── user.repository.ts  # findByEmail, updateFailedLoginCount, lockAccount
│   │       ├── api-key.repository.ts
│   │       └── audit-log.repository.ts
│   ├── errors/
│   │   ├── types/
│   │   │   └── app-error.ts        # AppError extends HttpException; toLog(), toResponse()
│   │   ├── error-codes/            # Structured error definitions with HTTP status
│   │   │   └── index.ts            # AUT.*, AUZ.*, DAT.*, SRV.*, VAL.* codes
│   │   ├── handlers/
│   │   │   └── prisma-error.handler.ts  # Prisma P2002/P2025 → AppError
│   │   └── factory/
│   │       └── error-factory.ts    # ErrorFactory.validation(), .notFound(), .unauthorized()...
│   ├── logger/
│   │   └── app-logger.service.ts   # Pino wrapper; child(context), OTel trace ID injection
│   ├── telemetry/
│   │   ├── sdk/
│   │   │   └── otel.ts             # initOtelSdk(), shutdownOtelSdk(), withSpan()
│   │   └── decorators/
│   │       └── trace.decorator.ts  # @Trace() method decorator
│   ├── common/
│   │   ├── decorators/
│   │   │   ├── public.decorator.ts         # @Public() — bypass JwtAuthGuard
│   │   │   ├── current-user.decorator.ts   # @CurrentUser() — inject request.user
│   │   │   └── roles.decorator.ts          # @Roles(UserRole.ADMIN)
│   │   ├── filters/
│   │   │   └── all-exceptions.filter.ts    # Global: AppError → standard JSON response
│   │   ├── guards/
│   │   │   └── roles.guard.ts              # RBAC: checks user.role vs @Roles() metadata
│   │   ├── interceptors/
│   │   │   ├── transform.interceptor.ts    # Wraps all responses: { success, data, meta }
│   │   │   ├── logging.interceptor.ts      # Logs method, url, status, duration
│   │   │   └── timeout.interceptor.ts      # 30s global request timeout
│   │   ├── middleware/
│   │   │   ├── request-id.middleware.ts    # Generate/extract X-Request-Id header
│   │   │   └── security-headers.middleware.ts
│   │   └── pipes/
│   │       ├── zod-validation.pipe.ts      # Validates body/query with Zod schema
│   │       └── parse-uuid.pipe.ts
│   └── modules/
│       ├── auth/
│       │   ├── auth.module.ts
│       │   ├── auth.controller.ts   # POST /auth/register, /auth/login, /auth/refresh, /auth/change-password
│       │   ├── auth.service.ts      # bcrypt hash, JWT generate, refresh token rotation
│       │   ├── strategies/
│       │   │   ├── jwt.strategy.ts  # Extracts Bearer token, validates, attaches user
│       │   │   └── api-key.strategy.ts
│       │   ├── guards/
│       │   │   ├── jwt-auth.guard.ts
│       │   │   ├── api-key-auth.guard.ts
│       │   │   └── combined-auth.guard.ts  # Either JWT OR API key
│       │   └── dto/
│       │       └── *.dto.ts         # LoginDto, RegisterDto, RefreshTokenDto (Zod-backed)
│       └── health/
│           ├── health.module.ts
│           └── health.controller.ts # GET /health, /health/ready, /health/live
├── test/
│   ├── unit/                        # Jest unit tests (SWC transformed)
│   │   └── auth/
│   │       └── auth.service.spec.ts
│   └── integration/                 # E2E tests with testcontainers
└── Dockerfile                       # base → dependencies → development → test → builder → production
```

### SWC Configuration
```json
// .swcrc — key settings for NestJS compatibility
{
  "jsc": {
    "transform": {
      "legacyDecorator": true,
      "decoratorMetadata": true   // Required for NestJS @Injectable() DI
    },
    "keepClassNames": true          // Required for NestJS class-based DI to resolve names
  }
}
```

### Request Lifecycle (kms-api)
```
Request
  → RequestIdMiddleware (add X-Request-Id)
  → SecurityHeadersMiddleware
  → ThrottlerGuard (rate limit)
  → JwtAuthGuard (validate Bearer / X-API-Key)
  → RolesGuard (RBAC)
  → TimeoutInterceptor (30s)
  → LoggingInterceptor (log start)
  → TransformInterceptor (wrap response)
  → Controller method
  → Service
  → Repository (Prisma)
  ← Response: { success: true, data: {...}, meta: { requestId, traceId, timestamp } }
  ← Error: { success: false, errors: [...], meta: { requestId, traceId, timestamp } }
```

---

## 2. search-api (NestJS 11 + Fastify)

**Port**: 8001 | **Builder**: SWC | **Auth**: None (public search, internal network)

### Directory Structure
```
services/search-api/
├── .swcrc                          # Same pattern as kms-api
├── nest-cli.json                   # builder: { type: "swc" }
├── package.json                    # @kb/search-api, NestJS 11, pg, pino
├── tsconfig.json                   # ES2022, strict, decorator metadata
└── src/
    ├── main.ts                     # OTel init → Fastify → Swagger (dev only) → port 8001
    ├── app.module.ts               # ConfigModule (Zod), LoggerModule (Pino), ThrottlerModule
    ├── config/
    │   └── config.schema.ts        # Zod: DATABASE_URL, REDIS_URL, QDRANT_URL, LOG_LEVEL
    ├── search/
    │   ├── search.module.ts        # Wires controller + services + CacheModule (30s TTL)
    │   ├── search.controller.ts    # GET /api/v1/search — ZodValidationPipe, @Throttle(30/min)
    │   ├── search.service.ts       # Mode dispatch: keyword / semantic (stub) / hybrid (stub)
    │   ├── dto/
    │   │   └── search-query.dto.ts # Zod schema + SearchResultDto + SearchResponseDto
    │   └── services/
    │       └── keyword-search.service.ts  # pg.Pool + plainto_tsquery + ts_headline
    ├── health/
    │   ├── health.module.ts
    │   └── health.controller.ts    # GET /health, /health/live (Terminus)
    └── common/
        ├── decorators/
        │   └── public.decorator.ts
        └── pipes/
            └── zod-validation.pipe.ts  # Emits SRC1000 on invalid search params
```

### Search Modes (Progressive Enhancement)
```
keyword  → PostgreSQL plainto_tsquery + ts_rank_cd + ts_headline  ✅ Implemented
semantic → Qdrant vector similarity (cosine)                      🔲 Sprint 3
hybrid   → Reciprocal Rank Fusion (RRF) of keyword + semantic     🔲 Sprint 3
```

### SQL Pattern (Keyword Search)
```sql
SELECT f.id, f.original_filename, f.source_type, f.mime_type, f.updated_at,
       ts_rank_cd(f.fts_vector, query) AS score,
       ts_headline('kms_fts', f.extracted_text, query,
                   'MaxWords=50, MinWords=20, MaxFragments=3,
                    StartSel=<mark>, StopSel=</mark>') AS snippet
FROM kms.files f,
     plainto_tsquery('kms_fts', $1) query
WHERE f.fts_vector @@ query AND f.deleted_at IS NULL
ORDER BY score DESC
LIMIT $2 OFFSET $3
```

---

## 3. scan-worker (Python 3.12 + FastAPI)

**Port**: 8010 | **Queue**: kms.scan (in) → kms.embed + kms.dedup (out)

### Directory Structure
```
services/scan-worker/
├── Dockerfile                      # base → dependencies → development → production
├── requirements.txt                # fastapi, aio-pika, aiohttp, aiofiles, pydantic-settings, OTel
├── pyproject.toml                  # pytest asyncio-mode=auto, ruff config
├── app/
│   ├── config.py                   # Settings(BaseSettings): RabbitMQ, queues, KMS API URL
│   ├── worker.py                   # run_worker() — robust RabbitMQ connection + graceful shutdown
│   ├── main.py                     # FastAPI: starts worker as asyncio.Task, /health, /health/ready
│   ├── models/
│   │   └── messages.py             # ScanJobMessage, FileDiscoveredMessage, DedupCheckMessage
│   ├── connectors/
│   │   ├── base.py                 # BaseConnector ABC — connect/list_files/disconnect
│   │   ├── local.py                # LocalFileConnector — async rglob + SHA-256 checksum
│   │   └── registry.py             # get_connector(source_type) factory + register_connector()
│   ├── handlers/
│   │   └── scan_handler.py         # ScanHandler.handle() — drive connector, publish, update status
│   └── utils/
│       └── errors.py               # ScanWorkerError base + SCN1000-SCN4000 typed subclasses
└── tests/
    └── test_local_connector.py     # async: lists supported files, skips unsupported extensions
```

### Connector Extension Pattern
```python
# To add Google Drive: create app/connectors/google_drive.py
class GoogleDriveConnector(BaseConnector):
    source_type = SourceType.GOOGLE_DRIVE
    async def connect(self, config): ...
    async def list_files(self, job) -> AsyncIterator[FileDiscoveredMessage]: ...
    async def disconnect(self): ...

# Self-register at import time
register_connector(SourceType.GOOGLE_DRIVE, GoogleDriveConnector)
```

### Scan Job Lifecycle
```
kms.scan queue
  → ScanHandler.handle()
    → validate ScanJobMessage
    → PATCH kms-api: status = PROCESSING
    → get_connector(source_type).connect(config)
    → async for file in connector.list_files(job):
        → publish FileDiscoveredMessage → kms.embed
        → publish DedupCheckMessage → kms.dedup
    → PATCH kms-api: status = COMPLETED | FAILED
```

---

## 4. embed-worker (Python 3.12 + FastAPI)

**Port**: 8011 | **Queue**: kms.embed (in) | **DB**: kms.files (PostgreSQL)

### Directory Structure
```
services/embed-worker/
├── Dockerfile
├── requirements.txt                # aio-pika, asyncpg, pdfminer.six, python-docx, aiofiles
├── app/
│   ├── config.py                   # chunk_size=512, chunk_overlap=64, embedding_enabled=false
│   ├── worker.py                   # run_worker() consumes kms.embed queue
│   ├── main.py                     # FastAPI health wrapper around worker
│   ├── models/
│   │   └── messages.py             # FileDiscoveredMessage, TextChunk
│   ├── extractors/
│   │   ├── base.py                 # BaseExtractor ABC — extract(file_path) → str
│   │   ├── text.py                 # PlainTextExtractor (TXT, MD) — aiofiles async read
│   │   ├── pdf.py                  # PdfExtractor — pdfminer.six via asyncio.to_thread
│   │   └── registry.py             # MIME → extractor map; get_extractor(mime_type)
│   ├── chunkers/
│   │   └── text_chunker.py         # chunk_text(text) — overlap=64 chars, word-boundary snap
│   └── handlers/
│       └── embed_handler.py        # extract → chunk → upsert kms.files (ON CONFLICT checksum)
```

### Embedding Pipeline (Progressive)
```
FileDiscoveredMessage received
  → EmbedHandler.handle()
    → get_extractor(mime_type).extract(file_path)   # text extraction
    → chunk_text(extracted_text)                     # overlapping chunks
    → asyncpg upsert → kms.files                    # persist
    → [Future Sprint 3] generate_embeddings(chunks) # Ollama/OpenAI
    → [Future Sprint 3] qdrant.upsert(vectors)       # vector storage
```

### Adding a New Extractor
```python
# app/extractors/docx.py
class DocxExtractor(BaseExtractor):
    supported_mime_types = [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ]
    async def extract(self, file_path: Path) -> str:
        return await asyncio.to_thread(self._sync, file_path)
    def _sync(self, path): ...

# app/extractors/registry.py — add DocxExtractor to _register_all()
```

---

## 5. rag-service (Python 3.12 + FastAPI)

**Port**: 8002 | **LLM**: Ollama (local) / OpenRouter (cloud) | **Graceful Degrade**: ✅

### Directory Structure
```
services/rag-service/
├── Dockerfile
├── requirements.txt                # fastapi, asyncpg, aiohttp, OTel
├── app/
│   ├── config.py                   # LLM_ENABLED, LLM_PROVIDER, OLLAMA_MODEL, OPENROUTER_KEY
│   ├── main.py                     # asyncpg pool in lifespan, /health reports llm_enabled
│   ├── schemas/
│   │   └── chat.py                 # ChatRequest, ChatResponse, Citation, Message
│   ├── services/
│   │   ├── retriever.py            # ContextRetriever — PostgreSQL FTS + ts_headline citations
│   │   └── generator.py            # LLMGenerator — Ollama/OpenRouter + fallback mode
│   └── api/v1/
│       ├── router.py               # Mounts chat router at /api/v1
│       └── endpoints/
│           └── chat.py             # POST /api/v1/chat/completions (streaming SSE + JSON)
```

### Chat Endpoint Flow
```
POST /api/v1/chat/completions { question, stream: true }
  → ContextRetriever.retrieve(question)     # PostgreSQL FTS → formatted context + citations
  → LLMGenerator.generate_stream(q, ctx)   # Ollama SSE stream
  → StreamingResponse (text/event-stream)
      data: {"token": "The answer..."}\n\n
      data: {"token": " is 42."}\n\n
      data: {"citations": [...], "done": true}\n\n
```

### Graceful Degradation
```python
# LLM_ENABLED=false → LLMGenerator._fallback_response()
# Returns search excerpts as plain text instead of LLM-generated answer
# Frontend shows "LLM disabled" badge but still shows relevant documents
```

---

## 6. voice-app (Python 3.12 + FastAPI) — Legacy Prototype

**Port**: 8003 | **Worker Port**: internal | **Queue**: transcription.queue

### Directory Structure
```
backend/                            # Root-level (legacy location)
├── alembic.ini                     # ← ADDED: Alembic config
├── alembic/                        # ← ADDED: Migration scripts
│   ├── env.py                      # Async migration runner
│   ├── versions/
│   │   ├── 001_initial_schema.py   # Full voice-app schema
│   │   └── 002_kms_integration.py  # kms_file_id + pushed_to_kms fields
├── app/
│   ├── main.py                     # FastAPI; runs Alembic migrations on startup
│   ├── config.py                   # Pydantic Settings
│   ├── api/v1/endpoints/           # jobs, transcriptions, upload, models
│   ├── db/
│   │   ├── session.py              # AsyncSessionLocal
│   │   └── models/                 # Job, Transcription, Translation, APIKey, BatchJob
│   ├── services/
│   │   ├── transcription/          # BaseProvider + Whisper, Groq, Deepgram
│   │   ├── translation/            # OpenAI, Gemini translators
│   │   └── audio/                  # FFmpeg processor
│   └── workers/
│       ├── consumer.py             # RabbitMQ consumer
│       └── job_dispatcher.py       # PENDING → QUEUED dispatcher
└── Dockerfile                      # Multi-stage with development target
```

### KMS Integration Points
```python
# Job.kms_file_id (UUID, nullable) — links voice job to kms.files
# Transcription.pushed_to_kms (bool) — tracks if text sent to embed-worker
# Flow: voice transcription complete → HTTP POST → kms-api → kms.embed queue
```

---

## Service Port Map

| Service | Port | Protocol | Internal URL |
|---------|------|----------|--------------|
| kms-api | 8000 | HTTP/REST | http://kms-api:8000 |
| search-api | 8001 | HTTP/REST | http://search-api:8001 |
| rag-service | 8002 | HTTP/REST + SSE | http://rag-service:8002 |
| voice-app | 8003 | HTTP/REST | http://voice-app:8000 |
| scan-worker | 8010 | Health only | http://scan-worker:8010 |
| embed-worker | 8011 | Health only | http://embed-worker:8011 |
| web-ui | 3000 | HTTP | http://web-ui:3000 |

---

## Basic Flow: File Indexing End-to-End

```
1. User registers                           kms-api POST /api/v1/auth/register
2. User creates source (local path)         kms-api POST /api/v1/sources
3. kms-api publishes scan job               RabbitMQ → kms.scan queue
4. scan-worker picks up job                 Connects LocalFileConnector
5. For each .pdf/.txt/.md file found:
   a. Publish FileDiscoveredMessage         RabbitMQ → kms.embed queue
   b. Publish DedupCheckMessage             RabbitMQ → kms.dedup queue
6. scan-worker PATCH status = COMPLETED     HTTP → kms-api
7. embed-worker picks up FileDiscovered:
   a. Extract text (PdfExtractor etc.)
   b. Chunk text (512 chars, 64 overlap)
   c. Upsert into kms.files with fts_vector  PostgreSQL
8. User searches                            search-api GET /api/v1/search?q=...
9. User asks question                       rag-service POST /api/v1/chat/completions
```

---

## Technology Decisions

| Concern | Choice | Reason |
|---------|--------|--------|
| NestJS compiler | SWC | 20x faster than tsc, decorator metadata preserved |
| NestJS transport | Fastify | Lower overhead than Express, native async |
| Queue client | aio-pika (Python) / BullMQ (Node) | async-native, retry/DLX built-in |
| DB client (Python workers) | asyncpg | Fastest PostgreSQL async driver |
| DB client (kms-api) | Prisma | Type-safe migrations, easy relations |
| Search (keyword) | PostgreSQL FTS | No extra service, kms_fts config with unaccent |
| Search (semantic) | Qdrant | Purpose-built vector DB, gRPC + HTTP |
| Text extraction | pdfminer.six, docx | Pure Python, no system deps |
| LLM | Ollama local → OpenRouter fallback | Privacy-first, swappable via config |
| Streaming | SSE (server-sent events) | Simpler than WebSocket for one-way LLM stream |
