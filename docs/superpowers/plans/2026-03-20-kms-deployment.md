# KMS Full-Stack Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the full KMS stack under `https://rnd.blr0.geekydev.com/kms` using the server's existing Nginx and Docker setup.

**Architecture:** Three Nginx location blocks route `/kms/api/v1/(chat|runs|agents)` to rag-service (SSE), `/kms/api` to kms-api (REST), and `/kms` to the Next.js frontend — all running as Docker containers bound to 127.0.0.1. One code change (Next.js `basePath`) and two config changes (docker-compose env var, feature flags) prepare the stack; then Docker builds and starts it; then Nginx is wired.

**Tech Stack:** Docker Compose v5, NestJS 11 (Fastify), FastAPI, Next.js 14, PostgreSQL 17, Redis 7.4, RabbitMQ 4.1, Qdrant v1.13, Neo4j 5.26, MinIO, BGE-M3 (embed-worker), Nginx 1.18

**Spec:** `docs/superpowers/specs/2026-03-20-kms-deployment-design.md`

---

## File Map

| File | Action | What changes |
|---|---|---|
| `frontend/next.config.js` | Modify | Add `basePath: '/kms'` inside `nextConfig` |
| `docker-compose.prod.yml` | Modify | Add `GOOGLE_CALLBACK_URL` + `GOOGLE_REDIRECT_URI` to kms-api environment block |
| `.kms/config.json` | Modify | Enable embedding, search, RAG, googleDrive; disable voiceTranscription + voiceWorker |
| `.env.prod` | Create | All production secrets (git-ignored, never committed) |
| `/etc/nginx/apps.d/rnd-kms.conf` | Create | Three location blocks for KMS path routing |

---

## Task 1: Update Feature Flags

**Files:**
- Modify: `.kms/config.json`

- [ ] **Step 1: Enable production features, disable deferred ones**

Edit `.kms/config.json` — change these specific values:

```json
"embedding":          { "enabled": true  }
"semanticSearch":     { "enabled": true  }
"hybridSearch":       { "enabled": true  }
"rag":                { "enabled": true  }
"voiceTranscription": { "enabled": false }
"googleDrive":        { "enabled": true  }
"llm":                { "enabled": true, "provider": "anthropic" }
"workers.embedWorker":  { "enabled": true  }
"workers.voiceWorker":  { "enabled": false }
"agents.ragAgent":      { "enabled": true  }
```

Keep everything else unchanged (`graphWorker: false`, `graph.enabled: false`, `objectStorage.enabled: false`).

- [ ] **Step 2: Verify JSON is valid**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
python3 -c "import json; json.load(open('.kms/config.json')); print('valid')"
```

Expected output: `valid`

- [ ] **Step 3: Commit**

```bash
git add .kms/config.json
git commit -m "feat(config): enable embedding, search, RAG, and Google Drive for production"
```

---

## Task 2: Add Missing Env Vars and Volume Mount to docker-compose.prod.yml

**Files:**
- Modify: `docker-compose.prod.yml`

- [ ] **Step 1: Add Google OAuth vars to kms-api environment**

In `docker-compose.prod.yml`, find the kms-api environment block (around line 191 where `GOOGLE_CLIENT_ID` is). Add two lines immediately after `GOOGLE_CLIENT_SECRET`:

```yaml
      GOOGLE_CALLBACK_URL: ${GOOGLE_CALLBACK_URL:-}
      GOOGLE_REDIRECT_URI: ${GOOGLE_REDIRECT_URI:-}
```

- [ ] **Step 2: Add .kms/config.json volume mount to kms-api service**

The kms-api Dockerfile's production stage does NOT copy `.kms/config.json` into the image — it only copies `dist/`, `node_modules/`, `prisma/`, and `package.json`. Without a volume mount, all feature flags silently revert to hardcoded defaults (e.g. voiceTranscription defaults to `true`), making Task 1 ineffective.

In `docker-compose.prod.yml`, find the `kms-api` service's `volumes:` block (or add one if absent) and add:

```yaml
    volumes:
      - ./.kms/config.json:/app/.kms/config.json:ro
```

- [ ] **Step 4: Validate compose file syntax**

```bash
docker compose -f docker-compose.prod.yml config --quiet 2>&1
```

Expected: no output (silent success). Any YAML errors will print here.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.prod.yml
git commit -m "fix(compose): add Google OAuth vars and .kms config volume mount to kms-api"
```

