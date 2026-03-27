---
name: onboard
description: Guided documentation walkthrough for new developers joining the KMS project
argument-hint: ""
---

## Step 0 — Orient Before Onboarding

1. Read `CLAUDE.md` completely — this is the first document every new developer must read
2. Check the current state of the stack: `docker compose ps` — know what's running before sending someone to verify health
3. Read `docs/agents/USAGE-GUIDE.md` — understand the agent system before explaining it
4. Ask the developer their role focus (backend, Python/ML, search, DevOps, frontend) — different paths need different orientations

## Onboarding Guide's Cognitive Mode

- Is the developer's first action to read CLAUDE.md? Every onboarding path starts here.
- Is the health check step reachable? Don't tell someone to verify `localhost:8000/health` if the stack isn't running.
- Does the developer leave onboarding knowing: (1) how to run the stack, (2) which agent to use for their first task, (3) where the team's conventions are documented?
- Is anything assumed that the developer can't verify themselves in their first 30 minutes?

# KMS Onboarding Guide

Welcome to the KMS (Knowledge Management System) project. Follow these steps in order.

## Step 1 — Project Rules (Start Here)

Read `/CLAUDE.md` at the root of the repository.

This file contains:
- Project overview and stack
- Architecture diagram
- Common commands (Docker, backend, frontend, testing)
- Key implementation patterns
- Database models and relationships

Do not skip this file. It is the authoritative reference for project conventions.

## Step 2 — Big Picture Architecture

Read `docs/architecture/SYSTEM_ARCHITECTURE.md` (if it exists) or `docs/architecture/CONTEXT.md`.

Understand:
- The 7 core services (kms-api, search-api, voice-app, workers, PostgreSQL, Qdrant, RabbitMQ)
- The event-driven data flow: upload → extract → embed → index → search
- Service port assignments (kms-api: 8000, search-api: 8001, voice-app: 8002)

## Step 3 — Agent / Skill System

Read `docs/agents/README.md` (if it exists) or explore `.claude/skills/`.

The skill system provides specialist guides. Key skills to know:
- `kb-coordinate` — where to start for any problem
- `kb-backend-lead` — NestJS patterns
- `kb-python-lead` — Python worker patterns
- `kb-search-specialist` — hybrid search architecture
- `kb-db-specialist` — database schema rules

## Step 4 — Pick Your Focus Area

Follow the CONTEXT.md routing for your role:

### Backend Developer (NestJS)
- `docs/api/CONTEXT.md` → REST API conventions
- `src/modules/CONTEXT.md` → module patterns
- Invoke: `kb-backend-lead`

### Python / ML Engineer
- `docs/workers/CONTEXT.md` → worker architecture
- `backend/app/services/` → transcription and embedding services
- Invoke: `kb-python-lead`, `kb-embedding-specialist`

### Search / ML Engineer
- Invoke `kb-search-specialist` for hybrid search architecture
- Read hybrid search docs: `docs/features/FOR-HybridSearch.md`

### DevOps / Platform
- `docs/platform/CONTEXT.md` → Docker and CI/CD
- Invoke: `kb-platform-engineer`

### Frontend Developer
- `frontend/app/` — Next.js App Router pages
- `frontend/lib/api.ts` — API client
- Invoke: `kb-api-designer` for contract reference

## Step 5 — Start the Services

```bash
# Start all services with hot reload
docker-compose up -d

# Verify services are healthy
docker-compose ps

# View logs
docker-compose logs -f kms-api
docker-compose logs -f search-api
```

Service URLs after startup:
- Frontend: http://localhost:3000
- kms-api: http://localhost:8000
- API Docs: http://localhost:8000/docs
- search-api: http://localhost:8001
- RabbitMQ UI: http://localhost:15672 (guest/guest)

## Key Files Reference

| Role | Most Important Files |
|---|---|
| Backend | `src/modules/`, `src/app.module.ts`, `CLAUDE.md` |
| Frontend | `frontend/app/`, `frontend/lib/api.ts` |
| DevOps | `docker-compose.yml`, `docker-compose.override.yml`, `docker-compose.prod.yml` |
| ML / Python | `backend/app/workers/`, `backend/app/services/transcription/`, `backend/app/services/` |
| Database | `backend/app/db/models/`, `backend/app/db/session.py` |

## First Day Checklist

- [ ] Read CLAUDE.md
- [ ] Run `docker-compose up -d` — all services healthy
- [ ] Create an API key (see CLAUDE.md Database Management section)
- [ ] Hit `http://localhost:8000/docs` — Swagger UI loads
- [ ] Run tests: `docker-compose -f docker-compose.test.yml up --abort-on-container-exit`
- [ ] Invoke `kb-coordinate` with a sample task to understand routing
