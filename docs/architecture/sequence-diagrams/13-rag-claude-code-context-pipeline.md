# Flow: RAG → Claude Code Context Pipeline

## Overview

This diagram covers the end-to-end flow for a user question that is answered by first building an optimal RAG context from the private knowledge base and then passing that context to an external agent (Claude API) via the `HttpAcpAdapter`. The external agent streams its answer back grounded in the retrieved private knowledge. Graph expansion is shown as an optional node that enriches the context with entity relationships before packing.

The external agent used in this diagram is `claude-api` (Anthropic API wrapped in ACP protocol envelope, `HttpAcpAdapter`). The same flow applies to `claude-code` and `codex` using `StdioAcpAdapter` — only the `ExternalAgentAdapter → Agent` segment differs.

See [ADR-0023](../decisions/0023-external-agent-adapter.md) for the adapter pattern.
See [ADR-0021](../decisions/0021-workflow-engine.md) for WorkflowEngine run state management.

## Participants

| Alias | Service | Port |
|-------|---------|------|
| `CLI` | Browser / ACP Client | — |
| `WE` | kms-api (ACP Gateway + WorkflowEngine) | 8000 |
| `RD` | Redis (session state, context cache) | 6379 |
| `RAG` | rag-service (RAG pipeline + Context Packer) | 8002 |
| `SRCH` | search-api (hybrid search) | 8001 |
| `QD` | Qdrant (vector search) | 6333 |
| `NEO` | Neo4j (graph expansion) | 7687 |
| `EXT` | claude-api adapter (HttpAcpAdapter → Anthropic API) | — |
| `PG` | PostgreSQL (run persistence) | 5432 |

---

## Main Flow

