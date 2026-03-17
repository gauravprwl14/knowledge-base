# KMS Knowledge Graph — Query Patterns

**Version**: 1.0
**Last Updated**: 2026-03-16

---

## Overview

This document provides practical query patterns for the most common agent tasks. Each query pattern answers a real question an AI agent or developer might ask. Queries are written in **Cypher** (Neo4j query language), which is the native query language for the Knowledge Graph.

All queries assume the graph has been fully populated per the [NODE-TAXONOMY.md](./NODE-TAXONOMY.md) and [EDGE-TAXONOMY.md](./EDGE-TAXONOMY.md) specifications.

### How to Read These Patterns

Each pattern includes:
- **Question**: The natural language question being answered
- **Traversal Strategy**: Step-by-step description of how to navigate the graph
- **Cypher Query**: The executable query
- **Expected Output**: What the query returns
- **Agent Use Case**: When an agent would run this

---

## Pattern 1: "What do I need to know to add a new transcription provider?"

**Traversal Strategy:**
1. Start from the keyword "transcription provider" — resolve to the `TranscriptionCore` community
2. Follow `SKILL_COVERS` in reverse to find relevant skills to activate
3. Follow `DOCUMENTS` in reverse to find documentation that covers this community
4. Follow code nodes in `TranscriptionCore` to find the base class pattern
5. Follow `DESCRIBED_BY` from the Component to find governing ADRs

**Cypher Query:**
```cypher
// Step 1: Find the TranscriptionCore community and its code
MATCH (c:Community {name: "TranscriptionCore"})

// Step 2: Find skills covering this community
OPTIONAL MATCH (s:Skill)-[sc:SKILL_COVERS]->(c)

// Step 3: Find documentation
OPTIONAL MATCH (doc:DocPage)-[:DOCUMENTS]->(c)

// Step 4: Find the base class / interface
OPTIONAL MATCH (iface:Interface)-[:MEMBER_OF]->(c)

// Step 5: Find ADRs
OPTIONAL MATCH (comp:Component {name: "voice-app"})-[:DESCRIBED_BY]->(adr:ADR)

RETURN
  c.name AS community,
  collect(DISTINCT {skill: s.name, weight: sc.weight}) AS relevant_skills,
  collect(DISTINCT doc.path) AS documentation,
  collect(DISTINCT iface.name) AS base_interfaces,
  collect(DISTINCT adr.title) AS governing_decisions
```

**Expected Output:**
```
community: "TranscriptionCore"
relevant_skills: [{skill: "kb-voice-specialist", weight: 1.0}, {skill: "kb-backend-lead", weight: 0.6}]
documentation: ["docs/architecture/02-microservices/dedup-worker-service.md", ...]
base_interfaces: ["TranscriptionProvider"]
governing_decisions: ["Use FastAPI for voice-app service"]
```

**Agent Use Case:** Activate before starting a task to implement a new provider like AssemblyAI or Azure Speech.

---

## Pattern 2: "What breaks if I change the search API response schema?"

**Traversal Strategy:**
1. Start from the `SearchResponse` Schema node
2. Find the ResponseBody that uses it via `USES_SCHEMA`
3. Find the Endpoint that returns it via `RETURNS`
4. Find frontend code that CALLS or IMPORTS from this endpoint
5. Find the Function that IMPLEMENTS_CONTRACT this endpoint (blast radius downstream)
6. Follow CALLS from that Function 2 levels deep

**Cypher Query:**
```cypher
// Find schema and trace upward to endpoint
MATCH (sc:Schema {name: "SearchResponse"})
      <-[:USES_SCHEMA]-(rb:ResponseBody)
      <-[:RETURNS]-(ep:Endpoint)

// Find the implementing function
OPTIONAL MATCH (fn:Function)-[:IMPLEMENTS_CONTRACT]->(ep)

// Downstream blast radius: what does the implementing function call?
OPTIONAL MATCH (fn)-[:CALLS*1..2]->(downstream:Function)

// Upstream: what frontend code calls this endpoint?
OPTIONAL MATCH (caller:File)-[:IMPORTS]->(ep_file:File)
WHERE ep_file.path CONTAINS "search"
  AND caller.path CONTAINS "frontend"

RETURN
  sc.name AS changed_schema,
  ep.method + " " + ep.path AS endpoint,
  fn.name AS implementing_function,
  collect(DISTINCT downstream.name) AS downstream_blast_radius,
  collect(DISTINCT caller.path) AS frontend_files_affected
```

