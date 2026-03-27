# KMS Knowledge Graph

**Version**: 1.0
**Last Updated**: 2026-03-16

---

## What It Is

The KMS Knowledge Graph is a unified, navigable property graph that indexes every meaningful artifact in the Knowledge Management System — source code, documentation, API contracts, architectural decisions, infrastructure configuration, and agent skills — and connects them with typed, directional edges.

Rather than treating the codebase, docs, and skill definitions as separate silos, the Knowledge Graph merges them into one queryable structure. Every node in the graph is a first-class entity. Every edge is an explicit, typed relationship with optional metadata such as confidence scores or weights.

---

## Why It Exists: The Context Blindness Problem

AI coding agents face a fundamental limitation when working with large codebases: **context blindness**. Each agent invocation sees only what fits in its context window. Without a structured map of the repository, agents must rely on keyword search, which frequently returns irrelevant results, misses cross-cutting concerns, and cannot answer questions like:

- "What breaks if I change this schema?"
- "Which documentation covers this code community?"
- "What architectural constraints apply to this service?"
- "Which skill should be activated for this file?"

These questions are graph traversal problems. They require navigating typed relationships, not just matching text.

The Knowledge Graph turns the entire repository into an answerable graph database.

---

## Inspiration: GitNexus

This system is inspired by **GitNexus**, which demonstrated that indexing a codebase into a property graph — where files, functions, classes, and imports become nodes and call-edges, containment, and inheritance become relationships — gives AI agents dramatically improved situational awareness.

GitNexus assigns each code entity to a **Community** (a cluster of closely related functions and files) so that agents can say "I am working in the EmbeddingPipeline community" and immediately load the most relevant context.

The KMS Knowledge Graph extends this model beyond code to cover all project artifacts:

| GitNexus Layer | KMS Extension |
|----------------|---------------|
| Code graph (files, functions, classes) | Kept as-is; forms the foundation |
| — | Documentation layer (DocPages, Sections, Concepts) |
| — | API Surface layer (Endpoints, Schemas, ErrorCodes) |
| — | Skills/Agents layer (Skills, AgentGroups, MCPTools) |
| — | Architecture layer (ADRs, Components, Constraints) |
| — | Infrastructure layer (Services, Queues, Databases, Configs) |

---

## The Six Artifact Layers

### 1. Code Layer (Foundation)

The structural layer derived from static analysis of the codebase. Contains File, Folder, Function, Class, Method, Interface, Import, and Community nodes. Edges include CONTAINS, CALLS, IMPORTS, INHERITS, IMPLEMENTS. This layer is the backbone; all other layers anchor to it.

**Example KMS nodes**: `File(embedding_worker.py)`, `Class(QdrantClient)`, `Function(qdrant_upsert)`, `Community(EmbeddingPipeline)`.

### 2. Documentation Layer

Markdown files from `docs/` parsed into DocPage, Section, and Concept nodes. This layer answers the question "where is this explained?" Edges connect DocPages to the Code nodes they document.

**Example KMS nodes**: `DocPage(architecture/05-algorithms/hybrid-search-algorithm.md)`, `Concept(RecipicalRankFusion)`, `Runbook(DEPLOYMENT.md)`.

### 3. API Surface Layer

REST endpoints, request/response bodies, and error codes extracted from OpenAPI specs and contract documents. Edges connect Endpoints to the Functions that implement them and to the Schemas they use.

**Example KMS nodes**: `Endpoint(POST /api/v1/search)`, `Schema(SearchRequest)`, `ErrorCode(KMS_4001)`.

### 4. Skills / Agents Layer

Each Claude skill definition (from `docs/agents/`) becomes a Skill node. Skills are connected to the Code Communities they cover, to MCPTools they use, and to other Skills via PREREQUISITE edges. This layer powers automatic skill routing.

**Example KMS nodes**: `Skill(kb-search-specialist)`, `AgentGroup(backend)`, `MCPTool(qdrant-mcp)`.

### 5. Architecture Layer

Architecture Decision Records and design principles documents become ADR nodes. Services and subsystems become Component nodes. Constraints (rules derived from ADRs) become Constraint nodes. This layer answers "why is the code this way?" and can detect violations.

**Example KMS nodes**: `ADR(adr-001-nestjs-for-api-services)`, `Component(search-api)`, `Constraint(no-direct-db-from-workers)`.

### 6. Infrastructure Layer

Docker Compose service definitions, RabbitMQ queue configurations, database instances, and environment variable groups become Service, Queue, Database, and Config nodes. Edges express runtime dependencies.

**Example KMS nodes**: `Service(embedding-worker)`, `Queue(embed.queue)`, `Database(qdrant)`, `Config(QDRANT_ENV_GROUP)`.

---

## How It Solves Context Blindness

When an agent begins a task, instead of searching for keywords, it traverses the graph:

1. **Locate** the relevant Code Community for the files being modified.
2. **Follow** SKILL_COVERS edges to find which skills are active for this area.
3. **Follow** DOCUMENTS edges to load the relevant DocPages.
4. **Follow** DESCRIBED_BY edges to load governing ADRs.
5. **Follow** IMPLEMENTS_CONTRACT edges to understand API obligations.
6. **Follow** DEPENDS_ON edges to understand infrastructure dependencies.

