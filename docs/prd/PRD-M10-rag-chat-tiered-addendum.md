# PRD-M10-rag-chat — Tiered Retrieval Addendum

> **Parent**: `docs/prd/PRD-M10-rag-chat.md`
> **Feature guide**: `docs/development/FOR-tiered-retrieval.md`
> **Status**: Accepted — supersedes the `retrieve → grade → rewrite → generate` LangGraph design

---

## 1. What Changes

The original M10 RAG pipeline ran every query through a fixed LangGraph chain:

```
retrieve → grade → rewrite → generate
```

Every query hit the LLM. This created two problems:
- KMS was non-functional without Ollama configured.
- p95 latency was ~5s for queries that needed a one-word factual answer.

The Tiered Retrieval design replaces that chain with a classify-then-route approach:

```
classify_query → tier_route → [tier-specific handler] → [optional: llm_guard → generate]
```

The LLM is now an optional last step, not a mandatory one.

---

## 2. New LangGraph Node Graph

```
[classify_query]          QueryClassifierNode — intent + confidence
        ↓
[tier_route]              TierRouterNode — selects tier 0-4
        ↓
┌───────┬────────┬──────────────┬───────────────────────┐
│       │        │              │                       │
Tier 1  Tier 2   Tier 3         Tier 4
BM25    Hybrid   Hybrid +       Hybrid +
only    search   Graph expand   Graph expand +
                 + Rerank       Generate
│       │        │              │
└───────┴────────┴──────────────┘
        ↓                       ↓
[build_retrieval_response]  [llm_guard → generate]
        ↓                       ↓
    ChatResponse            ChatResponse
(generation_skipped: true)  (generation_skipped: false)
```

Tier 0 (cache hit) short-circuits before `classify_query` — no nodes execute.

---

## 3. Response Shape Changes

Two new fields are added to all `ChatResponse` objects. Existing fields are unchanged.

```json
{
  "tier": 2,
  "generation_skipped": true,
  "answer_type": "retrieval",
  "chunks": [
    { "chunk_id": "...", "text": "...", "score": 0.87, "file_id": "..." }
  ],
  "citations": [
    { "file_id": "...", "filename": "...", "url": "..." }
  ],
  "content": null
}
```

| Field | Type | Always present | Notes |
|-------|------|---------------|-------|
| `tier` | `int` (0–4) | Yes | Which tier answered the query |
| `generation_skipped` | `bool` | Yes | `true` if LLM was bypassed |
| `answer_type` | `"retrieval" \| "generated"` | Yes | Reflects whether content was LLM-generated |
| `chunks` | `array` | Yes | Always returned regardless of tier |
| `citations` | `array` | Yes | Always returned regardless of tier |
| `content` | `string \| null` | Only if Tier 4 | `null` for retrieval tiers |

---

## 4. Ollama Is Now Optional

The feature-flag configuration in `.kms/config.json` determines which tiers are reachable:

| Config state | Tiers available | Notes |
|---|---|---|
| `llm.enabled: false` (default) | 0, 1, 2, 3 | Fully functional KMS — no Ollama needed |
| `llm.enabled: true` | 0–4 | Ollama must be running at `OLLAMA_HOST` |
| `external_agents.claudeApi.enabled: true` | 0–4 | Claude API used for Tier 4 generation |

When both are false, `LlmGuard.available_provider()` returns `None`. Queries that reach Tier 4 fall back to Tier 3 with `generation_skipped: true` and error code `KBRAG0012`.

---

## 5. Performance Impact

Expected tier distribution for a typical medium-sized knowledge base (1K–10K documents):

| Tier | % of queries | p95 Latency | LLM required |
|------|-------------|-------------|--------------|
| 0 — Cache hit | ~15% | ~1ms | No |
| 1 — BM25 only | ~20% | ~50ms | No |
| 2 — Hybrid search | ~30% | ~150ms | No |
| 3 — Hybrid + Graph + Rerank | ~25% | ~300ms | No |
| 4 — Generate | ~10% | ~3–10s | Yes (optional) |

**65% of queries** are resolved in under 150ms with no LLM call. Overall p95 for the
chat endpoint drops from ~5s (all-LLM design) to ~300ms (weighted average across tiers).
