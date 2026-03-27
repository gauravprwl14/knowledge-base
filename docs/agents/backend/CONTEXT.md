# Backend Group — CONTEXT

## Agents in This Group

| Skill | File | Responsibility |
|-------|------|----------------|
| `/kb-backend-lead` | `backend/backend-lead.md` | NestJS modules, TypeORM service patterns, kms-api and search-api implementation |
| `/kb-python-lead` | `backend/python-lead.md` | Python FastAPI workers, async job processing, aio-pika consumers |
| `/kb-api-designer` | `backend/api-designer.md` | REST API contracts, endpoint design, validation schemas, error code mapping |
| `/kb-db-specialist` | `backend/db-specialist.md` | PostgreSQL schema, TypeORM entities, migrations, query optimization, indexing |

---

## When to Use `/kb-backend-lead`

Use the backend lead when:

- Creating a **new NestJS module** (controller, service, repository, DTOs)
- Implementing **business logic** in a kms-api or search-api service
- Adding **guards, interceptors, or pipes** (auth, logging, validation)
- Setting up **TypeORM repository patterns** for data access
- Implementing **pagination, filtering, or sorting** in list endpoints
- Configuring **dependency injection** and module imports
- Debugging **NestJS-specific issues** (circular deps, DI failures, interceptor order)

---

## When to Use `/kb-python-lead`

Use the Python lead when:

- Building or modifying **Python worker services** (embedding, scan, dedup, transcription)
- Writing **FastAPI endpoints** for worker health checks or control APIs
- Implementing **aio-pika consumers** for RabbitMQ message processing
- Handling **async job state transitions** in workers
- Setting up **batch processing** with asyncpg or SQLAlchemy async
- Debugging **Python async issues** (event loop, task cancellation, connection pool)
- Adding retry logic, DLQ handling, or circuit breakers to workers

---

## When to Use `/kb-api-designer`

Use the API designer when:

- Designing a **new endpoint** before implementation (contract-first approach)
- Defining **request/response TypeScript interfaces** and DTO shapes
- Mapping **domain errors to HTTP error codes** (using prefixes from shared/variables.md)
- Writing **OpenAPI/Swagger** annotations or specs
- Reviewing an existing endpoint contract for correctness or completeness
- Ensuring **validation rules** are comprehensive (class-validator decorators)

Use the API designer **before** the backend lead for new endpoints. The contract drives implementation.

---

## When to Use `/kb-db-specialist`

Use the DB specialist when:

- Designing a **new table** or modifying an existing schema
- Writing **TypeORM entities** with correct column types, indices, and relations
- Generating or writing a **TypeORM migration** file
- Optimizing a **slow query** (analyzing EXPLAIN plans, adding indices)
- Designing a **composite index** or partial index strategy
- Handling **database transactions** across multiple tables
- Working with **PostgreSQL-specific features** (tsvector, GIN indices, JSONB, CTEs)
- Naming tables following the **domain prefix convention** (`auth_*`, `kms_*`, `voice_*`)

---

## Typical Backend Flow for a New Endpoint

```
/kb-api-designer    "Define POST /api/v1/documents/tag contract"
      ↓
/kb-db-specialist   "Add tags column and index to kms_documents"
      ↓
/kb-backend-lead    "Implement DocumentsService.tag() and TagsController"
      ↓
/kb-qa-architect    "Write unit + integration tests"
```

---

## Shared Resources

- `docs/agents/shared/variables.md` — Error code prefixes, table name conventions, architecture layers, transaction rules
- `docs/agents/shared/patterns.md` — DB migration checklist, API contract format, quality gates
- `docs/agents/samples/sample-api-contract.md` — Reference API contract