```mermaid
sequenceDiagram
    autonumber
    participant CLI as Browser / ACP Client
    participant WE as kms-api (WorkflowEngine)
    participant RD as Redis
    participant RAG as rag-service (RAG + Context Packer)
    participant SRCH as search-api
    participant QD as Qdrant
    participant NEO as Neo4j
    participant EXT as claude-api (HttpAcpAdapter)
    participant PG as PostgreSQL

    CLI->>WE: POST /api/v1/chat/runs\n{ message: "...", external_agent_id: "claude-api",\ncollection_id: "...", enable_graph: true }
    Note over WE: JWT auth + validate payload\nGenerate run_id

    WE->>PG: INSERT chat_runs { run_id, user_id, agent: "claude-api",\nstatus: "pending", query: "..." }
    PG-->>WE: OK

    WE->>RD: SET kms:run:{run_id} { status: "building_context",\nagent: "claude-api", collection_id } EX 3600
    RD-->>WE: OK

    WE-->>CLI: 202 { run_id }

    CLI->>WE: GET /api/v1/chat/runs/{run_id}/stream (SSE)
    Note over WE,CLI: SSE connection established — server holds it open

    WE-->>CLI: SSE: { type: "run_started", run_id, agent: "claude-api" }

    Note over WE: span: kb.rag.build_context

    WE->>RAG: POST /rag/v1/context\n{ run_id, query: "...", collection_id, enable_graph: true }
    RAG-->>WE: 202 { context_run_id }

    Note over RAG: LangGraph node: [retrieve]

    RAG->>SRCH: POST /search/v1/hybrid\n{ query: "...", collection_id,\nbm25_weight: 0.3, vector_weight: 0.7, top_k: 20 }
    Note over SRCH: BM25 full-text score + BGE-M3 vector score\nRRF fusion (Reciprocal Rank Fusion)
    SRCH->>QD: Vector search — BGE-M3 1024-dim\n+ BM25 index query
    QD-->>SRCH: top-20 candidates with scores
    SRCH-->>RAG: { results: [{ chunk_id, text, file_id, score }, ...] }

    Note over RAG: LangGraph node: [grade_documents]\nScore threshold filter (no LLM — pure cosine cutoff at 0.72)

    RAG->>RAG: Filter chunks below threshold\nDeduplicate overlapping chunks

    opt Graph expansion enabled
        Note over RAG: LangGraph node: [graph_expand]\nspan: kb.rag.graph_expand
        RAG->>NEO: MATCH (e)-[r]-(related)\nWHERE e.chunk_id IN [chunk_ids]\nRETURN e, r, related LIMIT 50
        NEO-->>RAG: { entities: [...], relationships: [...], file_refs: [...] }
        Note over RAG: Merge graph entities into context\nResolve file_refs → additional chunk IDs
    end

    Note over RAG: Context Packer:\nBuild ACP resource blocks from chunks + graph entities\nTrack citation map { block_id → file_id, chunk_id, score }\nToken budget: 6144 tokens (reserve 2048 for response)

    RAG-->>WE: { context_blocks: [...], chunk_count: 8,\ntoken_count: 6240, graph_entity_count: 12,\ncitation_map: {...} }

    WE->>RD: HSET kms:run:{run_id} context_tokens 6240\ngraph_entities 12 status "context_ready"
    RD-->>WE: OK

    WE-->>CLI: SSE: { type: "context_built",\nchunks: 8, tokens: 6240, graph_entities: 12 }

    Note over WE: span: kb.external_agent.session

    WE->>EXT: ensureSession({ agentId: "claude-api",\nrunId, userId, sessionDepth: 0 })
    Note over EXT: HttpAcpAdapter — validate API key\nprobe Anthropic API reachability
    EXT-->>WE: ExternalAgentHandle { sessionId, transport: "http" }

    WE->>RD: SET kms:acp:session:{sessionId}\n{ agentId: "claude-api", runId, userId,\ntransport: "http", depth: 0 } EX 600
    RD-->>WE: OK

    WE-->>CLI: SSE: { type: "agent_started",\nagent: "claude-api", model: "claude-sonnet-4-6",\nsession_id: "{sessionId}" }

    Note over WE: span: kb.external_agent.prompt

    WE->>EXT: sendPrompt(handle, [\n  { type: "resource", ...context_blocks },\n  { type: "text", text: user_message }\n])
    Note over EXT: POST https://api.anthropic.com/v1/messages\n{ model: "claude-sonnet-4-6", stream: true,\n  system: KMS_SYSTEM_PROMPT,\n  messages: [{ role: "user", content: acp_blocks }] }

    Note over WE,EXT: span: kb.external_agent.stream

    loop Streaming response tokens
        EXT-->>WE: AcpRuntimeEvent { type: "agent_message_chunk",\ndelta: { text: "..." } }
        WE-->>CLI: SSE: { type: "token", content: "..." }
    end

    EXT-->>WE: AcpRuntimeEvent { type: "done",\nstop_reason: "end_turn",\nusage: { input_tokens: 6500, output_tokens: 420 } }

    WE-->>CLI: SSE: { type: "citations",\nsources: [\n  { file_id, file_name, chunk_id, score },\n  ...\n] }

    WE-->>CLI: SSE: { type: "done",\nrun_id, stop_reason: "end_turn",\ntokens: { input: 6500, output: 420 } }
    Note over WE,CLI: SSE stream closed

    WE->>EXT: close(handle)

    WE->>PG: UPDATE chat_runs SET\nstatus = "completed",\ncontext_tokens = 6240,\nresponse_tokens = 420,\ncitations = [...],\nanswer = "...",\nagent = "claude-api",\ncompleted_at = NOW()\nWHERE run_id = run_id
    PG-->>WE: OK

    WE->>RD: DEL kms:acp:session:{sessionId}
    WE->>RD: HSET kms:run:{run_id} status "completed"
    RD-->>WE: OK
```

---

## Error Flows

