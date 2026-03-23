# PRD: Duplicates Detection UI

## Status

`Draft`

**Created**: 2026-03-23
**Depends on**: M06 (dedup-worker), M02 (sources), M01 (auth)

---

## Problem

The `dedup-worker` detects files with the same SHA-256 checksum across or within sources and writes
records to `kms_file_duplicates`. Users currently have no way to see which files are duplicates, how
much storage is being wasted, or take any action to clean them up. The Knowledge Base silently
accumulates duplicate files with no visibility.

---

## Goals

1. Give users a clear view of all duplicate file groups in their knowledge base.
2. Show per-group wasted storage so users can prioritise clean-up.
3. Allow users to delete individual duplicate files, keeping the canonical copy.
4. Allow bulk deletion of all non-canonical files within a group in one click.

---

## Non-Goals

- Semantic / version-based deduplication (covered by M06 future phases)
- Automatic dedup without user confirmation
- Batch resolving all groups at once (future feature)

---

## User Stories

| ID | As a… | I want to… | So that… |
|----|-------|-----------|---------|
| US-01 | KMS user | See a list of duplicate file groups | I understand what is duplicated |
| US-02 | KMS user | See per-group wasted storage in human-readable bytes | I can prioritise which groups to clean |
| US-03 | KMS user | See which file is the "original" (oldest indexed) | I keep the right copy |
| US-04 | KMS user | Delete individual duplicate files | I can fine-tune which copies to remove |
| US-05 | KMS user | Bulk-delete all duplicates in a group in one click | I can clean up quickly |
| US-06 | KMS user | See an empty state when no duplicates exist | I get clear feedback that the KB is clean |

---

## Backend API

### New endpoint

**`GET /api/v1/files/duplicates`**

Returns all duplicate file groups for the authenticated user.

```
Response 200:
{
  "groups": DuplicateGroup[]
}

DuplicateGroup {
  checksum: string          // SHA-256 hash shared by all files in the group
  totalWastedBytes: number  // sum of sizes of all files except the canonical (oldest)
  files: DuplicateFile[]    // ordered oldest → newest
}

DuplicateFile {
  id: string
  originalFilename: string
  fileSize: number
  sourceId: string
  createdAt: string         // ISO-8601
}
```

The route must be declared **before** `GET /files/:id` in the controller to prevent NestJS treating
the string `"duplicates"` as a UUID parameter.

### Existing endpoint used for delete

**`DELETE /api/v1/files/:id`** — already implemented in `FilesService.deleteFile`.

---

## Implementation Notes — Backend

- Query uses `kms_file_duplicates` (written by the `dedup-worker`) joined with `kms_files`.
- Groups are formed by `checksum_sha256`; groups with only one surviving file are excluded via
  `HAVING COUNT(*) > 1`.
- Files with `status = 'DELETED'` are excluded from the join so stale duplicate records do not
  surface already-deleted files.
- `totalWastedBytes` = sum of `file_size_bytes` for all files except the oldest (the "canonical"
  copy kept to represent the content).

---

## Frontend Pages

### `/duplicates`

**Header row**: "Duplicates" title + summary stats: `X duplicate groups · Y MB wasted`

**Loading state**: skeleton cards matching the group card dimensions.

**Empty state**: icon + "No duplicates found. Your knowledge base is clean!"

**Duplicate group card** (one per group):
- Sub-header: "N copies · X KB wasted"
- Table: Filename | Source | Indexed | Size | Actions
- Oldest file shows a green "Keep" badge — it is the canonical file.
- Newer files show a red "Delete" button.
- "Delete All Duplicates" button at card bottom deletes all non-canonical files in one operation.
- After deletion: removed files disappear from the card; wasted bytes update in real time.
- If only one file remains, the card is removed from the list.

---

## Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-01 | `GET /files/duplicates` returns groups with correct file membership |
| AC-02 | Duplicate groups page lists all groups returned by the API |
| AC-03 | Summary stats (group count + wasted bytes) are correct |
| AC-04 | Oldest file in each group carries the "Keep" badge; newer files show "Delete" |
| AC-05 | Clicking "Delete" on a file calls `DELETE /files/:id` and removes the row |
| AC-06 | "Delete All Duplicates" deletes all non-canonical files and removes the card when resolved |
| AC-07 | Loading skeleton is shown while the API call is in flight |
| AC-08 | Empty state is shown when `groups` array is empty |
| AC-09 | TypeScript compiles without errors on the new files |
| AC-10 | Unit tests cover: loading, render, delete, bulk-delete, empty state (≥ 5 tests) |

---

## Design Tokens

Uses the existing CSS custom property design system:
- `--color-bg-primary`, `--color-bg-secondary`, `--color-border`
- `--color-text-primary`, `--color-text-secondary`, `--color-accent`
- Badge colours: `bg-green-100 text-green-800` (Keep), `bg-red-100 text-red-800` (Delete)

---

## Out of Scope

- Semantic duplicate groups (requires separate M06 Phase 2 work)
- Resolve via "keep newest" auto-resolution
- Pagination of groups (acceptable if < 200 groups; add cursor pagination in follow-up)
