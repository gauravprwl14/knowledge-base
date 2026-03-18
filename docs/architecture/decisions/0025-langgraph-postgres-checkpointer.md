# ADR-0025 — LangGraph PostgreSQL Checkpointer vs Redis-only State

- **Status**: Accepted
- **Date**: 2026-03-17
- **Deciders**: Engineering Team
- **Tags**: langgraph, state, checkpointer, postgresql, workflow

---

## Context and Problem Statement

KMS currently stores workflow state only in Redis (TTL-based, `kms:workflow:{run_id}` keys with a 30-day TTL per ADR-0021). The RAG pipeline in rag-service uses LangGraph for graph-based orchestration (per ADR-0013). LangGraph has built-in checkpointer support for both Redis and PostgreSQL backends.

The question is whether the existing Redis-only approach is sufficient for LangGraph's state persistence requirements, or whether PostgreSQL checkpointing is necessary — and if both are used, how responsibilities should be divided.

This decision is driven primarily by human-in-the-loop interrupt behaviour. When a broker review step pauses a workflow via LangGraph's `interrupt()` mechanism, the graph state must survive for hours or days until the human responds. Redis TTL expiry and LangGraph's checkpoint replay requirements make Redis insufficient as the sole store for in-flight graph state.

---

## Decision Drivers

- Human-in-the-loop `interrupt()` points (e.g., broker review) require graph state to persist for hours or days — well beyond a safe Redis TTL
- LangGraph's `interrupt()` and `resume()` mechanism requires exact checkpoint replay of node states; the Redis checkpointer does not support full LangGraph state replay natively across all versions of `langgraph-checkpoint-redis`
- PostgreSQL is already in the KMS stack (`DATABASE_URL`, managed by Prisma); reusing it adds no new infrastructure
- `psycopg3` is already present as a transitive dependency in the Python services — `AsyncPostgresSaver` requires no additional system-level installation
- Redis must remain the transport for SSE event streaming and fast session cache reads — its eviction-friendly semantics are a feature for those use cases, not a liability
- A mixed-signal design (PostgreSQL for durable state, Redis for ephemeral cache) aligns with how the rest of the stack already uses both stores

---

## Considered Options

### Option 1 — Redis-only

Use the Redis checkpointer (`langgraph-checkpoint-redis`) for all LangGraph graph state, identical to the existing workflow run state store in ADR-0021.

- Fast reads and writes, already in stack
- Redis TTL can expire a paused workflow: a run interrupted for broker review that resumes 6 hours later may find its checkpoint gone
- The Redis checkpointer does not guarantee full LangGraph state replay (node-level resume after `interrupt()`) in async mode across library versions
- No durable history — cannot reconstruct what a graph was doing after a restart

### Option 2 — PostgreSQL checkpointer (AsyncPostgresSaver) only

Use `AsyncPostgresSaver` from `langgraph-checkpoint-postgres` as the sole checkpointer. All graph state, including ephemeral in-flight state, writes to PostgreSQL.

- Fully durable, supports interrupt/resume, queryable history
- Higher write latency than Redis for short-lived in-flight state
- SSE event pub/sub and session cache reads still require Redis — PostgreSQL cannot replace Redis for those roles
- LangGraph native: the checkpointer is the reference implementation, maintained by the LangGraph team

### Option 3 — Dual: PostgreSQL for checkpoints + Redis for session cache and SSE

Use `AsyncPostgresSaver` for all LangGraph graph state (durable checkpoint data, node states, interrupt points). Use Redis for: ACP session metadata, SSE event pub/sub, and workflow status cache for fast `GET /runs/:id` reads.

- PostgreSQL stores what must survive: the LangGraph checkpoint blobs
- Redis stores what benefits from speed and is safe to lose: session cache, SSE event bus, hot status reads
- Connection reuses the existing `DATABASE_URL`; no new credentials or infrastructure
- Clear boundary: LangGraph owns its PostgreSQL tables via `AsyncPostgresSaver.setup()`; application code never writes to those tables directly

---

## Decision Outcome

**Chosen option: Option 3 — Dual storage.**

