# Shared Project Variables

All agents reference this file for project constants. Do not duplicate these values in individual agent files.

---

## Project Identity

| Variable | Value |
|----------|-------|
| Project Name | Knowledge Management System (KMS) |
| Primary Backend | NestJS (TypeScript) — kms-api, search-api |
| Secondary Backend | Python FastAPI — voice-app workers, embedding workers |
| Database | PostgreSQL (primary), Qdrant (vectors), Neo4j (graph) |
| Object Storage | MinIO |
| Cache | Redis |
| Message Queue | RabbitMQ |
| Auth Method | JWT (user sessions) + API Key (service-to-service, X-API-Key header) |
| ORM | TypeORM (NestJS), SQLAlchemy async (Python) |
| Skill Prefix | `kb-` |

---

## Key File Paths

| Purpose | Path |
|---------|------|
| TypeORM entities | `kms-api/src/db/entities/` |
| TypeORM migrations | `kms-api/src/db/migrations/` |
| NestJS modules | `kms-api/src/modules/` |
| NestJS API endpoints | `kms-api/src/modules/*/controllers/` |
| NestJS services | `kms-api/src/modules/*/services/` |
| NestJS DTOs | `kms-api/src/modules/*/dto/` |
| Search API | `search-api/src/` |
| Python workers | `services/` |
| Python services | `services/` |
| Transcription providers | `services/voice-app/` |
| Embedding workers | `services/embed-worker/` |
| Python config | `services/*/config.py` |
| Frontend pages | `frontend/app/` |
| Frontend API client | `frontend/lib/api.ts` |
| Docker dev config | `docker-compose.yml` + `docker-compose.override.yml` |
| Docker prod config | `docker-compose.prod.yml` |
| Agent source | `docs/agents/` |
| Installed skills | `.claude/skills/` |

---

## Service Ports

| Service | Port | Notes |
|---------|------|-------|
| kms-api (NestJS) | 8000 | Primary REST API |
| search-api (NestJS) | 8001 | Search-specific endpoints |
| voice-app (Python FastAPI) | 8003 | Transcription service |
| Frontend (Next.js) | 3000 | Web UI |
| PostgreSQL | 5432 | Exposed on localhost in dev |
| Qdrant | 6333 (HTTP) / 6334 (gRPC) | Vector store |
| Neo4j | 7474 (HTTP) / 7687 (Bolt) | Graph database |
| Redis | 6379 | Cache and session store |
| RabbitMQ | 5672 (AMQP) / 15672 (Management UI) | Message queue |
| MinIO | 9000 (API) / 9001 (Console) | Object storage |
| Jaeger | 16686 (UI) / 4317 (OTLP gRPC) | Distributed tracing |
| Prometheus | 9090 | Metrics scraping |
| Grafana | 3001 | Metrics dashboards |

---

## Job Statuses

Used for both voice transcription jobs and embedding/scan jobs:

| Status | Meaning |
|--------|---------|
| `PENDING` | Created in DB, not yet published to queue |
| `QUEUED` | Published to RabbitMQ, awaiting worker pickup |
| `PROCESSING` | Worker actively processing |
| `COMPLETED` | Successfully processed |
| `FAILED` | Error occurred — see `error_message` field |
| `CANCELLED` | User-initiated cancellation |

---

## Source Types (Document Sources)

| Type | Description |
|------|-------------|
| `GOOGLE_DRIVE` | Google Drive folder/file sync |
| `LOCAL_FS` | Local filesystem mount |
| `EXTERNAL_DRIVE` | External storage device |

---

## File Processing Statuses

| Status | Meaning |
|--------|---------|
| `PENDING` | File queued for processing |
| `EXTRACTING` | Text extraction in progress (PDF parse, DOCX parse, etc.) |
| `EMBEDDING` | Text chunks being vectorized |
| `COMPLETED` | File fully processed and indexed |
| `FAILED` | Processing error — see `error_details` |

---

## Queue Names (RabbitMQ)

