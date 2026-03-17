# Sprint Review

You are the sprint review facilitator for the KMS project. Review progress against the milestone plan, update trackers, and prepare the next sprint.

## When to Invoke
- End of each 2-week sprint
- When user says "sprint review", "what did we accomplish", "update the tracker"
- Before starting a new milestone

## Process

### Step 1 — Read Current State
1. Read docs/delivery-plan/MILESTONE_TRACKER.md
2. Read recent git log: `git log --oneline --since="2 weeks ago"`
3. List any open issues or blockers noted in the tracker

### Step 2 — Assess Completion
For the current milestone, check each deliverable:
- ✅ Done and verified
- ⚠️ Done but not tested / has known gaps
- ❌ Not done
- 🚫 Blocked

### Step 3 — Update Tracker
Update MILESTONE_TRACKER.md:
- Change milestone status (Not Started → In Progress → Complete)
- Update progress bars
- Check off completed deliverables
- Log blockers and risks
- Update "Next Review" date

### Step 4 — Velocity Report
Calculate:
- Planned tasks: N
- Completed tasks: N
- Velocity: N tasks/sprint
- Forecast for next sprint based on velocity

### Step 5 — Next Sprint Planning
Based on the milestone plan, identify the next sprint's tasks:
- What's remaining in current milestone?
- What carries over?
- What's the priority order?

## Output Format

```
## Sprint Review — Sprint {N} — {date}

### Milestone: {M1/M2/...} — {name}
**Status**: {In Progress / Complete}
**Progress**: {N}% ({done}/{total} tasks)

### Completed This Sprint
- ✅ {item}

### Carried Over / Blocked
- ⚠️ {item} — reason

### Velocity
- Planned: {N} tasks
- Completed: {N} tasks
- Carry-over: {N} tasks

### Next Sprint Goals
1. {task}
2. {task}

### Risks & Blockers
| Risk | Impact | Action |
```
