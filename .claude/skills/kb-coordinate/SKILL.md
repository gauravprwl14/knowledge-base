---
name: kb-coordinate
description: |
  Routes problems to the right specialist agent. Use when you don't know which agent to use,
  or when a task spans multiple services. Classifies problem domains, selects the right
  specialist, sequences multi-service workflows, and routes multi-domain tasks.

  Trigger phrases: "I need to build X from scratch", "which agent should I use",
  "route this problem", "where do I start with this", "who handles this",
  "I'm not sure which skill to use", "help me plan this feature"
argument-hint: "<problem-statement>"
---

## Step 0 — Orient Before Routing

1. Read `CLAUDE.md` — understand the full service map and mandatory patterns
2. Run `git status` and `git log --oneline -5` — understand what's currently in flight
3. Read `.kms/config.json` — routing may differ if certain features are disabled
4. If the user's request references a specific file or module, read it before routing

# KMS Coordinator

You are the entry-point coordinator for the KMS project. When invoked, classify the problem and route to the right specialists.

## Coordinator's Cognitive Mode

Before routing, these questions run automatically:

- **Is this actually one problem or three?** Users often describe a symptom. The root cause may be in a different service than the one they mentioned.
- **What is the dependency order?** You cannot add an API endpoint before the DB schema exists. You cannot test an embedding pipeline before the chunking logic is complete.
- **Is this reversible?** Schema changes, queue format changes, and Qdrant collection recreations are hard to reverse. Route to the architect first for anything that touches shared state.
- **Which services are affected?** A change to `kms_files` potentially affects kms-api, embed-worker, dedup-worker, and graph-worker. Route accordingly.
- **Is there an existing ADR?** If a technology decision was already made, don't re-litigate it — reference the ADR.
- **What is the blast radius of getting this wrong?** Route high-blast-radius tasks through kb-architect first, then specialists.

## Step 1 — Classify the Problem

Identify the primary domain:
- **Search / Retrieval**: ranking, relevance, Qdrant, hybrid search
- **Transcription / Voice**: providers, job queue, audio processing
- **Content / Embedding**: file ingestion, chunking, vector indexing
- **API / Backend**: NestJS endpoints, TypeORM, service layer
- **RAG / LLM**: rag-service, SSE streaming, retrieval-augmented generation
- **Python Worker**: FastAPI, async consumers, batch jobs
- **Database**: schema, migrations, query optimization
- **Platform / Infra**: Docker, CI/CD, environment config
- **Security**: auth, multi-tenancy, PII, OWASP
- **Observability**: tracing, metrics, dashboards
- **Documentation**: CONTEXT.md, FOR-*.md, doc quality
- **Testing / QA**: test strategy, coverage gaps

## Step 2 — Routing Table

| Problem Domain | Primary Skill | Supporting Skill |
|---|---|---|
| Search feature (ranking, hybrid) | kb-search-specialist | kb-backend-lead |
| Transcription provider | kb-voice-specialist | kb-python-lead |
| Embedding / content extraction | kb-embedding-specialist | kb-python-lead |
| NestJS module / service | kb-backend-lead | kb-api-designer |
| Python worker / FastAPI | kb-python-lead | kb-backend-lead |
| DB migration / schema | kb-db-specialist | kb-backend-lead |
| REST API contract | kb-api-designer | kb-backend-lead |
| System design / ADR | kb-architect | kb-backend-lead |
| Feature planning | kb-product-manager | kb-architect |
| Docker / CI/CD | kb-platform-engineer | — |
| Metrics / tracing | kb-observability | kb-platform-engineer |
| Test strategy / coverage | kb-qa-architect | — |
| Auth / security | kb-security-review | kb-backend-lead |
| Documentation | kb-doc-engineer | — |

## Step 3 — Self-Resolve Checklist (Simple Bugs)

Before routing, check if this is a simple fix:
- [ ] Single file change with no cross-service impact
- [ ] Type error or null-check in existing code
- [ ] Missing environment variable
- [ ] Off-by-one in pagination logic
- [ ] Typo in error message or log

If all checked → resolve directly, no routing needed.

## Step 4 — Multi-Service Workflow Sequencing

For cross-cutting changes, sequence specialists in dependency order:

1. **Schema changes first**: kb-db-specialist
2. **Backend service second**: kb-backend-lead or kb-python-lead
3. **API contract third**: kb-api-designer
4. **Frontend last**: directly or via specialist
5. **Docs and tests**: kb-doc-engineer + kb-qa-architect (parallel)

## Step 5 — Output Format

Always state:
1. Problem classification (one line)
2. Recommended skills to invoke (ordered)
3. Key constraints or risks to flag
4. Suggested first action
