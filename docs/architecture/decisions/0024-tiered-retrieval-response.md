# ADR-0024 — Tiered Retrieval Response Strategy

- **Status**: Accepted
- **Date**: 2026-03-17
- **Tags**: search, rag, retrieval, llm, performance
- **Deciders**: Engineering Team

---

## Context and Problem Statement

Should KMS always call an LLM to generate answers, or should it use a tiered approach where retrieval results are returned directly when confidence is high enough?

The current KMS design routes all queries through Ollama for generation. Ollama (llama3.2:3b) requires significant RAM/GPU and is not viable on all machines. The default `.kms/config.json` already ships with `llm.enabled: false` — confirming the system was never designed to require LLM availability as a hard dependency.

Empirically, ~65–70% of knowledge base queries are factual lookups or concept searches where a retrieved chunk directly answers the question without any synthesis. For these queries, routing through an LLM adds 1–30 seconds of latency while providing no material improvement in answer quality. Direct retrieval completes in 50–200ms. Enterprise search systems (Elasticsearch, Vertex AI Search, Coveo) all gate LLM escalation behind retrieval confidence thresholds before generating answers.

---

## Decision Drivers

- System must be fully functional with `llm.enabled: false` (default config)
- p95 query latency must be acceptable on developer laptops without GPU
- LLM cost and resource consumption should be proportional to query complexity
- Retrieval confidence scores from BGE-M3 + BM25 are already computed — gating on them is free
- Response shape must support both chunk-based and generated answers without breaking the frontend contract
- Graceful degradation is required: if no LLM is available, return the best retrieval result with a clear signal

---

## Considered Options

### Option 1 — LLM-Always

Every query follows: search → LLM → answer. Simple single-path pipeline.

- Requires Ollama running on every deployment
- 1–30 second latency for all queries regardless of complexity
- Unusable in default config (`llm.enabled: false`)

### Option 2 — Tiered Retrieval (5 tiers)

Rule-based query classifier routes queries to the cheapest tier that can satisfy them. LLM is only invoked when retrieval confidence is below threshold AND the query requires synthesis or generation.

- System works fully without any LLM configured
- p95 latency drops to ~150ms for majority of queries
- LLM cost only incurred when genuinely needed
- Graceful degradation built in

### Option 3 — LLM-Never

Pure search and retrieval only. Always return raw chunks with citations.

- Eliminates latency and resource concerns entirely
- Cannot answer questions that require synthesis across multiple documents
- Not suitable for SYNTHESIZE or GENERATE intent classes

### Option 4 — Confidence-Gated (simplified)

Run search first; if top-result score exceeds a single threshold, return directly, else escalate to LLM.

- Simpler than full tiering
- Does not distinguish intent — a high-scoring chunk for an "explain" query may still be insufficient
- No cache tier, no graph expansion tier
- Harder to extend

---

## Decision Outcome

**Chosen option: Option 2 — Tiered Retrieval.**

The 5-tier model maps directly onto the existing service topology (Redis, search-api, Qdrant, Neo4j, rag-service) with no new infrastructure required. The rule-based classifier runs in ~5ms with no LLM dependency. Tiers 0–3 are fully operational in the default config; Tier 4 is opt-in via the LLM Guard check.

---

## The 5 Tiers

| Tier | Mechanism | Entry Condition | Target Latency | LLM Required |
|------|-----------|-----------------|----------------|--------------|
| 0 | Redis cache | Cache hit on query fingerprint | ~1ms | No |
| 1 | BM25 keyword search | score > 0.90, intent = LOOKUP | ~50ms | No |
| 2 | Hybrid search (BM25 + BGE-M3 + RRF) | score > 0.80, intent = FIND | ~150ms | No |
| 3 | Hybrid + Neo4j graph expansion + CrossEncoder rerank | intent = EXPLAIN or SYNTHESIZE, sufficient chunks | ~300ms | No |
| 4 | Tier 3 context → external agent | intent = SYNTHESIZE or GENERATE, LLM available | 3–10s | Yes (optional) |

### Tier 0 — Redis Cache

Cache key is a normalized query fingerprint (lowercased, stemmed, UTF-8 normalized). TTL is configurable via `search.cache_ttl_seconds` (default: 300). Cache is invalidated on source re-ingestion for affected file IDs.

### Tier 1 — BM25 Keyword Search

BM25 is executed against the search-api. If the top result score exceeds `search.tier1_threshold` (default: 0.90) and the classified intent is LOOKUP, the single top chunk is returned with its citation. No vector search, no LLM.

### Tier 2 — Hybrid Search with RRF

BM25 and BGE-M3 (1024-dim) vector search scores are fused via Reciprocal Rank Fusion (RRF). If the fused score exceeds `search.tier2_threshold` (default: 0.80) and intent is FIND, the top-3 chunks are returned with citations. No LLM.

### Tier 3 — Hybrid + Graph Expansion + Reranking

Hybrid search is run first. Results are expanded via Neo4j entity relationship traversal (depth ≤ 2). The expanded candidate set is reranked by a CrossEncoder model. If the intent is EXPLAIN or SYNTHESIZE and at least `search.tier3_min_chunks` (default: 2) relevant chunks are available, structured chunks with citations and graph context are returned directly. `generation_skipped` is `false` — Tier 3 is a complete answer, not a fallback.

