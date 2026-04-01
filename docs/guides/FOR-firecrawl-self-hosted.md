# FOR-firecrawl-self-hosted — Running Firecrawl Locally

Firecrawl provides production-grade URL scraping with JS rendering, paywall handling, and
its own SSRF protection. The self-hosted option eliminates the cloud API cost and removes
the dependency on `firecrawl.dev` for local development.

---

## Prerequisites

1. **devops-net must exist** — it is created the first time you run the backend stack:
   ```bash
   make up STACK=backend
   ```
2. **Redis must be running on devops-net** — Firecrawl uses Redis (via Bull) for its job
   queue. The devops `redis` service (started above) satisfies this requirement.
3. **Docker** with access to `ghcr.io` (GitHub Container Registry) — no authentication
   required for the public Firecrawl images.

---

## Setup

### 1. Copy the env example file

```bash
cd /home/ubuntu/Sites/projects/gp/devops
cp .env.firecrawl.example .env.firecrawl
```

### 2. Set your API key

Edit `.env.firecrawl` and change `FIRECRAWL_API_KEY` to a non-default value:
```bash
FIRECRAWL_API_KEY=fc-your-strong-secret-here
```

This key must match `FIRECRAWL_API_KEY` in your KMS `.env.kms` file (see step 5 below).

---

## Start the Stack

```bash
cd /home/ubuntu/Sites/projects/gp/devops
make up STACK=firecrawl
```

This starts three containers:
- `firecrawl-api` — REST API on port 3002
- `firecrawl-worker` — Bull queue worker (no exposed port)
- `firecrawl-playwright` — headless Chromium for JS rendering (no exposed port)

---

## Verify

```bash
curl http://localhost:3002/v1/health
```

Expected response: `{"status":"ok"}` (or similar). If the container is still starting,
wait ~30 seconds for the `start_period` healthcheck grace window to pass.

---

## Configure KMS

In your KMS `.env.kms` file, set both variables:

```bash
# Point the content-worker at self-hosted Firecrawl instead of firecrawl.dev
FIRECRAWL_API_URL=http://localhost:3002
FIRECRAWL_API_KEY=fc-your-strong-secret-here   # must match .env.firecrawl
```

Then restart the content-worker:
```bash
# In the KMS project directory
docker compose -f docker-compose.kms.yml --env-file .env.kms up -d --no-deps content-worker
```

---

## Stop the Stack

```bash
make down STACK=firecrawl
```

---

## Notes

### Playwright resource limits
The `firecrawl-playwright` container is the most resource-intensive in the stack. It is
capped at 2 CPU / 2 GB RAM in `compose/services/firecrawl/compose.yml`. On machines with
limited memory, reduce the `memory` limit or run the firecrawl stack only when needed.

### Port conflicts
If port 3002 is already in use on your machine, change `FIRECRAWL_PORT` in `.env.firecrawl`
and update `FIRECRAWL_API_URL` in `.env.kms` to match:
```bash
# .env.firecrawl
FIRECRAWL_PORT=3099

# .env.kms
FIRECRAWL_API_URL=http://localhost:3099
```

### Production use
For production, set `BULL_AUTH_KEY` in `.env.firecrawl` to a strong random secret and
ensure `FIRECRAWL_API_KEY` matches between the Firecrawl stack and the KMS service. The
containers do not expose Redis or Playwright ports externally — only port 3002 is published.
