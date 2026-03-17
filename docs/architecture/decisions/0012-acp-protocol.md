# 0012 — Internal Agent Run-Lifecycle Protocol

- **Status**: Accepted (revised 2026-03-17)
- **Date**: 2026-03-17
- **Deciders**: Architecture Team
- **Tags**: [agents, api, orchestration, rag-service]

## Context and Problem Statement

The KMS has an agentic layer: `rag-service` (Python) orchestrates SearchAgent, GraphAgent, and RAGAgent internally. The `kms-api` (NestJS) proxies chat requests to `rag-service` and relays SSE to the browser. We need a clear protocol contract for:
1. How `kms-api` communicates with `rag-service` (external interface)
2. How `rag-service` communicates internally with sub-agents (internal interface)

### Naming Clarification — Two Different "ACPs"

Research surfaced a naming collision that must be understood:

| Protocol | Owner | Transport | Used By KMS? |
|----------|-------|-----------|--------------|
| **Agent Client Protocol** (Zed editor ACP) | agentclientprotocol.com | JSON-RPC 2.0 over stdio (ndJSON) | No — editor tooling only |
| **Agent Commerce Protocol** (Virtuals Protocol) | Blockchain / Base chain | REST + smart contracts | No — blockchain marketplace |
| **KMS run-lifecycle REST** | KMS internal | HTTP REST + SSE | **Yes — this ADR** |

The KMS internal protocol is **not** the Zed ACP and **not** the IBM/Linux Foundation ACP (that attribution was incorrect in earlier drafts). It is a **pragmatic HTTP REST run-lifecycle convention** inspired by async job APIs, defining how agents expose their work as addressable runs.

## Decision Drivers

- Async execution support (agents may take 5–30 seconds)
- SSE streaming for token-by-token output
- REST-compatible (any language can call any agent)
- Simple enough to implement in a FastAPI route in under 50 lines
- Forward-compatible: if Zed ACP or another standard matures, the REST surface maps cleanly

## Decision Outcome

**Chosen: Custom REST run-lifecycle protocol** — each agent service (initially just `rag-service`) exposes five endpoints following this convention. `kms-api` treats `rag-service` as a black box behind this contract.

## KMS Agent REST Contract

Every agent service that needs async/streaming exposes:

```
GET    /agents               — List agent capabilities (optional, for discovery)
POST   /runs                 — Start a run; returns { run_id, status: "pending" }
GET    /runs/{run_id}        — Poll run status and final result
GET    /runs/{run_id}/stream — SSE stream of output chunks (text/event-stream)
DELETE /runs/{run_id}        — Cancel a running job
```

**POST /runs request body:**

```json
{
  "input": {
    "query": "What was decided in the Q4 planning meeting?",
    "session_id": "sess_abc123",
    "user_id": "user_xyz",
    "collection_ids": []
  },
  "config": {
    "max_chunks": 10,
    "search_type": "hybrid"
  }
}
```

**GET /runs/{run_id} response:**

```json
{
  "run_id": "run_abc",
  "status": "completed",
  "output": {
    "answer": "...",
    "citations": [{ "file_id": "...", "excerpt": "..." }]
  },
  "created_at": "2026-03-17T10:00:00Z",
  "completed_at": "2026-03-17T10:00:08Z"
}
```

**SSE stream format (GET /runs/{run_id}/stream):**

```
data: {"type": "token", "content": "The Q4 "}
data: {"type": "token", "content": "planning meeting "}
data: {"type": "citation", "file_id": "...", "excerpt": "..."}
data: {"type": "done", "run_id": "run_abc"}
```

## Consequences

**Good:**
- Protocol is implemented in rag-service (Python FastAPI) — natural fit for Python AI stack
- `kms-api` AgentsModule is a 50-line thin proxy — no orchestration logic in NestJS
- Each future agent (graph-agent-http, transcript-agent) can adopt the same contract independently
- No SDK dependencies — just HTTP and SSE, debuggable with `curl`

**Bad / Trade-offs:**
- Not an industry standard — external ACP-compatible agents cannot plug in without adaptation
- Run state must be managed (Redis TTL — `kms:rag:run:{run_id}` → 10 min)
- No built-in discovery mechanism beyond `GET /agents`

## Future Zed ACP Integration (Optional)

If Zed editor integration becomes a goal, `rag-service` can implement an `AgentSideConnection` adapter:

```
Zed Editor (ClientSideConnection / stdio) ──► rag-service ACP adapter ──► LangGraph orchestrator
```

Reference implementation: `LiboShen/openclaw-acp` on GitHub shows the bridge pattern from stdio ACP to HTTP gateway.
