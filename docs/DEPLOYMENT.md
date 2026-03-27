# KMS Production Deployment Guide

End-to-end instructions for deploying the Knowledge Management System (KMS) to a Linux VPS or cloud VM using Docker Compose and Nginx as the reverse proxy.

**Architecture overview:**

```
Internet
   │ HTTPS :443
   ▼
Nginx (host OS)
   ├── /api/v1/chat|runs|agents  →  rag-service:8002  (SSE)
   ├── /api/v1/*                 →  kms-api:8000
   └── /*                        →  web-ui:3000
         │  (Docker network: backend)
         ├── kms-api:8000  ←→  search-api:8001 (internal)
         ├── postgres:5432
         ├── redis:6379
         ├── rabbitmq:5672
         ├── qdrant:6333
         ├── neo4j:7687
         └── workers (scan, embed, dedup, graph)
```

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Server Setup](#2-server-setup)
3. [Clone and Configure](#3-clone-and-configure)
4. [Environment Variables](#4-environment-variables)
5. [Nginx Installation and Configuration](#5-nginx-installation-and-configuration)
6. [SSL Certificate (Let's Encrypt)](#6-ssl-certificate-lets-encrypt)
7. [Build and Start Services](#7-build-and-start-services)
8. [Database Migrations](#8-database-migrations)
9. [Verify the Deployment](#9-verify-the-deployment)
10. [Monitoring and Logs](#10-monitoring-and-logs)
11. [Backups](#11-backups)
12. [Rolling Updates](#12-rolling-updates)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Prerequisites

### Server requirements

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 4 vCPUs | 8 vCPUs |
| RAM | 8 GB | 16 GB |
| Disk | 50 GB SSD | 200 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |

> **BGE-M3 note:** The `embed-worker` loads the `BAAI/bge-m3` model (1.4 GB). On first start it downloads the model. Ensure the disk quota accommodates the model cache (mounted via a Docker volume or `/root/.cache/huggingface`).

### Software on the host

- Docker 24+ with Docker Compose V2 (`docker compose` not `docker-compose`)
- Nginx 1.24+
- Certbot (for Let's Encrypt SSL)
- Git

```bash
# Ubuntu / Debian
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx git

# Add your user to the docker group (re-login after this)
sudo usermod -aG docker $USER
```

---

## 2. Server Setup

### Firewall

Allow only the ports Nginx needs. Everything else stays internal.

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (Let's Encrypt ACME challenge + redirect)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
sudo ufw status
```

### DNS

Point your domain's A record to the server's public IP before running Certbot.

---

## 3. Clone and Configure

```bash
# Clone the repository
git clone https://github.com/your-org/knowledge-base.git /opt/kms
cd /opt/kms
```

---

## 4. Environment Variables

```bash
# Copy the example file
cp .env.kms.example .env.prod
```

Edit `.env.prod` and fill in **all** required values:

```bash
nano .env.prod
```

### Required variables

| Variable | Description | Example |
|---|---|---|
| `POSTGRES_USER` | PostgreSQL username | `kms` |
| `POSTGRES_PASSWORD` | PostgreSQL password — **strong, unique** | `S3cur3P@ss!` |
| `POSTGRES_DB` | Database name | `kms` |
| `REDIS_PASSWORD` | Redis AUTH password | `RedisP@ss!` |
| `RABBITMQ_USER` | RabbitMQ username | `kms` |
| `RABBITMQ_PASS` | RabbitMQ password | `RabbMQP@ss!` |
| `JWT_SECRET` | JWT access token secret — **≥ 32 chars** | _(generate below)_ |
| `JWT_REFRESH_SECRET` | JWT refresh token secret — **≥ 32 chars** | _(generate below)_ |
| `API_KEY_ENCRYPTION_SECRET` | API key encryption key — **exactly 32 chars** | _(generate below)_ |
| `MINIO_USER` | MinIO root user | `minioadmin` |
| `MINIO_PASSWORD` | MinIO root password | `MinioP@ss!` |
| `NEO4J_PASSWORD` | Neo4j password | `Neo4jP@ss!` |
| `PUBLIC_URL` | Your public HTTPS URL | `https://kms.example.com` |
| `CORS_ORIGINS` | Allowed CORS origins | `https://kms.example.com` |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key (for RAG + ACP) | `sk-ant-...` |

### Optional variables

| Variable | Description | Default |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth (Drive integration) | _(empty)_ |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret | _(empty)_ |
| `LLM_ENABLED` | Enable LLM in RAG service | `true` |
| `LLM_PROVIDER` | LLM provider (`anthropic` or `ollama`) | `anthropic` |
| `OTEL_ENABLED` | Enable OpenTelemetry tracing | `false` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint (if OTel enabled) | _(empty)_ |

### Generate secrets

```bash
# JWT secrets (≥32 chars)
openssl rand -base64 48 | tr -d '\n'   # run twice — one for JWT_SECRET, one for JWT_REFRESH_SECRET

# API key encryption secret (exactly 32 chars)
openssl rand -hex 16                    # gives exactly 32 hex chars
```

---

## 5. Nginx Installation and Configuration

### Deploy the Nginx virtual host config

The KMS config is a **virtual host file** (`sites-available` pattern). It does **not** replace the system `nginx.conf`. This keeps any other vhosts on the server intact.

```bash
# Copy the virtual host config
sudo cp /opt/kms/infra/nginx/kms.conf /etc/nginx/sites-available/kms

# Replace YOUR_DOMAIN with your actual domain
sudo sed -i 's/YOUR_DOMAIN/kms.example.com/g' /etc/nginx/sites-available/kms

# Enable the site
sudo ln -s /etc/nginx/sites-available/kms /etc/nginx/sites-enabled/kms

# Remove the default site if it exists (optional — avoids port conflicts)
sudo rm -f /etc/nginx/sites-enabled/default
```

> Replace `kms.example.com` with your actual domain throughout.

### Test and reload

```bash
sudo nginx -t          # must say "syntax is ok"
sudo systemctl reload nginx
```

### Path routing summary

| Path prefix | Upstream | Notes |
|---|---|---|
| `/api/v1/chat*` | `rag-service:8002` | SSE — buffering disabled |
| `/api/v1/runs*` | `rag-service:8002` | SSE — buffering disabled |
| `/api/v1/agents*` | `rag-service:8002` | SSE — buffering disabled |
| `/api/v1/*` | `kms-api:8000` | Main REST API |
| `/_next/static/*` | `web-ui:3000` | 1-year cache headers |
| `/*` | `web-ui:3000` | Next.js frontend |

Services **not** exposed via Nginx (internal Docker network only):

- `search-api:8001` — called by kms-api
- `postgres:5432`, `redis:6379`, `rabbitmq:5672`, `qdrant:6333`, `neo4j:7687`

---

## 6. SSL Certificate (Let's Encrypt)

```bash
# Obtain certificate (Nginx plugin handles config automatically)
sudo certbot --nginx -d kms.example.com

# Test auto-renewal
sudo certbot renew --dry-run
```

Certbot adds a cron job for auto-renewal. After obtaining the certificate, reload Nginx:

```bash
sudo systemctl reload nginx
```

---

## 7. Build and Start Services

### Build production images

```bash
cd /opt/kms

# Build all production images (takes 5–15 minutes on first run)
docker compose -f docker-compose.prod.yml --env-file .env.prod build
```

### Start all services

Migrations run automatically via the `migrate` init container before `kms-api` starts. The correct startup order is enforced by `depends_on: condition: service_completed_successfully`.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Watch startup progress:

```bash
# Follow logs for the first boot (Ctrl+C when all services are healthy)
docker compose -f docker-compose.prod.yml logs -f migrate kms-api

# Confirm all containers are healthy
docker compose -f docker-compose.prod.yml ps
```

Expected sequence on first boot:
1. `postgres`, `redis`, `rabbitmq` — reach `healthy` (~30s)
2. `migrate` — runs `prisma migrate deploy`, exits with code 0
3. `kms-api` — starts, reaches `healthy`
4. `search-api`, `rag-service`, `web-ui`, workers — start in parallel

---

## 8. Database Migrations

Migrations are managed by Prisma and run **automatically** on every `docker compose up` via the `migrate` init container (exits after applying any pending migrations).

```bash
# Check migration status at any time
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  run --rm migrate npx prisma migrate status

# Manually trigger migrations (e.g. after a failed first boot)
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  run --rm migrate
```

> The `migrate` service uses `restart: "no"` — it runs once and exits. It only re-runs if you explicitly call `docker compose run --rm migrate`.

> Migrations are **backward-compatible** by design — no data loss on apply. If a migration requires downtime, this is noted in the migration file header.

### Creating new migrations (from a dev machine)

```bash
cd kms-api
npx prisma migrate dev --name describe-your-change
```

Commit the generated migration file and the updated `schema.prisma`.

---

## 9. Verify the Deployment

```bash
# KMS API health
curl https://kms.example.com/api/v1/health/live
# → {"success":true,"data":{"status":"ok",...}}

# RAG service health
curl https://kms.example.com/api/v1/runs  # → 401 (auth required — service is up)

# Frontend
curl -I https://kms.example.com/
# → HTTP/2 200

# Register a user
curl -X POST https://kms.example.com/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"Admin1234!","confirmPassword":"Admin1234!","firstName":"Admin","lastName":"User"}'

# Login
curl -X POST https://kms.example.com/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"Admin1234!"}'
# → {"tokens":{"accessToken":"...","refreshToken":"..."}, ...}
```

### Check all containers are healthy

```bash
docker compose -f docker-compose.prod.yml ps
# Every service should show: healthy or running
```

---

## 10. Monitoring and Logs

### View logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Single service
docker compose -f docker-compose.prod.yml logs -f kms-api
docker compose -f docker-compose.prod.yml logs -f rag-service
docker compose -f docker-compose.prod.yml logs -f embed-worker
```

### Nginx logs

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Observability stack (optional)

The production compose file does not include the Grafana/Tempo/Loki/Prometheus stack. To enable:

1. Set `OTEL_ENABLED=true` and `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317` in `.env.prod`
2. Run the observability services separately:
   ```bash
   docker compose -f docker-compose.kms.yml --env-file .env.prod \
     up -d otel-collector prometheus tempo loki grafana
   ```
3. Grafana: `http://your-server-ip:3000` (use SSH tunnel in production, not public)

---

## 11. Backups

### PostgreSQL

```bash
# Create a backup
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec postgres pg_dump -U ${POSTGRES_USER} ${POSTGRES_DB} \
  | gzip > /opt/backups/kms-$(date +%Y%m%d-%H%M).sql.gz

# Restore from backup
gunzip -c /opt/backups/kms-20260101-1200.sql.gz \
  | docker compose -f docker-compose.prod.yml --env-file .env.prod \
    exec -T postgres psql -U ${POSTGRES_USER} ${POSTGRES_DB}
```

### Qdrant (vector store)

```bash
# Qdrant snapshots (via REST API) — collection name is kms_chunks
curl -X POST http://localhost:6333/collections/kms_chunks/snapshots

# Or simply back up the Docker volume
docker run --rm \
  -v kms-prod_qdrant_data:/data \
  -v /opt/backups:/backup \
  alpine tar czf /backup/qdrant-$(date +%Y%m%d).tar.gz /data
```

### Automated backup cron

```bash
sudo crontab -e
# Add:
0 2 * * * /opt/kms/scripts/backup.sh >> /var/log/kms-backup.log 2>&1
```

---

## 12. Rolling Updates

### Pull latest code

```bash
cd /opt/kms
git pull origin main
```

### Rebuild and redeploy

```bash
# Build updated images (only changed layers are rebuilt)
docker compose -f docker-compose.prod.yml --env-file .env.prod build

# Apply any new migrations (the migrate service runs automatically on up,
# but you can also trigger it explicitly before restarting kms-api)
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  run --rm migrate

# Restart services one by one (zero-downtime for workers)
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  up -d --no-deps kms-api

docker compose -f docker-compose.prod.yml --env-file .env.prod \
  up -d --no-deps rag-service

docker compose -f docker-compose.prod.yml --env-file .env.prod \
  up -d --no-deps web-ui

# Restart workers (they drain the queue gracefully before stopping)
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  up -d --no-deps scan-worker embed-worker dedup-worker graph-worker
```

### Rollback

```bash
git checkout <previous-tag-or-commit>
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

---

## 13. Troubleshooting

### migrate service exits non-zero

```bash
docker compose -f docker-compose.prod.yml logs migrate
```

Common causes:
- `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` wrong — check `.env.prod`
- `postgres` container not yet healthy when `migrate` ran — check `docker compose ps`
- Conflicting migration state — run `npx prisma migrate status` to inspect

### kms-api fails to start

```bash
docker compose -f docker-compose.prod.yml logs kms-api
```

Common causes:
- `migrate` service failed — kms-api won't start until migrate exits with code 0
- JWT secrets shorter than 32 chars — regenerate with `openssl rand -base64 48`
- `API_KEY_ENCRYPTION_SECRET` not exactly 32 chars — generate with `openssl rand -hex 16`

### Nginx 502 Bad Gateway

Nginx gets 502 when a Docker service isn't listening on its port.

```bash
# Check services are up and bound to 127.0.0.1
ss -tlnp | grep -E '8000|8002|3000'

# Check Docker health
docker compose -f docker-compose.prod.yml ps
```

### embed-worker: model download fails

The BGE-M3 model downloads from Hugging Face on first start. If the server has no internet access:

```bash
# Pre-download on a machine with internet access, then copy the cache
# Model cache location inside the container: /root/.cache/huggingface
docker run --rm -v kms_model_cache:/root/.cache/huggingface \
  python:3.11-slim pip install -q huggingface-hub && \
  python -c "from huggingface_hub import snapshot_download; snapshot_download('BAAI/bge-m3')"
```

### RabbitMQ: authentication failure

```bash
# Reset RabbitMQ credentials (requires container restart)
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec rabbitmq rabbitmqctl change_password ${RABBITMQ_USER} ${RABBITMQ_PASS}
```

### Database connection refused

```bash
# Verify postgres is healthy
docker compose -f docker-compose.prod.yml exec postgres \
  pg_isready -U ${POSTGRES_USER}

# Check connection from kms-api
docker compose -f docker-compose.prod.yml exec kms-api \
  npx prisma db pull
```
