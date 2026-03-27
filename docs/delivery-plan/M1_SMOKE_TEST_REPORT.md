# M1 Smoke Test Report

**Date:** 2026-03-17
**Tester:** Automated (Claude Code agent)
**Branch:** feat/design-web-ui
**Environment:** Local Docker/Podman stack via `docker-compose.kms.yml`

---

## Stack State at Test Time

| Service | Status | Notes |
|---------|--------|-------|
| postgres (17-alpine) | Up, healthy | Port 5432 |
| redis (7.4-alpine) | Up, healthy | Port 6379 |
| rabbitmq (4.1-management) | Up, healthy | Ports 5672, 15672 |
| qdrant (v1.13.1) | Up, **unhealthy** | Ports 6333-6334 — health probe failing |
| neo4j (5.26-community) | Up, healthy | Ports 7474, 7687 |
| minio | Up, healthy | Ports 9000-9001 |
| tempo | Up | Port 3200 |
| loki | Up | Port 3100 |
| prometheus | Up | Port 9090 |
| grafana | Up | Port 3000 |
| kms-api | Up | Port 8000 |
| rag-service | Up | Port 8002 |
| scan-worker | Up | Port 8010 |
| embed-worker | Up | Port 8011 |
| **otel-collector** | **Exited (1)** | Fatal config error — see Known Issues |
| search-api | Created (not started) | Port 8001 |
| dedup-worker | Created (not started) | Port 8012 |
| graph-worker | Created (not started) | Port 8013 |
| web-ui | Created (not started) | Port 3001 |

---

## Test Results

### Test 1 — Health: /api/v1/health/live

**Status: PASS**

```json
{"success":true,"data":{"status":"ok","timestamp":"2026-03-17T08:29:53.492Z"},"timestamp":"2026-03-17T08:29:53.492Z"}
```

### Test 2 — Health: /api/v1/health/ready

**Status: PASS**

```json
{"success":true,"data":{"status":"ok","info":{"database":{"status":"up"}},"error":{},"details":{"database":{"status":"up"}}},"timestamp":"2026-03-17T08:29:53.526Z"}
```

Database connectivity confirmed.

### Test 3 — Auth: POST /api/v1/auth/register

**Status: PASS**

Registered `smoke@test.kms`. User created with status `PENDING_VERIFICATION` and `emailVerified: false` (expected — email verification gate is active).

```json
{
  "success": true,
  "data": {
    "id": "357a35ad-8ef3-4a77-9b55-1141ad137f20",
    "email": "smoke@test.kms",
    "firstName": "Smoke",
    "lastName": "Test",
    "role": "USER",
    "status": "PENDING_VERIFICATION",
    "emailVerified": false
  }
}
```

### Test 4 — Auth: POST /api/v1/auth/login (before activation)

**Status: PASS (expected failure)**

Correctly blocked with error code `AUT0012` — "Please verify your email before logging in."

### Test 5 — DB: Direct user activation

**Status: PASS**

Activated user via `psql`:
```sql
UPDATE users SET status='ACTIVE', email_verified=true WHERE email='smoke@test.kms';
-- UPDATE 1
```

Note: The Prisma model uses table name `users` (not `auth_users` as originally attempted). The DB user is `kms`, database is `kms`.

### Test 6 — Auth: POST /api/v1/auth/login (after activation)

**Status: PASS**

JWT tokens issued successfully.

```json
{
  "success": true,
  "data": {
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": 900,
      "tokenType": "Bearer"
    },
    "user": {
      "id": "357a35ad-8ef3-4a77-9b55-1141ad137f20",
      "email": "smoke@test.kms",
      "firstName": "Smoke",
      "lastName": "Test",
      "role": "USER"
    }
  }
}
```

Token TTL: 900s (15 min access), 7-day refresh.

### Test 7 — JWT Guard: Unauthenticated request rejection

**Status: PASS**

`GET /api/v1/collections` without token returns `AUT0000` "Authentication required". JWT guard is enforcing auth globally on protected routes.

### Test 8 — Protected Endpoints: GET /api/v1/collections, /files, /sources

**Status: PARTIAL — stub endpoints**

All three endpoints return `GEN0002` "not yet implemented" — the auth guard passes (token validated), but the service implementations are stubs:

- `CollectionsService.findAll` — not implemented
- `FilesService.findAll` — not implemented
- `SourcesService.findAll` — not implemented

The auth layer and routing are wired correctly; business logic is M2 scope.

### Test 9 — Protected Endpoint: GET /api/v1/search

