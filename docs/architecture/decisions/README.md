# Architecture Decision Records

All significant technical decisions are documented as MADR-format ADRs.

## Format

Files follow the naming convention: `NNNN-kebab-case-title.md`

## Index

| ADR | Title | Status | Tags |
|---|---|---|---|
| [0001](./0001-fastify-over-express.md) | Fastify over Express for NestJS | Accepted | nestjs, performance |
| [0002](./0002-prisma-over-typeorm.md) | Prisma over TypeORM and Drizzle | Accepted | nestjs, database, orm |
| [0003](./0003-nestjs-pino-logging.md) | nestjs-pino over Winston | Accepted | nestjs, logging |
| [0004](./0004-swc-compiler.md) | SWC Compiler for NestJS | Accepted | nestjs, build |
| [0005](./0005-skip-cqrs.md) | Skip CQRS for REST API Services | Accepted | nestjs, architecture |
| [0006](./0006-aio-pika-over-celery.md) | aio-pika over Celery for Workers | Accepted | python, workers |
| [0007](./0007-structlog-over-loguru.md) | structlog over loguru | Accepted | python, logging |
| [0008](./0008-sqlalchemy-asyncpg.md) | SQLAlchemy async for API, asyncpg for Workers | Accepted | python, database |
| [0009](./0009-bge-m3-embedding-model.md) | BGE-M3 as Embedding Model | Accepted | ai, embeddings |
| [0010](./0010-qdrant-vector-db.md) | Qdrant as Vector Database | Accepted | ai, search |
| [0011](./0011-neo4j-graph-db.md) | Neo4j with Official Python Driver | Accepted | graph, database |
| [0012](./0012-acp-protocol.md) | ACP Protocol for Agent Communication | Accepted | agents, api |
| [0013](./0013-orchestrator-pattern.md) | Custom NestJS Orchestrator + LangGraph in rag-service | Accepted | agents, orchestration |
| [0014](./0014-sse-streaming.md) | SSE over WebSocket for LLM Streaming | Accepted | api, streaming |
| [0015](./0015-documentation-standards.md) | MADR + Mermaid + TSDoc + Google Docstrings | Accepted | documentation |
| [0016](./0016-openapi-source-of-truth.md) | OpenAPI 3.1 YAML as Source of Truth | Accepted | api, contracts |
| [0017](./0017-shared-error-codes.md) | Shared error-codes.json | Accepted | errors |
| [0018](./0018-acp-http-transport.md) | ACP HTTP Transport (not stdio) | Accepted | agents, api |
| [0019](./0019-acp-tool-registry.md) | Static ACP Tool Registry | Accepted | agents, tools |
| [0020](./0020-agent-registry-design.md) | Static Agent Registry Design | Accepted | agents |
| [0021](./0021-workflow-engine.md) | Custom NestJS State Machine for Workflow Engine | Accepted | workflow, nestjs |
| [0022](./0022-sub-agent-spawning.md) | Sub-agent Spawning Pattern | Accepted | agents, orchestration |
| [0023](./0023-external-agent-adapter.md) | Dual-adapter Pattern for External ACP Agents | Accepted | agents, adapters |
| [0024](./0024-tiered-retrieval-response.md) | Tiered Retrieval Response Strategy | Accepted | search, rag |
| [0025](./0025-langgraph-postgres-checkpointer.md) | LangGraph PostgreSQL Checkpointer (dual storage) | Accepted | agents, langgraph, database |
| [0026](./0026-llm-provider-abstraction.md) | LLM Provider Abstraction (Anthropic-primary) | Accepted | ai, llm, agents |
| [0027](./0027-file-tagging-system.md) | File Tagging System — dual-source (manual + AI) | Accepted | files, tags, ai |
| [0028](./0028-dual-queue-boundary.md) | Dual-queue boundary: RabbitMQ (Python IPC) replaces BullMQ | Accepted | queue, rabbitmq |
| [0029](./0029-search-api-standalone-service.md) | Search API as standalone NestJS service | Accepted | search, architecture |
| [0030](./0030-kb-ui-standalone-package.md) | `@kb/ui` as a standalone monorepo package | Accepted | frontend, design-system |
| [0031](./0031-mime-registry-renderer.md) | Registry-driven MIME type file renderer | Accepted | frontend, rendering |
| [0032](./0032-hybrid-viewer-ux.md) | Hybrid viewer UX — drawer + full detail page | Accepted | frontend, ux |
| [0033](./0033-websocket-file-status.md) | WebSocket for file processing status updates | Accepted | frontend, realtime |

## Process

1. Create a new ADR for any decision that is hard to reverse or will surprise a new team member
2. Copy the template from `ENGINEERING_STANDARDS.md` Section 13.1
3. Number sequentially (next: 0034)
4. Status: `Proposed` → team review → `Accepted`
5. Update this README index when accepted
