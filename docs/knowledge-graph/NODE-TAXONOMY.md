# KMS Knowledge Graph — Node Taxonomy

**Version**: 1.0
**Last Updated**: 2026-03-16

---

## Overview

This document defines every node type in the KMS Knowledge Graph. Each node type belongs to one of six artifact layers. For each type, the properties table lists required and optional fields. Examples are drawn from the live KMS codebase.

Node label naming convention: `PascalCase`, matching Neo4j best practice. A node may carry multiple labels (e.g., a Function node inside a test file carries both `:Function` and `:TestFunction`).

---

## Layer 1: Code Nodes

These nodes are produced by static analysis of the codebase. They form the structural backbone of the graph. The KMS codebase spans TypeScript (kms-api, search-api, web-ui) and Python (scan-worker, embedding-worker, dedup-worker, junk-detector, voice-app).

---

### File

A single source file in the repository.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | yes | Repo-relative path (e.g., `kms-api/src/modules/auth/auth.service.ts`) |
| `absolute_path` | string | yes | Absolute filesystem path |
| `language` | string | yes | `typescript`, `python`, `yaml`, `json`, etc. |
| `size_bytes` | integer | no | File size |
| `line_count` | integer | no | Total lines |
| `last_modified` | datetime | no | Last git commit timestamp for this file |
| `community_id` | string | no | ID of the Community this file belongs to |

**KMS Examples:**
- `File {path: "kms-api/src/modules/auth/auth.service.ts", language: "typescript"}`
- `File {path: "embedding-worker/app/processors/pdf_processor.py", language: "python"}`
- `File {path: "docs/architecture/05-algorithms/hybrid-search-algorithm.md", language: "markdown"}`

---

### Folder

A directory in the repository.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | yes | Repo-relative path |
| `name` | string | yes | Directory name |
| `depth` | integer | no | Depth from repository root (0 = root) |

**KMS Examples:**
- `Folder {path: "kms-api/src/modules/", name: "modules"}`
- `Folder {path: "embedding-worker/app/processors/", name: "processors"}`

---

### Function

A top-level function or standalone async function.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | yes | Function name |
| `file` | string | yes | Containing file path |
| `line_start` | integer | yes | Line number where function starts |
| `line_end` | integer | no | Line number where function ends |
| `signature` | string | no | Full parameter and return type signature |
| `is_async` | boolean | no | True if async function |
| `is_exported` | boolean | no | True if exported/public |
| `complexity` | integer | no | Cyclomatic complexity score |
| `community_id` | string | no | Assigned community |

**KMS Examples:**
- `Function {name: "hybridSearch", file: "search-api/src/search.service.ts", is_async: true}`
- `Function {name: "generate_embeddings", file: "embedding-worker/app/embedder.py", is_async: true}`
- `Function {name: "calculate_sha256", file: "dedup-worker/app/hasher.py"}`

---

### Class

A class definition (TypeScript class, Python class).

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | yes | Class name |
| `file` | string | yes | Containing file path |
| `line_start` | integer | yes | Line number |
| `is_abstract` | boolean | no | True if abstract class |
| `is_exported` | boolean | no | True if exported/public |
| `decorator` | string | no | Primary decorator (`@Injectable`, `@Controller`, etc.) |
| `community_id` | string | no | Assigned community |

**KMS Examples:**
- `Class {name: "AuthService", file: "kms-api/src/modules/auth/auth.service.ts", decorator: "@Injectable"}`
- `Class {name: "SearchController", file: "search-api/src/search.controller.ts", decorator: "@Controller"}`
- `Class {name: "QdrantRepository", file: "search-api/src/repositories/qdrant.repository.ts"}`

---

### Method

A method on a class.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | yes | Method name |
| `class_name` | string | yes | Containing class name |
| `file` | string | yes | Containing file path |
| `line_start` | integer | yes | Line number |
| `visibility` | string | no | `public`, `private`, `protected` |
| `is_async` | boolean | no | True if async |
| `decorator` | string | no | Method decorator (`@Get`, `@Post`, `@MessagePattern`) |

