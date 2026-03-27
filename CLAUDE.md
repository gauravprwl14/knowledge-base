# Knowledge Base System (KMS) — Workspace Router

NestJS 11 (Fastify) + Python 3.11 (FastAPI) + PostgreSQL 16 + Qdrant + Neo4j + Redis + RabbitMQ.
Monorepo: 2 NestJS services + 6 Python services. Feature-flag-driven. OTel-instrumented end-to-end.

## Folder Map

| Folder | Purpose |
|--------|---------|
| `kms-api/` | NestJS 11 — core REST API: auth, files, sources, users, collections, agent orchestrator |
| `search-api/` | NestJS 11 — read-only hybrid search service (port 8001) |
| `services/voice-app/` | FastAPI — transcription microservice (port 8003) |
| `services/rag-service/` | FastAPI — RAG pipeline, SSE streaming chat (port 8002) |
| `services/scan-worker/` | Python — AMQP consumer, file discovery |
| `services/embed-worker/` | Python — AMQP consumer, BGE-M3 embedding generation |
| `services/dedup-worker/` | Python — AMQP consumer, deduplication |
| `services/graph-worker/` | Python — AMQP consumer, Neo4j relationship builder |
| `packages/` | Shared TS: `@kb/errors`, `@kb/logger`, `@kb/tracing`, `@kb/contracts` |
| `contracts/openapi.yaml` | OpenAPI 3.1 — single source of truth for all API contracts |
| `docs/` | All documentation — see `docs/CONTEXT.md` to navigate |
| `infra/` | OTel collector, Prometheus, Grafana configs |
| `scripts/` | kms-start.sh and utility scripts |
| `.kms/config.json` | Runtime feature flags (embedding, graph, RAG, etc.) |

## Naming Conventions

- **NestJS files**: `kebab-case` with suffix — `files.service.ts`, `create-file.dto.ts`, `files.controller.spec.ts`
- **Python files**: `snake_case` — `scan_handler.py`, `embed_service.py`
- **NestJS classes**: `PascalCase` — `FilesService`, `CreateFileDto`, `JwtAuthGuard`
- **Python classes**: `PascalCase` — `LocalFileConnector`, `ScanJobMessage`
- **Error codes**: `KB` + domain + 4-digit — `KBGEN0001`, `KBAUT0001`, `KBFIL0001`, `KBSRC0001`, `KBSCH0001`, `KBWRK0001`, `KBRAG0001`
- **DB tables**: domain prefix + snake_case plural — `kms_files`, `auth_users`, `voice_jobs`
- **RabbitMQ queues**: `kms.{domain}` — `kms.scan`, `kms.embed`, `kms.dedup`
- **PRDs**: `docs/prd/PRD-{feature-name}.md` (kebab-case after PRD-)
- **ADRs**: `docs/architecture/decisions/NNNN-{title}.md` (zero-padded 4-digit)
- **Feature guides**: `FOR-{feature}.md` inside relevant `docs/` subfolder

## Routing Table — What to Load

| Task | Load | Skip |
|------|------|------|
| Plan or design a new feature | `docs/workflow/ENGINEERING_WORKFLOW.md` | everything else |
| Understand an existing feature | `docs/prd/CONTEXT.md` → relevant `PRD-*.md` | `development/` |
| Add NestJS endpoint or module | `docs/development/CONTEXT.md` → `FOR-nestjs-patterns.md`, `FOR-error-handling.md` | `architecture/` |
| Add FastAPI endpoint or Python worker | `docs/development/CONTEXT.md` → `FOR-python-patterns.md`, `FOR-error-handling.md` | `architecture/` |
| Add structured logging | `docs/development/CONTEXT.md` → `FOR-logging.md` | `architecture/` |
| Add tracing / OTel span | `docs/development/CONTEXT.md` → `FOR-observability.md` | `guides/` |
| Write or fix tests | `docs/development/CONTEXT.md` → `FOR-testing.md` | `architecture/` |
| DB schema or Prisma migration | `docs/development/CONTEXT.md` → `FOR-database.md` | `agents/` |
| API contract / endpoint design | `docs/development/CONTEXT.md` → `FOR-api-design.md` | `architecture/` |
| Architecture Decision Record | `docs/architecture/CONTEXT.md` → ADR template in decisions/ | `development/` |
| Docker / infra / start the stack | `docs/guides/CONTEXT.md` → `FOR-docker.md` | `development/` |
| Agent or skill question | `docs/agents/CONTEXT.md` | `development/` |
| Full coding standards reference | `docs/architecture/ENGINEERING_STANDARDS.md` | everything else |

