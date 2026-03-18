# KMS Sprint Board

Last Updated: 2026-03-18

---

## Current Sprint: Sprint 4 — Full Agentic Platform

Sprint Goal: MCP server exposes KMS tools to Claude Code; external agents (Codex, Gemini) can be invoked as workflow steps.

---

## In Progress

Nothing yet — awaiting branch merges from Sprints 1-3 before Sprint 4 begins.

---

## Pending Merge (all branches ready)

| Branch | Commit | Contents |
|--------|--------|----------|
| `feat/phase1-acp-gateway` | `d5d0d54` | ACP HTTP gateway (initialize/session/SSE prompt), kms_search tool, Anthropic adapter, Redis session store + AppError refactor, TransformInterceptor, OTel |
| `feat/phase1-llm-provider` | `191702f` | LLMFactory (Anthropic-primary, Ollama fallback), GraphStateV2 with rolling window |
| `feat/phase1-yaml-frontmatter` | `d5f60b4` | Mandatory YAML frontmatter spec (Section 14) + 32 retroactively patched AI docs |
| `feat/sprint2-search-api` | `1724652` | NestJS hybrid search service: BM25 + semantic (Qdrant) + RRF (k=60), mock-first |
| `feat/sprint2-embed-pipeline` | `cdad265` | EmbeddingService (BGE-M3 + SHA-256 mock), QdrantService, LocalFileConnector (incremental scan) |
| `feat/sprint2-tiered-retrieval` | `c9b0ddb` | QueryClassifier (5 types), TierRouter (3 tiers), LLMGuard, 24 tests |
| `feat/sprint2-frontend-chat` | `6aace79` | ACP client (fetch SSE), useChat hook, ChatMessage, ChatInput, chat page |
| `feat/sprint3-url-agent` | `3575116` | FastAPI url-agent (port 8004): UrlClassifier, YouTubeExtractor, WebExtractor, YAML frontmatter, 19 tests |
| `feat/sprint3-workflow-engine` | `4e2b3db` | WorkflowEngine NestJS module: BullMQ processor, url-agent call, Anthropic summary, ContentStore |

---

## Completed

### Phase 0 — Architecture and Documentation
- PRD-M00 through PRD-M15 (full product requirement suite)
- ADR-0001 through ADR-0026 (all major architectural decisions)
- Sequence diagrams 03-15 (all major data flows documented)
- KMS-AGENTIC-PLATFORM.md, KMS-VISION.md, MASTER-ROADMAP.md
- Engineering standards, feature guides, YAML frontmatter spec

### Phase 1 — ACP Foundation ✅
- [x] ACP HTTP Gateway — initialize, session, SSE prompt endpoints
- [x] kms_search tool — calls search-api with AbortSignal timeout
- [x] Anthropic Claude adapter — streaming with `@anthropic-ai/sdk`
- [x] ACP session store — Redis via CacheService, sliding TTL
- [x] LLM provider factory — Anthropic-primary, Ollama fallback, capability routing
- [x] YAML frontmatter spec — mandatory for all AI-generated docs
- [x] AppError refactor — ErrorFactory, TransformInterceptor, LoggingInterceptor
- [x] OTel — BatchSpanProcessor, PeriodicExportingMetricReader wired in main.ts

### Sprint 2 — Core Knowledge Pipeline ✅
- [x] NestJS search-api (port 8001) — BM25 + semantic + RRF hybrid search, mock-first
- [x] EmbeddingService — BGE-M3 (BAAI/bge-m3, 1024 dims) with SHA-256 mock fallback
- [x] QdrantService — ensure_collection + upsert_chunks, mock/real modes
- [x] LocalFileConnector — recursive walk, extension filter, incremental scan (mtime + SHA-256)
- [x] QueryClassifier — 5 query types (LOOKUP/FIND/EXPLAIN/SYNTHESIZE/GENERATE), 9 regex patterns, ~5ms
- [x] TierRouter — 3-tier escalation with short-circuit thresholds (0.9 / 0.8 / 0.0)
- [x] LLMGuard — ~90% queries skip Claude (LOOKUP/FIND with score > 0.85)
- [x] Frontend chat UI — ACP SSE client, useChat hook, ChatMessage, ChatInput, auto-scroll

