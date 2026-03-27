# Sprint 6 Board — Embedding & Search Foundation
**Milestone**: M3-M4 overlap
**Sprint Goal**: Files are embedded into Qdrant and keyword search returns results
**Dates**: Weeks 11–12

---

## TODO

### Python embed-worker — Embeddings
- [ ] [L] BGE-M3 model loading (BAAI/bge-m3, 1024 dimensions)
- [ ] [M] Batch embedding: process chunks in batches of 32
- [ ] [M] Qdrant upsert: collection kms_chunks, payload = {fileId, chunkIndex, content}
- [ ] [S] GPU detection: use CUDA if available, fallback to CPU
- [ ] [S] Embedding retry with exponential backoff

### Backend — search-api
- [ ] [M] GET /search?q= — PostgreSQL tsvector keyword search
- [ ] [S] Search result DTO: id, name, mimeType, snippet, score, sourceType
- [ ] [S] Keyword highlight: wrap matched terms in <mark> tags
- [ ] [S] Pagination: cursor-based, limit 20

### Frontend — Search
- [ ] [M] Search page (/[locale]/search) — search box, results list
- [ ] [M] Search result card: type icon, name, snippet (highlighted), score bar, date
- [ ] [S] Loading state: skeleton cards
- [ ] [S] Zero results state with suggestions
- [ ] [S] Error state with retry button

---

## IN PROGRESS

(empty — sprint not started)

---

## DONE

(empty — sprint not started)

---

## Blocked / Risks
| Risk | Impact | Mitigation |
|------|--------|-----------|
| BGE-M3 model load time (cold start) | Medium | Pre-load model at worker startup; keep warm |
| Qdrant collection schema mismatch | High | Pin collection config in code; validate on startup |
| tsvector search latency > 200ms | Medium | GIN index on tsvector column; monitor with EXPLAIN ANALYZE |
| GPU unavailable in CI/CD | Low | CPU fallback path; mark GPU tests as optional |

---

## Definition of Done
- [ ] Indexed files have embeddings in Qdrant
- [ ] GET /search returns ranked results in < 200ms p95
- [ ] Search result cards match design spec
- [ ] Keyword highlighting works in snippets
