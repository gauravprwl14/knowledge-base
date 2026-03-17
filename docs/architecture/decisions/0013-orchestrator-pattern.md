# 0013 — Python / LangGraph as Full Agent Orchestrator

- **Status**: Accepted (revised 2026-03-17 — original decision reversed)
- **Date**: 2026-03-17
- **Deciders**: Architecture Team
- **Tags**: [agents, orchestration, langgraph, python, rag-service]

## Context and Problem Statement

The KMS has three agent capabilities: semantic/keyword search, graph traversal, and RAG generation. These must be coordinated: retrieve → grade → optionally rewrite → generate. Additionally the RAG pipeline needs conditional branching. We need to decide where orchestration lives and what controls it.

## Decision Drivers

- Python has the dominant AI/ML library ecosystem (LangGraph, Anthropic SDK, sentence-transformers)
- Sub-agents (search-api, graph-worker) are all Python services — same process locality
- LangGraph is purpose-built for conditional, stateful agent pipelines
- NestJS orchestration would require cross-language HTTP for every internal agent call
- `kms-api` should remain a clean REST gateway (auth + CRUD + proxy) — no AI logic

## Considered Options

**Outer orchestrator (which service coordinates agents):**

| Option | Owner | Verdict |
|--------|-------|---------|
| A: Custom NestJS `AgentOrchestratorService` | kms-api | ❌ Rejected |
| B: LangGraph inside `rag-service` (Python) | rag-service | ✅ **Chosen** |
| C: CrewAI / AutoGen | External framework | ❌ Too opinionated |

**Inner RAG pipeline (conditional retrieve → grade → rewrite loop):**

| Option | Verdict |
|--------|---------|
| X: LangGraph StateGraph inside rag-service | ✅ **Chosen** |
| Y: Custom sequential pipeline | ❌ No conditional branching |

## Decision Outcome

**`rag-service` (Python FastAPI) is the single orchestrator for all agent logic.**

- `kms-api` **only** acts as an auth-gated HTTP proxy to `rag-service`
- `rag-service` runs a LangGraph `StateGraph` that orchestrates sub-calls to `search-api` and Neo4j
- No AI logic lives in NestJS

### Why the original NestJS orchestrator decision was reversed

The original ADR-0013 (2026-03-17 draft) chose a NestJS HTTP orchestrator calling Python agents via ACP. This was reversed because:

1. Python has far better native support for LLM tool-calling, streaming, and agent state management
2. Every orchestration step in NestJS requires an HTTP round-trip to a Python service — needless latency
3. LangGraph's `StateGraph` already handles the fan-out → aggregate → branch pattern natively
4. The `@anthropic-ai/claude-agent-sdk` and `@agentclientprotocol/sdk` npm packages are editor tooling (for Zed), not NestJS orchestration frameworks
5. `kms-api` AgentsModule was already implemented as a thin proxy — keeping it that way is architecturally simpler

## Architecture

```
Browser ──SSE──► kms-api (NestJS)
                      │  POST /runs (auth-gated proxy)
                      ▼
               rag-service (Python FastAPI)     ◄── ORCHESTRATOR
                      │
               LangGraph StateGraph
               ┌──────┴──────────────┐
               ▼                     ▼
        [retrieve node]       [graph_expand node]  (optional, feature-flagged)
         HTTP → search-api     HTTP → graph-worker
              │
        [grade_documents]
              │ (irrelevant → rewrite, max 2x)
        [rewrite_query]
              │
        [generate]
         Anthropic SDK / Ollama streaming
              │ SSE
              ▼
         kms-api → Browser
```

## Sub-agent Communication (internal to rag-service)

`rag-service` calls `search-api` and optionally `graph-worker` via plain HTTP (not the run-lifecycle protocol from ADR-0012 — those are direct synchronous HTTP GET calls):

```python
# Inside rag-service LangGraph node
async def retrieve(state: GraphState) -> GraphState:
    resp = await http_client.get(
        f"{settings.SEARCH_API_URL}/search",
        params={"q": state.query, "type": "hybrid", "limit": 20}
    )
    state.chunks = resp.json()["results"]
    return state
```

The run-lifecycle protocol (ADR-0012) applies only at the **kms-api → rag-service** boundary.

## kms-api AgentsModule Role (thin proxy only)

```typescript
// agents.service.ts — all orchestration responsibility delegated to rag-service
async createRun(dto: CreateRunDto): Promise<unknown> {
  return fetch(`${this.ragServiceBaseUrl}/runs`, {
    method: 'POST',
    body: JSON.stringify(dto),
  }).then(r => r.json());
}
```

`kms-api` never calls `search-api` or `graph-worker` directly. It is unaware of sub-agents.

## Consequences

**Good:**
- Orchestration in Python — access to LangGraph, Anthropic SDK, httpx async, sentence-transformers
- LangGraph handles conditional branching, state persistence, and retry logic natively
- `kms-api` stays clean — auth, CRUD, proxy only
- Easy to test rag-service orchestration independently of kms-api
- Adding a new sub-agent (e.g., `TranscriptAgent`) only requires a new LangGraph node

**Bad / Trade-offs:**
- Orchestration failures are harder to trace across two services (mitigated by W3C traceparent propagation)
- LangGraph version upgrades require regression testing the full pipeline
- `rag-service` becomes the most critical service — single point of failure for chat

## Pros and Cons of Rejected Options

### Option A: Custom NestJS Orchestrator

- ✅ All orchestration visible in TypeScript
- ❌ Every AI call is an HTTP round-trip to Python
- ❌ No native access to LangGraph conditional graphs
- ❌ Streaming aggregation is complex across multiple agent SSE streams
- ❌ NestJS AI libraries (nestjs-langchain etc.) immature compared to Python

### Option C: CrewAI / AutoGen

- ✅ High-level agent collaboration
- ❌ Opinionated about agent/tool definitions
- ❌ Not designed for HTTP service-to-service calls
- ❌ Heavy dependency, complicates rag-service's own architecture
