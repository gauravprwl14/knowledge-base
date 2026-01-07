# Deduplication Flow

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The deduplication flow identifies and groups duplicate files using three strategies: exact hash matching, semantic similarity, and version pattern detection. This enables users to reclaim storage by identifying redundant copies.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          DEDUPLICATION FLOW                                      │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────┐
    │                            RabbitMQ                                      │
    │  ┌─────────────────────────────────────────────────────────────────┐    │
    │  │                      dedup.queue                                 │    │
    │  │                                                                  │    │
    │  │  Message: { file_id, hash_sha256, chunk_count, user_id }        │    │
    │  └─────────────────────────────────────────────────────────────────┘    │
    └─────────────────────────────────┬───────────────────────────────────────┘
                                      │ 1. Consume message
                                      ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                          DEDUP-WORKER                                    │
    │                                                                          │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 1: Hash-Based Detection (Exact Duplicates)                   │   │
    │  │                                                                   │   │
    │  │  Query: SELECT * FROM kms_files                                  │   │
    │  │         WHERE hash_sha256 = $hash                                │   │
    │  │           AND user_id = $user_id                                 │   │
    │  │           AND file_id != $file_id                                │   │
    │  │                                                                   │   │
    │  │  IF matches found:                                               │   │
    │  │    confidence = 1.0 (exact match)                                │   │
    │  │    type = 'exact'                                                │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 2: Semantic Detection (Content Similarity)                   │   │
    │  │                                                                   │   │
    │  │  1. Compute file centroid from chunk embeddings                  │   │
    │  │     centroid = mean(embeddings)                                  │   │
    │  │                                                                   │   │
    │  │  2. Search Qdrant for similar files                              │   │
    │  │     threshold = 0.85                                             │   │
    │  │     near_duplicate_threshold = 0.95                              │   │
    │  │                                                                   │   │
    │  │  3. Classify matches:                                            │   │
    │  │     score >= 0.95 → 'near_duplicate'                            │   │
    │  │     score >= 0.85 → 'similar_content'                           │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 3: Version Detection (Filename Patterns)                     │   │
    │  │                                                                   │   │
    │  │  Patterns detected:                                              │   │
    │  │  - _v1, _v2, _version1                                          │   │
    │  │  - (1), (2), copy                                               │   │
    │  │  - _final, _draft, _revised                                     │   │
    │  │  - _20240101, _2024-01-01                                       │   │
    │  │                                                                   │   │
    │  │  Process:                                                        │   │
    │  │  1. Extract base name (remove version patterns)                  │   │
    │  │  2. Find siblings in same/nearby folders                        │   │
    │  │  3. Compare base names (similarity > 80%)                       │   │
    │  │  4. Identify version relationships                              │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 4: Group Management                                          │   │
    │  │                                                                   │   │
    │  │  IF duplicates found:                                            │   │
    │  │    IF existing group exists:                                     │   │
    │  │      - Add file to existing group                                │   │
    │  │      - Merge groups if multiple                                  │   │
    │  │    ELSE:                                                         │   │
    │  │      - Create new duplicate group                                │   │
    │  │      - Add all matched files                                     │   │
    │  │                                                                   │   │
    │  │    - Recalculate group statistics                                │   │
    │  │    - Select primary file                                         │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                              │                                           │
    │                              ▼                                           │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │ Step 5: Store Relationships                                       │   │
    │  │                                                                   │   │
    │  │  PostgreSQL:                                                     │   │
    │  │  - Update kms_files.duplicate_group_id                          │   │
    │  │  - Update kms_duplicate_groups statistics                        │   │
    │  │                                                                   │   │
    │  │  Neo4j:                                                          │   │
    │  │  - Create/update DUPLICATE_OF relationships                     │   │
    │  │  - Store confidence and match type                              │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                                                                          │
    └─────────────────────────────────────────────────────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
    ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
    │    PostgreSQL     │   │      Qdrant       │   │      Neo4j        │
    │                   │   │                   │   │                   │
    │  kms_files        │   │  Vector search    │   │  Relationships    │
    │  kms_dup_groups   │   │                   │   │                   │
    └───────────────────┘   └───────────────────┘   └───────────────────┘
```

---

## Detection Strategies

### Strategy 1: Exact Hash Detection

**Confidence**: 100%
**Speed**: Fastest
**Use Case**: Identical file copies

```python
async def detect_exact_duplicates(file_id: str, hash_sha256: str, user_id: str):
    """
    Find files with identical content hash.
    Most reliable detection method.
    """
    matches = await db.fetch("""
        SELECT id, name, path, size_bytes, duplicate_group_id
        FROM kms_files
        WHERE hash_sha256 = $1
          AND user_id = $2
          AND id != $3
          AND is_deleted = false
    """, hash_sha256, user_id, file_id)

    return [
        DuplicateMatch(
            file_id=file_id,
            matched_file_id=m["id"],
            match_type="exact",
            confidence=1.0,
            metadata={"hash": hash_sha256}
        )
        for m in matches
    ]
