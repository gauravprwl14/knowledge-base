# dedup-worker Service

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The `dedup-worker` is a Python-based background worker responsible for detecting and grouping duplicate files. It uses multiple detection strategies: exact hash matching, semantic similarity, and version pattern detection.

---

## Service Identity

| Property | Value |
|----------|-------|
| **Name** | dedup-worker |
| **Language** | Python 3.11+ |
| **Framework** | asyncio + scikit-learn |
| **Port** | None (worker) |
| **Type** | Worker Service (Asynchronous) |
| **Queue** | dedup.queue |
| **Repository** | /dedup-worker |

---

## Responsibilities

### Primary Responsibilities

1. **Exact Duplicate Detection**
   - Match files by SHA-256 hash
   - Group identical files regardless of name/location

2. **Semantic Duplicate Detection**
   - Compare embedding vectors
   - Find content-similar files (different formats)

3. **Version Duplicate Detection**
   - Pattern match filenames (v1, v2, final, etc.)
   - Group document versions together

4. **Duplicate Grouping**
   - Create and manage duplicate groups
   - Select primary file per group
   - Store relationships in Neo4j

5. **Statistics Tracking**
   - Calculate storage savings
   - Track duplicate counts by type

---

## Tech Stack

| Category | Library | Version | Purpose |
|----------|---------|---------|---------|
| **Runtime** | Python | 3.11+ | Language runtime |
| **Hashing** | hashlib | (stdlib) | SHA-256 hashing |
| **Similarity** | scikit-learn | 1.x | Cosine similarity |
| **Numerical** | numpy | 1.x | Vector operations |
| **Vector DB** | qdrant-client | 1.x | Embedding search |
| **Graph DB** | neo4j | 5.x | Relationship storage |
| **Pattern** | regex | 2023.x | Filename patterns |
| **Difflib** | difflib | (stdlib) | String similarity |
| **Queue** | aio-pika | 9.x | RabbitMQ client |
| **Database** | asyncpg | 0.29.x | PostgreSQL driver |
| **Validation** | pydantic | 2.x | Data validation |
| **Logging** | structlog | 23.x | Structured logging |

---

## Project Structure

```
dedup-worker/
├── app/
│   ├── __init__.py
│   ├── main.py                    # Entry point
│   ├── config.py                  # Configuration
│   ├── worker.py                  # Queue consumer
│   │
│   ├── detectors/
│   │   ├── __init__.py
│   │   ├── base.py               # Detector interface
│   │   ├── hash_detector.py      # Exact hash matching
│   │   ├── semantic_detector.py  # Embedding similarity
│   │   └── version_detector.py   # Filename patterns
│   │
│   ├── grouping/
│   │   ├── __init__.py
│   │   ├── group_manager.py      # Group CRUD operations
│   │   ├── primary_selector.py   # Primary file selection
│   │   └── merge_handler.py      # Group merging
│   │
│   ├── storage/
│   │   ├── __init__.py
│   │   ├── postgres.py           # PostgreSQL client
│   │   ├── qdrant.py             # Vector search
│   │   └── neo4j.py              # Graph storage
│   │
│   ├── queue/
│   │   ├── __init__.py
│   │   ├── consumer.py           # Message consumer
│   │   └── publisher.py          # Message publisher
│   │
│   └── utils/
│       ├── __init__.py
│       ├── hashing.py            # Hash utilities
│       └── patterns.py           # Version patterns
│
├── tests/
│   ├── unit/
│   └── integration/
│
├── requirements.txt
├── Dockerfile
└── README.md
```

---

## Duplicate Detection Strategies

### Strategy 1: Exact Hash Detection

#### Conceptual Algorithm

```
ALGORITHM: Exact Hash Duplicate Detection
INPUT: file_id, hash_sha256
OUTPUT: duplicate_group_id or None

1. QUERY EXISTING HASHES
   - SELECT file_id, duplicate_group_id
     FROM kms_files
     WHERE hash_sha256 = input_hash
       AND file_id != input_file_id
       AND user_id = current_user_id

2. IF matches found THEN
   - IF any match has duplicate_group_id THEN
     - Add input_file to existing group
     - RETURN existing_group_id
   - ELSE
     - Create new duplicate group
     - Add all matched files + input_file to group
     - RETURN new_group_id

3. ELSE
   - RETURN None (no duplicates)

4. UPDATE STATISTICS
   - Calculate storage saved (sum of duplicate sizes)
   - Update user duplicate count
```

#### High-Level Implementation

