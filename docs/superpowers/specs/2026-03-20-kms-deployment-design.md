# KMS Full-Stack Deployment Design
**Date**: 2026-03-20
**Status**: Approved
**Domain**: `rnd.blr0.geekydev.com`
**Path prefix**: `/kms`

---

## 1. Goal

Deploy the full KMS stack (all services) on the existing Ubuntu server, accessible at `https://rnd.blr0.geekydev.com/kms`, using the server's existing Nginx instance for path-based routing. No new domain or SSL cert required.

---

## 2. Architecture

### Request Routing (Nginx)

```
https://rnd.blr0.geekydev.com
│
├── /kms/api/v1/chat      → rag-service:8002  (SSE, no buffering)
├── /kms/api/v1/runs      → rag-service:8002  (SSE, no buffering)
├── /kms/api/v1/agents    → rag-service:8002  (SSE, no buffering)
├── /kms/api              → kms-api:8000      (REST, /kms prefix stripped)
├── /kms/_next            → web-ui:3000       (Next.js static assets)
└── /kms                  → web-ui:3000       (Next.js SPA, basePath=/kms)
```

### Service Topology

| Service | Technology | Host Port | Notes |
|---|---|---|---|
| kms-api | NestJS 11 + Fastify | 127.0.0.1:8000 | Core REST API |
| search-api | NestJS 11 + Fastify | internal only | Called by kms-api via Docker network |
| rag-service | FastAPI | 127.0.0.1:8002 | RAG + SSE streaming |
| web-ui | Next.js 14 | 127.0.0.1:3000 | Frontend, basePath=/kms |
| voice-app | FastAPI | internal only | **Phase 2** — add to prod compose first |
| scan-worker | Python AMQP | none | File discovery |
| embed-worker | Python AMQP | none | BGE-M3 embeddings (1.4 GB model) |
| dedup-worker | Python AMQP | none | Deduplication |
| graph-worker | Python AMQP | none | Neo4j relationship builder (deferred) |
| postgres | PostgreSQL 17 | internal only | No host port (avoids conflict with existing postgres:5432) |
| redis | Redis 7.4 | internal only | |
| rabbitmq | RabbitMQ 4.1 | internal only | |
| qdrant | Qdrant v1.13 | internal only | Vector DB |
| neo4j | Neo4j 5.26 | internal only | Graph DB |
| minio | MinIO | internal only | Object storage |

All infrastructure services have **no host ports** — accessed only via the Docker internal network. This avoids conflicts with existing running containers (reactive_resume postgres on 5432, devops otel-collector on 4317-4318, devops prometheus on 9090).

---

## 3. Nginx Configuration

**File**: `/etc/nginx/apps.d/rnd-kms.conf`
**Included by**: `/etc/nginx/sites-available/rnd.blr0.geekydev.com` via `include /etc/nginx/apps.d/rnd-*.conf;`

> **Pre-flight check**: Before writing this file, confirm the existing server block for `rnd.blr0.geekydev.com` has no inline `location /` catch-all that would shadow `/kms`. The current file at `/etc/nginx/sites-available/rnd.blr0.geekydev.com` only has a `try_files` default block — the included `apps.d` configs add all specific location blocks. Nginx evaluates regex locations (`~*`) before prefix locations, so Block 1 will correctly take priority over Blocks 2 and 3.

Three location blocks in priority order:

### Block 1 — SSE / Streaming (rag-service)

> `Connection ""` (empty string) is intentional for SSE. It tells the upstream this is a persistent HTTP/1.1 connection with no protocol upgrade. Do NOT change this to `Connection "upgrade"` — that is for WebSocket only and will break SSE streams.

