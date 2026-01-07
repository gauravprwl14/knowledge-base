# Semantic Duplicate Detection Algorithm

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Problem Statement

Identify files with similar content even when:
- Files are in different formats (PDF vs DOCX)
- Content has minor variations (typos, formatting)
- Files are versions with small changes

Uses embedding vectors to measure semantic similarity.

---

## Conceptual Algorithm

```
ALGORITHM: Embedding-Based Semantic Duplicate Detection
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INPUT:
  file_id              : String     // File to check
  user_id              : String     // User scope
  near_dup_threshold   : Float      // Near-duplicate threshold (default: 0.95)
  similar_threshold    : Float      // Similar content threshold (default: 0.85)
  max_candidates       : Integer    // Max candidates to check (default: 50)

OUTPUT:
  matches              : List[Match] // Semantic duplicates with confidence

PROCEDURE detect_semantic_duplicates(file_id, user_id, thresholds):

  1. GET FILE EMBEDDINGS
     ─────────────────────
     chunks ← qdrant.scroll(
       collection = "kms_files_default",
       filter = { file_id = file_id }
     )

     IF length(chunks) = 0 THEN
       RETURN []   // No embeddings yet
     END IF

  2. COMPUTE FILE CENTROID
     ───────────────────────
     // Average of all chunk embeddings
     embeddings ← [chunk.vector FOR chunk IN chunks]
     centroid ← mean(embeddings, axis=0)
     centroid ← normalize_l2(centroid)

  3. SEARCH SIMILAR FILES
     ──────────────────────
     candidates ← qdrant.search(
       collection = "kms_files_default",
       query_vector = centroid,
       filter = {
         must: [{ key: "user_id", match: user_id }],
         must_not: [{ key: "file_id", match: file_id }]
       },
       limit = max_candidates * 3,  // Get extra for aggregation
       score_threshold = similar_threshold - 0.1  // Slightly lower for safety
     )

  4. AGGREGATE BY FILE
     ────────────────────
     file_scores ← {}

     FOR EACH candidate IN candidates DO
       cand_file_id ← candidate.payload.file_id
       score ← candidate.score

       IF cand_file_id NOT IN file_scores THEN
         file_scores[cand_file_id] ← {
           scores: [],
           best_chunk: NULL
         }
       END IF

       append(file_scores[cand_file_id].scores, score)

       IF score > file_scores[cand_file_id].best_score THEN
         file_scores[cand_file_id].best_score ← score
         file_scores[cand_file_id].best_chunk ← candidate.payload.chunk_text
       END IF
     END FOR

  5. CALCULATE FINAL SCORES
     ────────────────────────
     FOR EACH file_id, data IN file_scores DO
       // Use maximum score (best matching chunk)
       data.final_score ← max(data.scores)

       // Optional: also consider average for thoroughness
       data.avg_score ← mean(data.scores)
     END FOR

  6. CLASSIFY MATCHES
     ───────────────────
     matches ← []

     FOR EACH file_id, data IN file_scores DO
       score ← data.final_score

       IF score < similar_threshold THEN
         CONTINUE  // Below threshold
       END IF

       IF score >= near_dup_threshold THEN
         match_type ← 'near_duplicate'
       ELSE
         match_type ← 'similar_content'
       END IF

       append(matches, DuplicateMatch(
         file_id = input_file_id,
         matched_file_id = file_id,
         match_type = match_type,
         confidence = score,
         metadata = {
           similarity_score: score,
           avg_similarity: data.avg_score,
           chunks_compared: length(data.scores),
           best_chunk_preview: data.best_chunk
         }
       ))
     END FOR

  7. SORT BY CONFIDENCE
     ─────────────────────
     matches ← sort_by_confidence_desc(matches)

  8. RETURN matches[0:max_candidates]
```

---

## High-Level Implementation