| Queue | Routing Key | Purpose |
|-------|-------------|---------|
| `kms.scan` | `scan` | Document source scan jobs |
| `kms.embed` | `embed` | Embedding generation jobs |
| `kms.dedup` | `dedup` | Deduplication check jobs |
| `trans.queue` | `transcription` | Voice transcription jobs |
| `priority.queue` | `priority` | High-priority jobs (any type) |
| `failed.queue` | — | Dead letter queue for all failed messages |

**Exchange:** `kms.direct` (direct exchange)
**Dead Letter Exchange:** `kms.dlx`

---

## Embedding Model

| Property | Value |
|----------|-------|
| Model | `BAAI/bge-m3` |
| Dimensions | 1024 |
| Source | sentence-transformers (HuggingFace) |
| Qdrant distance metric | Cosine |
| Qdrant collection | `kms_documents` |

---

## Error Code Prefixes

Each service domain has a reserved prefix for error codes:

| Prefix | Domain |
|--------|--------|
| `KMS` | General KMS application errors |
| `SRC` | Source management (Google Drive, local FS) |
| `SCN` | Scan job errors |
| `EMB` | Embedding worker errors |
| `DUP` | Deduplication errors |
| `JNK` | Junk/filter errors |
| `SRH` | Search errors |
| `TRN` | Transcription errors |
| `AUTH` | Authentication/authorization errors |
| `API` | Generic API validation errors |

Error code format: `<PREFIX>_<NUMBER>` (e.g., `SRH_001`, `TRN_404`, `AUTH_403`)

---

## Database Domain Prefixes

All PostgreSQL tables use domain-prefixed naming:

| Prefix | Domain |
|--------|--------|
| `auth_*` | Authentication: `auth_users`, `auth_api_keys`, `auth_sessions` |
| `kms_*` | Knowledge base: `kms_documents`, `kms_sources`, `kms_tags`, `kms_embeddings`, `kms_scan_jobs` |
| `voice_*` | Voice/transcription: `voice_jobs`, `voice_transcriptions` |

---

## NestJS Layered Architecture

All NestJS code follows a strict layered pattern:

```
Controller (HTTP layer)
    → validates input via DTO + class-validator
    → delegates to Service

Service (Business logic layer)
    → orchestrates domain logic
    → calls Repository or external clients
    → never directly queries DB

Repository (Data access layer)
    → TypeORM repository or custom repository
    → executes queries, handles transactions
    → returns entities

Database
    → PostgreSQL via TypeORM
```

**Module structure:**

```
modules/<domain>/
    <domain>.module.ts
    controllers/
        <domain>.controller.ts
        <domain>.controller.spec.ts
    services/
        <domain>.service.ts
        <domain>.service.spec.ts
    repositories/
        <domain>.repository.ts
    dto/
        create-<domain>.dto.ts
        update-<domain>.dto.ts
    entities/           (or import from db/entities/)
```

---

## Mandatory Coding Patterns

### NestJS

- All DTOs use `class-validator` decorators (`@IsString()`, `@IsOptional()`, etc.)
- All responses use consistent envelope: `{ data, meta?, error? }`
- All errors use structured format: `{ code, message, details? }`
- Services throw typed `AppException` (never raw `Error`)
- Repository methods are named: `findById`, `findAll`, `create`, `update`, `delete`
- All endpoints require `@UseGuards(ApiKeyGuard)` unless explicitly public
- Use `@Transactional()` decorator or manual `queryRunner` for multi-step DB operations

### Python Workers

- All workers extend `BaseWorker` abstract class
- Workers use `async/await` throughout (aio-pika, asyncpg)
- All exceptions caught and re-raised as `WorkerException` with job ID
- Job status updates wrapped in DB transaction
- Batch sizes: embedding=32, scan=100, dedup=50
- Retry policy: 3 attempts, exponential backoff (1s, 2s, 4s)

---

## Transaction Rules

1. Any operation that modifies more than one table must use a transaction.
2. Job status updates (PENDING → QUEUED → PROCESSING → COMPLETED/FAILED) are always transactional.
3. Embedding insert + document status update must be atomic.
4. Never hold a transaction open across a network call (HTTP, RabbitMQ).
