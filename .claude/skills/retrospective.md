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
