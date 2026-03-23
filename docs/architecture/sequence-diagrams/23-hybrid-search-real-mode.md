# Sequence Diagram 23 — Hybrid Search (Real Mode) with Citations

## Overview

Two flows are shown:
- **Flow A — Direct Search**: User searches from the search bar; results are returned as ranked cards (no LLM).
- **Flow B — RAG Chat**: User asks a question in the chat panel; rag-service retrieves chunks, optionally invokes an LLM, and streams a cited answer.

```mermaid
sequenceDiagram
    actor User as User (Browser)
    participant FE as Frontend (Next.js)
    participant SA as search-api (NestJS)
    participant PG as PostgreSQL
    participant EW as embed-worker (Python, /embed endpoint)
    participant QD as Qdrant
    participant RAG as rag-service (Python)

    rect rgb(230, 240, 255)
        Note over User,QD: Flow A — Direct Search (no LLM)

        User->>FE: Types "Q1 planning OKRs" in search bar
        FE->>SA: POST /api/v1/search<br/>{ query: "Q1 planning OKRs", searchType: "hybrid", limit: 10 }<br/>x-user-id: {userId}

        SA->>SA: Dispatch BM25 + semantic in parallel (Promise.all)

        par BM25 path
            SA->>PG: SELECT c.id, c.content, f.id as file_id, f.original_filename,<br/>f.web_view_link, ts_rank(c.search_vector, query) as score,<br/>ts_headline('english', c.content, query, 'MaxWords=30') as snippet<br/>FROM kms_chunks c JOIN kms_files f ON f.id = c.file_id,<br/>plainto_tsquery('english', $1) query<br/>WHERE c.user_id = $2 AND c.search_vector @@ query<br/>ORDER BY score DESC LIMIT 20
            Note over SA,PG: ts_headline in step 3b returns the best 30-word window for keyword<br/>matches. For semantic results, we use the full chunk content<br/>(already short at 512 chars).
            PG-->>SA: Rows with FTS scores + ts_headline snippets
        and Semantic path
            SA->>EW: POST /embed { text: "Q1 planning OKRs" }
            EW->>EW: BGE-M3 encode(text) → 1024-dim vector
            EW-->>SA: { vector: [1024 floats] }
            SA->>QD: POST /collections/kms_chunks/points/search<br/>{ vector: [...],<br/>  filter: { must: [{ key: "user_id", match: { value: "{userId}" } }] },<br/>  limit: 20, with_payload: true }
            QD-->>SA: Top-20 scored points with payload<br/>{ content, filename, file_id, web_view_link, source_type, start_secs }
        end

        SA->>SA: RRF fusion:<br/>• Dedup key: "{file_id}:{chunk_index}"<br/>• score += 1/(60 + rank) for each list<br/>• Sort by fused score descending<br/>• Take top limit results<br/>• Normalize: max_score → 1.0

        SA-->>FE: 200 OK — SearchResult[]<br/>{ id, fileId, filename, content (snippet), score,<br/>  chunkIndex, webViewLink?, timestampSecs?, sourceType }
        FE-->>User: Renders result cards with snippet + Drive link
    end

    rect rgb(240, 255, 230)
        Note over User,RAG: Flow B — RAG Chat (with LLM)

        User->>FE: Clicks "Ask KMS" → types question in chat panel
        FE->>RAG: POST /chat/completions<br/>{ question: "summarise OKR commitments", top_k: 10 }

        RAG->>RAG: TierRouter → route to Tier 2 (hybrid search)

        RAG->>SA: POST /api/v1/search (internal call)<br/>{ query: "summarise OKR commitments", searchType: "hybrid", limit: 10 }
        SA-->>RAG: SearchResult[] (same hybrid flow as above)

        RAG->>RAG: Assemble context string from top chunks<br/>with source attribution (filename, chunk index, score)

        RAG->>RAG: LLMGuard: evaluate confidence score<br/>→ low confidence → invoke LLM

        RAG->>RAG: LLMFactory.get_provider():<br/>• ANTHROPIC_API_KEY set? → AnthropicProvider<br/>• Else → OllamaProvider (local LLM)

        RAG->>RAG: OllamaProvider: POST /api/generate (streaming)<br/>{ model: "llama3.2:3b",<br/>  prompt: "{context}\n\nQuestion: {query}",<br/>  stream: true }

        loop SSE token stream
            RAG-->>FE: data: {"token": "The Q1 OKR"}
            RAG-->>FE: data: {"token": " commitments include"}
            Note over RAG,FE: ... (tokens stream until generation completes)
        end

        RAG-->>FE: data: {"sources": [{ file_id, filename, snippet, score,<br/>  web_view_link, timestamp_secs }], "event": "sources"}
        RAG-->>FE: data: {"done": true, "tier_used": 2, "took_ms": 1240}

        FE-->>User: Renders streaming answer + collapsible citations with Drive links
    end
```

## Key Design Points

| Aspect | Detail |
|--------|--------|
| Parallelism | BM25 and semantic queries run concurrently via `Promise.all`; total latency = `max(bm25, semantic)` not their sum |
| RRF constant (k=60) | Standard Reciprocal Rank Fusion constant; smooths rank differences between the two lists |
| Dedup key | `{file_id}:{chunk_index}` ensures the same chunk appearing in both BM25 and semantic results is merged, not doubled |
| Score normalization | Dividing by max fused score maps results to [0, 1] for consistent UI rendering |
| BM25 snippet | `ts_headline` extracts the most relevant 30-word window; semantic results use full chunk text (512 chars max) |
| LLM provider fallback | `AnthropicProvider` preferred; `OllamaProvider` (local Llama) used when no Anthropic key is configured |
| SSE sources event | Citations are emitted as a dedicated SSE event after the final token so the frontend can render them separately |
| `start_secs` / `timestamp_secs` | Enables deep-link playback into video/audio files for voice transcript chunks |
