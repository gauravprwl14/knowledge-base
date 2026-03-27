# Sources Endpoints

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

Sources represent connected data origins (Google Drive, local filesystem, etc.). The Sources API allows managing these connections and initiating scans.

---

## Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sources` | List all sources |
| POST | `/sources` | Connect a new source |
| GET | `/sources/{id}` | Get source details |
| PATCH | `/sources/{id}` | Update source settings |
| DELETE | `/sources/{id}` | Disconnect source |
| POST | `/sources/{id}/scan` | Trigger manual scan |
| GET | `/sources/{id}/scan-jobs` | List scan jobs |

---

## List Sources

Get all connected sources for the current user.

```http
GET /api/v1/sources
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Filter by source type (google_drive, local_fs) |
| `status` | string | Filter by status (active, syncing, error, disconnected) |
| `limit` | integer | Results per page (default: 20, max: 100) |
| `cursor` | string | Pagination cursor |

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "src_abc123",
      "name": "Work Google Drive",
      "type": "google_drive",
      "status": "active",
      "root_path": "/",
      "config": {
        "include_shared": true,
        "include_trash": false
      },
      "stats": {
        "files_indexed": 1250,
        "total_size_bytes": 5368709120,
        "last_scan_at": "2026-01-07T08:00:00Z",
        "last_scan_duration_seconds": 120
      },
      "created_at": "2026-01-01T10:00:00Z",
      "updated_at": "2026-01-07T08:02:00Z"
    }
  ],
  "pagination": {
    "total": 3,
    "limit": 20,
    "has_more": false
  }
}
```

---

## Connect Source

Connect a new data source.

```http
POST /api/v1/sources
Authorization: Bearer <token>
Content-Type: application/json
```

### Google Drive

**Request Body:**

```json
{
  "name": "Personal Drive",
  "type": "google_drive",
  "config": {
    "oauth_code": "4/0AX4XfWj...",
    "root_folder_id": "root",
    "include_shared": true,
    "include_trash": false,
    "scan_schedule": "0 */6 * * *"
  }
}
```

### Local Filesystem

**Request Body:**

```json
{
  "name": "Documents Folder",
  "type": "local_fs",
  "config": {
    "root_path": "/Users/john/Documents",
    "include_hidden": false,
    "follow_symlinks": false,
    "exclude_patterns": ["node_modules", ".git", "*.log"],
    "scan_schedule": "0 0 * * *"
  }
}
```

**Response:** `201 Created`

```json
{
  "id": "src_xyz789",
  "name": "Personal Drive",
  "type": "google_drive",
  "status": "syncing",
  "root_path": "/",
  "config": {
    "include_shared": true,
    "include_trash": false,
    "scan_schedule": "0 */6 * * *"
  },
  "stats": {
    "files_indexed": 0,
    "total_size_bytes": 0,
    "last_scan_at": null
  },
  "created_at": "2026-01-07T10:00:00Z"
}
```

---

## Get Source

Get details of a specific source.

```http
GET /api/v1/sources/{source_id}
Authorization: Bearer <token>
```

**Response:** `200 OK`

```json
{
  "id": "src_abc123",
  "name": "Work Google Drive",
  "type": "google_drive",
  "status": "active",
  "root_path": "/",
  "config": {
    "root_folder_id": "root",
    "include_shared": true,
    "include_trash": false,
    "scan_schedule": "0 */6 * * *"
  },
  "stats": {
    "files_indexed": 1250,
    "files_pending": 0,
    "files_failed": 3,
    "total_size_bytes": 5368709120,
    "last_scan_at": "2026-01-07T08:00:00Z",
    "last_scan_duration_seconds": 120,
    "next_scan_at": "2026-01-07T14:00:00Z"
  },
  "health": {
    "status": "healthy",
    "last_check_at": "2026-01-07T10:00:00Z",
    "error_message": null
  },
  "created_at": "2026-01-01T10:00:00Z",
  "updated_at": "2026-01-07T08:02:00Z"
}
```

---

## Update Source

Update source settings.

