# Technology Stack

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The KMS uses a polyglot architecture where each service is built with the most appropriate technology for its specific requirements. This approach optimizes for performance, developer productivity, and ecosystem maturity.

---

## Technology Decision Matrix

| Concern | Technology | Rationale |
|---------|------------|-----------|
| Main API | NestJS (TypeScript) | Type safety, enterprise patterns, great tooling |
| Search API | NestJS (TypeScript) | Consistent stack with kms-api, type safety, excellent tooling |
| Workers | Python | Rich ML ecosystem, async support, rapid development |
| Frontend | Next.js | React ecosystem, SSR, excellent DX |
| Primary DB | PostgreSQL | Mature, reliable, full-text search, JSONB |
| Vector DB | Qdrant | Open source, HNSW index, excellent JS/Python clients |
| Graph DB | Neo4j | Intuitive relationships, Cypher queries |
| Message Queue | RabbitMQ | Existing infrastructure, priority queues, DLX |
| Cache | Redis | Fast, versatile, excellent client libraries |
| Object Storage | MinIO | S3-compatible, self-hosted |
| Telemetry | OpenTelemetry | Vendor-neutral, unified traces/metrics/logs |
| Tracing | Jaeger | Open source, distributed tracing |
| Metrics | Prometheus | Industry standard, time-series metrics |
| Dashboards | Grafana | Unified visualization, alerting |

---

## Service-Specific Tech Stacks

### 1. kms-api (Main API Gateway)

**Language**: TypeScript 5.x

**Core Framework**: NestJS 10.x

| Category | Library | Version | Purpose |
|----------|---------|---------|---------|
| **ORM** | TypeORM | 0.3.x | Database abstraction, migrations |
| **Validation** | class-validator | 0.14.x | DTO validation |
| **Transform** | class-transformer | 0.5.x | Object transformation |
| **Auth** | @nestjs/passport | 10.x | Authentication strategies |
| **JWT** | @nestjs/jwt | 10.x | Token generation/validation |
| **Hashing** | bcrypt | 5.x | Password hashing |
| **Queue** | @nestjs/bull | 10.x | RabbitMQ integration |
| **Swagger** | @nestjs/swagger | 7.x | OpenAPI documentation |
| **Config** | @nestjs/config | 3.x | Environment configuration |
| **HTTP** | axios | 1.x | External API calls |
| **Telemetry** | @opentelemetry/sdk-node | 0.52.x | OTel SDK for Node.js |
| **Telemetry** | @opentelemetry/auto-instrumentations-node | 0.49.x | Auto-instrumentation |
| **Telemetry** | @opentelemetry/exporter-trace-otlp-grpc | 0.52.x | OTLP trace exporter |
| **Telemetry** | @opentelemetry/exporter-metrics-otlp-grpc | 0.52.x | OTLP metrics exporter |

**Project Structure**:
```
kms-api/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   │   └── configuration.ts
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── strategies/
│   │   │   │   ├── local.strategy.ts
│   │   │   │   └── google.strategy.ts
│   │   │   └── guards/
│   │   │       └── api-key.guard.ts
│   │   ├── sources/
│   │   ├── files/
│   │   ├── scan-jobs/
│   │   ├── duplicates/
│   │   └── junk/
│   ├── entities/
│   ├── dto/
│   └── common/
│       ├── exceptions/
│       ├── filters/
│       └── interceptors/
├── test/
├── package.json
└── tsconfig.json
```

---

### 2. search-api (Search Service)

**Language**: TypeScript 5.x

**Core Framework**: NestJS 10.x

