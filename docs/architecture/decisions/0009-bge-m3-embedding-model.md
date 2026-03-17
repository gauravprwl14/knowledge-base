# 0009 — BGE-M3 as the Embedding Model

- **Status**: Accepted
- **Date**: 2026-03-17
- **Deciders**: Architecture Team
- **Tags**: [ai, embeddings, search]

## Context and Problem Statement

The KMS needs an embedding model for semantic search and RAG. The model must support: multi-language content (English, Hindi, regional languages), long documents (meeting notes, reports), multiple retrieval modes (dense, sparse, multi-vector), and reasonable inference time on CPU/GPU.

## Decision Drivers

- MTEB retrieval benchmark score
- Multilingual support
- Context length (chunk-friendly up to 8192 tokens)
- Multiple retrieval modes for hybrid search
- Self-hostable (no per-token API cost)

## Considered Options

- Option A: `BAAI/bge-m3` (BGE-M3)
- Option B: `nomic-ai/nomic-embed-text` (Ollama default)
- Option C: `sentence-transformers/all-MiniLM-L6-v2`
- Option D: OpenAI `text-embedding-3-small`

## Decision Outcome

Chosen: **Option A — BAAI/bge-m3** — 72%+ MTEB retrieval score, 100+ languages, 8K context window, three retrieval modes (dense + sparse + multi-vector ColBERT-style), self-hosted.

### Consequences

**Good:**
- 1024-dimensional dense embeddings (Qdrant scalar INT8 quantization reduces to ~256MB)
- Sparse embeddings enable lexical recall without a separate BM25 index
- ColBERT-style multi-vector mode for fine-grained reranking
- 8192 token context — can embed full meeting notes without aggressive chunking
- Multilingual: supports Hindi, Tamil, regional Indian languages out of the box

**Bad / Trade-offs:**
- Model size: ~570MB on disk (vs 22MB for all-MiniLM-L6-v2)
- Inference time: ~80ms/chunk on CPU vs ~5ms for all-MiniLM (acceptable with batching)
- Requires `FlagEmbedding` library (not just `sentence-transformers`)
- Config must change from `dimensions: 768` (nomic) to `dimensions: 1024` (bge-m3)

**Migration impact:**
- All existing Qdrant collections must be recreated with 1024 dimensions
- `.kms/config.json` embedding dimensions updated: 768 → 1024
- Architecture docs updated to remove nomic-embed-text references

## Pros and Cons of the Options

### Option A: BAAI/bge-m3

- ✅ 72%+ MTEB retrieval benchmark
- ✅ Multilingual (100+ languages)
- ✅ 8192 token context
- ✅ Three retrieval modes: dense + sparse + ColBERT
- ✅ Self-hosted, no API cost
- ❌ 570MB model size
- ❌ ~80ms inference on CPU per chunk

### Option B: nomic-embed-text

- ✅ Good performance (67% MTEB)
- ✅ Smaller (137MB)
- ✅ Available via Ollama (easy local serving)
- ❌ English-focused (poor multilingual)
- ❌ 768 dimensions only
- ❌ No sparse or multi-vector mode

### Option C: all-MiniLM-L6-v2

- ✅ Very fast inference (~5ms/chunk)
- ✅ Tiny (22MB)
- ❌ 57% MTEB — lowest of considered options
- ❌ English only
- ❌ 512 token context — requires aggressive chunking

### Option D: OpenAI text-embedding-3-small

- ✅ Excellent quality (80%+ MTEB)
- ✅ No hosting required
- ❌ Per-token cost (operational expense at scale)
- ❌ Data leaves the system (privacy concern)
- ❌ API dependency — single point of failure
