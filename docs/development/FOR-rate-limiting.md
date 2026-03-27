# Rate Limiting in KMS

Rate limiting in `kms-api` is provided by `@nestjs/throttler` and applied globally via `ThrottlerGuard`. This guide explains the global defaults, per-endpoint overrides, how to add new limits, and how to exempt internal routes.

---

## Overview

`ThrottlerModule` is registered in `AppModule` with a single global bucket. `ThrottlerGuard` is bound as a global guard (via `APP_GUARD`), so **every endpoint is rate-limited by default**. Individual handlers can tighten or relax those defaults using the `@Throttle` and `@SkipThrottle` decorators.

Rate limiting is enforced per **IP address** using the default in-memory store (no Redis dependency). Limits reset at the end of each TTL window.

When a client exceeds the limit the server responds with:

```
HTTP 429 Too Many Requests
```

---

## Global Defaults

Configured in `kms-api/src/app.module.ts` via environment variables:

| Environment variable | Default | Description |
|---|---|---|
| `THROTTLE_TTL` | `60` (seconds) | Window duration. Multiplied by 1000 for ms internally. |
| `THROTTLE_LIMIT` | `100` | Maximum requests per IP within the window. |

The Zod schema at `kms-api/src/config/schemas/app.schema.ts` validates both variables at startup; the service will not start if they are invalid.

---

## Per-Endpoint Rate Limit Table

The table below lists every endpoint that overrides the global default. All TTL values are in **milliseconds** as passed to `@Throttle`.

| Service | Endpoint | Method | Limit | TTL (ms) | Notes |
|---|---|---|---|---|---|
| kms-api | `POST /auth/register` | public | 5 / 60 s | 60 000 | Prevents account-creation abuse |
| kms-api | `POST /auth/login` | public | 10 / 60 s | 60 000 | Mitigates credential stuffing |
| kms-api | `POST /auth/refresh` | public | 20 / 60 s | 60 000 | Token-refresh burst budget |
| kms-api | `POST /auth/logout` | JWT | 30 / 60 s | 60 000 | — |
| kms-api | `POST /acp/v1/initialize` | public | 20 / 60 s | 60 000 | Prevents capability enumeration |
| kms-api | `POST /acp/v1/sessions` | JWT | 30 / 60 s | 60 000 | Session-creation budget |
| kms-api | `PATCH /scan-jobs/:id/status` | internal | exempt | — | `@SkipThrottle` — called by scan-worker |
| All other endpoints | — | — | 100 / 60 s | 60 000 | Global default |

---

## Adding a New Rate Limit

### Tighten a specific handler

Import `Throttle` from `@nestjs/throttler` and place the decorator directly on the handler method, **before** route-method decorators:

```typescript
import { Throttle } from '@nestjs/throttler';

@Post('expensive-operation')
@Throttle({ default: { ttl: 60000, limit: 10 } })
async expensiveOperation(): Promise<void> {
  // ...
}
```

The `ttl` value is in **milliseconds**. The `default` key must match the name of the throttler registered in `ThrottlerModule.forRoot` (the single unnamed throttler uses the key `default`).

### Tighten at the controller level

Apply `@Throttle` to the controller class to set a tighter budget for all its routes:

```typescript
@Throttle({ default: { ttl: 60000, limit: 30 } })
@Controller('sensitive')
export class SensitiveController {
  // All routes inherit limit: 30 / 60 s
}
```

Method-level `@Throttle` takes precedence over class-level.

---

## Skipping Rate Limiting for Internal Routes

Use `@SkipThrottle` on controllers or methods that are called by internal services (workers, sidecars) rather than external clients. These routes must still be protected by another mechanism (e.g. a shared secret header or network policy).

```typescript
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle()
@Controller('scan-jobs')
export class ScanJobsController {
  // All routes exempt from rate limiting
}
```

To exempt a single method within an otherwise throttled controller:

```typescript
@SkipThrottle()
@Patch(':id/status')
async updateStatus(): Promise<void> {
  // exempt
}
```

---

## Environment Variables Reference

| Variable | Type | Default | Description |
|---|---|---|---|
| `THROTTLE_TTL` | integer (seconds) | `60` | Global window duration. Value is in **seconds**; `app.module.ts` converts to ms. |
| `THROTTLE_LIMIT` | integer | `100` | Global max requests per IP per window. |

Set these in `.env` or in the Docker Compose environment block for `kms-api`:

```yaml
environment:
  THROTTLE_TTL: 60
  THROTTLE_LIMIT: 100
```

---

## Testing Rate-Limited Endpoints

In unit tests, rate limiting is not applied because the `ThrottlerGuard` is not included in test modules by default. No special setup is required.

For E2E tests that verify the 429 response, override the guard with a configurable mock or register `ThrottlerModule` with an in-memory store and a very low limit:

```typescript
ThrottlerModule.forRoot([{ ttl: 1000, limit: 2 }]),
```

See `docs/development/FOR-testing.md` for the full E2E test setup pattern.
