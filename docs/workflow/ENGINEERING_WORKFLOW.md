# Engineering Workflow — Feature Development Process

This document defines the mandatory process for developing any non-trivial feature in the KMS project. Follow gates in order. Do not skip gates.

---

## The Five Gates

```
Gate 1: ARCHITECTURE APPROVAL
         ↓
Gate 2: PRODUCT REQUIREMENTS (PRD)
         ↓
Gate 3: TECHNICAL DESIGN (ADR + Sequence Diagram)
         ↓
Gate 4: CODING STANDARDS CHECK
         ↓
Gate 5: IMPLEMENTATION + REVIEW
```

---

## Gate 1 — Architecture Approval

**When**: Before any new cross-service feature or infrastructure change.

**What to produce**: An architecture note (or ADR) describing:
- Which services are affected
- What new data stores, queues, or protocols are introduced
- Data flow diagram (text-based or Mermaid)
- Cross-service dependencies

**Gate criteria** (must be true before continuing):
- [ ] Affected services identified
- [ ] Data flow clear (who writes, who reads, which queue/store)
- [ ] No new technology added without an ADR
- [ ] Architecture reviewed against `docs/architecture/ENGINEERING_STANDARDS.md` Section 1 (tech stack decisions)

**Output location**: `docs/architecture/decisions/NNNN-{title}.md` or update `docs/architecture/MASTER_ARCHITECTURE_V2.md`

---

## Gate 2 — Product Requirements Document (PRD)

**When**: For every feature that results in user-visible behaviour or API changes.

**Template**: `docs/workflow/PRD-TEMPLATE.md`
**Location**: `docs/prd/PRD-{feature-name}.md`

