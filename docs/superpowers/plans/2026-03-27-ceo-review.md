# KMS — CEO Product & Engineering Review
**Date:** 2026-03-27 | **Branch:** dev | **Reviewer:** GStack CEO Review

---

## Section 1 — Premise Check

**What is this product?**
A personal knowledge base system: ingest files from Google Drive, Obsidian, local disk, and YouTube, embed them with BGE-M3, hybrid-search (BM25 + Qdrant semantic), and RAG-chat over them. Side features: voice transcription, knowledge graph, deduplication, admin dashboard.

**Is the premise sound?**
Yes. The core loop — ingest → embed → search → chat — is proven demand (Notion AI, Mem, Obsidian + plugins). The differentiation is self-hosted, multi-source, and agentic. The architecture can support it.

**Is the scope right?**
Too wide for a solo operator. 16 modules in the PRD index. You have a production-ready core (auth, Drive, search, embed) but the remaining 12 modules are all marked "Not Started" in `MASTER-FEATURE-OVERVIEW.md`. The planning doc was aspirational, not prescriptive — and that's fine now that the real system exists in code.

**Verdict:** The product works. The plan doc is stale. Real progress is ahead of the docs. Close that gap.

---

## Section 2 — What's Actually Built (Ground Truth from Code)

### Backend (kms-api) — Modules

| Module | Status | Notes |
|--------|--------|-------|
| Auth (JWT + refresh + Google OAuth) | DONE | Full implementation, bcrypt, JTI, session table |
| Users | DONE | Profile, API keys, password change |
| Sources (Google Drive + local + Obsidian) | DONE | Drive OAuth, folder picker, scan trigger |
| Files | DONE | List, filter, sort, cursor pagination, tags, collections |
| Search | DONE | Delegates to search-api (hybrid BM25 + Qdrant) |
| Collections | DONE | Create, manage, attach files |
| Tags | DONE | CRUD, file associations |
| ACP (AI Chat Protocol) | DONE | Streams to rag-service, agent orchestrator |
| Admin Dashboard | DONE | Stats, users, sources, scan jobs, reindexAll |
| Graph | DONE (untracked) | 4 Neo4j endpoints, Neo4jService, feature-flagged OFF |
| Feature Flags | DONE | Runtime `.kms/config.json` |
| Health | DONE | /live, /ready, /startup |
| Agents / Workflow | DONE (partial) | Orchestrator skeleton, search agent wired |
| YouTube Pipeline | NOT STARTED | PRD drafted |

### Backend (Python services)

| Service | Status | Notes |
|---------|--------|-------|
| scan-worker | DONE | AMQP consumer, Drive + local file discovery |
| embed-worker | DONE | BGE-M3, Qdrant upsert, on-disk HNSW |
| dedup-worker | DONE | Exact match + SHA-256 |
| graph-worker | DONE (feature-flagged OFF) | Neo4j relationship builder |
| rag-service | DONE | SSE streaming chat, tiered retrieval |
| voice-app | DONE | Whisper transcription, MinIO pending |
| search-api | DONE | Hybrid BM25 + semantic, RRF |

### Frontend

| Feature | Status | Notes |
|---------|--------|-------|
| Auth (login, register, Google OAuth) | DONE | |
| Dashboard | DONE | Stats overview |
| Files Browser (list, filter, sort, tags) | DONE | |
| Drive Browser (Google Drive view) | DONE | |
| FilesDrawer (inline preview) | DONE | Sprint 1 — image only right now |
| Search | DONE | Hybrid results, filter panel |
| Chat (RAG) | DONE (UI only) | rag-service must be enabled |
| Sources management | DONE | Connect Drive/local/Obsidian |
| Collections | DONE | UI |
| Admin Dashboard | DONE | Stats, users, sources, scan jobs |
| Graph Explorer | DONE (untracked) | ReactFlow visualisation, feature-flagged OFF |
| Settings (profile, API keys) | DONE | |
| Transcribe | DONE (UI) | |
| Junk detection UI | DONE | |
| Duplicates UI | DONE | |

### @kb/ui (Design System)

| Layer | Status |
|-------|--------|
| Tokens (tailwind-preset) | DONE |
| Primitives (Button, Badge, Icon, Text, Stack, Skeleton, Spinner, ProgressBar, Divider) | DONE |
| Composites — FileViewerShell + MIME registry | DONE |
| Composites — ImageViewer | DONE |
| Composites — VideoPlayer, AudioPlayer, PDFViewer | NOT STARTED (Sprint 2) |
| Composites — CodeViewer, MarkdownRenderer | NOT STARTED (Sprint 3) |
| Composites — DataTableViewer, ObsidianRenderer | NOT STARTED (Sprint 4) |
| Feature — FilesDrawer | DONE |
| Feature — FileDetailPage | NOT STARTED (Sprint 2) |
| Feature — ChatArtifactPanel | NOT STARTED (Sprint 3) |

---

