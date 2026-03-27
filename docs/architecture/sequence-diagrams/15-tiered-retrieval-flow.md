# Sequence Diagram 15 — Tiered Retrieval Flow

**Feature**: KMS Tiered Retrieval Response Strategy
**ADR**: [ADR-0024 — Tiered Retrieval Response Strategy](../decisions/0024-tiered-retrieval-response.md)
**Last updated**: 2026-03-17

---

## Overview

This diagram shows the complete tiered retrieval flow for a KMS query. After a cache miss, the Query Classifier determines intent in ~5ms (no LLM). The Tier Router then selects the cheapest tier that can satisfy the query based on intent class and retrieval confidence scores. Tiers 0–3 return chunks and citations directly. Tier 4 passes Tier 3 context to an external agent for synthesis; the LLM Guard determines whether Claude API, Ollama, or a graceful Tier 3 fallback is used.

---

## Diagram

```mermaid
sequenceDiagram
    autonumber

    participant Browser
    participant kms_api as kms-api
    participant Redis
    participant rag_service as rag-service<br/>(Classifier + Tier Router)
    participant search_api as search-api<br/>(BM25 + Hybrid)
    participant Qdrant
    participant Neo4j
    participant ExternalAgent as ExternalAgentAdapter
    participant Claude as Claude API
    participant Ollama

    Browser->>kms_api: POST /api/v1/chat { query, collection_id }
    activate kms_api

    kms_api->>rag_service: forward query + collection context
    activate rag_service

    %% ── Cache probe ──────────────────────────────────────────────
    Note over rag_service,Redis: OTel span: kb.cache.probe
    rag_service->>Redis: GET query_fingerprint
    activate Redis

    alt Tier 0: Cache HIT
        Redis-->>rag_service: cached result (TTL not expired)
        deactivate Redis
        rag_service-->>kms_api: { answer_type:"retrieval", chunks, citations, tier:0, cached:true, latency_ms:~1 }
        kms_api-->>Browser: 200 OK — retrieval result (tier 0, cached)

    else Cache MISS — proceed to classification
        Redis-->>rag_service: nil
        deactivate Redis

        %% ── Query Classifier ─────────────────────────────────────
        Note over rag_service: OTel span: kb.query.classify (~5ms, no LLM)
        Note over rag_service: Rule-based intent detection:<br/>LOOKUP · FIND · EXPLAIN · SYNTHESIZE · GENERATE
        rag_service->>rag_service: classify(query) → intent, signals[]

        alt Classification error (malformed query)
            rag_service-->>kms_api: 400 KBSCH0001 — invalid query
            kms_api-->>Browser: 400 Bad Request
        end

        %% ── Tier 1: BM25 keyword search ──────────────────────────
        Note over rag_service,search_api: OTel span: kb.retrieval.tier1

        alt Tier 1: BM25 high-confidence (intent = LOOKUP)
            rag_service->>search_api: GET /search/bm25 { query, collection_id }
            activate search_api
            search_api-->>rag_service: [ { chunk, score, file_id, chunk_index } ]
            deactivate search_api

            alt score > 0.90 (tier1_threshold)
                rag_service->>Redis: SET query_fingerprint result EX 300
                rag_service-->>kms_api: { answer_type:"retrieval", chunks:[top-1], citations, tier:1, query_intent:"LOOKUP", generation_skipped:false, latency_ms:~50 }
                kms_api-->>Browser: 200 OK — retrieval result (tier 1)

            else score ≤ 0.90 — escalate to Tier 2
                Note over rag_service: BM25 score below threshold, promote to hybrid
            end

        %% ── Tier 2: Hybrid search (BM25 + BGE-M3 + RRF) ─────────
        Note over rag_service,Qdrant: OTel span: kb.retrieval.tier2

        else Tier 2: Hybrid high-confidence (intent = FIND, or Tier 1 escalation)
            rag_service->>search_api: GET /search/hybrid { query, collection_id }
            activate search_api
            search_api->>Qdrant: vector search (BGE-M3 1024-dim)
            activate Qdrant
            Qdrant-->>search_api: vector results + scores
            deactivate Qdrant
            search_api->>search_api: RRF fusion (BM25 + vector scores)
            search_api-->>rag_service: [ { chunk, rrf_score, file_id, chunk_index } ] top-10
            deactivate search_api

            alt rrf_score > 0.80 (tier2_threshold)
                rag_service->>Redis: SET query_fingerprint result EX 300
                rag_service-->>kms_api: { answer_type:"retrieval", chunks:[top-3], citations, tier:2, query_intent:"FIND", generation_skipped:false, latency_ms:~150 }
                kms_api-->>Browser: 200 OK — retrieval result (tier 2)

            else rrf_score ≤ 0.80 — escalate to Tier 3
                Note over rag_service: Hybrid score below threshold, promote to graph expansion
            end

        %% ── Tier 3: Hybrid + Graph expansion + Rerank ────────────
        Note over rag_service,Neo4j: OTel span: kb.retrieval.tier3

        else Tier 3: Graph-expanded, no LLM (intent = EXPLAIN / SYNTHESIZE, or Tier 2 escalation)
            rag_service->>search_api: GET /search/hybrid { query, collection_id }
            activate search_api
            search_api->>Qdrant: vector search (BGE-M3 1024-dim)
            activate Qdrant
            Qdrant-->>search_api: vector results
            deactivate Qdrant
            search_api->>search_api: RRF fusion
            search_api-->>rag_service: hybrid results top-10
            deactivate search_api

            rag_service->>Neo4j: MATCH entity relationships for top result entities (depth ≤ 2)
            activate Neo4j
            Neo4j-->>rag_service: related entity nodes + relationship edges
            deactivate Neo4j

            rag_service->>rag_service: CrossEncoder rerank(hybrid + graph-expanded candidates)

            alt chunks ≥ tier3_min_chunks (default: 2)
                rag_service->>Redis: SET query_fingerprint result EX 300
                rag_service-->>kms_api: { answer_type:"retrieval", chunks:[reranked], citations, tier:3, query_intent, graph_context, generation_skipped:false, latency_ms:~300 }
                kms_api-->>Browser: 200 OK — retrieval result (tier 3)

            else insufficient chunks — attempt Tier 4
                Note over rag_service: Not enough relevant chunks for Tier 3 standalone answer
            end

        %% ── Tier 4: External Agent generation ────────────────────
        Note over rag_service,ExternalAgent: OTel span: kb.llm.guard

        else Tier 4: LLM generation (intent = SYNTHESIZE / GENERATE, or Tier 3 insufficient)

            %% LLM Guard
            rag_service->>rag_service: LLM Guard check:<br/>1. Claude API key present AND external_agents.enabled?<br/>2. Else: Ollama reachable?<br/>3. Else: return Tier 3 fallback

            alt Tier 4a: Claude API available (preferred)
                rag_service->>ExternalAgent: generate(tier3_context, query, intent)
                activate ExternalAgent
                ExternalAgent->>Claude: POST /v1/messages (streaming)
                activate Claude
                Claude-->>ExternalAgent: SSE token stream
                deactivate Claude
                ExternalAgent-->>rag_service: assembled content + token counts
                deactivate ExternalAgent
                rag_service->>Redis: SET query_fingerprint result EX 300
                rag_service-->>kms_api: { answer_type:"generated", content, citations, tier:4, query_intent, tokens:{input,output}, generation_skipped:false, latency_ms:~3000-10000 }
                kms_api-->>Browser: 200 OK — generated answer (tier 4, Claude)

            else Tier 4b: Ollama available (fallback LLM)
                rag_service->>ExternalAgent: generate(tier3_context, query, intent)
                activate ExternalAgent
                ExternalAgent->>Ollama: POST /api/chat (streaming, llama3.2:3b)
                activate Ollama
                Ollama-->>ExternalAgent: SSE token stream
                deactivate Ollama
                ExternalAgent-->>rag_service: assembled content + token counts
                deactivate ExternalAgent
                rag_service->>Redis: SET query_fingerprint result EX 300
                rag_service-->>kms_api: { answer_type:"generated", content, citations, tier:4, query_intent, tokens:{input,output}, generation_skipped:false, latency_ms:~5000-30000 }
                kms_api-->>Browser: 200 OK — generated answer (tier 4, Ollama)

            else Tier 4b fallback: No LLM available
                Note over rag_service: LLM Guard: neither Claude API nor Ollama reachable
                rag_service-->>kms_api: { answer_type:"retrieval", chunks:[reranked], citations, tier:3, query_intent, generation_skipped:true, generation_skip_reason:"no_llm_available", latency_ms:~300 }
                kms_api-->>Browser: 200 OK — retrieval result (tier 3, LLM skipped)
            end

        end

    end

    %% ── Error flows ──────────────────────────────────────────────
    Note over kms_api,search_api: Error flow: all search services unavailable

    opt search-api or Qdrant unreachable
        search_api-->>rag_service: connection error / timeout
        rag_service-->>kms_api: 503 KBSCH0001 — search service unavailable
        kms_api-->>Browser: 503 Service Unavailable
    end

    opt Neo4j unreachable (Tier 3 only)
        Neo4j-->>rag_service: connection error
        Note over rag_service: Neo4j failure is non-fatal for Tier 3<br/>proceed with hybrid results only (no graph context)
        rag_service->>rag_service: rerank without graph expansion
    end

    deactivate rag_service
    deactivate kms_api
```

