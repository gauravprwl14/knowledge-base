# Product Requirements Document — Knowledge Base System v2.0

**Version**: 2.0
**Date**: 2026-03-17
**Status**: Active — Approved for Implementation
**Supersedes**: KMS_PROJECT_SUMMARY.md (v1.0)

---

## 1. Executive Summary

The Knowledge Base System is an **open-source, self-hosted, privacy-first** platform for individuals and teams to capture, organize, search, and reason over their entire knowledge — across Google Drive, Obsidian vaults, local files, audio/video, and personal notes — through a unified AI-powered interface.

**Core differentiators:**
- **Graph-traversal intelligence**: Navigate knowledge like a mind map, not just keyword search
- **Config-driven, feature-flag-first**: Every capability on/off via JSON; Ollama-disabled = auto graceful degradation
- **ACP-native**: Works as a multi-agent system and integrates with IDE agents (Zed, Cursor)
- **TDD-built**: 80%+ test coverage; tests written before code
- **Local-first LLM**: Privacy by default; cloud LLMs optional via OpenRouter

---

## 2. Problem Statement

Knowledge workers accumulate content across:
- Google Drive (documents, sheets, PDFs, images)
- Obsidian vaults (markdown notes, backlinks, tags)
- Local drives and external USB drives
- Audio/video recordings (meetings, lectures)
- Personal notes and bookmarks

**Current pain points:**
- Finding a document requires remembering which app it's in
- Duplicate files silently waste storage
- Connections between ideas are invisible across sources
- Audio/video content is not searchable
- Context is lost when switching between tools

**This system solves**: One place to capture, search, navigate, and reason over all knowledge.

---

## 3. User Stories

### P0 — Must Have (MVP)

**S1 — Unified Search**
```
As a knowledge worker,
I want to search across all my files and notes in one place,
So that I can find information regardless of where it's stored.

Acceptance criteria:
- Keyword search returns results from Google Drive + Obsidian + notes
- Results show source (icon), file name, snippet, last modified
- Search <500ms p95
- Supports file type and source filters
```

**S2 — Google Drive Integration**
```
As a user,
I want to connect my Google Drive and have files automatically indexed,
So that my Drive content is searchable without manual upload.

Acceptance criteria:
- OAuth 2.0 flow: Connect Drive in <2 minutes
- Initial scan indexes all supported files
- Incremental sync every 60 minutes (configurable)
- Supported: PDF, DOCX, PPTX, XLSX, images, Google Docs/Sheets/Slides
- Files >100MB skipped (configurable limit)
```

**S3 — Personal Notes**
```
As a user,
I want to quickly capture a note (text, link, or voice),
So that ideas don't get lost.

Acceptance criteria:
- Note created in <3 clicks from any page
- Tags and links to other notes/files
- Notes are searchable immediately after creation
- Export to Obsidian vault format
```

**S4 — Duplicate Detection**
```
As a user,
I want to see exact duplicate files across my sources,
So that I can free up storage.

Acceptance criteria:
- Exact duplicates detected by SHA-256 hash
- Group view: original + all duplicates
- Bulk delete with confirmation
- Never delete original (user designates canonical)
```

**S5 — Observability**
```
As a system operator,
I want full observability into all services,
So that I can diagnose performance issues.

Acceptance criteria:
- All services emit OTel traces, metrics, logs from day 1
- Grafana dashboards: service health, search latency, queue depth, LLM usage
- Alert if p95 search latency >500ms
- Alert if any service is down >1 minute
```

### P1 — High Value (Post-MVP)

**S6 — Knowledge Graph Navigation**
```
As a knowledge worker,
I want to visually explore how my documents connect,
So that I can discover non-obvious relationships.

Acceptance criteria:
- Graph view shows files as nodes, connections as edges
- Community detection groups related files into clusters
- Click a node to see all connected documents
- Find shortest path between two concepts
```

**S7 — RAG Q&A Chat**
```
As a user,
I want to ask questions in natural language and get answers from my knowledge base,
So that I don't have to read every document manually.

Acceptance criteria:
- Answer includes citations (source file + chunk)
- Click citation to open the source file
- Streaming response (first token <2s)
- Conversation history (within session)
- Graceful degradation: if LLM disabled, returns search results instead
```

**S8 — Obsidian Plugin**
```
As an Obsidian user,
I want the KMS to sync with my vault bidirectionally,
So that my notes are searchable alongside my other sources.

Acceptance criteria:
- Plugin installable from Obsidian community plugins
- Vault changes sync to KMS within 30 seconds
- Backlinks ([[wikilinks]]) resolved and indexed
- Sidebar panel shows related files from other sources
- Settings: KMS URL + API key (no hardcoding)
```

**S9 — Semantic Duplicate Detection**
```
As a user,
I want to find semantically similar documents (not just exact copies),
So that I can consolidate related content.

Acceptance criteria:
- Semantic dedup finds documents >95% similar
- User reviews and confirms before deletion
- Similarity score shown
- Requires embedding provider enabled (graceful disable message if not)
```

**S10 — Audio/Video Transcription**
```
As a user,
I want my audio and video files automatically transcribed,
So that meeting recordings and lectures are searchable.

Acceptance criteria:
- Supports MP3, WAV, MP4, MOV
- Transcription via Whisper (local) or Groq/Deepgram (cloud)
- Transcription text searchable
- Speaker diarization (future)
```

