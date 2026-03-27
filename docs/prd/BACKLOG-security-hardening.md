# Backlog: Security Hardening

**Type**: Security / Pre-Production Hardening
**Priority**: HIGH (items 1, 3, 6) / MEDIUM (items 2, 4, 5, 7)
**Effort**: M–L total
**Status**: Backlog — not started
**Created**: 2026-03-23

---

## Overview

This ticket tracks security hardening items that must be addressed before the system handles real user data in production. Items are ordered from highest to lowest urgency. Items marked HIGH must be resolved before any production deployment.

---

## Item 1 — Transcript Encryption at Rest (HIGH)

**Risk:** Transcripts stored in MinIO contain verbatim speech content which may include sensitive personal or business information.

**Required:**
- Enable SSE-S3 (server-side encryption) on the `kms-transcripts` MinIO bucket
- All objects encrypted with AES-256 managed by MinIO KMS
- MinIO configuration: set `MINIO_KMS_SECRET_KEY` or configure MinIO KMS via `MINIO_KMS_KES_ENDPOINT`
- Encryption is transparent to the application — no code change needed, only MinIO config

**Acceptance criteria:**
- [ ] MinIO bucket created with default encryption policy applied
- [ ] Object metadata confirms `x-amz-server-side-encryption: AES256` on all uploads
- [ ] MinIO KMS key is not stored in docker-compose plaintext — use Docker secret or env file excluded from git

**Related:** `PRD-minio-transcript-storage.md`

---

## Item 2 — Audit Log for Transcript Access (MEDIUM)

**Risk:** No record of who accessed which transcript, when, and from where. Required for GDPR compliance and incident investigation.

**Required:**
- Log every `GET /files/:id/transcription/text` call to a dedicated `kms_audit_log` table
- Fields: `id`, `user_id`, `file_id`, `action` (e.g., `TRANSCRIPT_READ`), `ip_address`, `user_agent`, `timestamp`
- Table must be append-only — no UPDATE or DELETE permitted on audit rows
- Expose audit log to admins via `GET /admin/audit-log` (role-gated, admin only)

**Schema:**
```sql
CREATE TABLE kms_audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    file_id     UUID,
    action      VARCHAR(64) NOT NULL,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS UPDATE/DELETE — enforced at application layer + DB role permissions
CREATE INDEX idx_audit_log_user_id ON kms_audit_log(user_id);
CREATE INDEX idx_audit_log_file_id ON kms_audit_log(file_id);
CREATE INDEX idx_audit_log_created_at ON kms_audit_log(created_at DESC);
```

**Acceptance criteria:**
- [ ] Every transcript text fetch creates an audit row
- [ ] Audit rows cannot be deleted via application API
- [ ] Admin endpoint returns paginated audit log filtered by user_id or file_id

---

## Item 3 — Token Encryption Key Rotation (HIGH)

**Risk:** `TOKEN_ENCRYPTION_KEY` is static. If the key is compromised, all stored OAuth tokens for all users are exposed. There is currently no path to rotate the key without invalidating all connected sources.

**Required:**
- Add key versioning: store `key_version` alongside each encrypted token
- `TOKEN_ENCRYPTION_KEY` becomes `TOKEN_ENCRYPTION_KEY_v1` (current) with a `TOKEN_ENCRYPTION_KEY_v2` for new encryptions
- On access, decrypt using the version stored with the token
- Provide a migration script: re-encrypt all tokens from v1 → v2 in a background job (sources remain connected)
- Once all tokens migrated, retire v1 key

**Acceptance criteria:**
- [ ] `key_version` stored with each encrypted token in DB
- [ ] kms-api can decrypt tokens encrypted with any supported key version
- [ ] Migration script re-encrypts tokens without requiring source reconnection
- [ ] Old key version can be disabled after migration is verified

---

## Item 4 — Rate Limiting on OAuth Endpoints (MEDIUM)

**Risk:** `POST /sources/google-drive/oauth` has no rate limiting. An attacker with a valid JWT could flood this endpoint to exhaust OAuth quota or farm tokens.

**Required:**
- Rate limit: max 5 OAuth connect attempts per user per hour
- Implement using NestJS `@nestjs/throttler` with a custom storage backend (Redis) for distributed enforcement
- Return `429 Too Many Requests` with `Retry-After` header on breach
- Apply the same limit to `POST /auth/refresh` (max 20 per user per hour)