| Category | Library | Version | Purpose |
|----------|---------|---------|---------|
| **Runtime** | Node.js | 20.x | JavaScript runtime |
| **Framework** | NestJS | 10.x | API framework |
| **ORM** | TypeORM | 0.3.x | PostgreSQL queries (read-only) |
| **Vector DB** | @qdrant/js-client-rest | 1.x | Qdrant client |
| **Cache** | @nestjs/cache-manager | 2.x | Redis caching |
| **Redis** | ioredis | 5.x | Redis client |
| **Validation** | class-validator | 0.14.x | Request validation |
| **Swagger** | @nestjs/swagger | 7.x | API documentation |
| **Metrics** | @willsoto/nestjs-prometheus | 6.x | Prometheus metrics |
| **Testing** | Jest | 29.x | Unit/integration tests |
| **Telemetry** | @opentelemetry/sdk-node | 0.52.x | OTel SDK for Node.js |
| **Telemetry** | @opentelemetry/auto-instrumentations-node | 0.49.x | Auto-instrumentation |
| **Telemetry** | @opentelemetry/exporter-trace-otlp-grpc | 0.52.x | OTLP trace exporter |
| **Telemetry** | @opentelemetry/exporter-metrics-otlp-grpc | 0.52.x | OTLP metrics exporter |

**Project Structure**:
```
search-api/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   │   └── configuration.ts
│   ├── modules/
│   │   ├── search/
│   │   │   ├── search.module.ts
│   │   │   ├── search.controller.ts
│   │   │   ├── search.service.ts
│   │   │   └── services/
│   │   │       ├── keyword-search.service.ts
│   │   │       ├── semantic-search.service.ts
│   │   │       └── hybrid-search.service.ts
│   │   ├── facets/
│   │   └── health/
│   ├── repositories/
│   │   ├── postgres.repository.ts
│   │   ├── qdrant.repository.ts
│   │   └── cache.repository.ts
│   ├── ranking/
│   │   ├── hybrid-ranker.ts
│   │   └── boost-factors.ts
│   └── common/
├── test/
├── package.json
└── tsconfig.json
```

---

### 3. scan-worker (File Scanner)

**Language**: Python 3.11+

**Async Framework**: asyncio

| Category | Library | Version | Purpose |
|----------|---------|---------|---------|
| **Queue** | aio-pika | 9.x | Async RabbitMQ client |
| **Database** | asyncpg | 0.29.x | Async PostgreSQL |
| **ORM** | SQLAlchemy | 2.x | Async ORM |
| **Google API** | google-api-python-client | 2.x | Drive API |
| **OAuth** | google-auth | 2.x | OAuth 2.0 |
| **File System** | aiofiles | 23.x | Async file I/O |
| **Encryption** | cryptography | 41.x | Token encryption |
| **HTTP** | aiohttp | 3.x | Async HTTP client |
| **Validation** | pydantic | 2.x | Data validation |
| **Logging** | structlog | 23.x | Structured logging |
| **Telemetry** | opentelemetry-sdk | 1.25.x | OTel SDK for Python |
| **Telemetry** | opentelemetry-exporter-otlp | 1.25.x | OTLP exporter |
| **Telemetry** | opentelemetry-instrumentation-asyncpg | 0.46b.x | asyncpg instrumentation |
| **Telemetry** | opentelemetry-instrumentation-aio-pika | 0.46b.x | aio-pika instrumentation |

**Project Structure**:
```
scan-worker/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── config.py
│   ├── worker.py
│   ├── scanners/
│   │   ├── __init__.py
│   │   ├── base.py
│   │   ├── google_drive.py
│   │   ├── local_fs.py
│   │   └── external_drive.py
│   ├── db/
│   │   ├── session.py
│   │   └── models.py
│   ├── services/
│   │   ├── file_service.py
│   │   └── source_service.py
│   └── utils/
│       ├── encryption.py
│       └── progress.py
├── tests/
├── requirements.txt
└── Dockerfile
```

---

### 4. embedding-worker (Content Processor)

**Language**: Python 3.11+

**ML Framework**: sentence-transformers

