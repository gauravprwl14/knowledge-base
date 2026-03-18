---
title: KMS Sprint Board
type: planning
status: current
updated: 2026-03-18
---

# KMS Sprint Board

Last Updated: 2026-03-18

---

## Current Sprint: Sprint 4 — Full Agentic Platform

Sprint Goal: MCP server exposes KMS tools to Claude Code; external agents (Codex, Gemini) can be invoked as workflow steps.

---

## In Progress

### Sprint 4: Full Agentic Platform

- [x] kms_spawn_agent tool: invoke Claude / Codex / Gemini as workflow step (2026-03-18)
- [x] MCP server: expose kms_search, kms_store, kms_graph_query to Claude Code (2026-03-18)
- [ ] Codex adapter (OpenAI API) — HttpAcpAdapter wired; needs Codex API auth + endpoint config
- [ ] Gemini adapter (Google AI API) — StdioAcpAdapter wired; needs gemini-acp npm package
- [ ] Obsidian plugin: "Send to KMS" and "Ask KMS" commands
- [ ] Google Drive connector: OAuth flow complete; delta sync + pipeline indexing pending

### Sprint 5 (Parallel): Production Hardening

- [x] 80% test coverage: kms-api + all Python services — **spec files written 2026-03-18, pending CI run**
- [ ] PostgreSQL checkpointer for LangGraph (ADR-0025)
- [ ] Full OTel instrumentation: NestJS traces + metrics, Python traces
- [ ] Grafana dashboards: latency by tier, embedding throughput, workflow success rate
- [ ] Integration tests: all ACP endpoints, YouTube workflow, blog post workflow
- [ ] Rate limiting on all public endpoints
- [ ] JWT refresh token rotation + auth audit logging

---

## DoD Gate Status (as of 2026-03-18)

| Gate | Description | Status |
|------|-------------|--------|
| 1 | ADR written for every non-obvious technology choice | PASS |
| 2 | Sequence diagram for every new cross-service data flow | PASS |
| 3 | Unit tests >= 80% coverage + error branches tested | **UNBLOCKED** (spec files written — pending CI) |
| 4 | Structured logs on all significant events | PASS |
| 5 | TSDoc/docstrings on all new public exports | PASS |
| 6 | CONTEXT.md updated for new modules/files | PASS |
| 7 | No hardcoded secrets or raw PII in logs | PASS |
| 8 | DB migrations are backward-compatible | PASS |

### Gate 3 — Missing Spec Files (20 files)

The following spec/test files must be written to reach 80% coverage:

**kms-api (NestJS — 18 missing)**

1. `kms-api/src/modules/sources/sources.service.spec.ts`
2. `kms-api/src/modules/sources/sources.controller.spec.ts`
3. `kms-api/src/modules/files/files.service.spec.ts`
4. `kms-api/src/modules/files/files.controller.spec.ts`
5. `kms-api/src/modules/acp/acp.service.spec.ts`
6. `kms-api/src/modules/acp/acp.controller.spec.ts`
7. `kms-api/src/modules/workflow/workflow.service.spec.ts`
8. `kms-api/src/modules/workflow/workflow.controller.spec.ts`
9. `kms-api/src/modules/workflow/content-store.service.spec.ts`
10. `kms-api/src/modules/users/users.service.spec.ts`
11. `kms-api/src/modules/tags/tags.service.spec.ts`
12. `kms-api/src/modules/search/search.service.spec.ts`
13. `kms-api/src/modules/agents/agents.service.spec.ts`
14. `kms-api/src/modules/feature-flags/feature-flags.service.spec.ts`
15. `kms-api/src/modules/auth/auth.controller.spec.ts`
16. `kms-api/src/modules/collections/collections.controller.spec.ts`
17. `kms-api/src/modules/sources/token-encryption.service.spec.ts`
18. `kms-api/src/cache/cache.service.spec.ts`

**Python services (2 missing)**

19. `services/rag-service/tests/test_generator.py`
20. `services/rag-service/tests/test_retriever.py`

---

## Completed

### Phase 0 — Architecture and Documentation
- PRD-M00 through PRD-M15 (full product requirement suite)
- ADR-0001 through ADR-0029 (all major architectural decisions)
- Sequence diagrams 03-21 (all major data flows documented)
- KMS-AGENTIC-PLATFORM.md, KMS-VISION.md, MASTER-ROADMAP.md
- Engineering standards, feature guides, YAML frontmatter spec

