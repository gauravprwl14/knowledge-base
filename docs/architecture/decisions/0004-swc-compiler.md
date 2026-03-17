# 0004 — SWC Compiler for NestJS

- **Status**: Accepted
- **Date**: 2026-03-17
- **Deciders**: Architecture Team
- **Tags**: [nestjs, build, dx]

## Context and Problem Statement

NestJS projects default to `tsc` for TypeScript compilation. For a monorepo with multiple NestJS services (kms-api, search-api), build time is critical for developer experience and CI/CD pipelines.

## Decision Outcome

Chosen: **SWC** — 10-20x faster than tsc, with `typeCheck: true` in nest-cli.json to retain type checking.

### Critical SWC + NestJS Configuration

SWC does NOT emit `emitDecoratorMetadata` by default. Without this, NestJS DI (`@Injectable()`, `@InjectRepository()`, etc.) silently fails.

**Required `.swcrc`:**
```json
{
  "jsc": {
    "transform": {
      "legacyDecorator": true,
      "decoratorMetadata": true
    },
    "keepClassNames": true
  }
}
```

**Required `nest-cli.json`:**
```json
{
  "compilerOptions": {
    "builder": { "type": "swc" },
    "typeCheck": true
  }
}
```

### Consequences

**Good:**
- 10-20x faster compilation in watch mode
- CI build time reduced significantly
- `typeCheck: true` retains full TypeScript checking in parallel

**Bad / Trade-offs:**
- `keepClassNames: true` required or class names become minified (breaks DI token resolution)
- Path aliases in `tsconfig.json` must be mirrored in `.swcrc`
