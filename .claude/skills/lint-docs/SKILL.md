---
name: lint-docs
description: Validate 3-layer documentation structure — CONTEXT.md files and FOR-*.md feature guides
argument-hint: ""
---

# Lint Docs

Audit the KMS documentation system for structural violations. Report PASS, WARN, or FAIL per file.

## Step 1 — Find All Doc Files

Locate:
- All `CONTEXT.md` files under `docs/`
- All `FOR-*.md` files under `docs/`
- The root `CLAUDE.md`

Use Glob patterns: `docs/**/CONTEXT.md`, `docs/**/FOR-*.md`.

## Step 2 — CONTEXT.md Rules (check each file)

| Check | Result if violated |
|---|---|
| File is under 100 lines | FAIL |
| Contains only routing entries (links to FOR-*.md or other docs) | WARN |
| Contains no code blocks (```) | WARN |
| Contains no multi-paragraph explanations | WARN |
| Every linked file actually exists | FAIL |

A CONTEXT.md with routing entries only (bullet + link) always passes.
A CONTEXT.md with explanation paragraphs gets WARN "contains content — move to FOR-*.md".

## Step 3 — FOR-*.md Rules (check each file)

Required sections (exact heading names):

1. `## Overview`
2. `## Why It Exists`
3. `## How It Works`
4. `## Key Files`
5. `## Common Operations`
6. `## Troubleshooting`

| Check | Result if violated |
|---|---|
| All 6 sections present | FAIL |
| No section is empty (< 2 lines of content) | WARN |
| Key Files section lists actual file paths | WARN |

## Step 4 — CLAUDE.md Duplication Check

Scan each CONTEXT.md and FOR-*.md for content that is also present in CLAUDE.md:
- If identical paragraphs appear in both CLAUDE.md and a lower layer: WARN "duplicate content"
- Section headings alone do not count as duplication

## Step 5 — Navigation Chain Check

Verify the chain is intact:
- CLAUDE.md references at least one CONTEXT.md path
- Each CONTEXT.md links to at least one FOR-*.md
- Every FOR-*.md linked from a CONTEXT.md exists on disk

Broken links: FAIL.

## Output Format

Print a table:

```
FILE                                       STATUS   ISSUE
docs/architecture/CONTEXT.md              PASS     —
docs/features/FOR-SearchPipeline.md       FAIL     Missing sections: "Why It Exists", "Troubleshooting"
docs/features/FOR-EmbeddingWorkers.md     WARN     "Key Files" section is empty
docs/features/CONTEXT.md                  WARN     Contains content block — move to FOR-*.md
```

End with a summary:
```
Summary: N files checked — P pass, W warn, F fail
```

Exit guidance:
- All PASS: no action needed
- WARN only: suggest fixes but do not block
- Any FAIL: list files and specific fixes required