**KMS Examples:**
- `Method {name: "search", class_name: "SearchController", decorator: "@Post", is_async: true}`
- `Method {name: "upsertVectors", class_name: "QdrantRepository", visibility: "private"}`
- `Method {name: "validateApiKey", class_name: "AuthService", is_async: true}`

---

### Interface

A TypeScript interface or Python Protocol / abstract base class.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | yes | Interface name |
| `file` | string | yes | Containing file path |
| `line_start` | integer | yes | Line number |
| `member_count` | integer | no | Number of fields/methods declared |

**KMS Examples:**
- `Interface {name: "ISearchService", file: "search-api/src/interfaces/search.interface.ts"}`
- `Interface {name: "TranscriptionProvider", file: "voice-app/backend/app/services/transcription/base.py"}`

---

### Import

A single import statement — the dependency edge anchor.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `source_file` | string | yes | File that contains the import |
| `imported_module` | string | yes | Module path or package name |
| `imported_symbols` | list[string] | no | Named symbols imported |
| `is_external` | boolean | no | True if from an external package |

**KMS Examples:**
- `Import {source_file: "search-api/src/search.service.ts", imported_module: "@qdrant/js-client-rest", is_external: true}`
- `Import {source_file: "embedding-worker/app/embedder.py", imported_module: "sentence_transformers", is_external: true}`

---

### Community

A logical cluster of closely related files and functions, detected by graph community detection (e.g., Louvain algorithm on the CALLS and IMPORTS graph).

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | yes | Unique community identifier |
| `name` | string | yes | Human-readable name assigned after detection |
| `description` | string | no | Short description of what this community does |
| `size` | integer | no | Number of nodes in community |
| `primary_language` | string | no | Dominant language in community |
| `service` | string | no | Which microservice this community lives in |

**KMS Examples:**
- `Community {id: "c001", name: "EmbeddingPipeline", service: "embedding-worker", description: "Handles text extraction, chunking, and vector generation"}`
- `Community {id: "c002", name: "HybridSearchCore", service: "search-api", description: "Implements RRF-based hybrid keyword + semantic search"}`
- `Community {id: "c003", name: "AuthCore", service: "kms-api", description: "API key authentication and session management"}`
- `Community {id: "c004", name: "DeduplicationCore", service: "dedup-worker", description: "SHA-256 exact and cosine semantic duplicate detection"}`
- `Community {id: "c005", name: "FileScanningCore", service: "scan-worker", description: "Google Drive and local filesystem discovery"}`
- `Community {id: "c006", name: "TranscriptionCore", service: "voice-app", description: "Audio/video transcription via Whisper, Groq, Deepgram"}`
- `Community {id: "c007", name: "JunkDetectionCore", service: "junk-detector", description: "Rule-based and ML junk file classification"}`
- `Community {id: "c008", name: "FilesCRUD", service: "kms-api", description: "File metadata CRUD and bulk operations"}`
- `Community {id: "c009", name: "SourcesManagement", service: "kms-api", description: "Source registration, OAuth token management"}`
- `Community {id: "c010", name: "WebUICore", service: "web-ui", description: "Next.js frontend dashboard and search interface"}`

---

### Process

A named end-to-end process composed of ordered function steps. Processes are manually annotated or derived from data flow documentation.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | yes | Process name |
| `description` | string | yes | What this process accomplishes |
| `entry_point` | string | no | First function/endpoint in the process |
| `trigger` | string | no | What triggers this process (HTTP request, queue message, etc.) |

**KMS Examples:**
- `Process {name: "FileScanFlow", trigger: "POST /api/v1/scan-jobs", description: "Scans source, indexes files, generates embeddings, detects duplicates"}`
- `Process {name: "HybridSearchFlow", trigger: "POST /api/v1/search", description: "Runs parallel keyword + semantic search and merges via RRF"}`
- `Process {name: "TranscriptionFlow", trigger: "Queue: trans.queue", description: "Downloads audio, converts to WAV, transcribes, returns webhook"}`

