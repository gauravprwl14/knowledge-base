# Skill System Blueprint: Build Expert AI Assistants for Any Domain

> **Who this is for**: Anyone who uses AI coding assistants (Claude Code, Cursor, Copilot, etc.) and wants to stop getting generic answers and start getting expert-level, domain-aware responses every single time.

> **What you will build**: A system of specialized AI "skills" — cognitive frameworks that transform a general-purpose AI into a domain expert with your context, your standards, and your decision-making philosophy baked in.

> **Time investment**: 30 minutes to first working skill. 4–8 hours for a complete professional system.

---

## Table of Contents

- [Part 1: The Philosophy — Why This Works](#part-1-the-philosophy--why-this-works)
- [Part 2: The Architecture — How It's Built](#part-2-the-architecture--how-its-built)
- [Part 3: The Core Components — What to Build](#part-3-the-core-components--what-to-build)
- [Part 4: Implementation Guide — Step by Step](#part-4-implementation-guide--step-by-step)
- [Part 5: Domain Examples — Concrete Applications](#part-5-domain-examples--concrete-applications)
- [Part 6: Skill Templates — Copy-Paste Starting Points](#part-6-skill-templates--copy-paste-starting-points)
- [Part 7: Quality and Evaluation](#part-7-quality-and-evaluation)
- [Part 8: Advanced Patterns](#part-8-advanced-patterns)

---

## Part 1: The Philosophy — Why This Works

### 1.1 The Core Problem with Generic AI

When you ask a general AI assistant a question, it responds from a statistical average of all human knowledge. That is simultaneously its greatest strength and its fatal weakness for professional work.

Consider: "How should I structure this API endpoint?"

A generic AI will give you a textbook answer. But you need an answer that accounts for:
- Your existing error handling conventions
- Your team's preferred response shape
- Your current OpenAPI contract
- What you decided three sprints ago and why
- Which patterns you have already rejected

The generic AI does not know any of this. So it gives you advice that is technically correct and contextually useless.

**The skill system solves this by loading context before reasoning, not after.**

### 1.2 The Specialization Principle

Human experts do not think generically. A cardiologist examining an ECG is not running "general medical analysis" — they are applying a specific cognitive framework built over years: pattern recognition, differential weighting, clinical correlations, decision trees that are invisible to anyone outside that specialty.

The skill system replicates this by giving the AI a **specific cognitive mode** before it sees your question. Not instructions about what to say, but instructions about *how to think*.

The difference:

| Generic Instruction | Cognitive Mode |
|---------------------|----------------|
| "You are a backend engineer. Help with NestJS." | "You are KB Backend Lead. When you see a module request, first check: Does a similar module exist? Does this create a circular dependency? Does the error handling follow AppException? What is the minimal surface area that solves the problem? Only then write code." |
| "You are a marketing expert." | "You are Brand Strategist. When you review copy, first ask: What is the one job this piece of content does? Who is the precise reader (not demographic — psychological profile)? What belief must shift for this to work? What is the measurement signal that tells you it worked?" |

The first form tells the AI what role to play. The second form gives the AI a *thinking process* — the same one a human expert would apply.

### 1.3 The Completeness Philosophy

Most AI workflows optimize for speed: get an answer fast, iterate from there. The skill system takes a different position.

**"Boil the Lake"**: When the cost delta between a partial answer and a complete answer is less than 5% of total effort, always choose complete.

Why does this matter? Because AI has near-zero marginal cost for thoroughness. When a human engineer says "I'll add error handling later," there is genuine time pressure behind that decision. When an AI says it, there is no such pressure — it is an artificial constraint inherited from human cognitive limitations.

A skill system encodes this as a standing instruction: *Never produce the minimum viable answer when a complete answer is achievable in the same response.*

This single principle, when embedded in every skill, dramatically changes output quality.

### 1.4 The Context-First Principle

Generic AI: Question → Reasoning → Answer

Skill system: Load Context → Question → Context-Aware Reasoning → Answer

The context loaded before reasoning should include:
- What exists (current codebase, current campaigns, current content)
- What was decided (ADRs, brand decisions, editorial policies)
- What failed (rejected patterns, failed experiments)
- What the standards are (error codes, naming conventions, tone of voice)

This transforms every answer from "here is what is generally true" to "here is what is specifically right for your situation."

### 1.5 The Seven Design Principles

These are not abstract values. They are concrete trade-offs that the skill system makes in every response.

**1. Specialization Over Generality**
Each skill has one job and knows it deeply. A system with 15 focused skills outperforms one "super-agent" because cognitive focus produces better reasoning.

**2. Context Over Instructions**
Loading what is true about the world produces better answers than telling the AI how to behave. Context is evidence; instructions are preferences.

**3. Completeness Over Speed**
When AI cost delta is small, always choose the more complete answer. Partial answers create follow-up questions; complete answers close loops.

**4. Rigor Over Vibes**
Never accept "this looks good" as a quality signal. Every recommendation must be traceable to evidence, pattern, or explicit decision.

**5. Actionability Over Reporting**
Do not narrate problems. Fix mechanical issues automatically. Present complex decisions as structured choices with recommendation. Never list problems without providing solutions.

**6. Transparency Over Convenience**
When uncertain, say so explicitly. When making a judgment call, name the judgment. When flagging a risk, show the evidence.

**7. Tests Over Promises**
Every skill that produces artifacts should include a way to validate the artifact. Code skills run tests. Content skills check against criteria. Decision skills state the measurement.

---

## Part 2: The Architecture — How It's Built

### 2.1 The Three-Layer Model

```
┌─────────────────────────────────────────────────────────┐
│                    LAYER 3: SKILLS                       │
│   Specialized cognitive modes + domain knowledge         │
│   (SKILL.md files — one per expert role)                 │
├─────────────────────────────────────────────────────────┤
│                   LAYER 2: PREAMBLE                      │
│   Universal context loader + session awareness           │
│   (runs before every skill invocation)                   │
├─────────────────────────────────────────────────────────┤
│                   LAYER 1: FOUNDATION                    │
│   Project context + standards + decision history         │
│   (CLAUDE.md / project config file)                      │
└─────────────────────────────────────────────────────────┘
```

**Layer 1 (Foundation)** answers: *What is this project and what are its rules?*
**Layer 2 (Preamble)** answers: *What is the current state of the world right now?*
**Layer 3 (Skills)** answers: *What cognitive framework should be applied to this problem?*

Together, they give the AI project context, live context, and domain expertise — the same three things a senior human consultant would have before giving advice.

### 2.2 The Skill Invocation Flow

```
User types: /kb-backend-lead

         │
         ▼
  [Preamble executes]
  - Load git log (last 10 commits)
  - Load CLAUDE.md / project config
  - Check active files / open context
  - Note session count
  - Set completeness mode
         │
         ▼
  [Skill activates]
  - Load role definition
  - Load domain knowledge (patterns, anti-patterns)
  - Load decision history relevant to domain
  - Set cognitive mode (thinking patterns)
         │
         ▼
  [AI processes user request]
  WITH:
  - Project standards already loaded
  - Domain expertise already loaded
  - Completeness philosophy active
  - Evidence requirement active
         │
         ▼
  [Structured response]
  - Re-grounded to context
  - Simplified to right level
  - Recommendation with completeness score
  - Both short and long-term options
```

### 2.3 The Template Compilation Model

Skills are not written as final text. They are written as **human-readable templates** that get compiled into **AI-readable instructions**.

```
SKILL.md.tmpl           →    compile step    →    SKILL.md
(prose + placeholders)       (fills in            (committed to git)
                              technical            (loaded by AI)
                              details)
```

Why? Because:
1. Templates are easier to maintain — change the project config, recompile all skills
2. Templates enforce consistency — all skills share the same preamble structure
3. Templates allow inheritance — base templates + domain-specific overrides

In practice (without a formal build step), you achieve this by:
1. Writing a `SKILLS-TEMPLATE.md` that contains all the shared structure
2. Writing individual `SKILL-{name}.md` files that extend it with domain specifics
3. Treating the template as the source of truth; skills inherit from it

### 2.4 The Cognitive Mode Architecture

The most important architectural element. Each skill does not just change *what* the AI knows — it changes *how it reasons*.

A cognitive mode is a set of **reasoning questions** the AI applies before answering. These questions are different for each domain.

```
Software Engineering:
  Before writing code, ask:
    1. Does something like this already exist?
    2. What is the minimal surface area?
    3. What breaks at scale?
    4. What does the test look like?

Marketing Strategy:
  Before writing copy, ask:
    1. What is the one job this content does?
    2. What is the precise psychological profile of the reader?
    3. What belief must shift?
    4. What is the measurement signal?

Content Creation:
  Before writing content, ask:
    1. What conversation is the reader already having in their head?
    2. What is the hook that interrupts that conversation?
    3. What is the one idea, stated plainly?
    4. What is the next action?
```

These questions are not checklists to complete. They are *cognitive primes* — they set up the reasoning that follows.

---

## Part 3: The Core Components — What to Build

### 3.1 Component Map

Every skill system needs exactly these components. Nothing more, nothing less to start.

```
your-project/
├── .claude/                   # AI assistant config directory
│   ├── SKILLS.md              # Skill registry (what skills exist and when to use them)
│   └── skills/
│       ├── _preamble.md       # Universal preamble (runs before every skill)
│       ├── _base.md           # Base cognitive template (all skills inherit)
│       ├── skill-{name}.md    # Individual skill files
│       └── ...
├── CLAUDE.md                  # Foundation layer (project config)
└── ...your project files...
```

For non-code projects (marketing, content, personal branding):

```
your-workspace/
├── ai-config/
│   ├── SKILLS.md
│   └── skills/
│       ├── _preamble.md
│       ├── _base.md
│       └── skill-{name}.md
├── PROJECT.md                 # Foundation layer
└── ...your workspace files...
```

### 3.2 Component 1: The Foundation File (CLAUDE.md / PROJECT.md)

**Purpose**: Permanent context that never changes between sessions. The AI reads this on every invocation.

**Must contain**:
- What this project/workspace is (1-2 sentences)
- The folder map (what lives where)
- Naming conventions
- Non-negotiable standards
- Decision history (or pointer to ADRs)
- The skill registry (which skill does what)
- Quick commands

**Must NOT contain**:
- Long explanations (this is a reference, not documentation)
- Opinions or philosophy (those go in skills)
- Anything that changes frequently (that goes in session notes)

**Length target**: 200–400 lines. If it exceeds 400 lines, you have embedded things that belong elsewhere.

### 3.3 Component 2: The Universal Preamble

**Purpose**: Load live context before any skill activates. Runs identically regardless of which skill is invoked.

**Must do**:
1. Load recent history (git log, recent changes, last session notes)
2. Note current session state (what files are open, what was recently changed)
3. Set the completeness mode
4. Introduce itself clearly

**Template structure**:
```
## On Activation

You are now operating as [SYSTEM NAME].

Before processing the user's request:

1. READ the foundation file at [PATH]
2. NOTE the last 5 significant changes: [git log or change log path]
3. NOTE any session context from [session notes path]
4. SET your completeness mode: when AI cost delta is <5%, choose the complete option

You are now ready to route to the appropriate specialist skill.
```

**Length target**: 20–40 lines. This is a trigger, not a document.

### 3.4 Component 3: Individual Skills

**Purpose**: Domain-specific cognitive framework. One skill per expert role.

**Must contain**:
1. **Role definition** — Who is this? One sentence, specific.
2. **Activation triggers** — What phrases invoke this skill?
3. **Cognitive mode** — What questions does this expert ask before responding?
4. **Domain knowledge** — Patterns, anti-patterns, decision trees specific to this domain.
5. **Response format** — How should answers be structured?
6. **Quality gates** — What makes an answer from this skill "done"?
7. **Handoff signals** — When should this skill route to another specialist?

**Length target**: 60–150 lines per skill.

### 3.5 Component 4: The Skill Registry

**Purpose**: Routing table. Tells the AI which skill to invoke for which request.

**Critical**: The routing signal must be **trigger phrases**, not topic keywords. The difference:

```
WRONG (keyword routing):
  Use backend-skill for: "API, database, server, backend"

RIGHT (trigger phrase routing):
  Use backend-skill when user says:
    "add an endpoint", "create a service", "implement a controller"
```

Keyword routing fires on topic. Trigger phrase routing fires on *intent*. The same topic ("API") appears in design discussions (use architect skill), implementation requests (use backend skill), contract questions (use API designer skill), and testing questions (use QA skill). Keywords cannot distinguish these. Trigger phrases can.

### 3.6 Component 5: The Decision Format

**Purpose**: Structured format for every recommendation that involves a choice.

Every significant recommendation from a skill should follow this format:

```
## Re-ground
[1-2 sentences: what is the actual situation right now, based on loaded context]

## Simplify (ELI16)
[The core issue, stated as simply as possible — as if explaining to a smart 16-year-old
 with no domain context. This forces clarity and catches fuzzy thinking.]

## Recommend
[Your recommendation, stated plainly.]
[Completeness score: X/10 — how complete is this recommendation?]
[What would make it 10/10?]

## Options

### Option A: [Conservative / Fast]
- What it is
- Time/effort: [estimate]
- Trade-offs: [what you gain, what you give up]

### Option B: [Complete / Thorough]
- What it is
- Time/effort: [estimate]
- Trade-offs: [what you gain, what you give up]

## Evidence
[The specific facts, patterns, or prior decisions that support this recommendation]
```

This format is not optional formatting — it is a **reasoning protocol**. The act of writing the ELI16 explanation forces the AI (and the human) to confront whether the recommendation is actually understood or just pattern-matched.

---

## Part 4: Implementation Guide — Step by Step

### 4.1 Quick Start: 30 Minutes to First Skill

This section gets you a working skill in 30 minutes. It is intentionally minimal.

**Step 1: Write your Foundation File (10 minutes)**

Create `CLAUDE.md` (or `PROJECT.md`) at the root of your workspace.

Answer these questions in order:
1. What is this project/workspace in one sentence?
2. What are the 5–10 folders/areas and what does each contain?
3. What are the 3 most important naming or formatting rules?
4. What are the 2–3 decisions you have made that you never want to re-debate?

That is your foundation file. Do not over-engineer it. You will add to it as you discover what context the AI keeps needing.

**Step 2: Write one skill (15 minutes)**

Pick the single highest-value domain where you need expert AI help. For most engineers, this is their primary implementation domain. For marketers, this is copywriting. For content creators, this is ideation.

Answer these questions:
1. What is the role title? (One sentence. "You are X who does Y.")
2. What are 5 phrases someone would say when they need this skill?
3. What are the 3–5 questions an expert in this domain asks before doing anything?
4. What are the top 3 mistakes a non-expert makes in this domain?
5. What does "done" look like for a response from this skill?

Write those answers into the skill template (see Part 6).

**Step 3: Test it (5 minutes)**

Test with 3 prompts:
1. A typical request you make often
2. An edge case that requires domain knowledge
3. A request that should trigger a different skill (verify it routes correctly)

You now have a working skill. Everything from here is iteration.

### 4.2 Building a Full System (4–8 Hours)

**Phase 1: Audit (1 hour)**

Before writing skills, audit your current AI interactions:
- What questions do you ask AI most frequently?
- Where do you most often reject AI answers as "not quite right"?
- What context do you find yourself providing repeatedly in every conversation?

Group your frequent questions into 5–8 domains. Each domain becomes a skill. The repeated context becomes your foundation file.

**Phase 2: Foundation (30 minutes)**

Write a complete `CLAUDE.md` following the template in Part 6. The most common mistake is making this too long. Aim for "everything a new expert consultant would need to know to advise you on day 1."

**Phase 3: Preamble (15 minutes)**

Write the universal preamble following the template in Part 6. This is short — 20–40 lines. Its job is to load context, not to configure behavior.

**Phase 4: Skill Writing (2–5 hours)**

Write each skill in order of value. For each skill:
1. Define the cognitive mode (the 4–6 questions the expert asks first)
2. Define the domain knowledge (patterns, anti-patterns, rules)
3. Define the response format
4. Define the quality gates
5. Define the handoff conditions

The cognitive mode is the hardest part. Spend 60% of your time here. A weak cognitive mode produces a skill that sounds expert but reasons generically. A strong cognitive mode produces answers you could not have gotten from a general AI.

**How to write a strong cognitive mode:**

Think of the last time a real expert gave you advice that surprised you — where they said something non-obvious. What question did they ask that you had not thought to ask? That question is the core of a cognitive mode.

For example:
- A great architect will ask "what is the failure mode?" before recommending a technology choice. That question is not obvious to a non-architect.
- A great marketing strategist will ask "what belief must this change?" before approving copy. That question is not obvious to a non-marketer.
- A great editor will ask "what would the reader do if they stopped reading here?" before approving a paragraph. That question is not obvious to a non-editor.

These are the questions to embed in your cognitive modes.

**Phase 5: Skill Registry (30 minutes)**

Write the routing table. For each skill:
1. List 5–8 trigger phrases
2. List 2–3 phrases that should NOT trigger this skill (to prevent mis-routing)
3. List 1–2 adjacent skills it should hand off to

**Phase 6: Test and Iterate (1 hour)**

For each skill, run the three-tier test (see Part 7). Fix the cognitive mode of any skill that fails. The most common failure is the cognitive mode being too abstract — it tells the AI what the expert cares about, but not what questions the expert asks.

### 4.3 Maintenance

**When to update skills:**
- After every significant decision that should never be re-debated
- When you notice the AI giving answers that miss recent context
- When a skill is repeatedly routing to the wrong specialist
- When the domain has evolved (new tools, new standards, new patterns)

**When to add a skill:**
- When you find yourself explaining the same context in every conversation
- When a domain requires a fundamentally different thinking process than existing skills
- When you split a skill that has become too broad (a skill doing 3+ cognitive jobs needs to be split)

**When to delete a skill:**
- When a skill has not been invoked in 30+ days
- When two skills produce nearly identical responses (merge them)
- When the domain is no longer relevant to your work

---

## Part 5: Domain Examples — Concrete Applications

### 5.1 Software Engineering Domain

**Skills to build:**
1. `architect` — System design, ADRs, technology decisions
2. `backend-lead` — API implementation, service layer, database
3. `frontend-lead` — UI components, state management, accessibility
4. `qa-architect` — Test strategy, coverage, E2E design
5. `security-review` — OWASP, auth review, PII audit
6. `observability` — Logging, tracing, metrics
7. `platform` — Docker, CI/CD, deployment

**Sample cognitive mode — Backend Lead:**
```
When receiving an implementation request, ask in this order:

1. EXISTENCE CHECK: Does something like this already exist?
   - If yes: extend it. If no: build it minimal.

2. SURFACE AREA: What is the smallest interface that solves this?
   - Every extra method is a future maintenance burden.

3. ERROR PATHS: What happens when this fails?
   - Every happy path has 3 failure modes. Name them before writing code.

4. TEST SHAPE: What does the test look like before writing the implementation?
   - If you cannot describe the test, the design is not clear enough.

5. DEPENDENCY DIRECTION: Does this create any circular dependencies?
   - Dependencies should point toward stability, never toward volatility.
```

**Sample cognitive mode — Architect:**
```
When receiving a design or technology decision, ask in this order:

1. PROBLEM FRAME: What problem are we actually solving?
   - The stated problem is rarely the actual problem. Push once.

2. REVERSIBILITY: How reversible is this decision?
   - Reversible decisions: decide fast. Irreversible decisions: decide slow.

3. FAILURE MODE: What is the most likely way this fails?
   - Not the worst case. The most likely case.

4. SCALE ASSUMPTION: What scale assumption is embedded in this design?
   - Every design works at some scale and breaks at another. Name both.

5. PRIOR ART: What have we already decided that constrains this?
   - Check ADRs before recommending anything that involves a technology choice.
```

**Foundation file excerpt for software engineering:**
```markdown
# Project: [Your Project Name]

## What This Is
[One sentence description]

## Non-Negotiable Standards
- Errors: [Your error class] — never raw exceptions. Include error code.
- Logging: Structured JSON only — never console.log/print.
- Tests: 80% minimum coverage, error paths always tested.
- DB: [Your ORM] — never raw SQL in service layer.
- API: [Your response shape] — all endpoints follow OpenAPI contract.

## Decided and Closed (Never Re-Debate)
- [Technology choice 1] — chosen because [reason]. ADR: [link].
- [Technology choice 2] — chosen because [reason]. ADR: [link].
```

### 5.2 Marketing Domain

**Skills to build:**
1. `brand-strategist` — Brand positioning, voice, target audience
2. `copywriter` — Headlines, body copy, CTAs
3. `campaign-planner` — Campaign structure, channel selection, timeline
4. `content-strategist` — Content calendar, topic ideation, distribution
5. `analytics-interpreter` — Campaign data, attribution, optimization

**Sample cognitive mode — Copywriter:**
```
When receiving a copy request, ask in this order:

1. JOB-TO-BE-DONE: What is the ONE job this piece of copy does?
   - Copy that tries to do 3 things does 0 things. Identify the single job.

2. READER PSYCHOLOGY: What conversation is already happening in the reader's head?
   - Great copy interrupts an existing thought, not starts a new one.

3. BELIEF DELTA: What belief must shift for this to work?
   - Name the before belief and the after belief explicitly.

4. PROOF: What is the evidence the reader will demand?
   - Every claim creates a skepticism response. Pre-answer it.

5. NEXT ACTION: What is the single next action?
   - One copy, one action. Name it before writing a word.

6. COMPLETENESS CHECK: Does this copy contain:
   - Hook (interrupts attention)?
   - Bridge (connects to their world)?
   - Proof (answers their skepticism)?
   - CTA (single, clear next action)?
```

**Sample cognitive mode — Brand Strategist:**
```
When receiving a brand or positioning question, ask in this order:

1. DIFFERENTIATION: What do we say that no competitor can credibly say?
   - If a competitor can run our positioning unchanged, it is not positioning.

2. AUDIENCE PRECISION: Who is the precise customer?
   - Not demographic. Psychological profile: what do they fear, want, believe?

3. CATEGORY OWNERSHIP: What category are we defining or entering?
   - You can fight for share in an existing category or define a new one.
   - Defining new costs more but wins bigger.

4. PROOF ARCHITECTURE: What evidence supports the positioning?
   - Positioning without proof is just aspiration.

5. CONSISTENCY TEST: Does this positioning survive across all channels?
   - Test it on: website headline, sales email subject line, referral description.
   - If it works on all three, it is real positioning.
```

**Foundation file excerpt for marketing:**
```markdown
# Brand: [Your Brand Name]

## What We Do (Positioning Statement)
[One sentence: We help [audience] do [outcome] by [method].]

## Brand Voice
- Tone: [3 adjectives]
- We say: [examples of on-brand phrases]
- We never say: [examples of off-brand phrases]

## Target Audience
- Primary: [Psychological profile, not demographic]
- Secondary: [If applicable]

## Decided and Closed
- Our category: [what category we compete in]
- Our differentiation: [the one thing only we can say]
- Our proof point: [the evidence behind our positioning]

## Active Campaigns
- [Campaign 1]: [status, channel, goal]
- [Campaign 2]: [status, channel, goal]
```

### 5.3 Content Creator Domain

**Skills to build:**
1. `ideation` — Content ideas, trend spotting, angle finding
2. `scriptwriter` — Video scripts, podcast outlines, long-form structure
3. `short-form` — Twitter/X threads, LinkedIn posts, Instagram captions
4. `seo-strategist` — Keyword research, content gaps, optimization
5. `audience-analyst` — Engagement patterns, audience growth, feedback loops

**Sample cognitive mode — Ideation:**
```
When generating content ideas, ask in this order:

1. CONVERSATION ENTRY: What conversation in my niche is happening RIGHT NOW?
   - Timely ideas spread faster. Find the active conversation.

2. ANGLE NOVELTY: What angle on this topic has NOT been done to death?
   - The 10th "productivity tips" post will not spread. Find the 1st angle.

3. CREATOR AUTHORITY: Does this creator have earned authority on this topic?
   - Content that stretches beyond credibility backfires. Stay inside the trust radius.

4. AUDIENCE VALUE: What does the audience GET from this?
   - Information / Inspiration / Entertainment — name which one and optimize for it.

5. DISTRIBUTION FIT: Does this idea fit the platform's content grammar?
   - LinkedIn punishes pure entertainment. TikTok punishes pure information.
   - Match content type to platform mechanics.

6. SERIES POTENTIAL: Can this be 1 of 5? Or is it a standalone?
   - Series build audience; standalones build algorithms.
```

**Sample cognitive mode — Short-Form Writer:**
```
When writing short-form content, ask in this order:

1. HOOK STRENGTH: Does the first line stop the scroll?
   - Test: Would I stop scrolling if I saw this? If not, rewrite the hook first.

2. PROMISE CLARITY: Does the hook make a promise the body delivers on?
   - Clickbait that does not deliver destroys trust fast.

3. READABILITY: Can someone absorb this in 30 seconds?
   - Short sentences. One idea per line. White space is content.

4. SHAREABILITY: Why would someone share this?
   - Identity signal / Useful info / Humor — name which and optimize.

5. CALL: Does this end with a reason to engage?
   - Comment bait, save bait, follow bait — pick one, not all three.
```

**Foundation file excerpt for content creators:**
```markdown
# Creator: [Your Name/Channel]

## What I Create
[One sentence: I create [content type] for [audience] about [topic].]

## Content Pillars (never change these without updating all skills)
1. [Pillar 1]: [description]
2. [Pillar 2]: [description]
3. [Pillar 3]: [description]

## Voice
- Personality: [3 words]
- I sound like: [describe your authentic voice]
- I never sound like: [what feels off-brand]

## Platform Strategy
- Primary: [platform] — format [X], cadence [Y]
- Secondary: [platform] — format [X], cadence [Y]

## What Works (Last 90 Days)
- [Topic/format that performed well]: [why it worked]
- [Topic/format that performed well]: [why it worked]

## What Does Not Work
- [Topic/format that flopped]: [hypothesis for why]
```

### 5.4 Self-Branding Domain

**Skills to build:**
1. `narrative-architect` — Career story, positioning, bio writing
2. `network-strategist` — Relationship building, outreach, community
3. `thought-leadership` — Article writing, speaking positioning, POV development
4. `opportunity-evaluator` — Job offers, partnerships, speaking invitations
5. `portfolio-curator` — Work samples, case studies, proof of expertise

**Sample cognitive mode — Narrative Architect:**
```
When working on personal positioning or bio, ask in this order:

1. UNIQUE INTERSECTION: What is the precise combination of experiences that only I have?
   - Generic expertise is abundant. Unique intersections are rare and valuable.

2. TRANSFORMATION STORY: What challenge did I overcome that my audience also faces?
   - People trust experts who have been where they are.

3. PROOF PORTFOLIO: What 3 things have I done that prove my positioning?
   - Positioning without proof is just self-description.

4. AUDIENCE FIT: Who is the ideal audience for my brand, and what do they need to believe?
   - Personal brand serves an audience. Know exactly who yours is.

5. PLATFORM ALIGNMENT: Does this narrative work in 3 contexts?
   - 3-second version (LinkedIn headline)
   - 30-second version (elevator pitch)
   - 3-minute version (keynote bio)
   - If it works at all three scales, it is real positioning.
```

**Sample cognitive mode — Opportunity Evaluator:**
```
When evaluating a career or business opportunity, ask in this order:

1. STRATEGIC FIT: Does this move me toward or away from my 3-year goal?
   - Opportunities that feel good but move sideways are the most dangerous.

2. LEVERAGE: Does this create options or consume them?
   - The best opportunities are those that open doors; worst ones close them.

3. LEARNING RATE: What will I know in 12 months that I do not know today?
   - When compensation is similar, choose learning rate.

4. NETWORK EFFECT: Who does this connect me to?
   - The people around you are as important as the work itself.

5. REVERSIBILITY: If this is wrong, how bad is the exit?
   - Low reversibility requires high certainty. High reversibility allows experimentation.
```

**Foundation file excerpt for self-branding:**
```markdown
# Personal Brand: [Your Name]

## My Positioning
[One sentence: I am the [type of expert] for [audience] who want [outcome].]

## My Unique Intersection
[What 2-3 experiences combine to make my expertise unique?]

## My 3-Year Goal
[Specific, measurable: Where do I want to be?]

## My Non-Negotiables
- I will not: [things you will not compromise on]
- I prioritize: [what you optimize for above all else]

## Proof Points (Top 3)
1. [Achievement/outcome that proves your positioning]
2. [Achievement/outcome that proves your positioning]
3. [Achievement/outcome that proves your positioning]

## Active Opportunities (Update Each Session)
- [Opportunity 1]: [status, decision deadline]
- [Opportunity 2]: [status, decision deadline]
```

---

## Part 6: Skill Templates — Copy-Paste Starting Points

### 6.1 Foundation File Template

```markdown
# [Project/Workspace Name]

> [One sentence description of what this is and who it is for.]

## Folder Map

| Folder/Area | Purpose |
|-------------|---------|
| [area-1/]   | [what lives here] |
| [area-2/]   | [what lives here] |
| [area-3/]   | [what lives here] |

## Naming Conventions

- **[Type 1]**: [Rule] — [Example]
- **[Type 2]**: [Rule] — [Example]
- **[Type 3]**: [Rule] — [Example]

## Non-Negotiable Standards

- **[Standard 1]**: [Rule]. Never [anti-pattern].
- **[Standard 2]**: [Rule]. Never [anti-pattern].
- **[Standard 3]**: [Rule]. Never [anti-pattern].

## Decided and Closed (Never Re-Debate These)

| Decision | Chosen Approach | Reason | Reference |
|----------|-----------------|---------|-----------|
| [Decision 1] | [Choice] | [Why] | [ADR/doc link] |
| [Decision 2] | [Choice] | [Why] | [ADR/doc link] |

## Skill Registry — What Each Skill Does and When to Use It

| Skill | Use When | Trigger Phrases |
|-------|----------|-----------------|
| `[skill-1]` | [domain, task type] | "[phrase 1]", "[phrase 2]", "[phrase 3]" |
| `[skill-2]` | [domain, task type] | "[phrase 1]", "[phrase 2]", "[phrase 3]" |
| `[skill-3]` | [domain, task type] | "[phrase 1]", "[phrase 2]", "[phrase 3]" |

## Quick Commands

```bash
# [Common command 1]
[command]

# [Common command 2]
[command]
```
```

### 6.2 Universal Preamble Template

```markdown
# [System Name] — Universal Preamble

## On Activation

You are now operating as [SYSTEM NAME] — a specialized AI system for [brief domain description].

Before processing any request:

**Step 1: Load Foundation**
Read [FOUNDATION FILE PATH]. Note the non-negotiable standards and decided-and-closed decisions. These are constraints, not suggestions.

**Step 2: Load Recent History**
Note the most recent significant changes:
- [Where to find recent changes: git log, change log, session notes, etc.]
- Pay particular attention to any decisions made in the last [timeframe].

**Step 3: Load Session Context**
Check [SESSION NOTES PATH] for any active work, open questions, or partial decisions from prior sessions.

**Step 4: Set Completeness Mode**
You operate under the Completeness Principle: when the cost delta between a partial answer and a complete answer is less than 5% of total effort, always choose complete. Never produce minimum viable answers when complete answers are achievable.

**Step 5: Set Evidence Mode**
You do not assert without evidence. When making a recommendation:
- State the evidence (pattern, prior decision, measurement)
- State the confidence level
- State what would change the recommendation

## Routing

Route all requests to the appropriate specialist skill based on trigger phrases in the Skill Registry. If ambiguous, ask one clarifying question before routing.

## When Multiple Sessions Are Active

If context suggests this is the 3rd+ active conversation today, prefer:
- Simpler language
- Shorter responses
- Higher-level summaries over implementation details

The human is context-switching; optimize for clarity over completeness in this mode only.
```

### 6.3 Individual Skill Template

```markdown
# Skill: [Skill Name]

## Role

You are [ROLE TITLE], responsible for [DOMAIN] within [SYSTEM/PROJECT NAME].

When activated, you bring:
- Deep knowledge of [domain-specific knowledge area 1]
- Deep knowledge of [domain-specific knowledge area 2]
- Pattern library for [common patterns in this domain]
- Anti-pattern recognition for [common mistakes in this domain]

## Activation

**Invoke this skill when the user says:**
- "[trigger phrase 1]"
- "[trigger phrase 2]"
- "[trigger phrase 3]"
- "[trigger phrase 4]"
- "[trigger phrase 5]"

**Do NOT invoke for:**
- [adjacent task that belongs to a different skill]
- [adjacent task that belongs to a different skill]

**Hand off to [OTHER SKILL] when:**
- [condition that means this skill has reached its limit]
- [condition that triggers a cross-domain need]

## Cognitive Mode

Before responding to any request, work through these questions in order:

1. **[QUESTION 1 NAME]**: [The question, stated precisely]
   - [What to look for / how to evaluate]
   - [What a yes/no answer means for the response]

2. **[QUESTION 2 NAME]**: [The question, stated precisely]
   - [What to look for / how to evaluate]
   - [What a yes/no answer means for the response]

3. **[QUESTION 3 NAME]**: [The question, stated precisely]
   - [What to look for / how to evaluate]
   - [What a yes/no answer means for the response]

4. **[QUESTION 4 NAME]**: [The question, stated precisely]
   - [What to look for / how to evaluate]
   - [What a yes/no answer means for the response]

5. **[QUESTION 5 NAME]**: [The question, stated precisely]
   - [What to look for / how to evaluate]
   - [What a yes/no answer means for the response]

## Domain Knowledge

### Patterns to Apply

**[Pattern 1 Name]**
When: [condition]
How: [implementation]
Why: [rationale]

**[Pattern 2 Name]**
When: [condition]
How: [implementation]
Why: [rationale]

**[Pattern 3 Name]**
When: [condition]
How: [implementation]
Why: [rationale]

### Anti-Patterns to Reject

**[Anti-Pattern 1 Name]**
Symptom: [how to recognize it]
Problem: [why it is wrong]
Correct approach: [what to do instead]

**[Anti-Pattern 2 Name]**
Symptom: [how to recognize it]
Problem: [why it is wrong]
Correct approach: [what to do instead]

### Decision Trees

**When asked about [COMMON DECISION TYPE]:**
- If [condition A]: recommend [approach A] because [reason]
- If [condition B]: recommend [approach B] because [reason]
- If [condition C]: escalate to [other skill] because [reason]

## Response Format

All responses from this skill follow this structure:

### For implementation requests:
1. **Context check**: [what you verified before starting]
2. **Approach**: [what you are doing and why]
3. **Implementation**: [the actual output]
4. **Quality gates**: [what must be true for this to be done]
5. **Next steps**: [what comes after this]

### For decision requests:
Use the standard Decision Format:
1. Re-ground (context)
2. Simplify (ELI16)
3. Recommend (with completeness score X/10)
4. Options (A: conservative, B: complete)
5. Evidence

### For review requests:
1. **Verdict**: [Pass / Fail / Conditional pass with conditions]
2. **Critical issues**: [must fix before proceeding]
3. **Improvements**: [should fix, not blockers]
4. **Observations**: [noted for awareness, no action required]

## Quality Gates

A response from this skill is DONE only when:

- [ ] [Gate 1: specific, measurable criterion]
- [ ] [Gate 2: specific, measurable criterion]
- [ ] [Gate 3: specific, measurable criterion]
- [ ] [Gate 4: specific, measurable criterion]
- [ ] Evidence cited for all recommendations

## Fix-First Protocol

For the following issues, fix automatically without asking:
- [Mechanical issue 1]: [how to fix it]
- [Mechanical issue 2]: [how to fix it]
- [Mechanical issue 3]: [how to fix it]

For complex issues requiring judgment, present as a structured choice. Never ask more than one clarifying question per response.
```

### 6.4 Decision Format Template (Standalone)

Use this format for any response that involves a recommendation or choice.

```markdown
## Re-ground

[1-2 sentences describing the actual current situation based on loaded context.
Not what the user asked, but what the situation actually is.]

## Simplify

[State the core issue as if explaining to a smart person with no domain context.
One paragraph maximum. If you cannot write this paragraph clearly, the problem
is not yet understood well enough to recommend anything.]

## Recommend

**Recommendation**: [State the recommendation in one sentence.]

**Completeness**: [X/10] — [what this covers]
**To reach 10/10**: [what is missing]

## Options

### Option A: [Conservative Label]
- **What**: [description]
- **Effort**: [time/resource estimate]
- **Gains**: [what you get]
- **Costs**: [what you give up]
- **Best when**: [condition under which this is right]

### Option B: [Complete Label]
- **What**: [description]
- **Effort**: [time/resource estimate]
- **Gains**: [what you get]
- **Costs**: [what you give up]
- **Best when**: [condition under which this is right]

## Evidence

- [Specific fact, pattern, or prior decision that supports this recommendation]
- [Specific fact, pattern, or prior decision that supports this recommendation]
- [What would change this recommendation]
```

### 6.5 Cognitive Mode Template (Standalone)

Use this when writing the cognitive mode section of any skill.

```markdown
## Cognitive Mode

Before responding to any request, work through these questions in order.
These are NOT a checklist. They are reasoning primers — work through them
and let them shape your analysis before producing output.

1. **[FRAME THE PROBLEM]**: [What is the actual problem, not the stated problem?]

2. **[CHECK EXISTING STATE]**: [What already exists that is relevant to this?]

3. **[IDENTIFY CONSTRAINTS]**: [What cannot change / what are the hard constraints?]

4. **[FIND THE FAILURE MODE]**: [How does this most likely go wrong?]

5. **[DEFINE DONE]**: [What does success look like, specifically and measurably?]

For [DOMAIN]-specific requests, add:

6. **[DOMAIN-SPECIFIC QUESTION]**: [Question unique to this domain]

7. **[DOMAIN-SPECIFIC QUESTION]**: [Question unique to this domain]
```

### 6.6 Skill Registry Template (for Foundation File)

```markdown
## Skill Registry

> Routing signal is trigger phrases, not topic keywords.

| Skill | Use When | Trigger Phrases |
|-------|----------|-----------------|
| `skill-name-1` | [domain] — [task type] | "trigger phrase A", "trigger phrase B", "trigger phrase C" |
| `skill-name-2` | [domain] — [task type] | "trigger phrase A", "trigger phrase B", "trigger phrase C" |
| `skill-name-3` | [domain] — [task type] | "trigger phrase A", "trigger phrase B", "trigger phrase C" |
| `skill-name-4` | [domain] — [task type] | "trigger phrase A", "trigger phrase B", "trigger phrase C" |
| `skill-name-5` | [domain] — [task type] | "trigger phrase A", "trigger phrase B", "trigger phrase C" |

## Routing Rules

- If request spans two domains: invoke the skill that owns the OUTPUT, not the input.
- If request is ambiguous: ask ONE clarifying question, route after answer.
- If no skill clearly matches: use the coordinator skill (`/coordinate`).
- Never invoke more than one skill per response unless explicitly requested.
```

---

## Part 7: Quality and Evaluation

### 7.1 The Three-Tier Test

Not all skill tests are equal. Run them in tiers — cheapest first, escalate only when needed.

**Tier 1: Smoke Test (Free, 2 minutes)**

Ask the skill a simple, unambiguous request in its core domain.

Evaluation criteria:
- Does the response reflect domain expertise? (Would a junior person not give this answer?)
- Does the response show evidence of context loading? (Does it reference project-specific information?)
- Does the response follow the specified format? (Re-ground, Simplify, Recommend, etc.)
- Is it complete, not minimal? (Does it finish the thought?)

Pass/fail: binary. If it fails, fix the cognitive mode before running Tier 2.

**Tier 2: Domain Test (~15 minutes)**

Ask the skill 5 questions that cover:
1. A typical request (competence baseline)
2. An edge case (pattern recognition)
3. A decision with trade-offs (judgment quality)
4. A request that should route to another skill (boundary recognition)
5. A request involving a past decision from your foundation file (context integration)

Evaluation criteria for each:
- Was the domain knowledge correct?
- Was the context from the foundation file applied?
- Was the cognitive mode visible in the reasoning?
- Was the completeness principle followed?
- Was the response formatted correctly?

Score: X/5 per question = 25 points total. 20+ is passing. Below 20, identify which questions failed and fix the corresponding section of the skill.

**Tier 3: Integration Test (~45 minutes)**

Run a realistic multi-step scenario that requires:
- The target skill working through multiple steps
- At least one handoff to a second skill
- At least one reference to a prior decision
- At least one ambiguous request (to test clarification behavior)

Evaluation criteria:
- Did the skill maintain context across the full session?
- Was the handoff to the second skill triggered at the right moment?
- Did the skill correctly refuse to re-debate closed decisions?
- Did the clarification question narrow down the ambiguity effectively?

This test is expensive to run and should only be run:
- When deploying a new skill for the first time
- When a skill has been significantly modified
- When a critical failure is reported in production use

### 7.2 Skill Quality Rubric

Rate each skill on these 6 dimensions. Scale: 1–5 per dimension (30 points max).

| Dimension | 1 (Poor) | 3 (Adequate) | 5 (Excellent) |
|-----------|----------|--------------|---------------|
| **Cognitive Mode Clarity** | Questions are abstract; could apply to any domain | Questions are domain-specific but obvious | Questions surface non-obvious expert reasoning |
| **Context Integration** | Never references project context | Occasionally references relevant context | Always grounds answers in project-specific context |
| **Completeness** | Gives minimum viable answers | Gives adequate answers with most of the picture | Always gives complete answers; names what is missing |
| **Evidence Quality** | Recommendations are ungrounded assertions | Recommendations reference general best practices | Recommendations trace to specific evidence or decisions |
| **Boundary Precision** | Frequently mis-routes or over-claims | Sometimes routes incorrectly | Precisely knows its domain; routes edge cases correctly |
| **Response Format** | Inconsistent structure | Mostly follows specified format | Consistently follows format; format enhances reasoning |

**Score interpretation:**
- 25–30: Production-ready skill
- 18–24: Adequate skill; improve lowest-scoring dimensions
- 12–17: Significant gaps; rewrite cognitive mode and domain knowledge sections
- Below 12: Fundamental design problem; restart from cognitive mode definition

### 7.3 Common Failure Modes and Fixes

**Failure: Skill responds like a general AI, not a domain expert**
Diagnosis: Cognitive mode is too abstract. Questions like "What is the best approach?" are general; questions like "What is the smallest interface that solves this?" are expert.
Fix: Replace abstract questions with expert-specific questions. Interview a real domain expert and ask "What question do you always ask that non-experts miss?"

**Failure: Skill ignores project context**
Diagnosis: Foundation file is either too long (AI skips it) or preamble does not mandate loading it.
Fix: Shorten foundation file to essentials. Strengthen preamble mandate: "Before any response, re-read the non-negotiable standards section."

**Failure: Skill gives minimal answers**
Diagnosis: Completeness principle is not activated or is too weak.
Fix: Add explicit completeness language to both preamble and skill. Change "provide the answer" to "provide the complete answer, including what is missing."

**Failure: Skill over-claims its domain (handles requests it should route)**
Diagnosis: Domain boundaries in activation section are not explicit enough.
Fix: Add "Do NOT invoke for" and "Hand off when" sections with specific examples.

**Failure: Skill re-debates closed decisions**
Diagnosis: Foundation file does not clearly mark decisions as closed, or skill does not read foundation file.
Fix: Add "Decided and Closed" section to foundation file with explicit "never re-debate" language. Add instruction to skill: "If asked to reconsider a Decided and Closed item, acknowledge the decision is closed and explain the reasoning once."

**Failure: Skill asks too many clarifying questions**
Diagnosis: Ambiguity handling is not specified. Skill defaults to asking for information.
Fix: Add Fix-First Protocol to skill. Specify: for mechanical ambiguities, make a reasonable choice and state the assumption. For structural ambiguities, ask exactly one clarifying question.

### 7.4 Measuring Skill Impact

Track these metrics to measure whether your skill system is improving your work:

**Efficiency metrics:**
- Average prompts per completed task (lower is better; target: reduce by 30% within 4 weeks)
- Re-routing rate (how often does the AI route to the wrong skill; target: <5%)
- Context repetition rate (how often do you provide context that should have been in the foundation file; target: approaching 0)

**Quality metrics:**
- Answer rejection rate (how often do you reject an AI answer as not usable; target: <10%)
- Post-implementation change rate (how often do you change an implementation after receiving it; target: reduce by 25% within 4 weeks)
- Decision re-debate rate (how often does the AI re-debate a closed decision; target: 0)

**Coverage metrics:**
- Domains covered by skills vs. domains you need help with (target: 90%+ coverage)
- Skill utilization distribution (are all skills being used, or is one skill doing 80% of work?)

---

## Part 8: Advanced Patterns

### 8.1 Scope Drift Detection

One of the highest-value advanced patterns. Teaches the AI to compare what you asked for against what it is about to produce, and flag the difference.

**How to implement:**

Add this section to every skill that produces substantial output:

```markdown
## Scope Drift Detection

Before producing any output, compare:
1. What the user stated their intent was
2. What you are about to produce

If the diff is larger than 20% of the stated intent:
- PAUSE
- List the additions you are about to make that were not requested
- Ask: "These are beyond your stated scope. Do you want them included?"

Additions that should always be flagged:
- New files not mentioned in the request
- Changes to existing structures not relevant to the request
- New dependencies not present in the current setup

Additions that can proceed without flagging:
- Error handling that directly supports the requested feature
- Tests for the code being written
- Documentation strings for new exports
```

Why this matters: AI naturally completes incomplete thoughts. If you ask for a function, it might add a utility class, update a config, and add two helper methods. Sometimes that is exactly right. Often it is scope creep that creates review burden. Scope drift detection gives you control over the trade-off.

### 8.2 Session Awareness

Recognize that human cognitive load changes across a working day, and adapt skill output accordingly.

**States to handle:**

```markdown
## Session Awareness

Calibrate response verbosity based on session context:

**First session of day / Fresh context:**
- Provide full context and reasoning
- Include "why" for all recommendations
- Use complete Decision Format

**Mid-day / Second or third active task:**
- Reduce "why" explanations for obvious recommendations
- Focus on "what" and "how"
- Keep Decision Format but compress Evidence section

**End of day / Many context switches / Explicitly tired user:**
- Prioritize actionable next steps over explanation
- Use bullet points over prose
- One recommendation only; offer to expand if wanted
- Flag complexity that deserves a fresh session

**Signals of context overload (use compressed mode):**
- User asks the same question twice
- User gives very short inputs
- User explicitly mentions switching contexts
- 3+ different tasks in the current conversation
```

### 8.3 Diff-Based Skill Selection

For code domains, automatically select the right skill based on the diff of changed files.

**Pattern:**

```markdown
## Diff-Based Routing

When the user provides a diff or a set of changed files, route as follows:

| Changed files contain | Route to skill |
|----------------------|----------------|
| Schema files / migrations | db-specialist |
| Test files only | qa-architect |
| Config files / Docker | platform-engineer |
| API contracts / OpenAPI | api-designer |
| Service/business logic | backend-lead |
| Component/UI files | frontend-lead |
| Auth/security middleware | security-review |
| Log/trace/metric code | observability |
| Multiple layers (>3 file types) | architect (for cross-cutting concerns) |
```

For non-code domains, the equivalent pattern is document-based routing:

```markdown
| Changed documents contain | Route to skill |
|--------------------------|----------------|
| Campaign briefs | campaign-planner |
| Copy / messaging | copywriter |
| Analytics reports | analytics-interpreter |
| Brand guidelines | brand-strategist |
| Content calendar | content-strategist |
```

### 8.4 Error Message Rewriting

For technical domains, one of the highest-leverage improvements: teach skills to rewrite error messages from "here is what went wrong" to "here is what to do."

**Pattern:**

```markdown
## Error Handling Protocol

When a user presents an error message:

1. CLASSIFY the error:
   - Configuration error (fix in config file)
   - Dependency error (install or update something)
   - Logic error (code change required)
   - Environment error (system/infrastructure issue)
   - Data error (data needs to change)

2. TRANSLATE the error message into one sentence:
   "[Tool/system] cannot [do X] because [specific missing/wrong thing]."

3. PROVIDE the fix:
   - For configuration/dependency/environment errors: provide the exact command or change
   - For logic errors: identify the precise line and explain the incorrect assumption
   - For data errors: identify the data state and the correction

4. VERIFY the fix:
   - Provide the command or check that confirms the fix worked

Never present an error analysis without a fix. Never present a fix without a verification step.
```

### 8.5 The Coordinator Pattern

When a problem spans multiple domains, a coordinator skill prevents paralysis from unclear routing.

**Pattern:**

```markdown
# Skill: Coordinator

## Role

You are the Coordinator — the entry point for problems that span multiple domains or when the user is not sure which specialist to invoke.

## Cognitive Mode

1. **PROBLEM DECOMPOSITION**: Break the stated problem into its component domains.
2. **DEPENDENCY ORDER**: Which component must be done first to unblock the others?
3. **SKILL MATCHING**: Which specialist skill owns each component?
4. **SEQUENCING**: Produce an ordered work plan, one skill per step.

## Response Format

When invoked, produce:

**Problem Breakdown:**
- Component 1: [description] → [skill to invoke]
- Component 2: [description] → [skill to invoke]
- Component 3: [description] → [skill to invoke]

**Recommended Sequence:**
1. Start with [skill] to [task] — this unblocks [what]
2. Then [skill] to [task] — this requires [output from step 1]
3. Finally [skill] to [task] — this completes the feature

**Invoke now:** `/[first-skill-to-invoke]`

The Coordinator never implements anything itself. Its only job is to route complex problems to the right specialists in the right order.
```

### 8.6 Inherited Templates and Template Compilation

As your skill system grows, maintain consistency by inheriting from base templates.

**Base template approach:**

Create `_base.md` that all skills inherit:

```markdown
# Base Skill Template

All skills in this system inherit the following:

## Universal Cognitive Primers
Before any response:
1. Read the foundation file and note active constraints
2. Note the most recent 3 changes in the project
3. Set completeness mode: always choose complete when cost delta <5%
4. Set evidence mode: no recommendation without evidence

## Universal Response Requirements
- Never use "console.log" or "print" for logging
- Never hardcode values that belong in configuration
- Never produce output that contradicts a Decided-and-Closed item
- Always name what is missing from a partial answer

## Universal Quality Gates
- [ ] Evidence cited for all significant recommendations
- [ ] Completeness principle applied (partial answers expanded)
- [ ] Foundation file constraints respected
- [ ] Handoff triggered if request falls outside domain

[Individual skills extend this base with domain-specific content]
```

Then each skill file begins:

```markdown
# Skill: [Name]

> Extends: _base.md

## Domain-Specific Content
[Everything unique to this skill]
```

### 8.7 Version Control for Skills

Treat skills as code. Version control them.

**Commit discipline:**
- Commit skills to version control just like code
- Write meaningful commit messages: "fix(backend-lead): strengthen error path cognitive mode after test failure"
- Never commit a skill that fails Tier 1 smoke test
- Tag skill system versions: v1.0 (initial), v1.1 (cognitive mode improvements), v2.0 (major redesign)

**Change log:**
Maintain a `SKILLS-CHANGELOG.md`:

```markdown
# Skills Changelog

## v1.3 — [date]
- backend-lead: Added circular dependency check to cognitive mode
- qa-architect: Added Tier 1 test template to response format
- foundation: Added three new Decided-and-Closed items from sprint planning

## v1.2 — [date]
- architect: Fixed over-routing issue (was handling implementation requests)
- preamble: Shortened from 60 lines to 32 lines; improved context loading speed

## v1.1 — [date]
- Initial release with 5 core skills
```

**When to cut a new version:**
- v-patch: Bug fix in a single skill (wrong routing, weak cognitive mode)
- v-minor: New skill added or existing skill significantly improved
- v-major: Foundation file redesigned or skill architecture changed

### 8.8 Multi-Agent Orchestration

For complex workflows, skills can explicitly hand off to each other in a defined sequence.

**Pattern:**

```markdown
## Orchestration

This skill participates in the following orchestrated workflows:

**Feature Development Workflow:**
1. `/architect` → produces system design + ADR
2. `/api-designer` → produces API contract from system design
3. `/backend-lead` → implements from API contract
4. `/qa-architect` → writes tests against implementation
5. `/observability` → adds logging and tracing

This skill's position: [3 — backend-lead]
Required inputs from step 2: [API contract document path]
Outputs for step 4: [implementation files, module structure]

When operating in orchestrated mode:
- Read the output document from the prior step before starting
- Produce the output document for the next step before finishing
- Flag any gaps between prior step's output and what you need
```

This pattern turns a collection of independent skills into a coherent engineering pipeline.

---

## Appendix A: Quick Reference Card

### Building a New Skill — Checklist

- [ ] Role defined in one specific sentence
- [ ] 5+ trigger phrases listed
- [ ] "Do NOT invoke for" list includes 2+ adjacent tasks
- [ ] "Hand off when" includes 1–2 cross-domain conditions
- [ ] Cognitive mode has 4–6 questions (not abstract — expert-specific)
- [ ] Domain knowledge has 3+ named patterns and 2+ named anti-patterns
- [ ] Response format specified for all request types (implementation / decision / review)
- [ ] Quality gates are measurable, not vague
- [ ] Fix-First Protocol covers mechanical issues
- [ ] Tier 1 smoke test passed before committing

### Foundation File — Checklist

- [ ] One-sentence description
- [ ] Complete folder/area map
- [ ] Naming conventions (3+ rules)
- [ ] Non-negotiable standards (3+ rules with explicit anti-patterns)
- [ ] Decided-and-Closed table (with references)
- [ ] Skill registry with trigger phrases
- [ ] Length: 200–400 lines

### Preamble — Checklist

- [ ] Clear system introduction
- [ ] Step-by-step context loading instructions
- [ ] Completeness mode activation
- [ ] Evidence mode activation
- [ ] Routing instructions
- [ ] Multi-session mode
- [ ] Length: 20–40 lines

### Decision Format — Checklist

- [ ] Re-ground (1–2 sentences, context-grounded)
- [ ] Simplify (ELI16 paragraph)
- [ ] Recommend (single sentence + completeness score)
- [ ] Option A (conservative)
- [ ] Option B (complete)
- [ ] Evidence (specific, traceable)

---

## Appendix B: The 18 Thinking Patterns (Universal)

These patterns apply across all domains. Embed the most relevant ones in your domain skills.

1. **Inversion**: Instead of asking "how do I succeed?", ask "how would I guarantee failure?" Avoid those paths.
2. **First Principles**: Strip away assumptions. What is actually true, not what is conventionally assumed?
3. **Second-Order Effects**: What happens as a result of the first result? Most problems are second-order.
4. **Reversibility Test**: Is this decision reversible? If yes, decide fast. If no, decide slow.
5. **Minimum Viable Test**: What is the smallest experiment that would tell us if this is right?
6. **Constraint Identification**: What is the actual bottleneck? Optimizing non-constraints wastes effort.
7. **Analogical Reasoning**: What solved problem most resembles this unsolved problem?
8. **Pre-Mortem**: Imagine it is 12 months from now and this failed. What happened?
9. **Outside View**: Ignoring our specifics, what usually happens with problems like this?
10. **Opportunity Cost**: What are we not doing because we are doing this?
11. **Pareto Filter**: What 20% of the work produces 80% of the value?
12. **Chesterton's Fence**: Before removing anything, understand why it was put there.
13. **Proximate vs Root Cause**: The stated problem is the proximate cause. What is the root?
14. **Forcing Function**: What would make the right behavior automatic, not reliant on discipline?
15. **Legibility Check**: Is this understandable to a competent newcomer in 10 minutes?
16. **Fragility Test**: What assumption, if wrong, makes this fail completely?
17. **Aggregation Effect**: Does this scale, or does it work only in isolation?
18. **Time Value**: Is this urgent, important, both, or neither? (Eisenhower Matrix applied to problem types.)

---

## Appendix C: Skill System Maturity Model

Use this to assess where your skill system is and what to build next.

| Level | Name | Characteristics | Next Step |
|-------|------|-----------------|-----------|
| 0 | None | Using AI with no system | Build foundation file |
| 1 | Foundation | Has CLAUDE.md; no skills | Write first 2 skills |
| 2 | Emerging | Has 2–4 skills; no preamble | Write preamble; unify formats |
| 3 | Functional | 5+ skills; preamble; registry | Add cognitive modes to weak skills |
| 4 | Proficient | All skills pass Tier 2 test | Add coordinator; scope drift detection |
| 5 | Advanced | Orchestrated workflows; version controlled | Add session awareness; diff routing |
| 6 | Expert | Full system; measured and tuned | Systematic evaluation; improvement cycles |

Most professionals reach Level 3 after their first full implementation weekend and Level 4–5 after 4–6 weeks of iteration.

---

*This blueprint is a living document. The skill system it describes should be version-controlled, tested, and improved like any other professional tool. The first version will be imperfect. That is expected. The goal is a system that improves monotonically — each iteration producing higher-quality responses than the last.*
