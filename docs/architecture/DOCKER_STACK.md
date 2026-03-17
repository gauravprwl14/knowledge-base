# Docker Stack Reference

**Version**: 1.0
**Date**: 2026-03-17

All services use latest stable versions. No older versions.

---

## Complete Service Reference

```yaml
# docker-compose.yml (development)
# All versions pinned to latest stable as of 2026-03-17

services:

  # ─── GATEWAY ──────────────────────────────────────────────────────────────

  nginx:
    image: nginx:1.27-alpine
    ports: ["80:80", "443:443"]
    depends_on: [kms-api, search-api, web-ui]

  # ─── APIs ─────────────────────────────────────────────────────────────────

  kms-api:
    build: ./services/kms-api
    # NestJS 11, Node.js 22 LTS, Fastify adapter
    ports: ["8000:8000"]
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
      rabbitmq: { condition: service_healthy }

  search-api:
    build: ./services/search-api
    # NestJS 11, Node.js 22 LTS
    ports: ["8001:8001"]
    depends_on:
      postgres: { condition: service_healthy }
      qdrant: { condition: service_healthy }
      redis: { condition: service_healthy }

  rag-service:
    build: ./services/rag-service
    # FastAPI 0.115, Python 3.12
    ports: ["8002:8002"]
    depends_on:
      ollama: { condition: service_started }
      qdrant: { condition: service_healthy }
      neo4j: { condition: service_healthy }
      redis: { condition: service_healthy }

  voice-app:
    build: ./backend
    # FastAPI 0.115, Python 3.12 (existing service)
    ports: ["8003:8000"]
    depends_on:
      postgres: { condition: service_healthy }
      rabbitmq: { condition: service_healthy }

  # ─── FRONTEND ─────────────────────────────────────────────────────────────

  web-ui:
    build: ./services/web-ui
    # Next.js 15, Node.js 22 LTS
    ports: ["3000:3000"]

  # ─── WORKERS ──────────────────────────────────────────────────────────────

  scan-worker:
    build: ./services/scan-worker
    # Python 3.12
    depends_on:
      postgres: { condition: service_healthy }
      rabbitmq: { condition: service_healthy }

  embed-worker:
    build: ./services/embed-worker
    # Python 3.12
    deploy:
      resources:
        limits: { cpus: "4", memory: "8G" }
    depends_on:
      postgres: { condition: service_healthy }
      qdrant: { condition: service_healthy }
      rabbitmq: { condition: service_healthy }
      ollama: { condition: service_started }

  dedup-worker:
    build: ./services/dedup-worker
    # Python 3.12
    depends_on:
      postgres: { condition: service_healthy }
      neo4j: { condition: service_healthy }
      qdrant: { condition: service_healthy }
      rabbitmq: { condition: service_healthy }

  graph-worker:
    build: ./services/graph-worker
    # Python 3.12 (Leiden algorithm, entity extraction)
    depends_on:
      neo4j: { condition: service_healthy }
      postgres: { condition: service_healthy }
      rabbitmq: { condition: service_healthy }

  junk-detector:
    build: ./services/junk-detector
    # Python 3.12
    depends_on:
      postgres: { condition: service_healthy }
      rabbitmq: { condition: service_healthy }

  obsidian-sync:
    build: ./services/obsidian-sync
    # Python 3.12
    volumes:
      - ${OBSIDIAN_VAULT_PATH}:/vault:ro
    depends_on:
      rabbitmq: { condition: service_healthy }

  # ─── LLM ──────────────────────────────────────────────────────────────────

  ollama:
    image: ollama/ollama:latest
    ports: ["11434:11434"]
    volumes:
      - ollama_models:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    # Pulls models on first startup: nomic-embed-text, llama3.2:3b

  # ─── DATABASES ────────────────────────────────────────────────────────────

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: kms
      POSTGRES_USER: kms
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports: ["5432:5432"]
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kms"]
      interval: 5s
      timeout: 5s
      retries: 5

  qdrant:
    image: qdrant/qdrant:v1.13.1
    ports: ["6333:6333", "6334:6334"]
    volumes:
      - qdrant_data:/qdrant/storage
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  neo4j:
    image: neo4j:5.26-community
    ports: ["7474:7474", "7687:7687"]
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD}
      NEO4J_PLUGINS: '["apoc", "graph-data-science"]'
      NEO4J_dbms_memory_heap_max__size: 2G
      NEO4J_dbms_memory_pagecache_size: 1G
    volumes:
      - neo4j_data:/data
    healthcheck:
      test: ["CMD", "cypher-shell", "-u", "neo4j", "-p", "${NEO4J_PASSWORD}", "RETURN 1"]
      interval: 10s
      timeout: 10s
      retries: 10

  redis:
    image: redis:7.4-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD} --maxmemory 512mb --maxmemory-policy allkeys-lru
    ports: ["6379:6379"]
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 5s
      retries: 5

  rabbitmq:
    image: rabbitmq:4.1-management-alpine
    ports: ["5672:5672", "15672:15672"]
    environment:
      RABBITMQ_DEFAULT_USER: kms
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 10s
      retries: 5

  minio:
    image: minio/minio:RELEASE.2025-03-12T18-04-18Z
    command: server /data --console-address ":9001"
    ports: ["9000:9000", "9001:9001"]
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      retries: 5

  # ─── OBSERVABILITY ────────────────────────────────────────────────────────

  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.120.0
    ports:
      - "4317:4317"   # gRPC
      - "4318:4318"   # HTTP
      - "8888:8888"   # Prometheus metrics (self-monitoring)
    volumes:
      - ./config/otel-collector.yml:/etc/otelcol-contrib/config.yaml:ro

  jaeger:
    image: jaegertracing/all-in-one:1.65
    ports:
      - "16686:16686" # UI
      - "14250:14250" # gRPC
    environment:
      COLLECTOR_OTLP_ENABLED: "true"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:14269/"]
      interval: 10s
      retries: 5

  prometheus:
    image: prom/prometheus:v3.1.0
    ports: ["9090:9090"]
    volumes:
      - ./config/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.retention.time=15d"
      - "--web.enable-lifecycle"

  grafana:
    image: grafana/grafana:11.5.0
    ports: ["3001:3000"]
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
      GF_FEATURE_TOGGLES_ENABLE: "tempoSearch tempoBackendSearch"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./config/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./config/grafana/datasources:/etc/grafana/provisioning/datasources:ro

volumes:
  postgres_data:
  qdrant_data:
  neo4j_data:
  redis_data:
  rabbitmq_data:
  minio_data:
  prometheus_data:
  grafana_data:
  ollama_models:
```

