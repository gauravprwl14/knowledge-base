# 0011 — Neo4j with Official Python Driver for Knowledge Graph

- **Status**: Accepted
- **Date**: 2026-03-30
- **Deciders**: Architecture Team
- **Tags**: [graph, database, neo4j, knowledge-graph]

## Context and Problem Statement

The KMS knowledge graph stores relationships extracted from user documents: concept co-occurrence, topic similarity, file references, and entity connections. This graph must support:

- Cypher query language for flexible multi-hop traversal
- User-scoped queries (a user must not traverse another user's graph)
- APOC plugin support for advanced graph algorithms
- Self-hosted, open-source deployment (no SaaS cost)
- Integration with the Python `graph-worker` AMQP consumer that builds the graph
- Read-only access from `kms-api` (NestJS) via a dedicated graph module

A relational database cannot efficiently represent arbitrary-depth relationship traversals. A dedicated graph database is required.

## Decision Drivers

- Complex multi-hop relationship queries (e.g., "files related to concept X within 3 hops")
- User-scoped data isolation at the query level (Cypher `WHERE n.user_id = $userId`)
- Open-source, self-hosted to avoid SaaS cost
- Python driver with async support for `graph-worker`
- Bolt protocol for efficient binary wire encoding

## Considered Options

- Option A: Neo4j Community Edition with official `neo4j` Python driver
- Option B: Amazon Neptune (AWS managed graph database)
- Option C: ArangoDB (multi-model: document + graph)
- Option D: PostgreSQL with `pg_graphql` or adjacency list tables

## Decision Outcome

Chosen: **Option A — Neo4j Community Edition with the official `neo4j` Python driver**

Neo4j Community Edition is free, self-hosted via Docker, and the Cypher query language is the most widely adopted graph query language. The official `neo4j` Python driver supports async session execution needed in `graph-worker`. The `kms-api` graph module exposes 4 read-only Cypher endpoints user-scoped via `WHERE n.user_id = $userId`.

### Consequences

**Good:**
- Cypher is expressive and well-documented; existing team familiarity
- APOC plugin provides graph algorithms (shortest path, community detection) for future use
- Official Python driver (`neo4j>=5.0`) has async support via `AsyncDriver.session()`
- Neo4j Browser UI available for development graph inspection
- User-scoped isolation enforced at Cypher query level — no RLS configuration required

**Bad / Trade-offs:**
- Neo4j Community Edition does not support multi-database or role-based access control at the DB layer; user scoping is application-enforced
- APOC plugin is not available in Community Edition by default; must be installed manually in Docker image
- Neo4j JVM process requires more memory than lightweight graph alternatives (~512 MB minimum)
- Schema-free graph means relationships must be validated at application level before write

## Pros and Cons of the Options

### Option A: Neo4j Community Edition — CHOSEN

- ✅ Free, self-hosted via Docker
- ✅ Cypher — mature, expressive graph query language
- ✅ Official Python driver with async support
- ✅ Large community; extensive documentation
- ✅ APOC plugin for advanced algorithms (future)
- ❌ Community Edition lacks multi-database and enterprise RBAC
- ❌ JVM memory overhead (~512 MB baseline)

### Option B: Amazon Neptune

- ✅ Fully managed; no operational burden
- ✅ Supports both Gremlin and SPARQL
- ❌ Not free; not self-hosted — violates cost constraint
- ❌ No local Docker equivalent for development
- ❌ Vendor lock-in to AWS

### Option C: ArangoDB

- ✅ Multi-model (document + graph); single service for documents and graph
- ✅ Free Community Edition; Docker available
- ❌ AQL (ArangoDB Query Language) is unfamiliar to the team
- ❌ Graph traversal performance lags behind Neo4j for deep multi-hop queries
- ❌ Smaller community and ecosystem

### Option D: PostgreSQL with adjacency tables / pg_graphql

- ✅ No additional service; reuses existing PostgreSQL instance
- ✅ ACID transactions and existing Prisma migration tooling
- ❌ Recursive CTEs for multi-hop traversal are verbose and slow at scale
- ❌ No native graph algorithms (APOC equivalent)
- ❌ Not a true graph database — relationship traversal is not a first-class operation
