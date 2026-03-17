# API Contract: POST /api/v1/search

**Service:** search-api (port 8001)
**Version:** v1
**Auth:** Required (`X-API-Key` header)
**Status:** Approved

---

## Overview

Performs a hybrid search over the KMS document corpus using Reciprocal Rank Fusion (RRF) to combine semantic vector search (Qdrant) and keyword full-text search (PostgreSQL BM25). Returns a ranked list of matching documents with metadata and highlighted snippets.

---

## Request

### Headers

| Header | Required | Value |
|--------|----------|-------|
| `X-API-Key` | Yes | Valid API key (SHA256-verified against `auth_api_keys`) |
| `Content-Type` | Yes | `application/json` |

### Body

```typescript
interface SearchRequest {
  /**
   * Natural language query string.
   * Min: 1 char, Max: 1000 chars.
   * Required.
   */
  query: string;

  /**
   * Maximum number of results to return.
   * Min: 1, Max: 100, Default: 10.
   * Optional.
   */
  limit?: number;

  /**
   * Pagination offset (0-indexed).
   * Default: 0.
   * Optional.
   */
  offset?: number;

  /**
   * Filter results by document source types.
   * Valid values: "GOOGLE_DRIVE" | "LOCAL_FS" | "EXTERNAL_DRIVE"
   * If omitted, all sources are searched.
   * Optional.
   */
  sourceTypes?: Array<"GOOGLE_DRIVE" | "LOCAL_FS" | "EXTERNAL_DRIVE">;

  /**
   * Filter results by file MIME types.
   * Example: ["application/pdf", "text/plain"]
   * Optional.
   */
  fileTypes?: string[];

  /**
   * Filter to only include documents with these tags.
   * AND logic: document must have ALL specified tags.
   * Optional.
   */
  tags?: string[];

  /**
   * Only return documents created/modified after this ISO 8601 timestamp.
   * Optional.
   */
  createdAfter?: string;

  /**
   * Only return documents created/modified before this ISO 8601 timestamp.
   * Optional.
   */
  createdBefore?: string;

  /**
   * Search mode. Defaults to "hybrid".
   * - "hybrid": RRF fusion of semantic + keyword (recommended)
   * - "semantic": Vector search only
   * - "keyword": BM25 full-text only
   * Optional.
   */
  mode?: "hybrid" | "semantic" | "keyword";

  /**
   * Whether to include highlighted snippet in each result.
   * Default: true.
   * Optional.
   */
  includeSnippet?: boolean;
}
```

---

## Response

### Success — 200 OK