This traversal produces a targeted, complete context payload — far more precise than keyword search, far more complete than reading one file at a time.

---

## Key Capabilities

### Impact Analysis ("What breaks if I change X?")

Given any node — a Schema, a Function, an Endpoint — the graph can compute a **blast radius**: every node reachable by following relevant edges in reverse. This tells an agent exactly what needs to be tested, updated, or reviewed before a change is shipped.

### Skill Routing ("Which skill covers this file?")

Given a file path, the graph traverses `MEMBER_OF` to the Code Community, then follows `SKILL_COVERS` in reverse to find all Skills that cover that community. Skills are ranked by community match weight and documentation coverage to produce a ranked activation list.

### Documentation Gap Detection

Communities with no inbound `DOCUMENTS` edges from any DocPage are documentation gaps. High-traffic Functions with no DocPage are undocumented critical paths. The graph makes these gaps explicit and queryable.

### Architecture Constraint Enforcement

Functions with a `VIOLATES` edge to a Constraint node represent detected architectural violations. The graph can be queried to produce a violation report during CI.

### Dependency Tracing

Given a Service node, following `DEPENDS_ON` edges produces the full dependency tree: which Databases, Queues, and Config groups are required for that service to function.

---

## Quick Start: Querying the Graph

The Knowledge Graph is intended to be implemented on top of a graph database (Neo4j is already part of the KMS infrastructure stack). Queries are expressed in Cypher.

**Find which skills are relevant for a file:**
```cypher
MATCH (f:File {path: "embedding_worker.py"})
      -[:MEMBER_OF]->(c:Community)
      <-[:SKILL_COVERS]-(s:Skill)
RETURN s.name, s.description
ORDER BY s.community_weight DESC
```

**Find all documentation for a community:**
```cypher
MATCH (doc:DocPage)-[:DOCUMENTS]->(c:Community {name: "EmbeddingPipeline"})
RETURN doc.path, doc.title
```

**Compute blast radius for a schema change:**
```cypher
MATCH (sc:Schema {name: "SearchRequest"})
      <-[:USES_SCHEMA*1..3]-(n)
RETURN DISTINCT labels(n), n.name
```

**Check for architectural violations:**
```cypher
MATCH (f:Function)-[:VIOLATES]->(con:Constraint)
RETURN f.name, f.file, con.rule
```

---

## How Skills Relate to Code Communities

Each Skill in `docs/agents/` is associated with one or more Code Communities via `SKILL_COVERS` edges. When an agent is activated to work on a file:

1. The file's Community is resolved.
2. Skills with a `SKILL_COVERS` edge to that Community are returned as candidates.
3. Skills are ranked: community match weight (60%) + documentation coverage (40%).
4. The top-ranked skills are activated in the agent's context.

This means the graph is the routing layer for the entire multi-agent system. No hard-coded skill lists are needed; skill activation is data-driven and queryable.

---

## Future Implementation Path

The Knowledge Graph is currently defined as a schema. The implementation path is:

1. **Phase 1 — Code Graph**: Run GitNexus (or equivalent AST analyzer) against `kms-api/src/`, the Python workers, and `frontend/`. Ingest into Neo4j (already provisioned in the KMS stack). Assign Community labels using a graph community detection algorithm (e.g., Louvain).

2. **Phase 2 — Documentation Layer**: Write a Markdown parser that converts `docs/**/*.md` into DocPage, Section, and Concept nodes. Link DocPages to Code nodes using heuristic name matching and explicit annotation tags (e.g., `<!-- documents: EmbeddingPipeline -->`).

3. **Phase 3 — API Surface Layer**: Parse `docs/architecture/06-api-contracts/openapi-spec.yaml` into Endpoint, Schema, RequestBody, ResponseBody, and ErrorCode nodes. Link Endpoints to implementing Functions via route-pattern matching.

4. **Phase 4 — Skills Layer**: Parse `docs/agents/**/*.md` into Skill, AgentGroup, and MCPTool nodes. Manually annotate or auto-detect `SKILL_COVERS` edges from skill context files.

5. **Phase 5 — Architecture Layer**: Parse ADR files and extract Component and Constraint nodes. Link via DESCRIBED_BY and GOVERNS edges.

6. **Phase 6 — Infrastructure Layer**: Parse `docker-compose.yml` and service configuration into Service, Queue, Database, and Config nodes.

7. **Phase 7 — Query Interface**: Expose a `/graph/query` endpoint in `kms-api` so agents can issue graph queries without direct Neo4j access.

---

## Related Documentation

- [NODE-TAXONOMY.md](./NODE-TAXONOMY.md) — Complete node type definitions and properties
- [EDGE-TAXONOMY.md](./EDGE-TAXONOMY.md) — Complete edge type definitions and semantics
- [QUERY-PATTERNS.md](./QUERY-PATTERNS.md) — Practical query patterns for common agent tasks
- [SKILL-GRAPH.md](./SKILL-GRAPH.md) — Skill-to-community mapping and routing algorithm
- [Architecture Overview](../architecture/01-system-overview/high-level-architecture.md) — KMS system architecture
- [Microservices Overview](../architecture/02-microservices/README.md) — KMS service catalog
