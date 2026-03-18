# 0022 — Sub-Agent Spawning Pattern

- **Status**: Proposed
- **Date**: 2026-03-17
- **Deciders**: KMS Team
- **Tags**: [acp, agents, spawning, workflow, multi-agent]

## Context and Problem Statement

KMS workflows can define steps upfront in a `WorkflowDefinition` (as established by ADR-0021), but agents operating at runtime may discover sub-tasks that were not anticipated when the workflow was authored. For example, a `summary-agent` processing a document set may determine mid-execution that one document requires URL content fetching before summarisation. A static workflow definition cannot enumerate every possible sub-task; the agent must be able to request that additional work be performed.

The question is how a parent agent — or the WorkflowEngine itself — should initiate execution of a child agent for these dynamic sub-tasks. The spawning pattern must address: who is authorised to spawn agents, how results are returned to the spawner, how the WorkflowEngine tracks spawned sessions, and how runaway recursion is prevented.

This decision is closely related to ADR-0020 (agent registry design) and ADR-0021 (workflow engine). Spawned agents are drawn from the same static registry defined in ADR-0020. All spawning events are recorded in the workflow run state defined in ADR-0021.

## Decision Drivers

- The WorkflowEngine must remain the authoritative coordinator for all agent activity — spawning must not bypass run state tracking or SSE event emission
- Agents need a mechanism to request dynamic sub-tasks at runtime without the WorkflowEngine needing to anticipate every possible task branch at workflow definition time
- Runaway recursion is a concrete risk in any system that allows agents to spawn agents; a hard depth limit must be enforced by the platform, not by convention
- Sub-task results must be collectable synchronously (the spawning agent blocks until the sub-agent completes) or asynchronously (fire-and-track) depending on the use case
- The ACP tool model (ADR-0019) is already the extension mechanism by which agents call platform capabilities — sub-agent spawning should fit naturally into this model as a special tool
- Spawned agents must be drawn from the same static registry (ADR-0020) — arbitrary agent URLs must not be accepted to prevent SSRF

## Considered Options

- **Option A**: WorkflowEngine-controlled spawning only — only the WorkflowEngine spawns agents; agents cannot spawn other agents; all sub-tasks must be declared upfront in `WorkflowDefinition`
- **Option B**: Agent-initiated spawning via `kms_spawn_agent` ACP tool — any agent can call the `kms_spawn_agent` tool to spawn a sub-agent; the WorkflowEngine intercepts the tool call, creates a child ACP session, and tracks the parent-child relationship
- **Option C**: AMQP-based fan-out — agents publish `WorkflowStepMessage` events to a `kms.workflow` queue; multiple consumer agents pick up tasks; the WorkflowEngine subscribes to completion events to track results
- **Option D**: OpenClaw `sessions_spawn` RPC pattern — replicate openclaw's `sessions_spawn` RPC call inside kms-api; each spawn creates a new ACP session with a `parent_session_id` link; spawning is a first-class protocol operation rather than a tool call

## Decision Outcome

Chosen: **Hybrid — Option A (primary) + Option B (dynamic extension)** — the WorkflowEngine is the primary orchestrator for known workflows defined upfront (Option A); agents may additionally call `kms_spawn_agent` for sub-tasks discovered at runtime (Option B). The critical constraint is a maximum spawn depth of 2: `WorkflowEngine → Agent → Sub-Agent`. Sub-agents at depth 2 cannot spawn further agents. The depth is enforced by the WorkflowEngine when it receives a `kms_spawn_agent` tool call — it checks the `session_depth` field in the parent ACP session metadata and rejects the call with `KBWRK0020` if the limit would be exceeded.

AMQP fan-out (Option C) is rejected because it does not support synchronous result collection — the spawning agent must wait for the sub-agent result inline. The OpenClaw `sessions_spawn` pattern (Option D) is the design inspiration for `kms_spawn_agent` but adapted to HTTP transport and the existing ACP tool model rather than introducing a new RPC operation.

### Consequences

**Good:**
- Static workflows (Option A) remain the common case — `WorkflowDefinition` is the source of truth for known orchestration patterns and the audit trail is complete before execution begins
- Dynamic spawning (Option B) handles the long tail of runtime-discovered sub-tasks without requiring workflow authors to enumerate every branch
- The `kms_spawn_agent` tool fits naturally into the existing ACP tool dispatch mechanism (ADR-0019) — no new protocol operation, no new HTTP endpoint
- The depth-2 limit is a platform invariant enforced in `WorkflowEngine`, not a per-agent convention — a buggy agent cannot cause unbounded recursion
- Parent-child session links via `parent_session_id` give the WorkflowEngine a complete session tree for any run, enabling accurate SSE event attribution and run state aggregation
- `mode: "parallel"` spawns allow fire-and-track patterns where the spawning agent continues execution and the WorkflowEngine collects results asynchronously

**Bad / Trade-offs:**
- The depth-2 limit is a hard architectural constraint — workflows that genuinely require deeper nesting cannot be expressed as dynamic spawns and must be modelled as top-level workflow steps instead
- `kms_spawn_agent` with `mode: "sequential"` blocks the calling agent's ACP session while the sub-agent executes — this ties up an ACP session slot for the duration of the sub-task
- Debugging a dynamic spawn tree requires correlating multiple ACP session IDs; distributed tracing (W3C traceparent propagation across spawned sessions) is mandatory for observability

