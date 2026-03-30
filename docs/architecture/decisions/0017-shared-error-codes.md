# 0017 — Shared KB Error Code Registry (@kb/errors package)

- **Status**: Accepted
- **Date**: 2026-03-30
- **Deciders**: Architecture Team
- **Tags**: [errors, packages, nestjs, python]

## Context and Problem Statement

The KMS monorepo has two NestJS services and six Python services, all of which throw errors and return error responses to clients. Without a coordinated error code system:

- Error codes collide across services (two services define `ERR_001` with different meanings)
- The frontend cannot reliably map API error codes to user-facing messages
- Different services use different error response shapes, making unified error handling in the frontend impossible
- Python worker errors have no relationship to NestJS API errors — a worker failure surfacing to the frontend has a different shape than an API error

## Decision Drivers

- Frontend must map any error code to a user-facing message without service-specific logic
- Error codes must be stable across service deployments (changing a code is a breaking change)
- Both NestJS and Python services must use the same code namespace
- Error shape must be consistent: `{ statusCode, error, message, code }` for HTTP responses
- Python worker errors need `.code`, `.message`, `.retryable` for AMQP nack/reject decisions

## Considered Options

- Option A: Shared `@kb/errors` package with `KB{DOMAIN}{4DIGIT}` error codes; NestJS `AppException`; Python `KMSWorkerError` subclasses
- Option B: HTTP status codes only — no application-level codes
- Option C: Per-service error enums with no cross-service coordination
- Option D: gRPC status codes mapped to HTTP

## Decision Outcome

Chosen: **Option A — Shared `@kb/errors` package with `KB{DOMAIN}{4DIGIT}` error codes**

All error codes live in `packages/errors/src/error-codes/`. The format is `KB{DOMAIN}{4DIGIT}` where DOMAIN is a 3-letter uppercase domain prefix:

| Domain prefix | Service area |
|--------------|-------------|
| `GEN` | General / cross-cutting |
| `AUT` | Authentication / authorization |
| `FIL` | Files |
| `SRC` | Sources |
| `SCH` | Search |
| `WRK` | Worker services |
| `RAG` | RAG / chat |
| `AGT` | Agent orchestrator |

NestJS services throw `AppException` from `@kb/errors` with a KB code. Python workers raise typed subclasses of `KMSWorkerError` with a `.code` field matching the same registry.

### Consequences

**Good:**
- Single source of truth for all error codes — no collisions across services
- Frontend maps `error.code` to i18n message key without service-specific branching
- `AppException` produces consistent `{ statusCode, error, message, code }` JSON shape
- `KMSWorkerError.retryable` drives AMQP `nack(requeue=True)` vs `reject()` decisions automatically
- Breaking change to an error code is immediately visible in the shared package diff

**Bad / Trade-offs:**
- Python services cannot import the TypeScript `@kb/errors` package — they must maintain a parallel error code list in Python. The registry file in `packages/errors/` serves as the source of truth; Python codes must be manually kept in sync.
- Adding a new domain requires updating `packages/errors/` and publishing a new package version before services can use the code
- Monorepo dependency — all NestJS services must update `@kb/errors` in concert

## Pros and Cons of the Options

### Option A: @kb/errors shared package — CHOSEN

- ✅ Single source of truth across all NestJS services
- ✅ Consistent error response shape enforced by `AppException`
- ✅ Frontend error handling is a simple code-to-message map
- ✅ Python `KMSWorkerError` subclasses align with the same code namespace
- ❌ Python services cannot import the TS package — must maintain parallel registry
- ❌ New domains require a package update cycle

### Option B: HTTP status codes only

- ✅ No coordination required
- ✅ Standard; every HTTP client understands 400/401/403/404/500
- ❌ HTTP status codes are not specific enough for programmatic handling (two 400 errors with different root causes cannot be distinguished)
- ❌ Frontend cannot render specific error messages without parsing the `message` field (fragile)

### Option C: Per-service error enums

- ✅ Each service owns its error codes independently
- ✅ No shared package dependency
- ❌ Codes collide across services (service A and service B both define code 1001)
- ❌ Frontend must maintain per-service error maps — combinatorial complexity
- ❌ No enforced response shape consistency

### Option D: gRPC status codes

- ✅ Standard, machine-readable
- ✅ Well-defined 16 status codes with clear semantics
- ❌ KMS services are HTTP-based; gRPC status codes do not map cleanly to HTTP semantics
- ❌ 16 codes are not specific enough — multiple application errors map to the same gRPC code
- ❌ Requires gRPC infrastructure for all services
