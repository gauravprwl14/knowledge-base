# FEATURE_REGISTRY.md

> **Last updated**: 2026-03-28
> **Purpose**: Single source of truth for every feature — its documentation completeness, test status, active worktree, and DoD gate.
>
> **How to use**:
> - Update the `Status` column when a feature moves through the pipeline.
> - Update `PRD`, `PRD Audit`, `ADR`, `Seq Diag`, and `Tests` whenever those artifacts are created or reviewed.
> - Run `/task-completion-check` before moving any feature to `DONE`.
>
> **Status values**: `BACKLOG` | `PRD_GATE` | `DESIGN` | `IMPL` | `QA` | `DOD_CHECK` | `DONE` | `BLOCKED`
> **Symbol key**: ✅ done/exists/pass | ❌ missing/fail | ⚠️ partial/below-threshold | — unknown or not applicable

---

## Active Features

| Feature | PRD | PRD Audit | ADR | Seq Diag | Tests | Status | Worktree | Branch | Notes |
|---------|-----|-----------|-----|----------|-------|--------|----------|--------|-------|
| project-setup | ✅ | ❌ | — | — | — | PRD_GATE | — | — | M00 — boilerplate, DI, OTel, CI skeleton |
| authentication | ✅ | ❌ | ✅ | ✅ | — | PRD_GATE | — | — | M01 — JWT, API keys, RBAC; ADR-0005; seq 01,02 |
| source-integration | ✅ | ❌ | — | ✅ | — | PRD_GATE | — | — | M02 — local folder, Google Drive; seq 03 |
| content-extraction | ✅ | ❌ | — | ✅ | — | PRD_GATE | — | — | M03 — PDF/DOCX/XLSX/OCR chunking; seq 04 |
| embedding-pipeline | ✅ | ❌ | ✅ | ✅ | — | PRD_GATE | — | — | M04 — BGE-M3, Qdrant; ADR-0009,0010; seq 04 |
| search | ✅ | ❌ | ✅ | ✅ | — | IMPL | — | — | M05 — BM25+RRF; ADR-0029; seq 05,06,23 |
| deduplication | ✅ | ❌ | — | ✅ | — | PRD_GATE | — | — | M06 — SHA-256 + semantic dedup; seq 20 |
| junk-detection | ✅ | ❌ | — | — | — | BACKLOG | — | — | M07 — dedup-worker; no ADR or seq diag yet |
| transcription | ✅ | ❌ | — | ✅ | — | IMPL | .worktrees/transcription-pipeline | feat/transcription-pipeline | M08 — Whisper; seq 08,22 |
| knowledge-graph | ✅ | ❌ | — | — | — | IMPL | — | — | M09 — Neo4j; kms-api graph module landed (commit 241f412) |
| rag-chat | ✅ | ❌ | ✅ | ✅ | — | DESIGN | — | — | M10 — SSE streaming, agent orchestrator; ADR-0013,0024; seq 07,15 |
| web-ui | ✅ | ❌ | ✅ | ✅ | — | IMPL | — | — | M11 — Next.js 15, design system; ADR-0030,0031,0032; rendering seq diags |
| obsidian-plugin | ✅ | — | — | — | — | DONE | — | — | M12 — Send to KMS, Ask KMS; marked Done in CONTEXT.md |
| acp-integration | ✅ | ❌ | ✅ | ✅ | — | DESIGN | — | — | M13 — ACP protocol, tool registry; ADR-0012,0018,0019; seq 09,10,18 |
| agentic-workflows | ✅ | ❌ | ✅ | ✅ | — | DESIGN | — | — | M14 — workflow engine, YouTube ingest; ADR-0021,0022,0025; seq 11,12 |
| external-agent-integration | ✅ | ❌ | ✅ | ✅ | — | DESIGN | — | — | M15 — Claude Code/Codex/Gemini adapters; ADR-0023; seq 13,14 |
| real-search | ❌ | — | — | — | — | IMPL | .worktrees/real-search | feat/real-search | No dedicated PRD; hybrid search real-mode work |
| reset-clear | ❌ | — | — | ✅ | — | IMPL | .worktrees/reset-clear | feat/reset-clear | Source reset/clear; seq 25 exists |
| selective-sync | ❌ | — | — | ✅ | — | IMPL | .worktrees/selective-sync | feat/selective-sync | Folder selective sync; seq 21 exists |
| minio-transcripts | ❌ | — | — | — | — | IMPL | .worktrees/minio-transcripts | feat/minio-transcripts | MinIO storage for transcripts; no PRD or seq diag |
| docker-claude-setup | ❌ | — | — | — | — | IMPL | .worktrees/docker-claude-setup | feat/docker-claude-setup | Docker + Claude tooling setup; no PRD |
| duplicates-ui | ❌ | — | — | — | — | IMPL | .claude/worktrees/agent-ab5455b1 | feat/duplicates-ui | Duplicates UI; likely tied to M06 |
| settings-page | ❌ | — | — | — | — | IMPL | .claude/worktrees/agent-settings-page | feat/settings-page | Settings page UI; likely tied to M11 |
| google-drive-integration | ✅ | ❌ | — | ✅ | — | DESIGN | — | — | Standalone PRD; OAuth, token refresh; seq 16,19 |
| document-intelligence | ✅ | ❌ | — | — | — | DESIGN | — | — | Cross-pillar PRD: ingestion, discovery, search, ranking |
| content-processing-pipeline | ✅ | ❌ | — | — | — | DESIGN | — | — | Engineering spec PRD: extractors, chunking, embedding |
| file-tagging | ❌ | — | ✅ | ✅ | — | IMPL | — | — | ADR-0027; seq 17,21 (tag-system.md) |
| admin-module | ❌ | — | ✅ | — | — | IMPL | — | — | ADR-0005 (RBAC); reindexAll + getScanJobs landed (commit 3175da9) |

---

## Backlog

| Feature | PRD | PRD Audit | ADR | Seq Diag | Tests | Status | Worktree | Branch | Notes |
|---------|-----|-----------|-----|----------|-------|--------|----------|--------|-------|
| file-deletion-sync | ✅ | ❌ | — | — | — | BACKLOG | — | — | BACKLOG PRD exists; no ADR or seq diag |
| image-ocr-production | ✅ | ❌ | — | — | — | BACKLOG | — | — | BACKLOG PRD exists; production OCR pipeline |
| multimodal-processing | ✅ | ❌ | — | — | — | BACKLOG | — | — | BACKLOG PRD exists; images, video, audio |
| scan-progress-realtime | ✅ | ❌ | ✅ | — | — | BACKLOG | — | — | BACKLOG PRD exists; ADR-0033 (WebSocket) |
| security-hardening | ✅ | ❌ | — | — | — | BACKLOG | — | — | BACKLOG PRD exists; OWASP, PII audit |

---

## Housekeeping

| Task | PRD | PRD Audit | ADR | Seq Diag | Tests | Status | Worktree | Branch | Notes |
|------|-----|-----------|-----|----------|-------|--------|----------|--------|-------|
| adr-gap-audit | — | — | ❌ | — | — | BACKLOG | — | — | ADRs 0008, 0011, 0014, 0015, 0017 are missing — write or formally retire each |