```python
# app/detectors/semantic_detector.py - NOT executable - conceptual implementation

import numpy as np
from typing import List, Dict
from dataclasses import dataclass

@dataclass
class DuplicateMatch:
    file_id: str
    matched_file_id: str
    match_type: str
    confidence: float
    metadata: dict


class SemanticDuplicateDetector:
    """
    Detect content-similar files using embedding vectors.

    Thresholds:
    - >= 0.95: Near-duplicate (almost identical content)
    - >= 0.85: Similar content (related documents)
    - < 0.85: Not considered duplicate
    """

    NEAR_DUPLICATE_THRESHOLD = 0.95
    SIMILAR_THRESHOLD = 0.85
    MAX_CANDIDATES = 50

    def __init__(self, qdrant_client, db_client):
        self.qdrant = qdrant_client
        self.db = db_client

    async def detect(
        self,
        file_id: str,
        user_id: str
    ) -> List[DuplicateMatch]:
        """
        Find semantically similar files.

        Process:
        1. Get file's chunk embeddings
        2. Compute centroid (average embedding)
        3. Search for similar centroids
        4. Classify by similarity threshold
        """
        # Step 1: Get file embeddings
        chunks = await self._get_file_embeddings(file_id)
        if not chunks:
            return []

        # Step 2: Compute centroid
        embeddings = np.array([c['vector'] for c in chunks])
        centroid = np.mean(embeddings, axis=0)
        centroid = centroid / np.linalg.norm(centroid)  # L2 normalize

        # Step 3: Search for similar files
        candidates = await self.qdrant.search(
            collection_name="kms_files_default",
            query_vector=centroid.tolist(),
            query_filter={
                "must": [
                    {"key": "user_id", "match": {"value": user_id}}
                ],
                "must_not": [
                    {"key": "file_id", "match": {"value": file_id}}
                ]
            },
            limit=self.MAX_CANDIDATES * 3,
            score_threshold=self.SIMILAR_THRESHOLD - 0.1
        )

        # Step 4: Aggregate by file
        file_scores = self._aggregate_by_file(candidates)

        # Step 5: Build matches
        matches = []
        for matched_file_id, data in file_scores.items():
            score = data['best_score']

            if score < self.SIMILAR_THRESHOLD:
                continue

            match_type = (
                'near_duplicate' if score >= self.NEAR_DUPLICATE_THRESHOLD
                else 'similar_content'
            )

            matches.append(DuplicateMatch(
                file_id=file_id,
                matched_file_id=matched_file_id,
                match_type=match_type,
                confidence=score,
                metadata={
                    'similarity_score': score,
                    'avg_similarity': data['avg_score'],
                    'chunks_compared': len(data['scores']),
                    'best_chunk_preview': data.get('best_chunk', '')[:200]
                }
            ))

        # Sort by confidence
        matches.sort(key=lambda m: m.confidence, reverse=True)

        return matches[:self.MAX_CANDIDATES]

    def _aggregate_by_file(self, candidates: List) -> Dict:
        """Aggregate chunk-level results to file level"""
        file_scores = {}

        for candidate in candidates:
            cand_file_id = candidate.payload.get('file_id')
            score = candidate.score

            if cand_file_id not in file_scores:
                file_scores[cand_file_id] = {
                    'scores': [],
                    'best_score': 0,
                    'best_chunk': None
                }

            file_scores[cand_file_id]['scores'].append(score)

            if score > file_scores[cand_file_id]['best_score']:
                file_scores[cand_file_id]['best_score'] = score
                file_scores[cand_file_id]['best_chunk'] = candidate.payload.get('chunk_text', '')

        # Calculate averages
        for data in file_scores.values():
            data['avg_score'] = np.mean(data['scores'])

        return file_scores

    async def _get_file_embeddings(self, file_id: str) -> List[dict]:
        """Retrieve chunk embeddings from Qdrant"""
        results, _ = await self.qdrant.scroll(
            collection_name="kms_files_default",
            scroll_filter={
                "must": [
                    {"key": "file_id", "match": {"value": file_id}}
                ]
            },
            limit=1000,
            with_vectors=True
        )

        return [
            {'vector': r.vector, 'chunk_index': r.payload.get('chunk_index')}
            for r in results
        ]
```

---

## Centroid Computation

```python
def compute_file_centroid(chunk_embeddings: List[List[float]]) -> List[float]:
    """
    Compute the centroid (average) of chunk embeddings.

    The centroid represents the "semantic center" of the document,
    capturing the overall meaning across all chunks.
    """
    embeddings = np.array(chunk_embeddings)

    # Mean across all chunks
    centroid = np.mean(embeddings, axis=0)

    # L2 normalize for cosine similarity
    norm = np.linalg.norm(centroid)
    if norm > 0:
        centroid = centroid / norm

    return centroid.tolist()
```

---

## Similarity Interpretation

| Score Range | Classification | Meaning |
|-------------|----------------|---------|
| 0.95 - 1.00 | Near-duplicate | Almost identical content |
| 0.90 - 0.95 | High similarity | Same content, minor changes |
| 0.85 - 0.90 | Similar | Related content |
| 0.70 - 0.85 | Somewhat related | Same topic |
| < 0.70 | Different | Not considered duplicate |

---

## Complexity Analysis

| Operation | Time | Space |
|-----------|------|-------|
| Get embeddings | O(c) | O(c × d) |
| Compute centroid | O(c × d) | O(d) |
| Vector search | O(log n) | O(k) |
| Aggregation | O(k) | O(f) |

Where:
- c = number of chunks
- d = embedding dimension (384)
- n = total vectors in index
- k = candidates returned
- f = unique files in candidates

---

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `near_duplicate_threshold` | 0.95 | Score for near-duplicate |
| `similar_threshold` | 0.85 | Score for similar content |
| `max_candidates` | 50 | Max matches to return |

---

## Use Cases

| Scenario | Expected Result |
|----------|-----------------|
| PDF and DOCX of same document | Near-duplicate (>0.95) |
| v1 and v2 with minor edits | High similarity (0.90-0.95) |
| Same topic, different content | Similar (0.85-0.90) |
| Completely different | No match (<0.85) |