```nginx
location ~* ^/kms/api/v1/(chat|runs|agents) {
    rewrite ^/kms(/.*)$ $1 break;
    proxy_pass http://127.0.0.1:8002;
    proxy_http_version 1.1;
    proxy_set_header Connection "";   # SSE — NOT "upgrade" (WebSocket)
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Block 2 — REST API (kms-api)
```nginx
location /kms/api {
    rewrite ^/kms(/.*)$ $1 break;
    proxy_pass http://127.0.0.1:8000;
    include /etc/nginx/snippets/proxy-params.conf;
}
```

### Block 3 — Frontend (web-ui)
```nginx
location /kms {
    proxy_pass http://127.0.0.1:3000;
    include /etc/nginx/snippets/proxy-params.conf;
}
```

---

## 4. Code Change — Next.js basePath

**File**: `frontend/next.config.js` (or `next.config.ts`)
**Change**: Add `basePath: '/kms'` to the Next.js config so the app knows it is mounted at a sub-path.

```js
const nextConfig = {
  basePath: '/kms',
  // ...existing config
};
```

Next.js automatically prefixes all page routes and `/_next/` asset paths with `/kms`.

> **Important**: The existing `rewrites()` block in `next.config.js` rewrites `/api/:path*` to the internal Docker URL (`http://kms-api:8000`). This is for **SSR-side** calls only — Next.js strips `basePath` before matching rewrites, so it continues to work correctly. Do NOT remove the `rewrites()` block when adding `basePath`. Client-side API calls use `NEXT_PUBLIC_API_URL` (absolute URL) and go through Nginx directly — they do not pass through the Next.js rewrite.

---

## 5. Environment Configuration

### Strategy
- **Ubuntu-level** (`/etc/environment`): No KMS variables — keeps system env clean
- **Project-level** (`.env.prod` at project root, git-ignored): All secrets passed via `--env-file` flag

### `.env.prod` Variables

| Variable | Source | Notes |
|---|---|---|
| `POSTGRES_USER` | `kms` | Required (no default in prod compose) |
| `POSTGRES_DB` | `kms` | Required (no default in prod compose) |
| `POSTGRES_PASSWORD` | Generated | Strong password |
| `REDIS_PASSWORD` | Generated | Required in production |
| `RABBITMQ_USER` | Choose | Not default `guest` |
| `RABBITMQ_PASS` | Generated | Strong password |
| `JWT_SECRET` | `openssl rand -base64 48` | Min 32 chars |
| `JWT_REFRESH_SECRET` | `openssl rand -base64 48` | Min 32 chars |
| `JWT_EXPIRES_IN` | `15m` | Optional — default is 15m. Note: mapped to `JWT_ACCESS_EXPIRATION` inside the container by docker-compose.prod.yml |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Optional — default is 7d. Note: mapped to `JWT_REFRESH_EXPIRATION` inside the container by docker-compose.prod.yml |
| `API_KEY_ENCRYPTION_SECRET` | `openssl rand -hex 16` | Exactly 32 chars |
| `MINIO_USER` | `minioadmin` | Default ok |
| `MINIO_PASSWORD` | Generated | Strong password |
| `NEO4J_PASSWORD` | Generated | Strong password |
| `ANTHROPIC_API_KEY` | User provides | Required for RAG |
| `GOOGLE_CLIENT_ID` | User provides | Google OAuth (login + Drive) |
| `GOOGLE_CLIENT_SECRET` | User provides | Google OAuth (login + Drive) |
| `GOOGLE_CALLBACK_URL` | `https://rnd.blr0.geekydev.com/kms/api/v1/auth/google/callback` | Passport Google Strategy |
| `GOOGLE_REDIRECT_URI` | `https://rnd.blr0.geekydev.com/kms/api/v1/sources/google-drive/callback` | Google Drive source OAuth — **must also be added to `kms-api.environment` in `docker-compose.prod.yml`** (read via `process.env` in `sources.service.ts`, not through the Zod config schema) |
| `PUBLIC_URL` | `https://rnd.blr0.geekydev.com/kms` | Fixed |
| `CORS_ORIGINS` | `https://rnd.blr0.geekydev.com` | Fixed |
| `LLM_ENABLED` | `true` | Enable RAG |
| `LLM_PROVIDER` | `anthropic` | Use Anthropic API |
| `OTEL_ENABLED` | `false` | Extend devops stack later if needed |
| `KMS_CONFIG_PATH` | `./.kms/config.json` | Default |