---

## Version Matrix (Latest as of 2026-03-17)

| Service | Image | Version |
|---------|-------|---------|
| Nginx | `nginx:1.27-alpine` | 1.27 (latest stable) |
| PostgreSQL | `postgres:17-alpine` | 17 (latest) |
| Redis | `redis:7.4-alpine` | 7.4 |
| RabbitMQ | `rabbitmq:4.1-management-alpine` | 4.1 |
| Qdrant | `qdrant/qdrant:v1.13.1` | 1.13.1 |
| Neo4j | `neo4j:5.26-community` | 5.26 |
| MinIO | `minio/minio:RELEASE.2025-03-12...` | Latest stable |
| OTel Collector | `otel/opentelemetry-collector-contrib:0.120.0` | 0.120.0 |
| Jaeger | `jaegertracing/all-in-one:1.65` | 1.65 |
| Prometheus | `prom/prometheus:v3.1.0` | 3.1 |
| Grafana | `grafana/grafana:11.5.0` | 11.5 |
| Ollama | `ollama/ollama:latest` | Latest |
| Node.js (base) | `node:22-alpine` | 22 LTS |
| Python (base) | `python:3.12-slim` | 3.12 |

---

## Environment Variables (.env.example)

```bash
# Database
POSTGRES_PASSWORD=changeme_postgres
NEO4J_PASSWORD=changeme_neo4j
REDIS_PASSWORD=changeme_redis
RABBITMQ_PASSWORD=changeme_rabbitmq

# Object Storage
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=changeme_minio

# Security
JWT_SECRET=changeme_jwt_secret_min_32_chars_xxxx
API_KEY_ENCRYPTION_SECRET=changeme_aes_secret_32_chars_xxx

# LLM (optional — system works offline without these)
EMBEDDING_PROVIDER=local         # local | openai | openrouter
LLM_PROVIDER=ollama              # ollama | openrouter | openai
OLLAMA_HOST=http://ollama:11434
OPENROUTER_API_KEY=              # sk-or-v1-...
OPENAI_API_KEY=                  # sk-...

# Google Drive (required for M2)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Observability
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
GRAFANA_PASSWORD=changeme_grafana

# Obsidian Sync (optional)
OBSIDIAN_VAULT_PATH=/path/to/your/vault

# App
NODE_ENV=development
LOG_LEVEL=info
```
