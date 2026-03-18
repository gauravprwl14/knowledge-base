---
adr: "0029"
title: Standalone search-api NestJS Service for Read-Only Hybrid Search
status: Accepted
date: 2026-03-18
tags: [search, architecture, scaling, internal-service]
---

## ADR-0029: Standalone search-api NestJS Service for Read-Only Hybrid Search

**Status**: Accepted
**Date**: 2026-03-18

### Context

KMS requires a hybrid search capability (BM25 + semantic vector similarity via Qdrant + RRF re-ranking) that is accessed on every user query. The two architectural options were:

1. **Module inside kms-api** — add a `SearchModule` to the existing NestJS monolith at port 8000.
2. **Standalone NestJS service** — run `search-api` as a separate process at port 8001, called by kms-api internally.

Search queries are read-only: they never write to PostgreSQL, never mutate Qdrant, and never enqueue AMQP messages. Write operations (file ingestion, source management, auth) live entirely in kms-api. This read/write asymmetry means the two workloads have fundamentally different resource profiles and scaling requirements.

Search is also the highest-frequency operation in the system. A user chat session triggers multiple search calls per prompt (tiered retrieval: BM25 tier, hybrid tier, optional graph tier). These spikes are independent of write-path load caused by background scan/embed jobs.

Additionally, semantic search involves loading BGE-M3 (1024-dimension vectors) and performing cosine similarity computations against Qdrant. These are memory-intensive operations that benefit from dedicated heap allocation separate from the kms-api process.

### Decision

Run search as a **standalone NestJS 11 (Fastify) service** (`search-api/`) on port 8001. kms-api calls search-api over HTTP for all search operations. search-api is an **internal service only** — it is not exposed to the public internet and is not called directly by browsers.

**Authentication model**: search-api uses **header-based auth** (`x-user-id` header) rather than JWT validation. kms-api is the trust boundary: it validates the incoming JWT, extracts the `userId`, and forwards it as the `x-user-id` header on all internal calls to search-api. This avoids duplicating JWT verification logic in search-api and keeps the auth boundary at the edge (kms-api).

**Deployment**: Both services are defined in `docker-compose.kms.yml`. search-api is on the same internal Docker network as kms-api and is not port-forwarded to the host in production.

**Resource allocation**: search-api can be given a higher memory limit in Docker Compose (or Kubernetes) than kms-api, reflecting the BGE-M3 vector operation overhead. kms-api can be scaled horizontally for write throughput without affecting search-api replicas.

### Consequences

**Positive**:
- Search queries can spike independently without impacting the write path (file ingestion, auth, source management).
- Resource limits can be tuned per service: more RAM for search-api (vector ops), more CPU for kms-api (request handling).
- search-api is strictly read-only, making it easier to reason about correctness and cache aggressively.
- kms-api remains the single trust boundary for JWT validation — no auth logic duplication.
- Simpler failure isolation: a search-api crash does not take down the kms-api write path.

**Negative / Trade-offs**:
- Extra network hop on every search request (kms-api → search-api over Docker bridge network; typically < 1ms).
- Two services to operate, monitor, and deploy instead of one.
- The `x-user-id` header model requires network-level trust enforcement (Docker network isolation or mTLS); any service that can reach search-api's internal port can impersonate any user.

**Follow-up work**:
- Consider mTLS between kms-api and search-api if the internal network boundary is not sufficient (tracked separately).
- search-api health endpoint (`GET /health`) must be registered in Docker Compose healthcheck to prevent kms-api from routing to an unready search-api instance.
- Cache layer (Redis) for repeated identical queries should be added to search-api to eliminate redundant Qdrant calls within short time windows.
