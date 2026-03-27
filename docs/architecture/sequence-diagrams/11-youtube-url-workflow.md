# Flow: YouTube URL Ingest & Summarize Workflow

## Overview

A user submits a YouTube URL through the ACP client or REST frontend. `kms-api`'s WorkflowEngine creates a tracked run, streams progress over SSE, then executes two sequential stages: (1) transcript extraction via `url-agent` (yt-dlp + Whisper), and (2) parallel branches — LLM summarization via `rag-service` and knowledge-base ingestion via the scan/embed pipeline. The workflow completes by aggregating both branch outputs and returning `{ file_id, summary, key_points, embed_count }` over the SSE stream.

## Participants

| Alias | Service | Port |
|-------|---------|------|
| `CLI` | Browser / ACP Client | — |
| `WE` | kms-api (WorkflowEngine + REST gateway) | 8000 |
| `RD` | Redis (workflow state + ACP sessions) | 6379 |
| `UA` | url-agent (FastAPI — yt-dlp + Whisper) | 8005 |
| `RS` | rag-service (FastAPI — LLM summarization) | 8002 |
| `SW` | scan-worker (AMQP consumer) | — |
| `EW` | embed-worker (AMQP consumer) | — |
| `QD` | Qdrant (vector store) | 6333 |
| `PG` | PostgreSQL (files + workflow run persistence) | 5432 |

## Sequence Diagram — Happy Path