---

## Layer 2: Documentation Nodes

These nodes represent the human-readable documentation artifacts stored in `docs/`.

---

### DocPage

A single Markdown file in the `docs/` directory.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | yes | Repo-relative path to the `.md` file |
| `title` | string | yes | H1 heading of the document |
| `category` | string | no | `architecture`, `guide`, `api-contract`, `runbook`, `session-summary` |
| `last_updated` | date | no | Date from document metadata or git |
| `word_count` | integer | no | Total word count |
| `version` | string | no | Document version if declared |

**KMS Examples:**
- `DocPage {path: "docs/architecture/05-algorithms/hybrid-search-algorithm.md", title: "Hybrid Search Algorithm", category: "architecture"}`
- `DocPage {path: "docs/guides/Backend/04_AUTH_GUIDE.md", title: "Authentication Guide", category: "guide"}`
- `DocPage {path: "docs/architecture/06-api-contracts/search-endpoints.md", title: "Search Endpoints", category: "api-contract"}`

---

### Section

A heading (H2 or H3) within a DocPage.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `heading` | string | yes | Heading text |
| `level` | integer | yes | Heading level (2 or 3) |
| `doc_path` | string | yes | Parent DocPage path |
| `anchor` | string | no | URL anchor for direct linking |

**KMS Examples:**
- `Section {heading: "Hybrid Search with Reciprocal Rank Fusion", level: 2, doc_path: "docs/architecture/05-algorithms/hybrid-search-algorithm.md"}`
- `Section {heading: "Authentication Flow", level: 2, doc_path: "docs/architecture/01-system-overview/high-level-architecture.md"}`

---

### Concept

A domain term or technical concept defined in the documentation.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | yes | Concept name |
| `definition` | string | yes | One-sentence definition |
| `defined_in` | string | yes | DocPage path where it is defined |
| `aliases` | list[string] | no | Other names for this concept |

**KMS Examples:**
- `Concept {name: "ReciprocalRankFusion", definition: "Algorithm that merges ranked lists from keyword and semantic search by reciprocal position", defined_in: "docs/architecture/05-algorithms/hybrid-search-algorithm.md", aliases: ["RRF"]}`
- `Concept {name: "SemanticDuplicate", definition: "Two files with cosine similarity above 0.92 in vector space", defined_in: "docs/architecture/05-algorithms/semantic-duplicate-detection.md"}`
- `Concept {name: "ExactDuplicate", definition: "Two files with identical SHA-256 hash", defined_in: "docs/architecture/05-algorithms/exact-duplicate-detection.md"}`
- `Concept {name: "ScanJob", definition: "A job that triggers source discovery and file indexing", defined_in: "docs/architecture/04-data-flows/file-scanning-flow.md"}`

---

### Runbook

An operational guide that describes how to perform a specific operational task.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | yes | Repo-relative path |
| `title` | string | yes | Runbook title |
| `trigger` | string | no | When this runbook is used |
| `severity` | string | no | `routine`, `incident`, `emergency` |

**KMS Examples:**
- `Runbook {path: "docs/DEPLOYMENT.md", title: "Production Deployment Guide", trigger: "New release deployment", severity: "routine"}`
- `Runbook {path: "docs/DOCKER_DEVELOPMENT.md", title: "Docker Development Setup", trigger: "New developer onboarding", severity: "routine"}`
- `Runbook {path: "docs/MANUAL_JOB_MANAGEMENT.md", title: "Manual Job Management", trigger: "Stuck or failed jobs in production", severity: "incident"}`

---

## Layer 3: API Surface Nodes

These nodes represent the public API contract of the KMS system as defined in `docs/architecture/06-api-contracts/`.

---

### Endpoint

