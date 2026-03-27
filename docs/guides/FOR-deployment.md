# FOR-deployment.md — Production Deployment Runbook

This guide covers the safe production deployment procedure for the KMS stack.
Always follow the migration-first pattern — skipping it will cause the API to start
against a schema that hasn't been migrated yet, resulting in runtime errors.

---

## 1. Pre-deploy Checklist

Before deploying any service, confirm all of the following:

- [ ] `.env.prod` is present on the server with all required secrets populated.
- [ ] New env vars introduced in this release are added to `.env.prod` (and `.env.kms.example`).
- [ ] All pending Prisma migrations are committed in `kms-api/prisma/migrations/`.
- [ ] The target image builds locally: `docker compose -f docker-compose.prod.yml --env-file .env.prod build <service>`.
- [ ] Tests pass: `cd kms-api && npm run test`.
- [ ] No `console.log` or hardcoded secrets in the diff (`git diff main`).

---

## 2. Single Service Deploy

Use this pattern to redeploy one service without restarting unrelated containers.

```bash
# Rebuild the image for the changed service
docker compose -f docker-compose.prod.yml --env-file .env.prod build <service-name>

# Start only the target service (--no-deps prevents cascading restarts)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps <service-name>

# Tail logs to confirm a clean startup
docker compose -f docker-compose.prod.yml logs -f <service-name>
```

Replace `<service-name>` with one of: `kms-api`, `search-api`, `web-ui`, `rag-service`,
`scan-worker`, `embed-worker`, `dedup-worker`, `graph-worker`, `voice-app`.

---

## 3. Migration-First Deploy (CRITICAL)

**Always run migrations BEFORE the new image starts.** The new application code may depend
on schema changes that do not exist yet. Starting the image first causes startup crashes
or silent data corruption.

### Step-by-step for `kms-api`

```bash
# Step 1: Run migrations against the running (old) container BEFORE rebuilding
docker exec \
  -e DATABASE_URL="postgresql://kms:<password>@postgres:5432/kms" \
  kms-prod-kms-api-1 \
  npx prisma migrate deploy

# Step 2: Rebuild the image with the new source
docker compose -f docker-compose.prod.yml --env-file .env.prod build kms-api

# Step 3: Restart only kms-api (infra services are unaffected)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps kms-api

# Step 4: Verify clean startup
docker compose -f docker-compose.prod.yml logs -f kms-api
```

Replace `<password>` with the value of `POSTGRES_PASSWORD` in `.env.prod`.

The container name (`kms-prod-kms-api-1`) is determined by Docker Compose using the
`name:` field in `docker-compose.prod.yml` plus the service name. Verify with:

```bash
docker ps --format '{{.Names}}' | grep kms-api
```

### When there are no pending migrations

If no schema changes are in this release, Step 1 is a no-op — `prisma migrate deploy`
reports "All migrations have been applied" and exits cleanly. It is safe to run every
time.

---

## 4. Rollback Procedure

If the new image fails to start or causes errors after deployment:

```bash
# 1. Identify the previous image tag (or use the cached layer)
docker images | grep kms-api

# 2. Roll back to the previous image by reverting the git commit and rebuilding
git revert HEAD --no-edit
git push origin main   # triggers CI if configured, or rebuild manually

# 3. Rebuild and redeploy the reverted image
docker compose -f docker-compose.prod.yml --env-file .env.prod build kms-api
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps kms-api

# 4. If the migration must also be reverted, connect directly and run SQL
#    (Prisma does not support automatic down-migrations — write rollback SQL manually)
docker exec -it kms-prod-postgres-1 psql -U kms -d kms
```

Note: Prisma migrations are forward-only by design. If the migration is backward-compatible
(additive columns, nullable fields), the old image will run fine on the new schema.
If it is breaking (column drops, renames), you must coordinate a maintenance window.

---

## 5. Common Deployment Mistakes

| Mistake | Consequence | Correct approach |
|---------|-------------|-----------------|
| Running `docker compose up` without `--env-file .env.prod` | All secrets default to empty strings; service crashes immediately | Always pass `--env-file .env.prod` |
| Omitting `--no-deps` on a single-service deploy | Docker restarts all dependent containers (postgres, redis, rabbitmq), causing downtime | Always use `--no-deps` for targeted deploys |
| Starting the new image before running migrations | API boots against an out-of-date schema; Prisma throws `P1001` or field-not-found errors | Run `prisma migrate deploy` first (Step 1 above) |
| Running `prisma migrate dev` in production | Creates a shadow database, generates a new migration from drift — corrupts the migration history | Only use `prisma migrate deploy` in production |
| Forgetting to update `.env.prod` with new env vars | Service starts but config validation throws; app is unusable | Always check the pre-deploy checklist |

---

## 6. Full Stack Restart (Emergency Only)

Use only when infrastructure services (postgres, redis, rabbitmq) themselves need
to be restarted. This causes a brief outage for all services.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Do not use this for routine application deploys.