---

## OTel Span Reference

| Span Name | Service | Tier | Key Attributes |
|-----------|---------|------|----------------|
| `kb.cache.probe` | rag-service | 0 | `kb.cache.hit` (bool), `kb.query.fingerprint` |
| `kb.query.classify` | rag-service | all | `kb.query.intent`, `kb.query.signals[]` |
| `kb.retrieval.tier1` | rag-service → search-api | 1 | `kb.retrieval.bm25_score`, `kb.retrieval.threshold` |
| `kb.retrieval.tier2` | rag-service → search-api → Qdrant | 2 | `kb.retrieval.rrf_score`, `kb.retrieval.chunk_count` |
| `kb.retrieval.tier3` | rag-service → search-api → Neo4j | 3 | `kb.retrieval.chunk_count`, `kb.graph.nodes_expanded` |
| `kb.llm.guard` | rag-service | 4 | `kb.llm.provider` (claude/ollama/none), `kb.llm.skipped` (bool) |

---

## Response Shape Reference

### Tiers 1–3 (Retrieval answer)

```json
{
  "answer_type": "retrieval",
  "chunks": [
    {
      "text": "...",
      "score": 0.92,
      "file_id": "uuid",
      "chunk_index": 3
    }
  ],
  "citations": [
    {
      "file_id": "uuid",
      "filename": "architecture-overview.md",
      "page": 1
    }
  ],
  "tier": 2,
  "query_intent": "FIND",
  "generation_skipped": false,
  "latency_ms": 148
}
```

