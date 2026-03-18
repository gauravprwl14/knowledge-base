# KMS Master Roadmap

Last Updated: 2026-03-17

---

## Reality Check — Current State

The documentation suite is extensive and high quality. The code is mostly scaffolding and stubs.

What is actually implemented and working:
- Basic NestJS kms-api module structure (files, sources, collections, auth — scaffolded, not production-ready)
- Python worker services with basic AMQP consumers (scan-worker, embed-worker, graph-worker — consumers exist, full pipelines not wired)
- Frontend pages with placeholder UI (drive page, source cards — UI shells, no real data flow)
- PostgreSQL schema partially migrated (kms_files, auth_users tables exist; not all relations finalized)
- Feature flags in `.kms/config.json` are all set to `false` — nothing is enabled in production

What is NOT implemented despite being documented:
- ACP gateway — zero code written
- Hybrid search (search-api) — scaffolded, not operational
- Embedding pipeline — embed-worker exists but BGE-M3 not loaded and running
- Tiered retrieval — designed in PRD but not coded
- LangGraph workflows — no code
- url-agent service — no code
- MCP server — no code
- Obsidian plugin — no code

This roadmap reflects reality, not aspiration.

---

## Phase 0 — Architecture and Documentation

**Status: ~80% Complete**

The goal of Phase 0 was to design the system before building it. This is largely done.

### Completed

- PRD-M00 through PRD-M15 written (full product requirement suite)
- ADR-0001 through ADR-0024 written (covering database choices, message broker, embedding model, agent protocol, LangGraph, vector store, etc.)
- Sequence diagrams 03-15 written (covering all major data flows)
- KMS-AGENTIC-PLATFORM.md — master architecture document
- Feature guides FOR-*.md written (nestjs-patterns, python-patterns, error-handling, logging, observability, testing, database, api-design)
- Engineering standards defined (ENGINEERING_STANDARDS.md)
- Tiered retrieval design (full Query Classifier + Tier Router + LLM Guard design)
- External agent integration design (ACP, Claude Code MCP, Codex, Gemini)

### Still Pending in Phase 0

- ADR-0025: PostgreSQL checkpointer for LangGraph (replacing Redis-only checkpoint store)
- ADR-0026: LLM provider abstraction layer (how kms-api switches between Claude, Ollama, Gemini per workflow)
- Sprint tracking formalized (now done — see SPRINT-BOARD.md)

---

## Phase 1 — ACP Foundation + Claude Code Integration

**Status: NOT STARTED — Current Sprint**

Phase 1 is the first real code. The goal is simple: Claude Code can search the KMS knowledge base via ACP. No frontend required. No full pipeline required. One working end-to-end path.

### What Gets Built

**ACP HTTP Gateway** (`kms-api/src/modules/acp/`)
- `POST /acp/v1/sessions` — initialize a session, returns session_id
- `GET /acp/v1/sessions/:id` — retrieve session state
- `POST /acp/v1/sessions/:id/prompt` — send a prompt, get SSE-streamed response

**kms_search Tool**
- First ACP tool: takes a query string, calls search-api, returns ranked results
- search-api must be minimally operational for this (BM25 at minimum)

**Claude API Adapter**
- Anthropic SDK integration in kms-api
- Wraps `messages.create` with streaming
- Configuration via ANTHROPIC_API_KEY environment variable

**ACP Session Store**
- Redis-backed session state
- Session holds: agent identity, tool registry, conversation history

**SSE Streaming**
- Server-Sent Events for prompt responses
- kms-api streams Claude's response tokens to the caller

**Docker Compose Update**
- Add ANTHROPIC_API_KEY to kms-api service environment
- Confirm search-api starts and is reachable from kms-api

**Integration Test**
- `curl -X POST /acp/v1/sessions/prompt -d '{"query": "What embedding model do we use?"}'`
- Expected: streamed response from Claude citing ADR-0009 content from knowledge base

### Acceptance Criteria for Phase 1

