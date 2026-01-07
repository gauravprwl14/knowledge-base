# API Contracts Overview

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

This section documents the complete API contracts for the KMS system, including:
- RESTful endpoints
- Request/response schemas
- Authentication requirements
- Error handling
- Webhook specifications

---

## API Architecture

```
                                   ┌─────────────────────────────────────────────────┐
                                   │                   Clients                       │
                                   │  (Web UI, CLI, Mobile, External Integrations)   │
                                   └─────────────────────────┬───────────────────────┘
                                                             │
                                                             ▼
                                   ┌─────────────────────────────────────────────────┐
                                   │              API Gateway (Nginx)                │
                                   │         Rate Limiting, SSL Termination          │
                                   └─────────────────────────┬───────────────────────┘
                                                             │
                              ┌──────────────────────────────┼──────────────────────────────┐
                              │                              │                              │
                              ▼                              ▼                              ▼
                 ┌────────────────────────┐    ┌────────────────────────┐    ┌────────────────────────┐
                 │      kms-api           │    │     search-api         │    │      voice-app         │
                 │     (NestJS)           │    │      (NestJS)          │    │      (FastAPI)         │
                 │                        │    │                        │    │                        │
                 │  /api/v1/auth/*        │    │  /api/v1/search/*      │    │  /api/v1/transcribe/*  │
                 │  /api/v1/sources/*     │    │                        │    │  /api/v1/jobs/*        │
                 │  /api/v1/files/*       │    │                        │    │                        │
                 │  /api/v1/duplicates/*  │    │                        │    │                        │
                 │  /api/v1/junk/*        │    │                        │    │                        │
                 └────────────────────────┘    └────────────────────────┘    └────────────────────────┘
```

---

## Base URLs

| Environment | Base URL |
|-------------|----------|
| Development | `http://localhost:8000/api/v1` |
| Staging | `https://staging-api.kms.example.com/api/v1` |
| Production | `https://api.kms.example.com/api/v1` |

---

## Authentication

All API endpoints (except health checks) require authentication.

### API Key Authentication

```http
GET /api/v1/files
X-API-Key: your-api-key-here
```

### JWT Bearer Token

```http
GET /api/v1/files
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

See [Authentication Endpoints](./auth-endpoints.md) for details.

---

## API Catalog

| Category | Base Path | Description | Documentation |
|----------|-----------|-------------|---------------|
| Auth | `/api/v1/auth` | Authentication & authorization | [auth-endpoints.md](./auth-endpoints.md) |
| Sources | `/api/v1/sources` | Data source management | [sources-endpoints.md](./sources-endpoints.md) |
| Files | `/api/v1/files` | File management & metadata | [files-endpoints.md](./files-endpoints.md) |
| Search | `/api/v1/search` | Hybrid search queries | [search-endpoints.md](./search-endpoints.md) |
| Duplicates | `/api/v1/duplicates` | Duplicate detection & groups | [duplicates-endpoints.md](./duplicates-endpoints.md) |
| Webhooks | N/A | Event notifications | [webhooks.md](./webhooks.md) |

---

## Common Patterns

### Pagination

All list endpoints support cursor-based pagination:

```http
GET /api/v1/files?limit=20&cursor=eyJpZCI6MTAwfQ==
```

Response includes pagination metadata:

```json
{
  "data": [...],
  "pagination": {
    "total": 1500,
    "limit": 20,
    "cursor": "eyJpZCI6MTAwfQ==",
    "next_cursor": "eyJpZCI6MTIwfQ==",
    "has_more": true
  }
}
```

### Filtering

List endpoints support field-based filtering:

```http
GET /api/v1/files?source_id=uuid&mime_type=application/pdf&status=indexed
```

### Sorting

```http
GET /api/v1/files?sort_by=created_at&sort_order=desc
```

### Field Selection

Request specific fields to reduce payload:

```http
GET /api/v1/files?fields=id,name,size_bytes,created_at
```

---

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "limit",
        "message": "Must be between 1 and 100"
      }
    ],
    "request_id": "req_abc123",
    "timestamp": "2026-01-07T10:30:00Z"
  }
}
```

### HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| 200 | OK | Successful GET, PUT, PATCH |
| 201 | Created | Successful POST |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Validation errors |
| 401 | Unauthorized | Missing or invalid auth |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource |
| 422 | Unprocessable Entity | Business logic error |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Maintenance mode |

### Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Request validation failed |
| `AUTH_REQUIRED` | Authentication required |
| `AUTH_INVALID` | Invalid credentials |
| `PERMISSION_DENIED` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `CONFLICT` | Resource already exists |
| `RATE_LIMITED` | Too many requests |
| `QUOTA_EXCEEDED` | Storage/API quota exceeded |
| `INTERNAL_ERROR` | Unexpected server error |

---

## Rate Limiting

### Default Limits

| Tier | Requests/Minute | Requests/Day |
|------|-----------------|--------------|
| Free | 60 | 1,000 |
| Pro | 300 | 10,000 |
| Enterprise | 1,000 | Unlimited |

### Rate Limit Headers

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1704625800
```

### Rate Limit Response

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Try again in 30 seconds.",
    "retry_after": 30
  }
}
```

---

## Versioning

API versioning is done via URL path:

```
/api/v1/files    # Current version
/api/v2/files    # Future version (when available)
```

### Deprecation Policy

- Deprecated endpoints include `Deprecation` header
- 6-month notice before removal
- `Sunset` header indicates removal date

```http
Deprecation: true
Sunset: Sat, 01 Jul 2026 00:00:00 GMT
```

---

## OpenAPI Specification

Complete OpenAPI 3.0 specification is available:

- **YAML**: [openapi-spec.yaml](./openapi-spec.yaml)
- **Interactive**: `GET /api/v1/docs` (Swagger UI)
- **JSON**: `GET /api/v1/openapi.json`

---

## SDK Support

| Language | Package | Status |
|----------|---------|--------|
| TypeScript | `@kms/client` | Planned |
| Python | `kms-client` | Planned |
| Go | `github.com/kms/go-client` | Planned |

---

## Documentation Index

| Document | Description |
|----------|-------------|
| [OpenAPI Spec](./openapi-spec.yaml) | Complete API specification |
| [Auth Endpoints](./auth-endpoints.md) | Authentication & API keys |
| [Sources Endpoints](./sources-endpoints.md) | Source management |
| [Files Endpoints](./files-endpoints.md) | File operations |
| [Search Endpoints](./search-endpoints.md) | Search queries |
| [Duplicates Endpoints](./duplicates-endpoints.md) | Deduplication |
| [Webhooks](./webhooks.md) | Event notifications |

