# KMS Agent System — Usage Guide

This guide covers common workflow patterns, when to use each agent, how to chain agents together, and example invocations.

---

## Common Workflow Patterns

### Pattern 1: New Search Feature

**Goal:** Add a new search capability (e.g., filter by file type, boost recent documents).

**Agent Chain:**

```
/kb-product-manager "Define acceptance criteria for file-type filtered search"
    ↓
/kb-search-specialist "Design Qdrant filter schema and RRF weight adjustments for file-type search"
    ↓
/kb-api-designer "Define POST /api/v1/search request schema with fileType filter field"
    ↓
/kb-backend-lead "Implement SearchService changes in kms-api for file-type filtering"
    ↓
/kb-qa-architect "Write integration tests for filtered search endpoint"
```

**Example Invocations:**

```bash
/kb-search-specialist "Add file type filter to hybrid search — support PDF, DOCX, TXT"
/kb-api-designer "Add optional fileTypes: string[] field to SearchRequestDto"
/kb-backend-lead "Update SearchService.hybridSearch() to pass filter to Qdrant"
/kb-qa-architect "Write Jest tests for fileType filter in SearchController"
```

---

### Pattern 2: Adding a Transcription Provider

**Goal:** Integrate a new speech-to-text provider (e.g., AssemblyAI).

**Agent Chain:**

```
/kb-architect "Design AssemblyAI provider integration following existing provider pattern"
    ↓
/kb-voice-specialist "Implement AssemblyAI transcription provider class"
    ↓
/kb-db-specialist "Add ASSEMBLY_AI to provider enum in TypeORM entity and migration"
    ↓
/kb-python-lead "Register AssemblyAI in transcription factory and worker routing"
    ↓
/kb-qa-architect "Write unit tests for AssemblyAI provider with mock HTTP responses"
    ↓
/kb-security-review "Review API key storage and transmission for AssemblyAI"
```

**Example Invocations:**

```bash
/kb-voice-specialist "Create AssemblyAI provider implementing TranscriptionProvider base class"
/kb-db-specialist "Add ASSEMBLY_AI to TranscriptionProvider enum — write TypeORM migration"
/kb-python-lead "Register AssemblyAI provider in transcription factory and configure env var"
```

---

### Pattern 3: Database Migration

**Goal:** Add a new column or table, update an existing schema.

**Agent Chain:**

```
/kb-db-specialist "Design schema change"
    ↓ (if cross-service)
/kb-backend-lead "Update TypeORM entities and DTOs"
    ↓
/kb-api-designer "Update API contract if response shape changes"
    ↓
/kb-qa-architect "Write migration test and verify rollback"
```

**Example Invocations:**

```bash
/kb-db-specialist "Add tags: string[] column to kms_documents table — TypeORM entity + migration"
/kb-db-specialist "Add composite index on (source_id, status) in kms_scan_jobs table"
/kb-db-specialist "Optimize slow query on kms_embeddings — analyze EXPLAIN plan and suggest index"
```

---

### Pattern 4: Bug Fix

**Goal:** Diagnose and fix a reported bug.

**Single agent (most common):**

```bash
# Backend bug
/kb-backend-lead "Fix N+1 query in DocumentService.findWithEmbeddings()"

# Search relevance bug
/kb-search-specialist "Debug why BM25 scores are dominating RRF — check normalization"

# Worker crash
/kb-python-lead "Fix unhandled exception in embedding worker when PDF extraction fails"

# Database bug
/kb-db-specialist "Fix missing transaction rollback in bulk document insert"
```

**Multi-agent (cross-service bug):**

```bash
/kb-coordinate "Jobs stuck in PROCESSING after worker restart — diagnose and fix"
# → kb-coordinate routes to: kb-python-lead (stale job recovery) + kb-db-specialist (status query)
```

---

### Pattern 5: New API Endpoint

**Goal:** Add a new REST endpoint to kms-api or search-api.

**Agent Chain:**

