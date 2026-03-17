# ADR-006: Graph Traversal Over Pure Vector RAG

**Date**: 2026-03-17
**Status**: Accepted
**Deciders**: Architecture team

## Context

The original architecture used pure vector RAG: embed content → store in Qdrant → query by cosine similarity. This works for "find similar documents" but fails for:

- "How does concept A relate to concept B?" (path-finding)
- "What else is in the same topic cluster as this note?" (community traversal)
- "What documents reference this file?" (relationship graph)
- Navigation without re-reading everything every time

Inspired by **GitNexus** (github.com/abhigyanpatwari/GitNexus) which demonstrated that precomputed graph relationships for code provide dramatically better context extraction than iterative LLM queries.

## Decision

Build a **knowledge graph** (Neo4j) alongside vector search (Qdrant). The graph is precomputed at index time, not at query time.

**Graph Indexing Pipeline (6 phases):**
1. Structure mapping (file/folder hierarchy)
2. Content extraction (text from PDF, DOCX, images, markdown)
3. Entity & concept extraction (spaCy NER + LLM)
4. Community detection (Leiden algorithm)
5. Embedding generation (for Qdrant)
6. Traversal index (precompute SIMILAR_TO edges, cache paths in Redis)

**Traversal types supported:**
- `shortestPath(concept_a, concept_b)` — path-finding
- `blast_radius(node_id)` — what connects to this document
- `community(cluster_id)` — all members of a topic cluster
- `backlinks(note_id)` — Obsidian-style backlink graph

**Query routing:**
- Factual / similarity queries → Qdrant (vector search)
- Relational / navigation queries → Neo4j (graph traversal)
- Complex Q&A → RAG service with graph-aware context retrieval

## Consequences

**Positive:**
- Navigation without re-reading all documents (precomputed paths)
- Community detection enables topic clustering and discovery
- Backlink resolution for Obsidian vaults
- Better RAG context (related concepts, not just similar chunks)
- Blast radius analysis (what else is related)

**Negative:**
- Additional complexity: Neo4j + graph-worker + Leiden algorithm
- Graph indexing adds latency to the pipeline
- Leiden community detection is CPU-intensive

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Pure vector RAG (Qdrant only) | No relational reasoning, no path-finding |
| PostgreSQL graph queries (recursive CTEs) | Slow at scale, no native graph optimizations |
| GraphRAG (Microsoft) | Designed for text corpora, not mixed media knowledge bases; our use case requires bidirectional Obsidian backlinks and file hierarchy |
| In-memory NetworkX | Not persistent; doesn't survive restarts; no Cypher query language |
