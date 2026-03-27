# KMS Knowledge Graph — Edge Taxonomy

**Version**: 1.0
**Last Updated**: 2026-03-16

---

## Overview

This document defines every edge type in the KMS Knowledge Graph. Edges are directional and typed. Each edge type specifies:

- **Source → Target** node label constraints
- **Properties** the edge may carry
- **Semantics** — what the edge means in plain language
- **KMS Examples** drawn from the live project

Edge naming convention: `SCREAMING_SNAKE_CASE`, matching Neo4j best practice. Edge directionality follows the "A does/has B" reading.

---

## Layer 1: Code Edges (GitNexus Native)

These edges represent structural relationships within the codebase, produced by static analysis.

---

### CONTAINS

A containment relationship. A Folder contains Files; a File contains Functions, Classes, and Interfaces.

| Property | Source | Target |
|----------|--------|--------|
| — | `Folder` | `File` or `Folder` |
| — | `File` | `Function`, `Class`, `Interface`, `Import` |

**Semantics**: "This node directly encloses this other node."

**KMS Examples:**
- `(Folder:kms-api/src/modules/)-[:CONTAINS]->(Folder:auth/)`
- `(File:auth.service.ts)-[:CONTAINS]->(Class:AuthService)`
- `(File:search.service.ts)-[:CONTAINS]->(Method:hybridSearch)`

---

### CALLS

A function or method invokes another function or method.

| Property | Type | Description |
|----------|------|-------------|
| `call_count` | integer | How many times this call appears in the source |
| `is_async_await` | boolean | Whether the call uses await |
| `line` | integer | Line number of the call site |

**Source → Target**: `Function/Method` → `Function/Method`

**Semantics**: "This function directly calls this other function."

**KMS Examples:**
- `(Method:SearchService.hybridSearch)-[:CALLS {is_async_await: true}]->(Method:QdrantRepository.queryVectors)`
- `(Method:SearchService.hybridSearch)-[:CALLS {is_async_await: true}]->(Method:PostgresRepository.fullTextSearch)`
- `(Function:generate_embeddings)-[:CALLS]->(Function:chunk_text)`
- `(Function:calculate_sha256)-[:CALLS]->(Function:read_file_bytes)`

---

### IMPORTS

A file imports a module, package, or symbol from another file.

| Property | Type | Description |
|----------|------|-------------|
| `imported_symbols` | list[string] | Specific symbols imported |
| `is_default_import` | boolean | True if default import |
| `is_external` | boolean | True if external package |

**Source → Target**: `File` → `File` or `Import`

**Semantics**: "This file imports from this module or file."

**KMS Examples:**
- `(File:search.service.ts)-[:IMPORTS {is_external: true}]->(Import:@qdrant/js-client-rest)`
- `(File:embedder.py)-[:IMPORTS {is_external: true}]->(Import:sentence_transformers)`
- `(File:dedup.service.ts)-[:IMPORTS]->(File:hasher.util.ts)`

---

### INHERITS

A class extends another class.

| Property | Type | Description |
|----------|------|-------------|
| `is_abstract_parent` | boolean | True if parent is abstract |

**Source → Target**: `Class` → `Class`

**Semantics**: "This class extends this other class."

**KMS Examples:**
- `(Class:WhisperProvider)-[:INHERITS]->(Class:TranscriptionProvider)`
- `(Class:GroqProvider)-[:INHERITS]->(Class:TranscriptionProvider)`
- `(Class:DeepgramProvider)-[:INHERITS]->(Class:TranscriptionProvider)`

---

### IMPLEMENTS

A class or function implements an interface or protocol.

| Property | Type | Description |
|----------|------|-------------|
| `partial` | boolean | True if only partially implements the interface |

**Source → Target**: `Class` → `Interface`; `Function` → `Interface`

**Semantics**: "This class/function fulfills this interface contract."