### P2 — Nice to Have

- S11: Image OCR (make image text searchable)
- S12: CLI tool (kms-scan for local/external drives)
- S13: Junk file detection and cleanup
- S14: Version duplicate grouping (doc_v1.pdf, doc_v2.pdf)
- S15: Notion connector
- S16: GitHub connector (repos, issues, PRs as knowledge)
- S17: Webhook on file indexed / duplicate found

---

## 4. Feature Flag Requirements

### FR-01: Config-First Architecture
All capabilities MUST be controlled by `kms.config.json`. No capability is hardcoded as always-on.

### FR-02: Impact-Aware Disabling
When a feature is disabled, the system MUST:
- Log a clear warning at startup listing all downstream impacts
- Auto-disable dependent features
- Return 503 with descriptive message (not 500) for disabled endpoints
- Show UI warning/empty state (not blank page) for disabled features

### FR-03: Graceful Degradation Tiers

| Tier | Active Features | Requirements |
|------|----------------|-------------|
| **Minimal** | Keyword search, file listing, notes | PostgreSQL + Redis only |
| **Standard** | + Semantic search, dedup | + Ollama + Qdrant |
| **Full** | + RAG chat, graph, Obsidian | + Neo4j + LLM |
| **Premium** | + Cloud LLMs, better quality | + OpenRouter API key |

### FR-04: FeatureGate UI Component
The frontend MUST implement a `<FeatureGate feature="rag" />` component that:
- Hides sections when feature is disabled
- Shows "Enable this feature" hint with link to docs
- Fetches feature state from `/api/v1/config/features`

---

## 5. Non-Functional Requirements

### Performance
- Search latency: <500ms p95 (keyword), <800ms p95 (hybrid)
- RAG first token: <2s
- File indexing: >500 files/minute per scan-worker
- Embedding: >100 chunks/minute per embed-worker
- Graph traversal: <200ms for 6-hop path

### Reliability
- System uptime: >99% (excluding maintenance)
- Queue message delivery: at-least-once
- Dead letter queue for failed messages after 3 retries
- Stale job recovery: PROCESSING > 60min → auto-reset to QUEUED

### Security
- OAuth tokens encrypted at rest (AES-256-GCM)
- API keys hashed (SHA-256), never stored plain
- All inter-service communication over internal Docker network
- No user data leaves local environment without explicit cloud provider config
- CORS restricted to configured origins

### Observability (Non-Negotiable)
- OpenTelemetry on ALL services from M0
- Custom spans for: LLM calls (model, tokens, latency), graph traversal (depth, nodes), embedding (batch size, model)
- Grafana dashboards for all P0 features before launch

### Testing
- Unit test coverage: ≥80% lines, ≥70% branches
- All tests written BEFORE implementation (TDD)
- Integration tests use testcontainers (no mocks for DB/queue/cache)
- E2E tests for all P0 user stories

### Documentation
- Inline docstrings/JSDoc on all public interfaces
- ADR for every architectural decision
- API documented in Swagger/OpenAPI
- Sequence diagrams for all major flows
- `PARALLEL_WORK_TRACKER.md` updated on every PR

---

## 6. Technical Constraints

1. **Docker-only deployment** — all services run in Docker, no bare-metal dependencies
2. **Frontend → BFF → kms-api → [Python services]** — no direct browser-to-Python calls
3. **Monorepo** — pnpm workspaces + Turbo
4. **Latest package versions** — no LTS pinning below Node 22 / Python 3.12
5. **Open source** — Apache 2.0 license, public GitHub repo
6. **No vendor lock-in** — all providers are swappable via config

---

## 7. Milestone Plan

| Milestone | Target | Success Criteria |
|-----------|--------|-----------------|
| **M0** Foundation | Week 2 | Docker Compose brings up all services; health checks pass; CI green |
| **M1** Core API | Week 6 | User registers, creates API key, connects source; files appear in UI |
| **M2** Google Drive | Week 10 | Drive connected, 1000 files scanned and listed in 5 minutes |
| **M3** Search | Week 14 | Hybrid search returns relevant results in <500ms; semantic requires Ollama |
| **M4** Graph | Week 17 | Knowledge graph renders; path-finding works; community clusters shown |
| **M5** Obsidian | Week 20 | Vault synced; backlinks resolved; related files sidebar works |
| **M6** RAG | Week 23 | Chat answers questions with citations; streaming works |
| **M7** MVP Launch | Week 26 | All P0 user stories pass; E2E tests green; docs complete |

---

## 8. Open Questions

| # | Question | Owner | Due |
|---|----------|-------|-----|
| 1 | Ollama GPU requirement — minimum specs? | DevOps | M0 |
| 2 | Google Drive API quotas — rate limit strategy? | Backend | M2 |
| 3 | Pact broker hosting — self-hosted or cloud? | DevOps | M1 |
| 4 | OpenRouter API key — shared or per-user? | Product | M3 |
| 5 | Obsidian plugin — community plugin submission? | Frontend | M5 |
| 6 | Open source repo name and license? | Product | M0 |

---

## 9. Out of Scope (MVP)

- Mobile app (web-only for MVP)
- Real-time collaboration
- SSO / Enterprise auth (SAML, LDAP)
- Multi-tenant SaaS hosting
- Stripe / billing integration
- Email notifications
- Browser extension
