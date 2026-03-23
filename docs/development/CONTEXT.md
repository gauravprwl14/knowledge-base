# development/ — Layer 2 Router

How-to feature guides for building, modifying, and understanding KMS service code.
Each guide has exactly 6 sections: Business Use Case, Flow Diagram, Code Structure, Key Methods, Error Cases, Configuration.

---

## Routing Table

| Question / Task | Load This File |
|-----------------|----------------|
| JWT auth, login, register, refresh tokens, API keys, RBAC | `FOR-auth-strategy.md` |
| NestJS controllers, DTOs, Zod validation, Fastify, response format | *(guide pending — FOR-nestjs-patterns.md)* |
| FastAPI endpoints, Pydantic, Depends(), lifespan, domain structure | `FOR-python-patterns.md` |
| Prisma schema, BaseRepository, pagination, soft delete, migrations | *(guide pending — FOR-database.md)* |
| AppException, error codes (KB*), exception filters, KMSWorkerError, AMQP ack/nack | `FOR-error-handling.md` |
| nestjs-pino InjectPinoLogger, structlog, mandatory log fields, no print() | `FOR-logging.md` |
| OTel, custom spans (kb.*), W3C traceparent, health checks, Prometheus | `FOR-observability.md` |
| AMQP aio-pika, connect_robust, quorum queues, DLX, RabbitMQ patterns | `FOR-queue-system.md` |
| OpenAPI 3.1, endpoint design, versioning, Swagger decorators, TSDoc | *(guide pending — FOR-api-design.md)* |
| Jest unit tests, pytest, asyncio_mode, integration tests, coverage | `FOR-testing.md` |
| BGE-M3 embedding, Qdrant upsert, chunking, FlagEmbedding, MOCK_EMBEDDING | `FOR-embedding.md` |
| Neo4j driver, graph traversal, entity extraction, Leiden community detection | `FOR-graph.md` |
| ACP protocol, agent orchestrator, LangGraph inside rag-service | *(guide pending — FOR-agent-patterns.md)* |
| ACP HTTP gateway, tool registry, session management, permission model | `FOR-acp-integration.md` |
| Workflow Engine, agent spawning, YouTube URL workflow, how to add a new skill | `FOR-agentic-workflows.md` |
| External agent adapters (Claude Code, Codex, Gemini), MCP server, RAG context pipeline | `FOR-external-agent-integration.md` |
| Tiered retrieval, Query Classifier, LLM Guard, when to skip LLM, threshold tuning | `FOR-tiered-retrieval.md` |
| Collections CRUD, file membership, userId scoping, N+1 note | `FOR-collections.md` |
| Files list/delete/bulk ops, scan trigger, internal worker callback, merge-conflict note | `FOR-files.md` |
| Sources (local, Obsidian, Google Drive OAuth), token encryption, reconnect flow | `FOR-sources.md` |
| Frontend API clients (`lib/api/*.ts`), React Query hooks, loading/error states, TypeScript DTO alignment | `FOR-frontend-api-patterns.md` |
| Next.js auth store (Zustand), middleware route guards, session cookie, login/logout hooks | `FOR-frontend-auth.md` |
| End-to-end data flows (Chat RAG, Search, Source scan, Embed pipeline, Collections) with exact URLs and payloads | `FOR-e2e-flows.md` |
| search-api service (BM25, Qdrant, RRF fusion, x-user-id header, mock modes, config) | `FOR-search-api.md` |
| Rate limiting (NestJS ThrottlerGuard, per-user limits, Redis store, bypass for internal) | `FOR-rate-limiting.md` |

---

## Naming Conventions

- Feature guides: `FOR-{feature-name}.md` (kebab-case after `FOR-`)
- Each guide has exactly 6 mandatory sections in this order:
  1. **Business Use Case** — 2-4 sentences: why this exists, what problem it solves
  2. **Flow Diagram** — Mermaid `sequenceDiagram` or `flowchart`
  3. **Code Structure** — table: file → responsibility
  4. **Key Methods** — table: method → description → signature
  5. **Error Cases** — table: error code → HTTP status → description → handling
  6. **Configuration** — table: env var / constant → description → default
