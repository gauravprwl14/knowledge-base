# Parallel Work Tracker — Knowledge Base System

**Version**: 1.0
**Date**: 2026-03-17
**Purpose**: Track parallel workstreams across multiple contributors in India and elsewhere.

---

## How This Works

This document is the **single source of truth** for who is working on what. It is updated:
- When a task starts: mark `🔄 In Progress` + assignee + branch name
- When a task is done: mark `✅ Done` + PR link
- When blocked: mark `🚫 Blocked` + reason

**Workflow**: GitHub Projects (Board view) + this doc as the structured index.

---

## Team Workstream Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PARALLEL WORKSTREAMS                                 │
├──────────────┬──────────────┬──────────────┬──────────────┬─────────────────┤
│  Stream A    │   Stream B   │   Stream C   │   Stream D   │    Stream E     │
│  Backend API │  Data/ML     │  Frontend    │  DevOps/Obs  │  Docs/Quality   │
├──────────────┼──────────────┼──────────────┼──────────────┼─────────────────┤
│  kms-api     │  scan-worker │  web-ui      │  Docker      │  Architecture   │
│  search-api  │  embed-worker│  design-sys  │  CI/CD       │  ADRs           │
│  rag-service │  graph-worker│  obsidian-   │  Observabil  │  TDD docs       │
│              │  dedup-worker│  plugin      │  ity stack   │  API contracts  │
└──────────────┴──────────────┴──────────────┴──────────────┴─────────────────┘
```

---

## Milestone Status Board

### M0 — Foundation (Weeks 1-2)
**Goal**: Full Docker Compose stack + all health checks + CI pipeline

| Task | Stream | Status | Assignee | Branch | PR |
|------|--------|--------|----------|--------|----|
| Monorepo structure (pnpm workspaces + turbo) | E | 🔲 Todo | — | `feat/monorepo-setup` | — |
| Docker Compose (all 20+ services) | D | 🔲 Todo | — | `feat/docker-compose-full` | — |
| docker-compose.override.yml (dev hot reload) | D | 🔲 Todo | — | `feat/docker-dev` | — |
| docker-compose.test.yml (testcontainers-based) | D | 🔲 Todo | — | `feat/docker-test` | — |
| GitHub Actions CI pipeline | D | 🔲 Todo | — | `feat/ci-pipeline` | — |
| Health check endpoints (all services) | A | 🔲 Todo | — | `feat/health-checks` | — |
| OTel collector config | D | 🔲 Todo | — | `feat/otel-setup` | — |
| Grafana dashboards (base) | D | 🔲 Todo | — | `feat/grafana-base` | — |
| Design token package (`@kb/tokens`) | C | 🔲 Todo | — | `feat/design-tokens` | — |
| Base architecture docs | E | ✅ Done | Claude | — | — |
| TDD strategy docs | E | ✅ Done | Claude | — | — |

---

### M1 — Auth + Core API (Weeks 3-6)
**Goal**: User can login, create API key, and list/create files from UI

| Task | Stream | Status | Assignee | Branch | PR |
|------|--------|--------|----------|--------|----|
| kms-api: Auth module (register, login, refresh) | A | 🔲 Todo | — | `feat/auth-module` | — |
| kms-api: API key management | A | 🔲 Todo | — | `feat/api-keys` | — |
| kms-api: Sources module (CRUD) | A | 🔲 Todo | — | `feat/sources-module` | — |
| kms-api: Files module (CRUD) | A | 🔲 Todo | — | `feat/files-module` | — |
| kms-api: Notes module (CRUD) | A | 🔲 Todo | — | `feat/notes-module` | — |
| kms-api: Prisma schema (all tables) | A | 🔲 Todo | — | `feat/db-schema` | — |
| kms-api: Unit tests (auth) | A | 🔲 Todo | — | `test/auth-unit` | — |
| kms-api: Integration tests (auth + DB) | A | 🔲 Todo | — | `test/auth-integration` | — |
| web-ui: Design token CSS (`@theme`) | C | 🔲 Todo | — | `feat/ui-tokens` | — |
| web-ui: Layout + navigation | C | 🔲 Todo | — | `feat/ui-layout` | — |
| web-ui: Login + register pages | C | 🔲 Todo | — | `feat/ui-auth` | — |
| web-ui: Dashboard skeleton | C | 🔲 Todo | — | `feat/ui-dashboard` | — |
| web-ui: Sources management page | C | 🔲 Todo | — | `feat/ui-sources` | — |
| web-ui: Unit tests (components) | C | 🔲 Todo | — | `test/ui-components` | — |
| Nginx config + routing | D | 🔲 Todo | — | `feat/nginx-routing` | — |

---

### M2 — Google Drive (Weeks 7-10)
**Goal**: User connects Google Drive, files are scanned and listed in UI

| Task | Stream | Status | Assignee | Branch | PR |
|------|--------|--------|----------|--------|----|
| kms-api: Google OAuth flow | A | 🔲 Todo | — | `feat/gdrive-oauth` | — |
| kms-api: Token encryption (AES-256-GCM) | A | 🔲 Todo | — | `feat/token-encrypt` | — |
| scan-worker: GoogleDriveConnector | B | 🔲 Todo | — | `feat/gdrive-connector` | — |
| scan-worker: BaseConnector interface + tests | B | 🔲 Todo | — | `feat/base-connector` | — |
| scan-worker: File metadata extraction | B | 🔲 Todo | — | `feat/metadata-extractor` | — |
| scan-worker: RabbitMQ consumer | B | 🔲 Todo | — | `feat/scan-consumer` | — |
| scan-worker: PostgreSQL write (kms_files) | B | 🔲 Todo | — | `feat/files-db-write` | — |
| scan-worker: Publishes to embed.queue | B | 🔲 Todo | — | `feat/scan-to-embed` | — |
| scan-worker: Unit tests (connector) | B | 🔲 Todo | — | `test/gdrive-unit` | — |
| scan-worker: Integration tests (full pipeline) | B | 🔲 Todo | — | `test/scan-integration` | — |
| kms-api: Scan job endpoint | A | 🔲 Todo | — | `feat/scan-jobs-api` | — |
| web-ui: Connect Google Drive flow | C | 🔲 Todo | — | `feat/ui-gdrive-connect` | — |
| web-ui: Files list page | C | 🔲 Todo | — | `feat/ui-files-list` | — |
| web-ui: Scan progress indicator | C | 🔲 Todo | — | `feat/ui-scan-progress` | — |
| web-ui: E2E test (connect drive + see files) | C | 🔲 Todo | — | `test/e2e-gdrive` | — |

---

### M3 — Embeddings + Search (Weeks 11-14)
**Goal**: Semantic search works; files are embedded; search returns results

| Task | Stream | Status | Assignee | Branch | PR |
|------|--------|--------|----------|--------|----|
| embed-worker: PDF text extraction (pymupdf) | B | 🔲 Todo | — | `feat/pdf-extractor` | — |
| embed-worker: DOCX extraction (python-docx) | B | 🔲 Todo | — | `feat/docx-extractor` | — |
| embed-worker: Image OCR (tesseract) | B | 🔲 Todo | — | `feat/image-ocr` | — |
| embed-worker: Text chunking (recursive) | B | 🔲 Todo | — | `feat/text-chunker` | — |
| embed-worker: Ollama embedding client | B | 🔲 Todo | — | `feat/ollama-embedder` | — |
| embed-worker: OpenAI embedding client | B | 🔲 Todo | — | `feat/openai-embedder` | — |
| embed-worker: Qdrant write | B | 🔲 Todo | — | `feat/qdrant-write` | — |
| embed-worker: Unit + integration tests | B | 🔲 Todo | — | `test/embed-worker` | — |
| search-api: PostgreSQL FTS endpoint | A | 🔲 Todo | — | `feat/fts-search` | — |
| search-api: Qdrant semantic search | A | 🔲 Todo | — | `feat/semantic-search` | — |
| search-api: Hybrid RRF ranking | A | 🔲 Todo | — | `feat/hybrid-search` | — |
| search-api: Redis result caching | A | 🔲 Todo | — | `feat/search-cache` | — |
| search-api: Unit + integration tests | A | 🔲 Todo | — | `test/search-api` | — |
| web-ui: Search page with filters | C | 🔲 Todo | — | `feat/ui-search` | — |
| web-ui: Search results + file preview | C | 🔲 Todo | — | `feat/ui-search-results` | — |
| Ollama Docker service + model pull | D | 🔲 Todo | — | `feat/ollama-service` | — |

---

### M4 — Graph + Traversal (Weeks 15-17)
**Goal**: Knowledge graph built; path-finding and community detection work

| Task | Stream | Status | Assignee | Branch | PR |
|------|--------|--------|----------|--------|----|
| graph-worker: Neo4j schema (nodes + constraints) | B | 🔲 Todo | — | `feat/neo4j-schema` | — |
| graph-worker: File/Folder hierarchy builder | B | 🔲 Todo | — | `feat/graph-hierarchy` | — |
| graph-worker: Entity extraction (spaCy NER) | B | 🔲 Todo | — | `feat/entity-extraction` | — |
| graph-worker: SIMILAR_TO edge builder | B | 🔲 Todo | — | `feat/similarity-edges` | — |
| graph-worker: Leiden community detection | B | 🔲 Todo | — | `feat/leiden-clustering` | — |
| graph-worker: Unit + integration tests | B | 🔲 Todo | — | `test/graph-worker` | — |
| search-api: Graph traversal endpoint | A | 🔲 Todo | — | `feat/graph-traversal` | — |
| search-api: Path-finding query | A | 🔲 Todo | — | `feat/path-finding` | — |
| search-api: Community context endpoint | A | 🔲 Todo | — | `feat/community-context` | — |
| web-ui: Knowledge graph visualizer (React Flow) | C | 🔲 Todo | — | `feat/ui-graph-view` | — |
| web-ui: Node inspector panel | C | 🔲 Todo | — | `feat/ui-node-inspector` | — |
| web-ui: Community cluster view | C | 🔲 Todo | — | `feat/ui-clusters` | — |

---

### M5 — Obsidian + Notes + Dedup (Weeks 18-20)

| Task | Stream | Status | Assignee | Branch | PR |
|------|--------|--------|----------|--------|----|
| obsidian-plugin: TypeScript plugin scaffold | C | 🔲 Todo | — | `feat/obsidian-plugin` | — |
| obsidian-plugin: Vault watcher + sync to API | C | 🔲 Todo | — | `feat/obsidian-sync` | — |
| obsidian-plugin: Backlink resolver | C | 🔲 Todo | — | `feat/obsidian-backlinks` | — |
| obsidian-plugin: Sidebar panel (related notes) | C | 🔲 Todo | — | `feat/obsidian-sidebar` | — |
| obsidian-sync worker: MD parser + frontmatter | B | 🔲 Todo | — | `feat/md-parser` | — |
| obsidian-sync worker: Push to graph | B | 🔲 Todo | — | `feat/obsidian-graph` | — |
| kms-api: Notes module (capture, tag, link) | A | 🔲 Todo | — | `feat/notes-api` | — |
| dedup-worker: SHA-256 exact dedup | B | 🔲 Todo | — | `feat/exact-dedup` | — |
| dedup-worker: Semantic dedup (>95% similarity) | B | 🔲 Todo | — | `feat/semantic-dedup` | — |
| dedup-worker: pHash image dedup | B | 🔲 Todo | — | `feat/phash-dedup` | — |
| dedup-worker: Neo4j DUPLICATE_OF edges | B | 🔲 Todo | — | `feat/dedup-graph` | — |
| dedup-worker: Unit + integration tests | B | 🔲 Todo | — | `test/dedup-worker` | — |
| web-ui: Notes capture page | C | 🔲 Todo | — | `feat/ui-notes` | — |
| web-ui: Duplicate manager page | C | 🔲 Todo | — | `feat/ui-duplicates` | — |

---

### M6 — RAG + Agents (Weeks 21-23)

| Task | Stream | Status | Assignee | Branch | PR |
|------|--------|--------|----------|--------|----|
| rag-service: LangChain RAG pipeline | B | 🔲 Todo | — | `feat/rag-pipeline` | — |
| rag-service: Graph-aware retrieval | B | 🔲 Todo | — | `feat/rag-graph` | — |
| rag-service: Citation tracking | B | 🔲 Todo | — | `feat/rag-citations` | — |
| rag-service: SSE streaming | B | 🔲 Todo | — | `feat/rag-streaming` | — |
| rag-service: Conversation memory (Redis) | B | 🔲 Todo | — | `feat/rag-memory` | — |
| rag-service: Unit + integration tests | B | 🔲 Todo | — | `test/rag-service` | — |
| kms-api: ACP OrchestratorAgent | A | 🔲 Todo | — | `feat/acp-orchestrator` | — |
| kms-api: SearchAgent + GraphAgent + RAGAgent | A | 🔲 Todo | — | `feat/acp-agents` | — |
| kms-api: MCP tool exposure | A | 🔲 Todo | — | `feat/mcp-tools` | — |
| web-ui: RAG chat interface | C | 🔲 Todo | — | `feat/ui-chat` | — |
| web-ui: Citation display + file links | C | 🔲 Todo | — | `feat/ui-citations` | — |
| web-ui: Streaming response rendering | C | 🔲 Todo | — | `feat/ui-streaming` | — |

---

## Branch Naming Convention

```
feat/{service}-{feature}    # New feature
fix/{service}-{bug}         # Bug fix
test/{service}-{scope}      # Tests
docs/{scope}                # Documentation
refactor/{service}-{scope}  # Refactor (no behavior change)
chore/{scope}               # Config, dependencies, tooling
```

Examples:
- `feat/kms-api-auth-module`
- `test/scan-worker-integration`
- `docs/adr-006-graph-traversal`

---

## PR Checklist (Required Before Merge)

```markdown
## PR Checklist