**Expected Output:**
```
changed_schema: "SearchResponse"
endpoint: "POST /api/v1/search"
implementing_function: "SearchController.search"
downstream_blast_radius: ["hybridSearch", "semanticSearch", "reciprocal_rank_fusion", ...]
frontend_files_affected: ["web-ui/app/search/page.tsx", "web-ui/lib/api.ts"]
```

**Agent Use Case:** Run before modifying `SearchResponse` DTO to understand the full scope of changes needed.

---

## Pattern 3: "Which skills should I activate when working in the embedding pipeline?"

**Traversal Strategy:**
1. Resolve the file to a Community via `MEMBER_OF`
2. Follow `SKILL_COVERS` in reverse to find matching Skills
3. Rank by weight (community match) and documentation coverage
4. Return ordered list

**Cypher Query:**
```cypher
MATCH (f:File {path: "embedding-worker/app/embedder.py"})
      -[:MEMBER_OF]->(c:Community)
      <-[sc:SKILL_COVERS]-(s:Skill)

// Compute documentation coverage score for each skill
OPTIONAL MATCH (s)-[:SKILL_COVERS_DOC]->(doc:DocPage)-[:DOCUMENTS]->(c)

WITH s, sc, c, count(DISTINCT doc) AS doc_coverage_count

// Rank: 60% community weight + 40% doc coverage score (normalized to 0-1)
WITH s,
     (sc.weight * 0.6) + (toFloat(doc_coverage_count) / 5.0 * 0.4) AS rank_score,
     sc.coverage_type AS coverage_type,
     c.name AS community

RETURN s.name AS skill, s.display_name, coverage_type, community, round(rank_score * 100) AS score
ORDER BY rank_score DESC
LIMIT 5
```

**Expected Output:**
```
skill: "kb-embedding-specialist", score: 96, coverage_type: "primary"
skill: "kb-db-specialist", score: 72, coverage_type: "secondary"
skill: "kb-backend-lead", score: 65, coverage_type: "secondary"
skill: "kb-devops", score: 48, coverage_type: "peripheral"
```

**Agent Use Case:** Called at the start of any coding session to determine which skills to load into context.

---

## Pattern 4: "Is there documentation for the duplicate detection algorithm?"

**Traversal Strategy:**
1. Start from `Community:DeduplicationCore`
2. Find DocPages that point to this community via `DOCUMENTS`
3. Check coverage field
4. Also search for Concept nodes defined in those docs

**Cypher Query:**
```cypher
MATCH (c:Community {name: "DeduplicationCore"})

OPTIONAL MATCH (doc:DocPage)-[d:DOCUMENTS]->(c)
OPTIONAL MATCH (doc)-[:EXPLAINS_CONCEPT]->(concept:Concept)
OPTIONAL MATCH (doc)-[:PART_OF]->(section:Section)

RETURN
  c.name AS community,
  collect(DISTINCT {
    path: doc.path,
    title: doc.title,
    coverage: d.coverage
  }) AS documentation_pages,
  collect(DISTINCT concept.name) AS concepts_defined,
  CASE WHEN count(doc) = 0 THEN "DOCUMENTATION GAP" ELSE "COVERED" END AS status
```