**Status: PARTIAL — dependency unavailable**

Returns `EXT0001` "Search service is currently unavailable". The search-api container is in `Created` state (not started), so the external dependency proxy fails gracefully with the correct error code.

### Test 10 — Validation: POST /api/v1/auth/change-password

**Status: PASS (validation layer working)**

Sent incomplete payload. API correctly returns `VAL0000` with field-level detail:
```json
{"field": "confirmNewPassword", "message": "Required"}
```

Confirms Zod validation pipe is active and error formatting is correct.

### Test 11 — Swagger Docs: GET /docs

**Status: PASS**

HTTP 200. `/docs` and `/docs-json` both accessible. Registered routes confirmed:

```
/api/v1/auth/change-password  POST
/api/v1/auth/login            POST
/api/v1/auth/refresh          POST
/api/v1/auth/register         POST
/api/v1/chat/runs             POST, GET/{id}, DELETE/{id}, GET/{id}/stream
/api/v1/collections           GET, POST, GET/{id}, PATCH/{id}, DELETE/{id}, POST/{id}/files
/api/v1/files                 GET, GET/{id}, DELETE/{id}, PATCH/{id}/tags
/api/v1/health                GET, GET/live, GET/ready
/api/v1/search                GET
/api/v1/sources               GET, POST, GET/{id}, PATCH/{id}, DELETE/{id}
```

Note: `POST /api/v1/auth/api-keys` and `GET /api/v1/users/me` are **not registered** in the current build — these modules are either not wired into `app.module.ts` or not yet scaffolded.

---

## Overall M1 API Status

| Category | Result |
|----------|--------|
| Infrastructure (postgres, redis, rabbitmq, kms-api) | PASS |
| Health endpoints | PASS |
| User registration | PASS |
| Email verification gate | PASS (working as designed) |
| JWT login + token issuance | PASS |
| JWT guard enforcement | PASS |
| Zod validation pipe | PASS |
| Swagger / OpenAPI docs | PASS |
| Business-logic endpoints (collections, files, sources) | STUB — M2 scope |
| Search service | UNAVAILABLE — search-api not started |

**M1 core auth + infrastructure: PASS. The API is deployable and the auth flow works end-to-end.**

---

## Known Issues Requiring Follow-Up

### 1. OTel Collector crashes on startup (BLOCKER for observability)

**Error:** `unknown type: "loki" for id: "loki"` in the exporter config.

The `otel-collector-contrib` image version in use does not include the `loki` exporter. Options:
- Pin to an older `otel/opentelemetry-collector-contrib` image that ships with the loki exporter.
- Switch to `otlphttp` exporter pointing at Loki's OTLP endpoint (`http://loki:3100/otlp`).
- Use a custom collector build with the loki exporter included.

### 2. Qdrant health probe failing

Qdrant container is `unhealthy`. May be a health-check interval/timing issue or a configuration problem. Needs investigation before vector search is needed (M2+).

### 3. Missing routes: /api/v1/users/me and /api/v1/auth/api-keys

These routes are referenced in the smoke test plan but are not registered in the current build. Check `app.module.ts` — `UsersModule` may not be imported, or the api-keys controller may not exist yet.

### 4. search-api, dedup-worker, graph-worker, web-ui in Created state

These services were not auto-started. Run:
```bash
/opt/homebrew/bin/podman-compose -f docker-compose.kms.yml up -d search-api dedup-worker graph-worker web-ui
```
Expected to be M2+ scope.

### 5. Email verification flow — manual follow-up required

No SMTP service is configured. Production email verification requires either:
- A test SMTP provider (Mailhog, Mailtrap) added to the compose stack.
- A `POST /api/v1/auth/verify-email` endpoint with a test bypass token for dev environments.

### 6. Google OAuth — not smoke-tested

Google OAuth requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars and a callback URL. Not testable in local stack without credentials. Needs a separate integration test environment.

### 7. DB table naming discrepancy

The CLAUDE.md mentions `auth_users` as the naming convention for the users table, but the actual Prisma migration created the table as `users`. Engineering standards doc should be updated or the migration should alias the table name.

---

## Recommendations Before M2

1. Fix OTel collector config (loki exporter issue) — observability is dark without it.
2. Add Mailhog to `docker-compose.kms.yml` for email verification testing in dev.
3. Implement or wire `UsersModule` with `GET /users/me` — needed for front-end profile page.
4. Implement stub services for collections, files, sources (M2 milestone).
5. Investigate Qdrant health probe failure before embedding pipeline work begins.
