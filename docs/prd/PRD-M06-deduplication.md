# PRD: M06 — Deduplication

## Status

`Approved`

**Created**: 2026-03-17
**Depends on**: M00, M02 (files exist), M04 (semantic dedup requires embeddings)

---

## Business Context

Users accumulate duplicate files across Google Drive, local folders, Obsidian vaults — the same report saved in 5 places, the same recording downloaded multiple times. KMS detects and groups these duplicates so users can clean up without manual comparison. Exact dedup (SHA-256) is always on. Semantic dedup (95%+ similarity) requires embeddings.

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | `ExactMatchStrategy`: SHA-256 lookup, group files with same hash | Must |
| FR-02 | `SemanticMatchStrategy`: Qdrant query for >95% cosine similarity (feature-gated) | Should |
| FR-03 | `VersionGroupStrategy`: same filename + different timestamps → version cluster | Should |
| FR-04 | Group duplicates: `kms_duplicate_groups` + `kms_file_duplicates` | Must |
| FR-05 | `GET /api/v1/duplicates` — paginated list of groups | Must |
| FR-06 | `POST /api/v1/duplicates/{groupId}/resolve { keep_file_id }` — keep one, delete others | Must |
| FR-07 | `POST /api/v1/duplicates/auto-resolve` — auto-keep newest, delete older exact matches | Should |
| FR-08 | Redis cache: `kms:dedup:sha256:{hash}` for O(1) exact match lookup | Must |

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `KBDUP0001` | 404 | Duplicate group not found |
| `KBDUP0002` | 400 | keep_file_id not in group |
| `KBDUP0003` | 409 | File already deleted |

---

## DB Schema

```sql
CREATE TABLE kms_duplicate_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    strategy VARCHAR(20) NOT NULL,  -- exact | semantic | version
    file_count INT NOT NULL,
    total_size_bytes BIGINT,
    status VARCHAR(20) DEFAULT 'unresolved',  -- unresolved | resolved
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE kms_file_duplicates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES kms_duplicate_groups(id) ON DELETE CASCADE,
    file_id UUID NOT NULL,
    is_canonical BOOLEAN DEFAULT false,
    similarity_score REAL  -- 1.0 for exact, <1.0 for semantic
);
```

---

## Queue Message

```python
class DedupCheckMessage(BaseModel):
    file_id: str
    user_id: str
    checksum_sha256: str
    source_id: str
```

---

## Testing Plan

| Test | Key Cases |
|------|-----------|
| Unit: ExactMatchStrategy | Same SHA-256 → grouped; different → not grouped |
| Unit: VersionGroupStrategy | "report_v1.pdf" + "report_v2.pdf" → same group |
| Integration | DedupHandler → kms_duplicate_groups created |
| E2E | Upload same file twice → appears in /duplicates → resolve → file deleted |