**KMS Examples:**
- `(Class:AuthService)-[:IMPLEMENTS]->(Interface:IAuthService)`
- `(Class:SearchService)-[:IMPLEMENTS]->(Interface:ISearchService)`
- `(Class:WhisperProvider)-[:IMPLEMENTS]->(Interface:TranscriptionProvider)`

---

### HAS_METHOD

A class owns a method.

**Source → Target**: `Class` → `Method`

**Semantics**: "This class declares this method."

**KMS Examples:**
- `(Class:SearchService)-[:HAS_METHOD]->(Method:hybridSearch)`
- `(Class:SearchService)-[:HAS_METHOD]->(Method:semanticSearch)`
- `(Class:FilesService)-[:HAS_METHOD]->(Method:bulkDelete)`

---

### DEFINES

A file declares a standalone type, interface, or enum.

**Source → Target**: `File` → `Interface`, `Schema`, or `Class`

**Semantics**: "This file is the primary definition location for this type."

**KMS Examples:**
- `(File:search-request.dto.ts)-[:DEFINES]->(Schema:SearchRequest)`
- `(File:kms-file.entity.ts)-[:DEFINES]->(Schema:KmsFile)`
- `(File:error-codes.ts)-[:DEFINES]->(ErrorCode:KMS_4001)`

---

### MEMBER_OF

A file, function, or class belongs to a code community.

| Property | Type | Description |
|----------|------|-------------|
| `weight` | float | Community membership confidence (0.0–1.0) |

**Source → Target**: `File`, `Function`, `Class` → `Community`

**Semantics**: "This code entity is part of this functional community."

**KMS Examples:**
- `(File:search.service.ts)-[:MEMBER_OF {weight: 0.95}]->(Community:HybridSearchCore)`
- `(File:qdrant.repository.ts)-[:MEMBER_OF {weight: 0.90}]->(Community:HybridSearchCore)`
- `(File:embedder.py)-[:MEMBER_OF {weight: 0.98}]->(Community:EmbeddingPipeline)`
- `(Function:calculate_sha256)-[:MEMBER_OF {weight: 0.88}]->(Community:DeduplicationCore)`

---

### STEP_IN_PROCESS

A function or method is an ordered step in a named process.

| Property | Type | Description |
|----------|------|-------------|
| `step_order` | integer | Step number (1-indexed) |
| `step_name` | string | Human-readable step name |
| `is_optional` | boolean | True if step can be skipped |

**Source → Target**: `Process` → `Function` or `Method`

**Semantics**: "This process includes this function as step N."

**KMS Examples:**
- `(Process:FileScanFlow)-[:STEP_IN_PROCESS {step_order: 1, step_name: "Receive scan job"}]->(Method:ScanController.createScanJob)`
- `(Process:FileScanFlow)-[:STEP_IN_PROCESS {step_order: 2, step_name: "Publish to queue"}]->(Function:publish_to_scan_queue)`
- `(Process:HybridSearchFlow)-[:STEP_IN_PROCESS {step_order: 1, step_name: "Parse query"}]->(Method:SearchController.search)`
- `(Process:HybridSearchFlow)-[:STEP_IN_PROCESS {step_order: 2, step_name: "Parallel DB + Qdrant query"}]->(Method:SearchService.hybridSearch)`
- `(Process:HybridSearchFlow)-[:STEP_IN_PROCESS {step_order: 3, step_name: "RRF merge and rank"}]->(Function:reciprocal_rank_fusion)`

---

## Layer 2: Documentation Edges

These edges connect the Documentation layer to the Code layer and to itself.

---

### DOCUMENTS

A DocPage provides documentation for a code node or community.

| Property | Type | Description |
|----------|------|-------------|
| `coverage` | string | `full`, `partial`, `overview` |
| `last_verified` | date | Date documentation was last verified against code |

**Source → Target**: `DocPage` → `Community`, `Class`, `Function`, `Process`

**Semantics**: "This documentation page explains this code entity."