**Expected Output:**
```
community: "DeduplicationCore"
documentation_pages: [
  {path: "docs/architecture/05-algorithms/exact-duplicate-detection.md", coverage: "full"},
  {path: "docs/architecture/05-algorithms/semantic-duplicate-detection.md", coverage: "full"},
  {path: "docs/architecture/04-data-flows/deduplication-flow.md", coverage: "full"}
]
concepts_defined: ["ExactDuplicate", "SemanticDuplicate", "SHA256Hash", "CosineSimilarity"]
status: "COVERED"
```

**Agent Use Case:** Before writing documentation, check if it already exists. Before implementing a feature, find the relevant docs.

---

## Pattern 5: "What architectural decisions constrain the search-api design?"

**Traversal Strategy:**
1. Find the `Component:search-api` node
2. Follow `DESCRIBED_BY` to ADR nodes
3. Follow `GOVERNS` from each ADR to Constraint nodes
4. Also find any VIOLATES edges against those constraints

**Cypher Query:**
```cypher
MATCH (comp:Component {name: "search-api"})

// Governing ADRs
OPTIONAL MATCH (comp)-[:DESCRIBED_BY]->(adr:ADR)

// Constraints from each ADR
OPTIONAL MATCH (adr)-[:GOVERNS]->(constraint:Constraint)

// Any known violations
OPTIONAL MATCH (violator:Function)-[:VIOLATES]->(constraint)

RETURN
  comp.name AS component,
  collect(DISTINCT {
    id: adr.id,
    title: adr.title,
    status: adr.status
  }) AS governing_adrs,
  collect(DISTINCT {
    id: constraint.id,
    rule: constraint.rule,
    severity: constraint.severity
  }) AS constraints,
  collect(DISTINCT {
    function: violator.name,
    file: violator.file
  }) AS known_violations
```

**Expected Output:**
```
component: "search-api"
governing_adrs: [
  {id: "ADR-003", title: "Use Qdrant for vector storage", status: "accepted"},
  {id: "ADR-004", title: "Hybrid search with RRF over pure semantic", status: "accepted"}
]
constraints: [
  {id: "C002", rule: "search-api must treat PostgreSQL as read-only", severity: "must"}
]
known_violations: []
```

**Agent Use Case:** Before modifying search-api, understand the design rules that must be respected.

---

## Pattern 6: "What tests cover the Qdrant integration?"

**Traversal Strategy:**
1. Find Function nodes related to Qdrant (by name or file pattern)
2. Follow `CALLS` in reverse to find callers
3. Filter callers to test files (path contains `test` or `spec`)
4. Collect test function names and files

**Cypher Query:**
```cypher
// Find all Qdrant-related functions
MATCH (qdrant_fn:Function)
WHERE qdrant_fn.file CONTAINS "qdrant"
   OR qdrant_fn.name CONTAINS "qdrant"
   OR qdrant_fn.name CONTAINS "Qdrant"

// Find test functions that call them
MATCH (test_fn:Function)-[:CALLS*1..3]->(qdrant_fn)
WHERE test_fn.file CONTAINS "test"
   OR test_fn.file CONTAINS "spec"

RETURN DISTINCT
  test_fn.name AS test_function,
  test_fn.file AS test_file,
  qdrant_fn.name AS tested_function
ORDER BY test_fn.file
```

**Expected Output:**
```
test_function: "test_qdrant_upsert_success", test_file: "tests/unit/test_qdrant_repository.ts"
test_function: "test_hybrid_search_calls_qdrant", test_file: "tests/integration/test_search_service.ts"
test_function: "test_embedding_pipeline_stores_vectors", test_file: "tests/integration/test_embedding_worker.py"
```

**Agent Use Case:** Before modifying the Qdrant client code, identify which tests will run and whether coverage is adequate.

---

## Pattern 7: "What environment variables does the embedding worker need?"

**Traversal Strategy:**
1. Find `Service:embedding-worker`
2. Follow `DEPENDS_ON` to find all Database and Queue dependencies
3. For each dependency, find Config nodes associated with them
4. Also find Config nodes directly associated with the service