---

## Task 3: Add Next.js basePath

**Files:**
- Modify: `frontend/next.config.js`

- [ ] **Step 1: Add basePath to nextConfig**

In `frontend/next.config.js`, add `basePath: '/kms'` as the first property inside `nextConfig`:

```js
const nextConfig = {
  basePath: '/kms',
  output: 'standalone',
  // ... rest unchanged
};
```

Do NOT remove the `rewrites()` block or the `withNextIntl` wrapper.

- [ ] **Step 2: Verify file is still syntactically valid**

```bash
node -e "require('./frontend/next.config.js'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add frontend/next.config.js
git commit -m "feat(frontend): set basePath=/kms for sub-path deployment under rnd.blr0.geekydev.com"
```

---

## Task 4: Create .env.prod

**Files:**
- Create: `.env.prod` (git-ignored — never commit this file)

> **This task requires interactive input.** You need real secret values. Run each `openssl` command to generate secrets, then fill in the blanks.

- [ ] **Step 1: Add .env.prod to .gitignore**

The current `.gitignore` only covers `.env` and `.env.local` — `.env.prod` is NOT covered. Run this unconditionally:

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
echo ".env.prod" >> .gitignore
git add .gitignore
git commit -m "chore: add .env.prod to .gitignore"
```

Verify:
```bash
git check-ignore -v .env.prod
```

Expected: `.gitignore:N:.env.prod    .env.prod` — confirms it is now ignored.

- [ ] **Step 2: Generate all secrets**

Run these commands and save the output — you'll need them in Step 3:

```bash
echo "JWT_SECRET=$(openssl rand -base64 48)"
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 48)"
echo "API_KEY_ENCRYPTION_SECRET=$(openssl rand -hex 16)"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d /+=)"
echo "REDIS_PASSWORD=$(openssl rand -base64 24 | tr -d /+=)"
echo "RABBITMQ_PASS=$(openssl rand -base64 24 | tr -d /+=)"
echo "NEO4J_PASSWORD=$(openssl rand -base64 24 | tr -d /+=)"
echo "MINIO_PASSWORD=$(openssl rand -base64 24 | tr -d /+=)"
```

- [ ] **Step 3: Create .env.prod**

```bash
cat > /home/ubuntu/Sites/projects/gp/knowledge-base/.env.prod << 'ENVEOF'
# ── Database ─────────────────────────────────────────────────────────────────
POSTGRES_USER=kms
POSTGRES_DB=kms
POSTGRES_PASSWORD=REPLACE_WITH_GENERATED

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_PASSWORD=REPLACE_WITH_GENERATED

# ── RabbitMQ ──────────────────────────────────────────────────────────────────
RABBITMQ_USER=kmsadmin
RABBITMQ_PASS=REPLACE_WITH_GENERATED

# ── Auth ─────────────────────────────────────────────────────────────────────
JWT_SECRET=REPLACE_WITH_GENERATED
JWT_REFRESH_SECRET=REPLACE_WITH_GENERATED
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── API Key Encryption ────────────────────────────────────────────────────────
API_KEY_ENCRYPTION_SECRET=REPLACE_WITH_GENERATED_32CHARS

# ── Neo4j ─────────────────────────────────────────────────────────────────────
NEO4J_PASSWORD=REPLACE_WITH_GENERATED

# ── MinIO ─────────────────────────────────────────────────────────────────────
MINIO_USER=minioadmin
MINIO_PASSWORD=REPLACE_WITH_GENERATED

# ── LLM / RAG ─────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=REPLACE_WITH_YOUR_KEY
LLM_ENABLED=true
LLM_PROVIDER=anthropic

# ── Google OAuth ──────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID=REPLACE_WITH_YOUR_CLIENT_ID
GOOGLE_CLIENT_SECRET=REPLACE_WITH_YOUR_CLIENT_SECRET
GOOGLE_CALLBACK_URL=https://rnd.blr0.geekydev.com/kms/api/v1/auth/google/callback
GOOGLE_REDIRECT_URI=https://rnd.blr0.geekydev.com/kms/api/v1/sources/google-drive/callback

# ── Production URLs ───────────────────────────────────────────────────────────
PUBLIC_URL=https://rnd.blr0.geekydev.com/kms
CORS_ORIGINS=https://rnd.blr0.geekydev.com

# ── Observability ─────────────────────────────────────────────────────────────
OTEL_ENABLED=false

