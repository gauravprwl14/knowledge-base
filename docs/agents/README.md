# Knowledge Base (KMS) Multi-Agent System

This directory contains the source definitions for the KMS multi-agent system — a set of specialized Claude Code skills designed to guide development of the Knowledge Management System with Voice App integration.

---

## What Is This?

The KMS multi-agent system is a collection of **15 specialized agents** and **4 utility skills** that act as domain experts across every layer of the KMS stack. Each agent is a Claude Code skill invoked as a `/kb-<name>` command. Agents understand the project architecture, coding conventions, database schemas, and operational patterns — reducing the need to re-explain context on every request.

---

## Two-Layer Architecture

```
docs/agents/          ← Source of truth (version-controlled, editable)
    orchestrator/
    architecture/
    backend/
    domain/
    devops/
    quality/
    delivery/
    shared/
    samples/
    install.sh

.claude/skills/       ← Installed skills (consumed by Claude Code as /commands)
    kb-coordinate.md
    kb-architect.md
    ...
```

**Edit** agent definitions in `docs/agents/`. **Install** them into `.claude/skills/` by running `install.sh`. Never edit `.claude/skills/` directly — it is a generated output.

---

## Quick Start

```bash
# Install all 15 agents (full mode)
bash docs/agents/install.sh --full

# Or install the minimal set (orchestrator only)
bash docs/agents/install.sh --minimal

# Or install the standard working set (5 agents)
bash docs/agents/install.sh --standard

# Then invoke the coordinator
/kb-coordinate "Add hybrid search caching layer"
```

---

## Agent Groups

The 15 specialized agents are organized into 8 groups:

| # | Group | Count | Purpose |
|---|-------|-------|---------|
| 1 | Orchestrator | 1 | Problem classification and agent routing |
| 2 | Architecture | 2 | System design and product strategy |
| 3 | Backend | 4 | NestJS, Python workers, API design, database |
| 4 | Domain | 3 | Search, voice transcription, embeddings |
| 5 | DevOps | 2 | Platform infrastructure and observability |
| 6 | Quality | 2 | Testing strategy and security review |
| 7 | Delivery | 2 | Technical leadership and documentation |
| 8 | Utility | 4 | Cross-cutting tools (always installed) |

---

## All 15 Specialized Skills

| Skill | Group | Description |
|-------|-------|-------------|
| `/kb-coordinate` | Orchestrator | Classify problems, select specialist agents, sequence multi-service workflows |
| `/kb-architect` | Architecture | Microservice system design, component diagrams, integration strategy for KMS |
| `/kb-product-manager` | Architecture | Feature prioritization, milestone planning, user story definition |
| `/kb-backend-lead` | Backend | NestJS modules, TypeORM patterns, service implementation for kms-api |
| `/kb-python-lead` | Backend | Python worker services, FastAPI endpoints, async job processing |
| `/kb-api-designer` | Backend | REST API contracts, endpoint design, validation schemas, error mapping |
| `/kb-db-specialist` | Backend | PostgreSQL schema, TypeORM entities, migrations, query optimization |
| `/kb-search-specialist` | Domain | Hybrid search implementation, Qdrant integration, RRF algorithm, cache strategy |
| `/kb-voice-specialist` | Domain | Transcription provider integration, job lifecycle, worker patterns |
| `/kb-embedding-specialist` | Domain | Content extraction, text chunking, sentence-transformers, Qdrant indexing |
| `/kb-platform-engineer` | DevOps | Docker Compose multi-service, CI/CD pipelines, environment configuration |
| `/kb-observability` | DevOps | OpenTelemetry instrumentation, Jaeger tracing, Prometheus metrics, Grafana dashboards |
| `/kb-qa-architect` | Quality | Test strategy, pytest patterns, Jest/RTL, Playwright E2E, coverage analysis |
| `/kb-security-review` | Quality | Security audit, API key auth, OWASP checks, PII handling, threat modeling |
| `/kb-doc-engineer` | Delivery | 3-layer documentation system maintenance, CONTEXT.md updates, feature guide creation |

---

## 4 Utility Skills (Always Installed, Protected)

| Skill | Description |
|-------|-------------|
| `/lint-docs` | Validate documentation consistency, broken links, formatting |
| `/onboard` | New developer onboarding guide for the KMS project |
| `/new-feature-guide` | Step-by-step template for introducing a new feature end-to-end |
| `/sync-docs` | Synchronize code-level comments with docs/agents/ source definitions |

Utility skills are **protected** — `install.sh --clean` will not remove them.

---

## Directory Structure

```
docs/agents/
├── README.md                    ← This file
├── CLAUDE.md                    ← Routing table for Claude
├── PLAN.md                      ← Architecture and design decisions
├── USAGE-GUIDE.md               ← Workflow patterns and examples
├── install.sh                   ← Install/clean/list script
├── shared/
│   ├── variables.md             ← Shared project constants
│   ├── patterns.md              ← Shared output formats and quality gates
│   └── artifacts.md             ← Artifact definitions (ADR, BRD, HLD, etc.)
├── samples/
│   ├── sample-adr.md            ← Example ADR (RRF hybrid search)
│   └── sample-api-contract.md   ← Example API contract (POST /search)
├── orchestrator/
│   ├── CONTEXT.md
│   └── coordinator.md
├── architecture/
│   ├── CONTEXT.md
│   ├── solution-architect.md
│   └── product-manager.md
├── backend/
│   ├── CONTEXT.md
│   ├── backend-lead.md
│   ├── python-lead.md
│   ├── api-designer.md
│   └── db-specialist.md
├── domain/
│   ├── CONTEXT.md
│   ├── search-specialist.md
│   ├── voice-specialist.md
│   └── embedding-specialist.md
├── devops/
│   ├── CONTEXT.md
│   ├── platform-engineer.md
│   └── observability.md
├── quality/
│   ├── CONTEXT.md
│   ├── qa-architect.md
│   └── security-review.md
└── delivery/
    ├── CONTEXT.md
    ├── tech-lead.md
    └── doc-engineer.md
```

---

## Install Modes

| Mode | Agents Installed | Use Case |
|------|-----------------|----------|
| `--minimal` | 1 (coordinator only) | Quick routing without specialist overhead |
| `--standard` | 5 (coordinator + architect + backend-lead + db-specialist + qa-architect) | Day-to-day feature development |
| `--full` | 15 (all agents) | Full team simulation |

---

## Contributing

To add or update an agent:

1. Edit the source file in the appropriate `docs/agents/<group>/` directory.
2. Update `shared/variables.md` if new constants are introduced.
3. Run `bash docs/agents/install.sh --full` to reinstall.
4. Verify with `bash docs/agents/install.sh --list`.
