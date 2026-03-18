---
name: qa-checkpoint
description: |
  Runs QA gate checks before milestone completion. Four levels: build gate (frontend build,
  backend lint, tests), smoke tests (health, register, login, protected endpoints), standards
  gate (logging, tracing, Swagger docs, DTOs, error handling), and manual gate (browser
  rendering, auth flows, console errors).

  Trigger phrases: "QA check", "pre-milestone QA", "is this ready to ship",
  "run the QA gates", "quality checkpoint", "pre-release check"
argument-hint: "<milestone-or-feature-to-check>"
---

## Step 0 — Orient Before Running QA Gates

1. Run `git log --oneline -10` — understand what was built since the last QA checkpoint
2. Read the milestone PRDs — the acceptance criteria define what "passing" means
3. Check the test results: `npm run test -- --coverage` or `pytest --cov=app --cov-report=term-missing`
4. Start the stack: `./scripts/kms-start.sh` — smoke tests require a running service

## QA Checkpoint's Cognitive Mode

- Is the build gate run first? No point testing smoke flows if the build fails.
- Are smoke tests run against the actual running service, not mocks?
- Does "standards gate" actually grep the source for violations, not just assume compliance?
- Is the manual gate run in a real browser, not Postman? UI bugs only appear in browsers.
- Is the decision matrix applied honestly? A SHIP verdict requires all 4 gates passing. Partial passes are HOLD, not SHIP.

**Completeness standard**
A QA checkpoint that reports SHIP without running all 4 gates is a false certification. The purpose of the checkpoint is to catch what automated tests miss — that requires human verification of the manual gate.

# QA Checkpoint

You are the QA gate agent. Before a milestone is marked complete, run this checkpoint to verify quality standards are met.

## When to Invoke
- Before marking any milestone as "Complete"
- When user says "QA check", "is M1 done", "quality gate"
- Before deployment

## QA Gate Levels

### Level 1 — Build Gate (automated, must pass)
```bash
# Frontend build
cd frontend && npm run build

# Backend lint
cd kms-api && npm run lint

# Backend tests
cd kms-api && npm test -- --passWithNoTests
```

### Level 2 — Smoke Test Gate (curl-based)
- Health endpoint returns 200
- Register returns 201
- Login returns 200 + tokens
- Protected endpoint returns 200 with token
- Protected endpoint returns 401 without token

### Level 3 — Standards Gate (checklist)
Per ENGINEERING_STANDARDS.md:
- [ ] All NestJS services use @InjectPinoLogger
- [ ] All service methods have @Trace()
- [ ] All endpoints have Swagger docs
- [ ] All DTOs validated
- [ ] No raw HttpException (must use AppException)
- [ ] Frontend uses shadcn/ui primitives (not raw HTML)
- [ ] No `any` types in TypeScript

### Level 4 — Manual Gate (human verification)
- [ ] UI renders in browser
- [ ] Auth flow works end-to-end
- [ ] No console errors in browser

## Decision Matrix

| L1 | L2 | L3 | L4 | Decision |
|----|----|----|----|----|
| ✅ | ✅ | ✅ | ✅ | SHIP |
| ✅ | ✅ | ⚠️ | ✅ | SHIP with tech debt logged |
| ✅ | ✅ | ✅ | ❌ | HOLD — manual QA required |
| ✅ | ❌ | any | any | BLOCK — fix smoke tests |
| ❌ | any | any | any | BLOCK — fix build |

## Output
Report each gate result and give a GO / NO-GO decision with specific blockers listed.