```http
PATCH /api/v1/sources/{source_id}
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "Updated Name",
  "config": {
    "include_shared": false,
    "scan_schedule": "0 0 * * *"
  }
}
```

**Response:** `200 OK`

Returns updated source object.

---

## Disconnect Source

Disconnect and remove a source. Files remain in index but won't be updated.

```http
DELETE /api/v1/sources/{source_id}
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `delete_files` | boolean | Also delete indexed files (default: false) |

**Response:** `204 No Content`

---

## Trigger Scan

Manually trigger a source scan.

```http
POST /api/v1/sources/{source_id}/scan
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body (optional):**

```json
{
  "full_scan": false,
  "path": "/specific/folder"
}
```

**Response:** `202 Accepted`

```json
{
  "scan_job_id": "scj_abc123",
  "source_id": "src_abc123",
  "type": "incremental",
  "status": "pending",
  "created_at": "2026-01-07T10:00:00Z"
}
```

---

## List Scan Jobs

Get scan job history for a source.

```http
GET /api/v1/sources/{source_id}/scan-jobs
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status |
| `limit` | integer | Results per page |
| `cursor` | string | Pagination cursor |

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "scj_abc123",
      "source_id": "src_abc123",
      "type": "incremental",
      "status": "completed",
      "stats": {
        "files_discovered": 50,
        "files_added": 10,
        "files_updated": 5,
        "files_deleted": 2,
        "errors": 0
      },
      "started_at": "2026-01-07T08:00:00Z",
      "completed_at": "2026-01-07T08:02:00Z",
      "duration_seconds": 120
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 20,
    "has_more": true,
    "next_cursor": "eyJpZCI6MTAwfQ=="
  }
}
```

---

## Schemas

### Source

```typescript
interface Source {
  id: string;
  name: string;
  type: SourceType;
  status: SourceStatus;
  root_path: string;
  config: SourceConfig;
  stats: SourceStats;
  health?: SourceHealth;
  created_at: string;
  updated_at: string;
}

type SourceType = "google_drive" | "local_fs" | "onedrive" | "dropbox";

type SourceStatus = "active" | "syncing" | "error" | "disconnected" | "paused";

interface SourceStats {
  files_indexed: number;
  files_pending?: number;
  files_failed?: number;
  total_size_bytes: number;
  last_scan_at: string | null;
  last_scan_duration_seconds?: number;
  next_scan_at?: string;
}

interface SourceHealth {
  status: "healthy" | "degraded" | "unhealthy";
  last_check_at: string;
  error_message: string | null;
}
```

### Source Config

```typescript
interface GoogleDriveConfig {
  root_folder_id: string;
  include_shared: boolean;
  include_trash: boolean;
  scan_schedule: string;  // Cron expression
}

interface LocalFsConfig {
  root_path: string;
  include_hidden: boolean;
  follow_symlinks: boolean;
  exclude_patterns: string[];
  scan_schedule: string;
}
```

### Scan Job

```typescript
interface ScanJob {
  id: string;
  source_id: string;
  type: "full" | "incremental";
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  stats?: ScanStats;
  error_message?: string;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds?: number;
  created_at: string;
}

interface ScanStats {
  files_discovered: number;
  files_added: number;
  files_updated: number;
  files_deleted: number;
  errors: number;
}
```

---

## Source Types

| Type | Description | OAuth Required |
|------|-------------|----------------|
| `google_drive` | Google Drive account | Yes |
| `local_fs` | Local filesystem path | No |
| `onedrive` | Microsoft OneDrive | Yes (planned) |
| `dropbox` | Dropbox account | Yes (planned) |

---

## Error Codes

| Code | Description |
|------|-------------|
| `SOURCE_NOT_FOUND` | Source doesn't exist |
| `SOURCE_ALREADY_EXISTS` | Duplicate source connection |
| `OAUTH_FAILED` | OAuth flow failed |
| `INVALID_PATH` | Invalid filesystem path |
| `PERMISSION_DENIED` | Cannot access path |
| `SCAN_IN_PROGRESS` | Another scan is running |
| `QUOTA_EXCEEDED` | Source quota exceeded |

