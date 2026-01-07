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
| Search API | Go | High concurrency, low latency, efficient memory |
| Workers | Python | Rich ML ecosystem, async support, rapid development |
| Frontend | Next.js | React ecosystem, SSR, excellent DX |
| Primary DB | PostgreSQL | Mature, reliable, full-text search, JSONB |
| Vector DB | Qdrant | Open source, HNSW index, excellent Go/Python clients |
| Graph DB | Neo4j | Intuitive relationships, Cypher queries |
| Message Queue | RabbitMQ | Existing infrastructure, priority queues, DLX |
| Cache | Redis | Fast, versatile, excellent client libraries |
| Object Storage | MinIO | S3-compatible, self-hosted |

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

## Development Tools

| Tool | Purpose |
|------|---------|
| **Docker** | Containerization |
| **Docker Compose** | Local orchestration |
| **GitHub Actions** | CI/CD |
| **ESLint** | TypeScript linting |
| **Black** | Python formatting |
| **golangci-lint** | Go linting |
| **Jest** | JS/TS testing |
| **pytest** | Python testing |
| **Playwright** | E2E testing |

---

## Version Compatibility Matrix

| Component | Minimum | Recommended | Maximum |
|-----------|---------|-------------|---------|
| Node.js | 18.x | 20.x | 22.x |
| Python | 3.10 | 3.11 | 3.12 |
| Go | 1.20 | 1.21 | 1.22 |
| PostgreSQL | 14 | 15 | 16 |
| Docker | 24.x | 25.x | latest |
| Docker Compose | 2.20 | 2.23 | latest |
