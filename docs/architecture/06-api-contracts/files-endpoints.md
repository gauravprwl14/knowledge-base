# Files Endpoints

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The Files API provides access to indexed file metadata, content extraction results, and file management operations.

---

## Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/files` | List indexed files |
| GET | `/files/{id}` | Get file details |
| GET | `/files/{id}/content` | Get extracted content |
| GET | `/files/{id}/chunks` | Get text chunks |
| PATCH | `/files/{id}` | Update file metadata |
| DELETE | `/files/{id}` | Remove file from index |
| POST | `/files/bulk-delete` | Bulk delete files |
| GET | `/files/stats` | Get file statistics |

---

## List Files

Get paginated list of indexed files.

```http
GET /api/v1/files
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `source_id` | uuid | Filter by source |
| `mime_type` | string | Filter by MIME type |
| `extension` | string | Filter by file extension |
| `status` | string | Filter by indexing status |
| `min_size` | integer | Minimum file size in bytes |
| `max_size` | integer | Maximum file size in bytes |
| `created_after` | datetime | Created after date |
| `created_before` | datetime | Created before date |
| `path_prefix` | string | Filter by path prefix |
| `is_duplicate` | boolean | Filter duplicates only |
| `is_junk` | boolean | Filter junk files only |
| `sort_by` | string | Sort field (created_at, name, size_bytes) |
| `sort_order` | string | asc or desc |
| `limit` | integer | Results per page (default: 20, max: 100) |
| `cursor` | string | Pagination cursor |
| `fields` | string | Comma-separated fields to include |

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "file_abc123",
      "source_id": "src_xyz789",
      "name": "quarterly-report.pdf",
      "path": "/documents/reports/quarterly-report.pdf",
      "mime_type": "application/pdf",
      "extension": "pdf",
      "size_bytes": 2097152,
      "hash_sha256": "e3b0c44298fc1c149afbf4c8996fb924...",
      "status": "indexed",
      "indexing": {
        "chunks_count": 15,
        "has_embeddings": true,
        "indexed_at": "2026-01-07T10:30:00Z"
      },
      "metadata": {
        "title": "Q4 2025 Financial Report",
        "author": "Finance Team",
        "page_count": 25,
        "word_count": 8500
      },
      "duplicate_info": {
        "is_duplicate": false,
        "group_id": null
      },
      "junk_info": {
        "is_junk": false,
        "confidence": 0.0
      },
      "source_metadata": {
        "external_id": "1234567890abc",
        "web_url": "https://drive.google.com/file/d/...",
        "created_at": "2025-12-01T09:00:00Z",
        "modified_at": "2025-12-15T14:30:00Z"
      },
      "created_at": "2026-01-07T10:00:00Z",
      "updated_at": "2026-01-07T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 1250,
    "limit": 20,
    "cursor": null,
    "next_cursor": "eyJpZCI6MjB9",
    "has_more": true
  }
}
```

---

## Get File

Get detailed information about a specific file.

```http
GET /api/v1/files/{file_id}
Authorization: Bearer <token>
```

**Response:** `200 OK`

```json
{
  "id": "file_abc123",
  "source_id": "src_xyz789",
  "name": "quarterly-report.pdf",
  "path": "/documents/reports/quarterly-report.pdf",
  "mime_type": "application/pdf",
  "extension": "pdf",
  "size_bytes": 2097152,
  "hash_sha256": "e3b0c44298fc1c149afbf4c8996fb924...",
  "status": "indexed",
  "indexing": {
    "chunks_count": 15,
    "has_embeddings": true,
    "embedding_model": "all-MiniLM-L6-v2",
    "indexed_at": "2026-01-07T10:30:00Z",
    "processing_time_ms": 2500
  },
  "metadata": {
    "title": "Q4 2025 Financial Report",
    "author": "Finance Team",
    "page_count": 25,
    "word_count": 8500,
    "language": "en",
    "keywords": ["finance", "quarterly", "2025"]
  },
  "duplicate_info": {
    "is_duplicate": false,
    "group_id": null,
    "duplicate_count": 0
  },
  "junk_info": {
    "is_junk": false,
    "label": "normal",
    "confidence": 0.05,
    "matched_rules": []
  },
  "source_metadata": {
    "external_id": "1234567890abc",
    "web_url": "https://drive.google.com/file/d/...",
    "download_url": "https://...",
    "thumbnail_url": "https://...",
    "created_at": "2025-12-01T09:00:00Z",
    "modified_at": "2025-12-15T14:30:00Z",
    "owner": "john@example.com",
    "shared": true
  },
  "created_at": "2026-01-07T10:00:00Z",
  "updated_at": "2026-01-07T10:30:00Z"
}
```

---

## Get File Content

Get extracted text content from a file.

```http
GET /api/v1/files/{file_id}/content
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `format` | string | Output format: text, markdown (default: text) |

**Response:** `200 OK`

```json
{
  "file_id": "file_abc123",
  "content": "Q4 2025 Financial Report\n\nExecutive Summary\n\nThis report presents...",
  "format": "text",
  "word_count": 8500,
  "character_count": 45000,
  "extracted_at": "2026-01-07T10:30:00Z"
}
```

---

## Get File Chunks

Get text chunks with their embeddings info.

```http
GET /api/v1/files/{file_id}/chunks
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `include_vectors` | boolean | Include embedding vectors (default: false) |
| `limit` | integer | Results per page |
| `offset` | integer | Skip chunks |