### Google Console — OAuth Redirect URIs to Register

Two URIs must be added to the Google Cloud Console for this deployment:

1. `https://rnd.blr0.geekydev.com/kms/api/v1/auth/google/callback` — user login (Passport Google Strategy)
2. `https://rnd.blr0.geekydev.com/kms/api/v1/sources/google-drive/callback` — Google Drive source connection

### Feature Flags (`.kms/config.json`)

Enable for this deployment:
- `embedding.enabled: true`
- `semanticSearch.enabled: true`
- `hybridSearch.enabled: true`
- `rag.enabled: true`
- `deduplication.enabled: true`
- `voiceTranscription.enabled: false` — **deferred**: voice-app is not yet in docker-compose.prod.yml; add in Phase 2
- `googleDrive.enabled: true`
- Workers: `embedWorker.enabled: true`, `graphWorker.enabled: false` (enable after Neo4j is validated), `voiceWorker.enabled: false` (deferred with voiceTranscription)

---

## 6. Execution Plan

### Phase 1 — Prepare (no downtime)
1. Check available RAM: `free -h` — need **≥14 GB free** for full stack (Neo4j prod config uses 3 GB alone + BGE-M3 ~4 GB)
2. Add `basePath: '/kms'` to `frontend/next.config.js` (preserve existing `rewrites()` block)
3. Build all Docker images: `docker compose -f docker-compose.prod.yml build`
4. Create `.env.prod` with all required secrets (interactive, secrets not stored in code)
5. Update `.kms/config.json` feature flags

### Phase 2 — Launch
6. Start infrastructure first: `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d postgres redis rabbitmq qdrant neo4j minio`
7. Run DB migrations: `docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm migrate`
8. Start all remaining services: `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d`
9. Verify all containers healthy: `docker compose -f docker-compose.prod.yml ps`

### Phase 3 — Wire Nginx
10. Inspect existing server block: confirm no inline `location /` catch-all in `/etc/nginx/sites-available/rnd.blr0.geekydev.com`
11. Create `/etc/nginx/apps.d/rnd-kms.conf` with the three location blocks from Section 3
12. Test config: `sudo nginx -t`
13. Reload: `sudo systemctl reload nginx`

### Phase 4 — Verify
14. `curl https://rnd.blr0.geekydev.com/kms/api/v1/health/live` → kms-api health (via Nginx)
15. `curl http://127.0.0.1:8002/health/live` → rag-service health (direct, no Nginx route for this)
16. `curl http://127.0.0.1:8001/health` → search-api health (internal only)
17. Open `https://rnd.blr0.geekydev.com/kms` in browser → frontend loads

---

## 7. Risk Register

| Risk | Mitigation |
|---|---|
| Insufficient RAM — full stack needs ≥14 GB free | Check `free -h`; reduce Neo4j to 1G heap / 512M pagecache if constrained (edit prod compose); disable graph-worker initially |
| BGE-M3 model download time (1.4 GB) | `hf_model_cache` Docker volume persists across restarts |
| Port conflict with existing postgres:5432 | KMS postgres has NO host port in prod compose — internal only |
| Next.js `rewrites()` + `basePath` interaction | Preserve `rewrites()` block; rewrites match after basePath is stripped — see Section 4 |
| Google Drive OAuth redirect URI mismatch | Register BOTH URIs in Google Console — see Section 5 |
| voice-app feature flag vs missing service | `voiceTranscription.enabled: false` until voice-app added to prod compose |
| rag-service health has no external Nginx route | Check directly: `curl http://127.0.0.1:8002/health/live` |

---

## 8. Out of Scope

- voice-app / local Whisper — Phase 2 (requires adding service to docker-compose.prod.yml)
- graph-worker — deferred until Neo4j is validated
- Observability stack for KMS — existing `devops-*` stack can be extended later
- Horizontal scaling / load balancing — single instance
- Automated backups — manual for now
- CI/CD pipeline — manual deploy for now
- Ollama / local LLM — using Anthropic API