```python
# app/detectors/hash_detector.py - NOT executable - conceptual implementation

from typing import List, Optional
from pydantic import BaseModel

class DuplicateMatch(BaseModel):
    """A detected duplicate relationship"""
    file_id: str
    matched_file_id: str
    match_type: str               # 'exact', 'semantic', 'version'
    confidence: float             # 0.0 to 1.0
    metadata: dict

class HashDuplicateDetector:
    """
    Detect exact duplicates using SHA-256 hash matching.
    Fastest and most accurate detection method.
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

        Args:
            file_id: ID of the file to check
            hash_sha256: SHA-256 hash of file content
            user_id: Owner user ID (scope duplicates to user)

        Returns:
            List of DuplicateMatch objects
        """
        # Query for matching hashes
        matches = await self.db.query("""
            SELECT
                f.id AS file_id,
                f.name,
                f.path,
                f.size_bytes,
                f.duplicate_group_id
            FROM kms_files f
            WHERE f.hash_sha256 = $1
              AND f.id != $2
              AND f.user_id = $3
              AND f.is_deleted = false
        """, hash_sha256, file_id, user_id)

        # Convert to DuplicateMatch objects
        duplicates = []
        for match in matches:
            duplicates.append(DuplicateMatch(
                file_id=file_id,
                matched_file_id=match['file_id'],
                match_type='exact',
                confidence=1.0,  # Hash match is 100% confident
                metadata={
                    'matched_name': match['name'],
                    'matched_path': match['path'],
                    'existing_group': match['duplicate_group_id']
                }
            ))

        return duplicates
```

---

### Strategy 2: Semantic Duplicate Detection

#### Conceptual Algorithm

```
ALGORITHM: Semantic Duplicate Detection
INPUT: file_id, file_embeddings (list of chunk vectors)
OUTPUT: List of DuplicateMatch with confidence scores

1. COMPUTE FILE CENTROID
   - centroid = mean(file_embeddings)
   - Normalize centroid to unit vector

2. SEARCH SIMILAR VECTORS
   - Query Qdrant for top-K similar centroids
   - Filter: same user, different file, score > threshold (0.85)

3. FOR EACH candidate RESULT
   - IF candidate.score >= 0.95 THEN
     - classification = 'near_duplicate'
   - ELSE IF candidate.score >= 0.85 THEN
     - classification = 'similar_content'
   - ELSE
     - SKIP (below threshold)

4. FINE-GRAINED COMPARISON (optional)
   - For near_duplicates, compare chunk-by-chunk
   - Calculate: shared_chunks / total_chunks

5. RETURN matches with confidence = similarity_score
```

#### High-Level Implementation

```python
# app/detectors/semantic_detector.py - NOT executable - conceptual implementation

import numpy as np
from typing import List

class SemanticDuplicateDetector:
    """
    Detect content-similar files using embedding vectors.
    Finds files with similar content regardless of format.
    """

    # Similarity thresholds
    NEAR_DUPLICATE_THRESHOLD = 0.95   # Almost identical content
    SIMILAR_THRESHOLD = 0.85           # Related content
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

        Args:
            file_id: ID of the file to check
            user_id: Owner user ID

        Returns:
            List of DuplicateMatch with similarity scores
        """
        # Step 1: Get file's chunk embeddings
        chunks = await self._get_file_embeddings(file_id)
        if not chunks:
            return []

        # Step 2: Compute file centroid
        embeddings = np.array([c['embedding'] for c in chunks])
        centroid = np.mean(embeddings, axis=0)
        centroid = centroid / np.linalg.norm(centroid)  # Normalize

        # Step 3: Search for similar files
        results = await self.qdrant.search(
            collection_name='kms_files_default',
            query_vector=centroid.tolist(),
            query_filter={
                "must": [
                    {"key": "user_id", "match": {"value": user_id}}
                ],
                "must_not": [
                    {"key": "file_id", "match": {"value": file_id}}
                ]
            },
            limit=self.MAX_CANDIDATES
        )

        # Step 4: Group by file and compute scores
        file_scores = self._aggregate_by_file(results)

        # Step 5: Build duplicate matches
        duplicates = []
        for matched_file_id, score in file_scores.items():
            if score < self.SIMILAR_THRESHOLD:
                continue

            match_type = (
                'near_duplicate' if score >= self.NEAR_DUPLICATE_THRESHOLD
                else 'similar_content'
            )

            duplicates.append(DuplicateMatch(
                file_id=file_id,
                matched_file_id=matched_file_id,
                match_type=match_type,
                confidence=score,
                metadata={
                    'similarity_score': score,
                    'detection_method': 'semantic'
                }
            ))

        return duplicates

    def _aggregate_by_file(self, results: List) -> dict:
        """
        Aggregate chunk-level scores to file-level.
        Uses max score across chunks as file similarity.
        """
        file_scores = {}

        for result in results:
            file_id = result.payload.get('file_id')
            score = result.score

            if file_id not in file_scores:
                file_scores[file_id] = []
            file_scores[file_id].append(score)

        # Use max score (best matching chunk) as file score
        return {
            file_id: max(scores)
            for file_id, scores in file_scores.items()
        }

    async def _get_file_embeddings(self, file_id: str) -> List[dict]:
        """Retrieve chunk embeddings for a file from Qdrant"""
        results = await self.qdrant.scroll(
            collection_name='kms_files_default',
            scroll_filter={
                "must": [
                    {"key": "file_id", "match": {"value": file_id}}
                ]
            },
            limit=1000
        )
        return [
            {'embedding': r.vector, 'index': r.payload.get('chunk_index')}
            for r in results[0]
        ]
```

