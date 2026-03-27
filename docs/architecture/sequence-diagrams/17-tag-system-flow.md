# Flow: Tag System Lifecycle

## Overview

The tag system supports two tag sources: manual tags created by users via the UI, and AI tags written by the workflow engine via the `kms_classify` tool (M14 agentic workflow). Both share the same `kms_tags` / `kms_file_tags` schema with a `source` discriminator. This diagram covers the full tag lifecycle: create, AI auto-tag, filter, remove from files, and delete.

## Sequence Diagrams

### 1. Create Tag (Manual)

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Frontend (Next.js)
    participant API as kms-api
    participant DB as PostgreSQL

    U->>FE: Navigate to /tags → click "+ New Tag"
    FE->>FE: Open CreateTagModal
    U->>FE: Enter name="Research", pick color="#6366f1"
    FE->>API: POST /tags { name: "Research", color: "#6366f1" }
    API->>API: Validate: name non-empty, color is valid hex
    API->>DB: SELECT COUNT(*) FROM kms_tags WHERE user_id = ?
    DB-->>API: { count: 12 }
    Note over API,DB: count < 50 — proceed
    API->>DB: INSERT INTO kms_tags (user_id, name, color) VALUES (...)
    DB-->>API: { id: "tag-uuid", name: "Research", color: "#6366f1" }
    API-->>FE: 201 { id, name, color, fileCount: 0 }
    FE->>FE: invalidate ['tags'] query → tag appears in list
    FE->>FE: Show success Toast "Tag 'Research' created"
```

### 2. AI Auto-Tagging via kms_classify Tool (M14 Agentic Workflow)

```mermaid
sequenceDiagram
    autonumber
    participant WE as Workflow Engine (kms-api)
    participant Anthropic as Anthropic Claude
    participant API as kms-api (internal)
    participant DB as PostgreSQL

    Note over WE,DB: Triggered after file embedding completes
    WE->>WE: AcpService receives file.embedded event
    WE->>Anthropic: messages.create { tools: [kms_classify], content: file.extractedText }

    Anthropic-->>WE: tool_use { name: "kms_classify", input: { tags: ["machine-learning", "research"] } }

    loop For each AI-suggested tag
        WE->>API: POST /tags { name: "machine-learning", color: "#8b5cf6" }
        Note over WE,API: Idempotent — skips if tag already exists (upsert)
        API->>DB: INSERT INTO kms_tags (user_id, name, color) ON CONFLICT (user_id, name) DO NOTHING RETURNING id
        DB-->>API: { id } (existing or new)
        API-->>WE: { id, name }
    end

    WE->>API: POST /files/:fileId/tags { tagIds: [...], source: "ai" }
    API->>DB: INSERT INTO kms_file_tags (file_id, tag_id, source) VALUES ... ON CONFLICT DO NOTHING
    DB-->>API: { count: 2 }
    API-->>WE: 200 { tagged: 2 }
    Note over WE,DB: AI tags appear in FileCard with "AI" badge indicator
```

### 3. Filter Files by Tag

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Frontend (Next.js)
    participant API as kms-api
    participant DB as PostgreSQL

    Note over U,DB: Single tag filter
    U->>FE: Click "Research" tag chip in FiltersFilterPanel
    FE->>FE: Add tag to active filters
    FE->>API: GET /files?tags[]=Research&cursor=&limit=50
    API->>DB: SELECT DISTINCT f.* FROM kms_files f JOIN kms_file_tags ft ON f.id = ft.file_id JOIN kms_tags t ON ft.tag_id = t.id WHERE f.user_id = ? AND t.name IN ('Research') ORDER BY f.created_at DESC LIMIT 51
    DB-->>API: { items: [N files], nextCursor }
    API-->>FE: 200 { items, nextCursor, total }
    FE->>FE: Render filtered file grid — tag chip highlighted in FilterPanel

    Note over U,DB: Multi-tag filter (AND semantics)
    U->>FE: Also click "Machine Learning" tag chip
    FE->>API: GET /files?tags[]=Research&tags[]=Machine+Learning&cursor=&limit=50
    API->>DB: SELECT f.* FROM kms_files f WHERE f.user_id = ? AND (SELECT COUNT(DISTINCT t.name) FROM kms_file_tags ft JOIN kms_tags t ON ft.tag_id = t.id WHERE ft.file_id = f.id AND t.name IN ('Research', 'Machine Learning')) = 2 LIMIT 51
    DB-->>API: { items: [files with BOTH tags], nextCursor }
    API-->>FE: 200 narrowed file list

    Note over U,DB: Clear tag filter
    U->>FE: Click "x" on "Research" tag chip
    FE->>API: GET /files?tags[]=Machine+Learning&cursor=&limit=50
    API-->>FE: 200 { items, nextCursor, total }
```

