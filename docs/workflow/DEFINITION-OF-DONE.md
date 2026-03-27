# Engineering Definition of Done (DoD) — KMS Project

> **This is the non-negotiable gate for every feature, bug fix, or refactor before it is considered complete.**
> No item in this checklist is optional. Items marked `[CI]` are enforced automatically. Items marked `[HUMAN]` require a developer judgment call.

Derived from: Google Engineering Practices, DORA 2024, ISO 25010, production readiness standards.

---

## How to Use This Checklist

1. **Copy** the relevant section(s) into your PR description or task ticket.
2. **Check each item** before requesting review.
3. **Two-phase completion**: Code Done (pre-merge) + Production Done (post-deploy).
4. A task is **not done** until both phases pass.

```
/task-completion-check   ← runs this checklist against your current work
```

---

## Phase 1 — Code Done (Pre-Merge Gate)

### Gate 1 — Design & Architecture
> Prevent technical debt before it enters the codebase.

- [ ] **[HUMAN]** Change belongs in this service, not a workaround placed here for convenience
- [ ] **[HUMAN]** No unnecessary abstraction introduced (solves the problem now, not a hypothetical future)
- [ ] **[HUMAN]** No circular dependencies or layering violations introduced
- [ ] **[HUMAN]** Cross-service interaction is explicit and intentional (no hidden coupling)
- [ ] **[HUMAN]** Data model changes are backward-compatible OR a migration strategy is documented
- [ ] **[HUMAN]** If a non-obvious technology choice was made → ADR written at `docs/architecture/decisions/NNNN-{title}.md`
- [ ] **[HUMAN]** For any new data flow → sequence diagram written at `docs/architecture/sequence-diagrams/NN-{flow}.md`

### Gate 2 — Functional Correctness
> The code does what the requirements say.

- [ ] **[HUMAN]** All acceptance criteria from the PRD/ticket are met
- [ ] **[HUMAN]** Edge cases and boundary conditions are handled (empty inputs, zero counts, max limits)
- [ ] **[HUMAN]** Concurrency/race conditions considered where shared state is involved
- [ ] **[HUMAN]** Error states return actionable messages with KB error codes (never raw stack traces to callers)
- [ ] **[HUMAN]** No unintended side effects on shared state or adjacent features

### Gate 3 — Test Coverage
> Code without tests is incomplete by definition (Google Engineering Practices).

- [ ] **[CI]** Unit tests written for all new service methods — happy path + error branches
- [ ] **[CI]** Integration tests written for any code that crosses a service/DB/queue boundary
- [ ] **[CI]** Coverage ≥ 80% for all new/modified modules
- [ ] **[CI]** Coverage ≥ 90% for critical paths: auth, search, job lifecycle, file upload
- [ ] **[HUMAN]** Tests are meaningful — they will fail if the code breaks (not just pass-through assertions)
- [ ] **[HUMAN]** Mock/stub strategy follows the project standard (see `kb-qa-architect` skill)
  - Always mock: external HTTP APIs, email/webhooks, `Date.now()`, file system in unit tests
  - Never mock: your own DB in integration tests, RabbitMQ in consumer tests, business logic under test
- [ ] **[CI]** No flaky tests introduced (test passes 10/10 times in isolation)
- [ ] **[HUMAN]** Performance tests exist for any endpoint with p95 SLO

### Gate 4 — Security
> Anchored to OWASP Top 10 and least-privilege principles.

- [ ] **[HUMAN]** All user input validated and sanitized at system boundaries (user input, external APIs)
- [ ] **[HUMAN]** Auth/authorization logic correct — users can only access their own resources (userId scoping)
- [ ] **[CI]** No hardcoded credentials, secrets, or API keys in source code
- [ ] **[HUMAN]** New environment variables documented in `.env.example` and `docs/guides/`
- [ ] **[HUMAN]** PII not written to logs (no emails, tokens, passwords in structured log fields)
- [ ] **[HUMAN]** SQL injection protection verified for any raw query (`$queryRaw`, `asyncpg` parameterized)
- [ ] **[HUMAN]** New dependencies license-compatible and scanned for known CVEs

### Gate 5 — Observability
> "If it's not observable, it's not done." — SRE principle.

- [ ] **[HUMAN]** Structured logs emitted for all significant events using the project logger
  - NestJS: `@InjectPinoLogger(ClassName.name)` — never `new Logger()`
  - Python: `structlog.get_logger(__name__).bind(...)` — never `logging.getLogger()`
- [ ] **[HUMAN]** No PII or secrets in log fields
- [ ] **[HUMAN]** OTel spans added for any new I/O path (DB query, HTTP call, queue publish)
  - NestJS: auto-instrumented via `import './instrumentation'` in `main.ts`
  - Python: `configure_telemetry(app)` before route imports
- [ ] **[HUMAN]** Error count and latency metrics emitted for any new endpoint or worker
- [ ] **[HUMAN]** Alert defined for any new failure mode that would page on-call

### Gate 6 — Performance & Scalability
> Verified against realistic data volumes, not toy datasets.