A user can send a question via the ACP HTTP endpoint and receive a streamed response from Claude that cites documents from the knowledge base. The full path — HTTP in, Redis session, search-api query, Claude call, SSE stream out — must work end-to-end.

No frontend required. No embedding pipeline required (BM25-only for Phase 1 is acceptable). No graph required.

### Dependencies

- search-api must serve BM25 results (can be stub/read-only for Phase 1)
- Redis must be running (already in Docker Compose)
- At least some documents must be indexed (manual seed data acceptable for Phase 1)
- ANTHROPIC_API_KEY must be configured

---

## Phase 2 — Core Knowledge Pipeline

**Status: NOT STARTED**
**Blocked by: Phase 1 acceptance criteria met**

Phase 2 makes the knowledge pipeline real. Content goes in, gets embedded, and becomes retrievable via hybrid search.

### What Gets Built

**Embedding Pipeline**
- embed-worker loads BAAI/bge-m3 at 1024 dimensions
- Processes messages from `kms.embed` RabbitMQ queue
- Stores vectors in Qdrant

**Hybrid Search**
- search-api becomes fully operational: BM25 + vector similarity
- BGE-M3 reranker applied to combined results
- Results ranked by RRF (Reciprocal Rank Fusion)

**File Ingestion**
- scan-worker discovers files from registered sources (local filesystem, Obsidian vault)
- Publishes to `kms.scan` → `kms.embed` → Qdrant pipeline
- PostgreSQL records created for each ingested file

**Tiered Retrieval**
- Query Classifier: routes queries to correct tier (BM25, hybrid, graph, LLM)
- Tier Router: executes the right retrieval strategy
- LLM Guard: prevents unnecessary Claude calls for Tier 0/1 queries

**Basic Frontend Chat**
- Minimal chat interface in Next.js frontend
- Sends queries to ACP endpoint
- Renders SSE-streamed responses with citations

### Acceptance Criteria for Phase 2

A user can register a local folder, scan it, and ask questions about the documents in that folder via the chat interface. Responses cite the actual documents. Keyword queries resolve without a Claude call.

---

## Phase 3 — Content Workflows

**Status: NOT STARTED**
**Blocked by: Phase 2 acceptance criteria met**

Phase 3 adds agentic content workflows — the ability to ingest URLs and generate content that is saved back to the knowledge base.

### What Gets Built

**url-agent Service**
- New Python FastAPI service
- YouTube URL → transcript extraction (yt-dlp or YouTube Data API)
- Web page URL → content extraction (Playwright or trafilatura)
- Publishes extracted content to embed pipeline

**WorkflowEngine (NestJS)**
- LangGraph integration in kms-api
- State machine for multi-step workflows
- PostgreSQL checkpointer (ADR-0025 prerequisite)
- Workflow definitions: YAML or code-defined graphs

**YouTube URL Workflow**
- Trigger: user drops YouTube URL in chat
- Steps: detect URL → call url-agent → extract transcript → generate summary → store to Obsidian → index in Qdrant
- End state: note exists in Obsidian vault and is searchable

**Blog Post Generation Workflow**
- Trigger: user requests "write a blog post about X"
- Steps: hybrid search for X → retrieve top documents → generate post with Claude → store to Obsidian/local filesystem → index in Qdrant
- End state: blog post exists as a file, is searchable, cites its sources

**Content Storage**
- Generated files saved to configured Obsidian vault path or local filesystem
- PostgreSQL record created with: file path, generation source, workflow run ID, timestamp
- Content indexed and searchable immediately after storage

### Acceptance Criteria for Phase 3

A user can drop a YouTube URL in chat and receive a note in their Obsidian vault within 60 seconds. A user can request a blog post and receive a Markdown file saved to their configured output folder, searchable via KMS.

---

## Phase 4 — Full Agentic Platform

**Status: NOT STARTED**
**Blocked by: Phase 3 acceptance criteria met**