### Code Quality
- [ ] Unit tests written BEFORE implementation (TDD)
- [ ] Integration tests cover happy path + failure paths
- [ ] Coverage threshold passes (80% lines, 70% branches)
- [ ] No linting errors (`pnpm lint` / `ruff check .`)
- [ ] TypeScript compiles without errors
- [ ] Inline documentation on all public functions/classes

### Architecture
- [ ] Follows established patterns (see MASTER_ARCHITECTURE_V2.md)
- [ ] OTel spans added for new business operations
- [ ] Structured logging (no console.log)
- [ ] Error handling follows error code standards

### Documentation
- [ ] ADR created if architectural decision was made
- [ ] PARALLEL_WORK_TRACKER.md updated (status + PR link)
- [ ] API contract updated in docs/architecture/06-api-contracts/ if endpoint changed
- [ ] Inline JSDoc/docstrings on public interfaces

### Testing
- [ ] CI is green
- [ ] No mocked integration tests (testcontainers for real dependencies)
```

---

## Decision Backtracking (ADR Index)

Architecture Decision Records live in `docs/adr/`. Each major decision gets one.

```
docs/adr/
├── ADR-001-nestjs-for-api.md
├── ADR-002-python-for-workers.md
├── ADR-003-qdrant-over-pgvector.md
├── ADR-004-neo4j-for-graph.md
├── ADR-005-rabbitmq-for-queues.md
├── ADR-006-graph-traversal-over-pure-rag.md
├── ADR-007-acp-agent-protocol.md
├── ADR-008-local-first-llm.md
├── ADR-009-tdd-first.md
├── ADR-010-obsidian-plugin-not-connector.md
├── ADR-011-design-token-three-tier.md
└── ADR-012-opentelemetry-as-core.md
```

**ADR Template:**
```markdown
# ADR-NNN: Title

