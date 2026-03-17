# Orchestrator Group — CONTEXT

## What This Group Does

The orchestrator group contains a single agent: `kb-coordinate`. Its job is to analyze incoming requests, classify them by domain and complexity, select the right specialist agent(s), and sequence multi-agent workflows.

Think of `kb-coordinate` as the engineering lead for the KMS project. It does not implement — it routes, sequences, and coordinates.

---

## When to Use `/kb-coordinate`

Use the coordinator when:

- **The task is ambiguous.** You are not sure which agent owns it.
- **The task is multi-service.** It touches kms-api, a worker, the database, and possibly the frontend.
- **You need a sequenced plan.** You want to know the correct order to involve specialists.
- **Scope has expanded.** A task that started as a backend change now also requires DB migration, API contract updates, and new tests.
- **Sprint kickoff.** Planning a new feature end-to-end before diving into implementation.
- **Cross-domain escalation.** A specialist agent has flagged a concern outside its domain.

Go **directly to a specialist** when:

- The task is clearly single-domain and you know which agent owns it.
- You are iterating on a specific implementation already in progress.
- The task is a minor bug fix in a known service.

---

## What the Coordinator Produces

For a given input, `kb-coordinate` outputs:

1. **Problem classification** — Which domains are involved (backend, search, DB, devops, etc.)
2. **Agent sequence** — Ordered list of agents to invoke, with specific task descriptions for each
3. **Dependencies** — Which steps must complete before others can start
4. **Risk flags** — Security, performance, or architectural concerns to escalate early

---

## Agent Reference

See `docs/agents/orchestrator/coordinator.md` for the full coordinator skill definition.

---

## Example Invocations

```bash
# Complex feature
/kb-coordinate "Add semantic deduplication for ingested documents"

# Cross-service bug
/kb-coordinate "Search results are stale after document deletion"

# Sprint planning
/kb-coordinate "Plan the Q2 search quality milestone"

# Unclear scope
/kb-coordinate "Users are complaining search is slow — investigate and fix"
```
