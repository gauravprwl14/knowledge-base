# Shared Patterns

All agents follow the output formats, quality gates, and interaction protocols defined here.

---

## Output Format Standards

### ADR (Architecture Decision Record) Format

```markdown
# ADR-<NNN>: <Title>

**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-<NNN>
**Date:** YYYY-MM-DD
**Deciders:** <agent(s) or team members>

## Context

<What is the problem being solved? What forces are at play? Keep to 2-4 sentences.>

## Decision

<What was decided? State it clearly and directly. 1-2 sentences.>

## Rationale

<Why this decision? List the key reasons, referencing context forces.>

- Reason 1
- Reason 2
- Reason 3

## Consequences

**Positive:**
- ...

**Negative / Trade-offs:**
- ...

**Risks:**
- ...

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Option A | ... |
| Option B | ... |

## Implementation Notes

<Optional: key implementation constraints or follow-up tasks.>
```

---

### API Contract Format

```markdown
# API Contract: <METHOD> <path>

**Service:** kms-api | search-api
**Version:** v1
**Auth:** Required (X-API-Key) | Public
**Status:** Draft | Review | Approved

## Request

### Headers
| Header | Required | Value |
|--------|----------|-------|
| X-API-Key | Yes | Valid API key |
| Content-Type | Yes | application/json |

### Path Parameters
| Param | Type | Description |
|-------|------|-------------|

### Query Parameters
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|

### Body
\`\`\`typescript
interface RequestBody {
  // fields with types and JSDoc
}
\`\`\`

## Response

### Success (2xx)
\`\`\`typescript
interface SuccessResponse {
  data: { ... };
  meta?: { ... };
}
\`\`\`

### Error Codes
| Code | HTTP Status | Description |
|------|-------------|-------------|
| SRH_001 | 400 | ... |
| AUTH_403 | 403 | ... |

## Validation Rules
- Field X: required, min length 1, max length 256
- Field Y: optional, must be valid UUID v4

## Example Request
\`\`\`json
{ ... }
\`\`\`

## Example Response
\`\`\`json
{ ... }
\`\`\`
```

---

### DB Migration Checklist

Before creating a TypeORM migration, verify:

- [ ] Entity file updated with new field(s)
- [ ] Migration generated with `typeorm migration:generate` or written manually
- [ ] Migration file name follows convention: `<timestamp>-<description>.ts`
- [ ] Up method: adds column/index/table
- [ ] Down method: reverses up (column drop, index drop)
- [ ] Migration tested against a dev database: `typeorm migration:run`
- [ ] Rollback tested: `typeorm migration:revert`
- [ ] No data-destructive changes without explicit approval (drop column, change type)
- [ ] Large tables: migration uses batched UPDATE, not full table rewrite
- [ ] DTO updated if response shape changes
- [ ] API contract updated if field is exposed externally

---

## Quality Gates

### Before Any Code Change

1. Read the relevant `CONTEXT.md` for the affected group.
2. Check `shared/variables.md` for constants (ports, queue names, error prefixes).
3. Verify the layered architecture is respected (Controller → Service → Repository).
4. Confirm the coding pattern for the stack (NestJS vs Python worker).
5. Identify which DB domain the change touches (`auth_*`, `kms_*`, `voice_*`).

### Before PR Submission

1. All new code has corresponding unit tests.
2. Integration tests updated if DB schema or API contract changed.
3. Error codes defined and registered in the error code registry.
4. No hardcoded secrets, ports, or URLs — use config/env vars.
5. Transactions applied to any multi-table write.
6. CONTEXT.md updated if a new agent, group, or routing rule was added.
7. `shared/variables.md` updated if new constants introduced.
8. ADR created if an architectural decision was made.
9. API contract updated if endpoint signature changed.
10. Security review triggered if new auth flow, file upload, or PII handling added.

---

## Agent Interaction Protocol

### Handoff Format

When one agent hands off to another, structure the handoff as:

```
**Completed by:** /kb-<from-agent>
**Handoff to:** /kb-<to-agent>
**Context:** <brief summary of what was done>
**Input for next agent:** <specific task or artifact to pass>
**Constraints:** <any decisions already made that the next agent must respect>
```

### Escalation Triggers

Escalate to `/kb-coordinate` when:

- The task unexpectedly spans more than 2 services
- A decision requires product/business input
- A security concern is identified mid-implementation
- Conflicting requirements emerge between two agent recommendations
- The scope has grown beyond the original task description

Escalate to `/kb-security-review` immediately when:

- New file upload endpoint discovered
- New PII field added to any table
- Auth logic modified
- New external API integration storing credentials
- Rate limiting or access control gap identified

---

