# Gap Analysis: KMS Agent System vs. gstack Reference System

**Document Type:** Competitive Gap Analysis
**Author:** Senior AI Systems Architect
**Date:** 2026-03-19
**Status:** Accepted — Engineering Action Required
**Audience:** Engineering Team (all members)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Feature Comparison Matrix](#2-feature-comparison-matrix)
3. [Critical Gaps — P0 (Must Fix)](#3-critical-gaps--p0-must-fix)
4. [High Priority Gaps — P1 (Should Fix)](#4-high-priority-gaps--p1-should-fix)
5. [Nice to Have — P2](#5-nice-to-have--p2)
6. [Implementation Roadmap](#6-implementation-roadmap)
7. [Quick Wins (Under 1 Day Each)](#7-quick-wins-under-1-day-each)
8. [Patterns We Must Always Follow Going Forward](#8-patterns-we-must-always-follow-going-forward)

---

## 1. Executive Summary

The KMS agent system is a well-structured, domain-rich skill framework with 26 skills covering 7 specialist groups, deep NestJS and Python domain knowledge (400–800 lines per skill), a 3-layer documentation system, and a rigorous 10-gate Definition of Done checklist. It solves the problem of routing AI assistance to the right specialist for a known, classified problem type. These are real strengths and should not be undervalued.

However, when compared to gstack — a reference-class AI-assisted engineering system — the KMS system is missing a layer that could be called **session intelligence**: the ability for every agent interaction to self-orient using live system state (git diff, branch, scope), apply consistent cognitive frameworks regardless of which skill was invoked, self-repair mechanical issues without asking, and continuously improve through feedback. gstack treats the AI context window as a first-class engineering resource with predictable input conditioning, whereas KMS treats it as an implicit "the model knows the project." That assumption breaks down in long sessions, ambiguous handoffs, and novel problem types.

The most consequential gaps are: (1) the absence of a Universal Preamble — every skill starts cold with no awareness of current branch, uncommitted changes, or session context; (2) no Completeness Philosophy ("Boil the Lake") — agents routinely stop at 70% of a solution because no explicit instruction tells them to do the complete version when the marginal cost is low; (3) no Fix-First Workflow — mechanical issues (import order, lint violations, missing semicolons) generate clarifying questions instead of silent fixes, burning context and developer patience; and (4) no Scope Drift Detection — an agent can be asked to "fix the search bug" and silently refactor three unrelated modules with no alarm raised.

The good news: 11 of the 18 gaps identified can be closed in under two weeks of engineering effort, most of them through additions to existing files rather than rewrites. The KMS system's deep domain knowledge and artifact templates are already class-leading; what it needs is a behavioral and metacognitive layer on top of that domain expertise. This document provides the specific, file-level actions needed to achieve that.

---

## 2. Feature Comparison Matrix

| Feature | gstack | KMS | Gap Priority |
|---------|--------|-----|-------------|
| Universal Preamble (git context + session state on every invocation) | Yes — compiled into every SKILL.md | No — each skill starts cold | **P0** |
| Completeness Philosophy ("Boil the Lake" — do full version when cost delta < 5%) | Yes — embedded in every skill | No — agents stop at MVP | **P0** |
| Structured Decision Format (Re-ground → ELI16 → Recommend with score → Options) | Yes — consistent across all skills | No — ad-hoc recommendation style | **P0** |
| Fix-First Workflow (auto-fix mechanical issues, batch complex decisions) | Yes — autonomous, no questions | No — always asks before fixing | **P0** |
| Scope Drift Detection (compare stated intent vs actual diff before committing) | Yes — pre-commit gate | No | **P0** |
| Code Review Checklists (80-item equivalent, per-language) | Yes — enum completeness, SQL safety, race conditions | No — DoD checklist is change-gated, not review-gated | **P0** |
| Skill versioning (semver on each skill file) | Yes | No | **P1** |
| Cognitive Modes embedded in skills (CEO thinking, designer thinking patterns) | Yes — 18 CEO + 12 designer patterns | No | **P1** |
| Session Awareness (tracks open windows, activates ELI16 mode at 3+ windows) | Yes | No | **P1** |
| Diff-based Test Selection (3 tiers: free / ~$3.85 / ~$0.15) | Yes — only runs affected tests | No — always runs full suite | **P1** |
| LLM-as-judge Evaluation (Tier 3 quality gate) | Yes | No | **P1** |
| Dependency Declarations between skills | Yes — explicit skill dependency graph | No — implied via routing table only | **P1** |
| 6 informal skills formalized with full SKILL.md structure | N/A | No — `task-completion-check`, `sync-docs`, `onboard`, `new-feature-guide`, `lint-docs`, `plan` are undocumented | **P1** |
| Auto-generated skill docs from source (SKILL.md.tmpl → compiled SKILL.md) | Yes — single source of truth | No — hand-maintained, drift-prone | **P2** |
| Contributor Feedback Loop (self-improving skill quality) | Yes | No | **P2** |
| E2E testing via `claude -p` subprocess | Yes | No | **P2** |
| Browser automation for QA (persistent Chromium daemon, 100ms/cmd) | Yes | No | **P2** |
| Skill Health Monitoring (staleness detection, usage tracking) | Yes | No | **P2** |
| Deep domain expertise (400–800 lines per skill) | Moderate | Yes — class-leading | Advantage: KMS |
| 3-layer documentation (CLAUDE.md / CONTEXT.md / FOR-*.md) | No equivalent | Yes — well-structured | Advantage: KMS |
| Artifact templates (ADR, BRD, HLD, API Contract, Test Strategy) | No equivalent | Yes — comprehensive | Advantage: KMS |
| Multi-level routing (3 routing tables: CLAUDE.md + agents/CLAUDE.md + coordinator) | Single global routing | Yes — tiered routing | Advantage: KMS |
| Protected utility skills (DoD, sync-docs, onboard) | No | Yes | Advantage: KMS |

---

## 3. Critical Gaps — P0 (Must Fix)

These gaps directly reduce the quality and reliability of every agent interaction. Fixing them yields the highest return per engineering hour.

---

### P0-1: No Universal Preamble

**What gstack does:** Every skill file begins with a compiled preamble block that loads: current branch name, last 5 commit messages, any uncommitted diff (summarized), active session window count, and a version check against a known skill schema version. This conditions the model's context before any domain reasoning begins.

**What KMS does:** Every skill starts with a persona description and domain context. There is no mechanism to automatically inject live repository state. An agent asked to "add a NestJS endpoint" has no idea whether the branch already has a partial implementation, whether a migration is pending, or whether the project is mid-sprint or mid-hotfix.

**Impact:** Agents give recommendations that conflict with in-progress work. They suggest creating files that already exist. They miss that a migration was already generated and just needs to be run.

**Fix — Specific and Actionable:**

1. Create `/Users/gauravporwal/Sites/projects/gp/knowledge-base/docs/agents/shared/preamble.md` with a reusable preamble block.
2. Add a `## Universal Preamble` section to the top of every skill file in `docs/agents/backend/`, `docs/agents/quality/`, `docs/agents/domain/`, `docs/agents/architecture/`, `docs/agents/devops/`, `docs/agents/delivery/`, and `docs/agents/orchestrator/`.
3. The preamble block must instruct the model to execute these steps silently before any domain reasoning:
   - Run `git branch --show-current` — confirm target branch.
   - Run `git diff --stat HEAD` — identify files with uncommitted changes.
   - Run `git log --oneline -5` — orient to recent work context.
   - Check `.kms/config.json` — confirm active feature flags.
   - If uncommitted changes touch the same domain as the current task, surface a conflict warning before proceeding.
4. The preamble must NOT ask the user for any of this information — it auto-loads silently.

**Effort:** 4 hours (template creation + propagation to all 14 skill files)

---

### P0-2: No Completeness Philosophy

**What gstack does:** Every skill includes an explicit "Boil the Lake" instruction: when generating a solution, estimate whether the complete version costs less than 5% more tokens than the partial version. If yes, always do the complete version. No stub methods. No "TODO: implement this". No "you can extend this with...". The output is production-ready or explicitly scoped with written justification.

**What KMS does:** Skills define their domain competencies and quality gates but contain no instruction about solution completeness. Agents routinely output scaffolding with placeholder implementations, or stop at the first working version without considering adjacent error paths, edge cases, or the tests that should accompany the code.

**Impact:** Developers receive 70% solutions and must chase the agent for the remaining 30% in follow-up prompts. This compounds across a sprint into hours of lost productivity.

**Fix — Specific and Actionable:**

1. Add a `## Completeness Standard` section to `docs/agents/shared/patterns.md` with the following rule:

   ```
   COMPLETENESS STANDARD (mandatory for all agents)

   Before delivering any output, evaluate: "Is this complete enough that a developer
   can use it without follow-up questions?"

   If the answer is NO, and completing it costs less than a 5% increase in response
   length, always do the complete version.

   What "complete" means:
   - No stub methods (no `// TODO`, no `pass`, no `throw new Error('not implemented')`)
   - All error branches handled, not just the happy path
   - Unit test file included alongside any new service method
   - Imports fully resolved (no partial import lists)
   - Environment variables documented if introduced
   - If a DB migration is needed, include it — do not say "you'll need a migration"

   Exception: if a section is genuinely out of scope for this agent, hand off
   explicitly using the Handoff Format in this file. Never silently leave it incomplete.
   ```

2. Reference this standard by name in every skill file's `## Core Capabilities` section: "All outputs follow the Completeness Standard in `shared/patterns.md`."

**Effort:** 2 hours

---

### P0-3: No Structured Decision Format

**What gstack does:** When recommending a technical approach, every skill follows a rigid four-step format: (1) Re-ground — restate the problem in one sentence to confirm understanding; (2) Simplify — explain the trade-off as you would to a smart 16-year-old (ELI16), removing jargon; (3) Recommend — state the recommendation clearly, with a Completeness score (1–10) indicating how complete the proposed solution is; (4) Options — give two alternatives with time-horizon labels (solve-now / solve-right).

**What KMS does:** Recommendations are ad-hoc. Some skills (like `kb-architect`) have structured output sections, but there is no consistent decision format across agents. A developer asking two different specialists the same question will get structurally incompatible answers.

**Impact:** Developer cognitive load increases when parsing agent outputs. Decisions that should be quick become lengthy because the format varies. Junior developers cannot reliably extract the recommendation from a wall of reasoning text.

**Fix — Specific and Actionable:**

1. Add a `## Structured Decision Format` section to `docs/agents/shared/patterns.md`:

   ```markdown
   ## Structured Decision Format

   Use this format for ALL technical recommendations (architecture decisions,
   library choices, approach selection, design trade-offs):

   **Re-ground:** [One sentence restating the actual problem]

   **ELI16:** [The core trade-off explained without jargon — 2-3 sentences max.
               Imagine explaining it to a smart person who has never worked in software.]

   **Recommendation:** [Clear, direct statement of what to do]
   Completeness: X/10 — [what is and is not included in this recommendation]

   **Options:**
   | Option | Time Scale | Trade-off |
   |--------|-----------|-----------|
   | A (recommended) | Solve-now (< 1 sprint) | ... |
   | B | Solve-right (> 1 sprint) | ... |
   ```

2. Add a note to each skill's `## Persona` section: "You always use the Structured Decision Format from `shared/patterns.md` when recommending a technical approach."

3. Update `docs/agents/orchestrator/coordinator.md` to enforce this format as a quality gate: outputs from specialist agents that include a recommendation but lack the Re-ground/ELI16/Recommendation/Options structure should be rejected and regenerated.

**Effort:** 3 hours

---

### P0-4: No Fix-First Workflow

**What gstack does:** Mechanical issues — linting violations, import order, missing semicolons, unused variables, obvious type errors — are fixed automatically without prompting. The agent applies the fix, notes it in a summary ("auto-fixed: 3 linting violations"), and continues with the substantive work. Only non-mechanical decisions (architecture choices, business logic changes, naming that carries semantic meaning) are batched into a single clarifying question.

**What KMS does:** No instruction exists on this topic. Agents ask clarifying questions for issues that have a deterministic correct answer. This interrupts flow and burns context tokens.

**Impact:** A developer asking "review this PR" gets three rounds of "did you want me to fix the import order?" instead of a fix + substantive review.

**Fix — Specific and Actionable:**

1. Add a `## Fix-First Workflow` section to `docs/agents/shared/patterns.md`:

   ```markdown
   ## Fix-First Workflow

   Classify every identified issue as MECHANICAL or NON-MECHANICAL before responding.

   MECHANICAL (auto-fix, no question):
   - Lint violations (import order, trailing whitespace, semicolons)
   - Unused imports or variables (when the intent is obvious)
   - Missing return type annotations where the type is unambiguous
   - Obvious typos in variable names or string literals
   - Missing `await` on an async call where forgetting it is clearly a bug
   - Console.log/print statements that should be the project logger

   NON-MECHANICAL (batch into ONE clarifying question, never ask one at a time):
   - Naming choices that carry domain meaning
   - Architecture decisions (use Redis vs. in-memory cache)
   - Business logic trade-offs (paginate vs. return all)
   - Scope decisions (fix just this file vs. fix the pattern everywhere)

   Protocol:
   1. Apply all MECHANICAL fixes silently.
   2. If any NON-MECHANICAL decisions are needed, list ALL of them in one message.
   3. After the developer responds once, proceed with full implementation.
   4. NEVER ask about a mechanical issue. NEVER ask multiple non-mechanical questions
      in separate messages.
   ```

2. Reference this section explicitly in `kb-qa-architect`, `kb-backend-lead`, `kb-python-lead`, and `kb-security-review` skill files since those are the agents most likely to perform code review and suggest fixes.

**Effort:** 2 hours

---

### P0-5: No Scope Drift Detection

**What gstack does:** Before completing any change that touches files, the agent runs a pre-commit scope check: compare the files in the diff against the original stated intent. If the diff touches files outside the stated scope, the agent surfaces a warning: "Scope drift detected — you asked me to fix X, but I've also modified Y and Z. Confirm you want all of these changes."

**What KMS does:** No scope gate. An agent can be asked to "fix the search result ranking" and silently refactor the embedding pipeline, change a DB schema, and update three CONTEXT.md files.

**Impact:** Unreviewed changes enter the codebase. Developers reviewing AI output cannot tell what was in scope vs. what the agent decided to add. This is a real correctness risk, not just a style concern.

**Fix — Specific and Actionable:**

1. Add a `## Scope Drift Detection` section to `docs/agents/shared/patterns.md`:

   ```markdown
   ## Scope Drift Detection

   Before delivering any code change or set of file modifications, perform this check:

   1. State the original task intent in one sentence (as given by the developer).
   2. List every file you have created or modified.
   3. For each file NOT directly named or implied by the original task, flag it:
      "OUT-OF-SCOPE CHANGE: [filename] — [why I modified it] — [confirm or revert?]"
   4. If no out-of-scope files exist, proceed silently.
   5. Never commit or finalize changes until out-of-scope modifications are confirmed.

   What counts as "implied by the original task":
   - The file containing the bug being fixed
   - The test file for that module
   - The CONTEXT.md that routes to the changed module
   - Any migration required by a schema change explicitly requested

   What does NOT count as implied:
   - Refactoring adjacent code "while I'm here"
   - Updating documentation for a feature that wasn't mentioned
   - Changing shared utilities to fit the new code
   ```

2. Add a `### Pre-Delivery Scope Check` item to the `## Quality Gates — Before PR Submission` list in `docs/agents/shared/patterns.md`.

**Effort:** 2 hours

---

### P0-6: No Code Review Checklists

**What gstack does:** Code review uses an 80-item checklist organized by concern: enum completeness (are all enum values handled cross-file?), SQL safety (parameterized queries everywhere?), race conditions (shared state with concurrent access?), type safety (no `any` in TypeScript, no untyped function params in Python?), error path completeness (every thrown exception caught or re-thrown deliberately?), and more.

**What KMS does:** The DoD checklist (10 gates) covers quality at the feature level. The `kb-security-review` skill covers OWASP. But there is no code-level review checklist that an agent runs when asked to "review this PR" or "review this file." The security review is a separate invocation, not embedded into the review workflow.

**Impact:** Code reviews by agents are shallow. Common issues (N+1 queries, missing error branches, unhandled promise rejections, race conditions on job status) pass review because there is no systematic checklist driving the review.

**Fix — Specific and Actionable:**

1. Create `/Users/gauravporwal/Sites/projects/gp/knowledge-base/docs/agents/shared/code-review-checklist.md` with the following sections:
   - **TypeScript / NestJS Review** (30 items): type safety, DI patterns, error handling, transaction safety, logging, OTel, DTO validation, Prisma usage, circular imports, missing `await`, enum exhaustiveness
   - **Python Review** (25 items): async patterns, aio-pika ack/nack correctness, asyncpg parameterization, structlog usage, exception hierarchy, retry decorator presence, missing `async with`, type hints, Google docstrings
   - **Cross-Language Review** (15 items): N+1 queries, pagination on unbounded results, PII in logs, hardcoded secrets, missing indexes on FK columns, race conditions on status transitions, DLQ handling, test isolation
   - **Security Review Integration** (10 items): references to `kb-security-review` trigger conditions from `shared/patterns.md`

2. Reference this checklist explicitly in `kb-qa-architect`, `kb-backend-lead`, and `kb-python-lead` skill files.

3. Add a `### Code Review` section to `docs/agents/orchestrator/coordinator.md` instructing the coordinator to run the code review checklist before accepting any code output from a specialist agent.

**Effort:** 6 hours (checklist authoring + skill file integration)

---

## 4. High Priority Gaps — P1 (Should Fix)

These gaps reduce quality or developer experience significantly but do not cause correctness failures on every interaction.

---

### P1-1: No Skill Versioning

**Current state:** Skill files have no version header. When a skill is updated, there is no way to know which version a developer was using when a decision was made, or whether a regression was introduced.

**Fix:**
- Add a YAML front-matter block to every skill file:
  ```yaml
  ---
  skill: kb-backend-lead
  version: 1.0.0
  last_updated: 2026-03-19
  owner: backend-team
  depends_on: [shared/patterns.md, shared/variables.md, shared/code-review-checklist.md]
  ---
  ```
- Add a `CHANGELOG` section at the bottom of each skill file tracking version history.
- Update `docs/agents/CONTEXT.md` routing table to include the version column.

**Effort:** 3 hours

---

### P1-2: No Cognitive Modes Embedded in Skills

**Current state:** Skills define technical competencies but not the cognitive stance the agent should adopt. A `kb-architect` operates the same way whether asked to review an existing design or greenfield a new system — there is no mode shift.

**What gstack does:** CEO mode (18 patterns: "what is the second-order consequence?", "who does this slow down?", "what would we regret not doing?") and Designer mode (12 patterns: "what does the user see first?", "where is the system lying to the user?") are embedded directly in the skill.

**Fix for KMS:**
- Add a `## Cognitive Stance` section to three key skills:
  - `kb-architect` — "Greenfield Mode" vs. "Constraint Mode" (adapts reasoning based on whether a system exists)
  - `kb-product-manager` — "User Advocate Mode" (always asks: what does the user actually experience?)
  - `kb-qa-architect` — "Adversarial Mode" (always asks: how would a hostile input break this?)
- Add a `## Decision Quality Questions` section to `kb-architect` with 10 second-order-consequence questions drawn from systems thinking.

**Effort:** 4 hours

---

### P1-3: 6 Informal Skills Not Properly Structured

**Current state:** Six skills (`task-completion-check`, `sync-docs`, `onboard`, `new-feature-guide`, `lint-docs`, `plan`) are referenced in CLAUDE.md and `docs/agents/CONTEXT.md` but have no corresponding skill definition files in the agents directory. They exist as invocation names only.

**Impact:** These skills have no documented behavior, no quality gates, no domain context. When invoked, the agent has only the skill name as a signal. A developer invoking `/sync-docs` gets whatever the model's default behavior is for "sync docs", not a KMS-specific, pattern-consistent behavior.

**Fix:**
Create full skill files for each:
- `docs/agents/delivery/task-completion-check.md` — the DoD checklist runner. Must reference all 10 gates in `DEFINITION-OF-DONE.md` and report pass/fail per gate.
- `docs/agents/delivery/sync-docs.md` — CONTEXT.md sync protocol: which files to check, what constitutes a stale routing entry, how to detect new modules without CONTEXT.md entries.
- `docs/agents/delivery/onboard.md` — new developer onboarding sequence: which files to read in what order, what questions to answer, how to verify the local stack runs.
- `docs/agents/delivery/new-feature-guide.md` — scaffold protocol for FOR-*.md: required sections, how to derive content from PRD + ADR.
- `docs/agents/delivery/lint-docs.md` — documentation linting rules: CONTEXT.md routing table completeness, FOR-*.md required sections, broken internal links, stale port references.
- `docs/agents/delivery/plan.md` — sprint planning skill: how to break a PRD into tasks, estimate effort, sequence dependencies, output a sprint board entry.

**Effort:** 8 hours (1–1.5 hours per skill file)

---

### P1-4: No Diff-Based Test Selection

**Current state:** No instruction exists for which tests to run based on the scope of a change. The implication is always "run all tests."

**What gstack does:** Three-tier test selection: Tier 1 (free — run always: lint, type check, unit tests for changed files only); Tier 2 (~$3.85 equivalent in time — integration tests for services touched); Tier 3 (~$0.15 — full E2E suite, only on merge to main).

**Fix:**
Add a `## Test Selection Strategy` section to `docs/agents/shared/patterns.md` and to `kb-qa-architect`:

```markdown
## Test Selection Strategy

Given a set of changed files, select tests as follows:

Tier 1 — Always run (< 30 seconds):
- `npm run lint` / `ruff check` on changed files
- Unit tests for the exact module(s) changed
- Type check: `tsc --noEmit` (NestJS) / `mypy` (Python)

Tier 2 — Run on feature branch before PR (< 5 minutes):
- Integration tests for any service whose DB schema, queue interface,
  or HTTP contract changed
- If kms-api changed: run kms-api integration suite
- If a worker changed: run that worker's consumer tests with testcontainers

Tier 3 — Run on merge to main only:
- Full Playwright E2E suite
- Cross-service contract tests
- Performance regression tests

Never run Tier 3 on a feature branch commit. Never skip Tier 1 for any commit.
```

**Effort:** 2 hours

---

### P1-5: No LLM-as-Judge Evaluation

**Current state:** Agent output quality is evaluated only by the developer reading it. There is no automated quality signal.

**What gstack does:** A Tier 3 quality gate passes the agent's output to a second LLM invocation with a structured judge prompt: "Does this output follow the decision format? Are any stubs present? Does the recommendation address the stated problem?" The judge returns a pass/fail with a reason.

**Fix (pragmatic version for KMS):**
- Add a `## Self-Evaluation Protocol` section to `docs/agents/shared/patterns.md`:
  ```markdown
  ## Self-Evaluation Protocol

  Before delivering any substantial output (> 50 lines of code or a technical recommendation),
  perform a self-evaluation pass:

  1. Does the output follow the Completeness Standard? (no stubs, no TODOs without a filed ticket)
  2. Does it use the Structured Decision Format if a recommendation is included?
  3. Does it follow the Fix-First Workflow if code issues were identified?
  4. Does it pass the Scope Drift Detection check?
  5. Does it include tests if new code was written?

  If any check fails, revise before delivering. Do not deliver a self-evaluated failing output.
  ```
- This is a pragmatic substitute for a full LLM-as-judge system. It enforces the same checklist in-context rather than via a subprocess call.

**Effort:** 1 hour

---

### P1-6: No Dependency Declarations Between Skills

**Current state:** Skill routing is implicit — the coordinator's routing table implies which skills depend on which, but this is not declared in the skill files themselves. A refactor to `shared/patterns.md` has unknown blast radius.

**Fix:**
- Add `depends_on` to the YAML front-matter block from P1-1.
- Add an `## Upstream Dependencies` section to each skill file listing what shared context files it relies on and what other skills it commonly precedes or follows.
- This enables a future "skill health check" that can detect when a dependency was updated but dependents were not.

**Effort:** 2 hours (combined with P1-1 versioning work)

---

## 5. Nice to Have — P2

These gaps are real improvements but carry lower ROI relative to P0 and P1 work.

---

### P2-1: Auto-Generated Skill Docs from Source

**What gstack does:** A `SKILL.md.tmpl` template is compiled into `SKILL.md` from source metadata. The skill file is never hand-edited — it is always the output of a build step. This eliminates drift between the template and the generated file.

**What this means for KMS:** A `skill-generator.ts` script (or Python equivalent) that reads skill metadata from a structured JSON/YAML registry and generates the SKILL.md files. The registry becomes the single source of truth; the .md files are build artifacts.

**Effort:** 1.5 sprints (significant structural change)
**Prerequisite:** P1-1 (versioning + front-matter) must be done first.

---

### P2-2: Contributor Feedback Loop

**What this means:** A structured process for skill improvement. When an agent gives a notably good or bad answer, the developer can run `/skill-feedback kb-backend-lead "recommendation was missing the transaction wrapper pattern"` and that feedback is appended to a `FEEDBACK.md` file in the skill's directory. Periodically, the `kb-doc-engineer` reviews and incorporates valid feedback into the skill file.

**Effort:** 3 hours (feedback command + FEEDBACK.md template + review protocol in `doc-engineer.md`)

---

### P2-3: E2E Testing via `claude -p` Subprocess

**What gstack does:** Runs skills as subprocesses using `claude -p "invoke skill X with input Y"` and asserts on the output format. This catches skill regressions — if a skill update changes the output structure, the test fails.

**Effort:** 2 sprints. Requires: test infrastructure, skill output schemas, CI integration.
**Prerequisite:** P1-1 (versioning), P0-3 (structured decision format — outputs must be structured to be machine-asserted).

---

### P2-4: Browser Automation for QA

**What gstack does:** A persistent Chromium daemon (100ms per command) with a reference system using named element anchors (`@e1`, `@e2`) allows QA agents to drive the UI, take screenshots, and assert on visual state.

**What this means for KMS:** The `kb-qa-architect` skill could include Playwright-driven UI test generation for the KMS web UI (currently in development on `feat/design-web-ui`). This is a natural next step once the web UI reaches testable stability.

**Effort:** 1 sprint (Playwright setup) + ongoing skill integration.

---

### P2-5: Skill Health Monitoring

**What this means:** A scheduled check (weekly) that runs `lint-docs` against all skill files and reports: skills not updated in > 90 days, skills with broken `depends_on` references, skills with no version header, and skills referenced in routing tables but with no corresponding file.

**Effort:** 4 hours (lint-docs skill extension + cron/script)

---

## 6. Implementation Roadmap

### Phase 1 — Session Intelligence Layer (Week 1–2)

Deliver the behavioral layer that makes every agent interaction self-orienting and output-consistent.

| Task | Owner | Effort | Deliverable |
|------|-------|--------|-------------|
| Create `shared/preamble.md` | Backend Lead or Doc Engineer | 1h | Universal preamble template |
| Propagate preamble to all 14 skill files | Doc Engineer | 3h | Updated skill files |
| Add Completeness Standard to `shared/patterns.md` | Doc Engineer | 1h | Updated patterns.md |
| Add Structured Decision Format to `shared/patterns.md` | Doc Engineer | 1h | Updated patterns.md |
| Add Fix-First Workflow to `shared/patterns.md` | Doc Engineer | 1h | Updated patterns.md |
| Add Scope Drift Detection to `shared/patterns.md` | Doc Engineer | 1h | Updated patterns.md |
| Add Self-Evaluation Protocol to `shared/patterns.md` | Doc Engineer | 1h | Updated patterns.md |
| Reference all new standards in skill `## Persona` sections | Doc Engineer | 2h | Updated skill files |

**Phase 1 total effort: ~11 hours**
**Phase 1 outcome:** Every agent invocation is self-orienting, output-consistent, and drift-protected.

---

### Phase 2 — Skill Completeness and Code Review (Week 3–4)

Deliver full skill coverage and code review rigor.

| Task | Owner | Effort | Deliverable |
|------|-------|--------|-------------|
| Create `shared/code-review-checklist.md` (TypeScript + Python + cross-language) | QA Architect + Backend Lead | 6h | code-review-checklist.md |
| Integrate checklist into `kb-qa-architect`, `kb-backend-lead`, `kb-python-lead` | Doc Engineer | 2h | Updated skill files |
| Create 6 missing formal skill files (delivery group) | Doc Engineer | 8h | 6 new SKILL.md files |
| Add `## Test Selection Strategy` to patterns.md and `kb-qa-architect` | QA Architect | 2h | Updated files |
| Add Cognitive Modes to `kb-architect`, `kb-product-manager`, `kb-qa-architect` | Architecture Lead | 4h | 3 updated skill files |

**Phase 2 total effort: ~22 hours**
**Phase 2 outcome:** No skill invocation point is undocumented. Code reviews are checklist-driven. Tests are proportionate to the change.

---

### Phase 3 — Versioning and Dependency Graph (Week 5)

Deliver the infrastructure for skill health tracking and future automation.

| Task | Owner | Effort | Deliverable |
|------|-------|--------|-------------|
| Add YAML front-matter to all skill files (version + depends_on) | Doc Engineer | 3h | All skill files updated |
| Add `## Upstream Dependencies` section to each skill | Doc Engineer | 2h | All skill files updated |
| Add CHANGELOG section to each skill file | Doc Engineer | 2h | All skill files updated |
| Update `docs/agents/CONTEXT.md` routing table with version column | Doc Engineer | 1h | Updated CONTEXT.md |
| Add contributor feedback protocol to `doc-engineer.md` | Doc Engineer | 3h | Updated skill + FEEDBACK.md template |

**Phase 3 total effort: ~11 hours**
**Phase 3 outcome:** Skills are versioned, traceable, and improvable through structured feedback.

---

### Phase 4 — Automation and Self-Improvement (Week 6–8)

Deliver automation that reduces manual skill maintenance.

| Task | Owner | Effort | Deliverable |
|------|-------|--------|-------------|
| Extend `lint-docs` for skill health monitoring | Doc Engineer | 4h | Extended lint-docs skill |
| Design skill generator script architecture (SKILL.md.tmpl) | Architect | 4h | ADR + design doc |
| Implement `skill-generator.ts` | Backend Lead | 12h | Generator script |
| Migrate 3 pilot skills to template-generated format | Backend Lead | 6h | 3 skills as build artifacts |
| Design E2E skill test framework | QA Architect | 8h | Test strategy doc |

**Phase 4 total effort: ~34 hours**
**Phase 4 outcome:** Skill files are build artifacts, health-monitored, and regression-tested.

---

### Total Roadmap Summary

| Phase | Focus | Effort | Impact |
|-------|-------|--------|--------|
| 1 | Session Intelligence Layer | 11h | Every interaction self-orients, output is consistent |
| 2 | Skill Completeness + Code Review | 22h | No gaps, review is checklist-driven |
| 3 | Versioning + Dependency Graph | 11h | Traceable, improvable skills |
| 4 | Automation + Self-Improvement | 34h | Skills as build artifacts, regression-tested |
| **Total** | | **~78 hours** | **Class-leading agent system** |

---

## 7. Quick Wins (Under 1 Day Each)

These are tasks that can be done in a single working session with no dependencies on other phases. Do these first.

| # | Task | File | Time | Value |
|---|------|------|------|-------|
| 1 | Add `## Completeness Standard` to `shared/patterns.md` | `docs/agents/shared/patterns.md` | 45 min | Eliminates stub-heavy outputs immediately |
| 2 | Add `## Structured Decision Format` to `shared/patterns.md` | `docs/agents/shared/patterns.md` | 30 min | Every recommendation becomes parseable |
| 3 | Add `## Fix-First Workflow` to `shared/patterns.md` | `docs/agents/shared/patterns.md` | 30 min | Eliminates mechanical question loops |
| 4 | Add `## Scope Drift Detection` to `shared/patterns.md` | `docs/agents/shared/patterns.md` | 30 min | Prevents silent over-reach on every invocation |
| 5 | Add `## Self-Evaluation Protocol` to `shared/patterns.md` | `docs/agents/shared/patterns.md` | 20 min | In-context quality gate before delivery |
| 6 | Add `## Test Selection Strategy` to `shared/patterns.md` | `docs/agents/shared/patterns.md` | 30 min | Proportionate test runs immediately |
| 7 | Add preamble instruction to `kb-backend-lead` (pilot) | `docs/agents/backend/backend-lead.md` | 30 min | Proves the pattern before full propagation |
| 8 | Add preamble instruction to `kb-python-lead` (pilot) | `docs/agents/backend/python-lead.md` | 30 min | Same |
| 9 | Create `task-completion-check.md` skill file | New file in `docs/agents/delivery/` | 2h | Closes the most-used informal skill gap |
| 10 | Create `sync-docs.md` skill file | New file in `docs/agents/delivery/` | 2h | Second most-used informal skill gap |
| 11 | Add `## Upstream Dependencies` note to `coordinator.md` | `docs/agents/orchestrator/coordinator.md` | 20 min | Explicit dependency awareness in routing |
| 12 | Add version header to `backend-lead.md` and `python-lead.md` (pilot) | Two skill files | 20 min | Starts the versioning habit before full rollout |

**Total for all quick wins: ~8 hours** — achievable in a single focused day.

---

## 8. Patterns We Must Always Follow Going Forward

These are not suggestions. They are the new minimum standards for all skill work in this project. Add them to `CLAUDE.md` under a new `## Skill Development Standards` section.

---

### 8.1 Every Skill File Must Include These Sections (in Order)

```
---
skill: <skill-name>
version: X.Y.Z
last_updated: YYYY-MM-DD
owner: <team>
depends_on: [shared/patterns.md, shared/variables.md, ...]
---

# <Skill Name> — Agent Persona

## Identity           ← role, specialization, project
## Universal Preamble ← git context, feature flags, session state
## Project Context    ← service ownership, tech stack
## Cognitive Stance   ← what mode does this agent operate in?
## Core Capabilities  ← numbered, with code patterns
## Completeness Standard ← reference to shared/patterns.md
## Decision Format    ← reference to shared/patterns.md
## Fix-First Workflow ← reference to shared/patterns.md
## Quality Gates      ← skill-specific gates beyond the DoD
## Upstream Dependencies ← what this skill reads; what skills feed it
## CHANGELOG          ← version history
```

---

### 8.2 New Shared Standards Are Mandatory, Not Opt-In

When a new standard is added to `docs/agents/shared/patterns.md`, it is automatically binding on all skills. No skill file needs to be updated to "opt in." However, when a skill file is next edited for any reason, the editor must verify it references the new standard and add the reference if missing. This is a rolling compliance model — not a big-bang update requirement.

---

### 8.3 The Pre-Delivery Checklist Is Non-Negotiable

Before any agent delivers output involving code or architectural recommendations, it must silently run:

1. Completeness check (no stubs, no unresolved TODOs)
2. Scope drift check (every modified file is in scope)
3. Decision format check (recommendation includes Re-ground/ELI16/Recommendation/Options)
4. Fix-first check (all mechanical issues fixed, not left as comments)
5. Self-evaluation protocol (all 5 points pass)

This is not a visible checklist shown to the developer. It is a silent internal gate. The developer sees only the clean output.

---

### 8.4 Never Create a New Skill Without a Skill File

If a skill is referenced in any routing table (CLAUDE.md, agents/CLAUDE.md, or any CONTEXT.md) and does not have a corresponding `.md` file in the `docs/agents/` directory tree, the reference is invalid. A skill is not a skill until its file exists with all required sections. This rule applies retroactively to the 6 informal skills identified in P1-3.

---

### 8.5 Skill Files Are Owned, Versioned, and Reviewed Like Code

- Every skill file has an `owner` in its front-matter.
- Changes to skill files go through the same PR process as code changes.
- The `kb-doc-engineer` reviews skill file PRs (not just documentation PRs).
- A skill file cannot be merged without a CHANGELOG entry.
- Breaking changes to a skill (removing a section, changing the decision format) bump the minor version. Behavioral additions bump the patch version.

---

### 8.6 Shared Patterns File Is Authoritative

`docs/agents/shared/patterns.md` is the single source of truth for all cross-skill behavioral standards. If a standard is documented in a skill file but not in `shared/patterns.md`, it is a skill-local convention, not a system-wide standard. To promote a local convention to a system standard, it must be moved to `shared/patterns.md` and all skill files must reference it.

---

### 8.7 The Coordinator Is the Quality Gate, Not Just the Router

The `kb-coordinator` skill must not just route requests — it must verify that the output from specialist agents meets the Pre-Delivery Checklist (8.3) before accepting the output and passing it to the next agent or to the developer. A specialist agent that delivers a stub-heavy, undocumented, scope-drifting output has failed the coordinator's gate and must regenerate.

---

*This document supersedes any prior informal gap assessment. It is the authoritative engineering backlog for KMS agent system improvements. Next review: 2026-06-19 (90 days).*
