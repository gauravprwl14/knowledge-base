# FOR-gstack-engineering-process.md
# How to Use the KMS gstack Engineering Process

> **Audience**: Any developer working on the knowledge-base repo — solo or with parallel agents.
> **Purpose**: Practical, scenario-driven reference for the 7-stage feature lifecycle, parallel agent workflows, and daily operating habits.
> **TL;DR**: Features flow BACKLOG → PRD_GATE → DESIGN → IMPL → QA → DOD_CHECK → DONE. Every stage has a gate. `/office-hours` starts. `/task-completion-check` ends. Tools, scripts, and hooks keep state across sessions.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [The 7-Stage Lifecycle](#2-the-7-stage-lifecycle)
3. [Scenario A — Full Feature Flow (scan-progress-realtime)](#3-scenario-a--full-feature-flow)
4. [Scenario B — Resume After Interrupted Session](#4-scenario-b--resume-after-interrupted-session)
5. [Scenario C — Resume After Partial Reviews](#5-scenario-c--resume-after-partial-reviews)
6. [Parallel 6-Terminal Architecture](#6-parallel-6-terminal-architecture)
7. [Deterministic Output Patterns](#7-deterministic-output-patterns)
8. [Daily Operating Habits](#8-daily-operating-habits)
9. [Advanced Patterns (Fast Path, Bug Fix, Adding a KB Skill)](#9-advanced-patterns)
10. [FAQ and Anti-Patterns](#10-faq-and-anti-patterns)
11. [Quick Reference Card](#11-quick-reference-card)

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                   KMS gstack Engineering System                      │
│                                                                       │
│  Planning          Tracking         Execution       State             │
│  ─────────         ────────         ─────────       ─────            │
│  /office-hours     FEATURE_REGISTRY  Skills (16)    .gstack-         │
│  /plan-ceo-review  TODOS.md          Worktrees      context.md       │
│  /plan-eng-review  kms-status.sh     Makefile       stop hook        │
│                                                                       │
│  Review            Quality           Docs            Gate             │
│  ──────            ───────           ────            ────            │
│  /review           /qa-only          /document-      pre-push        │
│  /ship             /task-completion  release         PRD checker     │
│                    -check                                             │
└─────────────────────────────────────────────────────────────────────┘
```

### Core Tools at a Glance

| Tool / Script | What It Does | When You Run It |
|---------------|--------------|-----------------|
| `/office-hours` | Reads FEATURE_REGISTRY.md + context, plans the session | Start of every session |
| `make status` | Prints live feature status from registry + worktrees | Morning standup |
| `make standup` | Dumps all .gstack-context.md files — last action per worktree | Morning standup |
| `make setup-hooks` | Installs pre-push PRD quality gate hook | Once per clone |
| `/plan-ceo-review` | CEO-level plan review: scope, ROI, risk | After /office-hours on new feature |
| `/plan-eng-review` | Engineering review: arch, code quality, test | After /plan-ceo-review |
| `/review` | Code review on a completed PR or worktree | Before /ship |
| `/qa-only` | Determinism check — runs tests, lint, coverage | Before /task-completion-check |
| `/task-completion-check` | 10-gate DoD audit | Before every merge |
| `/ship` | Staged merge: review → qa → commit → push | Merging a feature |
| `scripts/write-session-context.sh` | Auto-writes .gstack-context.md (via stop hook) | Automatic on session end |
| `scripts/kms-status.sh` | Parses FEATURE_REGISTRY.md + scans worktrees | Via `make status` |

---

## 2. The 7-Stage Lifecycle

```
  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
  │ BACKLOG  │───▶│ PRD_GATE │───▶│  DESIGN  │───▶│   IMPL   │
  └──────────┘    └──────────┘    └──────────┘    └──────────┘
                       │                                │
                 PRD quality                      Unit tests
                 gate check                      ≥ 80% pass
                 (pre-push)                           │
                                                      ▼
  ┌──────────┐    ┌──────────┐    ┌──────────┐
  │   DONE   │◀───│ DOD_CHECK│◀───│    QA    │
  └──────────┘    └──────────┘    └──────────┘
                       │                │
                 /task-completion   /qa-only
                 -check (10 gates)  /review
```

### Per-Stage Detail

| Stage | Entry Gate | Key Activities | Exit Gate | Skill |
|-------|-----------|----------------|-----------|-------|
| **BACKLOG** | — | Add row to FEATURE_REGISTRY.md | PM approves | — |
| **PRD_GATE** | Feature in registry | Write PRD-{feature}.md from template | PRD has 10 quality items | `/kb-product-manager` |
| **DESIGN** | PRD passes gate | ADR + sequence diagram + API contract | ENG CLEARED in /plan-eng-review | `/kb-architect`, `/kb-api-designer` |
| **IMPL** | Design cleared | Code in worktree, following mandatory patterns | Unit tests ≥ 80%, no `console.log` | `/kb-backend-lead`, `/kb-python-lead` |
| **QA** | Impl complete | /qa-only, /review, integration tests | /qa-only PASS, /review CLEARED | `/kb-qa-architect` |
| **DOD_CHECK** | QA passed | /task-completion-check 10-gate audit | All 10 gates pass | `/task-completion-check` |
| **DONE** | DoD cleared | Update FEATURE_REGISTRY.md, /document-release, merge | Row shows DONE | `/kb-doc-engineer` |

### FEATURE_REGISTRY.md Schema

```
| Feature | PRD | PRD Audit | ADR | Seq Diag | Tests | Status | Worktree | Branch | Notes |
```

- **Status values**: `BACKLOG` | `PRD_GATE` | `DESIGN` | `IMPL` | `QA` | `DOD_CHECK` | `DONE`
- Update the registry every time a feature moves to a new stage
- `make status` reads it and prints a live view

---

## 3. Scenario A — Full Feature Flow

### Feature: `scan-progress-realtime` (WebSocket scan progress)

This walks through the complete 7-stage flow for a new feature from idea to merge.

#### Step 1 — BACKLOG: Add to Registry

Add a row to `FEATURE_REGISTRY.md`:

```markdown
| scan-progress-realtime | — | — | — | — | — | BACKLOG | — | — | WebSocket real-time scan updates |
```

#### Step 2 — PRD_GATE: Write the PRD

```bash
# Start a session and route to product manager
/office-hours "define requirements for scan-progress-realtime"
```

Then invoke the skill directly:
```
/kb-product-manager "write a PRD for scan-progress-realtime: WebSocket endpoint that emits scan job progress events to the frontend in real time"
```

The skill will generate `docs/prd/PRD-scan-progress-realtime.md` following the template. After writing, commit and push — the pre-push hook checks 10 PRD quality items. Fix any FAILs that exceed the 2-item threshold.

Update registry:
```markdown
| scan-progress-realtime | PRD-scan-progress-realtime.md | ✓ | — | — | — | PRD_GATE | — | — | PRD written |
```

#### Step 3 — DESIGN: Architecture + ADR + Sequence Diagram

Run `/plan-ceo-review` first on the feature spec, then `/plan-eng-review` to resolve arch issues.

```
/kb-architect "design scan-progress-realtime: WebSocket gateway in kms-api, scan-worker emits progress events via RabbitMQ, frontend subscribes via socket.io"
```

Outputs expected:
- `docs/architecture/decisions/0009-scan-progress-websocket.md` (ADR)
- `docs/architecture/sequence-diagrams/scan-progress-realtime.md` (sequence diagram)

Update registry:
```markdown
| scan-progress-realtime | PRD-scan-progress-realtime.md | ✓ | 0009 | ✓ | — | DESIGN | — | feat/scan-progress | Design complete |
```

#### Step 4 — IMPL: Create Worktree and Code

```bash
# Create an isolated worktree so main is never blocked
git worktree add .worktrees/scan-progress-realtime feat/scan-progress-realtime

# Open a terminal in it
cd .worktrees/scan-progress-realtime
```

Invoke the implementation skill:
```
/kb-backend-lead "implement scan-progress-realtime: NestJS WebSocket gateway (ScanProgressGateway), subscribe to kms.scan queue events, broadcast to socket room per user_id"
```

The Universal Preamble at the top of every KB skill reads your current branch, diff stat, worktree count, and `.gstack-context.md` — so it has full session context before writing a single line.

Update `.gstack-context.md` (or let the stop hook do it):
```yaml
feature: scan-progress-realtime
status: IMPL
last_action: implemented ScanProgressGateway + unit tests
next_action: run tests, fix coverage gaps
test_status: 12/12 passing, 84% coverage
blockers: none
```

Update registry:
```markdown
| scan-progress-realtime | PRD-scan-progress-realtime.md | ✓ | 0009 | ✓ | 84% | IMPL | .worktrees/scan-progress-realtime | feat/scan-progress | Gateway done |
```

#### Step 5 — QA: Run Quality Checks

```bash
cd kms-api && npm run test          # unit tests
cd kms-api && npm run lint          # lint + fix
```

Then invoke:
```
/qa-only "scan-progress-realtime worktree — run full qa sweep: lint, tests, coverage report"
```

```
/review "review scan-progress-realtime implementation against PRD and ADR"
```

Both must show CLEARED before proceeding.

#### Step 6 — DOD_CHECK: 10-Gate Audit

```
/task-completion-check "scan-progress-realtime"
```

The skill checks all 10 gates:
1. ADR written for non-obvious tech choice
2. Sequence diagram for new cross-service flow
3. Unit tests ≥ 80% coverage + error branches
4. Structured logs on all significant events
5. TSDoc/docstrings on all public exports
6. CONTEXT.md updated for new module
7. No hardcoded secrets or raw PII in logs
8. DB migrations backward-compatible
9. OTel span on all new service methods
10. OpenAPI spec updated for new endpoints

Fix any failures. Re-run until all 10 pass.

#### Step 7 — DONE: Merge and Document

```
/ship "scan-progress-realtime"
/document-release "scan-progress-realtime: WebSocket scan progress for kms-api"
```

Update registry:
```markdown
| scan-progress-realtime | PRD-scan-progress-realtime.md | ✓ | 0009 | ✓ | 84% | DONE | — | main | Merged 2026-03-30 |
```

---

## 4. Scenario B — Resume After Interrupted Session

### Problem: You had to stop mid-IMPL. How do you resume without losing context?

The stop hook automatically writes `.gstack-context.md` when Claude Code stops. Here is how to use it.

#### The .gstack-context.md File

When a session ends in a worktree, Claude Code fires `scripts/write-session-context.sh` via the Stop hook. This writes (or updates):

```yaml
# Session Context — scan-progress-realtime
feature: scan-progress-realtime
branch: feat/scan-progress-realtime
last_session: 2026-03-30 14:22
status: IMPL
last_action: implemented ScanProgressGateway, tests 12/12
next_action: implement frontend socket hook, update CONTEXT.md
test_status: 84% coverage, all passing
blockers: none
```

#### Recovery Decision Tree

```
On session start:
├── Run: make standup
│   └── Reads all .gstack-context.md files across both worktree roots
│
├── Check status field:
│   ├── IMPL → cd to worktree, run /office-hours with context
│   ├── QA   → run /qa-only first, then /review
│   ├── DOD_CHECK → run /task-completion-check
│   └── DESIGN → check if ADR + sequence diagram are both done
│
└── Check blockers field:
    ├── "none" → pick up at next_action
    └── any value → resolve blocker before continuing
```

#### Resume Command Pattern

```bash
# 1. See all active worktrees
make standup

# 2. Navigate to the paused feature
cd .worktrees/scan-progress-realtime

# 3. Start Claude in the worktree directory
# Claude reads .gstack-context.md via the Universal Preamble in every KB skill
/office-hours "resume scan-progress-realtime: last_action was implementing gateway, next is frontend hook"
```

The `/office-hours` skill reads your `.gstack-context.md` and picks up exactly where you left off — no re-explaining the feature, no re-reading PRDs from scratch.

#### What If .gstack-context.md Is Missing?

The file is only written when Claude Code stops cleanly (via the Stop hook). If you force-killed the terminal:

```bash
# Re-create it manually with current state
cat > .gstack-context.md <<EOF
feature: scan-progress-realtime
branch: feat/scan-progress-realtime
last_session: $(date '+%Y-%m-%d %H:%M')
status: IMPL
last_action: gateway implemented, tests passing
next_action: frontend socket hook
test_status: 84%
blockers: none
EOF
```

---

## 5. Scenario C — Resume After Partial Reviews

### Problem: /plan-eng-review found issues. Some are CLEARED. Some are NOT CLEARED. How do you pick up?

#### Reading Review State

After running `/plan-eng-review`, the review report contains a CLEARED/NOT CLEARED section per issue group:

```
## Architecture Issues
Issue 1: settings.json uses relative path → NOT CLEARED
Issue 2: pre-push uses wrong diff method → NOT CLEARED

## Code Quality Issues
Issue 3: FEATURE_REGISTRY.md has 6 columns not 10 → CLEARED

## Test Issues
Issue 4: No unit tests for kms-status.sh → NOT CLEARED
```

#### Resume Protocol

1. Find the first NOT CLEARED issue
2. Apply the fix (read the file, understand root cause, apply minimal change)
3. Run verification (bash -n for shell scripts, tsc --noEmit for TS, pytest for Python)
4. State: "Root cause: [X]. Fix applied: [Y]. Verified by: [Z]."
5. Mark CLEARED
6. Move to next NOT CLEARED issue
7. After all CLEARED → re-run `/plan-eng-review` on fixed code for final sign-off

#### Example: Not Cleared Due to Relative Path

```
NOT CLEARED: settings.json — command uses relative path "bash scripts/write-session-context.sh"
Root cause: Claude Code fires the Stop hook from the Claude process cwd, which may be
a worktree directory (e.g. .claude/worktrees/agent-abc123/) — not the repo root.
The relative path resolves to a non-existent location and silently fails.
Fix: Use absolute path with ~ expansion: "bash ~/Sites/projects/gp/knowledge-base/scripts/write-session-context.sh"
Regression surface: Only settings.json command field. No other files affected.
```

After fixing, state: "CLEARED: settings.json now uses absolute path. Verified by reading the file."

---

## 6. Parallel 6-Terminal Architecture

### The Layout

For large features touching ≥ 2 services, run 6 terminals simultaneously:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     6-Terminal Parallel Session Layout                       │
├──────────────────────────┬──────────────────────────┬───────────────────────┤
│  T1: COORDINATOR (main)  │  T2: BACKEND WORKER      │  T3: PYTHON WORKER   │
│  /home/.../knowledge-base│  .worktrees/feat-api/    │  .worktrees/feat-py/ │
│                          │                          │                       │
│  Role: route + merge     │  Role: NestJS impl       │  Role: FastAPI/worker │
│  Branch: main (read)     │  Branch: feat/api        │  Branch: feat/py      │
│  Skills: /coordinate     │  Skills: /kb-backend-lead│  Skills: /kb-python-  │
│          /office-hours   │          /kb-api-designer│          lead         │
├──────────────────────────┼──────────────────────────┼───────────────────────┤
│  T4: FRONTEND WORKER     │  T5: QA OBSERVER         │  T6: DOCS/AUDIT      │
│  .worktrees/feat-ui/     │  (main — READ ONLY)      │  .worktrees/feat-doc/ │
│                          │                          │                       │
│  Role: React/Next.js     │  Role: continuous test   │  Role: CONTEXT.md,   │
│  Branch: feat/ui         │  Branch: main (read)     │  ADR, FOR-*.md        │
│  Skills: (frontend)      │  Skills: /qa-only        │  Skills: /kb-doc-     │
│                          │          /review          │  engineer            │
└──────────────────────────┴──────────────────────────┴───────────────────────┘
```

### Non-Conflict Rules

These rules prevent merge conflicts when parallel agents work simultaneously:

| Rule | Why |
|------|-----|
| T1 never writes to feature worktrees | It only merges outputs |
| T2–T4 each own exactly one worktree | No two agents touch the same worktree |
| T5 only reads — never commits | Test runs don't create state |
| T6 writes only to docs/ | Code files are T2/T3/T4 territory |
| DB migrations: T2 only | Never split migration files across agents |
| Shared types (`@kb/contracts`): T1 coordinates | T2/T3 both need types — T1 proposes, others consume |

### Parallel Session Startup

```bash
# Terminal 1 — Coordinator (main worktree)
cd ~/Sites/projects/gp/knowledge-base
make status
/office-hours "build scan-progress-realtime: needs backend gateway, frontend hook, and docs"

# Terminal 2 — Backend Worker
cd ~/Sites/projects/gp/knowledge-base
git worktree add .worktrees/scan-progress-api feat/scan-progress-api
cd .worktrees/scan-progress-api
/kb-backend-lead "implement ScanProgressGateway in kms-api"

# Terminal 3 — Python Worker (if scan-worker changes needed)
cd ~/Sites/projects/gp/knowledge-base
git worktree add .worktrees/scan-progress-worker feat/scan-progress-worker
cd .worktrees/scan-progress-worker
/kb-python-lead "update scan-worker to emit progress events to kms.scan.progress queue"

# Terminal 4 — Frontend Worker
cd ~/Sites/projects/gp/knowledge-base
git worktree add .worktrees/scan-progress-ui feat/scan-progress-ui
cd .worktrees/scan-progress-ui
# Frontend skill invocation

# Terminal 5 — QA Observer (stays in main, reads only)
cd ~/Sites/projects/gp/knowledge-base
# After T2 and T3 signal done:
/qa-only "review T2 and T3 outputs for scan-progress-realtime"

# Terminal 6 — Docs/Audit
cd ~/Sites/projects/gp/knowledge-base
git worktree add .worktrees/scan-progress-docs feat/scan-progress-docs
cd .worktrees/scan-progress-docs
/kb-doc-engineer "update CONTEXT.md files for scan-progress gateway, update FOR-nestjs-patterns.md with WebSocket example"
```

### Capacity Scaling

| Feature Scope | Terminals Needed | Agent Assignment |
|---------------|-----------------|-----------------|
| Single-service NestJS change | 2 | T1 coordinate + T2 backend |
| NestJS + Python worker | 3 | T1 + T2 backend + T3 python |
| Full-stack (API + worker + UI) | 4 | T1 + T2 + T3 + T4 frontend |
| Full-stack + QA + docs | 6 | All 6 terminals |
| Bug fix (single file) | 1 | Direct specialist, no worktree needed |

### While-You-Wait Optimization

When waiting for a slow agent to finish, use the idle time:

```
T2 running (implementing gateway)...
                │
                ├── T6: Write ADR 0009 for WebSocket gateway choice
                ├── T6: Update CONTEXT.md for scan module
                ├── T5: Write integration test skeletons
                └── T1: Plan the merge sequence and conflict resolution order
```

```
Timeline:
0 min  ├── T1: /office-hours, T2: start impl, T3: start worker, T6: start docs
15 min ├── T6: ADR done → T1 reviews ADR
30 min ├── T3: worker done → T5: /qa-only on worker
45 min ├── T2: backend done → T5: /qa-only on backend
50 min ├── T1: merge worker branch → T1: merge backend branch
55 min ├── T4: frontend starts (depends on gateway being merged)
75 min └── T5: /task-completion-check on full feature
```

---

## 7. Deterministic Output Patterns

### PRD as Test Specification

Every PRD you write **is** your test spec. The KB skills enforce this pattern:

A well-formed PRD section maps directly to test cases:

```markdown
## User Stories
As a developer, I want to see real-time scan progress, so that I don't poll the API manually.

## Happy Path
1. User triggers scan → scan-worker emits kms.scan.progress event → WebSocket gateway
   broadcasts to user's room → frontend updates progress bar

## Error Flows
- scan-worker crashes mid-scan → last progress state preserved → frontend shows "Scan interrupted"
- WebSocket connection dropped → client auto-reconnects → receives missed events on reconnect

## Edge Cases
- Concurrent scans by same user → each scan has unique job_id → routed to same room, separate events
- Empty source (0 files) → progress 0→100 immediately → frontend handles gracefully
```

These sections become:
- `describe('ScanProgressGateway happy path')` — from Happy Path
- `describe('ScanProgressGateway error flows')` — from Error Flows
- `describe('ScanProgressGateway edge cases')` — from Edge Cases

### Template Prompt for PRD-as-Spec

When invoking `/kb-qa-architect`, give it the PRD section directly:

```
/kb-qa-architect "write tests for scan-progress-realtime.
Happy path: [paste PRD happy path].
Error flows: [paste PRD error flows].
Edge cases: [paste PRD edge cases].
Coverage target: 80% minimum."
```

### The /qa-only Determinism Check

`/qa-only` is not just tests — it is the determinism check that ensures two runs of your code produce the same output. After every IMPL milestone, run:

```
/qa-only "scan-progress-realtime: run all tests, lint, check for console.log usage, verify OTel spans are named, coverage report"
```

Expected output format from `/qa-only`:
```
PASS  src/scan-progress/scan-progress.gateway.spec.ts (12 tests)
PASS  src/scan-progress/scan-progress.service.spec.ts (8 tests)
Coverage: 84.3% statements, 81.2% branches
Lint: 0 errors, 0 warnings
console.log: 0 occurrences (grep clean)
OTel spans: ScanProgressGateway.handleScanEvent ✓, ScanProgressService.broadcast ✓
STATUS: PASS
```

If STATUS is not PASS, fix before moving to DOD_CHECK.

### T5 Continuous Testing Loop

In a 6-terminal session, T5 runs a continuous feedback loop while T2/T3/T4 implement:

```bash
# T5 continuous loop (run every ~15 minutes)
while true; do
  echo "=== QA sweep $(date) ===" >> /tmp/qa-log.txt
  cd ~/Sites/projects/gp/knowledge-base
  # Watch for new test files in active worktrees
  for worktree in .worktrees/*/; do
    if [ -f "${worktree}/.gstack-context.md" ]; then
      status=$(grep '^status:' "${worktree}/.gstack-context.md" | awk '{print $2}')
      if [ "$status" = "IMPL" ]; then
        echo "Watching ${worktree}..." >> /tmp/qa-log.txt
      fi
    fi
  done
  sleep 900  # 15 min
done
```

T5 does not write to worktrees. It only reads, runs tests, and reports findings to T1 (coordinator).

---

## 8. Daily Operating Habits

### Weekday Session (2 hours)

```
00:00 — make standup
        → See all active features and their last_action
        → Identify blockers from .gstack-context.md files

00:05 — /office-hours "resume [feature-name]: last was [last_action], next is [next_action]"
        → Let /office-hours create the session plan

00:15 — Start implementation on the single most important task
        → One worktree, one focus — no context switching until done

01:30 — Run /qa-only on what was built
        → Fix any failures (tests, lint, coverage gaps)

01:50 — Update FEATURE_REGISTRY.md row with new status
        → Update .gstack-context.md next_action field manually if needed

02:00 — Close Claude. Stop hook auto-writes .gstack-context.md.
```

### Weekend Session (6 hours)

```
00:00 — make status + make standup (full picture)
00:10 — /office-hours (plan the 6-hour sprint)
00:20 — If feature is in DESIGN: run /plan-ceo-review → /plan-eng-review
00:45 — If cleared, move to IMPL with parallel worktrees (T1-T4)
02:30 — First QA sweep with T5 (/qa-only on each worktree)
03:00 — Fix issues, re-run qa-only
04:00 — /review (code review of full feature)
04:30 — /task-completion-check (DoD audit)
05:00 — Fix any DoD gaps
05:30 — /ship (merge to main)
05:45 — /document-release + update FEATURE_REGISTRY.md
06:00 — make status → confirm feature is DONE
```

### Morning Standup Command Output

```bash
make standup
```

Expected output:

```
=== KMS Morning Standup ===

Active Worktrees:
────────────────────────────────────────────────────────
Worktree: .worktrees/scan-progress-realtime
  feature:     scan-progress-realtime
  branch:      feat/scan-progress-realtime
  last_session: 2026-03-29 16:45
  status:      IMPL
  last_action: ScanProgressGateway implemented, 12/12 tests passing
  next_action: update CONTEXT.md, run /task-completion-check
  test_status: 84% coverage
  blockers:    none

Worktree: .worktrees/graph-export
  feature:     graph-export
  branch:      feat/graph-export
  last_session: 2026-03-28 11:30
  status:      DESIGN
  last_action: ADR 0008 written
  next_action: write sequence diagram
  test_status: unknown
  blockers:    none
────────────────────────────────────────────────────────
```

### Keeping FEATURE_REGISTRY.md Current

The registry is your ground truth. Update it whenever:
- A feature changes stage (IMPL → QA)
- A worktree is created or deleted
- Tests go from unknown to a real coverage number
- A feature merges (status → DONE, worktree → —)

Don't batch updates. Update immediately when state changes so `make status` is always accurate.

---

## 9. Advanced Patterns

### Scenario D — Fast Path (Skip Some Stages)

**When**: Bug fix or minor enhancement (≤ 50 lines, single file, no new endpoints)

**Skip criteria** — ALL must be true:
- No new API endpoints or DB schema changes
- No new cross-service data flows
- The change is in a single service/module
- PR is ≤ 50 lines changed

**Fast path**:
```
Skip PRD_GATE → write a 1-paragraph "mini-PRD" comment in the issue/PR
Skip ADR      → comment explaining the choice (no new technology decisions)
Skip DESIGN   → go directly to IMPL in main worktree (no separate worktree needed)
Run QA        → /qa-only is NOT skipped, always run it
Run DOD_CHECK → /task-completion-check is NOT skipped, always run it
```

**Anti-pattern**: Using fast path for "small features" that actually touch 3 files across 2 services. Fast path is for true single-file fixes only.

### Scenario E — PRD Audit Sprint

**When**: Multiple PRDs exist but were written before the pre-push hook. Quality is unknown.

```bash
# Check all PRDs at once
for prd in docs/prd/PRD-*.md; do
  echo "=== $prd ==="
  bash scripts/hooks/pre-push <<< "refs/heads/dev abc123 refs/heads/origin/dev 0000000000000000000000000000000000000000"
done
```

Or invoke the skill:
```
/kb-product-manager "audit all PRDs in docs/prd/ against the 10-item quality checklist. List failures per file."
```

Fix PRDs with ≥ 3 failures first. PRDs with 1-2 failures are low priority.

### Scenario F — Bug Fix Flow

```
1. Read the error — full stack trace or API response body (never assume)
2. Trace the call path: frontend → nginx → API → service → DB/queue
3. State root cause: "Root cause: [X]. Evidence: file:line. Fix: [minimal change]."
4. Regression surface: "Affects [Y]. Will not break [Z] because [reason]."
5. Write regression test BEFORE applying the fix
6. Apply the fix
7. Run: npm run test (or pytest)
8. Verify in Grafana: trace shows no error spans
9. Fast path if single-file, else standard IMPL → QA → DOD_CHECK → DONE
```

Example root cause statement:
```
Root cause: ValidationPipe is not registered globally in main.ts, so @IsIn() decorators
on CreateFileDto are never applied. Evidence: kms-api/src/main.ts:22 — useGlobalPipes()
call is absent. Fix: Add app.useGlobalPipes(new ValidationPipe({ transform: true })) after
app.register(fastifyHelmet).
Regression surface: All endpoints that use DTOs with class-validator decorators.
Will not break existing behavior because ValidationPipe with whitelist:false does not
strip unknown properties unless whitelist:true is also set.
```

### Scenario G — Adding a New KB Skill

When adding a new agent skill to `docs/agents/`:

1. Create the file in the appropriate group directory (`backend/`, `domain/`, etc.)
2. Add the Universal Preamble at the top (4 bash commands block)
3. Add Completeness Principle and Decision Format sections at the end
4. Add the skill to the routing table in `docs/agents/CLAUDE.md`
5. Add the skill to the Skill Registry table in the root `CLAUDE.md`
6. Update the group's `CONTEXT.md`
7. Run `/kb-doc-engineer "update skill index after adding [skill-name]"`

---

## 10. FAQ and Anti-Patterns

### FAQ

**Q: When do I create a worktree vs. work in main?**
A: Create a worktree whenever the feature will take > 1 session to complete, or when you need to work in parallel with another agent. Bug fixes and doc-only changes can stay in main.

**Q: Does /office-hours automatically read .gstack-context.md?**
A: Every KB skill has a Universal Preamble that reads `cat .gstack-context.md 2>/dev/null`. So yes — if you run `/office-hours` from within a worktree that has a context file, it reads it automatically.

**Q: Can I run /task-completion-check before QA?**
A: Technically yes, but DoD gate 3 (≥ 80% test coverage) will fail if /qa-only hasn't been run. Run QA first.

**Q: What if the pre-push hook blocks my push?**
A: Check which PRD items failed. The hook lists them. Either fix the PRD (add the missing sections) or set `BLOCKING_MODE=false` temporarily (it defaults to false in Sprint 1). Never bypass with `--no-verify` without explicitly confirming with the user.

**Q: How do I know if a review is CLEARED?**
A: The `/review` and `/plan-eng-review` skills explicitly print a CLEARED or NOT CLEARED verdict for each issue group. Look for the section header `## Review Status` or `## Engineering Clearance`.

**Q: make status shows a feature as IMPL but I merged it. What happened?**
A: You forgot to update `FEATURE_REGISTRY.md` after merging. Edit the row: set Status to DONE, Worktree to `—`, and add the merge date to Notes.

**Q: What's the difference between /review and /qa-only?**
A: `/qa-only` is automated (tests, lint, coverage). `/review` is a code quality judgment (architecture, patterns, security, readability). Both must pass before DOD_CHECK.

**Q: My .gstack-context.md has stale data from 3 days ago. Should I trust it?**
A: Use it as a starting point, then verify with `git log --oneline -10` and `git diff --stat HEAD~5` to see what actually changed since then.

**Q: Can multiple features share a worktree?**
A: No. One feature per worktree, always. Mixing features in one worktree makes the context file ambiguous and makes /task-completion-check unreliable.

**Q: When should I invoke /coordinate vs. a specialist directly?**
A: Invoke `/kb-coordinate` (or `/coordinate`) when: (a) you're not sure which specialist to use, (b) the feature touches ≥ 2 service domains, or (c) you need a sequenced plan before starting. Go direct to a specialist for clear, single-domain tasks.

**Q: Do I need to run /plan-ceo-review and /plan-eng-review for every feature?**
A: For features in DESIGN stage: yes, both. For fast-path bug fixes: skip both. For medium features (new endpoint, no new service): /plan-eng-review only.

**Q: The stop hook isn't writing .gstack-context.md. Why?**
A: The hook has a 5-minute rate limit (skips writes if file was updated <5 min ago) and skips the main worktree root. Check: (1) are you in a worktree subdirectory, not main? (2) has it been > 5 min since the last write? (3) does `~/.claude/settings.json` or `.claude/settings.json` have the Stop hook configured with the absolute path?

### Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Pattern |
|--------------|----------------|-----------------|
| Jump to code before PRD | You'll build the wrong thing | Write PRD first, get it through the quality gate |
| Work in main branch for multi-session features | Unfinished work blocks everyone | Create a worktree for any multi-session feature |
| Use `console.log` for debugging | It stays in the codebase, fails the DoD lint gate | Use `@InjectPinoLogger` (NestJS) or `structlog` (Python) |
| Merge without running /task-completion-check | Silent DoD failures ship to production | Always DoD check before merge |
| Update FEATURE_REGISTRY.md at the end of the sprint | Registry goes stale, `make status` is misleading | Update immediately when stage changes |
| Run /qa-only only at the end | Bugs accumulate; fixing is harder | Run /qa-only after each IMPL milestone |
| Skip ADR for "obvious" decisions | "Obvious" decisions cause the most debates 6 months later | When in doubt, write the ADR |
| Use a general agent for a specialist task | Lower quality output | Always use the most specific KB skill |
| Work across 2 worktrees in the same session without T1 coordinating | Merge conflicts, duplicated effort | T1 coordinates; T2/T3 never touch each other's worktree |
| Commit all changes in one giant commit | Hard to review, impossible to revert | Commit per logical unit: ADR, migration, service, tests separately |

---

## 11. Quick Reference Card

```
╔══════════════════════════════════════════════════════════════════════════╗
║               KMS gstack Engineering Process — Quick Reference           ║
╠══════════════════════════════════════════════════════════════════════════╣
║  STAGE FLOW                                                              ║
║  BACKLOG → PRD_GATE → DESIGN → IMPL → QA → DOD_CHECK → DONE            ║
╠══════════════════════════════════════════════════════════════════════════╣
║  SESSION START COMMANDS                                                  ║
║  make standup          # See all worktree states                        ║
║  make status           # Parse FEATURE_REGISTRY.md                     ║
║  /office-hours "..."   # Plan the session                               ║
╠══════════════════════════════════════════════════════════════════════════╣
║  STAGE SKILLS                                                            ║
║  PRD_GATE  → /kb-product-manager                                        ║
║  DESIGN    → /kb-architect + /kb-api-designer                           ║
║  IMPL      → /kb-backend-lead | /kb-python-lead                         ║
║  QA        → /qa-only + /review                                         ║
║  DOD_CHECK → /task-completion-check                                     ║
║  DONE      → /ship + /document-release                                  ║
╠══════════════════════════════════════════════════════════════════════════╣
║  WORKTREE COMMANDS                                                       ║
║  git worktree add .worktrees/feat-name feat/feat-name                   ║
║  git worktree list                                                       ║
║  git worktree remove .worktrees/feat-name                               ║
╠══════════════════════════════════════════════════════════════════════════╣
║  PARALLEL TERMINAL ROLES                                                 ║
║  T1: Coordinator (main, read-only)                                       ║
║  T2: Backend worker (.worktrees/feat-api)                               ║
║  T3: Python worker (.worktrees/feat-py)                                 ║
║  T4: Frontend worker (.worktrees/feat-ui)                               ║
║  T5: QA observer (main, read-only)                                       ║
║  T6: Docs/audit (.worktrees/feat-docs)                                  ║
╠══════════════════════════════════════════════════════════════════════════╣
║  ROOT CAUSE FORMAT (required before any fix)                            ║
║  "Root cause: [X]. Evidence: [file:line]. Fix: [Y]."                   ║
║  "Regression surface: [paths]. Won't break [Z] because [reason]."      ║
╠══════════════════════════════════════════════════════════════════════════╣
║  DoD GATES (all 10 must pass before merge)                              ║
║  1. ADR for non-obvious tech choice                                     ║
║  2. Sequence diagram for cross-service flow                             ║
║  3. Unit tests ≥ 80% coverage + error branches                         ║
║  4. Structured logs (no console.log / print)                            ║
║  5. TSDoc/docstrings on all public exports                              ║
║  6. CONTEXT.md updated for new module                                   ║
║  7. No hardcoded secrets or raw PII in logs                             ║
║  8. DB migrations backward-compatible                                   ║
║  9. OTel span on all new service methods                                ║
║  10. OpenAPI spec updated for new endpoints                             ║
╠══════════════════════════════════════════════════════════════════════════╣
║  FAST PATH (bug fix / single-file only)                                 ║
║  Skip: PRD_GATE, ADR, DESIGN, worktree creation                        ║
║  Never skip: /qa-only, /task-completion-check                           ║
╠══════════════════════════════════════════════════════════════════════════╣
║  ERROR PATTERNS (never use these)                                       ║
║  ✗ console.log / print                                                  ║
║  ✗ Hardcoded secrets                                                    ║
║  ✗ Raw HttpException (use AppException + KB error code)                 ║
║  ✗ "Something went wrong" (show real API error message)                 ║
║  ✗ new Logger() in NestJS (use @InjectPinoLogger)                      ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## Related Files

| File | Purpose |
|------|---------|
| `FEATURE_REGISTRY.md` | Live feature status tracker |
| `TODOS.md` | Known improvements to this system |
| `Makefile` | `make status`, `make standup`, `make setup-hooks` |
| `scripts/kms-status.sh` | Parses registry + scans worktrees |
| `scripts/write-session-context.sh` | Auto-writes .gstack-context.md on session end |
| `scripts/hooks/pre-push` | PRD quality gate (10-item checklist) |
| `.claude/settings.json` | Stop hook configuration |
| `docs/agents/CLAUDE.md` | Agent routing table |
| `docs/workflow/ENGINEERING_WORKFLOW.md` | Full engineering workflow |
| `docs/workflow/DEFINITION-OF-DONE.md` | Complete 10-gate DoD checklist |
