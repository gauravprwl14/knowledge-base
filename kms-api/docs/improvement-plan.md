# KMS API Improvement Plan

**Created**: 2026-01-09
**Issues Addressed**:
1. Error code system redesign (eliminate duplication, add properties)
2. JSDoc integration (TypeDoc configuration)
3. OpenTelemetry package updates (latest stable versions)
4. npm dependency conflict resolution (typescript vs typedoc)

---

## Issue 1: Error Code System Redesign

### Current Problems
- Error codes defined in one place, messages in `ERROR_MESSAGES` Record, HTTP status in `getHttpStatusForCode()` function
- No way to add additional properties (severity, retryable, user-facing, etc.)
- Maintenance burden: adding new error requires updating 3 separate locations
- Error codes are string literals with no metadata

### Proposed Solution: Object-Based Error Definitions

Replace string literal error codes with rich error definition objects:

```typescript
// New structure in src/errors/error-codes/index.ts
interface ErrorDefinition {
  code: string;
  message: string;
  httpStatus: number;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  retryable: boolean;
  userFacing: boolean;
}

export const VAL_ERROR_CODES = {
  INVALID_EMAIL: {
    code: 'VAL0001',
    message: 'Invalid email address',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  INVALID_PASSWORD: {
    code: 'VAL0002',
    message: 'Password must be at least 8 characters with uppercase, lowercase, and number',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  // ... other error definitions
} as const satisfies Record<string, ErrorDefinition>;

// Type extraction
export type ErrorCode = typeof VAL_ERROR_CODES[keyof typeof VAL_ERROR_CODES]['code'];
export type ErrorDefinitionType = typeof VAL_ERROR_CODES[keyof typeof VAL_ERROR_CODES];
```

### Benefits
- **Single Source of Truth**: All error metadata in one place
- **Type Safety**: TypeScript ensures all properties are present
- **Extensible**: Easy to add new properties (tags, documentation URLs, etc.)
- **No Duplication**: Eliminate ERROR_MESSAGES and getHttpStatusForCode()

### Migration Strategy
1. Define ErrorDefinition interface
2. Convert all error code objects to use new structure
3. Update ErrorFactory to accept ErrorDefinition instead of ErrorCode
4. Update AppError to use ErrorDefinition properties
5. Remove ERROR_MESSAGES Record and getHttpStatusForCode() function
6. Update all error throwing code to use new structure

### Files to Modify
- `src/errors/error-codes/index.ts` - Main refactor
- `src/errors/types/app-error.ts` - Accept ErrorDefinition
- `src/errors/types/error-factory.ts` - Use ErrorDefinition
- `src/common/filters/all-exceptions.filter.ts` - Access httpStatus from definition
- All modules throwing errors - Update to new API

---

## Issue 2: JSDoc Integration (TypeDoc)

### Current Problems
- TypeDoc installed (`^0.25.7`) but docs not generating
- `npm run docs:generate` script exists but `docs/api/` is empty
- No `typedoc.json` configuration file
- Dependency conflict with TypeScript version

### Proposed Solution: Configure and Update TypeDoc

**Step 1: Update TypeDoc to Latest**
- Upgrade from `^0.25.7` to `^0.27.0` (supports TypeScript 5.5+)
- Resolves dependency conflict with typescript@5.9.3

**Step 2: Create TypeDoc Configuration**

Create `typedoc.json`:
```json
{
  "$schema": "https://typedoc.org/schema.json",
  "entryPoints": ["src"],
  "entryPointStrategy": "expand",
  "out": "docs/api",
  "exclude": [
    "**/*.spec.ts",
    "**/*.e2e-spec.ts",
    "**/node_modules/**",
    "**/test/**"
  ],
  "plugin": ["typedoc-plugin-markdown"],
  "readme": "README.md",
  "name": "KMS API Documentation",
  "includeVersion": true,
  "categorizeByGroup": true,
  "categoryOrder": [
    "Modules",
    "Services",
    "Controllers",
    "Repositories",
    "Guards",
    "Interceptors",
    "Filters",
    "Decorators",
    "*"
  ],
  "validation": {
    "notExported": true,
    "invalidLink": true
  },
  "navigation": {
    "includeCategories": true,
    "includeGroups": true
  }
}
```

**Step 3: Add JSDoc Comments**