A single REST endpoint.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `method` | string | yes | HTTP method (`GET`, `POST`, `PATCH`, `DELETE`) |
| `path` | string | yes | URL path pattern (e.g., `/api/v1/search`) |
| `service` | string | yes | Which microservice handles this endpoint |
| `description` | string | no | Short description |
| `auth_required` | boolean | no | True if Bearer token required |
| `rate_limited` | boolean | no | True if rate limiting applies |
| `contract_doc` | string | no | Path to the API contract doc |

**KMS Examples:**
- `Endpoint {method: "POST", path: "/api/v1/search", service: "search-api", auth_required: true, rate_limited: true}`
- `Endpoint {method: "GET", path: "/api/v1/files", service: "kms-api", auth_required: true}`
- `Endpoint {method: "POST", path: "/api/v1/scan-jobs", service: "kms-api", auth_required: true}`
- `Endpoint {method: "GET", path: "/api/v1/files/{id}/chunks", service: "kms-api", auth_required: true}`
- `Endpoint {method: "POST", path: "/api/v1/files/bulk-delete", service: "kms-api", auth_required: true}`

---

### Schema

A TypeScript interface, Pydantic model, or DTO class that defines a data shape.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | yes | Schema name |
| `file` | string | yes | File where schema is defined |
| `type` | string | no | `request`, `response`, `entity`, `dto`, `enum` |
| `field_count` | integer | no | Number of fields |

**KMS Examples:**
- `Schema {name: "SearchRequest", file: "search-api/src/dto/search-request.dto.ts", type: "request"}`
- `Schema {name: "SearchResponse", file: "search-api/src/dto/search-response.dto.ts", type: "response"}`
- `Schema {name: "KmsFile", file: "kms-api/src/modules/files/entities/kms-file.entity.ts", type: "entity"}`
- `Schema {name: "CreateSourceDto", file: "kms-api/src/modules/sources/dto/create-source.dto.ts", type: "dto"}`

---

### RequestBody

The body payload accepted by an endpoint. Linked to a Schema via USES_SCHEMA.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `endpoint_ref` | string | yes | Reference to parent Endpoint |
| `content_type` | string | yes | `application/json`, `multipart/form-data`, etc. |
| `required` | boolean | yes | Whether body is required |

**KMS Examples:**
- `RequestBody {endpoint_ref: "POST /api/v1/search", content_type: "application/json", required: true}`
- `RequestBody {endpoint_ref: "POST /api/v1/scan-jobs", content_type: "application/json", required: true}`

---

### ResponseBody

The payload returned by an endpoint. Linked to a Schema via USES_SCHEMA.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `endpoint_ref` | string | yes | Reference to parent Endpoint |
| `status_code` | integer | yes | HTTP status code |
| `content_type` | string | no | `application/json` |

**KMS Examples:**
- `ResponseBody {endpoint_ref: "POST /api/v1/search", status_code: 200, content_type: "application/json"}`
- `ResponseBody {endpoint_ref: "GET /api/v1/files/{id}", status_code: 404}`

---

### ErrorCode

A typed error code with metadata, defined in the error handling system.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `code` | string | yes | Error code string (e.g., `KMS_4001`) |
| `http_status` | integer | yes | Associated HTTP status code |
| `message` | string | yes | Default error message |
| `domain` | string | no | `auth`, `files`, `search`, `sources`, `duplicates` |

**KMS Examples:**
- `ErrorCode {code: "KMS_4001", http_status: 401, message: "Invalid or missing API key", domain: "auth"}`
- `ErrorCode {code: "KMS_4041", http_status: 404, message: "File not found", domain: "files"}`
- `ErrorCode {code: "KMS_4291", http_status: 429, message: "Rate limit exceeded", domain: "search"}`
- `ErrorCode {code: "KMS_5001", http_status: 500, message: "Internal server error"}`

---

## Layer 4: Skills / Agents Nodes

These nodes represent the Claude agent skill definitions that live in `docs/agents/`.

