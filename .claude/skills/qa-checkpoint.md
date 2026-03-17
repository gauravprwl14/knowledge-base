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