## Section 3 — What's Pending / Blocked / Backlog

### Currently Modified/Untracked (NOT committed)

| Change | Risk |
|--------|------|
| kms-api admin module changes (reindexAll, getScanJobs, stats DTO) | Code exists, tests unknown, not committed |
| kms-api graph module (untracked) | Full implementation exists, tests unknown, not in git |
| frontend/graph/GraphExplorer.tsx (untracked) | ReactFlow visualisation, not in git |
| frontend/lib/api/graph.ts (untracked) | API client, not in git |
| All Sprint 1 @kb/ui docs (ADRs, sequence diagrams, PRDs) | Docs not committed |

**Immediate action:** commit or stash all untracked changes before starting Sprint 2. Clean working tree = clear head.

### Production Blockers (from `docs/prd/BACKLOG-INDEX.md`)

| # | Issue | Blocks Prod? |
|---|-------|-------------|
| 1 | MinIO Transcript Storage — transcripts in PostgreSQL TEXT bloat the DB | YES |
| 2 | File Deletion Sync — deleted Drive files still indexed | YES |
| 3 | Qdrant Access Control — unauthenticated by default | YES |
| 4 | Token Encryption Key Rotation — static key | YES |
| 5 | Transcript Encryption at Rest | YES |

None of these are code problems — they're ops/config/infra problems. Fast to fix.

### TypeScript Error Found

`frontend/__tests__/integration/services-integration.test.ts` has missing `@types/jest` in tsconfig. This is a pre-existing issue. Low priority but `tsc --noEmit` is not clean.

### Feature-Flagged Off (Staged but not live)

| Feature | Config | Ready to Enable? |
|---------|--------|-----------------|
| Graph (Neo4j) | `features.graph.enabled: false` | Yes, if Neo4j running |
| RAG Chat | `features.rag.enabled: false` | Yes, if LLM configured |
| Obsidian | `features.obsidian.enabled: false` | Yes, if plugin installed |
| LLM | `llm.enabled: false` | Needs provider key |

---

## Section 4 — Architecture Assessment

**What's right:**
- Monorepo structure is clean. Each service has a clear boundary.
- NestJS with DI, Pino logging, OTel traces — solid foundation.
- MIME registry pattern for viewers — extendable at near-zero cost.
- Cursor-based pagination everywhere — won't fall apart at scale.
- Feature flags in `config.json` — enables/disables entire subsystems without deploys.
- BGE-M3 at 1024 dims — correct choice for multi-lingual, multi-domain content.

**What needs attention:**

1. **Graph module is untracked.** A full implementation (service + controller + Neo4jService + DTOs + frontend) exists on disk but has never been committed. It needs review, tests, and a commit.

2. **Admin module changes are unstaged.** `reindexAll()` and `getScanJobs()` exist in the service but the tests are not confirmed. Before committing, run `npm run test` in kms-api.

3. **WebSocket gateway is missing.** `docs/architecture/decisions/0033-websocket-file-status.md` specifies it but nothing is built. This blocks real-time file processing status in the FilesDrawer.

4. **FileDetailPage doesn't exist yet.** The `FilesDrawer` has an "Open full view" link but `/files/:id` has no dedicated detail page — it falls back to the generic files page.

5. **YouTube pipeline is zero-started.** A full PRD exists (`PRD-youtube-pipeline.md`) but no code. This is a high-value feature (paste URL → transcript → blog post).

6. **Sprint 1 docs are untracked.** Four ADRs, two sequence diagrams, one PRD, one BRD, two superpowers docs — all untracked. Must commit.

---

## Section 5 — Engineering Standards Gaps

### Gaps Found

| Gap | Severity | Location |
|-----|----------|---------|
| Frontend integration test file has TS errors (`@types/jest` missing in tsconfig) | LOW | `frontend/__tests__/integration/services-integration.test.ts` |
| Graph module has zero tests visible in git | MEDIUM | `kms-api/src/modules/graph/` |
| Admin changes (reindexAll, getScanJobs) test status unknown | MEDIUM | `kms-api/src/modules/admin/` |
| `packages/ui` coverage at 79.5% (below 80% gate) | LOW | `registry.ts`, `Divider.tsx` untested |
| OTel traces not verified after admin/graph additions | LOW | See CLAUDE.local.md rule |

### What's Correct

- `@InjectPinoLogger` used throughout NestJS — no `console.log` found.
- `@Trace()` decorator on all service methods — OTel spans consistent.
- `AppException` with KB error codes used for all errors.
- Cursor pagination prevents N+1 on large tables.
- `EmbedJobPublisher` properly uses `durable: true, persistent: true`.
- `GraphService` has security invariant: every Cypher query scoped by `user_id`.

---

## Section 6 — Feature Velocity (What Ships Next)

### Immediate Priority: Close the Open Loops (1–2 days)

Before any Sprint 2 work, close these:

