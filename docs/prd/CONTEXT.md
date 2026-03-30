# prd/ — Layer 2 Router

Product Requirements Documents — one per KMS module. Each PRD defines business context,
user stories, scope, task breakdown per layer (NestJS / Python / Frontend / DB / Queue), and links to ADRs + sequence diagrams.

---

## Routing Table

| Question / Task | Load This File |
|-----------------|----------------|
| All modules at a glance — task counts, dependencies | `MASTER-FEATURE-OVERVIEW.md` |
| Project setup, boilerplate, monorepo foundation | `PRD-M00-project-setup.md` |
| Authentication, JWT, API keys, RBAC, account lockout | `PRD-M01-authentication.md` |
| Source integration (local folder, Google Drive, scanning) | `PRD-M02-source-integration.md` |
| Content extraction (PDF, DOCX, XLSX, OCR, chunking) | `PRD-M03-content-extraction.md` |
| Embedding generation (BGE-M3, Qdrant upsert) | `PRD-M04-embedding-pipeline.md` |
| Search (keyword FTS, semantic ANN, hybrid RRF) | `PRD-M05-search.md` |
| Deduplication (SHA-256, semantic, version grouping) | `PRD-M06-deduplication.md` |
| Junk detection and cleanup | `PRD-M07-junk-detection.md` |
| Voice transcription integration | `PRD-M08-transcription.md` |
| Knowledge graph (Neo4j, entities, communities) | `PRD-M09-knowledge-graph.md` |
| RAG chat, agent orchestration, SSE streaming | `PRD-M10-rag-chat.md` |
| RAG tiered retrieval addendum — how M10 changes with tiered retrieval + LLM Guard | `PRD-M10-rag-chat-tiered-addendum.md` |
| Web UI, design system, all 14 pages | `PRD-M11-web-ui.md` |
| Obsidian plugin integration — Send to KMS, Ask KMS, ACP session, SSE streaming | `PRD-M12-obsidian.md` |
| Google Drive connector — OAuth, token refresh, incremental sync details | `PRD-google-drive-integration.md` |
| **ACP Integration — KMS as ACP knowledge agent, tool registry, RAG pipeline refactor** | `PRD-M13-acp-integration.md` |
| **Agentic Workflows — Workflow Engine, multi-agent, YouTube URL ingest, sub-agent spawning** | `PRD-M14-agentic-workflows.md` |
| **External Agent Integration — KMS connects to Claude Code, Codex, Gemini; RAG context pipeline; MCP server** | `PRD-M15-external-agent-integration.md` |
| **File Rendering Engine & @kb/ui Design System — inline viewers, design tokens, artifact panel** | `PRD-M16-rendering-engine.md` |
| **Business Requirements — rendering engine (executive summary, stakeholders, risks)** | `BRD-rendering-engine.md` |
| **Document Intelligence — master cross-pillar PRD (ingestion, discovery, search, ranking)** | `PRD-document-intelligence.md` |
| **Content Processing Pipeline — engineering spec (extractors, chunking, embedding, error handling)** | `PRD-content-processing-pipeline.md` |
| Phase 1 implementation plan — concrete build steps for ACP + Claude Code | `../PHASE1-IMPLEMENTATION-PLAN.md` |
| I need to write a new PRD | `../workflow/PRD-TEMPLATE.md` |

---

## Module Status

| Module | Status | Priority |
|--------|--------|----------|
| M00 Project Setup | Not Started | P0 — blocks everything |
| M01 Authentication | Not Started | P0 |
| M02 Source Integration | Not Started | P0 |
| M03 Content Extraction | Not Started | P0 |
| M04 Embedding Pipeline | Not Started | P0 |
| M05 Search | Not Started | P0 |
| M06 Deduplication | Not Started | P0 |
| M07 Junk Detection | Not Started | P1 |
| M08 Transcription | Not Started | P0 |
| M09 Knowledge Graph | Not Started | P1 |
| M10 RAG Chat | Not Started | P1 |
| M11 Web UI | Not Started | P0 |
| M12 Obsidian | Done | P2 |
| M13 ACP Integration | Draft | P1 |
| M14 Agentic Workflows | Draft | P1 |
| M15 External Agent Integration | Draft | P1 |
| M16 File Rendering Engine & @kb/ui | Draft | P0 |

---

## Naming Conventions

- Files: `PRD-M{NN}-{feature-name}.md` (zero-padded module number)
- Status: `Draft` → `Review` → `Approved` → `In Development` → `Done`
