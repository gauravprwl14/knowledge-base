# TODOS.md — KMS Knowledge Base

Deferred work captured from planning sessions and engineering reviews.
Items here are NOT in scope for the current sprint but are worth tracking.

---

## Process Tooling (from KMS gstack Engineering Process plan)

### TODO-001: Stale context detection in .gstack-context.md
**Status: IMPLEMENTED** — `make standup` now shows `[STALE Nh]` or `[ACTIVE Nh ago]` next to each worktree's `last_session` timestamp. Implemented in `Makefile` standup target on 2026-03-30. See feat/process-improvements.
**What:** When Claude reads .gstack-context.md at session start, compare `last_session` timestamp to current time. If >24hrs old, print a WARNING before resuming.
**Why:** The stop hook rate limit prevents runaway writes but does not prevent stale context from accidental session closes or mid-task interruptions. A silent stale context causes the agent to continue from a wrong point.
**Pros:** Cheap fix (~5 min), prevents silent context drift, catches the most common failure mode.
**Cons:** Adds 1 line to the Universal Preamble or first-prompt instruction.
**Context:** Surfaced by outside voice during /plan-eng-review on 2026-03-28. The rate limit guard in write-session-context.sh prevents frequency but not staleness. The check is needed at READ time (session start), not write time.
**Implementation:** `make standup` parses `last_session:` field using `date -d`, computes age in hours, prints `[STALE Nh]` if age >24h or `[ACTIVE Nh ago]` otherwise.
**Depends on:** FEATURE_REGISTRY.md + .gstack-context.md system (Day 1-2 of the plan)

---

### TODO-002: PRD quality gate should fire at DESIGN entry, not only at git push
**Status: IMPLEMENTED** — `scripts/prd-quality-check.sh` created and `make design-gate PRD=<file>` target added. Runs all 10 checklist items standalone, exits 1 when >2 failures. Implemented on 2026-03-30. See feat/process-improvements.
**What:** The git pre-push hook enforces PRD quality at push time, but real enforcement should be at PRD_GATE → DESIGN transition (before any code is written). Make the coordinator explicitly run the PRD checklist as a prompt step at that transition.
**Why:** At push time you're already in IMPL. The hook is a fallback, not a gate. A feature with a failing PRD should never reach worktree creation.
**Pros:** Stops half-baked specs from entering DESIGN. The hook becomes a safety net, not the primary enforcement.
**Cons:** Adds a manual step to the coordinator's workflow at PRD_GATE transition.
**Context:** Surfaced by outside voice during /plan-eng-review on 2026-03-28. The stage entry criteria already lists "All 10 PRD checklist items pass" as the PRD_GATE → DESIGN condition — this TODO is about making that explicit as a coordinator action, not just a condition.
**Implementation:** `scripts/prd-quality-check.sh <prd-file>` runs 10 grep checks, prints PASS/FAIL per item, exits 0 (GATE PASSED, ≤2 failures) or 1 (GATE BLOCKED, >2 failures). Invoked via `make design-gate PRD=<path>`.
**Depends on:** docs/workflow/PRD-QUALITY-CHECKLIST.md (Day 2 of the plan)

---

### TODO-003: Add explicit git diff verification step to Day 3-4 sed preamble insertion
**What:** After running the find+sed command to insert Universal Preamble into 16 skill files, immediately run `git diff docs/agents/` and visually verify each changed file before committing.
**Why:** If the sed pattern hits the wrong line, all 16 files are modified incorrectly. Without an explicit verification step in the instructions, this gets skipped under time pressure.
**Pros:** Zero engineering cost — it's a documentation change. Prevents simultaneous corruption of all 16 skill files.
**Cons:** None.
**Context:** Surfaced by outside voice during /plan-eng-review on 2026-03-28. The plan already says "manually review each" but does not specify WHEN or WHAT command to run.
**Implementation:** Add to Day 3-4 step 8 in CEO plan: "IMMEDIATELY after sed run: `git diff docs/agents/` — review every changed file. If any looks wrong, run `git checkout docs/agents/` and retry with a corrected pattern. Do NOT commit until diff looks correct."
**Depends on:** Day 3-4 of implementation plan

---

## Deferred from CEO Plan (Layer 2 P1/P2 gaps)

### TODO-004: FEATURE_REGISTRY.md auto-generation from git worktrees
**Status: IMPLEMENTED** — `scripts/registry-sync.sh` created and `make registry-sync` target added. Syncs Worktree and Branch columns from `git worktree list` for matching rows. Non-matching worktrees print a notice rather than auto-adding rows. Implemented on 2026-03-30. See feat/process-improvements.
**What:** `make registry` command that generates FEATURE_REGISTRY.md from `git worktree list` + .gstack-context.md files. Eliminates manual updates.
**Why:** Manual registry maintenance will rot. Auto-generation makes the registry reliable.
**Context:** Explicitly deferred from CEO plan scope decisions. Depends on stable manual process first. Implemented as an in-place sync (updates Worktree + Branch columns only) rather than full regeneration.

### TODO-005: Stale feature detection
**What:** Script that flags features with no commits in 3+ days as BLOCKED in FEATURE_REGISTRY.md.
**Why:** Stale IMPL features are invisible without this — they don't show up as blocked, they just disappear from attention.
**Context:** Deferred from CEO plan. Needs stable registry first.

### TODO-006: KB skill versioning and session awareness (Layer 2 P1)
**What:** Version field in skill frontmatter + session-aware skill loading.
**Context:** Deferred from CEO plan Layer 2 P1 gaps.

### TODO-007: LLM-as-judge evaluation for KB skill output quality (Layer 2 P1)
**What:** Automated quality evaluation of agent output using a judge LLM.
**Why:** Currently no way to measure whether the Universal Preamble or Completeness Philosophy changes actually improve agent output quality.
**Context:** Deferred from CEO plan Layer 2 P1 gaps. The outside voice also flagged that the bottleneck (why agents fail) was never diagnosed. This TODO would provide the diagnostic mechanism.

---

_Last updated: 2026-03-30 — TODO-001, TODO-002, TODO-004 implemented (feat/process-improvements)_