---

### Strategy 3: Version Duplicate Detection

#### Conceptual Algorithm

```
ALGORITHM: Version Pattern Detection
INPUT: file_id, filename, folder_id
OUTPUT: List of DuplicateMatch for version relationships

1. EXTRACT BASE NAME
   - Remove extension
   - Remove version patterns:
     - "_v1", "_v2", "_final", "_draft"
     - "(1)", "(2)", " copy"
     - "_2024-01-01", "_20240101"

2. FIND SIBLING FILES
   - Query files in same folder or nearby folders
   - Filter: same user, different file_id

3. FOR EACH sibling
   - Extract sibling's base name
   - IF base_names are similar (>80% string similarity) THEN
     - Check if version indicators differ
     - Classify relationship

4. VERSION ORDERING
   - Parse version numbers/dates
   - Determine which is newer/primary
   - latest_version = max(version_numbers)

5. RETURN version group with ordering metadata
```

#### High-Level Implementation

```python
# app/detectors/version_detector.py - NOT executable - conceptual implementation

import re
from difflib import SequenceMatcher
from typing import List, Tuple, Optional

class VersionDuplicateDetector:
    """
    Detect version-related files using filename patterns.
    Groups files like: report_v1.docx, report_v2.docx, report_final.docx
    """

    # Version patterns to detect
    VERSION_PATTERNS = [
        r'_v(\d+)',                    # _v1, _v2
        r'_version_?(\d+)',            # _version1, _version_2
        r'\s*\((\d+)\)',               # (1), (2)
        r'_(\d{4}-\d{2}-\d{2})',       # _2024-01-15
        r'_(\d{8})',                   # _20240115
        r'_(final|draft|revised)',     # _final, _draft
        r'\s+copy(\s+\d+)?',           # copy, copy 2
    ]

    BASE_NAME_SIMILARITY_THRESHOLD = 0.8

    def __init__(self, db_client):
        self.db = db_client
        self._version_regex = re.compile(
            '|'.join(self.VERSION_PATTERNS),
            re.IGNORECASE
        )

    async def detect(
        self,
        file_id: str,
        filename: str,
        folder_id: str,
        user_id: str
    ) -> List[DuplicateMatch]:
        """
        Find version-related files.

        Args:
            file_id: ID of the file to check
            filename: File name with extension
            folder_id: Parent folder ID
            user_id: Owner user ID

        Returns:
            List of DuplicateMatch for version relationships
        """
        # Step 1: Extract base name
        base_name, version_info = self._extract_base_name(filename)

        if not base_name:
            return []

        # Step 2: Find sibling files
        siblings = await self._find_siblings(folder_id, file_id, user_id)

        # Step 3: Match against siblings
        duplicates = []
        for sibling in siblings:
            sibling_base, sibling_version = self._extract_base_name(sibling['name'])

            if not sibling_base:
                continue

            # Compare base names
            similarity = self._string_similarity(base_name, sibling_base)

            if similarity >= self.BASE_NAME_SIMILARITY_THRESHOLD:
                # Found a version relationship
                confidence = self._calculate_confidence(
                    similarity,
                    version_info,
                    sibling_version
                )

                duplicates.append(DuplicateMatch(
                    file_id=file_id,
                    matched_file_id=sibling['id'],
                    match_type='version',
                    confidence=confidence,
                    metadata={
                        'base_name': base_name,
                        'version': version_info,
                        'matched_version': sibling_version,
                        'name_similarity': similarity
                    }
                ))

        return duplicates

    def _extract_base_name(self, filename: str) -> Tuple[str, Optional[str]]:
        """
        Extract base name and version info from filename.

        Example:
            "report_v2_final.docx" -> ("report", "v2_final")
        """
        # Remove extension
        name_without_ext = re.sub(r'\.[^.]+$', '', filename)

        # Find and extract version patterns
        version_matches = self._version_regex.findall(name_without_ext)

        # Remove version patterns to get base name
        base_name = self._version_regex.sub('', name_without_ext)
        base_name = base_name.strip('_- ')

        version_info = '_'.join(
            m for match in version_matches
            for m in (match if isinstance(match, tuple) else (match,))
            if m
        ) or None

        return base_name, version_info

    def _string_similarity(self, a: str, b: str) -> float:
        """Calculate string similarity using SequenceMatcher"""
        return SequenceMatcher(None, a.lower(), b.lower()).ratio()

    def _calculate_confidence(
        self,
        name_similarity: float,
        version_a: Optional[str],
        version_b: Optional[str]
    ) -> float:
        """
        Calculate confidence score for version relationship.

        Higher confidence if:
        - Base names are very similar
        - Both have version indicators
        - Version indicators are different
        """
        base_confidence = name_similarity

        # Boost if both have version indicators
        if version_a and version_b:
            if version_a != version_b:
                return min(base_confidence + 0.1, 1.0)

        # Lower confidence if neither has version indicator
        if not version_a and not version_b:
            return base_confidence * 0.8

        return base_confidence
```

