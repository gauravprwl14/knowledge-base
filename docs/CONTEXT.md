# docs/ — Layer 2 Master Router

All KMS project documentation. Navigate by task type using the routing table below.

---

## Subfolder Purposes

| Folder | Purpose |
|--------|---------|
| `workflow/` | Engineering process — how features go from idea to production |
| `prd/` | Product Requirements Documents — one per feature |
| `development/` | How-to guides for building features: patterns, error handling, testing |
| `guides/` | Operational guides: Docker, deployment, getting started |
| `architecture/` | Engineering standards, ADRs, sequence diagrams |
| `agents/` | Claude Code agent system: skills, shared patterns |
| `session-summary/` | Session-end changelogs — institutional memory |
| `delivery-plan/` | Milestone tracker, task breakdown |

---

## Routing Table

| Task / Question | Go to |
|-----------------|-------|
| How do I plan a new feature? | `workflow/ENGINEERING_WORKFLOW.md` |
| What's the PRD template? | `workflow/PRD-TEMPLATE.md` |
| What PRD exists for feature X? | `prd/CONTEXT.md` → `prd/PRD-{feature}.md` |
| How do I build a NestJS module? | `development/CONTEXT.md` → `FOR-nestjs-patterns.md` |
| How do I build a Python worker/FastAPI service? | `development/CONTEXT.md` → `FOR-python-patterns.md` |
| How do I handle errors correctly? | `development/CONTEXT.md` → `FOR-error-handling.md` |
| How do I add structured logging? | `development/CONTEXT.md` → `FOR-logging.md` |
| How do I add OTel tracing? | `development/CONTEXT.md` → `FOR-observability.md` |
| How do I write tests? | `development/CONTEXT.md` → `FOR-testing.md` |
| How do I design an API endpoint? | `development/CONTEXT.md` → `FOR-api-design.md` |
| How do I write a database migration? | `development/CONTEXT.md` → `FOR-database.md` |
| Which tech stack decisions were made and why? | `architecture/CONTEXT.md` → `decisions/` |
| What are the full engineering standards? | `architecture/ENGINEERING_STANDARDS.md` |
| What sequence diagrams exist? | `architecture/CONTEXT.md` → `sequence-diagrams/` |
| How do I start the stack / Docker setup? | `guides/CONTEXT.md` → `FOR-docker.md` |
| How do agents and skills work here? | `agents/CONTEXT.md` |

---

## Naming Conventions

- PRDs: `prd/PRD-{feature-name}.md` (kebab-case after `PRD-`)
- Feature guides: `FOR-{feature-name}.md` (kebab-case after `FOR-`)
- ADRs: `architecture/decisions/NNNN-{title}.md` (4-digit zero-padded)
- Sequence diagrams: `architecture/sequence-diagrams/NN-{flow-name}.md` (2-digit)
- Session summaries: `session-summary/YYYY-MM-DD_HH-MM-SS_{short-description}.md`
- CONTEXT.md: exactly this name, one per subdirectory with 3+ files