### 4. Remove Tag from Files

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Frontend (Next.js)
    participant API as kms-api
    participant DB as PostgreSQL

    Note over U,DB: Remove tag from single file (via FileCard)
    U->>FE: Hover FileCard → click "x" on "Research" tag chip
    FE->>API: DELETE /files/:fileId/tags/:tagId
    API->>DB: DELETE FROM kms_file_tags WHERE file_id = ? AND tag_id = ?
    DB-->>API: { deleted: 1 }
    API-->>FE: 200 { removed: 1 }
    FE->>FE: invalidate ['files'] query → tag chip removed from FileCard

    Note over U,DB: Bulk remove tag from multiple files
    U->>FE: Select 4 files → click "Remove Tag" in BulkActionBar → pick "Research"
    FE->>API: DELETE /files/bulk-tag { fileIds: [4 IDs], tagId: "tag-uuid" }
    API->>DB: DELETE FROM kms_file_tags WHERE file_id IN (...) AND tag_id = ?
    DB-->>API: { deleted: 4 }
    API-->>FE: 200 { removed: 4 }
    FE->>FE: invalidate ['files'] query → tag chips removed
    FE->>FE: Show success Toast "Tag removed from 4 files"
```

### 5. Delete Tag (Cascade)

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Frontend (Next.js)
    participant API as kms-api
    participant DB as PostgreSQL

    U->>FE: Navigate to /tags → click "..." on "Research" tag → "Delete"
    FE->>FE: Show confirmation modal "Delete 'Research'? This will remove it from 23 files."
    U->>FE: Confirm delete

    FE->>API: DELETE /tags/:tagId
    API->>DB: BEGIN TRANSACTION
    API->>DB: DELETE FROM kms_file_tags WHERE tag_id = ?
    Note over API,DB: Cascade removes all file associations
    DB-->>API: { deleted: 23 }
    API->>DB: DELETE FROM kms_tags WHERE id = ? AND user_id = ?
    DB-->>API: { deleted: 1 }
    API->>DB: COMMIT
    API-->>FE: 200 { tagDeleted: true, fileAssociationsRemoved: 23 }

    FE->>FE: invalidate ['tags', 'files'] queries
    FE->>FE: Tag removed from /tags page + all FileCard tag chips
    FE->>FE: Show success Toast "Tag 'Research' deleted"
```

## Error Flows

| Step | Failure | Handling |
|------|---------|----------|
| POST /tags — limit exceeded | User has 50 tags | 422 KBFIL0010; UI shows "Tag limit reached (50/50)" inline error |
| POST /tags — duplicate name | Tag with same name exists | 409 KBFIL0012; UI shows "Tag name already exists" inline error |
| kms_classify — tag limit | AI tags would exceed 50 | Workflow skips new tag creation; logs warning via structlog |
| DELETE /tags/:id — not found | Tag deleted concurrently | 404 KBFIL0011; /tags page refreshes silently |
| DELETE /tags/:id — wrong user | Tag belongs to other user | 403 KBGEN0003; never surfaces in UI (defensive guard) |
| Transaction failure on delete | DB error mid-cascade | Full rollback; 500 returned; file_tags intact |

## Dependencies

- `kms-api`: `TagsController`, `TagsService`, `FilesController`
- `PostgreSQL`: `kms_tags (id, user_id, name, color)`, `kms_file_tags (file_id, tag_id, source)`
- `Frontend`: `TagPicker`, `FiltersFilterPanel`, `FileCard`, `BulkActionBar`, `/tags` page
- `Workflow Engine` (M14): `kms_classify` Anthropic tool, `AcpService`
- `TanStack Query`: invalidations on `['tags']` and `['files']` after every mutation
