# docs/ — Layer 2 Master Router

All KMS project documentation. Navigate by task type using the routing table below.

---

## Subfolder Purposes

| Folder | Purpose | Has CONTEXT.md |
|--------|---------|----------------|
| `workflow/` | Engineering process — how features go from idea to production | Yes |
| `prd/` | Product Requirements Documents — one per feature | Yes |
| `development/` | How-to guides for building features: patterns, error handling, testing | Yes |
| `guides/` | Operational guides: Docker, deployment, getting started | Yes |
| `architecture/` | Engineering standards, ADRs, sequence diagrams | Yes |
| `agents/` | Claude Code agent system: skills, shared patterns | Yes |
| `3-layer-approach/` | 3-layer documentation system concept and layer map | No |
| `session-summary/` | Session-end changelogs — institutional memory | No |
| `delivery-plan/` | Milestone tracker, sprint boards, task breakdown | No |
| `knowledge-graph/` | Knowledge graph architecture reference docs | No |
| `knowledge-transfer/` | Codebase overview and onboarding reference | No |
| `superpowers/` | Advanced capability docs | No |
| `tutorial/` | Step-by-step tutorials | No |
| `adr/` | Legacy ADR location (canonical ADRs are in `architecture/decisions/`) | No |

---

## Routing Table

| Task / Question | Go to |
|-----------------|-------|
| How do I plan a new feature? | `workflow/ENGINEERING_WORKFLOW.md` |
| What's the PRD template? | `workflow/PRD-TEMPLATE.md` |
| What's the Definition of Done checklist? | `workflow/DEFINITION-OF-DONE.md` |
| What PRD exists for feature X? | `prd/CONTEXT.md` → `prd/PRD-{feature}.md` |
| How do I build a NestJS module? | `development/CONTEXT.md` → `FOR-python-patterns.md` (NestJS guide pending) |
| How do I build a Python worker/FastAPI service? | `development/CONTEXT.md` → `FOR-python-patterns.md` |
| How do I handle errors correctly? | `development/CONTEXT.md` → `FOR-error-handling.md` |
| How do I add structured logging? | `development/CONTEXT.md` → `FOR-logging.md` |
| How do I add OTel tracing? | `development/CONTEXT.md` → `FOR-observability.md` |
| How do I write tests? | `development/CONTEXT.md` → `FOR-testing.md` |
| How do I implement auth / JWT / refresh tokens? | `development/CONTEXT.md` → `FOR-auth-strategy.md` |
| How do I add rate limiting? | `development/CONTEXT.md` → `FOR-rate-limiting.md` |
| Which tech stack decisions were made and why? | `architecture/CONTEXT.md` → `decisions/` |
| What are the full engineering standards? | `architecture/ENGINEERING_STANDARDS.md` |
| What sequence diagrams exist? | `architecture/CONTEXT.md` → `sequence-diagrams/` |
| How do I set up Google Drive integration? | `guides/FOR-google-drive-setup.md` |
| How do agents and skills work here? | `agents/CONTEXT.md` |
| How does the 3-layer doc system work? | `3-layer-approach/CONCEPT.md` |

---

## Naming Conventions

- PRDs: `prd/PRD-{feature-name}.md` (kebab-case after `PRD-`)
- Feature guides: `FOR-{feature-name}.md` (kebab-case after `FOR-`)
- ADRs: `architecture/decisions/NNNN-{title}.md` (4-digit zero-padded)
- Sequence diagrams: `architecture/sequence-diagrams/NN-{flow-name}.md` (2-digit)
- Session summaries: `session-summary/YYYY-MM-DD_HH-MM-SS_{short-description}.md`
- CONTEXT.md: exactly this name, one per subdirectory with 3+ files
