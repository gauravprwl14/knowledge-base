---
name: sprint-review
description: |
  Facilitates sprint reviews with delivery assessment, velocity tracking, and milestone
  status updates. Reads git history and milestone tracker, assesses completion per
  deliverable, updates milestone tracker, calculates velocity, and identifies next sprint tasks.

  Trigger phrases: "sprint review", "assess sprint progress", "milestone status",
  "velocity report", "what did we complete this sprint", "sprint assessment"
argument-hint: "<sprint-name-or-milestone>"
---

## Step 0 — Orient Before Reviewing Sprint

1. Run `git log --oneline --since="2 weeks ago"` — the commit log is the authoritative record of what was done
2. Read the sprint board — compare committed tasks to git history
3. Read the milestone tracker — understand overall milestone progress, not just sprint progress
4. Count merged PRs vs opened PRs — the PR backlog tells you about WIP discipline

## Sprint Reviewer's Cognitive Mode

- Is velocity calculated from merged code, not from "in progress" tasks? A task that's 90% done delivers 0% of its value.
- Are carryover tasks flagged explicitly? A task that appears on three consecutive sprint boards is a risk, not normal WIP.
- Is the milestone forecast honest? If the team is 40% through M2 at the midpoint, the forecast is "on track". If they're 20% through, it's "at risk" — say so.
- Does the next sprint commitment account for carryovers? New commitments without subtracting carryovers always produce over-commitment.

**Completeness standard**
A sprint review that reports velocity without distinguishing completed-and-merged from completed-and-unmerged is measuring the wrong thing. Ship date is determined by what's merged, not what's "done".

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
