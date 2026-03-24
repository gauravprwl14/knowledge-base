# 0005 — Admin RBAC Approach: Enum Column vs Separate Roles Table

- **Status**: Accepted
- **Date**: 2026-03-24
- **Deciders**: Gaurav (Ved)
- **Tags**: [auth, rbac, postgresql, prisma]

## Context and Problem Statement

KMS needs to gate the new Admin Dashboard behind an ADMIN role so that only designated operators can view system-wide data. The system currently has a `users` table with no role differentiation — every authenticated user is treated equally. We must choose how to represent roles in the data model before implementing the `AdminGuard` and admin API endpoints.

Two broad approaches exist: adding an enum column directly on the `users` table, or creating a separate `user_roles` join table that allows assigning multiple roles per user.

## Decision Drivers

- KMS has exactly two user-facing roles: regular users (USER) and administrators (ADMIN). The `SERVICE_ACCOUNT` value is reserved for internal API-key users.
- The `UserRole` enum (`ADMIN`, `USER`, `SERVICE_ACCOUNT`) and a `role` column with `@@index([role])` already exist in `schema.prisma` at line 50 — the Prisma migration has already been applied.
- No feature on the roadmap (PRDs M00–M15, plus new PRDs) requires fine-grained permissions (e.g. "can delete files but not view users").
- Solo operator, time-constrained project; unnecessary abstractions incur real maintenance cost.
- Adding a join table after the fact is a straightforward migration if requirements change.

## Considered Options

- **Option A**: Single `role` enum column on `users` table (current schema state)
- **Option B**: Separate `user_roles` join table (`user_id` + `role` + `granted_at`) allowing multiple roles per user
- **Option C**: Full RBAC with permissions table (`roles`, `permissions`, `role_permissions`, `user_roles`)

## Decision Outcome

**Chosen: Option A — Single enum column on the `users` table.**

The column already exists and is indexed. No migration is needed. `AdminGuard` can check `req.user.role === 'ADMIN'` in a single comparison. The JWT payload already carries the user entity from `JwtStrategy.validate()`, so the role can be included in the token without any additional query.

Option B would add schema complexity, require an extra JOIN on every authenticated request (or a second DB call in the JWT strategy), and solve a problem (multiple concurrent roles) that does not exist in KMS today or on the 12-month roadmap.

Option C is appropriate for multi-tenant SaaS with fine-grained resource permissions; KMS is a single-tenant personal knowledge base tool and does not need this level of complexity.

### Consequences

**Good:**
- Zero additional migration — the column and index are already live
- `AdminGuard` implementation is a one-liner: `req.user.role === UserRole.ADMIN`
- JWT strategy can include `role` in the token payload at negligible cost
- Prisma queries for admin APIs can filter by role with the existing `@@index([role])` index

**Bad / Trade-offs:**
- A user can only hold one role at a time; to grant someone temporary admin access and then revoke it, the `role` column must be updated directly (no revocation log)
- If KMS later needs fine-grained permissions (e.g. read-only admin, collection managers), a join table migration will be required — but this can be done with backward compatibility by keeping the existing column as a fast-path cache

## Pros and Cons of the Options

### Option A: Enum column on `users`

- Already implemented — no migration, no PR risk
- Simple guard: `user.role === 'ADMIN'`
- One indexed column; no JOIN overhead
- Cannot represent multiple concurrent roles
- No audit trail for role changes

### Option B: `user_roles` join table

- Supports multiple simultaneous roles (e.g. ADMIN + MODERATOR)
- Natural audit trail via `granted_at` / `revoked_at` columns
- Extra JOIN on every authenticated request, or denormalization back to a column
- Significant over-engineering for a two-role system
- Requires a migration and updated `JwtStrategy`

### Option C: Full RBAC permissions table

- Maximum flexibility for enterprise permission models
- Appropriate for multi-tenant or large-team environments
- Orders-of-magnitude more complexity: 4 tables, permission checks on every resource access
- Not needed by any current or planned KMS feature

## Implementation Notes

1. `JwtStrategy.validate()` in `kms-api/src/modules/auth/strategies/jwt.strategy.ts` must return `role` alongside `id` and `email` so that `AdminGuard` can read it from `req.user` without an extra DB call.
2. `AdminGuard` lives in `kms-api/src/modules/admin/guards/admin.guard.ts` and implements `CanActivate`. It reads `request.user.role` and throws `AppException` with code `KBAUT0010` and HTTP 403 if the role is not ADMIN.
3. To bootstrap the first admin, add a seed entry in `kms-api/prisma/seed.ts` or update the row directly: `UPDATE users SET role = 'ADMIN' WHERE email = 'admin@example.com';`
4. No UI role-assignment is in scope for this ADR; role changes are DB-only until a future admin user-management feature ships.
