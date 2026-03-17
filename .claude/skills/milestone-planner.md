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