```mermaid
sequenceDiagram
    autonumber
    participant CLI as Browser / ACP Client
    participant WE as kms-api (WorkflowEngine)
    participant EXT as claude-api (HttpAcpAdapter)
    participant RAG as rag-service

    Note over CLI,WE: Error: no external agent configured for run

    WE->>WE: resolve adapter for agent_id = null / unknown
    WE-->>CLI: SSE: { type: "warning",\ncode: "KBEXT0001",\nmessage: "No external agent configured — falling back to Ollama" }
    Note over WE: WE routes sendPrompt() to local OllamaAdapter instead\nFlow continues normally with local model

    Note over CLI,WE: Error: context too large

    RAG-->>WE: { token_count: 14800, ... }
    Note over WE: token_count > 12288 (hard limit)\nContext Packer truncates to top-N chunks by score\nthen re-packs
    WE-->>CLI: SSE: { type: "warning",\ncode: "KBRAG0012",\nmessage: "Context truncated",\noriginal_tokens: 14800, truncated_tokens: 6000 }

    Note over CLI,WE: Error: Anthropic API 429 rate limit

    EXT-->>WE: HTTP 429 Too Many Requests\nRetry-After: 20s
    Note over EXT: HttpAcpAdapter — exponential backoff retry\nattempt 1: wait 20 s\nattempt 2: wait 40 s (max 2 retries)
    WE-->>CLI: SSE: { type: "warning",\ncode: "KBEXT0004",\nmessage: "Rate limit — retrying",\nretry_after_ms: 20000 }
    Note over EXT: Retry 2 succeeds — stream resumes normally

    Note over CLI,WE: Error: API key missing

    WE->>EXT: ensureSession(...)
    EXT-->>WE: throw AppException KBEXT0005\n"Anthropic API key not configured"
    WE-->>CLI: SSE: { type: "error",\ncode: "KBEXT0005",\nmessage: "External agent API key not configured" }
    WE->>WE: Mark run failed in PG + Redis
    Note over WE,CLI: SSE stream closed
```

---

## OTel Spans

| Span name | Owner | Key attributes |
|-----------|-------|---------------|
| `kb.rag.build_context` | kms-api | `run_id`, `collection_id`, `chunk_count`, `token_count` |
| `kb.rag.retrieve` | rag-service | `run_id`, `query_len`, `top_k`, `result_count` |
| `kb.rag.grade_documents` | rag-service | `run_id`, `before_count`, `after_count`, `threshold` |
| `kb.rag.graph_expand` | rag-service | `run_id`, `entity_count`, `file_ref_count` |
| `kb.external_agent.session` | kms-api | `run_id`, `agent_id`, `transport`, `session_id` |
| `kb.external_agent.prompt` | kms-api | `run_id`, `session_id`, `prompt_blocks`, `context_tokens` |
| `kb.external_agent.stream` | kms-api | `run_id`, `session_id`, `output_tokens`, `stop_reason` |

## Redis Keys

| Key | Value | TTL |
|-----|-------|-----|
| `kms:run:{run_id}` | Run state hash (status, agent, context_tokens, graph_entities) | 60 min |
| `kms:acp:session:{sessionId}` | ACP session JSON (agentId, transport, depth, runId, userId) | 10 min |

## Dependencies

| Service | Role |
|---------|------|
| `kms-api` | WorkflowEngine — run lifecycle, SSE emission, adapter resolution, citation forwarding |
| `rag-service` | RAG pipeline (LangGraph) — retrieve, grade, graph_expand, Context Packer |
| `search-api` | BM25 + BGE-M3 hybrid search with RRF fusion |
| `Qdrant` | Vector store — BGE-M3 1024-dim embeddings |
| `Neo4j` | Graph store — entity relationships and cross-document file references |
| `HttpAcpAdapter` | Wraps Anthropic API in ACP protocol envelope; handles streaming, retry, token accounting |
| `Redis` | Run state, ACP session metadata |
| `PostgreSQL` | Persistent run record — query, answer, citations, token usage |