# ── Feature Config ────────────────────────────────────────────────────────────
KMS_CONFIG_PATH=./.kms/config.json
ENVEOF
```

Then open the file and replace every `REPLACE_WITH_*` value with the real secrets from Step 2 and your actual API keys.

- [ ] **Step 4: Verify all placeholders are filled**

```bash
grep "REPLACE_WITH" /home/ubuntu/Sites/projects/gp/knowledge-base/.env.prod
```

Expected: **no output**. If any lines appear, fill them in before proceeding.

- [ ] **Step 5: Verify API_KEY_ENCRYPTION_SECRET is exactly 32 chars**

```bash
grep "API_KEY_ENCRYPTION_SECRET" /home/ubuntu/Sites/projects/gp/knowledge-base/.env.prod | cut -d= -f2 | wc -c
```

Expected: `33` (32 chars + newline). If different, regenerate with `openssl rand -hex 16`.

---

## Task 5: Check RAM and Build Docker Images

- [ ] **Step 1: Check available RAM**

```bash
free -h
```

Expected: At least **14 GB available** (Avail column). If less, either free up RAM or reduce Neo4j memory in `docker-compose.prod.yml`:

```yaml
# In neo4j service environment, change:
NEO4J_dbms_memory_heap_max__size: 1G      # down from 2G
NEO4J_dbms_memory_pagecache_size: 512M    # down from 1G
```

- [ ] **Step 2: Build all production images**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
docker compose -f docker-compose.prod.yml --env-file .env.prod build 2>&1 | tee /tmp/kms-build.log
```

This takes 5-15 minutes. Watch for errors. Expected final lines contain `FINISHED` for each service.

- [ ] **Step 3: Verify all images were built**

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod config --services
docker images | grep "knowledge-base"
```

Expected: All services listed; images present with `knowledge-base` prefix.

---

## Task 6: Start Infrastructure Services

- [ ] **Step 1: Start infrastructure layer**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d \
  postgres redis rabbitmq qdrant neo4j minio
```

- [ ] **Step 2: Wait for all infrastructure to be healthy**

```bash
watch -n 3 'docker compose -f docker-compose.prod.yml ps --format "table {{.Name}}\t{{.Status}}"'
```

Wait until all 6 services show `healthy`. Press Ctrl+C when done.

Expected statuses:
- `kms-postgres` → `healthy`
- `kms-redis` → `healthy`
- `kms-rabbitmq` → `healthy`
- `kms-qdrant` → `healthy`
- `kms-neo4j` → `healthy`
- `kms-minio` → `healthy`

---

## Task 7: Run Database Migrations

- [ ] **Step 1: Run Prisma migrations**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm migrate
```

Expected: Output ends with `All migrations have been successfully applied.` or `Database is already up to date.`

- [ ] **Step 2: Verify migrations ran**

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm migrate \
  npx prisma migrate status
```

Expected: All migrations listed as `applied`.

---

## Task 8: Start All Application Services

- [ ] **Step 1: Start remaining services**

```bash
cd /home/ubuntu/Sites/projects/gp/knowledge-base
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

- [ ] **Step 2: Monitor startup (wait ~2 minutes)**

```bash
watch -n 5 'docker compose -f docker-compose.prod.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"'
```

Wait until all services are `running` and key services are `healthy`. Press Ctrl+C when stable.

- [ ] **Step 3: Check for any crashed containers**

```bash
docker compose -f docker-compose.prod.yml ps | grep -E "Exit|error|Restarting"
```

Expected: **no output**. If any service shows `Exit` or `Restarting`, check its logs:

```bash
docker compose -f docker-compose.prod.yml logs --tail=50 <service-name>
```

- [ ] **Step 4: Verify kms-api health directly**

```bash
curl -s http://127.0.0.1:8000/api/v1/health/live | python3 -m json.tool
```

Expected: `{ "status": "ok" }` or similar JSON.

- [ ] **Step 5: Verify rag-service health directly**

```bash
curl -s http://127.0.0.1:8002/health/live
```

Expected: `{"status":"ok"}` or `{"status":"healthy"}`.

- [ ] **Step 6: Verify web-ui is responding**

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/kms
```

Expected: `200` or `308` (redirect). Any 5xx means the frontend crashed — check logs.

---

## Task 9: Create Nginx Config

- [ ] **Step 1: Confirm existing server block has no conflicting catch-all**

