# 0002 — Prisma over TypeORM and Drizzle for NestJS ORM

- **Status**: Accepted
- **Date**: 2026-03-17
- **Deciders**: Architecture Team
- **Tags**: [nestjs, database, orm, migrations]

## Context and Problem Statement

The KMS API needs an ORM for PostgreSQL with: type-safe query building, migration management, schema introspection, and async support. Three mature options exist for NestJS: TypeORM, Prisma, and Drizzle.

## Decision Drivers

- End-to-end type safety (TypeScript types from schema)
- Safe migration workflow (no accidental data loss)
- NestJS DI integration
- Query builder expressiveness for complex filtering and pagination
- Active maintenance and community

## Considered Options

- Option A: Prisma 5
- Option B: TypeORM
- Option C: Drizzle ORM

## Decision Outcome

Chosen: **Option A — Prisma 5** — Superior type safety via generated client, migration safety with `prisma migrate`, and best-in-class NestJS integration via `PrismaService`.

### Consequences

**Good:**
- Auto-generated TypeScript client with full type inference on queries
- `prisma migrate dev` generates SQL migrations with diff review
- `prisma studio` for data exploration in development
- Single `schema.prisma` file as source of truth for database schema

**Bad / Trade-offs:**
- Prisma adds a query engine binary (~30MB) to production images
- N+1 query patterns require explicit `include` — requires awareness
- No support for all PostgreSQL-specific syntax (use `$queryRaw` for GIN indexes, tsvector operations)
- Migration locking in concurrent production deploys requires care

## Pros and Cons of the Options

### Option A: Prisma 5

- ✅ Type-safe query client generated from schema
- ✅ Declarative migrations with rollback support
- ✅ Built-in `PrismaService` pattern for NestJS
- ✅ Active development, excellent docs
- ❌ Query engine binary in Docker image
- ❌ Limited support for advanced PG features (use `$queryRaw` workaround)

### Option B: TypeORM

- ✅ Mature, widely used in NestJS community
- ✅ Active record and data mapper patterns
- ❌ Type safety gaps in complex queries
- ❌ Migration system known for unexpected DROP TABLE in some scenarios
- ❌ Decorator-heavy schema definition is verbose
- ❌ Slower development velocity due to manual type wiring

### Option C: Drizzle ORM

- ✅ Pure TypeScript — no binary, minimal overhead
- ✅ Excellent type inference for complex queries
- ✅ Supports raw SQL easily
- ❌ Smaller community than TypeORM/Prisma
- ❌ NestJS integration requires manual setup
- ❌ Migration tooling less mature than Prisma