## Search-Specific Patterns

### Hybrid Search Weights (RRF Default)

```
RRF score = 1/(k + rank_semantic) + 1/(k + rank_keyword)
k = 60  (default, tunable)
```

Weight guidelines:
- General document search: equal weight (0.5 / 0.5)
- Code search: keyword-heavy (0.3 semantic / 0.7 keyword)
- Concept/question search: semantic-heavy (0.7 semantic / 0.3 keyword)
- Title search: keyword-only (1.0 keyword)

### Cache Strategy (Redis)

- Cache key: `search:<sha256(query+filters+limit)>`
- TTL: 300 seconds (5 minutes) for general search
- TTL: 60 seconds for time-sensitive queries (recent documents)
- Invalidation: flush `search:*` keys on any document upsert
- Max value size: 64KB (serialize top-20 results only)
- Circuit breaker: if Redis unavailable, bypass cache and query directly

### Qdrant Query Pattern

```python
# Always specify:
# - collection_name from shared/variables.md
# - limit (default: 10, max: 100)
# - score_threshold (default: 0.5 for cosine)
# - with_payload: True (needed for reranking)
# - with_vectors: False (not needed post-search)
```

---

## Worker Patterns

### Batch Sizes

| Worker | Batch Size | Rationale |
|--------|-----------|-----------|
| Embedding | 32 | GPU memory optimization for sentence-transformers |
| Scan | 100 | Filesystem I/O bound, larger batches OK |
| Dedup | 50 | Hash comparison is fast; balance memory vs throughput |
| Transcription | 1 | Each audio file is independent and CPU-intensive |

### Retry Logic

```python
# Standard retry decorator for all workers
@retry(
    max_attempts=3,
    backoff_base=1.0,    # seconds
    backoff_multiplier=2.0,
    exceptions=(TransientWorkerError,)
)
async def process_job(job_id: str) -> None:
    ...
```

Permanent errors (invalid file, unsupported format) → do NOT retry → mark FAILED immediately.

Transient errors (network timeout, DB connection, API rate limit) → retry with backoff.

### DLQ (Dead Letter Queue) Handling

```
Job fails after 3 retries
    → Message routed to failed.queue via kms.dlx
    → DLQ monitor reads failed.queue
    → Updates job status to FAILED in DB
    → Logs full error context (job_id, error_type, attempt_count, last_error)
    → Sends alert if error_count > threshold (configurable)
    → Does NOT re-queue automatically (requires manual intervention)
```

DLQ messages are retained for 7 days (configurable via RabbitMQ policy).

### Job Status Transition (Atomic)

```python
# Correct: status update inside transaction
async with db.begin():
    job = await db.get(Job, job_id)
    job.status = JobStatus.PROCESSING
    job.started_at = datetime.utcnow()
    await db.flush()
    # ... do work ...
    job.status = JobStatus.COMPLETED
    job.completed_at = datetime.utcnow()
```

Never update job status outside a transaction. Never skip intermediate states.

---

## Universal Preamble (Required in Every Skill)

Before taking any action, every skill must orient itself:

```
1. Read CLAUDE.md — understand project conventions, mandatory patterns, error codes, naming rules
2. Run `git status` and `git log --oneline -10` — understand current branch and recent changes
3. Check `.kms/config.json` — understand which feature flags are active (embedding, graph, RAG, voice)
4. If a TODOS.md or sprint board exists, scan it — know what's deferred and what's blocked
```

**Why this matters:** A skill that acts without reading current state will contradict conventions, reference stale decisions, or generate code that conflicts with what's already been built. 60 seconds of orientation prevents hours of rework.

