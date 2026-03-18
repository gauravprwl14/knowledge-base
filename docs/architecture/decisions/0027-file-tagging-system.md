---
id: adr-0027-file-tagging-system
created_at: 2026-03-18T00:00:00Z
content_type: adr
status: current
generator_model: claude-sonnet-4-6
---

# ADR-0027: File Tagging System

## Status: Accepted

## Context

Users need a way to organise files beyond the collection system. Collections are coarse-grained — a file belongs to one collection at a time, and collections are manually curated. There is no mechanism for cross-cutting labels that span multiple collections or for lightweight annotation without moving files.

Additionally, the M14 agentic workflow requires the ability to classify files automatically using an LLM (`kms_classify` tool). These AI-generated classifications should be stored alongside user-created tags in a unified model, with a clear audit trail distinguishing their origin.

Two alternatives were considered:

1. **Freeform text labels on `kms_files`** — simple but no colour, no list API, no efficient filtering with indices, no tag-level operations (delete tag → remove from all files).
2. **Separate `kms_tags` table with many-to-many junction** — normalised, supports tag-level CRUD, efficient JOIN-based filtering, and a `source` discriminator column cleanly separates manual from AI tags.

## Decision

Implement a dual-source tagging system:

### 1. Manual tags — created by users via UI

Users create tags (name + hex colour) through `TagPicker` or the `/tags` management page. Tags are applied to files individually or in bulk through `BulkActionBar`.

### 2. AI tags — written by workflow engine

The M14 agentic workflow calls the `kms_classify` Anthropic tool after a file is embedded. The tool returns a list of suggested tag names. The workflow engine creates tags (if they do not already exist) and inserts `kms_file_tags` rows with `source = 'ai'`.

### Database Schema

```sql
-- User-scoped tag catalogue
CREATE TABLE kms_tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  name       VARCHAR(50) NOT NULL,
  color      VARCHAR(7) NOT NULL,           -- hex color e.g. '#6366f1'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

-- Many-to-many with audit source
CREATE TABLE kms_file_tags (
  file_id    UUID NOT NULL REFERENCES kms_files(id) ON DELETE CASCADE,
  tag_id     UUID NOT NULL REFERENCES kms_tags(id) ON DELETE CASCADE,
  source     VARCHAR(10) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (file_id, tag_id)
);

CREATE INDEX idx_kms_file_tags_tag_id ON kms_file_tags(tag_id);
CREATE INDEX idx_kms_file_tags_file_id ON kms_file_tags(file_id);
```

### Business Rules

- Tags are user-scoped: `UNIQUE (user_id, name)` prevents duplicate names per user; different users may have tags with the same name.
- Maximum 50 tags per user enforced at service layer (`TagsService.create()`) before any INSERT.
- AI tag creation is idempotent: `INSERT ... ON CONFLICT (user_id, name) DO NOTHING RETURNING id`.
- Deleting a tag cascades to `kms_file_tags` via `ON DELETE CASCADE` — no orphaned associations.
- The `source` discriminator enables the UI to render AI-sourced tags with a visual indicator (sparkle badge) and allows future analytics on AI vs. manual annotation coverage.

### API Surface

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/tags` | List user's tags with computed `fileCount` |
| `POST` | `/tags` | Create tag `{ name, color }` — enforces 50-tag limit |
| `DELETE` | `/tags/:id` | Delete tag + cascade kms_file_tags |
| `POST` | `/files/bulk-tag` | Apply tag to N files `{ fileIds, tagId }` |
| `DELETE` | `/files/bulk-tag` | Remove tag from N files `{ fileIds, tagId }` |

## Consequences

### Positive

- Tags are user-scoped — no cross-user contamination possible at the data model level.
- Manual and AI tags are unified in the same tables, simplifying query logic (no union required).
- The `source` discriminator enables AI-vs-manual reporting and targeted cleanup.
- Cascade delete on tag ensures referential integrity without application-level cleanup logic.
- `UNIQUE (user_id, name)` prevents duplicate tags and makes AI-tag creation safely idempotent.

### Negative / Trade-offs

- The 50-tag limit is enforced in the service layer, not the database. A race condition (two concurrent requests, both under the limit) could briefly exceed 50. Acceptable for MVP; can add a DB-level trigger or advisory lock if required.
- `fileCount` is a computed aggregate, not a materialised column. Queries that list tags must JOIN or use a subquery. Performance is acceptable at current scale (< 10k files per user); a materialised counter can be added later via a Prisma `_count` include.
- AI tags are created using the user's quota. If the LLM is aggressive, it can consume the 50-tag limit. Mitigation: the workflow engine skips tag creation when the user is at or near the limit, logging a warning.

## Related

- [ADR-0013](./0013-orchestrator-pattern.md) — Custom NestJS Orchestrator + LangGraph (M14 workflow engine context)
- `docs/architecture/sequence-diagrams/17-tag-system-flow.md` — full lifecycle sequence diagrams
- `docs/prd/PRD-M11-web-ui.md` — Sprint 4 tag system requirements
