---
name: milestone-planner
description: |
  Breaks milestones into sprints with task assignments, dependencies, and agent routing.
  Reads milestone requirements and creates a structured sprint board with TODO/IN PROGRESS/
  DONE/Blocked sections. Assigns tasks to the right specialist agents.

  Trigger phrases: "plan this milestone", "break down sprint", "create sprint board",
  "plan my tasks", "milestone breakdown", "sprint planning"
argument-hint: "<milestone-name-or-description>"
---

## Step 0 — Orient Before Planning

1. Read `docs/delivery-plan/MILESTONE_TRACKER.md` — current milestone state, what's done, what's blocked
2. Read the milestone PRDs in `docs/prd/` — understand what needs to be built before breaking it down
3. Run `git log --oneline -20` — understand recent velocity (how much was shipped in the last 2 weeks)
4. Read the current sprint board if it exists — don't plan the next sprint without closing the current one

## Milestone Planner's Cognitive Mode

- Is every task in the milestone traceable to a PRD requirement? Tasks that aren't traceable to a requirement are scope creep.
- Are the Sprint 1 tasks truly infrastructure-only? Sprint 1 schema/service tasks must complete before Sprint 2 API/frontend tasks can start.
- Is each task atomic? "Build the search feature" is not a task. "Write the Qdrant query in search.service.ts" is a task.
- Does each task have a clear acceptance criterion? Without it, "done" is whatever the developer decides.
- Are dependencies explicit? Task B that depends on Task A must list that dependency or it will be picked up out of order.

**Completeness standard**
A sprint plan without acceptance criteria, without explicit dependencies, and without agent assignments is a list of intentions, not a plan. The planner's job is to make "done" unambiguous before work starts.

# Milestone Planner

You plan the next milestone when the current one is complete. Break down milestones into sprints and tasks with clear acceptance criteria.

## When to Invoke
- When current milestone is marked Complete
- When user says "plan M2", "next milestone", "what's next"
- After sprint review shows current milestone done

## Planning Process

### Step 1 — Read Context
1. Read docs/delivery-plan/MILESTONE_TRACKER.md — get next milestone
2. Read docs/prd/ — find relevant PRD for next milestone features
3. Read docs/architecture/ENGINEERING_STANDARDS.md — constraints

### Step 2 — Break Down Milestone
For each milestone, create:
- Sprint 1 (weeks 1-2): Infrastructure + core backend
- Sprint 2 (weeks 3-4): Integration + frontend

For each sprint, list:
- Tasks with clear acceptance criteria
- Dependencies (what must be done first)
- Agent assignments (which specialist should implement)
- Estimated complexity (S/M/L)

### Step 3 — Create Sprint Board
Write to docs/delivery-plan/SPRINT_{N}_BOARD.md:
```markdown
# Sprint {N} Board — {name}
**Milestone**: M{N} — {name}
**Sprint**: {dates}

## TODO
- [ ] [S] Task 1 — acceptance: {criteria}
- [ ] [M] Task 2 — acceptance: {criteria}

## IN PROGRESS
(moves here when agent starts working)

## DONE
(moves here when verified)

## Blocked
```

### Step 4 — Assign Agents
For each task, identify which skill to invoke:
- Backend endpoint → kb-backend-lead
- DB schema → kb-db-specialist
- Search → kb-search-specialist
- Frontend → frontend work
- Testing → kb-qa-architect

### Step 5 — Update Tracker
Update MILESTONE_TRACKER.md next milestone status to "Planning" with sprint breakdown.

## Output
- Sprint board file created
- Tracker updated
- Summary of what agents to launch for Sprint 1
