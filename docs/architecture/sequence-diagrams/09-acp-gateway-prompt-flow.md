# Flow: ACP Gateway — Session Lifecycle and Prompt Flow

## Overview

An external ACP client (e.g., Zed editor, Claude Desktop) connects to KMS over HTTP using the Agent Communication Protocol (JSON-RPC 2.0 over HTTP with NDJSON SSE). `kms-api` acts as the ACP gateway: it authenticates the client via JWT, manages session state in Redis, and proxies the prompt to `rag-service` which runs the LangGraph orchestrator. Tool calls emitted by LangGraph are dispatched back through `kms-api`'s ACP tool router. Streaming tokens are forwarded to the client as `agent_message_chunk` SSE events until a `done` event closes the stream.

See [ADR-0012](../decisions/0012-acp-protocol.md) for the ACP protocol adoption decision and [ADR-0013](../decisions/0013-orchestrator-pattern.md) for why orchestration lives in `rag-service`.

## Participants

| Alias | Service | Port |
|-------|---------|------|
| `CLI` | ACP Client (Zed / Claude Desktop / curl) | — |
| `GW` | kms-api (ACP Gateway) | 8000 |
| `RD` | Redis | 6379 |
| `RS` | rag-service (LangGraph orchestrator) | 8002 |
| `SA` | search-api | 8001 |
| `QD` | Qdrant | 6333 |
| `LLM` | Ollama / OpenRouter | — |

## Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant CLI as ACP Client
    participant GW as kms-api (ACP Gateway)
    participant RD as Redis
    participant RS as rag-service (LangGraph)
    participant SA as search-api
    participant QD as Qdrant
    participant LLM as Ollama / OpenRouter

    CLI->>GW: POST /acp/v1/initialize { Bearer JWT }
    Note over GW: JWT guard — validate + extract user_id
    GW-->>CLI: 200 { protocolVersion, capabilities: { tools: [kms_search, kms_retrieve, kms_graph_expand, kms_embed] } }

    CLI->>GW: POST /acp/v1/sessions { agentId, metadata }
    GW->>RD: SET kms:acp:session:{session_id} { user_id, agentId, permissionMode, created_at } EX 3600
    RD-->>GW: OK
    GW-->>CLI: 201 { session_id, status: "active" }

    CLI->>GW: POST /acp/v1/sessions/{session_id}/prompt { role: "user", content: "..." }
    Note over GW: Validate session exists in Redis + JWT ownership
    GW->>RS: POST /runs { input: { query, user_id, session_id } }
    RS-->>GW: 202 { run_id, status: "pending" }

    GW-->>CLI: SSE stream opened (text/event-stream)
    Note over GW: kms-api proxies SSE from rag-service for this run

    Note over RS: LangGraph StateGraph starts — [retrieve] node

    RS->>GW: tool_call: kms_search { query, type: "hybrid", limit: 20 }
    GW-->>CLI: SSE data: { type: "tool_call", tool: "kms_search", status: "in_progress" }

    GW->>SA: GET /search?q={query}&type=hybrid&limit=20&user_id={uid}
    SA->>QD: Dense HNSW + sparse BM25 search, top_k=20
    QD-->>SA: [{ chunk_id, score, content, file_id }]
    SA-->>GW: SearchResult[]
    GW-->>CLI: SSE data: { type: "tool_call_update", tool: "kms_search", status: "completed", result_count: 20 }
    GW-->>RS: SearchResult[] (tool call response)

    Note over RS: LangGraph [grade_documents] node — score threshold check, no LLM call

    RS->>LLM: Prompt: system_prompt + top-ranked context + user query (stream=true)
    Note over RS: LangGraph [generate] node

    loop SSE token stream
        LLM-->>RS: token
        RS-->>GW: data: { type: "agent_message_chunk", delta: { text: "..." } }
        GW-->>CLI: SSE data: { type: "agent_message_chunk", delta: { text: "..." } }
    end

    RS-->>GW: data: { type: "done", run_id, stop_reason: "end_turn" }
    GW->>RD: SET kms:acp:run:{run_id}:status "done" EX 600
    GW-->>CLI: SSE data: { type: "done", run_id, stop_reason: "end_turn" }
    Note over GW,CLI: SSE stream closed
```

## LangGraph StateGraph (rag-service)

```
[retrieve]           ← calls kms_search tool via GW
    ↓
[grade_documents]    ← score threshold, no LLM call
    │ all relevant              │ below threshold AND iter < 2
    ↓                           ↓
[graph_expand]           [rewrite_query]
(feature-flagged)              ↓
    ↓                      [retrieve]  ← loop back (max 2 iterations)
[rerank]
    ↓
[generate]           ← LLM streaming, emits agent_message_chunk events
```

## Error Flows

| Step | Condition | Behaviour |
|------|-----------|-----------|
| 1 | JWT missing or expired | `401 Unauthorized` — no session created |
| 3 | Session limit exceeded per user | `429 Too Many Requests` — `KBGEN0003` |
| 7 | `rag-service` unreachable on POST /runs | `GW` returns SSE `{ type: "error", code: "KBRAG0001" }` and closes stream |
| 12 | `search-api` unreachable | RS raises `SearchUnavailableError` → SSE `{ type: "error", code: "KBRAG0003" }` |
| 12 | Qdrant timeout (>5 s) | SA returns empty results; RS continues with 0 chunks, LLM informed |
| 19 | LLM unreachable | RS returns retrieved context as plain text without generation; stop_reason: "fallback" |
| 19 | No relevant chunks after 2 rewrites | SSE `{ type: "error", code: "KBRAG0006" }` — no relevant content found |
| Any | Session not found in Redis | `404 Not Found` — `KBGEN0004` |

## OTel Custom Spans

| Span name | Owner | Attributes |
|-----------|-------|------------|
| `kb.acp.initialize` | kms-api | `user_id`, `agent_id` |
| `kb.acp.session.create` | kms-api | `session_id`, `permission_mode` |
| `kb.acp.prompt` | kms-api | `session_id`, `run_id` |
| `kb.tool_call.kms_search` | kms-api | `query`, `result_count`, `latency_ms` |
| `kb.vector_search` | search-api | `query`, `top_k`, `search_type` |
| `kb.llm_generate` | rag-service | `model`, `provider`, `prompt_tokens` |

## Redis Keys

| Key | Value | TTL |
|-----|-------|-----|
| `kms:acp:session:{session_id}` | Session JSON (`user_id`, `agentId`, `permissionMode`) | 60 min |
| `kms:acp:run:{run_id}:status` | Run terminal status (`done`, `error`) | 10 min |
| `kms:rag:run:{run_id}` | Full run state JSON (chunks, answer, citations) | 10 min |

## Dependencies

| Service | Role |
|---------|------|
| `kms-api` | ACP gateway — JWT auth, session lifecycle, SSE proxy, tool dispatch |
| `rag-service` | LangGraph orchestrator — owns all AI logic, emits tool calls and token chunks |
| `search-api` | Hybrid BM25 + vector search, called by kms-api on behalf of `kms_search` tool |
| `Qdrant` | Dense + sparse vector store |
| `Redis` | ACP session state, run status cache |
| `Ollama / OpenRouter` | LLM generation (streaming) |
