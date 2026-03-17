# agents/ — Layer 2 Router

Claude Code agent definitions, skills, and shared patterns for the KMS project.

---

## Routing Table

| Question / Task | Load This File |
|-----------------|----------------|
| What agents/skills are available in this project? | `CLAUDE.md` (Agent Quick Reference section) |
| What shared patterns do all agents follow? | `shared/patterns.md` |
| How does the 3-layer documentation system work? | `docs/3-layer-approach/CONCEPT.md` |
| Where are skill definitions stored? | `.claude/skills/` (project root) |

---

## Available Skills (invoke with `/skill-name`)

| Skill | Command | Purpose |
|-------|---------|---------|
| `kb-coordinate` | `/coordinate` | Classify problem, route to right specialist agent |
| `kb-architect` | — | System design, ADRs, component diagrams |
| `kb-backend-lead` | — | NestJS module architecture, Prisma, service implementation |
| `kb-python-lead` | — | Python workers, FastAPI endpoints, async patterns |
| `kb-db-specialist` | — | Schema, migrations, query optimization |
| `kb-api-designer` | — | REST contracts, endpoint design, validation |
| `kb-search-specialist` | — | Hybrid search, Qdrant, RRF algorithm |
| `kb-embedding-specialist` | — | Content extraction, chunking, BGE-M3, Qdrant indexing |
| `kb-observability` | — | OTel, Jaeger, Prometheus, Grafana |
| `kb-qa-architect` | — | Test strategy, pytest, Jest, coverage analysis |
| `kb-security-review` | — | Auth, OWASP, PII, multi-tenancy |
| `kb-product-manager` | — | Feature prioritization, PRDs, milestones |
| `kb-platform-engineer` | — | Docker Compose, CI/CD, environment config |
| `sync-docs` | `/sync-docs` | Auto-update docs after code changes |
| `new-feature-guide` | `/new-feature-guide` | Scaffold FOR-*.md with 6 required sections |
| `lint-docs` | `/lint-docs` | Validate CONTEXT.md routing tables and FOR-*.md structure |
| `onboard` | `/onboard` | Guide new developer through codebase |