Add comprehensive JSDoc to key files:
```typescript
/**
 * Service responsible for user authentication and token management.
 *
 * @remarks
 * Handles user registration, login, password changes, and JWT token operations.
 * Implements security features like password hashing, failed login tracking, and account locking.
 *
 * @example
 * ```typescript
 * const authService = new AuthService(userRepo, jwtService, config);
 * const result = await authService.login({ email: 'user@example.com', password: 'pass' });
 * ```
 */
@Injectable()
export class AuthService {
  /**
   * Registers a new user account.
   *
   * @param registerDto - User registration data
   * @returns Newly created user (excluding password hash)
   * @throws {AppError} VAL0001 if email already exists
   * @throws {AppError} VAL0002 if password doesn't meet requirements
   */
  async register(registerDto: RegisterDto): Promise<Omit<User, 'passwordHash'>> {
    // ...
  }
}
```

**Step 4: Update npm Scripts**

Add additional documentation scripts to `package.json`:
```json
{
  "scripts": {
    "docs:generate": "typedoc",
    "docs:watch": "typedoc --watch",
    "docs:serve": "npx http-server docs/api -p 3001",
    "docs:clean": "rm -rf docs/api"
  }
}
```

### Benefits
- **Auto-Generated Docs**: HTML documentation from code comments
- **Type Information**: Shows interfaces, types, and signatures
- **Version Tracking**: Documentation versioned with code
- **Developer Experience**: IntelliSense shows JSDoc in IDE

### Files to Create/Modify
- `typedoc.json` - New configuration file
- `package.json` - Update docs scripts and typedoc version
- `src/**/*.ts` - Add JSDoc comments to public APIs
- `.gitignore` - Add `docs/api/` to ignore generated docs

---

## Issue 3: OpenTelemetry Package Updates

### Current Problems
- Inconsistent package versions:
  - `@opentelemetry/api: ^1.7.0` (latest is 1.9.0)
  - `@opentelemetry/sdk-node: ^0.47.0` (latest is 0.54.2)
  - `@opentelemetry/resources: 1.20.0` (should match SDK)
  - `@opentelemetry/semantic-conventions: ^1.20.0`
- Mismatched minor versions across packages
- Missing newer OTel features and bug fixes

### Proposed Solution: Update to Latest Stable 1.x/0.x Versions

**Update Strategy**:
1. Update `@opentelemetry/api` to latest 1.x (currently 1.9.0)
2. Update all SDK packages to latest 0.x (currently 0.54.2)
3. Ensure matching minor versions across related packages
4. Test that tracing and metrics still work

**Package Version Matrix**:

| Package | Current | Target | Category |
|---------|---------|--------|----------|
| `@opentelemetry/api` | ^1.7.0 | ^1.9.0 | Core API |
| `@opentelemetry/sdk-node` | ^0.47.0 | ^0.54.2 | SDK |
| `@opentelemetry/sdk-trace-node` | - | ^1.27.0 | Tracing |
| `@opentelemetry/resources` | 1.20.0 | ^1.27.0 | Resources |
| `@opentelemetry/semantic-conventions` | ^1.20.0 | ^1.27.0 | Conventions |
| `@opentelemetry/exporter-trace-otlp-grpc` | ^0.47.0 | ^0.54.2 | Exporters |
| `@opentelemetry/exporter-metrics-otlp-grpc` | ^0.47.0 | ^0.54.2 | Exporters |
| `@opentelemetry/instrumentation` | - | ^0.54.2 | Auto-instrument |
| `@opentelemetry/auto-instrumentations-node` | ^0.40.0 | ^0.51.1 | Auto-instrument |

**Updated package.json dependencies**:
```json
{
  "dependencies": {
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/sdk-node": "^0.54.2",
    "@opentelemetry/sdk-trace-node": "^1.27.0",
    "@opentelemetry/resources": "^1.27.0",
    "@opentelemetry/semantic-conventions": "^1.27.0",
    "@opentelemetry/exporter-trace-otlp-grpc": "^0.54.2",
    "@opentelemetry/exporter-metrics-otlp-grpc": "^0.54.2",
    "@opentelemetry/instrumentation": "^0.54.2",
    "@opentelemetry/instrumentation-http": "^0.54.2",
    "@opentelemetry/instrumentation-express": "^0.43.0",
    "@opentelemetry/instrumentation-nestjs-core": "^0.41.0",
    "@opentelemetry/auto-instrumentations-node": "^0.51.1"
  }
}
```