```bash
grep -n "location" /etc/nginx/sites-available/rnd.blr0.geekydev.com
```

Expected: Only a `location /` with `try_files` and the `include /etc/nginx/apps.d/rnd-*.conf` line. No other location blocks that would shadow `/kms`.

- [ ] **Step 2: Write the Nginx config file**

```bash
sudo tee /etc/nginx/apps.d/rnd-kms.conf << 'NGINXEOF'
# KMS Knowledge Base — path-based routing under /kms
# Spec: docs/superpowers/specs/2026-03-20-kms-deployment-design.md

# Block 1: SSE streaming endpoints (rag-service)
# Connection "" is intentional for SSE — NOT "upgrade" (that is WebSocket only)
location ~* ^/kms/api/v1/(chat|runs|agents) {
    rewrite ^/kms(/.*)$ $1 break;
    proxy_pass http://127.0.0.1:8002;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Block 2: REST API (kms-api) — strips /kms prefix
location /kms/api {
    rewrite ^/kms(/.*)$ $1 break;
    proxy_pass http://127.0.0.1:8000;
    include /etc/nginx/snippets/proxy-params.conf;
}

# Block 3: Next.js frontend (web-ui)
location /kms {
    proxy_pass http://127.0.0.1:3000;
    include /etc/nginx/snippets/proxy-params.conf;
}
NGINXEOF
```

- [ ] **Step 3: Test Nginx configuration**

```bash
sudo nginx -t
```

Expected:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

If any errors appear, fix them before proceeding.

- [ ] **Step 4: Reload Nginx**

```bash
sudo systemctl reload nginx
```

Expected: no output (silent success).

---

## Task 10: End-to-End Verification

- [ ] **Step 1: Verify kms-api health through Nginx/public URL**

```bash
curl -s https://rnd.blr0.geekydev.com/kms/api/v1/health/live
```

Expected: `{"status":"ok"}` or similar. A 404 or 502 means the Nginx routing is broken — check `sudo nginx -t` and container status.

- [ ] **Step 2: Verify kms-api returns correct headers (not frontend)**

```bash
curl -s -I https://rnd.blr0.geekydev.com/kms/api/v1/health/live | grep -E "Content-Type|HTTP/"
```

Expected: `Content-Type: application/json`.

- [ ] **Step 3: Verify rag-service health directly (no public Nginx route)**

```bash
curl -s http://127.0.0.1:8002/health/live
```

Expected: `{"status":"ok"}` or `{"status":"healthy"}`.

- [ ] **Step 4: Verify search-api health (internal only)**

```bash
curl -s http://127.0.0.1:8001/health
```

Expected: `{"status":"ok"}`.

- [ ] **Step 5: Verify frontend loads through public URL**

```bash
curl -s -o /dev/null -w "%{http_code}" https://rnd.blr0.geekydev.com/kms
```

Expected: `200`. A `502` means web-ui is down — check `docker compose logs web-ui`.

- [ ] **Step 6: Verify frontend loads Next.js assets correctly**

```bash
curl -s -o /dev/null -w "%{http_code}" https://rnd.blr0.geekydev.com/kms/_next/static/chunks/main.js 2>/dev/null || \
curl -s -o /dev/null -w "%{http_code}" "https://rnd.blr0.geekydev.com/kms" -L
```

Expected: `200`.

- [ ] **Step 7: Verify existing apps still work (no regressions)**

```bash
curl -s -o /dev/null -w "%{http_code}" https://rnd.blr0.geekydev.com/resume
curl -s -o /dev/null -w "%{http_code}" https://rnd.blr0.geekydev.com/system-design
```

Expected: both `200` (or `301`/`302`). If either broke, check `sudo nginx -t` and review the new config for conflicts.

- [ ] **Step 8: Final — log all running KMS containers**

```bash
docker compose -f docker-compose.prod.yml ps
```

All services should show `running (healthy)` or `running`.

---

## Quick Reference: Useful Commands After Deployment

```bash
# View logs for a specific service
docker compose -f docker-compose.prod.yml logs -f kms-api
docker compose -f docker-compose.prod.yml logs -f rag-service
docker compose -f docker-compose.prod.yml logs -f embed-worker

# Restart a single service
docker compose -f docker-compose.prod.yml restart kms-api

# Stop everything
docker compose -f docker-compose.prod.yml down

# Stop and wipe volumes (DESTRUCTIVE — loses all data)
docker compose -f docker-compose.prod.yml down -v
```