**Cypher Query:**
```cypher
MATCH (svc:Service {name: "embedding-worker"})

// Direct config groups
OPTIONAL MATCH (cfg:Config {service: "embedding-worker"})

// Runtime dependencies
OPTIONAL MATCH (svc)-[:DEPENDS_ON]->(dep)
WHERE dep:Database OR dep:Queue OR dep:Service

// Config groups for each dependency
OPTIONAL MATCH (dep_cfg:Config)
WHERE dep_cfg.service = dep.name

RETURN
  svc.name AS service,
  collect(DISTINCT {
    group: cfg.name,
    variables: cfg.variables,
    required: cfg.required
  }) AS direct_config_groups,
  collect(DISTINCT dep.name) AS runtime_dependencies,
  collect(DISTINCT {
    dependency: dep_cfg.service,
    group: dep_cfg.name,
    variables: dep_cfg.variables
  }) AS dependency_config_groups
```

**Expected Output:**
```
service: "embedding-worker"
direct_config_groups: [
  {group: "EmbeddingWorkerConfig", variables: ["MODEL_NAME", "BATCH_SIZE", "CHUNK_SIZE"], required: true}
]
runtime_dependencies: ["postgresql", "qdrant", "rabbitmq", "embed.queue"]
dependency_config_groups: [
  {dependency: "postgresql", group: "PostgresConfig", variables: ["DATABASE_URL", "DB_POOL_SIZE"]},
  {dependency: "qdrant", group: "QdrantConfig", variables: ["QDRANT_URL", "QDRANT_COLLECTION_DEFAULT"]},
  {dependency: "rabbitmq", group: "RabbitMQConfig", variables: ["RABBITMQ_URL", "RABBITMQ_EXCHANGE"]}
]
```

**Agent Use Case:** When setting up a new development environment or writing a Dockerfile, identify all required env vars.

---

## Pattern 8: "Show me the full job processing flow from upload to completion"

**Traversal Strategy:**
1. Find `Process:FileScanFlow` or `Process:TranscriptionFlow`
2. Follow `STEP_IN_PROCESS` edges ordered by `step_order`
3. For each step function, follow `DOCUMENTS` to find docs
4. Return the ordered pipeline

**Cypher Query:**
```cypher
MATCH (proc:Process {name: "FileScanFlow"})
      -[step:STEP_IN_PROCESS]->(fn:Function)

OPTIONAL MATCH (doc:DocPage)-[:DOCUMENTS]->(c:Community)
              <-[:MEMBER_OF]-(fn)

RETURN
  proc.name AS process,
  proc.description AS description,
  proc.trigger AS trigger,
  step.step_order AS step_num,
  step.step_name AS step_name,
  fn.name AS function_name,
  fn.file AS file,
  collect(DISTINCT doc.path) AS relevant_docs
ORDER BY step.step_order
```

**Expected Output:**
```
step 1: "Receive scan job" → ScanController.createScanJob (kms-api)
step 2: "Validate source" → SourcesService.findOne (kms-api)
step 3: "Publish to queue" → publish_to_scan_queue (kms-api)
step 4: "Consume scan message" → scan_worker.process_message (scan-worker)
step 5: "Discover files from source" → google_drive.list_files (scan-worker)
step 6: "Insert file records" → files_repository.bulk_insert (scan-worker)
step 7: "Publish to embed queue" → publish_to_embed_queue (scan-worker)
step 8: "Extract text content" → extract_text (embedding-worker)
step 9: "Generate embeddings" → generate_embeddings (embedding-worker)
step 10: "Store in Qdrant" → qdrant_upsert (embedding-worker)
step 11: "Publish to dedup queue" → publish_to_dedup_queue (embedding-worker)
step 12: "Detect duplicates" → detect_duplicates (dedup-worker)
step 13: "Store in Neo4j" → neo4j_create_relationship (dedup-worker)
```

**Agent Use Case:** When debugging a stuck pipeline, get the full flow to understand at which step things might have failed.

---

## Pattern 9: "What is the blast radius of changing the kms_files table schema?"

