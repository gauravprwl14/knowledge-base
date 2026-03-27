# Integration Gap Report — 2026-03-18

## Sequence Diagram vs Code Audit

| Flow | Diagram | Code Status | Gap |
|------|---------|-------------|-----|
| Source connect + scan | 03-source-connect-scan.md | ⚠️ PARTIAL | Diagram shows only `POST /sources { type: "local", path }` but code now exposes three distinct registration endpoints: `POST /sources/local`, `POST /sources/obsidian`, and the Google Drive OAuth pair (`GET /sources/google-drive/oauth` + `GET /sources/google-drive/callback`). Diagram does not model Google Drive OAuth initiation or callback. The `PATCH /api/v1/sources/{id}` status updates called by scan-worker are shown but the controller has no `PATCH` route — status updates likely go through the service layer or a separate internal endpoint not yet in the diagram. |
| File embedding pipeline | 04-file-embedding-pipeline.md | ⚠️ PARTIAL | Diagram models File Storage (MinIO/local) as a participant, but `embed_handler.py` reads files directly from the local filesystem via `Path(msg.file_path)` — no MinIO/object-store call exists. Diagram also shows a `kms_chunks` INSERT with `(checksum_sha256, source_id)` conflict key, but actual code uses `ON CONFLICT DO NOTHING` without those columns in the INSERT and does not pass `source_id` or `user_id` to `kms_chunks` (only `id`, `file_id`, `chunk_index`, `content`, `token_count`). Qdrant payload uses `scan_job_id` as `file_id` key, not a dedicated file UUID. |
| RAG chat | 07-rag-chat.md | ⚠️ PARTIAL | Diagram models a LangGraph StateGraph orchestration with a two-step flow (POST /runs → 202, then GET /runs/{id}/stream), but `chat.py` implements a single `POST /chat` endpoint that opens the SSE stream immediately — no separate run-initiation + polling pattern. JWT auth is described as wired but code has `user_id="anonymous"` TODO. SSE event type is `"chunk"` in code vs `"token"` in diagram. Sources event is emitted after streaming ends, not as a citation mid-stream. No query rewriting, grading, or graph expansion nodes exist in the current implementation. |
| ACP gateway prompt flow | 09-acp-gateway-prompt-flow.md | ❌ MISSING | `kms-api/src/modules/acp/` directory does not exist. The ACP gateway, session lifecycle, and tool dispatch endpoints (`POST /acp/v1/initialize`, `POST /acp/v1/sessions`, `POST /acp/v1/sessions/{id}/prompt`) are entirely unimplemented. Diagram is forward-looking / aspirational. |
| Voice transcription | 08-voice-transcription.md | ❌ MISSING | `voice-app` service is not present in `docker-compose.kms.yml`. The voice transcription pipeline (RabbitMQ `voice.transcription` queue, FFmpeg conversion, Whisper/Groq/Deepgram providers) is not deployed. Diagram is forward-looking / aspirational. |

---

## Priority Fix List

**P0 — Diagrams that are wrong about currently shipped code (mislead developers):**

- **03-source-connect-scan.md**: Add Google Drive OAuth initiation + callback sub-flow. Update the single `POST /sources` entry to show the three separate registration routes (`/sources/local`, `/sources/obsidian`, `/sources/google-drive/oauth` + `/sources/google-drive/callback`). Clarify how scan-worker reports status back (direct DB update vs PATCH endpoint).
- **04-file-embedding-pipeline.md**: Remove File Storage (MinIO) participant — embed-worker reads from local disk. Correct the `kms_chunks` INSERT schema to match actual columns. Clarify that `file_id` in Qdrant payload is `scan_job_id`, not a separate file UUID.
- **07-rag-chat.md**: Replace the two-step run-initiation pattern with a single `POST /chat` that returns SSE directly. Change SSE event type from `"token"` to `"chunk"`. Note that LangGraph orchestration, query rewriting, and grading are planned but not yet implemented; current implementation is retriever → LLM generate → stream.

**P1 — Diagrams that document unimplemented features (mark status clearly):**

- **09-acp-gateway-prompt-flow.md**: Add frontmatter `status: proposed` (not `accepted`) and a callout that `kms-api/src/modules/acp/` does not yet exist.
- **08-voice-transcription.md**: Add frontmatter `status: proposed` and note that `voice-app` is not in `docker-compose.kms.yml`.

**P2 — Missing diagrams (written in this report's companion files):**

- Write `01-user-registration.md` — no diagram exists for the auth registration flow.
- Write `02-user-login.md` — no diagram exists for the auth login + token refresh flow.
- Write `06-hybrid-search.md` — no diagram exists for the hybrid BM25 + vector search flow.
- Write `19-google-drive-sync.md` — no diagram exists for incremental/full Drive sync.
- Write `20-dedup-pipeline.md` — no diagram exists for the SHA-256 + semantic dedup flow.
- Write `21-tag-system.md` — no diagram exists for manual + AI auto-tagging flows.
