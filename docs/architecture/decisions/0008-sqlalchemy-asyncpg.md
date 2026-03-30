# 0008 — SQLAlchemy async for API Services, asyncpg for Worker Services

- **Status**: Accepted
- **Date**: 2026-03-30
- **Deciders**: Architecture Team
- **Tags**: [python, database, orm, workers]

## Context and Problem Statement

Python services in the KMS monorepo need PostgreSQL access. There are two categories:

1. **API services** (`voice-app`, `rag-service`) — FastAPI applications that handle user requests, perform complex queries, and need relationship mapping and schema introspection.
2. **Worker services** (`scan-worker`, `embed-worker`, `dedup-worker`, `graph-worker`) — AMQP message consumers in tight processing loops. These services execute simple, known queries at high throughput and prioritise minimal overhead per message.

A single database access strategy for both categories would either add unnecessary ORM overhead to workers or force API services to hand-craft all queries.

## Decision Drivers

- Worker services process thousands of messages per hour; ORM model instantiation adds measurable overhead per message
- API services benefit from schema validation, relationship traversal, and migration management
- Consistent async/await pattern across all services (no blocking I/O)
- Prisma manages migrations on the NestJS side; Python services must not run competing migrations

## Considered Options

- Option A: SQLAlchemy 2.0 async ORM for API services + raw `asyncpg` for worker services
- Option B: Tortoise ORM for all Python services
- Option C: SQLAlchemy 2.0 async for all Python services (ORM everywhere)
- Option D: Raw `asyncpg` for all Python services

## Decision Outcome

Chosen: **Option A — SQLAlchemy 2.0 async for API services, raw asyncpg for worker services**

API services gain the ergonomics of an ORM (declarative models, relationship loading, query builder) with full async support. Worker services gain the lowest possible per-query overhead by sending pre-written parameterised SQL directly via `asyncpg`.

### Consequences

**Good:**
- Workers use `asyncpg.Connection` directly — zero ORM overhead in hot paths
- API services use `AsyncSession` with `select()` / `scalars()` — readable, type-safe queries
- Both layers are fully async — no `run_in_executor` wrappers needed
- `asyncpg` connection pool reuse across worker message batches
- SQLAlchemy 2.0 style (not 1.x legacy) — `async with session.begin():` pattern

**Bad / Trade-offs:**
- Two database access patterns to learn and maintain (ORM for APIs, raw SQL for workers)
- SQLAlchemy models in `voice-app` and `rag-service` must stay in sync with schema (no Prisma auto-gen)
- Raw asyncpg SQL in workers must be reviewed carefully for SQL injection (use `$1` parameterised queries only — never f-strings)

## Pros and Cons of the Options

### Option A: SQLAlchemy async (APIs) + asyncpg (workers) — CHOSEN

- ✅ Right tool for each context
- ✅ asyncpg is the fastest PostgreSQL driver for Python (compiled C extensions)
- ✅ SQLAlchemy 2.0 has first-class async support via `AsyncEngine` / `AsyncSession`
- ❌ Two patterns — higher initial learning curve
- ❌ SQLAlchemy models in API services diverge from Prisma schema if migrations are missed

### Option B: Tortoise ORM for all services

- ✅ Single ORM for all Python services
- ✅ Django-style API — familiar to many developers
- ❌ Less mature than SQLAlchemy; fewer production battle-tested deployments
- ❌ Tortoise manages its own migrations — conflicts with Prisma-driven schema
- ❌ Higher ORM overhead in worker hot paths

### Option C: SQLAlchemy 2.0 async everywhere

- ✅ One pattern for all Python services
- ✅ Full ORM ergonomics in workers
- ❌ ORM session and model instantiation overhead per message in high-throughput workers
- ❌ Workers do not need relationship mapping — ORM features go unused

### Option D: Raw asyncpg everywhere

- ✅ Maximum performance for all services
- ✅ No ORM dependency to manage
- ❌ No query builder — complex API queries become hard to read and maintain
- ❌ No model validation at the Python layer for API request/response