- [ ] **[HUMAN]** No N+1 query problems — DB calls inside loops require explicit justification
- [ ] **[HUMAN]** Database query plan reviewed for any new query on tables > 10k rows
- [ ] **[HUMAN]** New indexes added for any new `WHERE` clause on large tables
- [ ] **[HUMAN]** Algorithmic complexity acceptable for expected data volumes (document the Big-O if non-obvious)
- [ ] **[HUMAN]** Caching strategy correct — cache invalidation is sound, no stale-data risk
- [ ] **[HUMAN]** Pagination used for any endpoint returning unbounded result sets

### Gate 7 — Documentation & Doc Sync
> Documentation is part of the change, not a follow-up task (Google Engineering Practices).
> **Doc sync is mandatory** — stale docs are worse than no docs because they actively mislead.

#### 7a — Inline Code Documentation
- [ ] **[HUMAN]** TSDoc/docstrings on all new/modified public exports, methods, and classes
  - NestJS: TSDoc `/** */` on all exports + `@ApiOperation`/`@ApiResponse` on all endpoints
  - Python: Google-style docstrings on all `def` and classes
- [ ] **[HUMAN]** Inline comments explain *why*, not *what* (the code shows what; comments explain intent)
- [ ] **[HUMAN]** No stale TODO/FIXME comments left unaddressed for > 1 sprint

#### 7b — Architecture Documentation Sync
- [ ] **[HUMAN]** `docs/architecture/CONTEXT.md` routing table updated for any new module, ADR, or sequence diagram
- [ ] **[HUMAN]** ADR written for any non-obvious technology or architecture choice (`docs/architecture/decisions/NNNN-*.md`)
- [ ] **[HUMAN]** Sequence diagram written for any new cross-service data flow (`docs/architecture/sequence-diagrams/NN-*.md`)
- [ ] **[HUMAN]** Existing sequence diagrams still match the implementation — update if they diverge
- [ ] **[HUMAN]** `docs/architecture/ENGINEERING_STANDARDS.md` updated if a new mandatory pattern is introduced

#### 7c — Development Documentation Sync
- [ ] **[HUMAN]** `docs/development/CONTEXT.md` routing table updated if a new feature guide or pattern doc is added
- [ ] **[HUMAN]** Feature guide (`FOR-{feature}.md`) written for any non-trivial implementation pattern
- [ ] **[HUMAN]** Existing feature guides updated if the implementation has changed since they were written
- [ ] **[HUMAN]** `docs/prd/CONTEXT.md` updated if a new PRD was added

#### 7d — Product Documentation Sync
- [ ] **[HUMAN]** PRD written for any user-facing feature (`docs/prd/PRD-{feature}.md`)
- [ ] **[HUMAN]** PRD acceptance criteria updated if implementation differs from original spec
- [ ] **[HUMAN]** `docs/MASTER-ROADMAP.md` updated if a milestone is completed or scope changes
- [ ] **[HUMAN]** `docs/SPRINT-BOARD.md` task moved to "Completed" with actual completion date

#### 7e — API Contract Sync
- [ ] **[HUMAN]** OpenAPI contract (`contracts/openapi.yaml`) updated for any new or modified endpoint
- [ ] **[HUMAN]** Error response codes documented in OpenAPI spec (not just 200 responses)
- [ ] **[HUMAN]** `.env.example` updated for any new environment variable introduced

#### 7f — Navigation / CONTEXT.md Sync (applies to every layer)
> CONTEXT.md files are the routing layer of the doc system. A feature without a CONTEXT.md entry is invisible.

| File to check | Update when... |
|---------------|----------------|
| `docs/architecture/CONTEXT.md` | New ADR, new sequence diagram, new architecture doc added |
| `docs/development/CONTEXT.md` | New `FOR-*.md` feature guide added |
| `docs/prd/CONTEXT.md` | New PRD added |
| `docs/guides/CONTEXT.md` | New operational guide added |
| `CLAUDE.md` | New skill, new routing pattern, new mandatory standard added |

### Gate 8 — Code Quality & Maintainability
> Preserves the ability to change this code safely in the future.