**Traversal Strategy:**
1. Start from `Schema:KmsFile` (the entity schema for kms_files table)
2. Find all Classes/Functions that USES_SCHEMA or IMPORTS the KmsFile entity
3. Expand 2 more levels via CALLS to find indirect dependencies
4. Collect distinct files affected

**Cypher Query:**
```cypher
MATCH (sc:Schema {name: "KmsFile"})

// Direct users: classes and functions that use this schema
OPTIONAL MATCH (direct)-[:USES_SCHEMA|IMPLEMENTS]->(sc)
OPTIONAL MATCH (importer:File)-[:IMPORTS]->(sc_file:File)
WHERE sc_file.path CONTAINS "kms-file"

// Level 1 callers
OPTIONAL MATCH (caller1:Function)-[:CALLS]->(direct_fn:Function)
WHERE direct_fn.file IN [x IN collect(DISTINCT importer.path) | x]

// Level 2 callers
OPTIONAL MATCH (caller2:Function)-[:CALLS]->(caller1)

// Collect all affected nodes
WITH collect(DISTINCT importer.path) AS level0_files,
     collect(DISTINCT caller1.file) AS level1_files,
     collect(DISTINCT caller2.file) AS level2_files

RETURN
  "KmsFile (kms_files table)" AS changed_schema,
  level0_files AS direct_files,
  level1_files AS indirect_level1_files,
  level2_files AS indirect_level2_files,
  size(level0_files) + size(level1_files) + size(level2_files) AS total_files_affected
```

**Expected Output:**
```
changed_schema: "KmsFile (kms_files table)"
direct_files: ["kms-api/src/modules/files/files.service.ts", "kms-api/src/modules/files/files.repository.ts", ...]
indirect_level1_files: ["search-api/src/search.service.ts", "kms-api/src/modules/scan-jobs/scan-jobs.service.ts", ...]
indirect_level2_files: ["search-api/src/search.controller.ts", "web-ui/lib/api.ts", ...]
total_files_affected: 23
```

**Agent Use Case:** Before running a Prisma migration that changes the `kms_files` table, understand the full blast radius to plan the PR scope.

---

## Pattern 10: "Which parts of the codebase have no documentation?"

**Traversal Strategy:**
1. Find all Community nodes
2. Check which have inbound `DOCUMENTS` edges
3. Return communities with no documentation as gaps
4. Bonus: find high-complexity functions with no DocPage coverage

**Cypher Query:**
```cypher
// Find all communities
MATCH (c:Community)
OPTIONAL MATCH (doc:DocPage)-[:DOCUMENTS]->(c)

WITH c, count(DISTINCT doc) AS doc_count

WHERE doc_count = 0

RETURN
  c.id AS community_id,
  c.name AS community_name,
  c.service AS service,
  c.description AS description,
  doc_count AS documentation_pages,
  "DOCUMENTATION GAP" AS status
ORDER BY c.service, c.name
```

**Bonus — find high-complexity undocumented functions:**
```cypher
MATCH (fn:Function)
WHERE fn.complexity IS NOT NULL
  AND fn.complexity > 10

OPTIONAL MATCH (doc:DocPage)-[:DOCUMENTS]->(c:Community)
              <-[:MEMBER_OF]-(fn)

WITH fn, count(DISTINCT doc) AS doc_coverage
WHERE doc_coverage = 0

RETURN fn.name, fn.file, fn.complexity AS cyclomatic_complexity
ORDER BY fn.complexity DESC
LIMIT 20
```

**Agent Use Case:** Periodically run to identify documentation debt. The output can feed into a prioritized documentation backlog.

---

## Pattern 11: "What rate limits apply to the search endpoint?"

**Traversal Strategy:**
1. Start from `Endpoint(POST /api/v1/search)`
2. Follow `THROWS` to find `ErrorCode:KMS_4291` (rate limit exceeded)
3. Follow `DESCRIBED_BY` from the Component to find ADRs with rate limit info
4. Follow to `Constraint` nodes that mention rate limiting

