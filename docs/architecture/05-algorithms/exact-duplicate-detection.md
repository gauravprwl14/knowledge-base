# Exact Duplicate Detection Algorithm

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Problem Statement

Identify files with identical content regardless of filename or location. Uses cryptographic hashing (SHA-256) for 100% confidence matching.

---

## Conceptual Algorithm

```
ALGORITHM: Hash-Based Exact Duplicate Detection
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INPUT:
  file_id      : String       // File to check
  hash_sha256  : String       // SHA-256 hash of file content
  user_id      : String       // User scope

OUTPUT:
  matches      : List[Match]  // List of exact duplicates

PROCEDURE detect_exact_duplicates(file_id, hash_sha256, user_id):

  1. QUERY MATCHING HASHES
     ───────────────────────
     matches ← SQL """
       SELECT id, name, path, size_bytes, duplicate_group_id
       FROM kms_files
       WHERE hash_sha256 = hash_sha256
         AND user_id = user_id
         AND id != file_id
         AND is_deleted = false
     """

  2. BUILD MATCH RESULTS
     ─────────────────────
     results ← []
     FOR EACH match IN matches DO
       append(results, DuplicateMatch(
         file_id = file_id,
         matched_file_id = match.id,
         match_type = 'exact',
         confidence = 1.0,
         metadata = {
           hash: hash_sha256,
           matched_name: match.name,
           matched_path: match.path,
           existing_group: match.duplicate_group_id
         }
       ))
     END FOR

  3. RETURN results
```

---

## High-Level Implementation

```python
# app/detectors/hash_detector.py - NOT executable - conceptual implementation

from typing import List
from dataclasses import dataclass

@dataclass
class DuplicateMatch:
    file_id: str
    matched_file_id: str
    match_type: str
    confidence: float
    metadata: dict


class HashDuplicateDetector:
    """
    Detect exact duplicates using SHA-256 hash matching.

    Properties:
    - 100% confidence (cryptographic guarantee)
    - O(1) lookup time with index
    - No false positives
    """

    def __init__(self, db_client):
        self.db = db_client

    async def detect(
        self,
        file_id: str,
        hash_sha256: str,
        user_id: str
    ) -> List[DuplicateMatch]:
        """
        Find files with identical hash.

        The SHA-256 hash provides cryptographic certainty that
        files with matching hashes have identical content.
        """
        if not hash_sha256:
            return []

        # Query for matching hashes
        matches = await self.db.fetch("""
            SELECT
                id,
                name,
                path,
                size_bytes,
                duplicate_group_id,
                source_id
            FROM kms_files
            WHERE hash_sha256 = $1
              AND user_id = $2
              AND id != $3
              AND is_deleted = false
        """, hash_sha256, user_id, file_id)

        # Build match results
        return [
            DuplicateMatch(
                file_id=file_id,
                matched_file_id=str(match['id']),
                match_type='exact',
                confidence=1.0,
                metadata={
                    'hash': hash_sha256,
                    'matched_name': match['name'],
                    'matched_path': match['path'],
                    'matched_size': match['size_bytes'],
                    'existing_group': str(match['duplicate_group_id']) if match['duplicate_group_id'] else None,
                    'cross_source': True  # Works across different sources
                }
            )
            for match in matches
        ]
```

---

## Hash Calculation

### Full File Hash

```python
import hashlib

async def calculate_full_hash(file_path: str) -> str:
    """Calculate SHA-256 hash of entire file"""
    hasher = hashlib.sha256()

    with open(file_path, 'rb') as f:
        while chunk := f.read(65536):  # 64KB chunks
            hasher.update(chunk)

    return hasher.hexdigest()
```

### Partial Hash (Large Files)

```python
async def calculate_partial_hash(file_path: str, size: int) -> str:
    """
    Calculate hash for large files (>100MB).
    Uses first 1MB + last 1MB + file size.
    """
    PARTIAL_SIZE = 1024 * 1024  # 1MB

    hasher = hashlib.sha256()

    with open(file_path, 'rb') as f:
        # First 1MB
        hasher.update(f.read(PARTIAL_SIZE))

        # Last 1MB
        f.seek(-PARTIAL_SIZE, 2)
        hasher.update(f.read(PARTIAL_SIZE))

        # Include file size for uniqueness
        hasher.update(str(size).encode())

    return hasher.hexdigest()
```

---

## Complexity Analysis

| Operation | Time | Space |
|-----------|------|-------|
| Hash lookup | O(1) | O(1) |
| Result building | O(m) | O(m) |

Where m = number of matches (typically 0-10)

---

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `max_hash_size` | 100MB | Max file size for full hash |
| `partial_hash_size` | 1MB | Size of partial hash chunks |

---

## Edge Cases

| Case | Handling |
|------|----------|
| No hash (cloud files) | Skip detection, use semantic |
| Same file re-indexed | Skip self-match |
| Cross-source duplicates | Match across all sources |
| Deleted files | Exclude from matches |