## Pros and Cons of the Options

### Option A — WorkflowEngine-controlled spawning only

- ✅ All agent coordination is declared upfront in `WorkflowDefinition` — the full execution plan is visible before any agent runs
- ✅ No spawn recursion risk — the WorkflowEngine is the only spawner; agents are leaves, not orchestrators
- ✅ Simple to reason about: every agent invocation maps to exactly one workflow step
- ✅ SSE event ordering is deterministic — the WorkflowEngine knows the step sequence before execution begins
- ❌ Cannot handle sub-tasks discovered at runtime — a `summary-agent` that needs to fetch a URL must either fail or return an incomplete result
- ❌ Workflow authors must enumerate every possible agent call path, even highly conditional ones, making definitions verbose for complex tasks
- ❌ Runtime discoveries that require a new agent invocation force an error and a full workflow restart rather than inline handling

### Option B — Agent-initiated spawning via `kms_spawn_agent` ACP tool

- ✅ Agents can handle runtime-discovered sub-tasks without requiring workflow authors to anticipate them
- ✅ Fits the existing ACP tool model — no new protocol operations, no new HTTP endpoints
- ✅ The WorkflowEngine intercepts `kms_spawn_agent` calls — all spawns are tracked and reflected in run state and SSE events
- ✅ `mode: "parallel"` enables fire-and-track patterns for independent sub-tasks
- ❌ Spawn depth control requires active enforcement by the WorkflowEngine — a subtle implementation bug could allow runaway recursion
- ❌ Sequential spawns block the calling agent's ACP session, increasing session slot consumption
- ❌ Dynamic spawn trees are harder to predict and test than static workflow definitions

### Option C — AMQP-based fan-out

- ✅ Fully decoupled — the spawning agent publishes a message and immediately continues; no blocking
- ✅ RabbitMQ already in the stack — no new infrastructure
- ✅ Natural fan-out for parallel sub-tasks — multiple consumers can pick up messages simultaneously
- ❌ Result collection requires a separate reply-to queue or a correlation-ID-based callback mechanism — significant additional complexity
- ❌ The spawning agent cannot synchronously await the sub-agent result; all result handling is asynchronous and requires callback plumbing
- ❌ Ordering guarantees across fan-out tasks are not provided by default — the WorkflowEngine must implement its own sequencing logic on top of message receipt
- ❌ AMQP is the ingestion pipeline transport (`kms.scan`, `kms.embed`, `kms.dedup`) — mixing workflow coordination traffic into the same broker blurs the architectural boundary

### Option D — OpenClaw `sessions_spawn` RPC pattern

- ✅ Spawning is a first-class protocol operation with a defined request/response schema
- ✅ Parent session context is propagated automatically via the protocol — no tool parameter needed
- ✅ Precedent in the openclaw ecosystem means the pattern is documented and understood
- ❌ Introduces a new ACP protocol operation (`sessions_spawn`) not currently in the KMS ACP implementation — requires protocol-level changes across all agent implementations
- ❌ All KMS agents would need to be updated to understand the new protocol operation, not just consume an additional tool
- ❌ `kms_spawn_agent` as an ACP tool achieves the same result within the existing protocol envelope — the OpenClaw pattern is the inspiration, not the implementation

## The `kms_spawn_agent` Contract

```typescript
// Tool name: kms_spawn_agent
// Registered in AcpToolRegistry (see ADR-0019)

interface KmsSpawnAgentInput {
  agent_id: string;               // Must exist in AgentRegistry (ADR-0020)
  task: string;                   // Natural language task description
  input: Record<string, unknown>; // Agent-specific input payload
  mode: 'sequential' | 'parallel'; // sequential: await result; parallel: fire+track
  parent_session_id: string;      // Injected by WorkflowEngine; agent must not forge this
  timeout_seconds?: number;       // Default: 300; max: 600
}

interface KmsSpawnAgentOutput {
  sub_run_id: string;             // New ACP session ID for the spawned agent
  result?: unknown;               // Present when mode === 'sequential' and agent completed
  // Absent when mode === 'parallel'; client polls GET /workflows/runs/:id for result
}
```

Spawn depth enforcement in the WorkflowEngine:

```typescript
// workflow-engine.service.ts
private async handleSpawnTool(
  toolInput: KmsSpawnAgentInput,
  parentSession: AcpSession,
): Promise<KmsSpawnAgentOutput> {
  if (parentSession.depth >= 2) {
    throw new AppException(
      'KBWRK0020',
      `Spawn depth limit exceeded: max depth is 2, current depth is ${parentSession.depth}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
  // ... create child ACP session with depth = parentSession.depth + 1
}
```

ACP session metadata extended for spawn tracking:

```typescript
interface AcpSessionMeta {
  runId: string;
  workflowId?: string;
  depth: number;               // 0 = WorkflowEngine, 1 = first-level agent, 2 = sub-agent
  parentSessionId?: string;    // Set on all spawned sessions
  agentId: string;
}
```

The `parent_session_id` field in the tool input is injected by the WorkflowEngine before dispatching the tool call to the agent — agents cannot supply or forge this value. This ensures the session tree is always rooted at a WorkflowEngine-controlled session.