```mermaid
sequenceDiagram
    autonumber
    participant CLI as ACP Client
    participant WE as kms-api (WorkflowEngine)
    participant RD as Redis
    participant UA as url-agent (yt-dlp + Whisper)
    participant RS as rag-service (LLM)
    participant SW as scan-worker
    participant EW as embed-worker
    participant QD as Qdrant
    participant PG as PostgreSQL

    CLI->>WE: POST /api/v1/workflows/run\n{ type: "url_ingest_summarize", url: "https://youtube.com/...", collection_id: "..." }
    Note over WE: Validate JWT + payload schema\nGenerate run_id (UUID)

    WE->>RD: SET kms:workflow:{run_id} { status: "pending", url, collection_id, user_id, created_at } EX 3600
    RD-->>WE: OK

    WE->>PG: INSERT workflow_runs { run_id, type, status: "pending", input_json }
    PG-->>WE: OK

    WE-->>CLI: 202 { workflow_run_id: "{run_id}" }

    CLI->>WE: GET /api/v1/workflows/run/{run_id}/stream (SSE)
    Note over WE: Open SSE stream — text/event-stream

    WE-->>CLI: SSE: { type: "workflow_started", run_id, steps: ["extract_transcript", "summarize", "ingest"] }

    Note over WE: Stage 1 — Spawn url-agent (Step 1 of 3)

    WE->>RD: SET kms:acp:session:{session_id_1} { agent: "url-agent", parent_run_id: run_id, step: 1 } EX 600
    RD-->>WE: OK

    WE-->>CLI: SSE: { type: "agent_spawned", agent: "url-agent", step: 1, session_id: "{session_id_1}" }

    WE->>UA: POST /acp/v1/sessions/{session_id_1}/prompt\n{ task: "extract_transcript", url: "https://youtube.com/..." }
    UA-->>WE: 202 { run_id: "{ua_run_id}" }

    WE-->>CLI: SSE: { type: "tool_call", tool: "kms_extract_transcript", status: "in_progress" }

    Note over UA: yt-dlp: download audio stream (720p → audio-only)\nTypically 5-30 s depending on video length

    UA->>UA: yt-dlp extracts audio → temp .mp3/webm file

    Note over UA: Whisper: transcribe audio\nTypically 30-90 s for a 10-min video on GPU

    UA->>UA: Whisper (large-v3): transcribe audio → raw transcript text

    loop Transcript chunk events (streaming)
        UA-->>WE: ACP agent_message_chunk { delta: { text: "..." } }
        WE-->>CLI: SSE: { type: "agent_message_chunk", agent: "url-agent", delta: { text: "..." } }
    end

    UA-->>WE: ACP done { type: "tool_call_update", tool: "kms_extract_transcript",\nstatus: "completed",\nresult: { transcript: "...", transcript_length: 42000,\ntitle: "...", channel: "...", duration_s: 612 } }

    WE->>RD: HSET kms:workflow:{run_id} transcript "{transcript}" title "{title}" channel "{channel}" duration_s 612
    RD-->>WE: OK

    WE-->>CLI: SSE: { type: "tool_call_update", tool: "kms_extract_transcript",\nstatus: "completed", transcript_length: 42000 }

    Note over WE: Stage 2 — Parallel branches: summarize (2a) + ingest (2b)

    WE-->>CLI: SSE: { type: "parallel_step_started", steps: ["summarize", "ingest"] }

    par Branch A — LLM Summarization
        WE->>RD: SET kms:acp:session:{session_id_2a} { agent: "rag-service", mode: "summarize", parent_run_id: run_id } EX 600
        RD-->>WE: OK

        WE->>RS: POST /acp/v1/sessions/{session_id_2a}/prompt\n{ task: "summarize", text: "{transcript}", max_key_points: 7 }
        RS-->>WE: 202 { run_id: "{rs_run_id}" }

        WE-->>CLI: SSE: { type: "agent_spawned", agent: "rag-service", step: "2a-summarize" }

        RS->>RS: LangGraph [summarize] node — build prompt:\nsystem_prompt + transcript (chunked if > 4k tokens) + instruction

        loop Summary token stream
            RS-->>WE: ACP agent_message_chunk { delta: { text: "..." } }
            WE-->>CLI: SSE: { type: "agent_message_chunk", agent: "rag-service", delta: { text: "..." } }
        end

        RS-->>WE: ACP done { type: "tool_call_update", tool: "kms_summarize",\nstatus: "completed",\nresult: { summary: "...", key_points: [...], topics: [...] } }

        WE->>RD: HSET kms:workflow:{run_id} summary "{summary}" key_points "[...]" topics "[...]"
        RD-->>WE: OK

        WE-->>CLI: SSE: { type: "step_completed", step: "summarize" }

    and Branch B — Knowledge Base Ingest
        WE->>WE: Call kms_ingest handler\n{ content: transcript, metadata: { title, url, channel, duration_s }, collection_id }

        WE->>PG: INSERT kms_files { source_id, external_id: url, name: title,\ncollection_id, status: "pending" }
        PG-->>WE: { file_id: "{file_id}" }

        WE-->>CLI: SSE: { type: "tool_call", tool: "kms_ingest", status: "in_progress", file_id: "{file_id}" }

        WE->>SW: AMQP publish kms.scan\n{ file_id, content: transcript, metadata: { title, url, channel, duration_s } }

        Note over SW: scan-worker: chunk transcript\ninto overlapping segments (~512 tokens, 64-token overlap)

        SW->>EW: AMQP publish kms.embed\n{ file_id, chunks: [{ chunk_id, text, metadata }] }

        Note over EW: embed-worker: BGE-M3 (1024-dim)\nBatch inference on chunks

        EW->>QD: Upsert vectors { collection_id, points: [{ id: chunk_id, vector, payload }] }
        QD-->>EW: OK — { upserted: N }

        EW->>PG: UPDATE kms_files SET status = "indexed", embed_count = N WHERE id = file_id
        PG-->>EW: OK

        EW->>WE: AMQP publish kms.workflow.callback\n{ run_id, tool: "kms_ingest", status: "completed", file_id, embed_count: N }

        WE->>RD: HSET kms:workflow:{run_id} file_id "{file_id}" embed_count N
        RD-->>WE: OK

        WE-->>CLI: SSE: { type: "tool_call_update", tool: "kms_ingest",\nstatus: "completed", file_id: "{file_id}", embed_count: N }

        WE-->>CLI: SSE: { type: "step_completed", step: "ingest" }
    end

    Note over WE: Both branches complete — aggregate results from Redis

    WE->>RD: HGETALL kms:workflow:{run_id}
    RD-->>WE: { file_id, summary, key_points, topics, embed_count, transcript_length, ... }

    WE->>PG: UPDATE workflow_runs SET status = "completed",\noutput_json = { file_id, summary, key_points, embed_count },\ncompleted_at = NOW() WHERE run_id = run_id
    PG-->>WE: OK

    WE->>RD: HSET kms:workflow:{run_id} status "completed"
    RD-->>WE: OK

    WE-->>CLI: SSE: { type: "workflow_completed",\nresult: { file_id: "{file_id}", summary: "...",\nkey_points: [...], embed_count: N } }
    Note over WE,CLI: SSE stream closed
```

## Error Flows

