# Artifact Definitions

This file defines the standard artifacts produced by KMS agents. Each artifact has a defined purpose, producer agent, consumer agents, and required sections.

---

## BRD — Business Requirements Document

**Purpose:** Captures the business need, user requirements, and success metrics for a feature or system change.

**Produced by:** `/kb-product-manager`
**Consumed by:** `/kb-architect`, `/kb-backend-lead`, `/kb-qa-architect`

**Required Sections:**

1. **Executive Summary** — One paragraph describing the business problem and proposed solution.
2. **Stakeholders** — Who requested this, who is impacted, who approves.
3. **Problem Statement** — Current state, desired state, gap.
4. **Functional Requirements** — Numbered list of what the system must do (FR-001, FR-002, ...).
5. **Non-Functional Requirements** — Performance, security, availability constraints (NFR-001, ...).
6. **User Stories** — As a `<role>`, I want `<action>`, so that `<benefit>`. With acceptance criteria.
7. **Out of Scope** — Explicit list of what is NOT included.
8. **Success Metrics** — How will success be measured? (KPIs, SLOs, user adoption targets).
9. **Dependencies** — External systems, other features, team dependencies.
10. **Open Questions** — Unresolved items with owner and due date.

**Format:** Markdown, stored in `docs/features/<feature-name>/BRD.md`

---

## HLD — High-Level Design

**Purpose:** Describes the architectural approach for implementing a feature or system, without implementation-level detail.

**Produced by:** `/kb-architect`
**Consumed by:** `/kb-backend-lead`, `/kb-python-lead`, `/kb-db-specialist`, `/kb-platform-engineer`

**Required Sections:**

1. **Overview** — What is being built and why (1 paragraph).
2. **System Context** — How this fits into the existing KMS architecture. Reference existing services.
3. **Component Diagram** — ASCII or Mermaid diagram showing components and their interactions.
4. **Data Flow** — Sequence of operations from trigger to completion.
5. **API Changes** — New or modified endpoints (high level, not full contracts).
6. **Database Changes** — New tables, columns, or schema modifications.
7. **Queue/Event Changes** — New queues, routing keys, or message schemas.
8. **External Integrations** — Third-party APIs or services involved.
9. **Security Considerations** — Auth, data sensitivity, network boundaries.
10. **Performance Considerations** — Expected load, caching, batching strategy.
11. **Rollout Plan** — Feature flags, migration approach, rollback strategy.
12. **Open Technical Questions** — Items needing resolution before implementation.

**Format:** Markdown with Mermaid diagrams, stored in `docs/features/<feature-name>/HLD.md`

---

## ADR — Architecture Decision Record

**Purpose:** Documents a significant architectural decision, its context, rationale, and trade-offs.

**Produced by:** `/kb-architect` (occasionally `/kb-db-specialist`, `/kb-search-specialist`)
**Consumed by:** All agents — ADRs inform future decisions.

**Required Sections:**

1. **Title** — `ADR-<NNN>: <Short descriptive title>`
2. **Status** — `Proposed`, `Accepted`, `Deprecated`, `Superseded by ADR-NNN`
3. **Date** — YYYY-MM-DD
4. **Deciders** — Who made or approved this decision
5. **Context** — Problem statement and forces driving the decision
6. **Decision** — What was decided (clear, direct statement)
7. **Rationale** — Why this decision was chosen
8. **Consequences** — Positive outcomes, negative trade-offs, risks
9. **Alternatives Considered** — What else was evaluated and why rejected
10. **Implementation Notes** — Optional: constraints or follow-up tasks

**Numbering:** Sequential starting at ADR-001. Never reuse numbers. Superseded ADRs are marked but not deleted.

**Format:** Markdown, stored in `docs/decisions/ADR-<NNN>-<slug>.md`

**Reference:** See `docs/agents/samples/sample-adr.md` for a complete example.

---

## API Contract

**Purpose:** Defines the exact HTTP interface for an endpoint: request/response schema, validation rules, error codes, and examples.

**Produced by:** `/kb-api-designer`
**Consumed by:** `/kb-backend-lead`, `/kb-qa-architect`, Frontend developers, API consumers

**Required Sections:**

1. **Endpoint** — METHOD + path, service, version, auth requirements
2. **Request** — Headers, path params, query params, body TypeScript interface
3. **Response** — Success response TypeScript interface, HTTP status code
4. **Error Codes** — All possible error codes with HTTP status and description
5. **Validation Rules** — Field-level constraints (required, min/max, format)
6. **Example Request** — Valid JSON request body
7. **Example Success Response** — JSON response for the happy path
8. **Example Error Response** — JSON response for a validation or auth error

**Format:** Markdown with TypeScript code blocks, stored in `docs/api/<endpoint-slug>.md`

**Reference:** See `docs/agents/samples/sample-api-contract.md` for a complete example.

---

## Test Strategy

**Purpose:** Defines the testing approach for a feature, including what is tested at each layer and coverage targets.

**Produced by:** `/kb-qa-architect`
**Consumed by:** `/kb-backend-lead`, `/kb-python-lead`, CI/CD pipelines

**Required Sections:**

1. **Scope** — What feature/change this strategy covers
2. **Test Pyramid** — Unit / Integration / E2E split and rationale
3. **Unit Tests** — What units are tested, frameworks (Jest for NestJS, pytest for Python), mock strategy
4. **Integration Tests** — What integrations are tested (DB, queue, external APIs), test container setup
5. **E2E Tests** — User flows covered by Playwright, critical paths
6. **Coverage Targets** — Minimum line/branch coverage per layer
7. **Test Data** — Fixtures, factories, seed data strategy
8. **CI Integration** — Which tests run on PR, which run on merge, which run on schedule
9. **Exclusions** — What is NOT tested and why

**Format:** Markdown, stored in `docs/features/<feature-name>/TEST-STRATEGY.md`

---

## Data Flow Diagram

**Purpose:** Shows how data moves through the system for a specific operation or feature.

**Produced by:** `/kb-architect` or `/kb-embedding-specialist` / `/kb-voice-specialist`
**Consumed by:** All agents, developers, new team members

**Required Sections:**

1. **Title** — Feature or operation being diagrammed
2. **Participants** — List of services/components involved
3. **Sequence Diagram** — Mermaid `sequenceDiagram` showing messages, DB calls, queue operations
4. **Data Transformations** — What format data is in at each step (raw file → extracted text → chunks → vectors)
5. **Error Paths** — What happens when each step fails
6. **Latency Budget** — Expected time for each step (optional, for SLO-sensitive flows)

**Format:** Markdown with Mermaid sequence diagrams

---

## Knowledge Graph Query

**Purpose:** Defines a Neo4j Cypher query for knowledge graph traversal, with context on what it returns and when to use it.

**Produced by:** `/kb-search-specialist` or `/kb-db-specialist`
**Consumed by:** `/kb-backend-lead`, search feature developers

**Required Sections:**

1. **Query Name** — Descriptive name for the query
2. **Purpose** — What business question this answers
3. **Cypher Query** — Full query with parameter placeholders
4. **Parameters** — Input parameters with types
5. **Return Shape** — What nodes/relationships are returned
6. **Example Output** — Sample result set
7. **Performance Notes** — Expected complexity, index requirements
8. **When to Use** — Context in which this query is appropriate

**Format:** Markdown with Cypher code blocks