**KMS Examples:**
- `(DocPage:hybrid-search-algorithm.md)-[:DOCUMENTS {coverage: "full"}]->(Community:HybridSearchCore)`
- `(DocPage:embedding-worker-service.md)-[:DOCUMENTS {coverage: "full"}]->(Community:EmbeddingPipeline)`
- `(DocPage:04_AUTH_GUIDE.md)-[:DOCUMENTS {coverage: "partial"}]->(Community:AuthCore)`
- `(DocPage:exact-duplicate-detection.md)-[:DOCUMENTS {coverage: "full"}]->(Community:DeduplicationCore)`

---

### EXPLAINS_CONCEPT

A DocPage defines or explains a domain concept.

| Property | Type | Description |
|----------|------|-------------|
| `is_primary_definition` | boolean | True if this is the canonical definition page |

**Source → Target**: `DocPage` → `Concept`

**Semantics**: "This documentation page defines or explains this concept."

**KMS Examples:**
- `(DocPage:hybrid-search-algorithm.md)-[:EXPLAINS_CONCEPT {is_primary_definition: true}]->(Concept:ReciprocalRankFusion)`
- `(DocPage:semantic-duplicate-detection.md)-[:EXPLAINS_CONCEPT {is_primary_definition: true}]->(Concept:SemanticDuplicate)`
- `(DocPage:exact-duplicate-detection.md)-[:EXPLAINS_CONCEPT {is_primary_definition: true}]->(Concept:ExactDuplicate)`

---

### REFERENCES

A DocPage cites another graph node — an ADR, Endpoint, Concept, or another DocPage.

| Property | Type | Description |
|----------|------|-------------|
| `reference_type` | string | `cites`, `implements`, `extends`, `deprecates` |
| `section` | string | Section heading where the reference appears |

**Source → Target**: `DocPage` → `ADR`, `Endpoint`, `Concept`, `DocPage`

**Semantics**: "This document references or cross-links to this other artifact."

**KMS Examples:**
- `(DocPage:search-endpoints.md)-[:REFERENCES]->(Concept:ReciprocalRankFusion)`
- `(DocPage:deduplication-flow.md)-[:REFERENCES]->(DocPage:semantic-duplicate-detection.md)`
- `(DocPage:kms-api-service.md)-[:REFERENCES {reference_type: "implements"}]->(ADR:ADR-001)`

---

### PART_OF

A Section belongs to a DocPage, or a DocPage belongs to a documentation category folder.

**Source → Target**: `Section` → `DocPage`

**Semantics**: "This section is part of this document."

**KMS Examples:**
- `(Section:"Reciprocal Rank Fusion")-[:PART_OF]->(DocPage:hybrid-search-algorithm.md)`
- `(Section:"Authentication Flow")-[:PART_OF]->(DocPage:high-level-architecture.md)`

---

## Layer 3: API Edges

These edges connect the API Surface layer to Code and Schema nodes.

---

### IMPLEMENTS_CONTRACT

A function or method is the backend implementation of a REST endpoint.

| Property | Type | Description |
|----------|------|-------------|
| `confidence` | float | Match confidence (1.0 = verified, < 1.0 = inferred) |
| `route_match` | string | How the route was matched |

**Source → Target**: `Function` or `Method` → `Endpoint`

**Semantics**: "This function is the implementation that serves this endpoint."

**KMS Examples:**
- `(Method:SearchController.search)-[:IMPLEMENTS_CONTRACT {confidence: 1.0}]->(Endpoint:POST /api/v1/search)`
- `(Method:FilesController.findAll)-[:IMPLEMENTS_CONTRACT {confidence: 1.0}]->(Endpoint:GET /api/v1/files)`
- `(Method:FilesController.bulkDelete)-[:IMPLEMENTS_CONTRACT {confidence: 1.0}]->(Endpoint:POST /api/v1/files/bulk-delete)`
- `(Method:ScanJobsController.create)-[:IMPLEMENTS_CONTRACT {confidence: 1.0}]->(Endpoint:POST /api/v1/scan-jobs)`

