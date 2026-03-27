# Duplicates Endpoints

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The Duplicates API provides access to detected duplicate files and duplicate groups, allowing users to review and manage duplicates.

---

## Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/duplicates/groups` | List duplicate groups |
| GET | `/duplicates/groups/{id}` | Get group details |
| POST | `/duplicates/groups/{id}/resolve` | Resolve a duplicate group |
| DELETE | `/duplicates/groups/{id}` | Dismiss group (mark reviewed) |
| GET | `/duplicates/stats` | Get duplicate statistics |
| POST | `/duplicates/scan` | Trigger duplicate scan |
| GET | `/duplicates/files/{id}/similar` | Find similar files |

---

## List Duplicate Groups

Get all detected duplicate groups.

```http
GET /api/v1/duplicates/groups
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Filter by match type (exact, near_duplicate, similar) |
| `status` | string | Filter by status (pending, resolved, dismissed) |
| `source_id` | uuid | Filter by source |
| `min_confidence` | float | Minimum confidence score |
| `min_files` | integer | Minimum files in group |
| `sort_by` | string | Sort field (confidence, file_count, total_size) |
| `sort_order` | string | asc or desc |
| `limit` | integer | Results per page |
| `cursor` | string | Pagination cursor |

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "grp_abc123",
      "type": "exact",
      "status": "pending",
      "confidence": 1.0,
      "file_count": 3,
      "total_size_bytes": 6291456,
      "potential_savings_bytes": 4194304,
      "primary_file": {
        "id": "file_xyz789",
        "name": "report.pdf",
        "path": "/documents/report.pdf",
        "source_id": "src_abc123"
      },
      "sample_duplicates": [
        {
          "id": "file_def456",
          "name": "report (1).pdf",
          "path": "/downloads/report (1).pdf"
        }
      ],
      "detected_at": "2026-01-07T10:00:00Z",
      "created_at": "2026-01-07T10:00:00Z"
    },
    {
      "id": "grp_def456",
      "type": "near_duplicate",
      "status": "pending",
      "confidence": 0.97,
      "file_count": 2,
      "total_size_bytes": 4194304,
      "potential_savings_bytes": 2097152,
      "primary_file": {
        "id": "file_ghi789",
        "name": "proposal-v2.docx",
        "path": "/documents/proposal-v2.docx",
        "source_id": "src_abc123"
      },
      "sample_duplicates": [
        {
          "id": "file_jkl012",
          "name": "proposal-v1.docx",
          "path": "/archive/proposal-v1.docx"
        }
      ],
      "detected_at": "2026-01-07T09:30:00Z",
      "created_at": "2026-01-07T09:30:00Z"
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 20,
    "has_more": true,
    "next_cursor": "eyJpZCI6MjB9"
  }
}
```

---

## Get Duplicate Group

Get detailed information about a duplicate group.

```http
GET /api/v1/duplicates/groups/{group_id}
Authorization: Bearer <token>
```

**Response:** `200 OK`