**Cypher Query:**
```cypher
MATCH (ep:Endpoint {method: "POST", path: "/api/v1/search"})

// Find rate limit error code
OPTIONAL MATCH (ep)-[:THROWS {condition: "Rate limit exceeded"}]->(ec:ErrorCode)

// Find the component and its ADRs
OPTIONAL MATCH (comp:Component {name: "search-api"})-[:DESCRIBED_BY]->(adr:ADR)

// Find constraints mentioning rate
OPTIONAL MATCH (adr)-[:GOVERNS]->(con:Constraint)
WHERE toLower(con.rule) CONTAINS "rate"

// Find documentation mentioning rate limiting
OPTIONAL MATCH (doc:DocPage)-[:DOCUMENTS]->(c:Community {name: "HybridSearchCore"})

RETURN
  ep.method + " " + ep.path AS endpoint,
  ep.rate_limited AS rate_limited_flag,
  collect(DISTINCT {code: ec.code, http_status: ec.http_status, message: ec.message}) AS rate_limit_errors,
  collect(DISTINCT con.rule) AS rate_limit_constraints,
  collect(DISTINCT doc.path) AS relevant_docs
```

**Expected Output:**
```
endpoint: "POST /api/v1/search"
rate_limited_flag: true
rate_limit_errors: [{code: "KMS_4291", http_status: 429, message: "Rate limit exceeded"}]
rate_limit_constraints: ["API rate limits are enforced per API key by Redis counter"]
relevant_docs: ["docs/architecture/06-api-contracts/search-endpoints.md"]
```

**Agent Use Case:** When implementing client-side retry logic or when setting rate limit thresholds in nginx/Redis.

---

## Pattern 12: "Show skill dependency chain for implementing a new data source (e.g., Dropbox)"

**Traversal Strategy:**
1. Identify the task: adding a new source type to the scan-worker
2. Find the `Community:FileScanningCore` and `Community:SourcesManagement`
3. Follow `SKILL_COVERS` to find relevant skills
4. Follow `PREREQUISITE` chains to build the ordered activation sequence
5. Return the dependency-ordered skill list

**Cypher Query:**
```cypher
// Find skills that cover file scanning and sources management
MATCH (s:Skill)-[:SKILL_COVERS]->(c:Community)
WHERE c.name IN ["FileScanningCore", "SourcesManagement"]

WITH collect(DISTINCT s) AS relevant_skills

UNWIND relevant_skills AS skill

// Find prerequisite chains (up to 4 levels deep)
OPTIONAL MATCH (skill)-[:PREREQUISITE*1..4]->(prereq:Skill)

WITH skill, collect(DISTINCT prereq.name) AS prerequisites

RETURN
  skill.name AS skill,
  skill.group AS group,
  skill.description AS description,
  prerequisites,
  size(prerequisites) AS prerequisite_depth
ORDER BY prerequisite_depth ASC, skill.group ASC
```

**Full Ordered Activation Sequence (manual resolution):**
```
Task: Add Dropbox as a source type

Activation order (resolve prerequisites first):
  1. kb-coordinate      → Orchestrates the task, routes sub-tasks
  2. kb-architect       → Reviews design decision (new source type pattern)
  3. kb-backend-lead    → Oversees kms-api SourcesManagement module changes
  4. kb-db-specialist   → Database schema changes (new source_type enum value)
  5. kb-scan-specialist → Implements Dropbox adapter in scan-worker
  6. kb-qa-architect    → Reviews test strategy for new source integration
```

**Cypher for ordered chain:**
```cypher
// Walk PREREQUISITE chain from leaf skill to root
MATCH path = (leaf:Skill {name: "kb-scan-specialist"})-[:PREREQUISITE*0..5]->(root:Skill)
WHERE NOT EXISTS((root)-[:PREREQUISITE]->())

UNWIND nodes(path) AS skill_in_chain
RETURN DISTINCT skill_in_chain.name AS skill_name,
                skill_in_chain.group AS group,
                length(path) - index(nodes(path), skill_in_chain) AS activation_order
ORDER BY activation_order DESC
```

