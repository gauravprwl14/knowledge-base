# architecture/ — Layer 2 Router

Engineering standards, architecture decision records, and sequence diagrams.

---

## Subfolder Purposes

| Folder | Purpose |
|--------|---------|
| `decisions/` | MADR-format ADRs — one per non-obvious technology choice |
| `sequence-diagrams/` | Mermaid sequence diagrams — one per major data flow |
| `PRD/` | High-level product PRDs and roadmap docs |
| `01-system-overview/` through `06-api-contracts/` | Existing architecture reference docs |

---

## Routing Table

| Question / Task | Load This File |
|-----------------|----------------|
| Full technology stack decisions + coding standards | `ENGINEERING_STANDARDS.md` |
| Why Fastify over Express? | `decisions/0001-fastify-over-express.md` |
| Why Prisma over TypeORM? | `decisions/0002-prisma-over-typeorm.md` |
| Why nestjs-pino over Winston? | `decisions/0003-nestjs-pino-logging.md` |
| Why SWC compiler? | `decisions/0004-swc-compiler.md` |
| Why aio-pika over Celery? | `decisions/0006-aio-pika-over-celery.md` |
| Why structlog over loguru? | `decisions/0007-structlog-over-loguru.md` |
| Why BGE-M3 embedding model? | `decisions/0009-bge-m3-embedding-model.md` |
| Why Qdrant for vector DB? | `decisions/0010-qdrant-vector-db.md` |
| Why ACP protocol for agents? | `decisions/0012-acp-protocol.md` |
| Why custom orchestrator vs LangGraph? | `decisions/0013-orchestrator-pattern.md` |
| Why HTTP transport for ACP (not stdio)? | `decisions/0018-acp-http-transport.md` |
| Why static tool registry (not plugin registry)? | `decisions/0019-acp-tool-registry.md` |
| Why static agent registry (not dynamic self-registration)? | `decisions/0020-agent-registry-design.md` |
| Why custom NestJS state machine for Workflow Engine? | `decisions/0021-workflow-engine.md` |
| How do agents spawn sub-agents? | `decisions/0022-sub-agent-spawning.md` |
| Why dual-adapter pattern for external ACP agents (stdio vs HTTP)? | `decisions/0023-external-agent-adapter.md` |
| Why tiered retrieval? When to skip LLM and return search results directly? | `decisions/0024-tiered-retrieval-response.md` |
| LangGraph checkpointer: PostgreSQL vs Redis (dual storage) | `decisions/0025-langgraph-postgres-checkpointer.md` |
| LLM provider abstraction: capability-based factory, Anthropic-primary | `decisions/0026-llm-provider-abstraction.md` |
| Dual-queue boundary: BullMQ (internal) vs RabbitMQ (Python IPC) | `decisions/0028-dual-queue-boundary.md` |
| Why search-api is a standalone NestJS service (port 8001) with header-based auth? | `decisions/0029-search-api-standalone-service.md` |
| ADR index (all decisions) | `decisions/README.md` |
| User registration flow (POST /auth/register, bcrypt, JWT, Redis refresh token) | `sequence-diagrams/01-user-registration.md` |
| User login + JWT refresh flow (bcrypt verify, token rotation, Redis) | `sequence-diagrams/02-user-login.md` |
| Source connect + scan flow | `sequence-diagrams/03-source-connect-scan.md` |
| Embedding pipeline flow | `sequence-diagrams/04-file-embedding-pipeline.md` |
| Keyword search flow | `sequence-diagrams/05-keyword-search.md` |
| Hybrid search flow (BM25 + Qdrant RRF, keyword/semantic/hybrid modes) | `sequence-diagrams/06-hybrid-search.md` |
| RAG chat flow | `sequence-diagrams/07-rag-chat.md` |
| Voice transcription flow | `sequence-diagrams/08-voice-transcription.md` |
| ACP gateway prompt flow (initialize → session → prompt → tools → stream) | `sequence-diagrams/09-acp-gateway-prompt-flow.md` |
| ACP tool dispatch (graph_expand, permission model, fallback) | `sequence-diagrams/10-acp-tool-dispatch.md` |
| YouTube URL ingest workflow (url-agent, parallel summarize+embed, SSE) | `sequence-diagrams/11-youtube-url-workflow.md` |
| Multi-agent parallel spawn + agent-initiated sub-agent pattern | `sequence-diagrams/12-multi-agent-parallel-spawn.md` |
| RAG context pipeline to Claude Code/API (context packing, external agent stream) | `sequence-diagrams/13-rag-claude-code-context-pipeline.md` |
| MCP server: Claude Code live tool calls into KMS during coding session | `sequence-diagrams/14-mcp-server-claude-code.md` |
| Tiered retrieval flow (Query Classifier → Tier Router → cache/BM25/hybrid/graph/LLM) | `sequence-diagrams/15-tiered-retrieval-flow.md` |
| Drive file browser — paginated list, bulk delete, tag assign, bulk move | `sequence-diagrams/16-drive-file-browser-flow.md` |
| Tag system lifecycle (manual create, AI auto-tag, filter, cascade delete) | `sequence-diagrams/17-tag-system-flow.md` |
| SSE ACP streaming (session → prompt → tool → stream → done events) | `sequence-diagrams/18-sse-acp-streaming.md` |
| Google Drive incremental/full sync (OAuth token refresh, batch upsert, embed fanout) | `sequence-diagrams/19-google-drive-sync.md` |
| Deduplication pipeline (SHA-256 cache, DB cross-source check, Qdrant near-dup 0.98) | `sequence-diagrams/20-dedup-pipeline.md` |
| Tag system (manual create/assign, AI auto-tag, filter by tag, cascade delete) | `sequence-diagrams/21-tag-system.md` |
| Sequence diagrams index | `sequence-diagrams/README.md` |
| I need to write a new ADR | `ENGINEERING_STANDARDS.md` Section 13 (MADR template) |
| Full KMS Agentic Platform architecture (all 6 layers, components, vision) | `KMS-AGENTIC-PLATFORM.md` |
| ACP protocol disambiguation (two different ACPs — which one KMS uses) | `ACP-PROTOCOL-CLARIFICATION.md` |
| Full product vision (Know / Retrieve / Act, user journeys, storage model) | `../KMS-VISION.md` |
| Master roadmap (phases 0-5, current state, acceptance criteria) | `../MASTER-ROADMAP.md` |
| Sprint board (current sprint, backlog, completed) | `../SPRINT-BOARD.md` |
| Phase 1 concrete implementation plan (ACP + Claude Code) | `../PHASE1-IMPLEMENTATION-PLAN.md` |

---

## Naming Conventions

- ADRs: `decisions/NNNN-{kebab-case-title}.md` (4-digit zero-padded, next = 0030)
- Sequence diagrams: `sequence-diagrams/NN-{kebab-case-flow}.md` (2-digit, next = 22)
- Status values in ADRs: `Proposed` → `Accepted` → `Deprecated` → `Superseded by [ADR-NNNN]`