| Step | Condition | Behaviour |
|------|-----------|-----------|
| 1 | YouTube URL is malformed or not a YouTube domain | `WE` returns `400 Bad Request` `KBWFL0001` before creating run; no SSE stream opened |
| 1 | JWT missing or expired | `WE` returns `401 Unauthorized`; no run created |
| 11–14 | `url-agent` unreachable (port 8005 down) | `WE` emits SSE `{ type: "error", code: "KBWFL0002", step: "extract_transcript" }`; workflow run marked `failed` in PG + Redis; stream closed |
| 15–18 | yt-dlp fails (private video, geo-block, removed video) | `UA` returns ACP error `{ status: "error", reason: "yt_dlp_failed" }`; `WE` emits SSE `{ type: "error", code: "KBWFL0003", message: "Video unavailable" }`; run marked `failed` |
| 19–21 | Whisper transcription fails (OOM, model load error) | `UA` returns ACP error `{ status: "error", reason: "whisper_failed" }`; `WE` emits SSE `{ type: "error", code: "KBWFL0004" }`; run marked `failed`; no partial ingest attempted |
| Branch A | LLM (Ollama / OpenRouter) unreachable during summarization | `RS` returns ACP done with `stop_reason: "fallback"`; `WE` emits SSE `{ type: "step_completed", step: "summarize", fallback: true }`; summary omitted from final result; ingest branch continues unaffected |
| Branch A | LLM returns empty or malformed summary JSON | `WE` logs warning; emits `step_completed` with `summary: null, key_points: []`; workflow still completes |
| Branch B | AMQP `kms.scan` publish timeout (> 10 s) | `WE` emits SSE `{ type: "error", code: "KBWFL0005", step: "ingest" }`; `file_id` created in PG with `status: "failed"`; summarization result still returned if Branch A completed |
| Branch B | embed-worker dead / no consumer on `kms.embed` | Message remains in queue; `WE` polls `kms.workflow.callback` with 120 s timeout; on timeout emits SSE `{ type: "error", code: "KBWFL0006", step: "ingest" }` |
| Branch B | Qdrant upsert fails | `EW` nacks message (requeue); retries up to 3×; on exhaustion publishes dead-letter; `WE` callback receives `status: "error"` |
| Any | Redis unreachable during workflow state write | `WE` falls back to in-memory run state for duration of stream; logs `KBWFL0007`; no SSE error to client |

## OTel Custom Spans

| Span name | Owner | Attributes |
|-----------|-------|------------|
| `kb.workflow.run` | kms-api | `run_id`, `workflow_type`, `url` |
| `kb.workflow.step.extract_transcript` | kms-api | `run_id`, `transcript_length`, `duration_s`, `latency_ms` |
| `kb.workflow.step.summarize` | kms-api | `run_id`, `key_point_count`, `fallback`, `latency_ms` |
| `kb.workflow.step.ingest` | kms-api | `run_id`, `file_id`, `embed_count`, `latency_ms` |
| `kb.url_agent.yt_dlp` | url-agent | `url`, `video_duration_s`, `audio_size_bytes` |
| `kb.url_agent.whisper` | url-agent | `model`, `audio_duration_s`, `transcript_length` |
| `kb.embed.batch` | embed-worker | `file_id`, `chunk_count`, `model`, `latency_ms` |

## Redis Keys

| Key | Value | TTL |
|-----|-------|-----|
| `kms:workflow:{run_id}` | Workflow run state hash (status, transcript, summary, key_points, file_id, embed_count) | 60 min |
| `kms:acp:session:{session_id_1}` | url-agent ACP session JSON | 10 min |
| `kms:acp:session:{session_id_2a}` | rag-service ACP session JSON (summarize mode) | 10 min |

## Dependencies

| Service | Role |
|---------|------|
| `kms-api` | WorkflowEngine — run lifecycle, Redis state, SSE streaming, AMQP publish for ingest |
| `url-agent` | yt-dlp audio extraction + Whisper transcription; exposes ACP session interface |
| `rag-service` | LLM summarization via LangGraph; invoked in summarize mode via ACP |
| `scan-worker` | Chunks transcript text into overlapping segments for embedding |
| `embed-worker` | BGE-M3 (1024-dim) batch inference; upserts vectors to Qdrant |
| `Qdrant` | Dense + sparse vector store for semantic search over transcript chunks |
| `PostgreSQL` | Persistent storage for `workflow_runs` and `kms_files` records |
| `Redis` | Transient workflow state, ACP session metadata |
| `RabbitMQ` | AMQP transport for `kms.scan`, `kms.embed`, `kms.workflow.callback` queues |