### Sprint 3 — Content Workflows ✅
- [x] url-agent service (FastAPI, port 8004) — UrlClassifier, YouTubeExtractor (mock+yt-dlp), WebExtractor (mock+trafilatura), YAML frontmatter, Dockerfile
- [x] WorkflowEngine NestJS module — POST /workflow/urls/ingest, BullMQ async processor
- [x] WorkflowProcessor — url-agent extract → Anthropic summary → ContentStore write
- [x] ContentStoreService — writes YAML-frontmatted .md files to CONTENT_STORE_PATH
- [x] Error codes KBWFL0001 (job not found) + KBWFL0002 (url-agent unavailable, retryable)

---

## Backlog (Future Sprints)

### Sprint 4: Full Agentic Platform

- [ ] kms_spawn_agent tool: invoke Claude / Codex / Gemini as workflow step
- [ ] MCP server: expose kms_search, kms_store, kms_graph_query to Claude Code
- [ ] Codex adapter (OpenAI API)
- [ ] Gemini adapter (Google AI API)
- [ ] Obsidian plugin: "Send to KMS" and "Ask KMS" commands
- [ ] Google Drive connector: OAuth flow, delta sync, index in pipeline

Acceptance criteria: Claude Code calls kms_search autonomously during a coding session. Google Drive files are searchable alongside local files.

### Sprint 5 (Parallel): Production Hardening

Can begin after Sprint 2 stabilizes. Must complete before production deployment.

- [ ] PostgreSQL checkpointer for LangGraph (ADR-0025)
- [ ] Full OTel instrumentation: NestJS traces + metrics, Python traces
- [ ] Grafana dashboards: latency by tier, embedding throughput, workflow success rate
- [ ] 80% test coverage: kms-api + all Python services
- [ ] Integration tests: all ACP endpoints, YouTube workflow, blog post workflow
- [ ] Rate limiting on all public endpoints
- [ ] JWT refresh token rotation + auth audit logging

### Sprint 4: Full Agentic Platform

Blocked by: Phase 3 acceptance criteria met

- [ ] kms_spawn_agent tool: invoke Claude / Codex / Gemini as workflow step
- [ ] MCP server: expose kms_search, kms_store, kms_graph_query to Claude Code
- [ ] Codex adapter (OpenAI API)
- [ ] Gemini adapter (Google AI API)
- [ ] Obsidian plugin: "Send to KMS" and "Ask KMS" commands
- [ ] Google Drive connector: OAuth flow, delta sync, index in pipeline

Acceptance criteria: Claude Code calls kms_search autonomously during a coding session. Google Drive files are searchable alongside local files.

### Sprint 5 (Parallel): Production Hardening

Can begin after Sprint 2 stabilizes. Must complete before production deployment.

- [ ] PostgreSQL checkpointer for LangGraph (ADR-0025 prerequisite must be written in Sprint 1)
- [ ] LLM provider abstraction layer (ADR-0026 prerequisite must be written in Sprint 1)
- [ ] Full OTel instrumentation: NestJS traces + metrics, Python traces
- [ ] Grafana dashboards: latency by tier, embedding throughput, workflow success rate
- [ ] 80% test coverage: kms-api + all Python services
- [ ] Integration tests: all ACP endpoints, YouTube workflow, blog post workflow
- [ ] Rate limiting on all public endpoints
- [ ] JWT refresh token rotation + auth audit logging

---

## Blocked

Nothing blocked. Sprints 1-3 are complete pending merge.

---

## Risks (Sprint 4)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| MCP server spec changes | Low | Low | Version-pin `@modelcontextprotocol/sdk` |
| Google Drive OAuth complexity | Medium | Medium | Use existing `googleapis` package already in kms-api |
| Obsidian plugin distribution | Low | Low | Local install via BRAT; AppStore not required for v1 |
| Merge conflicts across 9 branches | High | Medium | Merge in dependency order: Phase1 → Sprint2 → Sprint3 |

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
