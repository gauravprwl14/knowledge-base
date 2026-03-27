# 0016 — OpenAPI 3.1 YAML as Single Source of Truth for API Contracts

- **Status**: Accepted
- **Date**: 2026-03-17
- **Deciders**: Architecture Team
- **Tags**: [api, contracts, documentation, codegen]

## Context and Problem Statement

Multiple services consume the same API contracts — NestJS services expose them, Python clients call them, frontend TypeScript consumes them. Without a single source of truth, types drift: a Python Pydantic model might accept a field that the NestJS DTO rejects, causing runtime failures.

## Decision Outcome

Chosen: **OpenAPI 3.1 YAML at `contracts/openapi.yaml`** — TypeScript types and Python Pydantic models are generated from this file. No manually written types for API contracts.

### Code Generation Pipeline

```bash
# Generate TypeScript types
openapi-typescript contracts/openapi.yaml \
  --output packages/contracts/src/generated.ts

# Generate Python Pydantic v2 models
datamodel-code-generator \
  --input contracts/openapi.yaml \
  --input-file-type openapi \
  --output services/shared/src/generated/ \
  --output-model-type pydantic_v2.BaseModel
```

### Consequences

**Good:**
- Single change point for contract updates
- TypeScript and Python models always in sync
- Swagger UI auto-generated from the same spec
- Enables contract testing

**Bad / Trade-offs:**
- Requires code generation step in CI
- Swagger decorators in NestJS become redundant if we fully switch to spec-first — tolerated for now
- Team must learn OpenAPI 3.1 syntax
