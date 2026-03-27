# Flow: Multi-Agent Parallel Spawn

## Overview

This diagram covers two complementary spawn patterns in the KMS Agentic Platform:

- **Sub-diagram A** — Orchestrator-controlled parallel spawn: `WorkflowEngine` directly creates two ACP sessions simultaneously, waits with `Promise.all` semantics backed by Redis, and aggregates results once both complete.
- **Sub-diagram B** — Agent-initiated sub-agent spawn (emergent): a running agent calls the `kms_spawn_agent` tool to delegate work to a child agent, with spawn-depth enforcement (`depth ≤ 2` allowed; `depth 3` rejected as `KBWFL0008`).

See [ADR-0013](../decisions/0013-orchestrator-pattern.md) for why orchestration lives in `kms-api` WorkflowEngine rather than inside individual agents.

## Participants

| Alias | Service | Port |
|-------|---------|------|
| `CLI` | ACP Client (Browser / Zed / curl) | — |
| `WE` | kms-api (WorkflowEngine) | 8000 |
| `RD` | Redis (workflow + session state) | 6379 |
| `AA` | Agent A — rag-service (search / RAG mode) | 8002 |
| `AB` | Agent B — rag-service (summarize mode) | 8002 |
| `PG` | PostgreSQL (workflow run persistence) | 5432 |

---

## Sub-diagram A — Orchestrator-Controlled Parallel Spawn

The WorkflowEngine is the sole coordinator. It spawns both agents, monitors completion via Redis, and emits the aggregated SSE result to the client. Agents are unaware of each other.

```mermaid
sequenceDiagram
    autonumber
    participant CLI as ACP Client
    participant WE as kms-api (WorkflowEngine)
    participant RD as Redis
    participant AA as Agent A (rag-service / search)
    participant AB as Agent B (rag-service / summarize)
    participant PG as PostgreSQL

    CLI->>WE: POST /api/v1/workflows/run\n{ type: "search_and_summarize", query: "...", collection_id: "..." }
    Note over WE: Validate JWT + payload\nGenerate run_id, plan = [step_a: search, step_b: summarize]

    WE->>PG: INSERT workflow_runs { run_id, type, status: "pending", plan_json }
    PG-->>WE: OK

    WE->>RD: SET kms:workflow:{run_id} { status: "running", pending_steps: ["step_a", "step_b"] } EX 3600
    RD-->>WE: OK

    WE-->>CLI: 202 { workflow_run_id: "{run_id}" }

    CLI->>WE: GET /api/v1/workflows/run/{run_id}/stream (SSE)
    WE-->>CLI: SSE: { type: "workflow_started", run_id, parallel_steps: ["step_a", "step_b"] }

    Note over WE: Spawn both sessions simultaneously — no await between them

    WE->>RD: SET kms:acp:session:{sid_a} { agent: "rag-service", mode: "search",\nparent_run_id: run_id, step: "step_a" } EX 600
    WE->>RD: SET kms:acp:session:{sid_b} { agent: "rag-service", mode: "summarize",\nparent_run_id: run_id, step: "step_b" } EX 600
    RD-->>WE: OK (both)

    WE-->>CLI: SSE: { type: "parallel_step_started",\nsteps: [{ id: "step_a", agent: "rag-service/search" },\n{ id: "step_b", agent: "rag-service/summarize" }] }

    par Agent A — Search
        WE->>AA: POST /acp/v1/sessions/{sid_a}/prompt\n{ task: "search", query: "...", top_k: 20 }
        AA-->>WE: 202 { run_id: "{aa_run_id}" }

        Note over AA: LangGraph [retrieve] → [grade_documents] → result

        AA-->>WE: ACP done { type: "tool_call_update", tool: "kms_search",\nstatus: "completed",\nresult: { chunks: [...], result_count: 12 } }

        WE->>RD: HSET kms:workflow:{run_id}:step_a status "completed" result "{...}"
        RD-->>WE: OK

        WE-->>CLI: SSE: { type: "step_completed", step: "step_a", result_count: 12 }

    and Agent B — Summarize
        WE->>AB: POST /acp/v1/sessions/{sid_b}/prompt\n{ task: "summarize", document_id: "...", max_length: 300 }
        AB-->>WE: 202 { run_id: "{ab_run_id}" }

        Note over AB: LangGraph [summarize] → LLM → stream tokens

        loop Summary token stream
            AB-->>WE: ACP agent_message_chunk { delta: { text: "..." } }
            WE-->>CLI: SSE: { type: "agent_message_chunk", step: "step_b", delta: { text: "..." } }
        end

        AB-->>WE: ACP done { type: "tool_call_update", tool: "kms_summarize",\nstatus: "completed",\nresult: { summary: "...", key_points: [...] } }

        WE->>RD: HSET kms:workflow:{run_id}:step_b status "completed" result "{...}"
        RD-->>WE: OK

        WE-->>CLI: SSE: { type: "step_completed", step: "step_b" }
    end

    Note over WE: Promise.all gate — poll Redis until both step keys = "completed"\nor timeout (default 120 s)

    WE->>RD: HGET kms:workflow:{run_id}:step_a status
    WE->>RD: HGET kms:workflow:{run_id}:step_b status
    RD-->>WE: "completed", "completed"

    Note over WE: Both complete — aggregate

    WE->>RD: HGETALL kms:workflow:{run_id}:step_a
    WE->>RD: HGETALL kms:workflow:{run_id}:step_b
    RD-->>WE: step_a result, step_b result

    WE->>PG: UPDATE workflow_runs SET status = "completed",\noutput_json = { search_results, summary, key_points },\ncompleted_at = NOW() WHERE run_id = run_id
    PG-->>WE: OK

    WE->>RD: HSET kms:workflow:{run_id} status "completed"
    RD-->>WE: OK

    WE-->>CLI: SSE: { type: "workflow_completed",\nresult: { search_results: [...], summary: "...", key_points: [...] } }
    Note over WE,CLI: SSE stream closed
```

