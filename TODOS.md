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

---

## Content Creator Integration (from /autoplan 2026-03-31)

### TODO-008: Outbox pattern for RabbitMQ publish at job creation
**What:** Currently: job INSERT → then RabbitMQ publish. If publish fails, job exists in DB with QUEUED status but no worker will pick it up. Fix: write job + outbox row in same Prisma transaction; separate publisher polls outbox and publishes.
**Why:** KBCNT0012 error handling (rollback on publish failure) is complex without this. Outbox makes it atomic by design.
**Context:** Deferred from content creator integration Phase 3 Eng Review (v1 uses KBCNT0012 throw + manual retry as workaround).

### TODO-009: CONTENT_WORKER_CONCURRENCY > 1
**What:** Allow content-worker to process multiple jobs in parallel. Currently defaults to 1.
**Why:** Parallel processing requires distributed locking on job state (no single registry.json race condition risk, but DB write order matters).
**Context:** Deferred from content creator integration. Single concurrency is safe and sufficient for v1.

### TODO-010: Automated social publishing (LinkedIn API, Instagram API)
**What:** OAuth flows + direct publishing to LinkedIn and Instagram from the job viewer.
**Why:** Currently users copy-paste content manually. Direct publishing eliminates that step.
**Context:** Explicitly out of scope for content creator v1. OAuth flows are a meaningful separate feature.

### TODO-011: Image generation API integration
**What:** Call Midjourney or DALL-E API using the generated image prompts.
**Why:** Pipeline currently generates prompts + SVG placeholders. Actual image generation requires a separate API integration.
**Context:** Deferred from content creator v1 PRD. Separate PRD needed.

### TODO-012: Content scheduling / calendar view
**What:** Schedule generated content for future publishing; calendar view of scheduled posts.
**Context:** Deferred from content creator v1. Requires publishing integrations (TODO-010) first.

### TODO-013: Real-time collaboration on content jobs
**What:** Multiple users can edit/comment on the same content job simultaneously.
**Context:** Deferred from content creator v1. Requires operational transform or CRDT.

### TODO-014: Worker heartbeat to prevent false stale job detection
**What:** content-worker updates `job.updated_at` every 2 minutes during active pipeline run.
**Why:** An 8-minute pipeline can trigger the 15-minute stale job cron near the end of its run if the last DB write was early. Heartbeat prevents false positives.
**Context:** Deferred from content creator Phase 3 Eng Review (E10).

### TODO-015: Firecrawl self-hosted option
**What:** Deploy Firecrawl as a Docker service in docker-compose.kms.yml instead of using cloud API.
**Why:** Cloud API has per-request cost. Self-hosted is free after initial setup.
**Context:** Deferred from content creator v1. Use cloud API first, evaluate cost.

### TODO-016: Migrate content-creator-app POC SQLite data to KMS PostgreSQL
**What:** One-time migration script for any existing POC jobs/outputs.
**Context:** Deferred. POC data is test data only; no production data to migrate.

---

_Last updated: 2026-03-31 — TODO-008 through TODO-016 added from content creator /autoplan Eng Review_
