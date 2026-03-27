# Algorithms Overview

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

This section documents the core algorithms used in the KMS system. Each algorithm is presented with:
1. **Problem Statement** - What the algorithm solves
2. **Conceptual Algorithm** - Language-agnostic pseudo code
3. **High-Level Implementation** - Python implementation approach
4. **Complexity Analysis** - Time and space requirements
5. **Configuration** - Tunable parameters

---

## Algorithm Catalog

| Algorithm | Category | Complexity | Purpose |
|-----------|----------|------------|---------|
| [Text Chunking](./text-chunking-algorithm.md) | Processing | O(n) | Split documents for embedding |
| [Hybrid Search](./hybrid-search-algorithm.md) | Search | O(n log n) | Combine keyword + semantic |
| [Exact Duplicate Detection](./exact-duplicate-detection.md) | Deduplication | O(1) | Hash-based matching |
| [Semantic Duplicate Detection](./semantic-duplicate-detection.md) | Deduplication | O(n) | Embedding similarity |
| [Junk Classification](./junk-classification.md) | Cleanup | O(r) | Rule-based detection |

---

## Algorithm Categories

### 1. Content Processing

Algorithms that transform raw content into searchable representations.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Raw Text   │────►│   Chunking   │────►│  Embeddings  │
│              │     │  Algorithm   │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
                           │
                     Parameters:
                     - chunk_size: 1000
                     - overlap: 200
                     - min_size: 100
```

### 2. Search & Retrieval

Algorithms that find relevant content based on user queries.

```
                    ┌──────────────┐
                    │    Query     │
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
       ┌──────────────┐         ┌──────────────┐
       │   Keyword    │         │   Semantic   │
       │   Search     │         │   Search     │
       └──────┬───────┘         └──────┬───────┘
              │                        │
              └────────────┬───────────┘
                           ▼
                    ┌──────────────┐
                    │    Fusion    │
                    │  Algorithm   │
                    └──────────────┘
                           │
                     Weights:
                     - keyword: 0.4
                     - semantic: 0.6
```

### 3. Deduplication

Algorithms that identify duplicate and similar files.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    File      │     │   Strategy   │     │   Duplicate  │
│              │────►│  Selection   │────►│    Group     │
└──────────────┘     └──────────────┘     └──────────────┘
                           │
                     Strategies:
                     1. Hash (exact)
                     2. Semantic (similar)
                     3. Version (patterns)
```

### 4. Classification

Algorithms that categorize files based on rules or ML.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    File      │     │    Rules     │     │    Label     │
│   Metadata   │────►│   Engine     │────►│  + Score     │
└──────────────┘     └──────────────┘     └──────────────┘
                           │
                     Categories:
                     - temporary
                     - system
                     - empty
                     - normal
```

---

## Common Data Structures

### 1. Text Chunk

```python
class TextChunk:
    text: str           # Chunk content
    index: int          # Position in document
    start_char: int     # Start offset
    end_char: int       # End offset
    metadata: dict      # Additional context
```

### 2. Search Result

```python
class SearchResult:
    file_id: str
    score: float           # Combined relevance score
    keyword_score: float   # Full-text search score
    semantic_score: float  # Vector similarity score
    highlights: List[str]  # Matched snippets
```

### 3. Duplicate Match

```python
class DuplicateMatch:
    file_id: str
    matched_file_id: str
    match_type: str        # 'exact', 'semantic', 'version'
    confidence: float      # 0.0 to 1.0
    metadata: dict         # Detection details
```

---

## Performance Characteristics

| Algorithm | Time Complexity | Space Complexity | Parallelizable |
|-----------|-----------------|------------------|----------------|
| Text Chunking | O(n) | O(n) | Yes (per file) |
| Keyword Search | O(log n) | O(1) | Yes (query) |
| Semantic Search | O(log n) | O(d) | Yes (query) |
| Hybrid Fusion | O(k log k) | O(k) | No |
| Hash Detection | O(1) | O(1) | Yes (per file) |
| Semantic Detection | O(n) | O(d) | Yes (per file) |
| Junk Classification | O(r) | O(1) | Yes (per file) |

Where:
- n = document/collection size
- d = embedding dimension (384)
- k = number of results
- r = number of rules

---

## Algorithm Documentation

| Document | Description |
|----------|-------------|
| [Text Chunking](./text-chunking-algorithm.md) | Semantic document splitting |
| [Hybrid Search](./hybrid-search-algorithm.md) | Multi-strategy search fusion |
| [Exact Duplicate Detection](./exact-duplicate-detection.md) | Hash-based matching |
| [Semantic Duplicate Detection](./semantic-duplicate-detection.md) | Embedding similarity |
| [Junk Classification](./junk-classification.md) | Rule-based file classification |

---

## Configuration Reference

### Global Parameters

```yaml
# Chunking
CHUNK_SIZE: 1000
CHUNK_OVERLAP: 200
MIN_CHUNK_SIZE: 100

# Search
KEYWORD_WEIGHT: 0.4
SEMANTIC_WEIGHT: 0.6
RRF_K: 60
MIN_SCORE_THRESHOLD: 0.3

# Deduplication
EXACT_THRESHOLD: 1.0
SEMANTIC_THRESHOLD: 0.85
NEAR_DUPLICATE_THRESHOLD: 0.95
NAME_SIMILARITY_THRESHOLD: 0.8

# Classification
JUNK_CONFIDENCE_THRESHOLD: 0.7
SUSPICIOUS_THRESHOLD: 0.4
```