```
/kb-api-designer "Design endpoint contract"
    ↓
/kb-backend-lead "Implement controller + service"
    ↓
/kb-db-specialist "Add repository method if new DB query needed"
    ↓
/kb-security-review "Review auth requirements for new endpoint"
    ↓
/kb-qa-architect "Write E2E test for new endpoint"
```

**Example Invocations:**

```bash
/kb-api-designer "Design GET /api/v1/documents/:id/similar — returns top 5 semantically similar docs"
/kb-backend-lead "Implement DocumentsController.getSimilar() using SearchService"
/kb-security-review "Verify GET /documents/:id/similar requires valid API key and respects tenant isolation"
```

---

### Pattern 6: Content Processing Change

**Goal:** Update how documents are extracted, chunked, or embedded.

**Agent Chain:**

```
/kb-embedding-specialist "Design chunking strategy change"
    ↓
/kb-python-lead "Implement updated chunking in worker"
    ↓
/kb-db-specialist "Update embeddings table if vector dimensions change"
    ↓
/kb-observability "Add metric for chunk count per document"
    ↓
/kb-qa-architect "Write regression tests for chunking edge cases"
```

**Example Invocations:**

```bash
/kb-embedding-specialist "Switch from fixed 512-token chunks to sentence-boundary chunks with 20% overlap"
/kb-python-lead "Update EmbeddingWorker to use new SentenceChunker class"
/kb-db-specialist "Verify BAAI/bge-m3 1024-dim vectors are correctly typed in Qdrant collection"
```

---

## When to Use Each Agent

| Situation | Agent |
|-----------|-------|
| Don't know where to start | `/kb-coordinate` |
| Multi-service change | `/kb-coordinate` |
| New microservice or major component | `/kb-architect` |
| Feature prioritization or user stories | `/kb-product-manager` |
| NestJS module, service, guard, interceptor | `/kb-backend-lead` |
| Python async worker, FastAPI route, job consumer | `/kb-python-lead` |
| API schema, DTO, OpenAPI spec, error codes | `/kb-api-designer` |
| TypeORM entity, migration, query, index | `/kb-db-specialist` |
| Qdrant, BM25, RRF, search relevance | `/kb-search-specialist` |
| Whisper, Groq, Deepgram, job lifecycle | `/kb-voice-specialist` |
| Text extraction, chunking, sentence-transformers | `/kb-embedding-specialist` |
| Docker Compose, CI/CD, secrets, env config | `/kb-platform-engineer` |
| OTel spans, Prometheus metrics, Grafana | `/kb-observability` |
| pytest, Jest, Playwright, test coverage | `/kb-qa-architect` |
| Auth, OWASP, API keys, PII, threat model | `/kb-security-review` |
| CONTEXT.md, feature guides, 3-layer docs | `/kb-doc-engineer` |

---

## How to Chain Agents

### Sequential Chaining

Run agents in order, passing the output of one as context to the next:

```bash
# Step 1: Get the design
/kb-architect "Design document deduplication service"

# Step 2: Pass design output to backend
/kb-backend-lead "Implement DeduplicationService as designed: [paste architect output]"

# Step 3: Write tests for what was implemented
/kb-qa-architect "Write tests for DeduplicationService: [paste backend output]"
```

### Parallel Specialists

For independent concerns, invoke multiple agents in the same session:

```bash
# These can run in parallel — no dependency between them
/kb-db-specialist "Add dedup_hash column to kms_documents"
/kb-api-designer "Design POST /api/v1/documents/dedup-check endpoint"
/kb-observability "Add dedup cache hit/miss metric"
```

### Coordinator-Driven

For complex tasks, let `kb-coordinate` determine the chain:

```bash
/kb-coordinate "Implement semantic deduplication for ingested documents including DB schema, worker logic, and API endpoint"
# Output: recommended agent sequence with specific tasks for each
```

---

## Example Invocations by Agent

### `/kb-coordinate`
```bash
/kb-coordinate "Add real-time search suggestions feature"
/kb-coordinate "Debug: embedding worker consuming 100% CPU on large PDF"
/kb-coordinate "Plan Q2 milestone: search quality improvements"
```