### Tier 3 with graph context

```json
{
  "answer_type": "retrieval",
  "chunks": [...],
  "citations": [...],
  "graph_context": {
    "entities": ["NestJS", "FilesService"],
    "relationships": [{ "from": "NestJS", "to": "FilesService", "type": "USES" }]
  },
  "tier": 3,
  "query_intent": "EXPLAIN",
  "generation_skipped": false,
  "latency_ms": 298
}
```

### Tier 4 (Generated answer)

```json
{
  "answer_type": "generated",
  "content": "The KMS ingest pipeline consists of three stages...",
  "citations": [
    {
      "file_id": "uuid",
      "filename": "ingest-overview.md",
      "page": 2
    }
  ],
  "tier": 4,
  "query_intent": "SYNTHESIZE",
  "generation_skipped": false,
  "tokens": {
    "input": 1840,
    "output": 312
  },
  "latency_ms": 4200
}
```

### LLM Unavailable Fallback

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

## Notes

- **Cache key**: SHA-256 of `normalize(query) + collection_id`. Normalized = lowercased, whitespace-collapsed, UTF-8 NFC.
- **Cache invalidation**: on file re-ingestion, rag-service receives an AMQP event and issues `DEL` for all cache keys associated with the affected `collection_id`.
- **Neo4j failure**: treated as non-fatal for Tier 3. If Neo4j is unreachable, graph expansion is skipped and the reranker runs on hybrid results only. This is logged at WARN level but does not degrade to a higher error tier.
- **CrossEncoder model**: runs in-process within rag-service (CPU). Adding graph-expanded candidates increases rerank latency by ~50ms on a 2021 MacBook Pro M1.
- **Threshold hot-reload**: rag-service polls `.kms/config.json` every 30 seconds. Threshold changes take effect without service restart.
- **SSE streaming (Tier 4)**: `kms-api` proxies the SSE stream from rag-service to the browser. The `answer_type`, `tier`, and `citations` fields are sent as a final `[DONE]` event after token streaming completes.

---

## Related

- [ADR-0024 — Tiered Retrieval Response Strategy](../decisions/0024-tiered-retrieval-response.md)
- [PRD — Document Intelligence](../../prd/PRD-document-intelligence.md)
- `services/rag-service/` — Query Classifier, Tier Router, ExternalAgentAdapter
- `search-api/` — BM25 + hybrid search (port 8001)
- Error codes: `KBSCH0001` (search unavailable), `KBRAG0001` (generation failure)