**Acceptance criteria:**
- [ ] 6th OAuth attempt within 1 hour returns 429
- [ ] Rate limit counter stored in Redis (survives kms-api restart)
- [ ] `Retry-After` header present in 429 response
- [ ] Rate limit does not affect other endpoints

---

## Item 5 — PII Detection in Transcripts (MEDIUM)

**Risk:** Voice transcriptions may contain names, email addresses, phone numbers, or other PII. Without detection, the system may inadvertently store and index PII in violation of user expectations or data processing agreements.

**Required:**
- Add optional PII detection pass in voice-app after Whisper transcription completes, before MinIO upload
- Detection options (decide before implementation):
  - Option A: `presidio-analyzer` (Microsoft, open source) — named entity recognition for names, emails, phones, credit cards
  - Option B: Regex patterns only — fast but lower recall
- If PII detected: set `kms_voice_jobs.pii_detected = true` + `pii_entity_types = JSONB`
- Admin UI: filter/list files flagged for PII review
- Feature flag: `features.piiDetection.enabled` — default `false` (adds latency)

**Schema addition:**
```sql
ALTER TABLE kms_voice_jobs
  ADD COLUMN pii_detected BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN pii_entity_types JSONB NULL;
```

**Acceptance criteria:**
- [ ] PII detection runs as opt-in (feature flag)
- [ ] Transcripts with detected PII are flagged in DB
- [ ] No PII entity text is logged — only entity types and counts
- [ ] False positive rate acceptable for common English proper nouns (validate before enabling by default)

---

## Item 6 — Qdrant Access Control (HIGH)

**Risk:** By default, Qdrant has no authentication. If port 6333 is accidentally exposed (e.g., misconfigured reverse proxy or cloud security group), anyone can read, write, or delete all vector data.

**Required (choose one):**
- Option A (preferred): Enable Qdrant API key auth via `QDRANT__SERVICE__API_KEY` environment variable. Pass key in all Qdrant client calls from embed-worker, dedup-worker, graph-worker, search-api.
- Option B: Ensure port 6333 is bound only to the internal Docker network (`127.0.0.1:6333` or no published port). Sufficient if Qdrant never needs external access.

**Acceptance criteria:**
- [ ] Qdrant port 6333 is NOT published to the host in `docker-compose.kms.yml` for production config
- [ ] (If Option A) API key set; all workers pass key in requests; unauthenticated requests return 401
- [ ] Verified: `curl http://localhost:6333/collections` from outside Docker network returns connection refused or 401

---

## Item 7 — Secret Scanning in CI (MEDIUM)

**Risk:** Developers may accidentally commit secrets (API keys, passwords, JWT secrets) to the repository. No automated check currently prevents this.

**Required:**
- Add `gitleaks` or `trufflehog` as a pre-commit hook (`.pre-commit-config.yaml`)
- Configure to scan staged files before every commit
- Add to CI pipeline: scan full commit history on PRs to main branch
- Add `.gitleaksignore` or equivalent for known false positives (e.g., test fixtures with fake credentials)

**Acceptance criteria:**
- [ ] Pre-commit hook blocks commits containing high-entropy strings matching secret patterns
- [ ] CI job fails PRs that introduce secrets
- [ ] False positive rate is low enough that developers are not blocked on legitimate commits
- [ ] `.env.example` and test fixture files excluded from scanning

---

## Summary Table

| # | Item | Priority | Effort | Blocks Production? |
|---|------|----------|--------|-------------------|
| 1 | Transcript encryption at rest (MinIO SSE-S3) | HIGH | XS | Yes |
| 2 | Audit log for transcript access | MEDIUM | S | No |
| 3 | Token encryption key rotation | HIGH | M | Yes |
| 4 | Rate limiting on OAuth endpoints | MEDIUM | S | No |
| 5 | PII detection in transcripts | MEDIUM | M | No |
| 6 | Qdrant access control | HIGH | XS | Yes |
| 7 | Secret scanning in CI | MEDIUM | XS | No |

---

## Related

- `PRD-minio-transcript-storage.md` — Item 1 depends on MinIO being deployed
- `docs/architecture/ENGINEERING_STANDARDS.md` — security standards
- `kms-api/src/modules/auth/` — token encryption logic (Item 3)
- `docker-compose.kms.yml` — Qdrant service config (Item 6)