```typescript
interface SearchResponse {
  data: {
    results: SearchResult[];
    total: number;       // Total matching documents (for pagination)
    query: string;       // Echo of the search query
    mode: "hybrid" | "semantic" | "keyword";
  };
  meta: {
    took: number;        // Search duration in milliseconds
    cached: boolean;     // Whether this result was served from Redis cache
    limit: number;
    offset: number;
  };
}

interface SearchResult {
  /**
   * Unique document identifier (UUID v4).
   */
  id: string;

  /**
   * Document title (filename or extracted title).
   */
  title: string;

  /**
   * Relative file path within the source.
   */
  path: string;

  /**
   * Document source type.
   */
  sourceType: "GOOGLE_DRIVE" | "LOCAL_FS" | "EXTERNAL_DRIVE";

  /**
   * MIME type of the file.
   */
  mimeType: string;

  /**
   * File size in bytes.
   */
  sizeBytes: number;

  /**
   * Document tags.
   */
  tags: string[];

  /**
   * RRF fusion score. Higher is more relevant.
   * Comparable within a single response but not across responses.
   */
  score: number;

  /**
   * Highlighted text snippet showing the matched context.
   * Present only when includeSnippet=true.
   * Uses <mark> tags to highlight matching terms.
   */
  snippet?: string;

  /**
   * ISO 8601 timestamp of when the document was last modified.
   */
  updatedAt: string;

  /**
   * ISO 8601 timestamp of when the document was indexed.
   */
  indexedAt: string;
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `SRH_001` | 400 | Missing required field: `query` |
| `SRH_002` | 400 | `query` exceeds maximum length of 1000 characters |
| `SRH_003` | 400 | `limit` must be between 1 and 100 |
| `SRH_004` | 400 | `offset` must be a non-negative integer |
| `SRH_005` | 400 | Invalid `sourceTypes` value — must be one of: GOOGLE_DRIVE, LOCAL_FS, EXTERNAL_DRIVE |
| `SRH_006` | 400 | Invalid `mode` value — must be: hybrid, semantic, keyword |
| `SRH_007` | 400 | Invalid date format for `createdAfter` or `createdBefore` — use ISO 8601 |
| `SRH_008` | 400 | `createdAfter` must be before `createdBefore` |
| `SRH_009` | 503 | Search backend unavailable (Qdrant or PostgreSQL unreachable) |
| `SRH_010` | 504 | Search timed out (exceeded 5000ms threshold) |
| `AUTH_401` | 401 | Missing `X-API-Key` header |
| `AUTH_403` | 403 | Invalid or revoked API key |

### Error Response Shape

```typescript
interface ErrorResponse {
  error: {
    code: string;       // e.g. "SRH_002"
    message: string;    // Human-readable description
    details?: Record<string, unknown>;  // Field-level validation details
  };
}
```

---

## Validation Rules

| Field | Rule |
|-------|------|
| `query` | Required. String. Min length: 1. Max length: 1000. Trimmed before processing. |
| `limit` | Optional. Integer. Min: 1. Max: 100. Default: 10. |
| `offset` | Optional. Non-negative integer. Default: 0. |
| `sourceTypes` | Optional. Array of strings. Each must be a valid SourceType enum value. |
| `fileTypes` | Optional. Array of strings. Each must be a valid MIME type string. |
| `tags` | Optional. Array of strings. Each tag max 64 chars. |
| `createdAfter` | Optional. ISO 8601 datetime string. Must be a valid date. |
| `createdBefore` | Optional. ISO 8601 datetime string. Must be a valid date. If both provided, `createdAfter` < `createdBefore`. |
| `mode` | Optional. Enum: `"hybrid"`, `"semantic"`, `"keyword"`. Default: `"hybrid"`. |
| `includeSnippet` | Optional. Boolean. Default: `true`. |

---

## Example Request

```json
{
  "query": "how to configure authentication in NestJS",
  "limit": 5,
  "offset": 0,
  "sourceTypes": ["LOCAL_FS", "GOOGLE_DRIVE"],
  "fileTypes": ["application/pdf", "text/markdown"],
  "mode": "hybrid",
  "includeSnippet": true
}
```

---

## Example Success Response

```json
{
  "data": {
    "results": [
      {
        "id": "3f2a1b4c-8e9d-4f1a-b2c3-d4e5f6a7b8c9",
        "title": "NestJS Authentication Guide",
        "path": "/docs/backend/nestjs-auth.md",
        "sourceType": "LOCAL_FS",
        "mimeType": "text/markdown",
        "sizeBytes": 14200,
        "tags": ["nestjs", "auth", "jwt"],
        "score": 0.0312,
        "snippet": "To configure <mark>authentication</mark> in <mark>NestJS</mark>, start by installing @nestjs/passport and @nestjs/jwt...",
        "updatedAt": "2026-02-10T14:23:00Z",
        "indexedAt": "2026-02-10T14:30:45Z"
      },
      {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "title": "JWT Strategy Implementation",
        "path": "/docs/auth/jwt-strategy.pdf",
        "sourceType": "GOOGLE_DRIVE",
        "mimeType": "application/pdf",
        "sizeBytes": 89420,
        "tags": ["jwt", "security"],
        "score": 0.0289,
        "snippet": "The JWT <mark>authentication</mark> strategy validates bearer tokens on each request...",
        "updatedAt": "2026-01-28T09:15:00Z",
        "indexedAt": "2026-01-28T09:45:12Z"
      }
    ],
    "total": 23,
    "query": "how to configure authentication in NestJS",
    "mode": "hybrid"
  },
  "meta": {
    "took": 87,
    "cached": false,
    "limit": 5,
    "offset": 0
  }
}
```

---

## Example Error Response

```json
{
  "error": {
    "code": "SRH_002",
    "message": "Search query exceeds maximum length of 1000 characters.",
    "details": {
      "field": "query",
      "maxLength": 1000,
      "actualLength": 1247
    }
  }
}
```

---

## Implementation Notes

- The search endpoint is cached in Redis. Cache key: `search:<sha256(canonical_request_json)>`. TTL: 300 seconds.
- Cache is invalidated on any document upsert or deletion event.
- Qdrant query fetches top `SEARCH_RRF_CANDIDATE_N` (default 50) candidates before RRF fusion.
- PostgreSQL FTS uses `to_tsquery('english', ...)` with `plainto_tsquery` fallback for complex queries.
- Snippet generation uses PostgreSQL `ts_headline()` for keyword matches; semantic snippets use the highest-scoring chunk's raw text.
- Rate limiting: 60 requests/minute per API key (configurable).
- Timeout: 5000ms hard limit (returns SRH_010 if exceeded).