---

## Duplicate Grouping

### Group Management

```python
# app/grouping/group_manager.py - NOT executable - conceptual implementation

from typing import List, Optional
import uuid

class DuplicateGroup:
    """A group of duplicate files"""
    group_id: str
    primary_file_id: str
    duplicate_type: str           # 'exact', 'semantic', 'version'
    file_ids: List[str]
    total_size_bytes: int
    savings_bytes: int
    created_at: datetime
    updated_at: datetime

class GroupManager:
    """
    Manage duplicate groups.
    Handles creation, merging, and primary selection.
    """

    def __init__(self, postgres_client, neo4j_client):
        self.postgres = postgres_client
        self.neo4j = neo4j_client

    async def process_duplicates(
        self,
        file_id: str,
        matches: List[DuplicateMatch]
    ) -> Optional[str]:
        """
        Process detected duplicates and create/update groups.

        Args:
            file_id: The file that was just processed
            matches: Detected duplicate matches

        Returns:
            Group ID if file was added to a group
        """
        if not matches:
            return None

        # Group matches by existing duplicate_group_id
        existing_groups = await self._find_existing_groups(matches)

        if existing_groups:
            # Add to existing group (merge if multiple)
            group_id = await self._merge_into_existing(
                file_id,
                matches,
                existing_groups
            )
        else:
            # Create new group
            group_id = await self._create_new_group(file_id, matches)

        # Update primary file selection
        await self._update_primary(group_id)

        # Store relationships in Neo4j
        await self._store_relationships(file_id, matches)

        return group_id

    async def _create_new_group(
        self,
        file_id: str,
        matches: List[DuplicateMatch]
    ) -> str:
        """Create a new duplicate group"""
        group_id = str(uuid.uuid4())

        # Determine group type from highest confidence match
        best_match = max(matches, key=lambda m: m.confidence)
        group_type = best_match.match_type

        # Get all file IDs (original + matches)
        all_file_ids = [file_id] + [m.matched_file_id for m in matches]

        # Calculate sizes
        file_sizes = await self._get_file_sizes(all_file_ids)
        total_size = sum(file_sizes.values())
        largest_size = max(file_sizes.values())
        savings = total_size - largest_size

        # Insert group
        await self.postgres.execute("""
            INSERT INTO kms_duplicate_groups
            (id, group_type, file_count, total_size_bytes, savings_bytes)
            VALUES ($1, $2, $3, $4, $5)
        """, group_id, group_type, len(all_file_ids), total_size, savings)

        # Update files with group_id
        await self.postgres.execute("""
            UPDATE kms_files
            SET duplicate_group_id = $1
            WHERE id = ANY($2)
        """, group_id, all_file_ids)

        return group_id

    async def _update_primary(self, group_id: str):
        """
        Select and update the primary file for a group.
        Uses PrimarySelector for intelligent selection.
        """
        selector = PrimarySelector(self.postgres)
        primary_id = await selector.select_primary(group_id)

        await self.postgres.execute("""
            UPDATE kms_duplicate_groups
            SET primary_file_id = $1,
                updated_at = NOW()
            WHERE id = $2
        """, primary_id, group_id)

    async def _store_relationships(
        self,
        file_id: str,
        matches: List[DuplicateMatch]
    ):
        """Store duplicate relationships in Neo4j"""
        for match in matches:
            await self.neo4j.execute("""
                MERGE (a:File {id: $file_id})
                MERGE (b:File {id: $matched_id})
                MERGE (a)-[r:DUPLICATE_OF {
                    type: $match_type,
                    confidence: $confidence
                }]->(b)
            """,
                file_id=file_id,
                matched_id=match.matched_file_id,
                match_type=match.match_type,
                confidence=match.confidence
            )
```