### Tier 4 — External Agent Generation

Tier 3 context is passed to the ExternalAgentAdapter. Before invoking any LLM, the LLM Guard is evaluated:

1. Is a Claude API key present AND `external_agents.enabled: true` in feature flags? → Use Claude API (preferred, low-latency, no local GPU)
2. Else: is Ollama reachable at the configured endpoint? → Use Ollama (llama3.2:3b)
3. Neither available: return Tier 3 result with `{ "generation_skipped": true, "reason": "no_llm_available" }`

Tier 4 is the only tier that returns `answer_type: "generated"`.

---

## Query Classifier

The classifier is rule-based with no LLM dependency. It runs in approximately 5ms by scanning query tokens against keyword signal lists.

| Intent | Signal Keywords | Escalates To |
|--------|----------------|--------------|
| LOOKUP | "what is", "show me", "find", "get", "list", "define", "when was" | Tier 1 |
| FIND | (default — no keyword match) | Tier 2 |
| EXPLAIN | "how does", "explain", "how do", "overview", "walk me through", "describe" | Tier 3 |
| SYNTHESIZE | "summarize", "compare", "difference between", "pros and cons", "which is better" | Tier 3 → Tier 4 |
| GENERATE | "write", "generate", "create", "implement", "build", "draft", "code for" | Tier 4 |

Classification is deterministic: a query matches the first intent whose signals appear in the lowercased query string. FIND is the catch-all default. The classifier result is included in all response envelopes as `query_intent`.

OTel span: `kb.query.classify` with attribute `kb.query.intent`.

---

## Confidence Thresholds

All thresholds are tunable at runtime via `.kms/config.json` without service restart (hot-reloaded by rag-service).

| Config Key | Default | Description |
|------------|---------|-------------|
| `search.tier1_threshold` | 0.90 | BM25 score above which a single chunk satisfies a LOOKUP query |
| `search.tier2_threshold` | 0.80 | Hybrid RRF score above which top-3 chunks satisfy a FIND query |
| `search.tier3_min_chunks` | 2 | Minimum number of relevant chunks required to return a Tier 3 answer without LLM |
| `search.cache_ttl_seconds` | 300 | Redis TTL for cached query results |

---

## Response Shapes

All tiers return a compatible envelope. The `answer_type` field distinguishes retrieval from generated answers.

**Tiers 1–3 (retrieval)**:
```json
{
  "answer_type": "retrieval",
  "chunks": [{ "text": "...", "score": 0.92, "file_id": "...", "chunk_index": 3 }],
  "citations": [{ "file_id": "...", "filename": "...", "page": 1 }],
  "tier": 2,
  "query_intent": "FIND",
  "generation_skipped": false,
  "latency_ms": 148
}
```

**Tier 4 (generated)**:
```json
{
  "answer_type": "generated",
  "content": "...",
  "citations": [{ "file_id": "...", "filename": "...", "page": 1 }],
  "tier": 4,
  "query_intent": "SYNTHESIZE",
  "generation_skipped": false,
  "tokens": { "input": 1840, "output": 312 },
  "latency_ms": 4200
}
```

**LLM unavailable fallback**:
```json
{
  "answer_type": "retrieval",
  "chunks": [...],
  "citations": [...],
  "tier": 3,
  "query_intent": "SYNTHESIZE",
  "generation_skipped": true,
  "generation_skip_reason": "no_llm_available",
  "latency_ms": 310
}
```

---

## Positive Consequences

- System is fully operational with `llm.enabled: false` (the default config)
- p95 query latency drops from ~5s to ~150ms for the ~65–70% of queries that are LOOKUP/FIND intent
- Zero Ollama dependency for LOOKUP, FIND, and EXPLAIN queries
- LLM compute/cost is proportional to query complexity — only spent when retrieval cannot satisfy the query
- Graceful degradation: if LLM becomes unavailable mid-operation, Tier 3 result is returned with a machine-readable signal
- Claude API can be used as the preferred Tier 4 backend, removing the GPU requirement entirely for generation

## Negative Consequences

- The rule-based classifier has false positives and false negatives for ambiguous queries (e.g., "what is the difference between X and Y" parses as LOOKUP but is actually SYNTHESIZE)
- Two distinct response shapes (`retrieval` vs `generated`) require the frontend to branch on `answer_type`
- Confidence thresholds require tuning per knowledge base — a sparse KB may need lower thresholds; a dense, high-quality KB may tolerate higher ones
- Cache invalidation on re-ingestion adds coupling between the ingest pipeline and the query cache

---

## Links

- `docs/architecture/sequence-diagrams/15-tiered-retrieval-flow.md` — full sequence diagram for this decision
- `docs/prd/PRD-document-intelligence.md` — Document Intelligence PRD (search tiers, ranking)
- `.kms/config.json` — runtime feature flags including `llm.enabled`, `external_agents.enabled`
- `services/rag-service/` — implementation home for Query Classifier and Tier Router
- `search-api/` — BM25 + hybrid search service (port 8001)
- Error code namespace: `KBSCH` (search), `KBRAG` (RAG/generation)