```

---

### Strategy 2: Semantic Detection

**Confidence**: 85-99%
**Speed**: Medium
**Use Case**: Same content in different formats

```python
async def detect_semantic_duplicates(file_id: str, user_id: str):
    """
    Find files with similar content using embeddings.
    Catches format variations (PDF vs DOCX).
    """
    # Get file's chunk embeddings
    chunks = await qdrant.scroll(
        collection_name="kms_files_default",
        scroll_filter={"must": [{"key": "file_id", "match": {"value": file_id}}]}
    )

    if not chunks:
        return []

    # Compute centroid
    embeddings = [c.vector for c in chunks]
    centroid = normalize(mean(embeddings))

    # Search for similar files
    results = await qdrant.search(
        collection_name="kms_files_default",
        query_vector=centroid,
        query_filter={
            "must": [{"key": "user_id", "match": {"value": user_id}}],
            "must_not": [{"key": "file_id", "match": {"value": file_id}}]
        },
        limit=50,
        score_threshold=0.85
    )

    # Aggregate by file
    file_scores = aggregate_by_file(results)

    return [
        DuplicateMatch(
            file_id=file_id,
            matched_file_id=fid,
            match_type="near_duplicate" if score >= 0.95 else "similar",
            confidence=score,
            metadata={"similarity": score}
        )
        for fid, score in file_scores.items()
        if score >= 0.85
    ]
```

---

### Strategy 3: Version Detection

**Confidence**: 70-95%
**Speed**: Fast
**Use Case**: File versions (v1, v2, final)

```python
VERSION_PATTERNS = [
    r'_v(\d+)',              # _v1, _v2
    r'_version_?(\d+)',      # _version1
    r'\s*\((\d+)\)',         # (1), (2)
    r'_(\d{4}-\d{2}-\d{2})', # _2024-01-01
    r'_(final|draft|old)',    # _final
    r'\s+copy(\s+\d+)?',     # copy, copy 2
]

async def detect_version_duplicates(
    file_id: str,
    filename: str,
    folder_id: str,
    user_id: str
):
    """
    Find version-related files using filename patterns.
    Groups files like: report_v1.docx, report_v2.docx
    """
    # Extract base name
    base_name = extract_base_name(filename)

    # Find siblings in same folder
    siblings = await db.fetch("""
        SELECT id, name, path
        FROM kms_files
        WHERE parent_folder_id = $1
          AND user_id = $2
          AND id != $3
          AND is_deleted = false
    """, folder_id, user_id, file_id)

    matches = []
    for sibling in siblings:
        sibling_base = extract_base_name(sibling["name"])

        # Compare base names
        similarity = string_similarity(base_name, sibling_base)

        if similarity >= 0.8:
            matches.append(DuplicateMatch(
                file_id=file_id,
                matched_file_id=sibling["id"],
                match_type="version",
                confidence=similarity,
                metadata={
                    "base_name": base_name,
                    "sibling_base": sibling_base
                }
            ))

    return matches
```

---

## Group Management

### Primary Selection Algorithm

```python
async def select_primary_file(group_id: str) -> str:
    """
    Select the best file to keep as primary.

    Criteria (weighted):
    1. Most recently modified (30%)
    2. Cleanest filename (20%)
    3. Most accessible location (25%)
    4. Largest file (25%) - for quality
    """
    files = await db.fetch("""
        SELECT id, name, size_bytes, source_modified_at, source_type
        FROM kms_files
        WHERE duplicate_group_id = $1
        ORDER BY source_modified_at DESC
    """, group_id)

    scores = {}
    for f in files:
        score = 0.0

        # Recency score (normalized 0-1)
        recency = calculate_recency_score(f["source_modified_at"])
        score += 0.30 * recency

        # Name cleanliness (no version patterns)
        name_score = 1.0 if not has_version_pattern(f["name"]) else 0.5
        score += 0.20 * name_score

        # Accessibility
        access_score = {
            "local_fs": 1.0,
            "external_drive": 0.7,
            "google_drive": 0.5
        }.get(f["source_type"], 0.5)
        score += 0.25 * access_score

        # Size (larger often means better quality)
        scores[f["id"]] = score

    # Normalize size scores
    max_size = max(f["size_bytes"] for f in files)
    for f in files:
        scores[f["id"]] += 0.25 * (f["size_bytes"] / max_size)

    return max(scores, key=scores.get)
