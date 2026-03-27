# Skill Domains — Cross-Domain Expert AI System

This folder contains production-quality Claude Code skill systems built using the **gstack meta-pattern** — the same architecture powering world-class AI assistant frameworks.

## What's Here

| Domain | Skills | Purpose |
|--------|--------|---------|
| [`marketing/`](./marketing/) | 7 skills | CMO → campaign → copy → analytics → SEO → email |
| [`content-creation/`](./content-creation/) | 7 skills | Strategy → writing → scripts → repurposing → editing → calendars |
| [`self-branding/`](./self-branding/) | 6 skills | Identity → LinkedIn → portfolio → story → visibility |

**Total: 20 specialist skills across 3 domains (plus 3 routing coordinators)**

---

## The Pattern Behind These Skills

Every skill in this system is built on 7 design principles extracted from gstack:

1. **Specialization Over Generality** — Each skill is a distinct cognitive mode (CMO, Direct Response Copywriter, Editorial Director), not "helpful assistant"
2. **Context Over Instructions** — Skills load relevant files and context before doing any work
3. **Completeness Over Speed** — Always prefer the complete version when AI cost delta is <5%
4. **Rigor Over Vibes** — 8-15 embedded thinking patterns per skill, plus quality checklists
5. **Actionability Over Reporting** — Fix-First: auto-do mechanical work, batch decisions
6. **Transparency Over Convenience** — Show reasoning, calibration scores, both time scales
7. **Tests Over Promises** — Quality checklist gates before any deliverable is done

---

## How to Use These Skills

### Option A: With Claude Code (Recommended)

Copy any skill folder to your project's `.claude/skills/` directory:

```bash
cp -r domains/marketing/mkt-strategist .claude/skills/
```

Then invoke with:
```
/mkt-strategist I need a go-to-market strategy for our B2B SaaS product targeting mid-market HR teams
```

### Option B: As a Prompt Template

Copy the content of any `SKILL.md` and use it as a system prompt with any LLM.

### Option C: As Reference Architecture

Use the skill structure as a blueprint to build your own domain skills — see the tutorial at `docs/tutorial/SKILL-SYSTEM-BLUEPRINT.md`.

---

## Domain Quick Reference

### Marketing (`/mkt-*`)

| Skill | Use When | Trigger Phrases |
|-------|----------|-----------------|
| `mkt-coordinate` | Problem spans multiple marketing areas | "I need to grow my business", "marketing strategy" |
| `mkt-strategist` | Positioning, GTM, competitive analysis | "go-to-market", "positioning", "market entry" |
| `mkt-copywriter` | Headlines, CTAs, landing pages, ads | "write copy", "improve conversion", "headline" |
| `mkt-campaign-planner` | Multi-channel campaigns, launch plans | "plan a campaign", "product launch", "campaign calendar" |
| `mkt-analytics-advisor` | Metrics, attribution, A/B testing | "analyze performance", "attribution", "A/B test" |
| `mkt-seo-specialist` | Keyword research, on-page, technical SEO | "SEO strategy", "keyword research", "rank for" |
| `mkt-email-marketer` | Sequences, segmentation, deliverability | "email sequence", "nurture campaign", "open rates" |

### Content Creation (`/content-*`)

| Skill | Use When | Trigger Phrases |
|-------|----------|-----------------|
| `content-coordinate` | Problem spans multiple content areas | "content strategy", "I need to create content" |
| `content-strategist` | Editorial strategy, pillar content, distribution | "content strategy", "pillar content", "distribution plan" |
| `content-writer` | Long-form, blog posts, articles | "write a blog post", "long-form content", "article" |
| `content-script-writer` | Video scripts, podcast outlines, reels | "script for video", "YouTube script", "podcast episode" |
| `content-repurposer` | 1 piece → multiple formats | "repurpose this", "turn this into", "content multiplier" |
| `content-editor` | Strengthen, critique, improve existing content | "edit this", "improve my writing", "make this better" |
| `content-calendar-planner` | Planning, scheduling, production systems | "content calendar", "publishing schedule", "content plan" |

### Self-Branding (`/brand-*`)

| Skill | Use When | Trigger Phrases |
|-------|----------|-----------------|
| `brand-coordinate` | Problem spans multiple branding areas | "personal brand", "build my brand" |
| `brand-identity-designer` | Positioning, voice, visual identity | "brand positioning", "define my brand", "brand identity" |
| `brand-linkedin-specialist` | LinkedIn profile, content, growth | "LinkedIn profile", "LinkedIn strategy", "LinkedIn content" |
| `brand-portfolio-advisor` | Case studies, work samples, presentation | "portfolio", "case study", "showcase my work" |
| `brand-story-architect` | Personal narrative, origin story, mission | "personal story", "brand narrative", "my why" |
| `brand-visibility-planner` | Speaking, media, partnerships, PR | "speaking opportunities", "get featured", "media coverage" |

---

## Key Files

| File | Purpose |
|------|---------|
| `docs/tutorial/SKILL-SYSTEM-BLUEPRINT.md` | Complete guide to build skills for any domain |
| `docs/agents/GAP-ANALYSIS-GSTACK.md` | Gap analysis vs gstack + improvement roadmap |
| `*/shared/variables.md` | Domain constants, terminology, formats |
| `*/shared/patterns.md` | Shared templates and frameworks |
| `*/CONTEXT.md` | Routing guide for the domain |

---

## Building Your Own Domain

Follow the tutorial at `docs/tutorial/SKILL-SYSTEM-BLUEPRINT.md`. Quick start:

1. Create `domains/your-domain/` folder structure
2. Write `shared/variables.md` (terminology, formats, constants)
3. Write `shared/patterns.md` (templates you'll reuse)
4. For each skill, create a folder with `SKILL.md` following the template
5. Start with a coordinator skill (`your-domain-coordinate`) that routes to specialists
6. Test each skill by invoking it with a real problem

**Time estimate:** 2-4 hours for a 5-skill domain system