```json
{
  "id": "grp_abc123",
  "type": "exact",
  "status": "pending",
  "confidence": 1.0,
  "detection_method": "hash_sha256",
  "file_count": 3,
  "total_size_bytes": 6291456,
  "potential_savings_bytes": 4194304,
  "primary_file": {
    "id": "file_xyz789",
    "name": "report.pdf",
    "path": "/documents/report.pdf",
    "mime_type": "application/pdf",
    "size_bytes": 2097152,
    "source_id": "src_abc123",
    "source_name": "Work Drive",
    "hash_sha256": "e3b0c44298fc1c149afbf4c8996fb924...",
    "created_at": "2026-01-01T10:00:00Z",
    "modified_at": "2026-01-05T14:30:00Z"
  },
  "files": [
    {
      "id": "file_xyz789",
      "name": "report.pdf",
      "path": "/documents/report.pdf",
      "mime_type": "application/pdf",
      "size_bytes": 2097152,
      "source_id": "src_abc123",
      "source_name": "Work Drive",
      "is_primary": true,
      "similarity_score": 1.0,
      "created_at": "2026-01-01T10:00:00Z",
      "modified_at": "2026-01-05T14:30:00Z"
    },
    {
      "id": "file_def456",
      "name": "report (1).pdf",
      "path": "/downloads/report (1).pdf",
      "mime_type": "application/pdf",
      "size_bytes": 2097152,
      "source_id": "src_abc123",
      "source_name": "Work Drive",
      "is_primary": false,
      "similarity_score": 1.0,
      "created_at": "2026-01-03T11:00:00Z",
      "modified_at": "2026-01-03T11:00:00Z"
    },
    {
      "id": "file_ghi789",
      "name": "report-backup.pdf",
      "path": "/backup/report-backup.pdf",
      "mime_type": "application/pdf",
      "size_bytes": 2097152,
      "source_id": "src_def456",
      "source_name": "Personal Drive",
      "is_primary": false,
      "similarity_score": 1.0,
      "created_at": "2026-01-04T09:00:00Z",
      "modified_at": "2026-01-04T09:00:00Z"
    }
  ],
  "comparison": {
    "matching_content_percent": 100,
    "differences": null
  },
  "recommendations": [
    {
      "action": "keep",
      "file_id": "file_xyz789",
      "reason": "Original file in primary location"
    },
    {
      "action": "delete",
      "file_id": "file_def456",
      "reason": "Copy with numbered suffix"
    },
    {
      "action": "delete",
      "file_id": "file_ghi789",
      "reason": "Backup copy"
    }
  ],
  "detected_at": "2026-01-07T10:00:00Z",
  "created_at": "2026-01-07T10:00:00Z",
  "updated_at": "2026-01-07T10:00:00Z"
}
```

---

## Resolve Duplicate Group

Apply a resolution action to a duplicate group.

```http
POST /api/v1/duplicates/groups/{group_id}/resolve
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "action": "keep_primary",
  "keep_file_id": "file_xyz789",
  "delete_file_ids": ["file_def456", "file_ghi789"],
  "permanent_delete": false
}
```

**Actions:**

| Action | Description |
|--------|-------------|
| `keep_primary` | Keep primary, delete duplicates |
| `keep_newest` | Keep newest, delete others |
| `keep_oldest` | Keep oldest, delete others |
| `keep_specific` | Keep specified file, delete others |
| `merge` | Merge metadata, keep one file |

**Response:** `200 OK`

```json
{
  "id": "grp_abc123",
  "status": "resolved",
  "resolution": {
    "action": "keep_primary",
    "kept_file_id": "file_xyz789",
    "deleted_file_ids": ["file_def456", "file_ghi789"],
    "space_freed_bytes": 4194304,
    "resolved_at": "2026-01-07T11:00:00Z",
    "resolved_by": "usr_abc123"
  }
}
```

---

## Dismiss Group

Mark a duplicate group as reviewed without taking action.

```http
DELETE /api/v1/duplicates/groups/{group_id}
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `reason` | string | Dismissal reason (optional) |

**Response:** `204 No Content`

---

## Duplicate Statistics

Get aggregate duplicate statistics.

```http
GET /api/v1/duplicates/stats
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `source_id` | uuid | Filter by source |

**Response:** `200 OK`

```json
{
  "summary": {
    "total_groups": 125,
    "total_duplicate_files": 350,
    "total_wasted_bytes": 2147483648,
    "potential_savings_percent": 15.5
  },
  "by_type": {
    "exact": {
      "groups": 45,
      "files": 120,
      "wasted_bytes": 1073741824
    },
    "near_duplicate": {
      "groups": 50,
      "files": 140,
      "wasted_bytes": 805306368
    },
    "similar": {
      "groups": 30,
      "files": 90,
      "wasted_bytes": 268435456
    }
  },
  "by_status": {
    "pending": 100,
    "resolved": 20,
    "dismissed": 5
  },
  "by_source": [
    {
      "source_id": "src_abc123",
      "source_name": "Work Drive",
      "groups": 80,
      "wasted_bytes": 1610612736
    },
    {
      "source_id": "src_def456",
      "source_name": "Personal Drive",
      "groups": 45,
      "wasted_bytes": 536870912
    }
  ],
  "trend": {
    "last_7_days": {
      "new_groups": 15,
      "resolved_groups": 8
    }
  }
}
```