```

### Savings Calculation

```python
async def calculate_savings(group_id: str) -> int:
    """
    Calculate potential storage savings from deleting duplicates.
    Savings = total_size - primary_file_size
    """
    stats = await db.fetchrow("""
        SELECT
            SUM(size_bytes) AS total_size,
            (SELECT size_bytes FROM kms_files WHERE id = dg.primary_file_id) AS primary_size
        FROM kms_files f
        JOIN kms_duplicate_groups dg ON f.duplicate_group_id = dg.id
        WHERE f.duplicate_group_id = $1
    """, group_id)

    return stats["total_size"] - stats["primary_size"]
```

---

## Neo4j Relationships

### Graph Schema

```cypher
// Create duplicate relationship
MERGE (a:File {id: $file_id})
MERGE (b:File {id: $matched_id})
MERGE (a)-[r:DUPLICATE_OF {
    type: $match_type,
    confidence: $confidence,
    detected_at: datetime()
}]->(b)

// Query duplicate group
MATCH (f:File {id: $file_id})-[:DUPLICATE_OF*1..5]-(related:File)
RETURN DISTINCT related

// Find all duplicates for user
MATCH (f:File {user_id: $user_id})-[r:DUPLICATE_OF]-(other:File)
RETURN f, r, other
```

---

## Database Updates

### Create Duplicate Group

```sql
INSERT INTO kms_duplicate_groups (
    id, group_type, file_count, total_size_bytes, savings_bytes
)
VALUES ($1, $2, $3, $4, $5)
RETURNING id;
```

### Assign Files to Group

```sql
UPDATE kms_files
SET duplicate_group_id = $1, updated_at = NOW()
WHERE id = ANY($2);
```

### Update Group Statistics

```sql
UPDATE kms_duplicate_groups
SET
    file_count = (
        SELECT COUNT(*) FROM kms_files WHERE duplicate_group_id = $1
    ),
    total_size_bytes = (
        SELECT COALESCE(SUM(size_bytes), 0) FROM kms_files WHERE duplicate_group_id = $1
    ),
    savings_bytes = total_size_bytes - (
        SELECT size_bytes FROM kms_files WHERE id = primary_file_id
    ),
    updated_at = NOW()
WHERE id = $1;
```

---

## User Actions

### Mark Primary

```sql
UPDATE kms_duplicate_groups
SET primary_file_id = $1, updated_at = NOW()
WHERE id = $2;
```

### Delete Duplicates (Keep Primary)

```sql
-- Soft delete all except primary
UPDATE kms_files
SET is_deleted = true, deleted_at = NOW()
WHERE duplicate_group_id = $1
  AND id != (SELECT primary_file_id FROM kms_duplicate_groups WHERE id = $1);

-- Clean up group
DELETE FROM kms_duplicate_groups WHERE id = $1;

-- Remove remaining file from group
UPDATE kms_files SET duplicate_group_id = NULL WHERE duplicate_group_id = $1;
```

---

## Performance Optimization

### Batch Processing

```python
# Process files in batches to reduce DB round trips
BATCH_SIZE = 50

async def process_batch(file_ids: List[str]):
    # Batch hash lookup
    hash_matches = await db.fetch("""
        SELECT f1.id AS file_id, f2.id AS match_id
        FROM kms_files f1
        JOIN kms_files f2 ON f1.hash_sha256 = f2.hash_sha256
        WHERE f1.id = ANY($1)
          AND f1.id != f2.id
          AND f2.is_deleted = false
    """, file_ids)
```

### Skip Already Grouped

```python
# Skip files already in a group
async def should_process(file_id: str) -> bool:
    result = await db.fetchval("""
        SELECT duplicate_group_id IS NOT NULL
        FROM kms_files WHERE id = $1
    """, file_id)
    return not result
```

---

## Statistics Dashboard

```json
{
  "user_id": "uuid",
  "statistics": {
    "total_files": 15000,
    "duplicate_groups": 450,
    "total_duplicates": 1200,
    "potential_savings_bytes": 5368709120,
    "potential_savings_formatted": "5.0 GB",
    "breakdown": {
      "exact": {
        "groups": 200,
        "files": 450,
        "savings_bytes": 3221225472
      },
      "semantic": {
        "groups": 150,
        "files": 400,
        "savings_bytes": 1073741824
      },
      "version": {
        "groups": 100,
        "files": 350,
        "savings_bytes": 1073741824
      }
    }
  }
}
```

