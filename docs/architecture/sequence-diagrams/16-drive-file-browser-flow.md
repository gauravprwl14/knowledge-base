# Flow: Drive File Browser Interactions

## Overview

A user navigates to the Drive page (`/drive`) to browse, filter, and manage indexed files. This diagram covers the four primary interaction flows: paginated file listing with filters, multi-select and bulk delete, tag creation and assignment, and moving files to a collection.

## Sequence Diagram

### 1. File Listing with Filters

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Frontend (Next.js)
    participant API as kms-api
    participant DB as PostgreSQL

    U->>FE: Navigate to /drive → Files tab
    FE->>API: GET /files?cursor=&limit=50
    API->>DB: SELECT * FROM kms_files WHERE user_id = ? ORDER BY created_at DESC LIMIT 51
    DB-->>API: { items: [50 files], nextCursor }
    API-->>FE: 200 { items, nextCursor, total }
    FE->>FE: Render FilesBrowser grid/list view

    Note over U,DB: Apply source filter
    U->>FE: Select source "Google Drive" in FiltersFilterPanel
    FE->>API: GET /files?sourceId=abc&cursor=&limit=50
    API->>DB: SELECT * FROM kms_files WHERE user_id = ? AND source_id = 'abc'
    DB-->>API: { items, nextCursor, total }
    API-->>FE: 200 filtered file list
    FE->>FE: Re-render FilesBrowser with filtered results

    Note over U,DB: Apply MIME type group filter
    U->>FE: Select type "Documents" in FiltersFilterPanel
    FE->>API: GET /files?mimeGroup=document&cursor=&limit=50
    API->>DB: SELECT * FROM kms_files WHERE mime_type IN ('application/pdf','application/vnd.openxmlformats...')
    DB-->>API: { items, nextCursor, total }
    API-->>FE: 200 filtered file list

    Note over U,DB: Apply status filter
    U->>FE: Select status "Indexed" in FiltersFilterPanel
    FE->>API: GET /files?status=indexed&cursor=&limit=50
    API->>DB: SELECT * FROM kms_files WHERE status = 'indexed'
    DB-->>API: { items, nextCursor, total }
    API-->>FE: 200 filtered file list

    Note over U,DB: Apply tag filter
    U->>FE: Click tag "Research" in FiltersFilterPanel
    FE->>API: GET /files?tags[]=Research&cursor=&limit=50
    API->>DB: SELECT f.* FROM kms_files f JOIN kms_file_tags ft ON f.id = ft.file_id JOIN kms_tags t ON ft.tag_id = t.id WHERE t.name = 'Research'
    DB-->>API: { items, nextCursor, total }
    API-->>FE: 200 tag-filtered file list
```

### 2. Multi-Select and Bulk Delete

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Frontend (Next.js)
    participant API as kms-api
    participant DB as PostgreSQL
    participant Q as RabbitMQ

    U->>FE: Click checkbox on FileCard → select mode activated
    FE->>FE: Show BulkActionBar (sticky bottom bar)

    U->>FE: Select 4 more FileCards (5 total selected)
    FE->>FE: BulkActionBar shows "5 selected"

    U->>FE: Click "Delete" in BulkActionBar
    FE->>FE: Show confirmation modal "Delete 5 files?"

    U->>FE: Confirm delete
    FE->>API: DELETE /files/bulk { fileIds: [id1, id2, id3, id4, id5] }
    API->>DB: UPDATE kms_files SET deleted_at = NOW() WHERE id IN (...)
    API->>DB: DELETE FROM kms_file_tags WHERE file_id IN (...)
    DB-->>API: { deleted: 5 }
    API-->>FE: 200 { deleted: 5 }
    FE->>FE: invalidate ['files'] query → remove deleted cards
    FE->>FE: Show success Toast "5 files deleted"
    FE->>FE: Clear selection, hide BulkActionBar
```

