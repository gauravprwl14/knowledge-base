---
name: sync-docs
description: Auto-detect code changes and update corresponding documentation
argument-hint: "<module|staged|HEAD~1>"
---

# Sync Docs

Detect code changes and update documentation to keep it in sync. Argument can be a module name, `staged` (git staged files), or a git ref like `HEAD~1`.

## Step 1 — Detect What Changed

Based on the argument:

**If argument is `staged`**:
```bash
git diff --cached --name-only
```

**If argument is a git ref (e.g., `HEAD~1`, `main`)**:
```bash
git diff HEAD~1 --name-only
# or
git diff main...HEAD --name-only
```

**If argument is a module name (e.g., `search`, `files`)**:
Look for changed files matching `*/{module}*` patterns.

## Step 2 — Classify Changed Files

Map changed files to documentation areas:

| Changed Path Pattern | Docs Area | Target Docs |
|---|---|---|
| `src/modules/{name}/` | NestJS module | `docs/features/FOR-{Name}.md` or `docs/api/FOR-{Name}Api.md` |
| `backend/app/workers/` | Python workers | `docs/workers/FOR-{WorkerName}.md` |
| `backend/app/services/transcription/` | Voice provider | `docs/features/FOR-VoiceTranscription.md` |
| `backend/app/services/` (embedding) | Embedding | `docs/features/FOR-EmbeddingWorkers.md` |
| `frontend/app/` | Frontend feature | `docs/features/FOR-{FeatureName}.md` |
| `docker-compose*.yml` | Platform | `docs/platform/CONTEXT.md` |
| `src/modules/search/` | Search | `docs/features/FOR-HybridSearch.md` |

## Step 3 — For Each Changed File/Module

### 3a — New file added in `src/modules/` or `backend/app/workers/`

If the new file represents a new module or worker with no existing FOR-*.md:
- Invoke `new-feature-guide` to scaffold `FOR-[FeatureName].md`
- Note: mark sections as "TODO — auto-scaffolded, needs review"

### 3b — Existing module changed

Check the matching FOR-*.md:
- [ ] Does "How It Works" still accurately describe the current flow?
- [ ] Does "Key Files" list the correct current file paths?
- [ ] Does "Common Operations" reflect current function signatures?

Update only the sections that are now inaccurate. Do not rewrite the whole guide.

### 3c — New file added to `src/modules/{name}/` directory

If a new file was added to an existing module:
- Update the "Key Files" section of the matching FOR-*.md to list the new file
- Update "CONTEXT.md" only if a new module directory was created

### 3d — Docker or config file changed

If `docker-compose*.yml` or `Dockerfile` changed:
- Check `docs/platform/CONTEXT.md` for routing accuracy
- Check `CLAUDE.md` commands section — update if port or command changed

## Step 4 — CONTEXT.md Routing Check

For each new directory or module detected:
- Verify the nearest CONTEXT.md has a routing entry pointing to the FOR-*.md
- If missing: add the routing entry
- Verify CONTEXT.md stays under 100 lines

## Step 5 — Report

Output a summary table:

```
CHANGED FILE                              DOC ACTION
src/modules/search/search.service.ts      Updated FOR-HybridSearch.md (Key Files)
backend/app/workers/embed_worker.py       Created FOR-EmbeddingWorkers.md (scaffolded)
docker-compose.yml                        CONTEXT.md routing verified — no changes needed

Needs manual review:
- FOR-EmbeddingWorkers.md — all 6 sections scaffolded, content TODOs remain
```

Items that cannot be auto-updated are marked "needs manual review" with a reason.