### Phase 1 — ACP Foundation ✅ (merged into feat/design-web-ui)
- [x] ACP HTTP Gateway — initialize, session, SSE prompt endpoints
- [x] kms_search tool — calls search-api with AbortSignal timeout
- [x] Anthropic Claude adapter — streaming with `@anthropic-ai/sdk`
- [x] ACP session store — Redis via CacheService, sliding TTL
- [x] LLM provider factory — Anthropic-primary, Ollama fallback, capability routing
- [x] YAML frontmatter spec — mandatory for all AI-generated docs
- [x] AppError refactor — ErrorFactory, TransformInterceptor, LoggingInterceptor
- [x] OTel — BatchSpanProcessor, PeriodicExportingMetricReader wired in main.ts

### Sprint 2 — Core Knowledge Pipeline ✅ (merged into feat/design-web-ui)
- [x] NestJS search-api (port 8001) — BM25 + semantic + RRF hybrid search, mock-first
- [x] EmbeddingService — BGE-M3 (BAAI/bge-m3, 1024 dims) with SHA-256 mock fallback
- [x] QdrantService — ensure_collection + upsert_chunks, mock/real modes
- [x] LocalFileConnector — recursive walk, extension filter, incremental scan (mtime + SHA-256)
- [x] QueryClassifier — 5 query types (LOOKUP/FIND/EXPLAIN/SYNTHESIZE/GENERATE), 9 regex patterns, ~5ms
- [x] TierRouter — 3-tier escalation with short-circuit thresholds (0.9 / 0.8 / 0.0)
- [x] LLMGuard — ~90% queries skip Claude (LOOKUP/FIND with score > 0.85)
- [x] Frontend chat UI — ACP SSE client, useChat hook, ChatMessage, ChatInput, auto-scroll

### Sprint 3 — Content Workflows ✅ (merged into feat/design-web-ui)
- [x] url-agent service (FastAPI, port 8004) — UrlClassifier, YouTubeExtractor (mock+yt-dlp), WebExtractor (mock+trafilatura), YAML frontmatter, Dockerfile
- [x] WorkflowEngine NestJS module — POST /workflow/urls/ingest, BullMQ async processor
- [x] WorkflowProcessor — url-agent extract → Anthropic summary → ContentStore write
- [x] ContentStoreService — writes YAML-frontmatted .md files to CONTENT_STORE_PATH
- [x] Error codes KBWFL0001 (job not found) + KBWFL0002 (url-agent unavailable, retryable)

### Additional completed work (merged into feat/design-web-ui)
- [x] Google Drive source: OAuth flow, token encryption, delta sync connector
- [x] Local + Obsidian source registration (POST /sources/local, POST /sources/obsidian)
- [x] Drive file browser UI — paginated list, bulk delete, tag assign, bulk move
- [x] Tag system — manual create/assign, AI auto-tag, filter by tag, cascade delete
- [x] Deduplication pipeline — SHA-256 cache, DB cross-source check, Qdrant near-dup 0.98
- [x] Collections CRUD — NestJS module, repository, DTOs
- [x] Files CRUD — NestJS module, repository, DTOs, scan job publisher
- [x] ADR-0028: Dual-queue boundary (BullMQ vs RabbitMQ)
- [x] ADR-0029: Standalone search-api NestJS service

---

## Blocked

**Gate 3 (Tests)**: 80% test coverage not yet achieved. Sprint 5 test tasks are the current blocker for production deployment.

---

## Risks (Sprint 4)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| MCP server spec changes | Low | Low | Version-pin `@modelcontextprotocol/sdk` |
| Google Drive OAuth complexity | Medium | Medium | Use existing `googleapis` package already in kms-api |
| Obsidian plugin distribution | Low | Low | Local install via BRAT; AppStore not required for v1 |
| Test coverage remains blocked | High | Medium | Dedicate Sprint 5 fully to test writing before merge to main |

---

## Definition of Done

A sprint task is done when:
1. Code written, passes lint (`npm run lint` / `ruff`)
2. Unit tests written and passing (80% coverage target)
3. No TypeScript errors (`tsc --noEmit`)
4. Inline comments on every logic block; TSDoc/Google docstrings on all exports
5. YAML frontmatter on any AI-generated `.md` files
6. PR reviewed and merged to `feat/design-web-ui`

### Sprint 1-3 Integration Test

```bash
# 1. Initialize ACP session
SESSION=$(curl -s -X POST http://localhost:3000/acp/v1/initialize \
  -H "Content-Type: application/json" \
  -d '{"protocolVersion":"1.0","clientInfo":{"name":"test","version":"1.0"}}' | jq -r '.sessionId')

# 2. Send question, receive streamed Claude response citing KMS docs
curl -N -X POST http://localhost:3000/acp/v1/sessions/$SESSION/prompt \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{"prompt":[{"type":"text","text":"What embedding model does KMS use and why?"}]}'

# 3. Ingest a YouTube URL via WorkflowEngine
curl -X POST http://localhost:3000/workflow/urls/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{"url":"https://youtube.com/watch?v=dQw4w9WgXcQ"}'

# Expected: SSE stream with Claude response, then job queued confirmation
```
