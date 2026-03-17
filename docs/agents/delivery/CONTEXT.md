# Delivery Group — CONTEXT

## Agents in This Group

| Skill | File | Responsibility |
|-------|------|----------------|
| `/kb-tech-lead` | `delivery/tech-lead.md` | Sprint planning, milestone sequencing, cross-team dependency management, technical leadership |
| `/kb-doc-engineer` | `delivery/doc-engineer.md` | 3-layer documentation system, CONTEXT.md maintenance, feature guide generation |

---

## When to Use `/kb-tech-lead`

Use the tech lead when:

- **Planning a sprint** — translating feature requirements into a sequenced task list
- **Sequencing milestones** — deciding what must be built before what
- **Managing cross-team dependencies** — coordinating between kms-api, workers, frontend, and devops
- **Estimating scope** — breaking down a large feature into epics and tasks with effort estimates
- **Unblocking decisions** — when two agents produce conflicting recommendations
- **Release readiness** — verifying all acceptance criteria are met before a milestone ships
- **Technical debt triage** — prioritizing what to address vs what to defer
- **Retrospective action items** — translating process issues into concrete technical tasks

Note: The tech lead delegates implementation decisions to specialist agents. It coordinates, it does not code.

---

## When to Use `/kb-doc-engineer`

Use the doc engineer when:

- **Adding a new agent** — updating the relevant group `CONTEXT.md` and `README.md`
- **Adding a new group** — creating a new group directory with `CONTEXT.md`
- **Writing a feature guide** — generating the 3-layer documentation for a completed feature
- **Updating `shared/variables.md`** — after new constants, ports, or prefixes are introduced
- **Updating `install.sh`** — after new agents are added to the source tree
- **Creating session summaries** — following the template in `CLAUDE.md`
- **Auditing documentation** — identifying stale, missing, or inconsistent docs
- **Writing CONTEXT.md from scratch** — for a newly created agent group

The doc engineer owns the documentation system itself, not the product documentation (API docs, deployment guides). Product docs are owned by the specialist agents that produce them.

---

## 3-Layer Documentation Model

The doc engineer maintains three layers of documentation:

| Layer | Type | Audience | Examples |
|-------|------|----------|---------|
| Layer 1 | Reference | Developers (daily use) | API contracts, error code registry, variable tables |
| Layer 2 | Conceptual | Developers (onboarding) | Architecture diagrams, ADRs, HLDs |
| Layer 3 | Procedural | Developers (task-specific) | Feature guides, how-to docs, runbooks |

When a feature is delivered, the doc engineer ensures all three layers are updated or created.

---

## Typical Delivery Flow

```
/kb-product-manager   "Define Q2 search milestone"
      ↓
/kb-tech-lead         "Sequence tasks and assign to agents"
      ↓
  [Specialist agents implement the feature]
      ↓
/kb-doc-engineer      "Write 3-layer docs for search milestone"
/kb-qa-architect      "Final coverage review"
/kb-security-review   "Final security gate"
      ↓
  Release
```

---

## Shared Resources

- `docs/agents/README.md` — Top-level agent system description
- `docs/agents/PLAN.md` — Architecture and design decisions for the agent system
- `docs/agents/shared/artifacts.md` — All artifact definitions
- `CLAUDE.md` (root) — Session changelog format and summary template
