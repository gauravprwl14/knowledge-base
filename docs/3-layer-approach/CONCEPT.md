# 3-Layer Context System — Concept

## The Problem

AI coding assistants have limited context windows. Loading all documentation into a session causes:
- Important instructions get pushed out as context fills up
- Wasted tokens on irrelevant docs
- Inconsistent behavior across sessions
- No scalability as the project grows

## The Solution

A hierarchical routing system. Plain markdown files. The AI loads only what the current task needs.

## The Three Layers

### Layer 1 — Router (`CLAUDE.md`)

Always loaded. Orients the AI before it touches anything.

**Contains**: Project identity, folder map, naming conventions, routing table, mandatory patterns, quick commands.
**Limit**: Under 200 lines. Every line costs tokens on every task.
**Location**: `/CLAUDE.md` (project root)

### Layer 2 — Room (`CONTEXT.md`)

One per docs subdirectory. Acts as a local routing table.

**Contains**: Subfolder purposes, routing table (question → file), naming conventions for that folder.
**Limit**: Under 100 lines. If growing, split the directory.
**Rule**: Routing ONLY — no explanations, no content duplicated from Layer 1.

Locations:
- `docs/CONTEXT.md` — master docs router
- `docs/workflow/CONTEXT.md`
- `docs/prd/CONTEXT.md`
- `docs/development/CONTEXT.md`
- `docs/architecture/CONTEXT.md`
- `docs/guides/CONTEXT.md`
- `docs/agents/CONTEXT.md`

### Layer 3 — Output (`FOR-*.md`, ADRs, PRDs, Sequence Diagrams)

Detailed content. Loaded on demand via routing tables.

Each `FOR-*.md` has exactly 6 sections:
1. Business Use Case
2. Flow Diagram (Mermaid)
3. Code Structure (file → responsibility table)
4. Key Methods (method → description → signature table)
5. Error Cases (code → HTTP → description → handling table)
6. Configuration (env var → description → default table)

## Loading Example

**Task**: "Add semantic search endpoint"

```
1. CLAUDE.md (always loaded)
   → Routing table: "Add NestJS endpoint" → docs/development/CONTEXT.md

2. docs/development/CONTEXT.md (loaded)
   → Routes to: FOR-nestjs-patterns.md, FOR-api-design.md

3. FOR-nestjs-patterns.md + FOR-api-design.md (loaded)
   → Everything needed to build the endpoint correctly
```

**Skipped**: All PRDs, ADRs, sequence diagrams, guides, agent docs. ~30 files not loaded.

## Layer Map for KMS

| Layer | File | Purpose |
|-------|------|---------|
| 1 Router | `/CLAUDE.md` | Always loaded. Routes to docs/ |
| 2 Room | `docs/CONTEXT.md` | Master docs router |
| 2 Room | `docs/workflow/CONTEXT.md` | Routes to process docs |
| 2 Room | `docs/prd/CONTEXT.md` | Routes to feature PRDs |
| 2 Room | `docs/development/CONTEXT.md` | Routes to FOR-*.md guides |
| 2 Room | `docs/architecture/CONTEXT.md` | Routes to ADRs, diagrams, standards |
| 2 Room | `docs/guides/CONTEXT.md` | Routes to operational guides |
| 2 Room | `docs/agents/CONTEXT.md` | Routes to agent/skill docs |
| 3 Output | `docs/prd/PRD-*.md` | Feature requirements |
| 3 Output | `docs/development/FOR-*.md` | Feature implementation guides |
| 3 Output | `docs/architecture/decisions/*.md` | Architecture decisions |
| 3 Output | `docs/architecture/sequence-diagrams/*.md` | Data flow diagrams |
| 3 Output | `docs/architecture/ENGINEERING_STANDARDS.md` | Full standards reference |
