# Backlog: File Deletion Sync

**Type**: Bug / Data Quality Gap
**Priority**: HIGH
**Effort**: S (1 day)
**Status**: Backlog — not started
**Created**: 2026-03-23

---

## Problem

When a file is deleted from Google Drive, the Drive Changes API returns `removed: true` for that `fileId` in the next incremental scan poll. The `scan-worker` currently does **not** handle this case — the deletion is silently ignored.

Result: deleted files remain indefinitely in:
- `kms_files` — stale file record with outdated metadata
- `kms_chunks` — orphaned chunk rows, taking up DB space
- Qdrant — stale vector points returned in search results

This is a data quality defect: users searching their knowledge base will receive results pointing to files that no longer exist in Google Drive.

---

## Required Behaviour

The following steps must be implemented in the order listed:

1. **scan-worker: detect removed files**
   - During incremental scan processing, check each change item for `removed: true`
   - For each removed `fileId`, determine the corresponding `kms_files` row

2. **Dispatch deletion event**
   - Option A (preferred): publish a `FileDeletedMessage` to queue `kms.delete`; a new lightweight delete-worker (or the scan-worker itself inline) handles the cleanup steps below
   - Option B (inline): handle deletion synchronously within scan-worker before ACK-ing the scan message
   - Decision pending — see Decisions section

3. **Delete Qdrant points**
   - Filter Qdrant collection by payload field `file_id = <id>`
   - Delete all matching points

4. **Delete chunk rows**
   - `DELETE FROM kms_chunks WHERE file_id = <id>`

5. **Handle `kms_files` row**
   - **Preferred (soft delete)**: `UPDATE kms_files SET status = 'DELETED', deleted_at = now() WHERE id = <id>`
   - Keeps metadata for audit trail (when was the file removed from Drive?)
   - Hard delete with cascade is acceptable if audit trail is not required — decision pending

---

## Acceptance Criteria

- [ ] scan-worker detects `removed: true` change items and does not skip them silently
- [ ] Qdrant points for the deleted file are removed (search no longer returns them)
- [ ] `kms_chunks` rows for the deleted file are removed
- [ ] `kms_files` row is soft-deleted (status = DELETED) with `deleted_at` timestamp
- [ ] Deletion events are logged with structured log (file_id, source_id, user_id, timestamp)
- [ ] If Qdrant or DB delete fails, the operation is retried (not silently ignored)
- [ ] Unit tests cover: removed=true detection, Qdrant delete call, DB soft-delete
- [ ] `kms_files` with status DELETED are excluded from all search and listing queries

---

## Schema Changes

```sql
-- kms_files already has a status enum; add DELETED value if not present
-- Add deleted_at column for audit trail
ALTER TABLE kms_files
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Existing status enum must include 'DELETED'
-- (check current enum values before migration)
```

---

## Open Decisions

| # | Question | Options | Decision |
|---|---------|---------|----------|
| 1 | Handle deletion inline in scan-worker or via dedicated `kms.delete` queue? | Inline (simpler), New queue (cleaner separation) | Pending |
| 2 | Soft delete or hard delete `kms_files`? | Soft (audit trail), Hard (simpler) | Soft delete preferred |
| 3 | Should `kms_chunks` hard-delete cascade or be explicit? | CASCADE FK, Explicit DELETE | Explicit DELETE to control order |

---

## Related

- scan-worker: `services/scan-worker/`
- embed-worker: `services/embed-worker/` (embeds may already be in-flight when deletion is processed — handle gracefully)
- Qdrant collection: see `PRD-M04-embedding-pipeline.md`
- File status enum: `kms-api/prisma/schema.prisma`
