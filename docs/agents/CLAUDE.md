# KMS Agent System — Routing Table

This file is the primary routing guide for the KMS multi-agent system. Use it to identify which agent to invoke for a given task.

---

## Quick Start

```bash
# Install agents
bash docs/agents/install.sh --full

# Always start here for complex or ambiguous tasks
/kb-coordinate "your problem statement"

# Go direct for clear, single-domain tasks
/kb-search-specialist "optimize RRF weights for code search"
```

---

## Agent Routing Table

### Orchestrator Group

| Skill | When to Use |
|-------|-------------|
| `/kb-coordinate` | Multi-service changes, unclear scope, sprint planning kickoff, cross-team coordination |

### Architecture Group

| Skill | When to Use |
|-------|-------------|
| `/kb-architect` | New service design, microservice boundaries, integration strategy, component diagrams, ADR creation |
| `/kb-product-manager` | Feature prioritization, user stories, milestone definition, roadmap review, acceptance criteria |

### Backend Group

| Skill | When to Use |
|-------|-------------|
| `/kb-backend-lead` | NestJS module creation, TypeORM service patterns, kms-api implementation, DI configuration |
| `/kb-python-lead` | Python worker logic, FastAPI endpoints, async job processing, aio-pika consumers |
| `/kb-api-designer` | REST endpoint contracts, request/response schemas, OpenAPI spec, error code mapping |
| `/kb-db-specialist` | Schema design, TypeORM entities, migrations, query optimization, index strategy |

### Domain Group

| Skill | When to Use |
|-------|-------------|
| `/kb-search-specialist` | Hybrid search tuning, Qdrant collection design, RRF weighting, search cache strategy, BM25 config |
| `/kb-voice-specialist` | Transcription provider (Whisper/Groq/Deepgram) integration, job lifecycle, webhook handling |
| `/kb-embedding-specialist` | Content extraction pipelines, text chunking strategies, sentence-transformers, vector indexing |

### DevOps Group

| Skill | When to Use |
|-------|-------------|
| `/kb-platform-engineer` | Docker Compose service additions, CI/CD pipelines, environment vars, secret management |
| `/kb-observability` | OTel instrumentation, Jaeger trace setup, Prometheus metric definition, Grafana dashboards |

### Quality Group

| Skill | When to Use |
|-------|-------------|
| `/kb-qa-architect` | Test strategy, pytest fixtures, Jest component tests, Playwright E2E, coverage gaps |
| `/kb-security-review` | Auth flow audit, API key rotation, OWASP checklist, PII data handling, threat modeling |

### Delivery Group

| Skill | When to Use |
|-------|-------------|
| `/kb-doc-engineer` | Writing/updating CONTEXT.md files, 3-layer docs maintenance, feature guide generation |

---

## Decision Tree

```
Is the task clear and single-domain?
├── YES → Go directly to the specialist agent
└── NO  → /kb-coordinate first

Does it touch multiple services (kms-api + worker + DB)?
├── YES → /kb-coordinate
└── NO  → specialist agent

Is it a new feature from scratch?
├── YES → /kb-product-manager → /kb-architect → specialists
└── NO  → appropriate specialist directly

Is it a security or compliance concern?
└── Always → /kb-security-review (may also invoke others)
```

---

## Shared Resources

All agents share the following context files. Read these before deep-diving into any agent's output:

| File | Contents |
|------|----------|
| `docs/agents/shared/variables.md` | Project constants: ports, queue names, error prefixes, DB domains, job statuses |
| `docs/agents/shared/patterns.md` | Output format standards, quality gates, handoff protocols |
| `docs/agents/shared/artifacts.md` | Definitions for ADR, BRD, HLD, API Contract, Test Strategy |
| `docs/agents/samples/sample-adr.md` | Reference ADR (RRF hybrid search decision) |
| `docs/agents/samples/sample-api-contract.md` | Reference API contract (POST /api/v1/search) |

---

## Group CONTEXT Files

Each group has a `CONTEXT.md` that provides more detailed routing within that group:

- `docs/agents/orchestrator/CONTEXT.md`
- `docs/agents/architecture/CONTEXT.md`
- `docs/agents/backend/CONTEXT.md`
- `docs/agents/domain/CONTEXT.md`
- `docs/agents/devops/CONTEXT.md`
- `docs/agents/quality/CONTEXT.md`
- `docs/agents/delivery/CONTEXT.md`
