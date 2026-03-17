# ADR-007: Agent Communication Protocol (ACP) for Multi-Agent Orchestration

**Date**: 2026-03-17
**Status**: Accepted
**Deciders**: Architecture team

## Context

The system requires multiple specialist agents (SearchAgent, GraphAgent, RAGAgent, SyncAgent) that need to coordinate. We need a protocol for:
- Agent discovery
- Request routing
- Async task handoff
- Streaming results
- IDE integration (Zed, Cursor, VS Code)

## Decision

Implement the **Agent Communication Protocol** (agentcommunicationprotocol.dev) — REST-based, async-first, framework-agnostic.

**Orchestration pattern:** Orchestrator-Workers (from Anthropic's multi-agent guide)
- OrchestratorAgent in kms-api classifies intent and routes to specialist agents
- Parallelization: search + graph traversal run concurrently when appropriate
- Evaluator-Optimizer: RAGAgent generates + validates answers

**Agent endpoints:**
```
POST /api/v1/agents/{name}/runs     # Start async agent run
GET  /api/v1/agents/{name}/runs/{id} # Poll status
GET  /api/v1/agents/{name}/runs/{id}/stream # SSE stream
```

**MCP tool exposure** (for IDE integration via Zed ACP adapter):
- `search(query, filters)` → SearchResult[]
- `traverse(node_id, depth)` → GraphPath
- `ask(question)` → RAGResponse with citations
- `sync(source_id)` → SyncStatus

## Consequences

**Positive:**
- Framework-agnostic: agents can be Python, Node.js, or any HTTP service
- IDE integration via ACP (Zed, Cursor)
- Async-first: long-running tasks don't block HTTP
- Standard protocol: community tooling, SDKs

**Negative:**
- Additional complexity vs simple function calls
- Need to implement ACP server in kms-api
- Streaming requires SSE infrastructure

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| LangGraph | Tight framework coupling; Python-only; harder to add Node.js services |
| Direct HTTP calls between services | No standard protocol; no IDE integration; no agent discovery |
| gRPC | Binary protocol; harder for browser clients; no standard agent spec |
| CrewAI | Framework-specific; not ACP-compatible |