### `/kb-architect`
```bash
/kb-architect "Design multi-tenant isolation for kms-api"
/kb-architect "ADR: Should we use Neo4j or PostgreSQL graph queries for knowledge graph?"
/kb-architect "Component diagram for document ingestion pipeline"
```

### `/kb-product-manager`
```bash
/kb-product-manager "Write user stories for saved search feature"
/kb-product-manager "Prioritize backlog: search quality vs ingestion speed vs UI polish"
/kb-product-manager "Define MVP acceptance criteria for v1.0 release"
```

### `/kb-backend-lead`
```bash
/kb-backend-lead "Create DocumentsModule with CRUD service and TypeORM repository"
/kb-backend-lead "Add rate limiting guard to search endpoint"
/kb-backend-lead "Implement cursor-based pagination for GET /api/v1/documents"
```

### `/kb-python-lead`
```bash
/kb-python-lead "Add retry logic with exponential backoff to embedding worker"
/kb-python-lead "Create FastAPI health check endpoint for worker service"
/kb-python-lead "Implement dead letter queue handler for failed embedding jobs"
```

### `/kb-api-designer`
```bash
/kb-api-designer "Design bulk document upload endpoint with progress tracking"
/kb-api-designer "Define error codes for search-api — use SRH prefix"
/kb-api-designer "Write OpenAPI spec for POST /api/v1/embeddings/reindex"
```

### `/kb-db-specialist`
```bash
/kb-db-specialist "Optimize slow query: SELECT * FROM kms_documents WHERE source_id = ? AND status = ?"
/kb-db-specialist "Design kms_tags table with many-to-many to kms_documents"
/kb-db-specialist "Write TypeORM migration to add GIN index on content_tsvector"
```

### `/kb-search-specialist`
```bash
/kb-search-specialist "Tune RRF k-parameter for better code search precision"
/kb-search-specialist "Design Redis cache strategy for repeated search queries"
/kb-search-specialist "Configure Qdrant HNSW index parameters for 1024-dim vectors"
```

### `/kb-voice-specialist`
```bash
/kb-voice-specialist "Add language detection before routing to Groq vs local Whisper"
/kb-voice-specialist "Fix job stuck in PROCESSING after worker crash — stale recovery logic"
/kb-voice-specialist "Implement webhook retry with exponential backoff for failed deliveries"
```

### `/kb-embedding-specialist`
```bash
/kb-embedding-specialist "Handle multi-language documents in chunking pipeline"
/kb-embedding-specialist "Add PDF table extraction before text chunking"
/kb-embedding-specialist "Batch optimize sentence-transformer inference for large document sets"
```

### `/kb-platform-engineer`
```bash
/kb-platform-engineer "Add Qdrant and Neo4j to docker-compose.yml with health checks"
/kb-platform-engineer "Configure GitHub Actions CI: lint + test + build on PR"
/kb-platform-engineer "Set up secrets management for GROQ_API_KEY in production"
```

### `/kb-observability`
```bash
/kb-observability "Add distributed trace spans to document ingestion pipeline"
/kb-observability "Create Grafana dashboard for search latency P50/P95/P99"
/kb-observability "Define SLI/SLO for embedding worker throughput"
```

### `/kb-qa-architect`
```bash
/kb-qa-architect "Write pytest integration tests for RabbitMQ consumer with test containers"
/kb-qa-architect "Design Playwright E2E test for document search flow"
/kb-qa-architect "Identify test coverage gaps in SearchService"
```

### `/kb-security-review`
```bash
/kb-security-review "Audit API key storage — verify SHA256 hashing and no plaintext storage"
/kb-security-review "Review document access control — does tenant isolation hold?"
/kb-security-review "OWASP checklist for new file upload endpoint"
```

### `/kb-doc-engineer`
```bash
/kb-doc-engineer "Update domain/CONTEXT.md to include new kb-graph-specialist agent"
/kb-doc-engineer "Generate 3-layer feature guide for semantic search feature"
/kb-doc-engineer "Write CONTEXT.md for new integrations/ agent group"
```