## Definition of Done (DoD) — Non-Negotiable Gate

**Every feature is DONE only when it passes all gates in `docs/workflow/DEFINITION-OF-DONE.md`.**

Quick summary — a task is NOT done if any of these are missing:
- [ ] ADR written for every non-obvious technology choice
- [ ] Sequence diagram for every new cross-service data flow
- [ ] Unit tests ≥ 80% coverage + error branches tested
- [ ] Structured logs on all significant events (no `console.log`/`print`)
- [ ] TSDoc/docstrings on all new public exports
- [ ] CONTEXT.md updated if new module/file added
- [ ] No hardcoded secrets or raw PII in logs
- [ ] DB migrations are backward-compatible

Run `/task-completion-check` to validate any completed task against the full 10-gate checklist.

## Skill Registry — What Each Skill Does and When to Use It

> The description field in each SKILL.md is the sole routing signal. Skills fire based on language matching, not keyword matching. Make sure your question uses the trigger phrases below.

| Skill | Use When | Trigger Phrases |
|-------|----------|-----------------|
| `kb-architect` | System design, ADR writing, sequence diagrams, technology decisions | "design the architecture", "write an ADR", "should we use X or Y", "system design" |
| `kb-backend-lead` | NestJS modules, services, controllers, Prisma, TypeScript | "add a NestJS endpoint", "create a service", "implement a controller", "wire up a module" |
| `kb-python-lead` | FastAPI endpoints, AMQP workers, asyncpg, aio-pika, pytest | "write a worker", "fix a FastAPI error", "implement a consumer", "write pytest tests" |
| `kb-db-specialist` | PostgreSQL schemas, Prisma migrations, query optimization | "create a migration", "design the schema", "optimize this query", "add an index" |
| `kb-api-designer` | REST API contracts, OpenAPI specs, DTOs, HTTP semantics | "design the API", "write the OpenAPI spec", "define the DTO", "review the API contract" |
| `kb-search-specialist` | BM25, Qdrant, RRF, tiered retrieval, search relevance | "improve search results", "hybrid search", "search is returning wrong results", "Qdrant query" |
| `kb-embedding-specialist` | File extractors, text chunking, BGE-M3, vector indexing | "add a file extractor", "chunk the content", "embedding pipeline", "Qdrant collection" |
| `kb-qa-architect` | Test strategy, pytest/Jest patterns, coverage, E2E | "write tests", "test coverage", "how to test this", "fix flaky test", "E2E test" |
| `kb-security-review` | OWASP checks, auth review, PII audit, threat modeling | "security review", "is this secure", "audit the auth", "check for SQL injection" |
| `kb-observability` | OTel spans, Prometheus metrics, Grafana, structured logging | "add tracing", "instrument this service", "configure OTel", "add Prometheus metric" |
| `kb-platform-engineer` | Docker Compose, CI/CD, environment config, healthchecks | "add to docker-compose", "Docker won't start", "configure healthcheck", "set up CI" |
| `kb-product-manager` | PRDs, acceptance criteria, feature scope, success metrics | "write a PRD", "define requirements", "what's in scope", "prioritize these features" |
| `kb-tech-lead` | Sprint planning, milestone tracking, task breakdown, risk | "plan the sprint", "estimate this task", "what's blocking", "risk assessment" |
| `kb-doc-engineer` | CONTEXT.md updates, FOR-*.md guides, doc quality | "write the docs", "update CONTEXT.md", "create a feature guide", "documentation is outdated" |
| `kb-voice-specialist` | Whisper integration, voice-app, kms.transcription queue | "transcription", "voice app", "Whisper", "audio processing", "transcription job" |
| `kb-coordinate` | Multi-domain problems needing specialist routing | "I need to build X from scratch", "which agent should I use", "route this problem" |
| `task-completion-check` | DoD audit before merging any feature | "check if this is done", "DoD check", "is this ready to merge", "run the checklist" |

