# Sprint 3 Board — Google Drive Connection
**Milestone**: M2 — Google Drive Integration
**Sprint Goal**: OAuth flow complete, tokens stored encrypted, connection testable end-to-end
**Dates**: Weeks 5–6 of project

---

## TODO

### Backend — Sources Module
- [ ] [M] Create `sources` Prisma model (type: GOOGLE_DRIVE, userId, status, encryptedTokens, metadata)
- [ ] [M] SourcesModule: NestJS module + service + controller + repository
- [ ] [S] POST /sources/google-drive — initiate OAuth, return auth URL
- [ ] [S] GET /sources/google-drive/callback — exchange code, encrypt + store tokens
- [ ] [S] GET /sources — list user's connected sources
- [ ] [S] DELETE /sources/:id — disconnect a source
- [ ] [S] GET /sources/:id/status — check token validity

### Backend — Token Encryption
- [ ] [M] TokenEncryptionService — AES-256-GCM encrypt/decrypt using API_KEY_ENCRYPTION_SECRET
- [ ] [S] Store encrypted access + refresh tokens in source record
- [ ] [S] Auto-refresh expired Google tokens

### Google Drive API
- [ ] [M] GoogleDriveClient — wraps googleapis SDK
- [ ] [S] List files in Drive (name, mimeType, modifiedTime, size)
- [ ] [S] Handle API rate limiting with exponential backoff

### Frontend
- [ ] [M] Sources page (/[locale]/drive) — list connected sources
- [ ] [S] "Connect Google Drive" button → OAuth redirect
- [ ] [S] OAuth callback handling → success/error state
- [ ] [S] Source status badge (Connected/Expired/Error)
- [ ] [S] Disconnect source confirmation dialog

### Database
- [ ] [S] Prisma migration: kms_sources table
- [ ] [S] Prisma migration: kms_scan_jobs table

### Infrastructure
- [ ] [S] Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI to .env.example
- [ ] [S] Add googleapis to kms-api dependencies

---

## IN PROGRESS

(empty — sprint not started)

---

## DONE

(empty — sprint not started)

---

## Blocked / Risks
| Risk | Impact | Mitigation |
|------|--------|-----------|
| Google API rate limits | High | Exponential backoff, quota monitoring |
| Token encryption key rotation | Medium | Document key rotation procedure |
| OAuth redirect URI in dev vs prod | Low | Use env var for redirect URI |

---

## Definition of Done (Sprint 3)
- [ ] Google Drive OAuth flow completes in browser
- [ ] Tokens stored encrypted in DB (never plaintext)
- [ ] GET /sources returns connected sources
- [ ] Frontend shows connected Drive with status
- [ ] Unit tests for TokenEncryptionService
- [ ] Integration test for OAuth callback endpoint
