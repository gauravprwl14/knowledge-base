---
name: task-completion-check
description: |
  Runs the KMS engineering Definition of Done checklist against completed work.
  Use when a feature, bug fix, or refactor is finished and needs review before merging.
  Use when the user says "check if this is done", "review my work", "DoD check",
  "is this ready to merge", or "run the checklist". Audits code, docs, tests,
  ADRs, sequence diagrams, inline comments, observability, and security gates.
argument-hint: "[feature-name or file-path to review]"
---

# Task Completion Checker

You are a senior engineering reviewer running the KMS Definition of Done checklist.
Load `docs/workflow/DEFINITION-OF-DONE.md` before proceeding — that document is the authoritative checklist.

## Step 1 — Understand the Scope

Determine what was just built:
- Which files were changed? (`git diff --name-only HEAD~1 HEAD` or `git status`)
- Which services are affected? (kms-api, search-api, rag-service, Python workers, frontend)
- Is this a new feature, bug fix, refactor, or infrastructure change?
- Does it cross service boundaries?

## Step 2 — Run the 10-Gate Checklist

For each gate in `docs/workflow/DEFINITION-OF-DONE.md`, verify by reading the actual code/files.

DO NOT rely on what the developer says — verify by reading files directly.

### Gate 1 — Design & Architecture

Check:
- Does an ADR exist for every non-obvious technology choice? (`ls docs/architecture/decisions/`)
- Does a sequence diagram exist for every new cross-service data flow? (`ls docs/architecture/sequence-diagrams/`)
- Read `docs/architecture/CONTEXT.md` — is the routing table current?

### Gate 2 — Functional Correctness

Check:
- Read the PRD for this feature. Does the implementation match every acceptance criterion?
- Find edge cases not handled (empty inputs, zero counts, missing optional fields)
- Check error responses — do they return KB error codes or raw exceptions?

### Gate 3 — Tests

Check:
- `find . -name "*.spec.ts" -o -name "test_*.py" | head -20` — do test files exist for new code?
- Read the test files. Are error branches tested, not just happy paths?
- Run `npm run test` or `pytest` mentally — will these tests catch a regression?
- Is coverage ≥ 80% for new modules?

### Gate 4 — Security

Check:
- `grep -r "hardcoded\|password\|secret\|api_key" --include="*.ts" --include="*.py" -l` (no hits expected)
- Are all query parameters/body fields validated via DTOs or Pydantic models?
- Does every endpoint that accesses data use `userId` scoping?

### Gate 5 — Observability

Check:
- Do all new service methods have a structured log call for the significant event?
  - NestJS: `this.logger.info({...}, 'description')`
  - Python: `logger.info("description", key=value)`
- Are OTel spans present for new I/O paths?

### Gate 6 — Performance

Check:
- Are there DB queries inside loops? (N+1 problem)
- Do any new endpoints return unbounded lists without pagination?
- Are new indexes in the migration for any new `WHERE` clause columns?

### Gate 7 — Documentation & Doc Sync

Check inline docs:
- Do all new public functions/methods have TSDoc or Google-style docstrings?
- Are inline comments present explaining *why* (not what) for non-obvious logic?

Check architecture doc sync:
- Is `docs/architecture/CONTEXT.md` updated with routing for any new ADR or sequence diagram?
- Do existing sequence diagrams still match the implementation? Read both and compare.
- Was an ADR written for every non-obvious technology choice?

Check development doc sync:
- Is `docs/development/CONTEXT.md` updated for any new `FOR-*.md` guide?
- Does a `FOR-{feature}.md` guide exist for any non-trivial implementation pattern?
- If an existing `FOR-*.md` was referenced but the implementation changed, is it updated?

Check product doc sync:
- Is a PRD present for this feature in `docs/prd/`?
- Is `docs/prd/CONTEXT.md` routing updated?
- Is `docs/SPRINT-BOARD.md` updated with task status?
- Is `docs/MASTER-ROADMAP.md` up to date if a milestone changed?

Check API contract sync:
- Is `contracts/openapi.yaml` updated for any new or modified endpoint?
- Is `.env.example` updated for any new environment variable?

### Gate 8 — Code Quality

Check:
- Are there any `console.log` / `print` statements in non-test code?
- Is there dead code (commented-out blocks, unreferenced exports)?
- Do error codes follow `KB{DOMAIN}{4-DIGIT}` convention?

## Step 3 — Gap Analysis

For any change that touches existing code, verify:
- Are all downstream consumers of the changed API/schema identified?
- Would any existing integration test break?
- Are there open TODOs in the affected files that block this work?

## Step 4 — PRD Completeness (if a new feature)

If the $ARGUMENTS is a new feature, check the PRD at `docs/prd/PRD-{feature}.md`:
- Does it have: problem statement, success metrics, acceptance criteria, API contracts, NFRs with numbers, out-of-scope list?
- Are all open questions assigned with a resolve-by date?

## Step 5 — Output Format

Produce a structured audit report:

```
## DoD Audit Report — {feature-name}
**Date**: {today}
**Scope**: {what was changed}

### ✅ Passed Gates
- Gate N: {brief reason}

### ❌ Failed Gates
- Gate N: {what is missing} → {specific fix required}

### ⚠️ Warnings (non-blocking)
- {observation}

### Verdict
[ ] READY TO MERGE — all gates pass
[ ] BLOCKED — {N} gates failed, fixes required before merge

### Required Actions (if blocked)
1. {specific action with file path}
2. {specific action with file path}
```

Do not give a "READY TO MERGE" verdict unless you have verified each gate by reading actual files — not by assumption.