---

### RETURNS

An endpoint returns a response body.

**Source → Target**: `Endpoint` → `ResponseBody`

**Semantics**: "This endpoint's success response is described by this response body node."

**KMS Examples:**
- `(Endpoint:POST /api/v1/search)-[:RETURNS]->(ResponseBody:SearchResponse_200)`
- `(Endpoint:GET /api/v1/files/{id})-[:RETURNS]->(ResponseBody:KmsFile_200)`
- `(Endpoint:GET /api/v1/files/{id})-[:RETURNS]->(ResponseBody:NotFound_404)`

---

### ACCEPTS

An endpoint accepts a request body.

**Source → Target**: `Endpoint` → `RequestBody`

**Semantics**: "This endpoint expects a request body of this type."

**KMS Examples:**
- `(Endpoint:POST /api/v1/search)-[:ACCEPTS]->(RequestBody:SearchRequest_Body)`
- `(Endpoint:POST /api/v1/scan-jobs)-[:ACCEPTS]->(RequestBody:CreateScanJobDto_Body)`
- `(Endpoint:PATCH /api/v1/files/{id})-[:ACCEPTS]->(RequestBody:UpdateFileDto_Body)`

---

### THROWS

An endpoint can return this error code.

| Property | Type | Description |
|----------|------|-------------|
| `condition` | string | When this error is thrown |

**Source → Target**: `Endpoint` → `ErrorCode`

**Semantics**: "This endpoint may respond with this error code under the stated condition."

**KMS Examples:**
- `(Endpoint:POST /api/v1/search)-[:THROWS {condition: "Missing or invalid Bearer token"}]->(ErrorCode:KMS_4001)`
- `(Endpoint:POST /api/v1/search)-[:THROWS {condition: "Rate limit exceeded"}]->(ErrorCode:KMS_4291)`
- `(Endpoint:GET /api/v1/files/{id})-[:THROWS {condition: "File not found"}]->(ErrorCode:KMS_4041)`

---

### USES_SCHEMA

A RequestBody or ResponseBody uses a Schema to describe its structure.

| Property | Type | Description |
|----------|------|-------------|
| `is_array` | boolean | True if body is an array of schema items |

**Source → Target**: `RequestBody` or `ResponseBody` → `Schema`

**Semantics**: "This request or response body is described by this schema definition."

**KMS Examples:**
- `(RequestBody:SearchRequest_Body)-[:USES_SCHEMA]->(Schema:SearchRequest)`
- `(ResponseBody:SearchResponse_200)-[:USES_SCHEMA]->(Schema:SearchResponse)`
- `(ResponseBody:KmsFile_200)-[:USES_SCHEMA]->(Schema:KmsFile)`
- `(RequestBody:CreateScanJobDto_Body)-[:USES_SCHEMA]->(Schema:CreateScanJobDto)`

---

## Layer 4: Skill / Agent Edges

These edges form the Skill Graph — connecting Skills to Communities, Tools, and each other.

---

### SKILL_COVERS

A skill has coverage knowledge for a code community.

| Property | Type | Description |
|----------|------|-------------|
| `weight` | float | Coverage confidence (0.0–1.0); higher = more authoritative |
| `coverage_type` | string | `primary`, `secondary`, `peripheral` |

**Source → Target**: `Skill` → `Community`

**Semantics**: "This skill has context and responsibility for work in this code community."

**KMS Examples:**
- `(Skill:kb-search-specialist)-[:SKILL_COVERS {weight: 1.0, coverage_type: "primary"}]->(Community:HybridSearchCore)`
- `(Skill:kb-embedding-specialist)-[:SKILL_COVERS {weight: 1.0, coverage_type: "primary"}]->(Community:EmbeddingPipeline)`
- `(Skill:kb-backend-lead)-[:SKILL_COVERS {weight: 0.7, coverage_type: "secondary"}]->(Community:HybridSearchCore)`
- `(Skill:kb-dedup-specialist)-[:SKILL_COVERS {weight: 1.0, coverage_type: "primary"}]->(Community:DeduplicationCore)`

