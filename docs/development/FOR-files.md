# FOR-files.md — Files Module

## 1. Business Use Case

The Files module exposes the user-facing REST API for querying and managing KMS files — documents that have been discovered by the scan-worker and processed by the embed-worker. It solves the discoverability and management problem: users need to see what has been ingested, filter by source or status, delete stale content, and organise files into collections. All operations enforce multi-tenant isolation (`userId` scoping at the repository layer) so cross-user access is structurally impossible. The module also owns scan lifecycle endpoints (`POST /sources/:id/scan`, `GET /sources/:id/scan-history`) and an internal worker callback (`PATCH /scan-jobs/:id/status`) used by the Python scan-worker to report job transitions.

---

## 2. Flow Diagram

```mermaid
sequenceDiagram
    participant Client
    participant FC as FilesController<br/>(kms-api :3000)
    participant FS as FilesService
    participant FR as FileRepository
    participant DB as PostgreSQL<br/>(kms_files)

    Client->>FC: GET /files?cursor=&limit=20&sourceId=... (JWT)
    FC->>FS: listFiles({ userId, cursor, limit, ... })
    FS->>FR: listFiles(params)
    FR->>DB: SELECT + WHERE userId + filters + cursor ORDER
    DB-->>FR: file rows + nextCursor
    FR-->>FS: FilesPage
    FS-->>FC: FilesPage
    FC-->>Client: 200 OK { files[], nextCursor }

    Client->>FC: DELETE /files/:id (JWT)
    FC->>FS: deleteFile(id, userId)
    FS->>FR: findByIdAndUserId(id, userId)
    FR->>DB: SELECT WHERE id=$1 AND userId=$2
    DB-->>FR: file | null
    alt file not found or wrong user
        FS-->>FC: throws AppError(FIL0001)
        FC-->>Client: 404 Not Found
    else owned file
        FS->>FR: deleteById(id)
        FR->>DB: DELETE CASCADE
        FC-->>Client: 200 { deleted: true }
    end

    ScanWorker->>ScanJobsController: PATCH /scan-jobs/:id/status\n{ status: "COMPLETED" }
    ScanJobsController->>ScanJobRepository: update({ id }, { status, finishedAt, ... })
```

---

## 3. Code Structure

| File | Responsibility |
|------|---------------|
| `kms-api/src/modules/files/files.controller.ts` | HTTP endpoints for list, get-one, delete, bulk-delete, bulk-move, legacy tag update |
| `kms-api/src/modules/files/files.service.ts` | Business logic — listFiles, findOne, deleteFile, bulkDeleteFiles, bulkMoveFiles, triggerScan, getScanHistory |
| `kms-api/src/modules/files/scan.controller.ts` | `POST /sources/:sourceId/scan` and `GET /sources/:sourceId/scan-history` |
| `kms-api/src/modules/files/scan-jobs.controller.ts` | Internal `PATCH /scan-jobs/:id/status` — called by Python scan-worker |
| `kms-api/src/database/repositories/file.repository.ts` | All Prisma calls for `kms_files` (list with cursor pagination, findByIdAndUserId, deleteById, bulkDelete, bulkMoveToCollection) |
| `kms-api/src/modules/files/dto/` | `ListFilesQueryDto`, `ListFilesResponseDto`, `BulkDeleteDto`, `BulkMoveDto` |

> **Warning — merge conflict**: `files.controller.ts` currently has unresolved Git conflict markers (`<<<< HEAD` / `>>>> feat/drive-backend`). The file must be resolved before the TypeScript compiler can process it. This is a Gate 8 blocker.

---

## 4. Key Methods

| Method | Class | Description |
|--------|-------|-------------|
| `listFiles(params)` | `FilesService` | Cursor-paginated file list with optional filters (sourceId, mimeGroup, status, collectionId, tags, search) |
| `findOne(id, userId)` | `FilesService` | Returns one file; throws `FIL0001` (404) if not found or cross-user |
| `deleteFile(id, userId)` | `FilesService` | Verifies ownership, then hard-deletes; cascade removes chunks, collection memberships, file-tag rows |
| `bulkDeleteFiles(ids, userId)` | `FilesService` | Deletes up to 100 files in one query; foreign IDs silently ignored |
| `bulkMoveFiles(fileIds, collectionId, userId)` | `FilesService` | Upserts up to 100 collection-file join rows |
| `triggerScan(sourceId, userId, scanType)` | `FilesService` | Creates a `KmsScanJob` and publishes to `kms.scan` queue via `ScanJobPublisher` |
| `getScanHistory(sourceId, userId)` | `FilesService` | Returns all past `KmsScanJob` rows for a source, newest-first |
| `listFiles(params)` | `FileRepository` | Raw Prisma query with cursor, filter, and tag JOIN |
| `findByIdAndUserId(id, userId)` | `FileRepository` | Ownership-scoped lookup; returns `null` for foreign files |
| `bulkDelete(ids, userId)` | `FileRepository` | `DELETE WHERE id IN (...) AND userId = $1` |
| `bulkMoveToCollection(fileIds, collectionId, userId)` | `FileRepository` | `INSERT ... ON CONFLICT DO NOTHING` into `kms_collection_files` |

---

## 5. Error Cases

| Error Code | HTTP Status | Description | Handling |
|------------|-------------|-------------|---------|
| `FIL0001` (FILE_NOT_FOUND) | 404 | File not found or belongs to a different user | Thrown by `findOne`, `deleteFile` |
| `GEN0002` (NOT_IMPLEMENTED) | 501 | Legacy `updateTags` endpoint stub | Throws until TagsModule is fully integrated |
| `DAT0000` (NOT_FOUND) | 404 | Source not found when triggering a scan | Thrown by `triggerScan` if source doesn't exist |
| `SRV0004` (QUEUE_ERROR) | 500 | RabbitMQ channel not available when publishing scan job | Thrown by `ScanJobPublisher.publishScanJob` |
| `VAL*` | 400 | DTO validation failure (invalid UUID, missing fields) | Handled by global validation pipe |

---

## 6. Configuration

| Env Var / Constant | Description | Default |
|--------------------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection used by PrismaService | required |
| `RABBITMQ_URL` | AMQP connection for `ScanJobPublisher` | `amqp://guest:guest@rabbitmq:5672/` |
| Max bulk operation size | Hard limit of 100 IDs for bulk-delete and bulk-move | 100 (enforced in DTO validators) |
| Default page size | `limit` query param default for `listFiles` | 20 |

> **Merge conflict blocker**: `files.controller.ts` has unresolved conflict markers from `feat/drive-backend`. Resolve before running `npm run build` or the TypeScript compiler will fail.
