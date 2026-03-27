# Research Findings — 2026-03-17

Findings from production research conducted before Phase 1 implementation.

## LangGraph Production (Critical Findings)

1. **State bloat kills performance**: Default `add_messages` reducer is append-only → O(N²) token processing in loops. Use milestone-tagged rolling windows + Pydantic BaseModel (not TypedDict) for state. → ADR-0025
2. **PostgreSQL checkpointer is production standard**: `AsyncPostgresSaver` for durable HITL workflows. Redis for speed/cache. → ADR-0025
3. **Large graphs must use subgraph decomposition**: Flat graphs >15 nodes are unmaintainable. Each domain (research, analysis, writer) becomes an independent compiled subgraph.
4. **Nodes must be idempotent**: State replay will re-execute nodes. Side effects (file writes, DB inserts) must be guarded.
5. **Thread ID = workflow run ID**: Never reuse across workflows. One thread per run_id.

## LLM Provider (Critical Findings)

1. **LiteLLM as Proxy** (not per-request SDK): Run as sidecar service. Virtual keys per workflow type. 500µs overhead per call — acceptable.
2. **Capability routing**: research → Perplexity, analysis/synthesis/generation → Claude. → ADR-0026
3. **Ollama is generation-fallback only**: Too heavy for dev machines. Claude API is primary.
4. **LLM Guard pattern**: Always check `available_provider()` before any LLM call. Return Tier 3 result if None.

## Content Storage (Critical Findings)

1. **YAML frontmatter is mandatory** for all AI-generated `.md` files: `id`, `created_at`, `source_ids[]`, `agent_run_id`, `generator_model`, `workflow`, `content_type`, `status`
2. **File is source of truth**: Write to filesystem first, create DB index entry second. Never duplicate content.
3. **Three-file agent pattern**: `task_plan.md` (goals/progress), `notes.md` (append-only scratchpad), deliverable (atomic write)
4. **Auto-linking at ingest**: Link to source documents at creation time, not retroactively.

## ACP Protocol (Critical Clarification)

Two different protocols share the name ACP. KMS uses **Agent Client Protocol** (Zed, agentclientprotocol.dev). The other (IBM/BeeAI) is unrelated. See `ACP-PROTOCOL-CLARIFICATION.md`.

## Key Additions to Architecture

Based on research, two architecture additions are needed:
1. **LiteLLM Proxy** as a sidecar service (new entry in docker-compose.kms.yml) — enables production LLM routing
2. **YAML frontmatter standard** for all KMS-generated content — needs a spec in engineering standards
