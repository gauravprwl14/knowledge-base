# PRD: M07 — Junk Detection & Cleanup

## Status

`Approved`

**Created**: 2026-03-17
**Depends on**: M00, M03 (extraction attempted)

---

## Business Context

Knowledge bases fill with digital detritus: `.DS_Store`, `~$temp.docx`, zero-byte files, corrupted downloads. These waste storage, pollute search results, and make it harder to find real content. Junk detection flags these files automatically so users can bulk-delete with confidence. The UI shows confidence scores so users can set their own threshold.

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | `RuleBasedClassifier`: temp filenames (`~$`, `.DS_Store`, `Thumbs.db`, `.localized`) | Must |
| FR-02 | `RuleBasedClassifier`: empty files (< 1KB) | Must |
| FR-03 | `RuleBasedClassifier`: extension blacklist (`.tmp`, `.bak`, `.log`) | Must |
| FR-04 | `CorruptedFileDetector`: extraction failed + unreadable → junk | Must |
| FR-05 | `MLClassifier`: content-based classifier (confidence score 0.0–1.0) (feature-gated) | Could |
| FR-06 | `GET /api/v1/junk` — paginated list with reason + confidence | Must |
| FR-07 | `DELETE /api/v1/junk/bulk { file_ids }` — permanent delete | Must |
| FR-08 | `DELETE /api/v1/junk/all?min_confidence=0.9` — delete all above threshold | Should |
| FR-09 | Mark junk via internal webhook from dedup-worker | Must |

---

## Junk Reasons

| Reason | Description |
|--------|-------------|
| `temp_file` | Filename matches temp file pattern |
| `empty_file` | Size < 1KB |
| `blacklisted_extension` | Extension in blacklist |
| `extraction_failed` | Could not extract any text |
| `ml_classified` | ML model confidence > threshold |

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `KBJNK0001` | 404 | File not found in junk list |
| `KBJNK0002` | 400 | Cannot delete a non-junk file via this endpoint |

---

## DB Changes

```sql
-- Added to kms_files
ALTER TABLE kms_files
    ADD COLUMN junk_status VARCHAR(20),  -- null | flagged | confirmed | dismissed
    ADD COLUMN junk_reason VARCHAR(50),
    ADD COLUMN junk_confidence REAL,
    ADD COLUMN junk_reviewed_at TIMESTAMPTZ;
```

---

## Testing Plan

| Test | Key Cases |
|------|-----------|
| Unit: RuleBasedClassifier | `.DS_Store` → junk; `report.pdf` → not junk |
| Unit: CorruptedFileDetector | Extraction exception → junk with `extraction_failed` reason |
| E2E | Upload `.DS_Store` → scan → appears in /junk → bulk delete |
