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
| Web UI, design system, all 14 pages | `PRD-M11-web-ui.md` |
| Obsidian plugin integration | `PRD-M12-obsidian.md` |
| **Document Intelligence — master cross-pillar PRD (ingestion, discovery, search, ranking)** | `PRD-document-intelligence.md` |
| **Content Processing Pipeline — engineering spec (extractors, chunking, embedding, error handling)** | `PRD-content-processing-pipeline.md` |
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
| M12 Obsidian | Not Started | P2 |

---

## Naming Conventions

- Files: `PRD-M{NN}-{feature-name}.md` (zero-padded module number)
- Status: `Draft` → `Review` → `Approved` → `In Development` → `Done`