Phase 4 completes the multi-agent vision: external agents can connect, sub-agents can be spawned, and Claude Code has live KMS context during coding.

### What Gets Built

**Sub-Agent Spawning**
- `kms_spawn_agent` tool: invoke Claude, Codex, Gemini, or any ACP agent as a workflow step
- Agent results returned to calling workflow
- Parallel sub-agent execution supported

**MCP Server**
- KMS exposes an MCP server endpoint
- Claude Code connects as MCP client
- Tools available via MCP: kms_search, kms_store, kms_graph_query
- No manual copy-paste — Claude Code calls KMS autonomously during coding sessions

**External Agent Adapters**
- Codex adapter (OpenAI API)
- Gemini adapter (Google AI API)
- Generic ACP-to-adapter bridge for future agents

**Obsidian Plugin**
- Plugin for Obsidian that triggers KMS workflows from within the vault
- "Send to KMS" command: selected note → indexed in KMS
- "Ask KMS" command: query KMS from within Obsidian, result inserted as note

**Google Drive Source**
- Google Drive connector in scan-worker
- OAuth flow in kms-api frontend
- Incremental sync (delta changes only)
- Files from Drive indexed in same pipeline as local files

### Acceptance Criteria for Phase 4

Claude Code can call kms_search autonomously during a coding session and receive relevant results from the knowledge base. A user can drop a URL in Obsidian and have it processed by a KMS workflow. Google Drive files are indexed and searchable alongside local files.

---

## Phase 5 — Production Hardening

**Status: NOT STARTED**
**Can run in parallel with Phases 3 and 4**

Phase 5 is ongoing work that should be layered in as the system stabilizes. It is not a blocker for any phase but must be complete before any production deployment.

### What Gets Built

**PostgreSQL Checkpointer for LangGraph**
- Replace Redis-only LangGraph checkpoint store with PostgreSQL
- Workflow state survives Redis restarts
- Enables workflow history and replay
- Prerequisite: ADR-0025 written

**LLM Provider Abstraction**
- Unified provider interface: Claude, Ollama, Gemini
- Per-workflow LLM configuration
- Fallback logic (Claude unavailable → Ollama)
- Prerequisite: ADR-0026 written

**Full OTel Instrumentation**
- All NestJS services: traces, metrics, logs exported to OTel Collector
- All Python services: traces via opentelemetry-sdk
- Grafana dashboards for: latency by tier, embedding throughput, workflow success rate

**Test Coverage**
- 80% minimum coverage across kms-api and all Python services
- Integration tests for all ACP endpoints
- End-to-end workflow tests (YouTube URL workflow, blog post workflow)

**Security Hardening**
- Rate limiting on all public endpoints
- JWT expiry and refresh token rotation
- Auth audit logging
- Input validation on all ACP tool parameters

---

## Phase Dependency Graph

```
Phase 0 (Architecture) → Phase 1 (ACP Foundation) → Phase 2 (Pipeline) → Phase 3 (Workflows) → Phase 4 (Full Platform)
                                                                                         ↗
                                                        Phase 5 (Hardening) ──────────
```

Phase 5 runs in parallel with Phases 3 and 4 but must complete before production.

---

## Key Technical Decisions Already Made

These are locked in via ADRs and must not be revisited without a new ADR:

| Decision | Choice | ADR |
|----------|--------|-----|
| Core API framework | NestJS 11 (Fastify) | ADR-0001 |
| Message broker | RabbitMQ | ADR-0002 |
| Embedding model | BAAI/bge-m3 @ 1024 dims | ADR-0009 |
| Vector store | Qdrant | ADR-0008 |
| Graph database | Neo4j | ADR-0007 |
| Agent protocol | ACP (HTTP transport) | ADR-0018 |
| Workflow engine | LangGraph | ADR-0019 |
| Default LLM | Claude (Anthropic API) | ADR-0020 |
| Frontend | Next.js 15 (App Router) | ADR-0005 |
| ORM | Prisma | ADR-0004 |
