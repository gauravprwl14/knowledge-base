# Knowledge Management System (KMS)

A self-hosted, AI-powered knowledge management platform. Ingest files from local folders, Google Drive, and Obsidian vaults — then search, chat, and discover relationships across your entire knowledge base.

## Stack

| Layer | Technology |
|---|---|
| API | NestJS 11 (Fastify) — TypeScript |
| Search | NestJS 11 — read-only hybrid search |
| AI / RAG | FastAPI — LangGraph streaming chat |
| Transcription | FastAPI — Whisper / Groq / Deepgram |
| Workers | Python — AMQP consumers (scan, embed, dedup, graph) |
| Database | PostgreSQL 17 |
| Vector store | Qdrant |
| Graph | Neo4j |
| Cache / Queue | Redis + RabbitMQ |
| Object storage | MinIO |
| Observability | OpenTelemetry → Jaeger + Prometheus + Grafana |
| Frontend | Next.js 15 (React 19) |

## Services

| Service | Port | Description |
|---|---|---|
| `kms-api` | 8000 | Core REST API — auth, files, sources, collections |
| `search-api` | 8001 | Read-only hybrid search (keyword + semantic) |
| `rag-service` | 8002 | RAG chat pipeline, SSE streaming |
| `voice-app` | 8010 | Transcription microservice |
| `scan-worker` | — | File discovery AMQP consumer |
| `embed-worker` | — | BGE-M3 embedding generation |
| `dedup-worker` | — | Exact + semantic deduplication |
| `graph-worker` | — | Neo4j relationship builder |
| `frontend` | 3001 | Next.js web UI |

**Infrastructure:**

| Service | Port | URL |
|---|---|---|
| PostgreSQL | 5432 | — |
| Redis | 6379 | — |
| RabbitMQ | 5672 | http://localhost:15672 (management) |
| Qdrant | 6333 | http://localhost:6333/dashboard |
| Neo4j | 7474 | http://localhost:7474 |
| MinIO | 9000 | http://localhost:9001 (console) |
| Grafana | 3000 | http://localhost:3000 |
| Tempo | 3200 | http://localhost:3200 |
| Loki | 3100 | internal only |
| Prometheus | 9090 | http://localhost:9090 |

## Quick Start

### Prerequisites

- [Podman Desktop](https://podman-desktop.io/) + `podman-compose`
- Node.js ≥ 20 (for local dev)
- Python 3.11+ (for local dev)

### 1. Environment Setup

```bash
cp .env.example .env
# Edit .env — required secrets:
# JWT_SECRET, JWT_REFRESH_SECRET, API_KEY_ENCRYPTION_SECRET (each ≥ 32 chars)
```

### 2. Start the Stack

```bash
# Core services only (API + infra)
/opt/homebrew/bin/podman-compose -f docker-compose.kms.yml up -d postgres redis rabbitmq kms-api

# Full stack
./scripts/kms-start.sh

# With local LLM (Ollama)
./scripts/kms-start.sh --llm
```

### 3. Verify

```bash
curl http://localhost:8000/api/v1/health/live
# → {"success":true,"data":{"status":"ok",...}}
```

### 4. Register + Login

```bash
# Register
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"YourPass1!","confirmPassword":"YourPass1!","firstName":"Your","lastName":"Name"}'

# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"YourPass1!"}'
# → returns accessToken + refreshToken
```

API docs (Swagger): http://localhost:8000/docs

## Development

```bash
# kms-api hot reload
cd kms-api && npm run start:dev

# Run tests
cd kms-api && npm test

# Prisma migrations
cd kms-api && npm run prisma:migrate:dev

# Lint
cd kms-api && npm run lint
```

## Logs

```bash
/opt/homebrew/bin/podman-compose -f docker-compose.kms.yml logs -f kms-api
/opt/homebrew/bin/podman-compose -f docker-compose.kms.yml logs -f postgres
```

## Folder Structure

```
knowledge-base/
├── kms-api/              # NestJS 11 — core API
├── services/
│   ├── search-api/       # NestJS 11 — hybrid search
│   ├── rag-service/      # FastAPI — RAG + streaming chat
│   ├── scan-worker/      # Python — file discovery
│   ├── embed-worker/     # Python — BGE-M3 embeddings
│   ├── dedup-worker/     # Python — deduplication
│   └── graph-worker/     # Python — Neo4j builder
├── frontend/             # Next.js 15 web UI
├── packages/             # Shared TS: @kb/errors, @kb/logger, @kb/tracing
├── contracts/            # OpenAPI 3.1 contract
├── docs/                 # Architecture, PRDs, ADRs, guides
├── infra/                # OTel collector, Prometheus, Grafana
└── scripts/              # kms-start.sh and utilities
```

## Deployment

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for the full production deployment guide, including:

- Server requirements and firewall setup
- Nginx reverse proxy configuration (path routing for all services)
- SSL/TLS setup via Let's Encrypt
- Environment variables reference
- Database migrations
- Backup strategy
- Rolling updates with zero downtime

Production Docker Compose: `docker-compose.prod.yml`
Nginx config template: `infra/nginx/nginx.conf`

## Documentation

- **Production deployment**: `docs/DEPLOYMENT.md`
- **Architecture & standards**: `docs/architecture/ENGINEERING_STANDARDS.md`
- **Engineering workflow**: `docs/workflow/ENGINEERING_WORKFLOW.md`
- **PRDs**: `docs/prd/`
- **ADRs**: `docs/architecture/decisions/`
- **Feature guides**: `docs/development/`
- **Workspace routing**: `CLAUDE.md`

## Error Codes

Format: `KB{domain}{4-digit}` — e.g. `KBAUT0001`, `KBFIL0001`, `KBSRC0001`

| Prefix | Domain |
|---|---|
| KBGEN | General |
| KBAUT | Auth |
| KBFIL | Files |
| KBSRC | Sources |
| KBSCH | Search |
| KBWRK | Workers |
| KBRAG | RAG |
