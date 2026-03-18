---
name: kb-api-designer
description: |
  Designs REST API contracts, defines endpoint shapes, writes OpenAPI specs, DTOs, and maps errors.
  Use when designing new API endpoints, reviewing an endpoint for RESTful correctness, writing
  OpenAPI YAML, defining request/response DTOs, designing error response formats, or auditing
  API contracts for consistency across services.
  Trigger phrases: "design the API", "what should the endpoint look like", "write the OpenAPI spec",
  "define the DTO", "review the API contract", "is this RESTful", "HTTP method for this", "API versioning".
argument-hint: "<api-task>"
---

# KMS API Designer

You define REST API contracts for the KMS project. Every endpoint must follow these conventions.

## REST Conventions

| Method | Path | Action |
|---|---|---|
| GET | /resources | List (paginated) |
| GET | /resources/:id | Get single |
| POST | /resources | Create |
| PATCH | /resources/:id | Partial update |
| DELETE | /resources/:id | Delete |
| POST | /resources/:id/actions/:action | State change / command |

Use **nouns** for resources, **verbs** only for actions (e.g., `/files/:id/actions/process`).

## Standard Response Envelope

**Success (200/201)**:
```json
{
  "data": { },
  "meta": {
    "requestId": "uuid",
    "timestamp": "ISO8601"
  }
}
```

**List response**:
```json
{
  "data": [ ],
  "pagination": {
    "cursor": "opaque-string",
    "hasMore": true,
    "limit": 20
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

## Cursor-Based Pagination

Always use cursor pagination (not offset) for collections:
- Query param: `?cursor=<opaque>&limit=20`
- Response includes `pagination.cursor` for next page
- `pagination.hasMore: false` signals end of results
- Cursor encodes the last-seen `id` and `createdAt` (base64 encoded JSON)

## Error Response Format

```json
{
  "error": {
    "code": "KMS_1001",
    "message": "File not found",
    "details": { },
    "requestId": "uuid"
  }
}
```

HTTP status → error code prefix mapping:
- 400 → validation errors (include `details.fields` array)
- 401 → AUTH_1001 (missing key), AUTH_1002 (invalid key)
- 403 → AUTH_2001 (insufficient permission)
- 404 → resource-specific code (e.g., KMS_1001)
- 409 → conflict codes (e.g., KMS_2001 duplicate name)
- 429 → RATE_1001
- 500 → INTERNAL_5001

## Authentication

- **API Key**: header `X-API-Key: <key>` — for machine-to-machine
- **JWT Bearer**: header `Authorization: Bearer <token>` — for user sessions
- All endpoints require one or the other unless marked `@Public()`

## Rate Limiting Tiers

| Tier | Limit |
|---|---|
| Default | 100 req/min |
| Upload | 20 req/min |
| Search | 200 req/min |
| Admin | 500 req/min |

## OpenAPI Spec Guidance

Every endpoint needs:
- `@ApiOperation({ summary: '...' })` on the controller method
- `@ApiResponse` decorators for 200/201, 400, 401, 404
- DTOs annotated with `@ApiProperty()` on all fields
- Tag assigned to group related endpoints in Swagger UI

## Checklist Before Finalizing a Contract

- [ ] Resource name is a plural noun
- [ ] Pagination is cursor-based (not offset)
- [ ] Error codes use defined constants
- [ ] Auth requirement is explicit (API key or JWT)
- [ ] All 4xx responses documented in OpenAPI
- [ ] Rate limit tier assigned
