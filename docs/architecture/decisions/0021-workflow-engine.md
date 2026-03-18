# 0021 — Workflow Engine Implementation

- **Status**: Proposed
- **Date**: 2026-03-17
- **Deciders**: KMS Team
- **Tags**: [workflow, acp, state-machine, nestjs]

## Context and Problem Statement

KMS's agentic platform must orchestrate multi-step workflows that combine several specialized agents (url-agent, summary-agent, ingest-agent, rag-agent, search-agent) in sequential and parallel arrangements. A workflow run has a lifecycle — it starts, executes steps, collects results, and terminates. At any point the client must be able to poll or stream its current state.

Three specific requirements drive the design: (1) workflows can have parallel steps where multiple agents execute concurrently and their results are aggregated before proceeding, (2) the current state of a run must be queryable at any time via `GET /api/v1/workflows/runs/:id`, and (3) incremental progress must be streamable to the browser via SSE — the same transport used by the existing RAG chat pipeline (ADR-0012, ADR-0018).

kms-api is already the orchestration gateway for the ACP protocol and the authoritative store for run state (ADR-0013 revised). The question is which mechanism inside kms-api — or alongside it — should implement workflow step sequencing, state transitions, and SSE event multiplexing.

## Decision Drivers

- kms-api is already the single entry point for workflow requests — adding orchestration here avoids a cross-service boundary for every state transition
- Workflow run state must be queryable by run ID at any time; the state representation must be structured and addressable, not implicit in a job queue's internal model
- SSE streaming of workflow progress events must be multiplexable — a single SSE connection must emit events from multiple parallel agent steps as they complete
- The existing ACP session model (ADR-0012) provides agent communication primitives that the workflow engine should compose, not replace
- Operational overhead must remain low — the team already operates PostgreSQL, Redis, and RabbitMQ; adding a new stateful service is only justified if no existing component can carry the load
- LangGraph (used inside rag-service for the RAG pipeline per ADR-0013) is designed for AI graph traversal with a fixed schema, not for general multi-agent workflow step management

## Considered Options

- **Option A**: Extend LangGraph in rag-service — add new graph nodes for workflow orchestration alongside the existing RAG pipeline nodes; keep all orchestration in Python
- **Option B**: Custom NestJS state machine — new `WorkflowModule` in kms-api; TypeScript state machine with explicit state enum and Redis-backed run state (`kms:workflow:{run_id}`); no external orchestration dependency
- **Option C**: BullMQ job queues — use BullMQ (Redis-backed, NestJS-native) with job chains and parent-child jobs to model sequential and parallel workflow steps
- **Option D**: Temporal.io — purpose-built durable workflow orchestration with retries, signals, and activity workers; hosted or self-managed Temporal cluster

## Decision Outcome

Chosen: **Option B — Custom NestJS state machine** — kms-api is already the orchestration hub for the ACP protocol and all run lifecycle events. A state machine implemented directly in NestJS keeps state transitions in the same process that manages ACP sessions, SSE streams, and run IDs — avoiding HTTP boundary crossings for every event. The state is compact enough to fit in Redis with a 30-day TTL. The state machine is simple enough to implement without a framework.

### Consequences

**Good:**
- State transitions are TypeScript functions — fully type-safe, straightforward to unit-test by injecting mock agent responses
- Run state in Redis is a flat JSON document keyed by `kms:workflow:{run_id}` — instantly readable by `GET /workflows/runs/:id` with no join or aggregation
- SSE multiplexing is handled by the same `SseService` already used for RAG streaming — no new transport mechanism
- Adding a new workflow definition requires only a new `WorkflowDefinition` object in the registry — no schema migration, no queue configuration
- No new infrastructure dependency: Redis is already required by the ACP session store
- BullMQ (Option C) can still be used for durable background steps (e.g., long-running ingest) within a workflow step — the state machine delegates to BullMQ for those steps without replacing it

**Bad / Trade-offs:**
- If kms-api crashes mid-workflow, in-flight state transitions are lost; Redis TTL ensures stale runs eventually expire but the run will not auto-resume (acceptable: client can retry)
- The state machine is hand-rolled — correctness relies on test coverage rather than a proven framework's guarantees
- Complex branching logic (more than 4-5 conditional edges) will become difficult to reason about in a switch-based state machine; LangGraph (Option A) would be superior for those cases if they emerge

## Pros and Cons of the Options

### Option A — Extend LangGraph in rag-service