**Agent Use Case:** When starting a large multi-agent task, determine which skills need to be activated in which order and what context each skill should receive.

---

## Pattern 13: "Find all code that directly writes to the PostgreSQL database"

**Traversal Strategy:**
1. Find all functions/methods that call database-related functions
2. Filter to write operations (INSERT, UPDATE, DELETE, save, create, update, delete)
3. Verify they go through the proper service layer (not direct raw queries from controllers)

**Cypher Query:**
```cypher
MATCH (fn:Function)-[:CALLS]->(db_fn:Function)
WHERE db_fn.name =~ "(?i).*(save|create|update|delete|insert|remove|upsert).*"
  AND (db_fn.file CONTAINS "repository" OR db_fn.file CONTAINS "prisma")

RETURN
  fn.name AS calling_function,
  fn.file AS calling_file,
  db_fn.name AS db_operation,
  db_fn.file AS repository_file
ORDER BY calling_file
```

**Agent Use Case:** Security audit — ensure all database writes flow through the repository layer and not raw SQL from controllers.

---

## Pattern 14: "What is the end-to-end trace for a semantic search request?"

**Traversal Strategy:**
1. Start from `Endpoint(POST /search/semantic)`
2. Follow `IMPLEMENTS_CONTRACT` to find the controller method
3. Follow `CALLS` chain through service and repository layers
4. Follow `DEPENDS_ON` for infrastructure (Qdrant)

**Cypher Query:**
```cypher
MATCH (ep:Endpoint {method: "POST", path: "/search/semantic"})
      <-[:IMPLEMENTS_CONTRACT]-(controller:Method)

MATCH call_path = (controller)-[:CALLS*1..5]->(leaf:Function)
WHERE NOT EXISTS((leaf)-[:CALLS]->())
   OR leaf.file CONTAINS "repository"

RETURN
  ep.path AS endpoint,
  [n IN nodes(call_path) | n.name] AS call_chain,
  [n IN nodes(call_path) | n.file] AS file_chain,
  length(call_path) AS chain_depth
ORDER BY chain_depth DESC
LIMIT 5
```

**Agent Use Case:** When debugging a slow semantic search, identify every function in the call stack to find the bottleneck.

---

## Utility: Graph Health Queries

These are maintenance queries for verifying graph completeness.

### Check for orphaned nodes (nodes with no edges)
```cypher
MATCH (n)
WHERE NOT (n)-[]-()
RETURN labels(n) AS type, n.name AS name, count(*) AS count
ORDER BY count DESC
```

### Check documentation coverage percentage
```cypher
MATCH (c:Community)
OPTIONAL MATCH (doc:DocPage)-[:DOCUMENTS]->(c)
WITH c, count(doc) AS docs
RETURN
  toFloat(count(CASE WHEN docs > 0 THEN 1 END)) / count(c) * 100 AS coverage_percentage,
  count(CASE WHEN docs = 0 THEN 1 END) AS undocumented_communities,
  count(c) AS total_communities
```

### Check skill coverage percentage
```cypher
MATCH (c:Community)
OPTIONAL MATCH (s:Skill)-[:SKILL_COVERS]->(c)
WITH c, count(s) AS skill_count
RETURN
  toFloat(count(CASE WHEN skill_count > 0 THEN 1 END)) / count(c) * 100 AS skill_coverage_percentage,
  count(CASE WHEN skill_count = 0 THEN 1 END) AS uncovered_communities
```

---

## Related Documentation

- [NODE-TAXONOMY.md](./NODE-TAXONOMY.md) — Node types used in these queries
- [EDGE-TAXONOMY.md](./EDGE-TAXONOMY.md) — Edge types traversed in these queries
- [SKILL-GRAPH.md](./SKILL-GRAPH.md) — Skill routing query details