---

## Trigger Duplicate Scan

Manually trigger a duplicate detection scan.

```http
POST /api/v1/duplicates/scan
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "source_ids": ["src_abc123"],
  "types": ["exact", "semantic"],
  "full_scan": false
}
```

**Response:** `202 Accepted`

```json
{
  "scan_id": "dscan_abc123",
  "status": "pending",
  "types": ["exact", "semantic"],
  "source_ids": ["src_abc123"],
  "created_at": "2026-01-07T11:00:00Z"
}
```

---

## Find Similar Files

Find files similar to a specific file.

```http
GET /api/v1/duplicates/files/{file_id}/similar
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `min_similarity` | float | Minimum similarity score (default: 0.85) |
| `limit` | integer | Max results (default: 20) |

**Response:** `200 OK`

```json
{
  "file_id": "file_abc123",
  "file_name": "report.pdf",
  "similar_files": [
    {
      "file": {
        "id": "file_def456",
        "name": "report-draft.pdf",
        "path": "/drafts/report-draft.pdf",
        "size_bytes": 1997152,
        "source_id": "src_abc123"
      },
      "similarity_score": 0.96,
      "match_type": "near_duplicate",
      "comparison": {
        "content_overlap_percent": 95,
        "size_difference_bytes": -100000
      }
    },
    {
      "file": {
        "id": "file_ghi789",
        "name": "quarterly-analysis.pdf",
        "path": "/reports/quarterly-analysis.pdf",
        "size_bytes": 2500000,
        "source_id": "src_abc123"
      },
      "similarity_score": 0.87,
      "match_type": "similar",
      "comparison": {
        "content_overlap_percent": 72,
        "size_difference_bytes": 402848
      }
    }
  ]
}
```

---

## Schemas

### Duplicate Group

```typescript
interface DuplicateGroup {
  id: string;
  type: DuplicateType;
  status: GroupStatus;
  confidence: number;
  detection_method?: string;
  file_count: number;
  total_size_bytes: number;
  potential_savings_bytes: number;
  primary_file: FileReference;
  files?: DuplicateFile[];
  sample_duplicates?: FileReference[];
  comparison?: ComparisonDetails;
  recommendations?: Recommendation[];
  resolution?: Resolution;
  detected_at: string;
  created_at: string;
  updated_at: string;
}

type DuplicateType = "exact" | "near_duplicate" | "similar" | "version";

type GroupStatus = "pending" | "resolved" | "dismissed";

interface DuplicateFile extends FileReference {
  is_primary: boolean;
  similarity_score: number;
  source_name: string;
  created_at: string;
  modified_at: string;
}

interface ComparisonDetails {
  matching_content_percent: number;
  differences?: string[];
}

interface Recommendation {
  action: "keep" | "delete" | "review";
  file_id: string;
  reason: string;
}

interface Resolution {
  action: string;
  kept_file_id: string;
  deleted_file_ids: string[];
  space_freed_bytes: number;
  resolved_at: string;
  resolved_by: string;
}
```

### File Reference

```typescript
interface FileReference {
  id: string;
  name: string;
  path: string;
  mime_type?: string;
  size_bytes?: number;
  source_id: string;
  hash_sha256?: string;
}
```

---

## Duplicate Types

| Type | Confidence | Detection Method |
|------|------------|------------------|
| `exact` | 1.0 | SHA-256 hash match |
| `near_duplicate` | 0.95-0.99 | Semantic similarity (embedding) |
| `similar` | 0.85-0.94 | Semantic similarity (embedding) |
| `version` | Variable | Filename pattern matching |

---

## Error Codes

| Code | Description |
|------|-------------|
| `GROUP_NOT_FOUND` | Duplicate group doesn't exist |
| `GROUP_ALREADY_RESOLVED` | Group has already been resolved |
| `INVALID_RESOLUTION` | Invalid resolution parameters |
| `FILE_NOT_IN_GROUP` | Specified file not in group |
| `SCAN_IN_PROGRESS` | Another scan is running |