---

### Skill

A Claude Code skill (an agent persona with a specific domain responsibility).

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | yes | Skill identifier (e.g., `kb-search-specialist`) |
| `display_name` | string | yes | Human-readable name |
| `doc_path` | string | yes | Path to the skill markdown file |
| `group` | string | yes | Agent group (`orchestrator`, `backend`, `domain`, `devops`, `quality`) |
| `description` | string | no | What this skill is responsible for |
| `primary_language` | string | no | Primary language/framework it operates in |

**KMS Examples:**
- `Skill {name: "kb-coordinate", group: "orchestrator", display_name: "KMS Coordinator", description: "Orchestrates multi-agent tasks and routes sub-tasks"}`
- `Skill {name: "kb-architect", group: "architecture", display_name: "KMS Architect", description: "Governs system design and architectural decisions"}`
- `Skill {name: "kb-backend-lead", group: "backend", display_name: "KMS Backend Lead", description: "Oversees NestJS kms-api and service layer"}`
- `Skill {name: "kb-search-specialist", group: "domain", display_name: "KMS Search Specialist", description: "Owns hybrid search, RRF algorithm, Qdrant integration"}`
- `Skill {name: "kb-embedding-specialist", group: "domain", display_name: "KMS Embedding Specialist", description: "Owns text extraction, chunking, vector generation"}`
- `Skill {name: "kb-db-specialist", group: "backend", display_name: "KMS Database Specialist", description: "Owns PostgreSQL schemas, Prisma migrations, TypeORM"}`

---

### AgentGroup

A named group of skills that collaborate on a domain.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | yes | Group identifier |
| `description` | string | yes | What this group is responsible for |
| `skill_count` | integer | no | Number of skills in group |

**KMS Examples:**
- `AgentGroup {name: "orchestrator", description: "Top-level coordination and routing agents"}`
- `AgentGroup {name: "backend", description: "NestJS API and Python worker backend agents"}`
- `AgentGroup {name: "domain", description: "Domain-specific specialists: search, embedding, dedup"}`
- `AgentGroup {name: "devops", description: "Infrastructure, Docker, observability agents"}`
- `AgentGroup {name: "quality", description: "Testing, QA, and code review agents"}`

---

### MCPTool

A Model Context Protocol tool that a skill can invoke.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | yes | Tool identifier |
| `description` | string | yes | What this tool does |
| `server` | string | no | MCP server that provides this tool |

**KMS Examples:**
- `MCPTool {name: "qdrant-search", description: "Execute vector similarity search in Qdrant", server: "qdrant-mcp"}`
- `MCPTool {name: "neo4j-query", description: "Execute Cypher queries against the knowledge graph", server: "neo4j-mcp"}`
- `MCPTool {name: "postgres-query", description: "Execute SQL queries against PostgreSQL", server: "postgres-mcp"}`

---

## Layer 5: Architecture Nodes

These nodes represent architectural decisions, components, and constraints.

---

### ADR

An Architecture Decision Record — a documented architectural decision.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | yes | ADR identifier (e.g., `ADR-001`) |
| `title` | string | yes | Decision title |
| `status` | string | yes | `proposed`, `accepted`, `deprecated`, `superseded` |
| `doc_path` | string | no | Path to ADR document if it exists |
| `date` | date | no | Date decision was made |
| `decision_makers` | list[string] | no | Roles or names involved |

**KMS Examples:**
- `ADR {id: "ADR-001", title: "Use NestJS for API services", status: "accepted"}`
- `ADR {id: "ADR-002", title: "Use RabbitMQ for inter-service messaging", status: "accepted"}`
- `ADR {id: "ADR-003", title: "Use Qdrant for vector storage", status: "accepted"}`
- `ADR {id: "ADR-004", title: "Hybrid search with RRF over pure semantic search", status: "accepted"}`
- `ADR {id: "ADR-005", title: "Neo4j for relationship and hierarchy storage", status: "accepted"}`

