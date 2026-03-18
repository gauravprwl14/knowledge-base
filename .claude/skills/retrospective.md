---
name: retrospective
description: |
  Facilitates sprint retrospectives using the 4Ls framework (Liked, Lacked, Learned,
  Longed For). Identifies process improvements, missing skills, standards violations,
  and tooling gaps. Updates ENGINEERING_STANDARDS.md and engineering-flow-reviewer
  based on findings.

  Trigger phrases: "sprint retrospective", "retro", "what went well",
  "4Ls retrospective", "end of sprint review", "team retrospective"
argument-hint: "<sprint-name-or-number>"
---

## Step 0 — Orient Before Running Retro

1. Run `git log --oneline --since="2 weeks ago"` — see what was actually shipped (not what was planned)
2. Read the last sprint board — compare planned vs delivered
3. Read `ENGINEERING_STANDARDS.md` — check if any standards were added/changed based on last retro's findings
4. Read the last retrospective output if it exists — track whether previous process improvements were implemented

## Retrospective Facilitator's Cognitive Mode

- Is the "Lacked" section specific? "Better communication" is not actionable. "We need a PR review SLA of 24 hours" is actionable.
- Does every "Learned" have a corresponding process change? Learnings without process changes repeat as problems in the next sprint.
- Does the "Longed For" list become a backlog item? Things the team wishes existed should be tracked, not just expressed.
- Are the same items appearing in consecutive retros? Recurring items mean the process change from last retro wasn't actually implemented.

**Completeness standard**
A retro that produces feelings but no action items is a venting session, not a retrospective. Every retro must end with: (1) at least one concrete process change, (2) an owner for each change, (3) a verification step in the next retro.

# Sprint Retrospective

You facilitate sprint retrospectives for the KMS project. Analyze what happened, identify patterns, and suggest process improvements.

## When to Invoke
- After milestone completion
- When user says "retro", "retrospective", "what went wrong", "lessons learned"

## Retrospective Format (4Ls)

### Liked — What worked well?
Read recent git history and identify:
- Fast parallel execution (agents)
- Good patterns established
- Standards followed well

### Lacked — What was missing?
- Missing skills that had to be built manually
- Standards violations found in code review
- Documentation that was missing

### Learned — New insights
- Technical discoveries
- Process improvements
- Tool capabilities discovered

### Longed For — What do we wish we had?
- Skills not yet created
- Automations not in place
- Better tooling

## Process Improvements Output
For each issue found, create a concrete action:
- If a skill is missing → create it
- If a standard was violated repeatedly → add it to engineering-flow-reviewer checklist
- If a task was manual but could be automated → create an agent for it
- If documentation was missing → add it to the workflow gate

## Update
After retro, update:
- ENGINEERING_STANDARDS.md (if new standards emerged)
- engineering-flow-reviewer.md checklist (add new checks)
- MILESTONE_TRACKER.md (log retro findings in Notes section)
