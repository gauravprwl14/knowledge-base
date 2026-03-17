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