### Primary File Selection

```python
# app/grouping/primary_selector.py - NOT executable - conceptual implementation

class PrimarySelector:
    """
    Select the best file to keep as primary in a duplicate group.
    Uses multiple criteria to rank files.
    """

    # Weights for selection criteria
    WEIGHTS = {
        'recency': 0.3,        # Newer files preferred
        'quality': 0.25,       # Higher quality (resolution, etc.)
        'accessibility': 0.25, # Local > cloud
        'name_quality': 0.2    # Clean names preferred
    }

    async def select_primary(self, group_id: str) -> str:
        """
        Select the best file to be primary.

        Criteria (in order of importance):
        1. Most recently modified
        2. Highest quality (for media)
        3. Most accessible location
        4. Cleanest filename
        """
        files = await self._get_group_files(group_id)

        scores = {}
        for file in files:
            scores[file['id']] = self._calculate_score(file)

        # Return file with highest score
        return max(scores, key=scores.get)

    def _calculate_score(self, file: dict) -> float:
        """Calculate overall score for a file"""
        score = 0.0

        # Recency score (normalize to 0-1 based on group)
        score += self.WEIGHTS['recency'] * self._recency_score(file)

        # Quality score
        score += self.WEIGHTS['quality'] * self._quality_score(file)

        # Accessibility score
        score += self.WEIGHTS['accessibility'] * self._accessibility_score(file)

        # Name quality score
        score += self.WEIGHTS['name_quality'] * self._name_score(file)

        return score

    def _accessibility_score(self, file: dict) -> float:
        """Score based on file accessibility"""
        source_type = file.get('source_type', '')

        if source_type == 'local_fs':
            return 1.0
        elif source_type == 'external_drive':
            return 0.7
        elif source_type == 'google_drive':
            return 0.5
        return 0.3

    def _name_score(self, file: dict) -> float:
        """Score based on filename quality"""
        name = file.get('name', '')

        # Penalize version indicators
        if re.search(r'_v\d+|copy|\(\d+\)|draft|old', name, re.I):
            return 0.3

        # Penalize long names
        if len(name) > 100:
            return 0.5

        return 1.0
```

---

## Neo4j Graph Schema

```cypher
// Node types
(:File {
    id: string,
    name: string,
    path: string,
    source_id: string,
    user_id: string
})

(:DuplicateGroup {
    id: string,
    type: string,
    primary_file_id: string
})

// Relationships
(:File)-[:DUPLICATE_OF {
    type: string,         // 'exact', 'semantic', 'version'
    confidence: float,    // 0.0 to 1.0
    detected_at: datetime
}]->(:File)

(:File)-[:BELONGS_TO]->(:DuplicateGroup)
```

---

## Queue Integration

### Incoming Message (dedup.queue)

```json
{
  "event_type": "EMBEDDING_COMPLETED",
  "correlation_id": "uuid",
  "timestamp": "2026-01-07T10:00:00Z",
  "payload": {
    "file_id": "uuid",
    "hash_sha256": "abc123...",
    "chunk_count": 15,
    "user_id": "uuid"
  }
}
```

### Processing Result

No outgoing queue - results stored directly in PostgreSQL and Neo4j.

---

## Configuration

```yaml
# Environment variables
RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672
DATABASE_URL: postgresql://user:pass@postgres:5432/kms
QDRANT_URL: http://qdrant:6333
NEO4J_URL: bolt://neo4j:7687
NEO4J_USER: neo4j
NEO4J_PASSWORD: password

# Detection thresholds
SEMANTIC_THRESHOLD: 0.85
NEAR_DUPLICATE_THRESHOLD: 0.95
NAME_SIMILARITY_THRESHOLD: 0.8

# Processing settings
MAX_CANDIDATES: 50
PROCESSING_TIMEOUT_MINUTES: 15
```

---

## Scaling Strategy

| Metric | Threshold | Action |
|--------|-----------|--------|
| Queue depth | > 200 | Scale up workers |
| Neo4j connections | > 80% | Add read replicas |
| Processing time | > 2 min/file | Investigate |
| Worker instances | 1-3 | Auto-scale on queue depth |

