# Sequence Diagram 24 — RAG with Local LLM (Ollama)

**Flow**: User asks a factual question → tiered retrieval → Ollama streaming answer with source citations

```mermaid
sequenceDiagram
    actor User as User (browser)
    participant FE as Frontend (Next.js)
    participant RAG as rag-service (FastAPI)
    participant QC as QueryClassifier
    participant TR as TierRouter
    participant LG as LLMGuard
    participant LF as LLMFactory
    participant OL as OllamaProvider
    participant AN as AnthropicProvider
    participant SA as search-api (NestJS)
    participant EW as embed-worker (Python)
    participant QD as Qdrant

    User->>FE: "What were the key action items from the Q1 kickoff meeting?"
    FE->>RAG: POST /chat/completions<br/>{ question: "...", session_id: "sess-123", top_k: 10, stream: true }
    Note over RAG: Opens SSE response stream

    rect rgb(230, 240, 255)
        Note over RAG,QC: Step A — Query Classification
        RAG->>QC: classify(question)
        QC-->>RAG: QueryType.LOOKUP (factual, specific)
        RAG->>TR: route(question, QueryType.LOOKUP)
        Note over TR: LOOKUP → try Tier 1 (BM25) first
    end

    rect rgb(230, 255, 230)
        Note over TR,SA: Step B — Tier 1 Retrieval (BM25, fast path)
        TR->>SA: POST /search { query, searchType: "keyword", limit: 10 }
        SA->>SA: Execute PostgreSQL FTS
        SA-->>TR: SearchResult[] (BM25 scores)
        TR->>TR: Evaluate confidence:<br/>max BM25 score = 0.61 < 0.7 threshold
        Note over TR: Low keyword overlap on meeting transcript → escalate to Tier 2
    end

    rect rgb(255, 245, 220)
        Note over TR,QD: Step C — Tier 2 Retrieval (Hybrid)
        TR->>SA: POST /search { query, searchType: "hybrid", limit: 10 }
        par BM25 via PostgreSQL FTS
            SA->>SA: Execute PostgreSQL FTS
        and Semantic via embed-worker + Qdrant
            SA->>EW: Generate query vector for question
            EW-->>SA: query_vector[1024] (BGE-M3)
            SA->>QD: ANN search (cosine, top-10)
            QD-->>SA: vector matches with scores
        end
        SA->>SA: RRF fusion → merged ranked results
        SA-->>TR: SearchResult[] { snippets, file_ids,<br/>web_view_links, timestamp_secs }
    end

    rect rgb(255, 230, 230)
        Note over RAG,LG: Step D — LLM Guard Decision
        RAG->>LG: should_generate(results, QueryType.LOOKUP)
        Note over LG: top score = 0.82<br/>query_type = LOOKUP → generate LLM answer<br/>(guard returns results directly if score > 0.95 AND LOOKUP)
        LG-->>RAG: GENERATE
        RAG->>RAG: Build context string:<br/>[1] Q1_kickoff.mp4 (transcript, 00:03:12): "The following action items were agreed..."<br/>[2] Q1_planning_doc.pdf (page 4): "Action items: Sarah owns OKR tracking..."
    end

    rect rgb(245, 230, 255)
        Note over RAG,OL: Step E — LLM Provider Selection
        RAG->>LF: get_provider(LLMCapability.CHAT_COMPLETION)
        LF->>LF: Check ANTHROPIC_API_KEY → "" (empty)
        Note over LF: No AnthropicProvider available
        LF->>LF: Check OLLAMA_BASE_URL → "http://ollama:11434"
        LF-->>RAG: OllamaProvider
        Note right of AN: AnthropicProvider skipped —<br/>ANTHROPIC_API_KEY not set
    end

    rect rgb(220, 245, 255)
        Note over RAG,OL: Step F — Ollama Streaming
        RAG->>OL: generate(prompt, model="llama3.2:3b", stream=true)
        Note over OL: Prompt:<br/>You are a helpful assistant. Answer based only on the provided context.<br/>Context:<br/>[1] Q1_kickoff.mp4: "The following action items..."<br/>[2] Q1_planning_doc.pdf: "Action items: Sarah owns OKR..."<br/>Question: What were the key action items...?<br/>Answer:
        OL->>OL: POST http://ollama:11434/api/generate<br/>{ "model": "llama3.2:3b", "prompt": "...", "stream": true }
        loop NDJSON stream tokens
            OL-->>RAG: {"response": "Based", "done": false}
            OL-->>RAG: {"response": " on the", "done": false}
            OL-->>RAG: {"response": " Q1 kickoff", "done": false}
            OL-->>RAG: ... more tokens ...
            OL-->>RAG: {"response": ".", "done": true, "eval_count": 120}
        end
    end

    rect rgb(235, 255, 235)
        Note over RAG,FE: Step G — SSE Streaming to Frontend
        loop Per token
            RAG-->>FE: data: {"token": "Based"}
            RAG-->>FE: data: {"token": " on the"}
            RAG-->>FE: data: {"token": " Q1 kickoff"}
            RAG-->>FE: ... more SSE token events ...
        end
        RAG-->>FE: data: {"sources": [<br/>  { "file_id": "...", "filename": "Q1_kickoff.mp4",<br/>    "snippet": "action items were agreed",<br/>    "score": 0.89, "timestamp_secs": 192 },<br/>  { "file_id": "...", "filename": "Q1_planning_doc.pdf",<br/>    "snippet": "Sarah owns OKR tracking", "score": 0.81 }<br/>], "event": "sources"}
        RAG-->>FE: data: {"done": true, "tier_used": 2, "took_ms": 3240, "model": "llama3.2:3b"}
        FE->>User: Render streaming answer text<br/>+ citation cards with Drive links,<br/>  video timestamps, snippet previews
    end
```

## Notes

> **Step 16 — LLMFactory provider selection**: LLMFactory checks `ANTHROPIC_API_KEY` first — if present, uses Claude (cloud). Empty key forces Ollama (local-only mode). This allows zero-config local deployment without changing any application code.

> **Step 20 — Video timestamp deep-linking**: `timestamp_secs` in the source citation allows the frontend to deep-link to the exact moment in a video (e.g., appending `?t=192` to the Google Drive URL), so users can jump directly to the relevant portion of the Q1 kickoff recording.

> **Step 14 — LLMGuard short-circuit**: LLMGuard returns retrieval results directly (no LLM call) when `top score > 0.95 AND query_type = LOOKUP` — saves latency and avoids unnecessary LLM inference for high-confidence factual lookups where the snippet itself is the answer.