| Category | Library | Version | Purpose |
|----------|---------|---------|---------|
| **Embeddings** | sentence-transformers | 2.x | Vector generation |
| **PDF** | PyPDF2 | 3.x | PDF text extraction |
| **PDF Fallback** | pdfplumber | 0.10.x | Complex PDF handling |
| **Word** | python-docx | 1.x | DOCX extraction |
| **Excel** | openpyxl | 3.x | XLSX extraction |
| **Images** | Pillow | 10.x | Image metadata (EXIF) |
| **Media** | ffmpeg-python | 0.2.x | Audio/video metadata |
| **Chunking** | langchain | 0.1.x | Text splitter |
| **Vector Store** | qdrant-client | 1.x | Qdrant API |
| **Queue** | aio-pika | 9.x | RabbitMQ consumer |
| **Database** | asyncpg | 0.29.x | PostgreSQL |
| **Telemetry** | opentelemetry-sdk | 1.25.x | OTel SDK for Python |
| **Telemetry** | opentelemetry-exporter-otlp | 1.25.x | OTLP exporter |
| **Telemetry** | opentelemetry-instrumentation-asyncpg | 0.46b.x | asyncpg instrumentation |
| **Telemetry** | opentelemetry-instrumentation-aio-pika | 0.46b.x | aio-pika instrumentation |

**Project Structure**:
```
embedding-worker/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── config.py
│   ├── worker.py
│   ├── extractors/
│   │   ├── __init__.py
│   │   ├── base.py
│   │   ├── pdf.py
│   │   ├── office.py
│   │   ├── google_docs.py
│   │   └── media.py
│   ├── embedding/
│   │   ├── __init__.py
│   │   ├── chunker.py
│   │   ├── generator.py
│   │   └── models.py
│   ├── storage/
│   │   ├── qdrant.py
│   │   └── postgres.py
│   └── utils/
│       └── download.py
├── tests/
├── requirements.txt
└── Dockerfile
```

---

### 5. dedup-worker (Deduplication)

**Language**: Python 3.11+

| Category | Library | Version | Purpose |
|----------|---------|---------|---------|
| **Hashing** | hashlib | (stdlib) | SHA-256 file hashing |
| **Similarity** | scikit-learn | 1.x | Cosine similarity |
| **Numerical** | numpy | 1.x | Vector operations |
| **Vector DB** | qdrant-client | 1.x | Similarity search |
| **Graph DB** | neo4j | 5.x | Relationship storage |
| **Pattern** | regex | 2023.x | Filename patterns |
| **Difflib** | difflib | (stdlib) | String similarity |
| **Queue** | aio-pika | 9.x | RabbitMQ consumer |
| **Database** | asyncpg | 0.29.x | PostgreSQL |
| **Telemetry** | opentelemetry-sdk | 1.25.x | OTel SDK for Python |
| **Telemetry** | opentelemetry-exporter-otlp | 1.25.x | OTLP exporter |
| **Telemetry** | opentelemetry-instrumentation-asyncpg | 0.46b.x | asyncpg instrumentation |
| **Telemetry** | opentelemetry-instrumentation-aio-pika | 0.46b.x | aio-pika instrumentation |

**Project Structure**:
```
dedup-worker/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── config.py
│   ├── worker.py
│   ├── detectors/
│   │   ├── __init__.py
│   │   ├── base.py
│   │   ├── hash_detector.py
│   │   ├── semantic_detector.py
│   │   └── version_detector.py
│   ├── grouping/
│   │   ├── group_manager.py
│   │   └── primary_selector.py
│   ├── storage/
│   │   ├── postgres.py
│   │   ├── qdrant.py
│   │   └── neo4j.py
│   └── utils/
│       └── hashing.py
├── tests/
├── requirements.txt
└── Dockerfile
```

---

### 6. junk-detector (Cleanup Service)

**Language**: Python 3.11+