---

### Component

A service, subsystem, or significant module in the KMS architecture.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | yes | Component name |
| `type` | string | yes | `api-service`, `worker`, `frontend`, `database`, `message-broker`, `cache`, `storage` |
| `language` | string | no | Primary language/framework |
| `port` | integer | no | Exposed port if applicable |
| `description` | string | no | Short description |

**KMS Examples:**
- `Component {name: "kms-api", type: "api-service", language: "typescript/nestjs", port: 8000}`
- `Component {name: "search-api", type: "api-service", language: "typescript/nestjs", port: 8001}`
- `Component {name: "embedding-worker", type: "worker", language: "python"}`
- `Component {name: "dedup-worker", type: "worker", language: "python"}`
- `Component {name: "web-ui", type: "frontend", language: "typescript/nextjs", port: 3000}`

---

### Boundary

A service or domain boundary that defines where one subsystem ends and another begins.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | yes | Boundary name |
| `type` | string | yes | `service-boundary`, `domain-boundary`, `network-boundary` |
| `description` | string | no | What is inside vs. outside this boundary |

**KMS Examples:**
- `Boundary {name: "KmsApiPublicBoundary", type: "service-boundary", description: "Everything behind the /api/v1/* path prefix is inside kms-api's responsibility"}`
- `Boundary {name: "WorkerAsyncBoundary", type: "domain-boundary", description: "Workers only communicate via RabbitMQ queues; no direct HTTP calls to API services"}`
- `Boundary {name: "DockerNetworkBoundary", type: "network-boundary", description: "All inter-service communication within kms_network is internal; only Nginx is public-facing"}`

---

### Constraint

An architectural rule derived from an ADR or design principle.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | yes | Constraint identifier |
| `rule` | string | yes | The rule statement |
| `source_adr` | string | no | ADR that governs this constraint |
| `severity` | string | no | `must`, `should`, `may` |

**KMS Examples:**
- `Constraint {id: "C001", rule: "Workers must not make direct HTTP calls to kms-api; use RabbitMQ queues only", severity: "must", source_adr: "ADR-002"}`
- `Constraint {id: "C002", rule: "search-api must treat PostgreSQL as read-only; all writes go through kms-api", severity: "must"}`
- `Constraint {id: "C003", rule: "API keys must be stored as SHA-256 hashes; plaintext keys must never be persisted", severity: "must", source_adr: "ADR-001"}`
- `Constraint {id: "C004", rule: "All HTTP endpoints must require Bearer token authentication except /health", severity: "must"}`

---

## Layer 6: Infrastructure Nodes

These nodes represent the runtime infrastructure of the KMS system.

---

### Service

A Docker Compose service definition.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | yes | Docker Compose service name |
| `image` | string | no | Docker image name |
| `build_context` | string | no | Build context path |
| `port_mapping` | string | no | `host:container` port mapping |
| `restart_policy` | string | no | Docker restart policy |

**KMS Examples:**
- `Service {name: "kms-api", build_context: "kms-api/", port_mapping: "8000:8000"}`
- `Service {name: "embedding-worker", build_context: "embedding-worker/"}`
- `Service {name: "postgres", image: "postgres:16-alpine", port_mapping: "5432:5432"}`
- `Service {name: "qdrant", image: "qdrant/qdrant:latest", port_mapping: "6333:6333"}`
- `Service {name: "neo4j", image: "neo4j:5-community", port_mapping: "7687:7687"}`
- `Service {name: "rabbitmq", image: "rabbitmq:3.13-management-alpine", port_mapping: "5672:5672"}`

---

### Queue

A RabbitMQ queue in the KMS message broker.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | yes | Queue name |
| `routing_key` | string | yes | RabbitMQ routing key |
| `exchange` | string | yes | Exchange name |
| `durable` | boolean | no | Whether queue survives broker restart |
| `priority_max` | integer | no | Maximum priority level |
| `dead_letter_exchange` | string | no | DLX for failed messages |

