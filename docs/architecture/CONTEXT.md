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
| ADR index (all decisions) | `decisions/README.md` |
| Source connect + scan flow | `sequence-diagrams/03-source-connect-scan.md` |
| Embedding pipeline flow | `sequence-diagrams/04-file-embedding-pipeline.md` |
| Keyword search flow | `sequence-diagrams/05-keyword-search.md` |
| RAG chat flow | `sequence-diagrams/07-rag-chat.md` |
| Voice transcription flow | `sequence-diagrams/08-voice-transcription.md` |
| Sequence diagrams index | `sequence-diagrams/README.md` |
| I need to write a new ADR | `ENGINEERING_STANDARDS.md` Section 13 (MADR template) |

---

## Naming Conventions

- ADRs: `decisions/NNNN-{kebab-case-title}.md` (4-digit zero-padded, next = 0018)
- Sequence diagrams: `sequence-diagrams/NN-{kebab-case-flow}.md` (2-digit, next = 09)
- Status values in ADRs: `Proposed` → `Accepted` → `Deprecated` → `Superseded by [ADR-NNNN]`
