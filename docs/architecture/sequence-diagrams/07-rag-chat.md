# Flow: RAG Chat Completion

## Overview

> **Implementation note (2026-03-18):** This diagram documents the **planned future state**
> where `kms-api` proxies chat requests to `rag-service` (LangGraph) and `rag-service`
> calls `search-api`.  The **current implementation** in `AcpService` / `AcpToolRegistry`
> has `kms-api` calling `search-api` directly (no hop to `rag-service` in the ACP prompt
> flow) and then calling `AnthropicAdapter` for generation.  Update this diagram once the
> rag-service orchestration refactor is complete.  See `FOR-e2e-flows.md` for the
> current actual flow.

A user sends a chat query. `kms-api` validates the JWT and proxies to `rag-service` — it performs no orchestration. `rag-service` runs a **LangGraph StateGraph** that orchestrates all sub-agents internally: hybrid retrieval via `search-api`, optional graph expansion via Neo4j, relevance grading, query rewriting, and LLM generation. Response is streamed token-by-token via SSE through `kms-api` to the browser.

See [ADR-0013](../decisions/0013-orchestrator-pattern.md) for why orchestration lives in Python, and [ADR-0012](../decisions/0012-acp-protocol.md) for the run-lifecycle protocol.

## Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant C as Browser
    participant A as kms-api (thin proxy)
    participant RS as rag-service (LangGraph orchestrator)
    participant SA as search-api
    participant QD as Qdrant
    participant N4 as Neo4j
    participant LLM as Anthropic / Ollama

    C->>A: POST /api/v1/chat/runs { query, session_id? }
    Note over A: JWT guard — auth only, no AI logic
    A->>A: INSERT kms_chat_messages (role=user)
    A->>RS: POST /runs { input: { query, user_id, session_id } }
    RS-->>A: 202 { run_id, status: "pending" }
    A-->>C: 202 { run_id }

    C->>A: GET /api/v1/chat/runs/{run_id}/stream
    Note over A: Proxy SSE from rag-service
    A->>RS: GET /runs/{run_id}/stream

    Note over RS: LangGraph StateGraph — rag-service owns all coordination

    RS->>SA: GET /search?q={query}&type=hybrid&limit=20&user_id={uid}
    SA->>QD: kb.vector_search (dense HNSW + sparse BM25, top_k=20)
    QD-->>SA: [{ chunk_id, score, content, file_id }]
    SA-->>RS: SearchResult[]

    RS->>RS: grade_documents node
    Note over RS: LLM grades each chunk: relevant | irrelevant

    alt Chunks below relevance threshold AND iter < 2
        RS->>RS: rewrite_query node
        Note over RS: LLM rewrites query for better retrieval
        RS->>SA: GET /search?q={rewritten_query}&type=hybrid&limit=20
        SA-->>RS: SearchResult[] (second attempt)
    end

    opt features.graph.enabled = true
        RS->>N4: kb.graph_traversal
        Note over N4: MATCH (e:Entity)<-[:MENTIONS]-(f:File) WHERE e.name IN chunk_entities
        N4-->>RS: RelatedNode[] (depth=2)
        RS->>RS: Merge graph results into chunk context
    end

    RS->>RS: rerank node (RRF or BGE-M3 cross-encoder)
    Note over RS: Select top 10 chunks for context window

    RS->>LLM: kb.llm_generate (system_prompt + context + query, stream=true)

    loop SSE token stream
        LLM-->>RS: token
        RS-->>A: data: {"type":"token","content":"..."}
        A-->>C: data: {"type":"token","content":"..."}
    end

    RS-->>A: data: {"type":"citation","file_id":"...","excerpt":"..."}
    A-->>C: data: {"type":"citation","file_id":"...","excerpt":"..."}

    RS-->>A: data: {"type":"done","run_id":"..."}
    A->>A: INSERT kms_chat_messages (role=assistant, citations_json)
    A-->>C: data: {"type":"done","run_id":"..."}
```

## LangGraph StateGraph

```
[retrieve]
    ↓
[grade_documents]  ← LLM: relevant / irrelevant per chunk
    │                    (iter < 2 AND any irrelevant?)
    │ yes: all relevant              │ no: retry
    ↓                                ↓
[graph_expand]               [rewrite_query]
(optional, feature-flag)             ↓
    ↓                           [retrieve]  ← loop back
[rerank]
    ↓
[generate]  ← Anthropic Claude / Ollama, streaming SSE
```

**State shape (`GraphState`):**

```python
class GraphState(TypedDict):
    query: str
    rewritten_query: str | None
    chunks: list[SearchResult]
    graded_chunks: list[SearchResult]
    graph_nodes: list[RelatedNode]
    context: str
    answer: str
    citations: list[Citation]
    session_id: str
    user_id: str
    iteration: int  # rewrite loop counter, max 2
```

## Error Flows

| Step | Failure | Handling |
|------|---------|----------|
| `search-api` unreachable | `httpx.ConnectError` | Raise `SearchUnavailableError` → SSE `{"type":"error","code":"KBRAG0003"}` |
| LLM unreachable | `anthropic.APIConnectionError` | Return retrieved context as plain text without generation |
| Neo4j timeout | `asyncio.TimeoutError` (5s) | Skip graph expansion, continue with Qdrant results only |
| No relevant chunks after 2 rewrites | Low score threshold | SSE `{"type":"error","code":"KBRAG0006"}` — no relevant content |
| `rag-service` crash | `fetch` throws in kms-api | kms-api returns 502 to browser |

## OTel Custom Spans (in rag-service)

| Span name | Attributes |
|-----------|------------|
| `kb.vector_search` | `query`, `top_k`, `search_type` |
| `kb.graph_traversal` | `entity_count`, `depth` |
| `kb.llm_generate` | `model`, `provider`, `prompt_tokens` |
| `kb.rag_grade` | `chunk_count`, `relevant_count`, `iteration` |

## Redis Keys

| Key | Value | TTL |
|-----|-------|-----|
| `kms:rag:run:{run_id}` | Run state JSON (status, chunks, answer) | 10 min |
| `kms:chat:session:{session_id}:context` | Last N messages for context window | 30 min |

## Dependencies

| Service | Role |
|---------|------|
| `kms-api` | JWT auth, message persistence, SSE proxy |
| `rag-service` | **LangGraph orchestrator** — owns all AI logic |
| `search-api` | Hybrid keyword + vector search (called by rag-service) |
| `Qdrant` | Dense + sparse vector store |
| `Neo4j` | Graph traversal (optional, feature-flagged) |
| `Anthropic API / Ollama` | LLM generation |
| `Redis` | Run state cache, session context cache |
| `PostgreSQL` | Chat session and message persistence |
