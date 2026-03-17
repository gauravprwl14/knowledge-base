# KMS Multi-Agent System — Architecture Plan

## Overview

The KMS multi-agent system is a structured collection of Claude Code skills that simulate a specialized engineering team for the Knowledge Management System project. This document describes the design decisions, architecture, and installation model.

---

## Two-Layer Architecture

```
Layer 1: Source (docs/agents/)
    - Version-controlled in git
    - Editable by any developer
    - Organized by agent group
    - Contains shared context, patterns, and samples

Layer 2: Installed (.claude/skills/)
    - Generated output — never edit directly
    - Consumed by Claude Code as /kb-* commands
    - Populated by running install.sh
    - Flat namespace: one .md file per skill
```

**Workflow:**

```
Edit docs/agents/<group>/<agent>.md
        ↓
bash docs/agents/install.sh --full
        ↓
.claude/skills/kb-<name>.md (installed)
        ↓
/kb-<name> "your task"
```

The separation ensures that agent definitions stay in version control alongside the code they guide, and that `.claude/skills/` remains a clean, flat, generated namespace.

---

## Agent Groups and Counts

| Group | Agents | Files |
|-------|--------|-------|
| Orchestrator | 1 | `orchestrator/coordinator.md` |
| Architecture | 2 | `architecture/solution-architect.md`, `architecture/product-manager.md` |
| Backend | 4 | `backend/backend-lead.md`, `backend/python-lead.md`, `backend/api-designer.md`, `backend/db-specialist.md` |
| Domain | 3 | `domain/search-specialist.md`, `domain/voice-specialist.md`, `domain/embedding-specialist.md` |
| DevOps | 2 | `devops/platform-engineer.md`, `devops/observability.md` |
| Quality | 2 | `quality/qa-architect.md`, `quality/security-review.md` |
| Delivery | 1 | `delivery/doc-engineer.md` |
| **Total** | **15** | |

---

## Install Modes

The install script supports three install profiles:

### `--minimal` (1 agent)

Installs the coordinator only. Useful for quickly routing a problem to the right specialist without populating the full skill namespace.

```
kb-coordinate
```

### `--standard` (5 agents)

The recommended working set for day-to-day feature development:

```
kb-coordinate
kb-architect
kb-backend-lead
kb-db-specialist
kb-qa-architect
```

Covers the most common workflow: design → implement → test.

### `--full` (15 agents)

All specialized agents. Used for:

- Onboarding new developers to the full agent system
- Complex multi-domain features (e.g., new search provider + DB schema + observability)
- Security audits and documentation sprints

---

## Utility Skills (Always Installed, Protected)

Four utility skills are installed separately and are protected from `--clean`:

| Skill | Purpose |
|-------|---------|
| `lint-docs` | Validates documentation for consistency and broken links |
| `onboard` | New developer onboarding walkthrough |
| `new-feature-guide` | Step-by-step template for end-to-end feature delivery |
| `sync-docs` | Syncs code-level comments with agent source definitions |

These are in `.claude/skills/` and are never overwritten or deleted by install.sh operations.

---

## Key Design Decisions

### 1. Source / Install Separation

**Decision:** Agent definitions live in `docs/agents/` (source), not directly in `.claude/skills/` (installed).

**Rationale:** Keeping definitions in `docs/` means they are:
- Reviewed in PRs alongside code changes
- Discoverable without Claude Code
- Easy to diff, update, and roll back
- Organized by logical group rather than flat alphabetically

### 2. Protected Utility Skills

**Decision:** `lint-docs`, `onboard`, `new-feature-guide`, and `sync-docs` cannot be removed by `--clean`.

**Rationale:** These skills are project-wide tools that developers rely on regardless of which agent profile is installed. They must always be available.

### 3. Coordinator Routing

**Decision:** `kb-coordinate` is always included in every install mode, including `--minimal`.

**Rationale:** The coordinator is the entry point for any ambiguous or multi-service task. Excluding it from any install mode would break the agent interaction model.

### 4. Domain-Specific Group for Search / Voice / Embeddings

**Decision:** Search, voice, and embeddings each have dedicated specialist agents rather than being absorbed into the backend group.

**Rationale:** These three domains have distinct external integrations (Qdrant, Whisper/Groq/Deepgram, sentence-transformers) and non-trivial algorithm complexity (RRF, chunking strategies, job lifecycle state machines) that warrant dedicated expertise. Merging them into a generic backend agent dilutes the depth of guidance.

### 5. Shared Context Files

**Decision:** Common project constants and patterns live in `shared/` and are referenced by all agents.

**Rationale:** Prevents drift between agents. When a port number, error code prefix, or queue name changes, it is updated in one place. Agents explicitly reference `shared/variables.md` and `shared/patterns.md`.

---

## Flow: Edit → Install → Use

```
1. Developer identifies a missing or outdated agent definition
   └── Edit docs/agents/<group>/<agent>.md

2. Developer runs install
   └── bash docs/agents/install.sh --full

3. install.sh copies source files to .claude/skills/ with kb- prefix
   └── .claude/skills/kb-<name>.md created/overwritten

4. Developer invokes the skill
   └── /kb-<name> "task description"

5. Claude Code loads the skill file and applies its instructions
   └── Specialist guidance applied to the task
```

---

## File Naming Conventions

- Source files: `<group>/<role-name>.md` (e.g., `backend/backend-lead.md`)
- Installed skills: `kb-<skill-name>.md` (e.g., `kb-backend-lead.md`)
- Utility skills: `<skill-name>.md` (no `kb-` prefix, e.g., `lint-docs.md`)
- Group context: `<group>/CONTEXT.md`
- Shared files: `shared/<name>.md`
- Samples: `samples/sample-<type>.md`
