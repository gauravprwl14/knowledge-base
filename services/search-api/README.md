# search-api

NestJS 11 + Fastify search service providing keyword, semantic, and hybrid search over the KMS knowledge base.

## Responsibilities
- Keyword search: PostgreSQL full-text search (`plainto_tsquery`, `ts_rank_cd`, `ts_headline`)
- Semantic search: Qdrant vector similarity (Sprint 3)
- Hybrid search: Reciprocal Rank Fusion of keyword + semantic (Sprint 3)
- Result caching via Redis (30s TTL)

## Port
8001

## Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/search | Search with q, mode, limit, offset, filters |
| GET | /api/v1/health | Full health check |
| GET | /api/v1/health/live | Liveness probe |
| GET | /api/v1/docs | Swagger UI (dev only) |

## Search Modes
- `keyword` — PostgreSQL FTS (always available, no extra services)
- `semantic` — Requires `EMBEDDING_ENABLED=true` + Qdrant
- `hybrid` — Requires both above + RRF algorithm

## Error Codes
| Code | Meaning |
|------|---------|
| SRC1000 | Invalid search parameters |
| SRC2000 | Search engine internal error |
| SRC3000 | Qdrant vector DB error |
| SRC4000 | Search timeout |

## Building (SWC — fast)
```bash
npm run build          # SWC compile ~200ms
npm run type:check     # tsc type check (separate)
npm run start:dev      # SWC watch mode
```