---

## Sub-diagram B — Agent-Initiated Sub-Agent Spawn (Emergent)

An already-running agent calls `kms_spawn_agent` to delegate work to a child agent. The WorkflowEngine enforces a maximum spawn depth of 2 to prevent unbounded recursion.

### Spawn Depth Rules

| Caller depth | Requested child depth | Decision |
|---|---|---|
| 0 (orchestrator) | 1 | Allowed |
| 1 (primary agent) | 2 | Allowed |
| 2 (child agent) | 3 | **REJECTED** — `KBWFL0008` |

```mermaid
sequenceDiagram
    autonumber
    participant CLI as ACP Client
    participant WE as kms-api (WorkflowEngine)
    participant RD as Redis
    participant AA as rag-agent (rag-service, depth=1)
    participant AB as summary-agent (rag-service, depth=2)

    Note over CLI,WE: A workflow run is already active.\nrag-agent (depth=1) is mid-execution on a RAG query.

    AA->>WE: tool_call: kms_spawn_agent\n{ agent_id: "summary-agent",\nmode: "sequential",\ntask: "summarize",\ndocument_id: "{doc_id}",\nparent_session_id: "{sid_a}" }

    Note over WE: Resolve parent session — check spawn depth

    WE->>RD: GET kms:acp:session:{sid_a}
    RD-->>WE: { agent: "rag-service", spawn_depth: 1, parent_run_id: run_id, ... }

    Note over WE: spawn_depth = 1 → child will be depth 2 → ALLOWED (max = 2)

    WE->>RD: SET kms:acp:session:{sid_b}\n{ agent: "summary-agent", spawn_depth: 2,\nparent_session_id: "{sid_a}", parent_run_id: run_id } EX 600
    RD-->>WE: OK

    WE-->>AA: tool_call_update { status: "in_progress",\nmessage: "sub-agent spawned", child_session_id: "{sid_b}" }

    WE->>AB: POST /acp/v1/sessions/{sid_b}/prompt\n{ task: "summarize", document_id: "{doc_id}", max_length: 200 }
    AB-->>WE: 202 { run_id: "{ab_run_id}" }

    Note over AB: LangGraph [summarize] → LLM generates summary

    loop Summary token stream (forwarded to parent)
        AB-->>WE: ACP agent_message_chunk { delta: { text: "..." } }
        WE-->>AA: tool_call_update { type: "child_chunk", child_session_id: "{sid_b}", delta: { text: "..." } }
    end

    AB-->>WE: ACP done { type: "tool_call_update", tool: "kms_summarize",\nstatus: "completed", result: { summary: "..." } }

    WE->>RD: DEL kms:acp:session:{sid_b}
    RD-->>WE: OK

    WE-->>AA: tool_call_update { tool: "kms_spawn_agent", status: "completed",\nresult: { summary: "...", child_session_id: "{sid_b}" } }

    Note over AA: Incorporates summary into RAG answer\nContinues [generate] node with enriched context

    AA->>AA: Build final answer: retrieved_chunks + summary → LLM [generate]

    loop Final answer token stream
        AA-->>WE: ACP agent_message_chunk { delta: { text: "..." } }
        WE-->>CLI: SSE: { type: "agent_message_chunk", delta: { text: "..." } }
    end

    AA-->>WE: ACP done { stop_reason: "end_turn", ... }
    WE-->>CLI: SSE: { type: "done", stop_reason: "end_turn" }
    Note over WE,CLI: SSE stream closed
```