| Category | Library | Version | Purpose |
|----------|---------|---------|---------|
| **Rules Engine** | (custom) | - | Rule evaluation |
| **Images** | Pillow | 10.x | Image validation |
| **Media** | ffmpeg-python | 0.2.x | Media validation |
| **ML (Future)** | scikit-learn | 1.x | Junk classification |
| **ML (Future)** | xgboost | 2.x | Gradient boosting |
| **Database** | asyncpg | 0.29.x | PostgreSQL |
| **Logging** | structlog | 23.x | Structured logging |
| **Telemetry** | opentelemetry-sdk | 1.25.x | OTel SDK for Python |
| **Telemetry** | opentelemetry-exporter-otlp | 1.25.x | OTLP exporter |
| **Telemetry** | opentelemetry-instrumentation-asyncpg | 0.46b.x | asyncpg instrumentation |

**Project Structure**:
```
junk-detector/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── config.py
│   ├── detector.py
│   ├── rules/
│   │   ├── __init__.py
│   │   ├── engine.py
│   │   ├── temporary_files.py
│   │   ├── empty_files.py
│   │   └── corrupted_files.py
│   ├── ml/
│   │   ├── __init__.py
│   │   ├── classifier.py
│   │   └── features.py
│   └── storage/
│       └── postgres.py
├── tests/
├── requirements.txt
└── Dockerfile
```

---

### 7. web-ui (Frontend)

**Language**: TypeScript 5.x

**Framework**: Next.js 14 (App Router)