### Testing Checklist
- [ ] Verify traces appear in Jaeger/collector
- [ ] Verify metrics exported correctly
- [ ] Check custom decorators (@Trace, @RecordDuration) still work
- [ ] Test distributed trace context propagation
- [ ] Verify no breaking API changes in updated packages

### Files to Modify
- `package.json` - Update OTel package versions
- `src/telemetry/sdk/otel.sdk.ts` - Verify initialization code compatible
- `src/telemetry/decorators/*.ts` - Test decorators with new versions

---

## Issue 4: npm Dependency Conflict Resolution

### Current Problem
```
npm error ERESOLVE could not resolve
npm error Found: typescript@5.9.3
npm error Could not resolve dependency:
npm error dev typedoc@"^0.25.7"
npm error Conflicting peer dependency: typescript@5.4.5
```

**Root Cause**:
- `package.json` specifies `typescript: "^5.3.3"` which allows 5.9.x
- TypeDoc 0.25.7 peer dependency: `typescript: "4.6.x || ... || 5.4.x"`
- npm installed typescript 5.9.3 which exceeds TypeDoc's range

### Proposed Solution: Upgrade TypeDoc

**Recommended Approach**: Update TypeDoc to version that supports TypeScript 5.5+

```json
{
  "devDependencies": {
    "typedoc": "^0.27.0",  // Supports TypeScript 5.5+
    "typescript": "^5.3.3"   // Can stay as-is
  }
}
```

**Why This Solution**:
- TypeDoc 0.27.0 supports TypeScript 5.0 - 5.7+
- No need to downgrade TypeScript
- Future-proof for TypeScript updates
- Resolves npm install error

**Alternative Solutions** (NOT recommended):
1. Pin TypeScript to 5.4.x: `"typescript": "~5.4.5"` - limits future updates
2. Use `--legacy-peer-deps`: Ignores peer dependency errors - hides real conflicts

### Verification
After update, run:
```bash
npm install
npm run build
npm run docs:generate
```

### Files to Modify
- `package.json` - Update typedoc version

---

## Implementation Plan

### Phase 1: Dependency Updates (30 min)
**Goal**: Resolve npm conflicts and update packages

1. Update TypeDoc to `^0.27.0` in package.json
2. Update all OpenTelemetry packages to latest stable versions
3. Run `npm install` to verify no conflicts
4. Run `npm run build` to ensure compilation works
5. Commit: `chore(deps): update TypeDoc and OpenTelemetry packages`

**Success Criteria**: `npm install` and `npm run build` succeed without errors

---

### Phase 2: JSDoc Integration (1 hour)
**Goal**: Configure TypeDoc and generate documentation

1. Create `typedoc.json` configuration file
2. Update `package.json` scripts (docs:watch, docs:serve, docs:clean)
3. Add JSDoc comments to key files:
   - `src/modules/auth/auth.service.ts`
   - `src/modules/auth/auth.controller.ts`
   - `src/database/repositories/base.repository.ts`
   - `src/errors/types/error-factory.ts`
   - `src/telemetry/decorators/*.ts`
4. Run `npm run docs:generate`
5. Verify `docs/api/` directory created with HTML files
6. Add `docs/api/` to `.gitignore`
7. Commit: `docs: configure TypeDoc and add JSDoc comments`

**Success Criteria**: TypeDoc generates HTML documentation in `docs/api/`

---

### Phase 3: Error Code System Redesign (2 hours)
**Goal**: Eliminate duplication and add extensibility

1. Define `ErrorDefinition` interface in `src/errors/error-codes/index.ts`
2. Convert all error code objects to new structure:
   - `GEN_ERROR_CODES`
   - `VAL_ERROR_CODES`
   - `AUT_ERROR_CODES`
   - `AUZ_ERROR_CODES`
   - `DAT_ERROR_CODES`
   - `SRV_ERROR_CODES`
   - `EXT_ERROR_CODES`