**Date**: YYYY-MM-DD
**Status**: Accepted | Deprecated | Superseded by ADR-NNN
**Deciders**: List of people involved

## Context
What is the issue that we're seeing that motivates this decision?

## Decision
What is the change that we're proposing or have agreed to implement?

## Consequences
What becomes easier or more difficult because of this decision?

## Alternatives Considered
What other approaches did we evaluate and why were they rejected?
```

---

## GitHub Projects Setup

**Board Views:**
1. **Backlog** — All unstarted tasks by milestone
2. **Sprint Board** — Active sprint (2-week) by stream (A/B/C/D/E)
3. **Blocked** — Items needing resolution
4. **Roadmap** — Milestone timeline view

**Labels:**
| Label | Purpose |
|-------|---------|
| `stream-a` | Backend API workstream |
| `stream-b` | Data/ML workstream |
| `stream-c` | Frontend workstream |
| `stream-d` | DevOps/Observability |
| `stream-e` | Docs/Quality |
| `priority-p0` | Critical / blocking |
| `priority-p1` | High importance |
| `priority-p2` | Normal |
| `priority-p3` | Nice to have |
| `tdd-required` | Must have tests written first |
| `needs-adr` | Architectural decision needed |
| `good-first-issue` | For new contributors |
| `blocked` | Cannot progress |

---

## Communication Protocol

| Situation | Channel | Response SLA |
|-----------|---------|-------------|
| Architecture question | GitHub Discussion | 24h |
| Blocked on dependency | GitHub Issue comment + `blocked` label | 4h |
| PR review request | GitHub PR + team tag | 24h |
| Breaking API change | GitHub Discussion + all stream leads | 4h |
| Hotfix needed | GitHub Issue P0 | Immediate |

**Rule**: All technical decisions go in GitHub Issues/Discussions — never in DMs or chat.
This ensures the decision trail is preserved and searchable.