- ✅ LangGraph handles conditional branching, fan-out, and state persistence natively
- ✅ Python has the richest AI/ML library ecosystem — natural fit for agent coordination
- ✅ RAG pipeline and workflow orchestration share the same runtime — no network hop between them
- ❌ Workflow state lives in Python (rag-service) but run IDs and SSE connections are managed in TypeScript (kms-api) — every state query requires an HTTP call to rag-service
- ❌ LangGraph's `StateGraph` is designed for AI graph traversal with a typed state schema; shoehorning general workflow steps into it introduces an impedance mismatch
- ❌ SSE multiplexing from parallel LangGraph nodes back to kms-api requires a non-trivial event relay mechanism
- ❌ ADR-0013 explicitly scopes rag-service to RAG pipeline orchestration only; expanding it to general workflow orchestration violates that boundary

### Option B — Custom NestJS state machine

- ✅ State machine lives in the same process as ACP session management and SSE streaming — zero network overhead for state transitions
- ✅ Run state is a typed TypeScript object stored as JSON in Redis — queryable, serialisable, and diffable
- ✅ Explicit state enum makes illegal state transitions impossible to represent in code
- ✅ Easy to test: state machine is a pure function from (current state, event) → next state
- ✅ No new infrastructure or framework dependency
- ❌ Hand-rolled state machine requires discipline to keep consistent as workflow complexity grows
- ❌ No built-in durable execution — a kms-api restart during a workflow leaves the run in a terminal failed state

### Option C — BullMQ job queues

- ✅ Redis-backed and NestJS-native — fits the existing stack
- ✅ Parent-child jobs model parallel fan-out natively
- ✅ BullMQ provides automatic retry with exponential backoff for individual jobs
- ❌ BullMQ job state (`waiting`, `active`, `completed`, `failed`) does not map cleanly to multi-step workflow run state (`pending`, `running`, `waiting`, `aggregating`, `completed`, `failed`, `cancelled`)
- ❌ `GET /workflows/runs/:id` would require aggregating job state across multiple BullMQ job IDs — complex and brittle
- ❌ SSE streaming from BullMQ job events requires a pub/sub bridge (Redis Streams or custom) — the same Redis that already has a simpler key-value store for run state
- ❌ Parallel step result aggregation is not a native BullMQ concept; it must be implemented on top of job completion events anyway

### Option D — Temporal.io

- ✅ Purpose-built for durable workflow execution — handles retries, timeouts, and crash recovery natively
- ✅ Rich visibility UI for workflow run history and debugging
- ✅ Workflow-as-code (TypeScript SDK) with strong guarantees about execution semantics
- ❌ Requires running a Temporal cluster (or paying for Temporal Cloud) — significant new operational burden
- ❌ Temporal's programming model (activities, workflows, signals) requires a full conceptual rewrite of the workflow layer
- ❌ Out of scope for current stage — the team's workflow requirements are well-understood and bounded; durable execution is not needed until runs exceed minutes of wall-clock time

## State Machine Design

```
pending → running → waiting (parallel steps in flight)
                         │
                    aggregating (collecting parallel results)
                         │
                    completed | failed | cancelled

running → completed | failed | cancelled   (sequential only)
```

State stored in Redis:

```typescript
// kms:workflow:{run_id}
interface WorkflowRunState {
  runId: string;
  workflowId: string;          // references WorkflowDefinition
  status: WorkflowStatus;      // pending | running | waiting | aggregating | completed | failed | cancelled
  currentStep: number;
  steps: WorkflowStepState[];
  parallelTracker?: {
    total: number;
    completed: number;
    results: Record<string, unknown>;
  };
  startedAt: string;           // ISO 8601
  updatedAt: string;
  completedAt?: string;
  error?: { code: string; message: string };
}
```

TTL: 30 days (`kms:workflow:{run_id}` key expires automatically).

Transitions are driven by ACP session events (`agent_done`, `tool_error`, `timeout`) emitted by the `AcpSessionService`. The `WorkflowEngine` subscribes to these events via an in-process EventEmitter and advances the state machine accordingly. Each transition emits a corresponding SSE event on the run's SSE channel.

SSE event types emitted during a workflow run:

| Event | Payload |
|-------|---------|
| `workflow.started` | `{ runId, workflowId, totalSteps }` |
| `workflow.step_started` | `{ runId, step, agentId }` |
| `workflow.step_completed` | `{ runId, step, agentId, durationMs }` |
| `workflow.step_failed` | `{ runId, step, agentId, error }` |
| `workflow.aggregating` | `{ runId, parallelResults }` |
| `workflow.completed` | `{ runId, result, totalDurationMs }` |
| `workflow.failed` | `{ runId, error }` |
| `workflow.cancelled` | `{ runId }` |