**Minimum preamble (add to every skill's Step 0):**
```
Step 0 — Orient
- Read CLAUDE.md for project conventions and mandatory patterns
- Run: git status && git log --oneline -10
- Check .kms/config.json for active feature flags
- If present, scan docs/TODOS.md for deferred work related to this task
```

---

## Completeness Standard ("Boil the Lake")

**Core principle:** When AI reduces the marginal cost of completeness to near-zero, shortcuts are no longer justified by time pressure. Always choose the complete, correct solution over the expedient one.

**Compression table — embed this reasoning in every recommendation:**

| Task Type | Human Time | AI+KMS Time | Compression |
|-----------|-----------|-------------|-------------|
| NestJS module + tests | 2 days | 20 min | 100x |
| Prisma migration + rollback | 4h | 10 min | 25x |
| OpenAPI spec + DTOs | 1 day | 15 min | 50x |
| Python worker + error handling | 1 day | 20 min | 35x |
| ADR + sequence diagram | 4h | 15 min | 20x |
| E2E test suite | 2 days | 30 min | 50x |
| Security review + fixes | 1 day | 20 min | 30x |
| Feature guide + CONTEXT.md | 3h | 10 min | 20x |

**The rule:** If the complete version takes <15 minutes more than the shortcut version, always recommend the complete version. The 80-line implementation is not meaningfully cheaper than the 150-line implementation when the author is Claude Code.

**How to apply:** When offering options, always include a "Completeness: X/10" rating. A score of 10 means the solution handles all cases. Never recommend a 6/10 solution without explicitly stating what the missing 4 points cover and why they were omitted.

---

## Structured Decision Format

Every question, recommendation, or decision presented to the user must follow this format. No exceptions.

**Format:**

```
**Re-ground** (1-2 sentences)
State: what project/service, what branch, what the current goal is.
Never assume the user remembers — they may have multiple sessions open.

**Plain English** (1-3 sentences)
Explain the choice in terms a smart non-specialist can follow.
No raw function names, no framework jargon, no acronyms without expansion.
Use concrete examples: "The API will respond with a 400 error instead of crashing" not "input validation boundary enforcement".

**Recommendation**
RECOMMENDATION: [Option X] because [one concrete reason].
Completeness: X/10 — [what a 10 would include that this doesn't]

**Options**
A) [First option] — [trade-off] (human: ~Xh / AI: ~Xmin)
B) [Second option] — [trade-off] (human: ~Xh / AI: ~Xmin)
C) [Third option if needed]
```

**Why this format works:**
- Re-ground prevents context collapse in multi-session workflows
- Plain English prevents the agent from hiding behind jargon
- Explicit recommendation prevents "I'll let you decide" non-answers
- Completeness score forces honesty about shortcuts
- Both time scales expose the real cost difference

---

## Fix-First Workflow

When reviewing, auditing, or implementing, apply this decision tree before asking any question:

```
For each issue found:
  IF mechanical (typo, wrong import, missing decorator, obvious rename):
    → Fix it immediately. No question needed. Log what was fixed.
  IF pattern violation (wrong logger, wrong ORM, wrong error type):
    → Fix it immediately. Cite the CLAUDE.md rule that was violated.
  IF architectural (new abstraction, service boundary change, schema change):
    → Batch with other architectural questions. Ask once, not per-issue.
  IF uncertain (can't verify without running code, unclear intent):
    → Flag with evidence. Never claim "this is wrong" without proof.
```

**Batching rule:** Never ask more than 3 questions in a row. Group related decisions. Present them together with the Structured Decision Format.

**Evidence rule:** Every flagged issue must include:
- What was found (file + line)
- Why it's a problem (which rule/pattern it violates)
- What the fix would be
- Confidence level (verified / suspected / uncertain)

---

## Scope Drift Detection

Before completing any task, check: **does the actual work match the stated intent?**

**Detection steps:**
```
1. State the original goal (from user message, TODOS.md, or PR description)
2. List all files changed (git diff --name-only)
3. For each changed file: is it directly required by the goal?
4. For each goal item: is there a corresponding change?
```

**Red flags:**
- Files changed that were not mentioned in the goal
- Goal items with no corresponding code change
- New abstractions introduced without being requested
- Tests added for features not in scope
- Refactoring mixed into a bug fix

**Output format:**
```
Scope Check:
✅ In scope: [list of changes that match the goal]
⚠️  Scope drift: [list of changes that were not in the goal]
❌ Not implemented: [goal items with no corresponding change]
```

**Rule:** Flag scope drift. Never silently include out-of-scope changes. Never silently skip in-scope items.

---

## Cognitive Mode Protocol

Each specialist skill operates in a specific cognitive mode — a set of internalized questions that expert practitioners always ask, even when not explicitly prompted.

**How to embed a cognitive mode in a skill:**
- List 8-15 non-obvious questions the expert always asks
- Frame them as automatic instincts, not a checklist to work through
- Each question should catch a real failure mode that a generalist would miss

**Example — Staff Engineer reviewing code:**
> "What are the failure modes at each service boundary? What happens when the DB is slow? What happens when the queue is full? What does the blast radius look like if this service crashes? Is there any code path that silently succeeds when it should fail? Are there any N+1 queries hiding in a loop? Does this respect the multi-tenant boundary at every data access? What would an attacker do with this API?"

**Example — Security Reviewer:**
> "Who can reach this endpoint without authentication? What data is returned if userId scoping is bypassed? Where does user input touch the database without validation? Is there a timing attack surface? What is logged, and does any log entry contain PII or credentials? What happens if this endpoint is called 1000 times per second?"

These questions run automatically during the skill's work — they don't appear as literal checklist items in the output unless something fails.