| Category | Library | Version | Purpose |
|----------|---------|---------|---------|
| **Framework** | next | 14.x | React framework |
| **React** | react | 18.x | UI library |
| **Styling** | tailwindcss | 3.x | Utility-first CSS |
| **Components** | @radix-ui/* | 1.x | Headless UI components |
| **UI Kit** | shadcn/ui | latest | Component library |
| **State** | @tanstack/react-query | 5.x | Server state |
| **State** | zustand | 4.x | Client state |
| **Forms** | react-hook-form | 7.x | Form handling |
| **Validation** | zod | 3.x | Schema validation |
| **Icons** | lucide-react | 0.x | Icon library |
| **Tables** | @tanstack/react-table | 8.x | Data tables |
| **Charts** | recharts | 2.x | Data visualization |

**Project Structure**:
```
web-ui/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── (auth)/
│   │   ├── login/
│   │   └── register/
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── sources/
│   │   ├── files/
│   │   ├── search/
│   │   ├── duplicates/
│   │   └── junk/
│   └── api/
│       └── [...proxy]/
├── components/
│   ├── ui/
│   ├── layout/
│   ├── forms/
│   └── features/
├── lib/
│   ├── api-client.ts
│   ├── utils.ts
│   └── hooks/
├── public/
├── tailwind.config.ts
├── next.config.js
└── package.json
```

---

## Infrastructure Stack

### 8. PostgreSQL 15+

| Feature | Configuration |
|---------|---------------|
| **Extensions** | pg_trgm, uuid-ossp |
| **Connection Pool** | 10 base + 20 overflow |
| **Async Driver** | asyncpg (Python), pgx (Go) |
| **Full-Text Search** | GIN indexes, ts_vector |

### 9. Qdrant

| Feature | Configuration |
|---------|---------------|
| **Version** | 1.7+ |
| **Vector Size** | 384 (default), 1536 (OpenAI) |
| **Index Type** | HNSW |
| **Distance** | Cosine |
| **Collections** | kms_files_default, kms_files_cloud |

### 10. Neo4j Community

| Feature | Configuration |
|---------|---------------|
| **Version** | 5.x |
| **Protocol** | Bolt |
| **Node Types** | File, Folder, User, Project |
| **Relationships** | IN_FOLDER, DUPLICATE_OF, OWNS |

### 11. RabbitMQ 3.12+

| Feature | Configuration |
|---------|---------------|
| **Exchange** | kms.direct (Direct) |
| **Queues** | scan, embed, dedup, trans |
| **DLX** | kms.dlx → failed.queue |
| **Priority** | 0-10 |

### 12. Redis 7+

| Feature | Configuration |
|---------|---------------|
| **Use Cases** | Caching, rate limiting, sessions |
| **Default TTL** | 5 minutes (search results) |
| **Persistence** | RDB snapshots |

### 13. MinIO

| Feature | Configuration |
|---------|---------------|
| **API** | S3-compatible |
| **Buckets** | kms-uploads, kms-processed |
| **Access** | Internal only |

---

## Observability Stack

### 14. OpenTelemetry Collector

| Feature | Configuration |
|---------|---------------|
| **Version** | 0.96.0+ |
| **Receivers** | OTLP (gRPC: 4317, HTTP: 4318) |
| **Processors** | batch, memory_limiter |
| **Exporters** | jaeger, prometheus |
| **Health Check** | Port 13133 |

**Collector Configuration**:
```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024
  memory_limiter:
    limit_mib: 512

exporters:
  jaeger:
    endpoint: jaeger:14250
    tls:
      insecure: true
  prometheus:
    endpoint: 0.0.0.0:8889

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch, memory_limiter]
      exporters: [jaeger]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheus]
```

### 15. Jaeger

| Feature | Configuration |
|---------|---------------|
| **Version** | 1.54.0+ |
| **UI Port** | 16686 |
| **gRPC Port** | 14250 |
| **Storage** | Elasticsearch / Cassandra (prod) |
| **Sampling** | Adaptive (1% default) |

### 16. Prometheus

| Feature | Configuration |
|---------|---------------|
| **Version** | 2.50.0+ |
| **Port** | 9090 |
| **Scrape Interval** | 15s |
| **Retention** | 15 days |
| **Targets** | OTel Collector (8889), services (/metrics) |

**Scrape Configuration**:
```yaml
scrape_configs:
  - job_name: 'otel-collector'
    static_configs:
      - targets: ['otel-collector:8889']
  - job_name: 'kms-api'
    static_configs:
      - targets: ['kms-api:3000']
  - job_name: 'search-api'
    static_configs:
      - targets: ['search-api:3001']
```

### 17. Grafana

| Feature | Configuration |
|---------|---------------|
| **Version** | 10.3.0+ |
| **Port** | 3001 |
| **Data Sources** | Prometheus, Jaeger |
| **Provisioning** | dashboards/, datasources/ |

**Pre-configured Dashboards**:
| Dashboard | Description |
|-----------|-------------|
| KMS Overview | System health, throughput, latency |
| API Performance | Request rates, response times, errors |
| Worker Metrics | Queue depth, processing time, failures |
| Infrastructure | CPU, memory, disk, network |
| Trace Explorer | Distributed trace analysis |

---

## Development Tools

| Tool | Purpose |
|------|---------|
| **Docker** | Containerization |
| **Docker Compose** | Local orchestration |
| **GitHub Actions** | CI/CD |
| **ESLint** | TypeScript linting |
| **Black** | Python formatting |
| **Prettier** | Code formatting |
| **Jest** | JS/TS testing |
| **pytest** | Python testing |
| **Playwright** | E2E testing |

---

## Version Compatibility Matrix

| Component | Minimum | Recommended | Maximum |
|-----------|---------|-------------|---------|
| Node.js | 18.x | 20.x | 22.x |
| Python | 3.10 | 3.11 | 3.12 |
| PostgreSQL | 14 | 15 | 16 |
| Docker | 24.x | 25.x | latest |
| Docker Compose | 2.20 | 2.23 | latest |
| OpenTelemetry Collector | 0.90 | 0.96+ | latest |
| Jaeger | 1.50 | 1.54+ | latest |
| Prometheus | 2.45 | 2.50+ | latest |
| Grafana | 10.0 | 10.3+ | latest |
| @opentelemetry/sdk-node | 0.50.x | 0.52.x | latest |
| opentelemetry-sdk (Python) | 1.23.x | 1.25.x | latest |
