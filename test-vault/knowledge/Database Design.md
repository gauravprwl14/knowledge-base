# Database Design

## Multi-Tenancy
Every table has a `user_id` column. Every query filters by `user_id`. No exceptions.

## Naming Conventions
- Tables: `domain_prefix_plural` — `kms_files`, `auth_users`
- Columns: `snake_case` — `created_at`, `mime_type`
- PKs: UUID v4

## Migrations
Use Prisma Migrate. Never edit migration files after they're applied.
Name migrations descriptively: `add_kms_files_source_external_id_unique`.

## Indexes
- Always index `user_id` for tenant isolation
- Composite indexes for common filter patterns: `(user_id, status)`
- Unique indexes for business keys: `(source_id, external_id)`