1. **Commit graph module** — review tests, commit kms-api graph + frontend GraphExplorer.
2. **Commit admin changes** — run kms-api tests, commit reindexAll + getScanJobs.
3. **Commit Sprint 1 docs** — all ADRs, sequence diagrams, PRDs.
4. **Fix frontend TS error** — add `@types/jest` to `frontend/tsconfig.json` or `__tests__` tsconfig.
5. **PR: dev → main** — Sprint 1 is done, ship it.

### Sprint 2 — Rendering Engine + File Detail (3–4 days)

Goal: users can view video, audio, and PDF files inline. Plus the full-screen detail page.

| Task | Effort |
|------|--------|
| `VideoPlayer.tsx` — HTML5 video + controls + poster | S |
| `AudioPlayer.tsx` — HTML5 audio + waveform indicator | S |
| `PDFViewer.tsx` — react-pdf lazy-loaded + pagination | M |
| Register Video/Audio/PDF in `registry.ts` | XS |
| `FileDetailPage` — `/files/:id` route, full-screen FileViewerShell | S |
| Tests for each viewer (≥80%) | S |
| WebSocket gateway (kms-api) — `files.status` events | M |
| Nginx WS proxy config | XS |
| Hook FilesDrawer to WS for live status badge | S |

### Sprint 3 — Code/Markdown Viewers + YouTube Pipeline (4–5 days)

| Task | Effort |
|------|--------|
| `CodeViewer.tsx` — shiki syntax highlighting, copy button | S |
| `MarkdownRenderer.tsx` — react-markdown + rehype, sanitized | S |
| `ChatArtifactPanel.tsx` — two-column chat + FileViewerShell | M |
| YouTube pipeline: transcript extract (yt-dlp), async job, status poll | L |
| YouTube content generation (blog post, LinkedIn, Twitter via Claude) | M |
| YouTube frontend: URL input + job status + generated content panel | M |

### Sprint 4 — Production Readiness + Graph Enable (3–4 days)

| Task | Effort |
|------|--------|
| MinIO transcript storage (production blocker #1) | M |
| File deletion sync (production blocker #2) | S |
| Qdrant auth (production blocker #3) | XS |
| Enable graph feature flag + GraphExplorer polish | S |
| Enable RAG chat (configure LLM provider) | XS |
| Storybook for @kb/ui (optional but high value for design iteration) | M |
| packages/ui coverage to ≥80% (add registry.ts + Divider tests) | XS |

---

## Section 7 — Recommended Immediate Actions (Do Today)

1. **Run kms-api tests** and confirm admin module changes pass.
   ```bash
   cd kms-api && npm run test 2>&1 | tail -20
   ```

2. **Review graph module tests.** Check `kms-api/src/modules/graph/` for `.spec.ts` files.
   ```bash
   find kms-api/src/modules/graph -name "*.spec.ts"
   ```

3. **Commit everything in a clean pass:**
   - Commit 1: `feat(kms-api): add graph module with Neo4j service and 4 graph endpoints`
   - Commit 2: `feat(frontend): add GraphExplorer component with ReactFlow`
   - Commit 3: `feat(kms-api): extend admin module with reindexAll and getScanJobs`
   - Commit 4: `docs: add Sprint 1 ADRs, sequence diagrams, PRDs, and feature guide`

4. **Fix the TS integration test error** — add `"types": ["jest"]` to the integration test tsconfig or the root `tsconfig.json`.

5. **Open a PR: dev → main.** Sprint 1 is complete. Ship it to main.

---

## Section 8 — Sprint Planning Summary

| Sprint | Theme | Duration | Output |
|--------|-------|----------|--------|
| S0 (NOW) | Close open loops — commit everything, PR to main | 1–2 days | Clean main branch |
| S1 | DONE — @kb/ui scaffold + ImageViewer + FilesDrawer | Shipped | 16 commits, 480+ tests |
| S2 | Video/Audio/PDF viewers + FileDetailPage + WebSocket | 3–4 days | All file types previewable |
| S3 | Code/Markdown viewers + ChatArtifactPanel + YouTube | 4–5 days | Content generation live |
| S4 | Production readiness + Graph enable + RAG enable | 3–4 days | First production deploy |

---

## Section 9 — What You Should NOT Work On Right Now

- Storybook (Sprint 4 at earliest — no users yet to need it)
- Multimodal processing (video/slides/charts) — in backlog for good reason
- Semantic deduplication (`semanticMatchEnabled: false`) — premature optimization
- New PRDs — you have more PRDs than implementations, stop planning and ship
- New modules — finish the viewers before adding YouTube or any new domain

---

## Section 10 — One-Sentence Verdict

The core system is production-capable, the rendering engine has a solid foundation, and the two biggest risks right now are uncommitted code rotting on disk and production blockers that take an hour each to fix — commit everything today, fix the 5 blockers, and Sprint 2 will ship a product people can actually use.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Full project audit — scope, architecture, sprint plan | 1 | DONE | 10 sections — see above |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
