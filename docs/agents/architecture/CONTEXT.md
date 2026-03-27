# Architecture Group — CONTEXT

## Agents in This Group

| Skill | File | Responsibility |
|-------|------|----------------|
| `/kb-architect` | `architecture/solution-architect.md` | System design, component architecture, ADRs, integration strategy |
| `/kb-product-manager` | `architecture/product-manager.md` | Feature prioritization, user stories, milestones, acceptance criteria |

---

## When to Use `/kb-architect`

Use the architect when:

- Designing a **new service** or major component (what are the boundaries, contracts, and dependencies?)
- Making a **significant architectural decision** that needs an ADR (database choice, algorithm selection, integration pattern)
- Producing a **High-Level Design (HLD)** before implementation begins
- Drawing **component or data flow diagrams** to communicate the system structure
- Reviewing whether a proposed change violates architectural principles
- Deciding between **competing technical approaches** at the system level

Do not use the architect for:
- Implementation-level decisions (use `/kb-backend-lead` or `/kb-python-lead`)
- Database schema detail (use `/kb-db-specialist`)
- Test strategy (use `/kb-qa-architect`)

---

## When to Use `/kb-product-manager`

Use the product manager when:

- You need **user stories** with acceptance criteria before implementation starts
- **Prioritizing** a backlog of features or tech debt items
- Defining **MVP scope** vs future iterations
- Writing a **Business Requirements Document (BRD)**
- Clarifying **out-of-scope** boundaries to prevent scope creep
- Planning **milestones** and release criteria
- Translating business needs into numbered functional requirements (FR-NNN)

Do not use the product manager for:
- Technical implementation decisions (use architect or backend agents)
- Anything that requires deep technical knowledge of the stack

---

## Typical Architecture Flow

```
/kb-product-manager "Define requirements for saved search feature"
    ↓ (produces BRD with FR-NNN list)
/kb-architect "Design saved search service based on BRD"
    ↓ (produces HLD + ADR if needed)
Specialist agents (backend, DB, search, etc.)
```

---

## Shared Resources

- `docs/agents/shared/artifacts.md` — BRD, HLD, and ADR format definitions
- `docs/agents/samples/sample-adr.md` — Reference ADR example
