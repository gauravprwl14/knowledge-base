# M1 Foundation — QA Plan

**Milestone**: M1 Foundation (Weeks 1-4)
**QA Status**: In Progress
**Last Updated**: 2026-03-17

---

## QA Strategy Decision

| Layer | Type | Rationale |
|-------|------|-----------|
| Backend unit tests | Automated (Jest) | Service layer logic; fast feedback |
| API integration tests | Automated (Jest + Supertest) | Contract verification; M2 gate |
| Frontend component tests | Automated (Vitest + RTL) | Primitive + composite layer |
| E2E auth flow | Manual (Phase 1) → Playwright (M3) | Too slow to automate before M2 |
| Security (auth guards) | Manual + automated spot checks | Auth is critical path |

---

## M1 Test Coverage — Current State

### Backend (kms-api) — Jest

| File | Status | Notes |
|------|--------|-------|
| src/modules/auth/auth.service.spec.ts | PASSING (20/20) | Fixed: PinoLogger token + bcrypt module mock + prisma.refreshToken.create mock |
| AuthController | MISSING | Need supertest integration tests |
| UsersController | MISSING | Need /users/me integration test |
| ApiKeysController | MISSING | Need CRUD integration tests |
| JWT guard | MISSING | Need guard unit test |
| API key guard | MISSING | Need guard unit test |

**Spec files found**: 1 (only `auth.service.spec.ts` exists under `src/`)

### Frontend — Vitest / React Testing Library

| Component | Status |
|-----------|--------|
| Button primitive | MISSING |
| Input primitive | MISSING |
| LoginFeature | MISSING |
| RegisterFeature | MISSING |
| useLogin hook | MISSING |
| useMe hook | MISSING |

---

## Fixes Applied in M1

### auth.service.spec.ts — three changes made

1. **PinoLogger token mock** — `@InjectPinoLogger(AuthService.name)` requires a NestJS DI token.
   Added `{ provide: getLoggerToken(AuthService.name), useValue: mockLogger }` to providers.

2. **bcrypt module-level mock** — `jest.spyOn(bcrypt, 'compare')` does not reliably intercept
   calls when `@swc/jest` is the transformer. Replaced with `jest.mock('bcrypt', ...)` at module
   scope and `(bcrypt.compare as jest.Mock).mockResolvedValue(...)` inside each test.

3. **prisma.refreshToken.create mock** — `generateTokens` persists a refresh token to the DB.
   Added `create: jest.fn().mockResolvedValue({})` to `mockPrismaService.refreshToken`.

4. **nestjs-pino install** — Package was imported in source but missing from `package.json`
   dependencies. Installed via `npm install --save nestjs-pino`.

---

## Manual QA Checklist — M1 Sign-off

### Auth Flow (Browser)

- [ ] Navigate to http://localhost:3001/en/login — page renders
- [ ] Submit invalid credentials — error shown
- [ ] Register new user — success message shown
- [ ] Activate user (DB update) → login → dashboard loads
- [ ] Logout → redirected to login
- [ ] Access /dashboard without session → redirected to login

### API Keys (Browser — /settings/api-keys)

- [ ] Create API key — key shown once
- [ ] Key appears in list with prefix
- [ ] Revoke key — disappears from list

### API (curl / Swagger UI)

- [ ] POST /auth/register → 201
- [ ] POST /auth/login → 200 + tokens
- [ ] GET /users/me with token → 200 + profile
- [ ] GET /users/me without token → 401
- [ ] POST /auth/api-keys → 201 + plaintext key
- [ ] DELETE /auth/api-keys/:id → 204
- [ ] POST /auth/refresh → 200 + new tokens
- [ ] POST /auth/logout → 200
- [ ] Swagger UI http://localhost:8000/docs → loads

---

## Automation Backlog (M2 gate)

Add these before M2 kickoff:

1. Supertest integration tests for all auth endpoints
2. Vitest + RTL tests for Button, Input, LoginFeature
3. Playwright E2E: register → login → dashboard → logout
4. Guard unit tests for JwtAuthGuard and ApiKeyGuard
5. UsersService unit tests (apply same PinoLogger + bcrypt mock pattern)

---

## Skipped / Deferred QA Items

### Google OAuth — SKIPPED (backlog)

**Decision (2026-03-17)**: Email/password sign-up and login are fully functional and cover the primary auth path. Google OAuth QA is deferred — requires real `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` credentials and a registered OAuth redirect URI in Google Cloud Console.

**What works today (verified)**:
- `GET /sources/google-drive/oauth` builds and returns the Google consent URL (302 redirect)
- Token encryption (`TokenEncryptionService`) — AES-256-GCM logic is unit-testable independently

**Backlog item**: `TEST-001 — Google OAuth E2E Integration Test`
- Set up a Google Cloud project with OAuth credentials
- Register `http://localhost:8000/api/v1/sources/google-drive/callback` as an authorized redirect URI
- Replace stub token exchange in `SourcesService.handleGoogleCallback` with real `googleapis` SDK call
- Add integration test: initiate OAuth → mock Google callback → verify source persisted with encrypted tokens
- **Target milestone**: M2 Sprint 3 completion gate

---

## Verdict

**M1 QA Status**: CONDITIONAL PASS

- Backend auth.service unit tests: 20/20 passing
- Frontend build: clean (23 routes, compiled successfully)
- Manual browser QA: pending
- Integration tests: pending (M2 gate)
- Frontend component tests: pending (M2 gate)