- [ ] **[CI]** Linter passes with zero errors (ESLint for NestJS/Next.js, Ruff/Pylint for Python)
- [ ] **[CI]** TypeScript compiles without errors
- [ ] **[HUMAN]** No dead code or commented-out blocks left in (delete, don't comment out)
- [ ] **[HUMAN]** No unnecessary duplication — similar logic in 3+ places warrants an abstraction
- [ ] **[HUMAN]** Error codes follow the `KB{DOMAIN}{4-DIGIT}` convention
- [ ] **[HUMAN]** Naming is clear and self-documenting throughout the change
- [ ] **[HUMAN]** No `console.log` / `print` left in non-test code
- [ ] **[HUMAN]** New npm/pip packages justified: is the functionality worth the dependency?

---

## Phase 2 — Production Done (Post-Deploy Gate)

### Gate 9 — Deployment & Operational Readiness

- [ ] **[HUMAN]** Database migrations are backward-compatible AND reversible
- [ ] **[HUMAN]** Feature flag in place if the change needs independent rollback
- [ ] **[HUMAN]** Docker Compose `up` succeeds with no errors in local dev
- [ ] **[HUMAN]** Service health check endpoints verified after deploy
- [ ] **[HUMAN]** Configuration externalized — no hard-coded environment assumptions
- [ ] **[HUMAN]** Dependent teams notified of any API contract changes
- [ ] **[HUMAN]** Rollback plan documented and validated in staging before production promotion
- [ ] **[HUMAN]** Smoke test passes in staging before production promotion

### Gate 10 — Product Acceptance

- [ ] **[HUMAN]** All acceptance criteria verified in staging environment (not just local)
- [ ] **[HUMAN]** Error states display gracefully to users (no raw stack traces in UI)
- [ ] **[HUMAN]** Feature flag toggled off → feature disappears completely (no orphaned UI state)
- [ ] **[HUMAN]** No regressions in existing end-to-end test suite
- [ ] **[HUMAN]** Post-deploy monitoring period observed (24h minimum for user-facing changes)

---

## PRD Completeness Gate

A PRD is ready for engineering kickoff when ALL of the following sections are present and non-empty with specific, measurable content:

| Section | Completeness Signal |
|---------|-------------------|
| **Problem Statement** | Clear in under 60 seconds; evidence it's a real problem |
| **User Personas** | Specific user types with distinct goals |
| **Success Metrics** | Quantifiable, time-bound (e.g., "p95 search latency < 200ms within 2 weeks of launch") |
| **Functional Requirements** | Solution-agnostic ("user can filter by date" not "add a dropdown") |
| **Non-Functional Requirements** | Specific numbers (not "must be fast" — use "p95 < 300ms at 100 RPS") |
| **API Contracts** | Endpoint signatures, payload shapes, error responses |
| **Data Model Changes** | Schema diff or ERD for any DB change |
| **Out of Scope** | Explicit list of what this release does NOT include |
| **Dependencies** | Upstream/downstream services, third-party APIs, team dependencies with owners |
| **Acceptance Criteria** | Per-feature, testable, unambiguous pass/fail conditions |
| **Open Questions** | List with owner and resolve-by date (no unresolved blockers at kickoff) |
| **Timeline** | Target release date, spike/prototype deadline, review gates |

**Gate failure triggers:**
- Non-functional requirements have no numbers
- Acceptance criteria missing for any feature in scope
- Out-of-scope list is absent
- Open questions are unassigned or have no resolution deadline
- Data model undefined for any feature that crosses a service boundary

---

## Gap Analysis Checklist

Run before starting implementation of any feature that touches existing code:

- [ ] **[HUMAN]** Existing code for the affected area has been read and understood
- [ ] **[HUMAN]** Current behavior is documented (even if wrong) before changing it
- [ ] **[HUMAN]** All services that consume the affected API/queue/schema are identified
- [ ] **[HUMAN]** Breaking changes to existing contracts are enumerated and versioning strategy chosen
- [ ] **[HUMAN]** Feature flags or migration windows required? (If yes, designed upfront)
- [ ] **[HUMAN]** Integration tests that currently pass still pass after the change
- [ ] **[HUMAN]** Sequence diagrams for adjacent features reviewed for impact
- [ ] **[HUMAN]** Open issues/TODOs in the affected files reviewed — do any block this change?

---

## Quick Reference — DoD Summary Table

| Gate | Fails if... | Fixed by... |
|------|-------------|-------------|
| 1 — Architecture | ADR missing for non-obvious choice | Write ADR, sequence diagram |
| 2 — Correctness | Acceptance criteria not met | Fix logic, update tests |
| 3 — Tests | Coverage < 80%, or no test for error path | Write missing tests |
| 4 — Security | Secret in code, no input validation | Remove secret, add validation |
| 5 — Observability | No structured log for significant event | Add structlog/pino log call |
| 6 — Performance | N+1 query, no pagination on unbounded list | Fix query, add pagination |
| 7 — Documentation | Docstring missing, CONTEXT.md not updated | Write docs, update routing |
| 8 — Code Quality | Linter fails, dead code present | `npm run lint`, delete dead code |
| 9 — Deployment | Migration irreversible, no health check | Add down migration, add `/health` |
| 10 — Acceptance | Acceptance criteria fail in staging | Fix and re-verify in staging |

---

## DORA Metric Alignment

These are **lag indicators** — they reveal whether your DoD is working, not gates themselves:

| DORA Metric | What it reveals |
|-------------|----------------|
| Deployment Frequency | DoD is lean enough to ship often |
| Change Lead Time | Gates are proportionate to risk |
| Change Fail Rate | Security, testing, observability gates are strong |
| Failed Deployment Recovery Time | Observability and rollback gates are being enforced |

**Elite benchmark (DORA 2024)**: Deploy multiple times/day · Lead time < 1h · Recovery time < 1h · Change fail rate < 5%.

---

*Maintained by: kb-tech-lead + kb-qa-architect + kb-architect. Update when new patterns are adopted.*
*Last updated: 2026-03-18 | Sources: Google eng-practices, DORA 2024, ISO 25010, production readiness standards*