---

### SKILL_COVERS_DOC

A skill references or is responsible for a documentation page.

| Property | Type | Description |
|----------|------|-------------|
| `reference_type` | string | `owns`, `references`, `depends_on` |

**Source → Target**: `Skill` → `DocPage`

**Semantics**: "This skill references or maintains this documentation page."

**KMS Examples:**
- `(Skill:kb-search-specialist)-[:SKILL_COVERS_DOC {reference_type: "owns"}]->(DocPage:hybrid-search-algorithm.md)`
- `(Skill:kb-architect)-[:SKILL_COVERS_DOC {reference_type: "owns"}]->(DocPage:high-level-architecture.md)`
- `(Skill:kb-backend-lead)-[:SKILL_COVERS_DOC {reference_type: "references"}]->(DocPage:04_AUTH_GUIDE.md)`

---

### USES_TOOL

A skill can invoke an MCP tool.

| Property | Type | Description |
|----------|------|-------------|
| `usage_frequency` | string | `always`, `often`, `sometimes` |

**Source → Target**: `Skill` → `MCPTool`

**Semantics**: "This skill is authorized and expected to use this MCP tool."

**KMS Examples:**
- `(Skill:kb-search-specialist)-[:USES_TOOL {usage_frequency: "always"}]->(MCPTool:qdrant-search)`
- `(Skill:kb-embedding-specialist)-[:USES_TOOL {usage_frequency: "often"}]->(MCPTool:qdrant-search)`
- `(Skill:kb-db-specialist)-[:USES_TOOL {usage_frequency: "always"}]->(MCPTool:postgres-query)`
- `(Skill:kb-coordinate)-[:USES_TOOL {usage_frequency: "sometimes"}]->(MCPTool:neo4j-query)`

---

### PART_OF_GROUP

A skill belongs to an agent group.

**Source → Target**: `Skill` → `AgentGroup`

**Semantics**: "This skill is a member of this agent group."

**KMS Examples:**
- `(Skill:kb-coordinate)-[:PART_OF_GROUP]->(AgentGroup:orchestrator)`
- `(Skill:kb-search-specialist)-[:PART_OF_GROUP]->(AgentGroup:domain)`
- `(Skill:kb-embedding-specialist)-[:PART_OF_GROUP]->(AgentGroup:domain)`
- `(Skill:kb-db-specialist)-[:PART_OF_GROUP]->(AgentGroup:backend)`
- `(Skill:kb-devops)-[:PART_OF_GROUP]->(AgentGroup:devops)`

---

### PREREQUISITE

One skill should be loaded or understood before another.

| Property | Type | Description |
|----------|------|-------------|
| `reason` | string | Why this skill is a prerequisite |
| `is_hard_prerequisite` | boolean | True if the dependent skill cannot function without this one |

**Source → Target**: `Skill` → `Skill`

**Semantics**: "To work effectively with this skill, you should first have this other skill's context."

**KMS Examples:**
- `(Skill:kb-search-specialist)-[:PREREQUISITE {reason: "Search is built on the kms-api architecture"}]->(Skill:kb-architect)`
- `(Skill:kb-embedding-specialist)-[:PREREQUISITE {reason: "Needs database schema knowledge"}]->(Skill:kb-db-specialist)`
- `(Skill:kb-dedup-specialist)-[:PREREQUISITE {reason: "Dedup results stored in Neo4j"}]->(Skill:kb-db-specialist)`
- `(Skill:kb-backend-lead)-[:PREREQUISITE]->(Skill:kb-architect)`

---

### HANDLES