### Spawn Depth Enforcement — Rejection Path (depth 3)

```mermaid
sequenceDiagram
    autonumber
    participant AB as summary-agent (rag-service, depth=2)
    participant WE as kms-api (WorkflowEngine)
    participant RD as Redis

    Note over AB: summary-agent (depth=2) attempts to spawn a further child

    AB->>WE: tool_call: kms_spawn_agent\n{ agent_id: "detail-agent", parent_session_id: "{sid_b}" }

    WE->>RD: GET kms:acp:session:{sid_b}
    RD-->>WE: { spawn_depth: 2, ... }

    Note over WE: spawn_depth = 2 → child would be depth 3\nMax allowed = 2 → REJECT

    WE-->>AB: tool_call_update { tool: "kms_spawn_agent",\nstatus: "rejected",\nreason: "max_spawn_depth_exceeded",\ncode: "KBWFL0008",\nmax_depth: 2,\ncurrent_depth: 2 }

    Note over AB: Agent catches KBWFL0008\nFalls back to direct LLM call without sub-agent
```

## Error Flows

| Step | Condition | Behaviour |
|------|-----------|-----------|
| Sub-A step 7–8 | Either agent unreachable (port 8002 down) | `WE` marks the failing step as `error` in Redis; emits SSE `{ type: "step_error", step, code: "KBWFL0002" }`; remaining parallel step continues; aggregation produces partial result |
| Sub-A step 25 | Promise.all gate timeout (120 s) exceeded | `WE` emits SSE `{ type: "error", code: "KBWFL0009", message: "parallel step timeout" }`; marks run `failed` in PG; partial results discarded |
| Sub-A step 16 | Agent B LLM unreachable | `AB` returns ACP done with `stop_reason: "fallback"`; `WE` emits `step_completed` with `summary: null`; workflow still completes with partial result |
| Sub-B step 2 | `parent_session_id` not found in Redis (expired) | `WE` returns `tool_call_update { status: "rejected", reason: "session_not_found", code: "KBGEN0004" }`; calling agent falls back to direct LLM |
| Sub-B step 2 | `agent_id` not registered in ACP agent registry | `WE` returns `tool_call_update { status: "rejected", reason: "unknown_agent", code: "KBWFL0010" }` |
| Sub-B step 12 | Child session Redis write fails | `WE` returns `tool_call_update { status: "error", code: "KBWFL0007" }`; parent agent falls back |
| Sub-B step 16 | Child agent times out (> 60 s) | `WE` returns `tool_call_update { status: "error", reason: "child_timeout", code: "KBWFL0011" }`; child session cleaned from Redis |
| Sub-B step 22 | spawn_depth = 2 → child would be depth 3 | `KBWFL0008` — see rejection path diagram above |

## OTel Custom Spans

| Span name | Owner | Attributes |
|-----------|-------|------------|
| `kb.workflow.parallel_spawn` | kms-api | `run_id`, `step_count`, `step_ids` |
| `kb.workflow.step` | kms-api | `run_id`, `step_id`, `agent`, `latency_ms`, `status` |
| `kb.workflow.parallel_gate` | kms-api | `run_id`, `wait_ms`, `completed_steps`, `timed_out` |
| `kb.acp.spawn_agent` | kms-api | `parent_session_id`, `child_session_id`, `agent_id`, `spawn_depth`, `decision` |
| `kb.acp.spawn_depth_check` | kms-api | `spawn_depth`, `max_depth`, `allowed` |

## Redis Keys

| Key | Value | TTL |
|-----|-------|-----|
| `kms:workflow:{run_id}` | Top-level workflow state hash (status, plan) | 60 min |
| `kms:workflow:{run_id}:step_a` | Step A result hash (status, result JSON) | 60 min |
| `kms:workflow:{run_id}:step_b` | Step B result hash (status, result JSON) | 60 min |
| `kms:acp:session:{sid}` | ACP session JSON including `spawn_depth`, `parent_session_id` | 10 min |

## Dependencies

| Service | Role |
|---------|------|
| `kms-api` | WorkflowEngine — parallel session management, spawn depth enforcement, SSE fan-out, Promise.all gate |
| `rag-service` | Runs all agent logic (search mode, summarize mode) — multiple ACP sessions can target the same service |
| `Redis` | Workflow step state, ACP session metadata including `spawn_depth` |
| `PostgreSQL` | Persistent workflow run record — status, plan, output |
