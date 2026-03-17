---
name: kb-security-review
description: Security audit, API key auth, OWASP checks, PII handling, threat modeling
argument-hint: "<security-concern>"
---

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