**Response:** `200 OK`

```json
{
  "file_id": "file_abc123",
  "total_chunks": 15,
  "chunks": [
    {
      "index": 0,
      "text": "Q4 2025 Financial Report\n\nExecutive Summary\n\nThis report presents the financial performance...",
      "start_char": 0,
      "end_char": 1000,
      "metadata": {
        "page": 1,
        "section": "Executive Summary"
      },
      "has_embedding": true,
      "vector": null
    },
    {
      "index": 1,
      "text": "performance for the fourth quarter of 2025. Key highlights include...",
      "start_char": 800,
      "end_char": 1800,
      "metadata": {
        "page": 1,
        "section": "Executive Summary"
      },
      "has_embedding": true,
      "vector": null
    }
  ],
  "pagination": {
    "offset": 0,
    "limit": 20,
    "total": 15
  }
}
```

---

## Update File

Update file metadata (user-defined fields only).

```http
PATCH /api/v1/files/{file_id}
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "user_metadata": {
    "tags": ["important", "finance"],
    "notes": "Reviewed on 2026-01-07",
    "priority": "high"
  }
}
```

**Response:** `200 OK`

Returns updated file object.

---

## Delete File

Remove a file from the index.

```http
DELETE /api/v1/files/{file_id}
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `permanent` | boolean | Skip trash, delete permanently (default: false) |

**Response:** `204 No Content`

---

## Bulk Delete

Delete multiple files at once.

```http
POST /api/v1/files/bulk-delete
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "file_ids": ["file_abc123", "file_def456", "file_ghi789"],
  "permanent": false
}
```

**Response:** `200 OK`

```json
{
  "deleted": 3,
  "failed": 0,
  "errors": []
}
```

---

## File Statistics

Get aggregate statistics about indexed files.

```http
GET /api/v1/files/stats
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `source_id` | uuid | Filter by source |

**Response:** `200 OK`

```json
{
  "total_files": 1250,
  "total_size_bytes": 5368709120,
  "by_status": {
    "indexed": 1200,
    "pending": 30,
    "failed": 15,
    "skipped": 5
  },
  "by_type": {
    "application/pdf": 450,
    "application/vnd.google-apps.document": 300,
    "image/jpeg": 200,
    "text/plain": 150,
    "other": 150
  },
  "duplicates": {
    "groups": 45,
    "files": 120
  },
  "junk": {
    "detected": 35,
    "suspicious": 50
  },
  "embeddings": {
    "files_with_embeddings": 1150,
    "total_chunks": 18500,
    "avg_chunks_per_file": 16
  }
}
```

---

## Schemas

### File

```typescript
interface File {
  id: string;
  source_id: string;
  name: string;
  path: string;
  mime_type: string;
  extension: string;
  size_bytes: number;
  hash_sha256: string | null;
  status: FileStatus;
  indexing: IndexingInfo;
  metadata: FileMetadata;
  duplicate_info: DuplicateInfo;
  junk_info: JunkInfo;
  source_metadata: SourceFileMetadata;
  user_metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

type FileStatus =
  | "pending"      // Discovered, not yet processed
  | "processing"   // Currently being indexed
  | "indexed"      // Successfully indexed
  | "failed"       // Indexing failed
  | "skipped";     // Intentionally skipped

interface IndexingInfo {
  chunks_count: number;
  has_embeddings: boolean;
  embedding_model?: string;
  indexed_at: string | null;
  processing_time_ms?: number;
  error_message?: string;
}

interface FileMetadata {
  title?: string;
  author?: string;
  page_count?: number;
  word_count?: number;
  language?: string;
  keywords?: string[];
}

interface DuplicateInfo {
  is_duplicate: boolean;
  group_id: string | null;
  duplicate_count?: number;
  match_type?: "exact" | "near_duplicate" | "similar";
}

interface JunkInfo {
  is_junk: boolean;
  label: "normal" | "suspicious" | "junk";
  confidence: number;
  matched_rules: string[];
}

interface SourceFileMetadata {
  external_id: string;
  web_url?: string;
  download_url?: string;
  thumbnail_url?: string;
  created_at: string;
  modified_at: string;
  owner?: string;
  shared?: boolean;
}
```

### Text Chunk

```typescript
interface TextChunk {
  index: number;
  text: string;
  start_char: number;
  end_char: number;
  metadata?: ChunkMetadata;
  has_embedding: boolean;
  vector?: number[] | null;
}

interface ChunkMetadata {
  page?: number;
  section?: string;
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `FILE_NOT_FOUND` | File doesn't exist |
| `FILE_NOT_INDEXED` | File hasn't been indexed yet |
| `CONTENT_NOT_AVAILABLE` | Content extraction failed |
| `BULK_LIMIT_EXCEEDED` | Too many files in bulk operation (max 100) |