### 3. Tag Creation and Assignment

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Frontend (Next.js)
    participant API as kms-api
    participant DB as PostgreSQL

    U->>FE: Select 3 files → click "Add Tag" in BulkActionBar
    FE->>FE: Open TagPicker popover

    FE->>API: GET /tags
    API->>DB: SELECT * FROM kms_tags WHERE user_id = ? ORDER BY name
    DB-->>API: [existing tags list]
    API-->>FE: 200 [{ id, name, color, fileCount }]
    FE->>FE: Render existing tags + "+ Create new tag" option

    Note over U,DB: Path A — assign existing tag
    U->>FE: Click existing tag "Research"
    FE->>API: POST /files/bulk-tag { fileIds: [3 IDs], tagId: "tag-uuid" }
    API->>DB: INSERT INTO kms_file_tags (file_id, tag_id, source) VALUES ... ON CONFLICT DO NOTHING
    DB-->>API: { count: 3 }
    API-->>FE: 200 { tagged: 3 }
    FE->>FE: invalidate ['files'] query → FileCards show "Research" tag chip
    FE->>FE: Show success Toast "Tag applied to 3 files"

    Note over U,DB: Path B — create new tag then assign
    U->>FE: Type "Machine Learning" → click "+ Create tag"
    FE->>FE: Show color picker (6 preset hex colors)
    U->>FE: Pick color "#8b5cf6"
    FE->>API: POST /tags { name: "Machine Learning", color: "#8b5cf6" }
    API->>DB: INSERT INTO kms_tags (user_id, name, color) VALUES (...)
    Note over API,DB: Enforces max 50 tags per user at service layer
    DB-->>API: { id, name, color }
    API-->>FE: 201 { id, name, color, fileCount: 0 }
    FE->>API: POST /files/bulk-tag { fileIds: [3 IDs], tagId: "new-tag-uuid" }
    API->>DB: INSERT INTO kms_file_tags ...
    DB-->>API: { count: 3 }
    API-->>FE: 200 { tagged: 3 }
    FE->>FE: invalidate ['tags', 'files'] queries
    FE->>FE: Show success Toast "Tag created and applied to 3 files"
```

### 4. Moving Files to a Collection

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Frontend (Next.js)
    participant API as kms-api
    participant DB as PostgreSQL

    U->>FE: Select 2 files → click "Add to Collection" in BulkActionBar
    FE->>FE: Open CollectionPicker popover

    FE->>API: GET /collections
    API->>DB: SELECT * FROM kms_collections WHERE user_id = ? ORDER BY name
    DB-->>API: [collections list]
    API-->>FE: 200 [{ id, name, fileCount }]
    FE->>FE: Render existing collections + "+ New collection" option

    Note over U,DB: Path A — add to existing collection
    U->>FE: Click "Research Papers" collection
    FE->>API: POST /collections/:id/files { fileIds: [2 IDs] }
    API->>DB: INSERT INTO kms_collection_files (collection_id, file_id) VALUES ... ON CONFLICT DO NOTHING
    DB-->>API: { added: 2 }
    API-->>FE: 200 { added: 2 }
    FE->>FE: invalidate ['files', 'collections'] queries
    FE->>FE: Show success Toast "2 files added to Research Papers"

    Note over U,DB: Path B — create new collection then add
    U->>FE: Click "+ New collection", type "AI Papers"
    FE->>API: POST /collections { name: "AI Papers" }
    API->>DB: INSERT INTO kms_collections (user_id, name)
    DB-->>API: { id, name, fileCount: 0 }
    API-->>FE: 201 { id, name, fileCount: 0 }
    FE->>API: POST /collections/:newId/files { fileIds: [2 IDs] }
    API->>DB: INSERT INTO kms_collection_files ...
    DB-->>API: { added: 2 }
    API-->>FE: 200 { added: 2 }
    FE->>FE: invalidate ['files', 'collections'] queries
    FE->>FE: Show success Toast "Collection created with 2 files"
```

## Error Flows

| Step | Failure | Handling |
|------|---------|----------|
| GET /files | DB timeout | 500 returned; UI shows error state with retry button |
| Bulk delete — partial | Some files already deleted | API skips missing IDs; returns `{ deleted: N }` with actual count |
| POST /tags — limit exceeded | User already has 50 tags | 422 KBFIL0010; UI shows inline error "Tag limit reached (50/50)" |
| POST /files/bulk-tag — tag not found | Tag deleted concurrently | 404 KBFIL0011; TagPicker refreshes tag list |
| POST /collections/:id/files — collection not found | Collection deleted concurrently | 404; CollectionPicker refreshes collection list |

## Dependencies

- `kms-api`: `FilesController`, `TagsController`, `CollectionsController`
- `PostgreSQL`: `kms_files`, `kms_tags`, `kms_file_tags`, `kms_collections`, `kms_collection_files`
- `Frontend`: `FilesBrowser`, `FiltersFilterPanel`, `FileCard`, `BulkActionBar`, `TagPicker`, `CollectionPicker`
- `TanStack Query`: cache invalidation via `queryClient.invalidateQueries(['files'])`, `['tags']`, `['collections']`