PostgreSQL is the correct home for LangGraph checkpoint data because LangGraph's `interrupt()`/`resume()` contract requires exact state replay that only a durable store can guarantee. Redis is the correct home for SSE event streaming and session cache reads because those operations depend on speed and tolerate loss.

The `AsyncPostgresSaver` reuses the existing `DATABASE_URL` and `psycopg3` dependency — no new infrastructure is introduced. The clear ownership boundary (LangGraph owns its tables, application code owns its Redis keys) prevents the two stores from competing for the same data.

---

## Implementation

### Checkpointer Setup

```python
# rag-service/app/services/checkpointer.py

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from app.config import settings

async def create_checkpointer() -> AsyncPostgresSaver:
    checkpointer = AsyncPostgresSaver.from_conn_string(settings.database_url)
    await checkpointer.setup()   # idempotent — creates checkpoint tables if absent
    return checkpointer
```

### Graph Compilation

```python
# rag-service/app/services/workflow_graph.py

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

async with AsyncPostgresSaver.from_conn_string(settings.database_url) as checkpointer:
    graph = workflow_graph.compile(checkpointer=checkpointer)
    await graph.ainvoke(
        state,
        config={"configurable": {"thread_id": run_id}},
    )
```

### Interrupt / Resume Pattern

```python
# Interrupt — graph pauses here, checkpoint written to PostgreSQL
result = await graph.ainvoke(
    state,
    config={"configurable": {"thread_id": run_id}},
)
# result contains interrupt value; run_id stored in Redis for fast lookup

# Resume — graph replays from PostgreSQL checkpoint, continues from interrupt point
result = await graph.ainvoke(
    Command(resume=human_review_decision),
    config={"configurable": {"thread_id": run_id}},
)
```

### Storage Responsibility Map

| Data | Store | Rationale |
|------|-------|-----------|
| LangGraph node states and interrupt points | PostgreSQL (`AsyncPostgresSaver`) | Durable replay required |
| LangGraph checkpoint blobs | PostgreSQL (`AsyncPostgresSaver`) | Managed by LangGraph internals |
| ACP session metadata | Redis (`kms:session:{session_id}`) | Fast read, safe to rebuild |
| SSE event pub/sub | Redis Pub/Sub | Ephemeral transport |
| Workflow run status cache | Redis (`kms:workflow:{run_id}`) | Fast `GET /runs/:id` reads |

### New Dependency

Add to `services/rag-service/requirements.txt`:

```
langgraph-checkpoint-postgres>=2.0.0
```

`psycopg[binary]>=3.1` is already present as a transitive dependency; `AsyncPostgresSaver` requires psycopg3 async pool support which is included.

---

## Positive Consequences

- Human-in-the-loop `interrupt()` workflows survive for hours or days without checkpoint loss
- Full LangGraph state replay is guaranteed — resume from any interrupt point works correctly
- Checkpoint history is queryable: `SELECT * FROM checkpoints WHERE thread_id = $1` for debugging
- SSE streaming and session reads continue to use Redis at existing sub-millisecond latency
- No new infrastructure: both stores are already in the KMS Docker stack

## Negative Consequences

- PostgreSQL write path is on the critical path for every LangGraph node transition — adds ~5–15ms per checkpoint write under normal load
- `AsyncPostgresSaver.setup()` must run before the first graph invocation; it is idempotent but adds a startup dependency on PostgreSQL availability
- LangGraph checkpoint tables (`checkpoints`, `checkpoint_blobs`, `checkpoint_writes`) are managed by the `langgraph-checkpoint-postgres` library, not Prisma — schema drift between the two is possible if library versions diverge

---

## Links

- ADR-0013 — rag-service scoped to RAG pipeline orchestration (LangGraph usage home)
- ADR-0021 — Workflow engine design (Redis-backed run state for kms-api state machine)
- ADR-0024 — Tiered retrieval response strategy (Tier 4 external agent, LLM Guard)
- `services/rag-service/` — implementation home for `AsyncPostgresSaver` setup
- `services/rag-service/requirements.txt` — `langgraph-checkpoint-postgres` dependency
- `DATABASE_URL` — reused from existing `kms-api` Prisma configuration
