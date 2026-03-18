---
name: new-feature-guide
description: Scaffold a new FOR-[FeatureName].md feature guide with all 6 required sections
argument-hint: "<FeatureName>"
---

## Step 0 — Orient Before Scaffolding

1. Check if a guide already exists: `find docs/ -name "FOR-*<FeatureName>*.md"` — don't create a duplicate
2. Read the PRD or feature description — the guide Overview must accurately describe what was built
3. Read `CLAUDE.md` — confirm the correct folder for this feature type
4. Check CONTEXT.md line count before adding a routing entry — must stay under 100 lines

## Feature Guide Scaffolder's Cognitive Mode

- Is the feature name specific enough? `FOR-HybridSearch.md` yes. `FOR-Search.md` no — too broad, will be extended to become a catch-all.
- Does the folder placement match the feature type? System design docs go in `docs/architecture/`. User-facing feature docs go in `docs/features/`. Worker internals go in `docs/workers/`.
- Are all 6 sections present with at least placeholder content? An empty section is a broken navigation anchor — fill it with at least a TODO comment pointing to the right person.

# New Feature Guide

Scaffold a new `FOR-[FeatureName].md` file for the KMS documentation system.

## Step 1 — Determine Target Folder

Map the feature to the correct `docs/` subfolder:

| Feature Type | Target Folder |
|---|---|
| System design, service interactions | `docs/architecture/` |
| User-facing features (search, upload) | `docs/features/` |
| REST API endpoints | `docs/api/` |
| Background workers, job queues | `docs/workers/` |
| Infrastructure, Docker, CI/CD | `docs/platform/` |
| Security, auth | `docs/security/` |

If no matching folder exists, use `docs/features/` as default.

## Step 2 — Determine File Name

File name format: `FOR-[FeatureName].md`

Rules:
- PascalCase the feature name: "hybrid search" → `FOR-HybridSearch.md`
- Be specific: `FOR-SearchPipeline.md` not `FOR-Search.md`
- Check existing files in the folder to avoid near-duplicates

## Step 3 — Create the File

Create `docs/{folder}/FOR-[FeatureName].md` with this exact template:

```markdown
# [FeatureName]

## Overview
<!-- TODO: One paragraph describing what this feature does and its role in KMS. -->

## Why It Exists
<!-- TODO: Business and architectural rationale. Why this approach vs alternatives? -->

## How It Works
<!-- TODO: Step-by-step flow. Include a text-based data flow diagram. -->

## Key Files
<!-- TODO: List absolute file paths with one-line purpose description each.
Example:
- `src/modules/search/search.service.ts` — orchestrates hybrid search pipeline
- `src/modules/search/search.repository.ts` — PostgreSQL full-text queries
-->

## Common Operations
<!-- TODO: Code examples for the 3-5 most frequent developer tasks.
Example headings:
### Run a search query
### Add a new boost factor
### Clear search cache
-->

## Troubleshooting
<!-- TODO: Top 5 failure modes with symptom, diagnosis, and resolution.
Format:
### [Symptom]
**Symptom**: ...
**Diagnosis**: ...
**Resolution**: ...
-->
```

## Step 4 — Update CONTEXT.md

Find the `CONTEXT.md` in the same folder (or nearest parent). Add a routing entry:

```markdown
- [FeatureName] → [FOR-[FeatureName].md](./FOR-[FeatureName].md)
```

Place it under the most relevant section heading. If no section fits, add a new section.

After adding, verify CONTEXT.md is still under 100 lines.

## Step 5 — Report

Output:
```
Created: docs/{folder}/FOR-[FeatureName].md
Updated: docs/{folder}/CONTEXT.md (added routing entry)

Next steps:
1. Fill in all 6 TODO sections
2. Run /lint-docs to verify structure
```
