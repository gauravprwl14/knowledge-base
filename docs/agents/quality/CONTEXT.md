# Quality Group — CONTEXT

## Agents in This Group

| Skill | File | Responsibility |
|-------|------|----------------|
| `/kb-qa-architect` | `quality/qa-architect.md` | Test strategy, pytest patterns, Jest/RTL, Playwright E2E, coverage analysis |
| `/kb-security-review` | `quality/security-review.md` | Security audit, API key auth, OWASP checks, PII handling, threat modeling |

---

## When to Use `/kb-qa-architect`

Use the QA architect when:

- Writing a **Test Strategy document** for a new feature
- Designing **pytest fixtures and factories** for Python worker tests
- Writing **Jest unit tests** for NestJS services and controllers
- Setting up **React Testing Library** component tests for the frontend
- Writing **Playwright E2E tests** for critical user flows
- Analyzing **test coverage gaps** (identifying untested branches or edge cases)
- Setting up **test containers** for integration tests (PostgreSQL, RabbitMQ, Redis, Qdrant)
- Configuring **CI test stages** (which tests run on PR vs merge vs nightly)
- Designing **test data factories** and seed data strategies
- Debugging **flaky tests** (race conditions, async timing, test isolation)
- Reviewing **coverage reports** and setting coverage thresholds

The QA architect does not write production code. It produces test code and test strategy documents.

---

## When to Use `/kb-security-review`

Use the security review agent when:

- Auditing **API key authentication** (hashing, storage, rotation, revocation)
- Running through the **OWASP Top 10** for a new feature or endpoint
- Reviewing **file upload endpoints** (type validation, size limits, path traversal, malware)
- Assessing **PII data handling** (what is stored, who can access, retention policy)
- Performing **threat modeling** for a new integration or service boundary
- Reviewing **JWT implementation** (algorithm, expiry, refresh token handling)
- Checking **input validation** completeness (SQL injection, XSS, command injection risk)
- Reviewing **database access control** (tenant isolation, row-level security)
- Auditing **secret management** (env vars, no hardcoded credentials, rotation process)
- Assessing **rate limiting** and brute force protection on auth endpoints

Always invoke `/kb-security-review` early for:
- New file upload endpoints
- New external API integrations
- Any change to authentication or authorization logic
- New PII fields added to the database

---

## Quality Group in the Delivery Pipeline

```
Feature designed → Feature implemented
                          ↓
            /kb-qa-architect  (test strategy + test code)
            /kb-security-review  (security gate)
                          ↓
                   PR submitted
                          ↓
              CI runs tests → coverage check
                          ↓
                      Merge
```

Security review and QA strategy should ideally happen **during** implementation, not after. Engage these agents as soon as the API contract and data model are defined.

---

## Test Framework Reference

| Layer | Framework | Config File |
|-------|-----------|-------------|
| NestJS unit tests | Jest | `kms-api/jest.config.js` |
| NestJS E2E tests | Jest + Supertest | `kms-api/test/jest-e2e.json` |
| Frontend unit tests | Jest + React Testing Library | `frontend/jest.config.js` |
| Frontend E2E tests | Playwright | `frontend/playwright.config.ts` |
| Python unit tests | pytest | `backend/pytest.ini` |
| Python integration tests | pytest + testcontainers | `backend/pytest.ini` |

---

## Shared Resources

- `docs/agents/shared/patterns.md` — Quality gates (before code change, before PR)
- `docs/agents/shared/artifacts.md` — Test Strategy artifact definition