**KMS Examples:**
- `Queue {name: "scan.queue", routing_key: "scan", exchange: "kms.direct", priority_max: 10, dead_letter_exchange: "kms.dlx"}`
- `Queue {name: "embed.queue", routing_key: "embed", exchange: "kms.direct", priority_max: 10}`
- `Queue {name: "dedup.queue", routing_key: "dedup", exchange: "kms.direct", priority_max: 10}`
- `Queue {name: "trans.queue", routing_key: "trans", exchange: "kms.direct", priority_max: 10}`
- `Queue {name: "failed.queue", routing_key: "failed", exchange: "kms.dlx"}`

---

### Database

A persistent data store in the KMS infrastructure.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | yes | Database system name |
| `type` | string | yes | `relational`, `vector`, `graph`, `object-storage`, `cache` |
| `port` | integer | yes | Service port |
| `version` | string | no | Database version |
| `primary_use` | string | no | What data this database primarily stores |

**KMS Examples:**
- `Database {name: "postgresql", type: "relational", port: 5432, primary_use: "User accounts, API keys, file metadata, scan jobs, duplicates"}`
- `Database {name: "qdrant", type: "vector", port: 6333, primary_use: "File and chunk vector embeddings"}`
- `Database {name: "neo4j", type: "graph", port: 7687, primary_use: "File hierarchy, duplicate relationships, user ownership"}`
- `Database {name: "redis", type: "cache", port: 6379, primary_use: "Search result caching, API key sessions, rate limit counters"}`
- `Database {name: "minio", type: "object-storage", port: 9000, primary_use: "Uploaded files, processed audio files"}`

---

### Config

A logical group of related environment variables.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | yes | Config group name |
| `service` | string | yes | Service that uses this config group |
| `variables` | list[string] | no | Environment variable names in this group |
| `required` | boolean | no | Whether all variables are required for startup |

**KMS Examples:**
- `Config {name: "PostgresConfig", service: "kms-api", variables: ["DATABASE_URL", "DB_POOL_SIZE", "DB_IDLE_TIMEOUT"], required: true}`
- `Config {name: "QdrantConfig", service: "search-api", variables: ["QDRANT_URL", "QDRANT_COLLECTION_DEFAULT", "QDRANT_COLLECTION_CLOUD"], required: true}`
- `Config {name: "RabbitMQConfig", service: "scan-worker", variables: ["RABBITMQ_URL", "RABBITMQ_EXCHANGE", "RABBITMQ_QUEUE_SCAN"], required: true}`
- `Config {name: "OAuthConfig", service: "kms-api", variables: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OAUTH_REDIRECT_URI"], required: true}`
- `Config {name: "ObservabilityConfig", service: "kms-api", variables: ["OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_SERVICE_NAME", "OTEL_TRACES_SAMPLER"], required: false}`

---

## Node Count Summary (Estimated)

| Layer | Node Types | Estimated KMS Instance Count |
|-------|-----------|-------------------------------|
| Code | File, Folder, Function, Class, Method, Interface, Import, Community, Process | ~2,000–5,000 |
| Documentation | DocPage, Section, Concept, Runbook | ~250–400 |
| API Surface | Endpoint, Schema, RequestBody, ResponseBody, ErrorCode | ~150–250 |
| Skills/Agents | Skill, AgentGroup, MCPTool | ~30–50 |
| Architecture | ADR, Component, Boundary, Constraint | ~50–100 |
| Infrastructure | Service, Queue, Database, Config | ~40–60 |

---

## Related Documentation

- [EDGE-TAXONOMY.md](./EDGE-TAXONOMY.md) — How these nodes are connected
- [QUERY-PATTERNS.md](./QUERY-PATTERNS.md) — Common traversals using these nodes
- [SKILL-GRAPH.md](./SKILL-GRAPH.md) — Skill-to-Community mapping using Skill nodes