**Mandatory PRD sections**:
1. Status (Draft → Review → Approved)
2. Business Context (why this feature exists)
3. User Stories
4. Scope (in / out)
5. Functional Requirements (ID'd, prioritised)
6. Non-Functional Requirements (performance, security, scalability)
7. Data Model Changes
8. API Contract (endpoint list)
9. Decisions Required (open questions)
10. ADR Links
11. Sequence Diagram Links
12. Testing Plan

**Gate criteria**:
- [ ] PRD written at `docs/prd/PRD-{feature}.md`
- [ ] Status set to `Approved` before implementation begins
- [ ] All open decisions in "Decisions Required" section resolved (each becomes an ADR)
- [ ] API contract endpoint list complete

---

## Gate 3 — Technical Design

### 3a. Architecture Decision Records (ADRs)

**When**: Any non-obvious technology or design choice.

**Format**: MADR (see `docs/architecture/ENGINEERING_STANDARDS.md` Section 13.1)
**Location**: `docs/architecture/decisions/NNNN-{title}.md`

Mandatory ADR for any of these:
- New library or framework
- New data store or queue
- New communication protocol
- Decision that would surprise a new team member
- Decision that is hard to reverse

### 3b. Sequence Diagrams

**When**: Every new data flow (API call chain, async queue flow, agent orchestration).

**Format**: Mermaid `sequenceDiagram` with `autonumber`
**Location**: `docs/architecture/sequence-diagrams/NN-{flow-name}.md`

Each diagram must include:
- Happy path flow
- Error flows table
- Dependencies list

**Gate criteria**:
- [ ] ADR written for each non-obvious decision
- [ ] Sequence diagram written for each new flow
- [ ] No implementation code written yet

---

## Gate 4 — Coding Standards Check

Before writing implementation code, confirm:

**NestJS services** — check each:
- [ ] Feature module created under `src/modules/{domain}/`
- [ ] `@InjectPinoLogger` will be used (not `new Logger()`)
- [ ] `AppException` from `@kb/errors` will be used for all errors
- [ ] `PrismaService` will be injected (no direct Prisma client)
- [ ] TSDoc will be added to all exported symbols
- [ ] Swagger decorators will be added to all endpoints
- [ ] Zod schema will be used for DTO validation

**Python services** — check each:
- [ ] Domain-driven folder structure planned (`connectors/`, `handlers/`, `models/`)
- [ ] `structlog.get_logger(__name__)` will be used
- [ ] Typed exception subclass of `KMSWorkerError` planned
- [ ] Google-style docstrings will be added to all `def` and classes
- [ ] `aio-pika connect_robust()` will be used for AMQP
- [ ] `pydantic-settings BaseSettings` will be used for config

**Both** — check:
- [ ] OTel instrumentation planned (custom spans from ENGINEERING_STANDARDS.md §8.2)
- [ ] Health check updated if new dependency added
- [ ] W3C traceparent propagated if crossing service boundary via queue

---

## Gate 5 — Implementation + Review

### Implementation Rules

1. Follow `docs/architecture/ENGINEERING_STANDARDS.md` — no exceptions without a new ADR
2. Write tests alongside code — do not defer to "later"
3. Minimum 80% coverage before PR
4. No `console.log`, `print()`, or `logging.getLogger()` — use structured logging
5. No hardcoded strings — constants in `src/common/constants/` or Python config

### Feature Guide (Layer 3)

After implementing, write a `FOR-{feature}.md` feature guide:
**Location**: `docs/development/FOR-{feature}.md` (or `docs/prd/FOR-{feature}.md` if domain-specific)
**Format**: 6 mandatory sections (see `docs/development/CONTEXT.md`)

### PR Checklist

Before opening a PR:
- [ ] PRD status updated to `In Development` → `Done`
- [ ] ADR(s) complete and linked from PRD
- [ ] Sequence diagram(s) complete and linked from PRD
- [ ] Feature guide `FOR-{feature}.md` written
- [ ] Tests passing, coverage ≥ 80%
- [ ] `npm run lint` (NestJS) / `ruff check .` (Python) passing
- [ ] `mypy` passing (Python typed services)
- [ ] No new `new Logger()`, `logging.getLogger()`, `console.log`, `print()` calls
- [ ] Swagger decorators on all new endpoints
- [ ] `/sync-docs` run after merge

---

## Feature Size Guide

| Size | Gate 1 | Gate 2 (PRD) | Gate 3 (ADR + Diagram) | Gate 4 | Gate 5 |
|------|--------|--------------|------------------------|--------|--------|
| Small (bug fix, 1-file change) | Skip | Skip | Skip | Check | Required |
| Medium (new endpoint, single service) | Skip | Required | Diagram only | Required | Required |
| Large (new feature, 1-2 services) | Required | Required | Both | Required | Required |
| XL (cross-service, new data store) | Required | Required | Both + Architecture note | Required | Required |

---

## Document Templates

- PRD template: `docs/workflow/PRD-TEMPLATE.md`
- ADR template: see `docs/architecture/ENGINEERING_STANDARDS.md` Section 13.1
- Sequence diagram template: see `docs/architecture/sequence-diagrams/README.md`
- Feature guide template: see `docs/development/CONTEXT.md`

---

## Example: Adding Semantic Search Feature

```
Gate 1 — Architecture
  → Affects: search-api, embed-worker, Qdrant
  → New: BGE-M3 model, Qdrant collection
  → ADR-009 already written (BGE-M3)
  → ADR-010 already written (Qdrant)
  ✓ Gate passed

Gate 2 — PRD
  → docs/prd/PRD-semantic-search.md
  → Status: Approved
  → Endpoints: GET /search?type=semantic&q=...
  ✓ Gate passed

Gate 3 — Technical Design
  → docs/architecture/decisions/0010-qdrant-vector-db.md ✓
  → docs/architecture/sequence-diagrams/06-semantic-search.md written
  ✓ Gate passed

Gate 4 — Standards Check
  → search-api: InjectPinoLogger ✓, AppException ✓, Swagger ✓
  → embed-worker: structlog ✓, aio-pika ✓, asyncpg ✓
  ✓ Gate passed

Gate 5 — Implementation
  → Code written following standards
  → Tests: 82% coverage
  → FOR-semantic-search.md written
  → PR opened, reviewed, merged
  ✓ Done
```
