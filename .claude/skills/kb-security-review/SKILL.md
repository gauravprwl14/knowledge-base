---
name: kb-security-review
description: |
  Audits code for OWASP Top 10 vulnerabilities, reviews auth/authorization logic, checks PII handling,
  and performs threat modeling. Use when reviewing a new endpoint for security issues, checking that
  userId scoping is correct, auditing for hardcoded secrets, reviewing input validation, or assessing
  the security posture of a new feature.
  Trigger phrases: "security review", "is this secure", "check for vulnerabilities", "audit the auth",
  "OWASP check", "is PII handled correctly", "check for SQL injection", "review the permissions".
argument-hint: "<security-concern>"
---

## Step 0 — Orient Before Auditing

1. Read `CLAUDE.md` — auth model (API Key SHA-256, JWT HS256/RS256), multi-tenant rules, PII constraints
2. Run `git diff HEAD~1 --name-only` — see exactly what code changed before auditing it
3. Read the changed files completely — never audit from memory or assumptions
4. Check `contracts/openapi.yaml` — identify which endpoints are public vs authenticated
5. Scan for known patterns: `grep -rn "console.log\|print(" kms-api/src services/ --include="*.ts" --include="*.py"`

## Security Reviewer's Cognitive Mode

Assume adversarial conditions. These questions run automatically:

**Authentication instincts**
- Who can reach this endpoint without authentication? Every unguarded endpoint is a potential exfiltration vector.
- Is the API key stored as SHA-256 hash? If the raw key is stored anywhere (DB, logs, cache), it's a credential leak.
- Is the JWT validated for `exp`, `iat`, and `aud`? A JWT without expiry validation is permanently valid after theft.
- Are there any auth bypass paths? `@Public()` decorators, missing `@UseGuards()`, or routes outside the global guard.

**Multi-tenancy instincts**
- Does every query touching `kms_*` or `voice_*` tables filter by `userId`? A single missing `WHERE userId = ?` returns all users' data.
- Is the `userId` sourced from the JWT payload (trusted) or the request body/params (untrusted)?
- Is the Redis cache keyed by `userId`? A cache key without user scope is a cross-tenant data leak.
- Does the Qdrant query include `user_id` in `must` filters? A missing filter returns all vectors.

**Input validation instincts**
- Does every user-supplied string go through a DTO with `class-validator` decorators before touching the DB?
- Is file upload MIME type validated with `python-magic` (not filename extension)? Extensions are attacker-controlled.
- Is there any string interpolation into a SQL query? Every raw string in a query is a potential SQL injection.
- Is there any user-supplied data in a shell command? That's command injection.

**PII and logging instincts**
- Are transcriptions (voice content) treated as sensitive? They are PII by default.
- Does any log entry contain file content, transcription text, or API keys?
- Are user emails logged anywhere? Log user IDs (UUIDs), not emails.

**Completeness standard**
A security review that only checks the happy path is incomplete. Test: what happens with a missing auth header, a wrong userId, a 10MB file upload, a SQL injection string, a JWT with exp in the past. All five must be handled correctly.

# KMS Security Review

You audit the KMS system for security vulnerabilities and enforce security standards.

## Auth Model

**API Key (machine-to-machine)**:
- Stored as SHA-256 hash in `auth_api_keys.key_hash`
- Never store the raw key after creation
- Header: `X-API-Key: <raw-key>`
- Validation: `sha256(raw-key) == stored_hash`

**JWT Bearer (user sessions)**:
- Header: `Authorization: Bearer <token>`
- Verify signature with `JWT_SECRET` (HS256 minimum, RS256 preferred)
- Always validate `exp`, `iat`, and `aud` claims

**Never**: log API keys or tokens, even partial values.

## Multi-Tenant Isolation Rules

Every database query filtering user data MUST include `userId` (or `user_id`) in the WHERE clause:
- PostgreSQL: `WHERE user_id = $1`
- Qdrant: `query_filter` must include `user_id` FieldCondition
- Redis: cache key must include `user_id` prefix

Audit trigger: if a query touches `kms_*` or `voice_*` tables without a `user_id` filter, it is a security defect.

## File Upload Security Checklist

- [ ] Validate MIME type from file content (not just extension) using `python-magic` or equivalent
- [ ] Enforce max file size (configurable, default 100MB)
- [ ] Validate allowed extensions whitelist
- [ ] Store files in MinIO with a UUID path (not the original filename)
- [ ] Scan for malware if processing is enabled (ClamAV integration)
- [ ] Never serve uploaded files from web root — proxy through API with auth check

## PII Rules

- **No PII in logs**: user email, phone, IP address, file names with PII — redact before logging
- **Structured log fields**: use `user_id` (UUID), never `user_email`
- **Transcription text**: treated as sensitive content — access log required
- **Audit log**: record who accessed what transcription and when

## OWASP Top 10 Checklist (relevant to KMS)

- [ ] **Injection**: All DB queries use parameterized queries / TypeORM query builder (no raw string concat)
- [ ] **Broken Auth**: API keys hashed, JWT signature verified, sessions expire
- [ ] **Sensitive Data Exposure**: HTTPS enforced, no PII in logs, no secrets in code
- [ ] **IDOR**: Every resource fetch verifies `userId` matches the requesting user
- [ ] **Security Misconfiguration**: No default credentials, debug mode off in prod
- [ ] **XSS**: Next.js escapes by default; custom HTML must use `DOMPurify`
- [ ] **SSRF**: Webhook URLs validated against allowlist or blocklist (no localhost/RFC1918)
- [ ] **Logging Failures**: All auth events logged; log writes are non-blocking

## Rate Limiting Enforcement

Rate limits must be enforced at the API gateway / middleware level, not just documented:
- Use Redis `INCR` + `EXPIRE` for sliding window
- Return `429` with `Retry-After` header
- Apply per-API-key limits (not global)

## Audit Log Requirements

Log these events with `userId`, `resourceId`, `action`, `timestamp`, `ip`:
- API key created / deleted
- File uploaded / deleted
- Transcription accessed
- Search query executed (query text + result count, no PII)
- Auth failure (wrong key or expired token)

## Threat Modeling Output Format

When reviewing a new feature:
1. **Assets at risk**: what data / resources could be exposed
2. **Attack vectors**: how an attacker could reach them
3. **Mitigations**: controls already in place
4. **Gaps**: controls missing — flag as security tasks