3. Update type extraction for `ErrorCode` and add `ErrorDefinitionType`
4. Update `AppError` class to accept `ErrorDefinition`
5. Update `ErrorFactory` to use `ErrorDefinition`
6. Remove `ERROR_MESSAGES` Record
7. Remove `getHttpStatusForCode()` function
8. Update exception filter to use `definition.httpStatus`
9. Update all error throwing code across modules
10. Run tests to verify no regressions
11. Commit: `refactor(errors): redesign error code system with rich definitions`

**Success Criteria**:
- All tests pass
- Error responses include all new properties
- No duplication between code/message/httpStatus

---

### Phase 4: Testing and Verification (30 min)
**Goal**: Ensure all changes work correctly

1. Run unit tests: `npm run test`
2. Run integration tests: `npm run test:integration`
3. Run E2E tests: `npm run test:e2e`
4. Verify OTel traces in development:
   - Start services: `docker-compose up -d`
   - Make API requests
   - Check Jaeger UI for traces
   - Verify spans have correct attributes
5. Test error responses include new properties
6. Generate documentation: `npm run docs:generate`
7. Review generated docs for completeness

**Success Criteria**: All tests pass, OTel working, docs generated

---

### Phase 5: Documentation Updates (15 min)
**Goal**: Update README and docs

1. Update README.md with:
   - New error code structure documentation
   - JSDoc generation instructions
   - Updated OTel package versions
2. Add section on error handling with examples
3. Document new error properties (severity, retryable, userFacing)
4. Add docs generation to development workflow
5. Commit: `docs: update README with error system and JSDoc info`

**Success Criteria**: README documents all new features

---

## Rollback Plan

If issues arise during implementation:

1. **Dependency Issues**:
   - Revert `package.json` changes
   - Run `npm install`
   - Delete `package-lock.json` and `node_modules/`, reinstall

2. **Error System Breaking Changes**:
   - Revert error-codes/index.ts
   - Revert AppError and ErrorFactory changes
   - Run tests to verify rollback

3. **OTel Issues**:
   - Revert to previous OTel package versions
   - Clear traces and restart collector
   - Verify old SDK initialization still works

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OTel breaking changes | Medium | High | Test thoroughly, check migration guides |
| Error system migration bugs | Low | Medium | Comprehensive tests, gradual rollout |
| TypeDoc config issues | Low | Low | Use recommended defaults, test generation |
| Dependency conflicts | Low | Medium | Update one at a time, verify each step |

---

## Success Metrics

- ✅ `npm install` succeeds without warnings
- ✅ All tests pass (unit, integration, E2E)
- ✅ Error codes defined in single location
- ✅ Error definitions include 6+ properties
- ✅ TypeDoc generates HTML documentation
- ✅ OTel traces appear in collector
- ✅ No code duplication in error system
- ✅ Build succeeds without TypeScript errors

---

## Estimated Timeline

- **Total**: ~4 hours
- **Phase 1** (Dependencies): 30 min
- **Phase 2** (JSDoc): 1 hour
- **Phase 3** (Error System): 2 hours
- **Phase 4** (Testing): 30 min
- **Phase 5** (Docs): 15 min

---

## Files Summary

### Files to Create (3)
1. `typedoc.json` - TypeDoc configuration
2. `.typedocignore` - Exclude patterns (optional)
3. `docs/improvement-plan.md` - This plan

### Files to Modify (15+)
1. `package.json` - Dependency versions and scripts
2. `.gitignore` - Ignore generated docs
3. `src/errors/error-codes/index.ts` - Main refactor
4. `src/errors/types/app-error.ts` - Accept ErrorDefinition
5. `src/errors/types/error-factory.ts` - Use ErrorDefinition
6. `src/common/filters/all-exceptions.filter.ts` - Use definition.httpStatus
7. `src/modules/auth/auth.service.ts` - Add JSDoc, update errors
8. `src/modules/auth/auth.controller.ts` - Add JSDoc
9. `src/database/repositories/base.repository.ts` - Add JSDoc
10. `src/telemetry/sdk/otel.sdk.ts` - Verify compatibility
11. `README.md` - Document new features
12. All files throwing errors - Update to new error API

### Files to Delete (0)
- No files deleted (ERROR_MESSAGES and getHttpStatusForCode removed within index.ts)

---

## Next Steps After Approval

1. Get user approval for this plan
2. Execute Phase 1 (dependencies) and verify npm install works
3. Proceed through phases sequentially
4. Test after each phase
5. Create session summary document when complete