A skill is responsible for managing or operating a Component or Service.

| Property | Type | Description |
|----------|------|-------------|
| `responsibility` | string | `deploy`, `debug`, `scale`, `configure`, `monitor` |

**Source → Target**: `Skill` → `Component` or `Service`

**Semantics**: "This skill has operational responsibility for this infrastructure component."

**KMS Examples:**
- `(Skill:kb-devops)-[:HANDLES {responsibility: "deploy"}]->(Service:kms-api)`
- `(Skill:kb-devops)-[:HANDLES {responsibility: "configure"}]->(Service:rabbitmq)`
- `(Skill:kb-search-specialist)-[:HANDLES {responsibility: "configure"}]->(Service:qdrant)`
- `(Skill:kb-db-specialist)-[:HANDLES {responsibility: "configure"}]->(Database:postgresql)`

---

## Layer 5: Architecture Edges

These edges connect the Architecture layer to Code, Infrastructure, and to itself.

---

### DESCRIBED_BY

A Component is governed or described by an ADR.

| Property | Type | Description |
|----------|------|-------------|
| `aspect` | string | Which aspect of the component the ADR covers |

**Source → Target**: `Component` → `ADR`

**Semantics**: "This ADR describes the design decisions behind this component."

**KMS Examples:**
- `(Component:kms-api)-[:DESCRIBED_BY {aspect: "framework choice"}]->(ADR:ADR-001)`
- `(Component:search-api)-[:DESCRIBED_BY {aspect: "search algorithm"}]->(ADR:ADR-004)`
- `(Component:dedup-worker)-[:DESCRIBED_BY {aspect: "graph storage"}]->(ADR:ADR-005)`

---

### GOVERNS

An ADR produces a Constraint that all code in its scope must follow.

**Source → Target**: `ADR` → `Constraint`

**Semantics**: "This architectural decision record produces this enforceable constraint."

**KMS Examples:**
- `(ADR:ADR-002)-[:GOVERNS]->(Constraint:C001)` — RabbitMQ decision governs worker communication constraint
- `(ADR:ADR-001)-[:GOVERNS]->(Constraint:C003)` — API key storage constraint
- `(ADR:ADR-001)-[:GOVERNS]->(Constraint:C004)` — Authentication requirement constraint

---

### VIOLATES

A detected instance where a function or class violates an architectural constraint.

| Property | Type | Description |
|----------|------|-------------|
| `detected_at` | datetime | When the violation was detected |
| `detection_method` | string | `static-analysis`, `manual-review`, `ci-check` |
| `severity` | string | `critical`, `warning` |

**Source → Target**: `Function` or `Class` → `Constraint`

**Semantics**: "This code entity violates this architectural constraint. Requires remediation."

**KMS Examples:**
- `(Function:scan_worker_direct_http_call)-[:VIOLATES {severity: "critical"}]->(Constraint:C001)`
  *(Hypothetical: a worker making direct HTTP call instead of using RabbitMQ)*
- `(Function:store_plaintext_key)-[:VIOLATES {severity: "critical"}]->(Constraint:C003)`
  *(Hypothetical: function storing unhashed API key)*

---

### SUPERSEDES

A newer ADR replaces an older ADR.

| Property | Type | Description |
|----------|------|-------------|
| `reason` | string | Why the old decision was superseded |
| `superseded_date` | date | When the supersession occurred |

**Source → Target**: `ADR` → `ADR`

**Semantics**: "This newer ADR supersedes and replaces this older ADR."

**KMS Examples:**
- `(ADR:ADR-007)-[:SUPERSEDES {reason: "Migrated from single Postgres FTS to hybrid search with Qdrant"}]->(ADR:ADR-003-original-search)`

---

### DEPENDS_ON

A Service or Component runtime-depends on a Database, Queue, or other Service.

| Property | Type | Description |
|----------|------|-------------|
| `dependency_type` | string | `required`, `optional` |
| `startup_order` | integer | Docker Compose `depends_on` ordering hint |

