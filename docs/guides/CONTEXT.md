# guides/ — Layer 2 Router

Operational guides for running, deploying, and setting up the KMS stack.

---

## Routing Table

| Question / Task | Load This File |
|-----------------|----------------|
| How do I set up Google Drive OAuth and connector? | `FOR-google-drive-setup.md` |
| How do I start the full KMS stack? | See **Docker Compose Files** section below |
| How do I run a specific service locally? | See **Docker Compose Files** section below |
| How do I set up for the first time? | `GETTING_STARTED.md` + `.env.kms.example` |
| How do I deploy to production / VPS? | `FOR-deployment.md` — full runbook with migration-first pattern |
| What environment variables are required? | `GETTING_STARTED.md` + `.env.kms.example` |
| How do I access RabbitMQ / MinIO / Neo4j / Grafana UI? | See **Docker Compose Files** section below |
| How do I run tests in Docker? | `docker-compose.test.yml` — see **Docker Compose Files** section below |

---

## Docker Compose Files

All compose files live in the knowledge-base repo root (`/knowledge-base/`).

| File | Status | Purpose | When to Use |
|------|--------|---------|-------------|
| `docker-compose.kms.yml` | **ACTIVE — primary dev** | Full stack dev with hot-reload, infrastructure + all services | Local development |
| `docker-compose.prod.yml` | **ACTIVE — production** | Production builds, no hot-reload, multi-stage images | Deploy to VPS/server |
| `docker-compose.dev-override.yml` | **ACTIVE — hybrid** | Overrides for hot-reload on just the API while infra runs from kms.yml | Hybrid dev (run with `-f docker-compose.kms.yml -f docker-compose.dev-override.yml`) |
| `docker-compose.test.yml` | **ACTIVE — CI/testing** | Isolated test environment for running automated tests | CI pipeline, `npm run test:e2e` |
| `docker-compose.yml` | **DEPRECATED** | Old single-project structure — references `./backend` and `./frontend` paths that no longer exist | Do not use |

### Usage Examples

```bash
# Development (full stack, hot-reload)
docker compose -f docker-compose.kms.yml --env-file .env.kms up -d

# Production
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Hybrid dev (infra from kms.yml + API hot-reload)
docker compose -f docker-compose.kms.yml -f docker-compose.dev-override.yml --env-file .env.kms up -d

# CI tests
docker compose -f docker-compose.test.yml up --abort-on-container-exit

# NEVER USE — deprecated
# docker compose up   (uses docker-compose.yml which is broken)
```

---

## Files in this folder

| File | Purpose |
|------|---------|
| `FOR-deployment.md` | Production deployment runbook — pre-deploy checklist, migration-first pattern, rollback, common mistakes |
| `FOR-google-drive-setup.md` | Step-by-step Google Drive OAuth setup and connector configuration |
| `GETTING_STARTED.md` | Legacy getting-started reference (pre-3-layer structure) |
| `ARCHITECTURE_GUIDE.md` | Legacy architecture guide |
| `ARCHITECTURE_OVERVIEW.md` | Legacy architecture overview |
| `COMPONENT_SYSTEM.md` | Legacy component system reference |
| `CONTAINER_GUIDE.md` | Legacy container/Docker guide |
| `ERROR_GUIDE.md` | Legacy error handling guide |
| `GENERIC_CODING_PRACTICES.md` | Legacy coding practices |
| `QUICK_START.md` | Legacy quick start |
| `SETUP_GUIDE.md` | Legacy setup guide |
| `TESTING_HANDBOOK.md` | Legacy testing handbook |
| `UI_UX_GUIDE.md` | Legacy UI/UX guide |

---

## Naming Conventions

- Operational guides: `FOR-{topic}.md` (kebab-case)