## Agent Quick Reference

| Need | Command |
|------|---------|
| Run DoD checklist on completed work | `/task-completion-check` |
| Classify + route to right agent | `/coordinate` |
| Plan multi-step work | `/plan` |
| Sync docs after code change | `/sync-docs` |
| Create a new feature guide | `/new-feature-guide` |
| Lint documentation quality | `/lint-docs` |
| Onboard new developer | `/onboard` |

## Mandatory Patterns

Full details in `docs/architecture/ENGINEERING_STANDARDS.md`. Summary only:

- **Errors NestJS**: `AppException` from `@kb/errors` — never raw `HttpException`. Include KB error code.
- **Errors Python**: typed subclass of `KMSWorkerError` with `.code` and `.retryable`.
- **Logging NestJS**: `@InjectPinoLogger(ClassName.name)` — never `new Logger()`.
- **Logging Python**: `structlog.get_logger(__name__).bind(...)` — never `logging.getLogger()`.
- **DB NestJS**: `PrismaService` injected — never call Prisma client directly in service methods.
- **DB Python API**: SQLAlchemy async. **DB Python worker**: raw `asyncpg`.
- **AMQP**: `aio-pika connect_robust()`. `nack(requeue=True)` for retryable, `reject()` for terminal errors.
- **Docs NestJS**: TSDoc on all exports + `@ApiOperation`/`@ApiResponse` on all endpoints.
- **Docs Python**: Google-style docstrings on all `def` and classes.
- **OTel NestJS**: `import './instrumentation'` must be line 1 of `main.ts`.
- **OTel Python**: `configure_telemetry(app)` before any route imports inside lifespan.
- **Embedding model**: `BAAI/bge-m3` at 1024 dimensions — NOT nomic-embed-text or all-MiniLM.

## Engineering Workflow

For any non-trivial feature — in this order, no skipping:

1. **PRD** — `docs/prd/PRD-{feature}.md` (use template at `docs/workflow/PRD-TEMPLATE.md`)
2. **ADR** — `docs/architecture/decisions/` for each non-obvious technology choice
3. **Sequence diagram** — `docs/architecture/sequence-diagrams/` for each new data flow
4. **Feature guide** — `FOR-{feature}.md` in relevant `docs/development/` or `docs/prd/` subfolder
5. **Implementation** — follow mandatory patterns above
6. **Tests** — 80% minimum coverage; run `/sync-docs` when done

See `docs/workflow/ENGINEERING_WORKFLOW.md` for the full process with gate criteria.

## Quick Commands

```bash
./scripts/kms-start.sh               # Start full KMS stack (Docker)
./scripts/kms-start.sh --stop        # Stop all services
./scripts/kms-start.sh --llm         # Start with Ollama LLM
docker compose -f docker-compose.kms.yml logs -f [service-name]

# kms-api development
cd kms-api && npm run start:dev       # Hot reload dev server
cd kms-api && npm run test            # Run tests
cd kms-api && npm run prisma:migrate:dev  # Create/apply migration
cd kms-api && npm run lint            # Lint + fix
```


## gstack

- Use the `/browse` skill from gstack for all web browsing — never use `mcp__claude-in-chrome__*` tools directly.
- Available gstack skills: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/cso`, `/autoplan`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`