**Source → Target**: `Service` → `Database`, `Queue`, or `Service`

**Semantics**: "This service cannot function without this dependency being available."

**KMS Examples:**
- `(Service:kms-api)-[:DEPENDS_ON {dependency_type: "required"}]->(Database:postgresql)`
- `(Service:kms-api)-[:DEPENDS_ON {dependency_type: "required"}]->(Service:rabbitmq)`
- `(Service:search-api)-[:DEPENDS_ON {dependency_type: "required"}]->(Database:qdrant)`
- `(Service:search-api)-[:DEPENDS_ON {dependency_type: "required"}]->(Database:redis)`
- `(Service:embedding-worker)-[:DEPENDS_ON {dependency_type: "required"}]->(Queue:embed.queue)`
- `(Service:dedup-worker)-[:DEPENDS_ON {dependency_type: "required"}]->(Database:neo4j)`
- `(Service:scan-worker)-[:DEPENDS_ON {dependency_type: "required"}]->(Queue:scan.queue)`

---

### BOUNDED_BY

A Component operates within a defined service or domain boundary.

**Source → Target**: `Component` → `Boundary`

**Semantics**: "This component must operate within the rules defined by this boundary."

**KMS Examples:**
- `(Component:embedding-worker)-[:BOUNDED_BY]->(Boundary:WorkerAsyncBoundary)`
- `(Component:dedup-worker)-[:BOUNDED_BY]->(Boundary:WorkerAsyncBoundary)`
- `(Component:kms-api)-[:BOUNDED_BY]->(Boundary:KmsApiPublicBoundary)`
- `(Component:search-api)-[:BOUNDED_BY]->(Boundary:DockerNetworkBoundary)`

---

## Edge Count Summary (Estimated)

| Layer | Edge Types | Estimated KMS Instance Count |
|-------|-----------|-------------------------------|
| Code | CONTAINS, CALLS, IMPORTS, INHERITS, IMPLEMENTS, HAS_METHOD, DEFINES, MEMBER_OF, STEP_IN_PROCESS | ~10,000–30,000 |
| Documentation | DOCUMENTS, EXPLAINS_CONCEPT, REFERENCES, PART_OF | ~300–600 |
| API Surface | IMPLEMENTS_CONTRACT, RETURNS, ACCEPTS, THROWS, USES_SCHEMA | ~200–400 |
| Skills/Agents | SKILL_COVERS, SKILL_COVERS_DOC, USES_TOOL, PART_OF_GROUP, PREREQUISITE, HANDLES | ~80–150 |
| Architecture | DESCRIBED_BY, GOVERNS, VIOLATES, SUPERSEDES, DEPENDS_ON, BOUNDED_BY | ~80–200 |

---

## Edge Property Conventions

All edges in the graph follow these property conventions:

| Property Name | Type | Used On | Meaning |
|---------------|------|---------|---------|
| `weight` | float (0.0–1.0) | MEMBER_OF, SKILL_COVERS | Confidence or strength of relationship |
| `confidence` | float (0.0–1.0) | IMPLEMENTS_CONTRACT | How certain the edge is (1.0 = verified, <1.0 = inferred) |
| `coverage_type` | string | SKILL_COVERS | `primary`, `secondary`, `peripheral` |
| `detected_at` | datetime | VIOLATES | Timestamp of detection |
| `last_verified` | date | DOCUMENTS | Last time documentation was checked against code |
| `is_hard_prerequisite` | boolean | PREREQUISITE | Whether dependency is blocking |

---

## Related Documentation

- [NODE-TAXONOMY.md](./NODE-TAXONOMY.md) — Node type definitions
- [QUERY-PATTERNS.md](./QUERY-PATTERNS.md) — How to traverse these edges
- [SKILL-GRAPH.md](./SKILL-GRAPH.md) — Skill-specific edge patterns
