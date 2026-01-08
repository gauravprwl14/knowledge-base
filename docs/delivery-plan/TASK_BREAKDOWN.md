# KMS Task Breakdown

**Last Updated**: 2026-01-08
**Total Tasks**: 142

---

## How to Use This Document

1. **Pick a Task**: Find an unchecked task `[ ]` to work on
2. **Mark In Progress**: Change `[ ]` to `[~]` when starting
3. **Mark Complete**: Change `[~]` to `[x]` when done
4. **Add Notes**: Use the Notes column for blockers or context

**Legend**:
- `[ ]` = Not Started
- `[~]` = In Progress
- `[x]` = Completed
- `[!]` = Blocked

---

# Milestone 1: Foundation (Weeks 1-4)

## Sprint 1: Infrastructure Setup (Week 1-2)

### Feature 1.1: Backend Setup

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 1.1.1 | Initialize NestJS project (`kms-api`) with TypeORM, class-validator, @nestjs/jwt | P0 | 4h | [ ] | |
| 1.1.2 | Set up folder structure: modules/, services/, controllers/, dto/ | P0 | 1h | [ ] | |
| 1.1.3 | Configure tsconfig.json with strict mode | P0 | 30m | [ ] | |
| 1.1.4 | Create `docker-compose.kms.yml` with PostgreSQL container | P0 | 2h | [ ] | |
| 1.1.5 | Configure PostgreSQL volume for data persistence | P0 | 1h | [ ] | |
| 1.1.6 | Add PostgreSQL health check | P0 | 30m | [ ] | |
| 1.1.7 | Configure TypeORM with database connection | P0 | 2h | [ ] | |
| 1.1.8 | Set up migration system (`npm run migration:generate`) | P0 | 2h | [ ] | |
| 1.1.9 | Create `.env.example` with all required variables | P0 | 1h | [ ] | |

### Feature 1.2: Frontend Setup

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 1.2.1 | Initialize Next.js 14 project (`web-ui`) with App Router | P0 | 2h | [ ] | |
| 1.2.2 | Install and configure shadcn/ui components | P0 | 2h | [ ] | |
| 1.2.3 | Configure Tailwind CSS | P0 | 1h | [ ] | |
| 1.2.4 | Create `lib/api-client.ts` with axios | P0 | 2h | [ ] | |
| 1.2.5 | Add request interceptors for auth headers | P0 | 1h | [ ] | |
| 1.2.6 | Create error handling utilities | P0 | 1h | [ ] | |

### Feature 1.3: DevOps Setup

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 1.3.1 | Add RabbitMQ to docker-compose.kms.yml | P0 | 1h | [ ] | |
| 1.3.2 | Add kms-api service to docker-compose | P0 | 2h | [ ] | |
| 1.3.3 | Add web-ui service to docker-compose | P0 | 2h | [ ] | |
| 1.3.4 | Configure hot reload for development | P0 | 2h | [ ] | |
| 1.3.5 | Create health check endpoint in kms-api | P0 | 1h | [ ] | |

### Feature 1.4: Observability Stack

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 1.4.1 | Add OpenTelemetry Collector to docker-compose.kms.yml | P0 | 2h | [ ] | Port 4317 (gRPC), 4318 (HTTP) |
| 1.4.2 | Configure OTel Collector receivers (OTLP gRPC/HTTP) | P0 | 1h | [ ] | |
| 1.4.3 | Configure OTel Collector processors (batch, memory_limiter) | P0 | 1h | [ ] | |
| 1.4.4 | Add Jaeger to docker-compose.kms.yml | P0 | 1h | [ ] | Port 16686 (UI), 14250 (gRPC) |
| 1.4.5 | Configure OTel Collector exporter to Jaeger | P0 | 1h | [ ] | |
| 1.4.6 | Add Prometheus to docker-compose.kms.yml | P0 | 1h | [ ] | Port 9090 |
| 1.4.7 | Configure OTel Collector exporter to Prometheus | P0 | 1h | [ ] | Export metrics on port 8889 |
| 1.4.8 | Create Prometheus scrape config for OTel Collector | P0 | 1h | [ ] | |
| 1.4.9 | Add Grafana to docker-compose.kms.yml | P0 | 1h | [ ] | Port 3001 |
| 1.4.10 | Configure Grafana data sources (Prometheus, Jaeger) | P0 | 1h | [ ] | |
| 1.4.11 | Install @opentelemetry/sdk-node in kms-api | P0 | 1h | [ ] | |
| 1.4.12 | Install @opentelemetry/auto-instrumentations-node in kms-api | P0 | 30m | [ ] | |
| 1.4.13 | Configure OTLP exporters (trace + metrics) in kms-api | P0 | 2h | [ ] | |
| 1.4.14 | Install opentelemetry-sdk in Python workers | P0 | 1h | [ ] | |
| 1.4.15 | Configure OTel instrumentation for asyncpg, aio-pika | P0 | 2h | [ ] | |
| 1.4.16 | Create otel-collector-config.yaml configuration file | P0 | 1h | [ ] | |
| 1.4.17 | Verify traces flow from services → OTel → Jaeger | P0 | 1h | [ ] | |
| 1.4.18 | Verify metrics flow from services → OTel → Prometheus | P0 | 1h | [ ] | |

---

## Sprint 2: Authentication System (Week 3-4)

### Feature 1.5: Database Schema (Auth)

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 1.5.1 | Create `auth_users` table migration | P0 | 2h | [ ] | |
| 1.5.2 | Create `auth_api_keys` table migration | P0 | 2h | [ ] | |
| 1.5.3 | Create `auth_teams` table migration (placeholder) | P2 | 1h | [ ] | |
| 1.5.4 | Create `auth_team_members` table migration (placeholder) | P2 | 1h | [ ] | |
| 1.5.5 | Add indexes and constraints | P0 | 1h | [ ] | |

### Feature 1.6: Backend Authentication

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 1.6.1 | Create `AuthModule` with UsersService, AuthService | P0 | 4h | [ ] | |
| 1.6.2 | Implement bcrypt password hashing utility | P0 | 1h | [ ] | |
| 1.6.3 | Create `POST /api/v1/auth/register` endpoint | P0 | 3h | [ ] | |
| 1.6.4 | Create `POST /api/v1/auth/login` endpoint | P0 | 2h | [ ] | |
| 1.6.5 | Implement JWT token generation | P0 | 2h | [ ] | |
| 1.6.6 | Install passport-google-oauth20 | P0 | 1h | [ ] | |
| 1.6.7 | Create GoogleStrategy for OAuth | P0 | 3h | [ ] | |
| 1.6.8 | Create `GET /api/v1/auth/google` endpoint | P0 | 2h | [ ] | |
| 1.6.9 | Create `GET /api/v1/auth/google/callback` endpoint | P0 | 2h | [ ] | |
| 1.6.10 | Create `POST /api/v1/api-keys` endpoint | P0 | 2h | [ ] | |
| 1.6.11 | Create `GET /api/v1/api-keys` endpoint | P0 | 1h | [ ] | |
| 1.6.12 | Create `DELETE /api/v1/api-keys/:id` endpoint | P0 | 1h | [ ] | |
| 1.6.13 | Create API key guard for authentication | P0 | 2h | [ ] | |
| 1.6.14 | Write unit tests for AuthService (80% coverage) | P0 | 4h | [ ] | |

### Feature 1.7: Frontend Authentication

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 1.7.1 | Create `/login` page with email/password form | P0 | 4h | [ ] | |
| 1.7.2 | Create `/register` page with validation | P0 | 4h | [ ] | |
| 1.7.3 | Add password strength indicator | P0 | 2h | [ ] | |
| 1.7.4 | Implement "Sign in with Google" button | P0 | 2h | [ ] | |
| 1.7.5 | Create auth context for user state | P0 | 3h | [ ] | |
| 1.7.6 | Implement JWT storage in httpOnly cookie | P0 | 2h | [ ] | |
| 1.7.7 | Create protected route HOC | P0 | 2h | [ ] | |
| 1.7.8 | Create `/dashboard` page | P0 | 3h | [ ] | |

---

# Milestone 2: Google Drive Integration (Weeks 5-8)

## Sprint 3: Google Drive Connection (Week 5-6)

### Feature 2.1: Database Schema (KMS Core)

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 2.1.1 | Create `kms_sources` table migration | P0 | 2h | [ ] | |
| 2.1.2 | Create `kms_scan_jobs` table migration | P0 | 2h | [ ] | |
| 2.1.3 | Create `kms_files` table migration (basic structure) | P0 | 3h | [ ] | |
| 2.1.4 | Add indexes for kms tables | P0 | 1h | [ ] | |

### Feature 2.2: Google Cloud Setup

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 2.2.1 | Create Google Cloud Project | P0 | 1h | [ ] | |
| 2.2.2 | Enable Google Drive API | P0 | 30m | [ ] | |
| 2.2.3 | Create OAuth 2.0 credentials | P0 | 1h | [ ] | |
| 2.2.4 | Configure OAuth consent screen | P0 | 1h | [ ] | |
| 2.2.5 | Add required scopes (drive.readonly, drive.metadata.readonly) | P0 | 30m | [ ] | |

### Feature 2.3: Token Encryption

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 2.3.1 | Implement AES-256-GCM encryption utility | P0 | 3h | [ ] | |
| 2.3.2 | Create encrypt/decrypt functions | P0 | 2h | [ ] | |
| 2.3.3 | Add ENCRYPTION_KEY to environment config | P0 | 30m | [ ] | |

### Feature 2.4: Sources Module

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 2.4.1 | Create `SourcesModule` in NestJS | P0 | 2h | [ ] | |
| 2.4.2 | Create `SourcesService` with CRUD operations | P0 | 3h | [ ] | |
| 2.4.3 | Create `POST /api/v1/sources/google-drive/connect` endpoint | P0 | 3h | [ ] | |
| 2.4.4 | Create `GET /api/v1/sources/google-drive/callback` endpoint | P0 | 3h | [ ] | |
| 2.4.5 | Implement token refresh logic | P0 | 2h | [ ] | |
| 2.4.6 | Create `GET /api/v1/sources` endpoint | P0 | 1h | [ ] | |
| 2.4.7 | Create `GET /api/v1/sources/:id` endpoint | P0 | 1h | [ ] | |
| 2.4.8 | Create `DELETE /api/v1/sources/:id` endpoint | P0 | 1h | [ ] | |

### Feature 2.5: Sources UI

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 2.5.1 | Create `/sources` page | P0 | 3h | [ ] | |
| 2.5.2 | Add "Connect Google Drive" button with OAuth flow | P0 | 3h | [ ] | |
| 2.5.3 | Display connected sources list | P0 | 2h | [ ] | |
| 2.5.4 | Show source status (connected, error, syncing) | P0 | 2h | [ ] | |

---

## Sprint 4: File Scanning (Week 7-8)

### Feature 2.6: Scan Worker Setup

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 2.6.1 | Create Python scan-worker project | P0 | 2h | [ ] | |
| 2.6.2 | Install google-api-python-client, aiofiles, asyncpg | P0 | 1h | [ ] | |
| 2.6.3 | Add scan-worker to docker-compose.kms.yml | P0 | 2h | [ ] | |
| 2.6.4 | Implement RabbitMQ consumer for `scan.queue` | P0 | 3h | [ ] | |

### Feature 2.7: Google Drive Scanner

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 2.7.1 | Implement token decryption in worker | P0 | 2h | [ ] | |
| 2.7.2 | Initialize Google Drive API client | P0 | 2h | [ ] | |
| 2.7.3 | Implement paginated `files.list()` call | P0 | 3h | [ ] | |
| 2.7.4 | Support shared drives (`supportsAllDrives=True`) | P0 | 1h | [ ] | |
| 2.7.5 | Extract file metadata (id, name, mimeType, size, modifiedTime, md5Checksum) | P0 | 2h | [ ] | |
| 2.7.6 | Reconstruct folder hierarchy from `parents` field | P0 | 3h | [ ] | |
| 2.7.7 | Implement batch upsert (1000 files at a time) | P0 | 3h | [ ] | |
| 2.7.8 | Implement progress tracking (update kms_scan_jobs) | P0 | 2h | [ ] | |

### Feature 2.8: Scan API

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 2.8.1 | Create `POST /api/v1/scan-jobs` endpoint | P0 | 2h | [ ] | |
| 2.8.2 | Create `GET /api/v1/scan-jobs/:id` endpoint | P0 | 1h | [ ] | |
| 2.8.3 | Create `GET /api/v1/scan-jobs` endpoint (list all) | P0 | 1h | [ ] | |

### Feature 2.9: Files UI

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 2.9.1 | Add "Scan Now" button to source card | P0 | 2h | [ ] | |
| 2.9.2 | Display scan progress bar | P0 | 2h | [ ] | |
| 2.9.3 | Create `/files` page with file table | P0 | 4h | [ ] | |
| 2.9.4 | Implement pagination | P0 | 2h | [ ] | |
| 2.9.5 | Add file type filter | P0 | 2h | [ ] | |

---

# Milestone 3: Content Processing (Weeks 9-12)

## Sprint 5: Content Extraction (Week 9-10)

### Feature 3.1: Embedding Worker Setup

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 3.1.1 | Create Python embedding-worker project | P0 | 2h | [ ] | |
| 3.1.2 | Install PyPDF2, pdfplumber, python-docx, openpyxl, Pillow | P0 | 1h | [ ] | |
| 3.1.3 | Add embedding-worker to docker-compose.kms.yml | P0 | 2h | [ ] | |
| 3.1.4 | Implement RabbitMQ consumer for `embed.queue` | P0 | 2h | [ ] | |

### Feature 3.2: PDF Extraction

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 3.2.1 | Implement `extract_pdf_text()` with PyPDF2 | P0 | 3h | [ ] | |
| 3.2.2 | Add pdfplumber fallback for complex PDFs | P0 | 2h | [ ] | |
| 3.2.3 | Handle encrypted/corrupted PDFs (skip with log) | P0 | 2h | [ ] | |
| 3.2.4 | Update `kms_files.extracted_text` | P0 | 1h | [ ] | |
| 3.2.5 | Generate content preview (first 500 chars) | P0 | 1h | [ ] | |

### Feature 3.3: Office Document Extraction

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 3.3.1 | Implement `extract_docx_text()` with python-docx | P0 | 2h | [ ] | |
| 3.3.2 | Implement `extract_xlsx_text()` with openpyxl | P0 | 2h | [ ] | |
| 3.3.3 | Handle large files (skip if > 2GB) | P0 | 1h | [ ] | |

### Feature 3.4: Google Docs Export

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 3.4.1 | Implement Google Docs export as text via Drive API | P0 | 3h | [ ] | |
| 3.4.2 | Implement Google Sheets export as CSV | P0 | 2h | [ ] | |
| 3.4.3 | Parse CSV to extract text | P0 | 1h | [ ] | |

### Feature 3.5: Media Metadata

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 3.5.1 | Implement `extract_image_metadata()` with Pillow | P0 | 2h | [ ] | |
| 3.5.2 | Parse EXIF GPS coordinates | P0 | 1h | [ ] | |
| 3.5.3 | Implement `extract_media_metadata()` with ffprobe | P0 | 2h | [ ] | |
| 3.5.4 | Store metadata in `source_metadata` JSONB field | P0 | 1h | [ ] | |

---

## Sprint 6: Embeddings & Indexing (Week 11-12)

### Feature 3.6: Qdrant Setup

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 3.6.1 | Add Qdrant to docker-compose.kms.yml | P0 | 1h | [ ] | |
| 3.6.2 | Configure Qdrant volume for persistence | P0 | 30m | [ ] | |
| 3.6.3 | Create `kms_files_default` collection (384-dim, cosine) | P0 | 2h | [ ] | |

### Feature 3.7: Embedding Generation

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 3.7.1 | Install sentence-transformers | P0 | 1h | [ ] | |
| 3.7.2 | Download and cache all-MiniLM-L6-v2 model | P0 | 1h | [ ] | |
| 3.7.3 | Implement RecursiveCharacterTextSplitter chunking | P0 | 3h | [ ] | |
| 3.7.4 | Implement batch embedding generation (32 texts at a time) | P0 | 3h | [ ] | |
| 3.7.5 | Store embeddings in Qdrant with metadata payload | P0 | 3h | [ ] | |
| 3.7.6 | Create `kms_embeddings` table and insert references | P0 | 2h | [ ] | |

### Feature 3.8: Neo4j Setup

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 3.8.1 | Add Neo4j to docker-compose.kms.yml | P0 | 1h | [ ] | |
| 3.8.2 | Configure Neo4j volume and authentication | P0 | 1h | [ ] | |
| 3.8.3 | Install neo4j Python driver | P0 | 30m | [ ] | |
| 3.8.4 | Create graph schema (File, Folder, User labels) | P0 | 2h | [ ] | |
| 3.8.5 | Implement sync function to create nodes for files | P0 | 3h | [ ] | |
| 3.8.6 | Create IN_FOLDER and CHILD_OF relationships | P0 | 2h | [ ] | |
| 3.8.7 | Create OWNS relationships (User -> File) | P0 | 1h | [ ] | |

---

# Milestone 4: Search & Discovery (Weeks 13-16)

## Sprint 7: Search API (Week 13-14)

### Feature 4.1: Search API Setup

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 4.1.1 | Initialize NestJS project (`search-api`) | P0 | 3h | [ ] | |
| 4.1.2 | Install @qdrant/js-client-rest, TypeORM, ioredis | P0 | 1h | [ ] | |
| 4.1.3 | Add search-api to docker-compose.kms.yml | P0 | 2h | [ ] | |
| 4.1.4 | Configure TypeORM connection pooling (read-only) | P0 | 2h | [ ] | |

### Feature 4.2: Keyword Search

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 4.2.1 | Create GIN index on kms_files (file_name + extracted_text) | P0 | 1h | [ ] | |
| 4.2.2 | Implement PostgreSQL full-text search with to_tsvector/to_tsquery | P0 | 4h | [ ] | |
| 4.2.3 | Implement ts_rank for relevance scoring | P0 | 2h | [ ] | |
| 4.2.4 | Generate snippets with ts_headline | P0 | 2h | [ ] | |
| 4.2.5 | Implement filter query builder (file_type, date_range, source) | P0 | 3h | [ ] | |

### Feature 4.3: Semantic Search

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 4.3.1 | Implement query embedding generation (call embedding-worker service) | P0 | 4h | [ ] | |
| 4.3.2 | Implement Qdrant vector search | P0 | 3h | [ ] | |
| 4.3.3 | Apply metadata filters in Qdrant query | P0 | 2h | [ ] | |
| 4.3.4 | Bulk fetch file metadata from PostgreSQL | P0 | 2h | [ ] | |

---

## Sprint 8: Hybrid Search & UI (Week 15-16)

### Feature 4.4: Hybrid Search

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 4.4.1 | Implement concurrent keyword + semantic search with Promise.all() | P0 | 3h | [ ] | |
| 4.4.2 | Merge results with weighted scores (40% keyword, 60% semantic) | P0 | 3h | [ ] | |
| 4.4.3 | Deduplicate results | P0 | 1h | [ ] | |
| 4.4.4 | Implement boost factors (filename match, recent, important) | P0 | 2h | [ ] | |
| 4.4.5 | Create `POST /api/v1/search` endpoint | P0 | 2h | [ ] | |

### Feature 4.5: Search UI

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 4.5.1 | Create `/search` page | P0 | 2h | [ ] | |
| 4.5.2 | Implement search input with debounce | P0 | 2h | [ ] | |
| 4.5.3 | Add search mode toggle (keyword/semantic/hybrid) | P0 | 2h | [ ] | |
| 4.5.4 | Create filter panel (file type, date, source, size) | P0 | 4h | [ ] | |
| 4.5.5 | Create result cards with highlighted snippets | P0 | 3h | [ ] | |
| 4.5.6 | Implement pagination/infinite scroll | P0 | 2h | [ ] | |

### Feature 4.6: Performance

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 4.6.1 | Add Redis to docker-compose.kms.yml | P0 | 1h | [ ] | |
| 4.6.2 | Implement query result caching (5 min TTL) | P0 | 3h | [ ] | |
| 4.6.3 | Load test with 50 concurrent users | P0 | 2h | [ ] | |
| 4.6.4 | Optimize bottlenecks based on load test results | P0 | 4h | [ ] | |

---

# Milestone 5: Deduplication & Cleanup (Weeks 17-20)

## Sprint 9: Deduplication (Week 17-18)

### Feature 5.1: Dedup Worker Setup

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 5.1.1 | Create Python dedup-worker project | P0 | 2h | [ ] | |
| 5.1.2 | Add dedup-worker to docker-compose.kms.yml | P0 | 1h | [ ] | |
| 5.1.3 | Implement RabbitMQ consumer for `dedup.queue` | P0 | 2h | [ ] | |

### Feature 5.2: Hash-Based Deduplication

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 5.2.1 | Create `kms_duplicates` table migration | P0 | 2h | [ ] | |
| 5.2.2 | Implement SHA-256 file hashing | P0 | 2h | [ ] | |
| 5.2.3 | Query files by hash to find duplicates | P0 | 2h | [ ] | |
| 5.2.4 | Create duplicate groups with auto-suggested primary (oldest file) | P0 | 2h | [ ] | |
| 5.2.5 | Create Neo4j DUPLICATE_OF relationships | P0 | 2h | [ ] | |

### Feature 5.3: Semantic Deduplication

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 5.3.1 | Query Qdrant for similar vectors (>95% similarity) | P1 | 3h | [ ] | |
| 5.3.2 | Cluster semantically similar files | P1 | 3h | [ ] | |
| 5.3.3 | Create semantic duplicate groups | P1 | 2h | [ ] | |
| 5.3.4 | Tune similarity threshold for accuracy | P1 | 2h | [ ] | |

### Feature 5.4: Duplicates API

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 5.4.1 | Create `GET /api/v1/duplicates` endpoint | P0 | 2h | [ ] | |
| 5.4.2 | Create `PATCH /api/v1/duplicates/:group_id` endpoint (mark primary) | P0 | 2h | [ ] | |
| 5.4.3 | Create `POST /api/v1/duplicates/bulk-delete` endpoint | P0 | 3h | [ ] | |

---

## Sprint 10: Junk Detection & UI (Week 19-20)

### Feature 5.5: Junk Detection

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 5.5.1 | Create junk-detector worker or add to dedup-worker | P0 | 2h | [ ] | |
| 5.5.2 | Implement rule engine for temporary files (.tmp, .cache, .DS_Store) | P0 | 2h | [ ] | |
| 5.5.3 | Detect empty files (0 bytes) | P0 | 1h | [ ] | |
| 5.5.4 | Detect very small files (<10 bytes) | P0 | 30m | [ ] | |
| 5.5.5 | Implement corrupted file detection (try to open/parse) | P0 | 3h | [ ] | |
| 5.5.6 | Update `is_junk`, `junk_confidence`, `junk_reasons` fields | P0 | 1h | [ ] | |

### Feature 5.6: Junk API

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 5.6.1 | Create `GET /api/v1/junk-files` endpoint | P0 | 2h | [ ] | |
| 5.6.2 | Create `POST /api/v1/junk-files/bulk-delete` endpoint | P0 | 3h | [ ] | |
| 5.6.3 | Create `PATCH /api/v1/files/:id/not-junk` endpoint | P0 | 1h | [ ] | |

### Feature 5.7: Duplicates UI

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 5.7.1 | Create `/duplicates` page | P0 | 3h | [ ] | |
| 5.7.2 | Display duplicate groups with all files | P0 | 2h | [ ] | |
| 5.7.3 | Highlight suggested primary file | P0 | 1h | [ ] | |
| 5.7.4 | Add "Mark as Primary" action | P0 | 2h | [ ] | |
| 5.7.5 | Add "Delete Duplicates" action | P0 | 2h | [ ] | |
| 5.7.6 | Implement bulk operations | P0 | 2h | [ ] | |

### Feature 5.8: Junk UI

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 5.8.1 | Create `/junk` page | P0 | 3h | [ ] | |
| 5.8.2 | Group junk files by reason | P0 | 2h | [ ] | |
| 5.8.3 | Show total storage to be freed | P0 | 1h | [ ] | |
| 5.8.4 | Add "Bulk Delete" action with confirmation dialog | P0 | 3h | [ ] | |
| 5.8.5 | Add "Not Junk" exclusion action | P0 | 1h | [ ] | |

---

# Milestone 6: Transcription & Polish (Weeks 21-24)

## Sprint 11: Transcription Integration (Week 21-22)

### Feature 6.1: Transcription Links

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 6.1.1 | Create `kms_transcription_links` table migration | P0 | 2h | [ ] | |

### Feature 6.2: Auto-Transcription

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 6.2.1 | Add `auto_transcribe` config to source settings | P0 | 1h | [ ] | |
| 6.2.2 | Trigger transcription when audio/video file found | P0 | 2h | [ ] | |
| 6.2.3 | Publish to `trans.queue` | P0 | 1h | [ ] | |
| 6.2.4 | Create transcription worker | P0 | 3h | [ ] | |
| 6.2.5 | Download file from source (Google Drive) | P0 | 2h | [ ] | |
| 6.2.6 | Call voice-app API `POST /api/v1/upload` | P0 | 2h | [ ] | |
| 6.2.7 | Poll voice-app job status until completed | P0 | 2h | [ ] | |
| 6.2.8 | Store transcription text in `kms_files.extracted_text` | P0 | 1h | [ ] | |
| 6.2.9 | Trigger embedding generation for transcription | P0 | 1h | [ ] | |

### Feature 6.3: Manual Transcription

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 6.3.1 | Create `POST /api/v1/files/:id/transcribe` endpoint | P0 | 2h | [ ] | |
| 6.3.2 | Create `GET /api/v1/files/:id/transcription-status` endpoint | P0 | 1h | [ ] | |
| 6.3.3 | Add "Transcribe" button to file details UI | P0 | 2h | [ ] | |
| 6.3.4 | Add provider/model selection modal | P0 | 2h | [ ] | |
| 6.3.5 | Display transcription progress | P0 | 2h | [ ] | |

---

## Sprint 12: Polish & Release (Week 23-24)

### Feature 6.4: Performance Optimization

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 6.4.1 | Analyze slow queries with pg_stat_statements | P0 | 2h | [ ] | |
| 6.4.2 | Add missing database indexes | P0 | 2h | [ ] | |
| 6.4.3 | Tune database connection pool | P0 | 1h | [ ] | |
| 6.4.4 | Tune Qdrant HNSW parameters | P0 | 2h | [ ] | |
| 6.4.5 | Implement ETag support for unchanged responses | P1 | 2h | [ ] | |

### Feature 6.5: Bug Fixes

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 6.5.1 | QA testing - test all user flows | P0 | 8h | [ ] | |
| 6.5.2 | Document all bugs found | P0 | 2h | [ ] | |
| 6.5.3 | Fix P0 critical bugs | P0 | 8h | [ ] | |
| 6.5.4 | Fix P1 high-priority bugs (if time permits) | P1 | 4h | [ ] | |

### Feature 6.6: Documentation

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 6.6.1 | Write user guide (connect sources, search, duplicates, junk) | P0 | 4h | [ ] | |
| 6.6.2 | Generate OpenAPI/Swagger spec from NestJS decorators | P0 | 2h | [ ] | |
| 6.6.3 | Host Swagger UI at `/docs` | P0 | 1h | [ ] | |
| 6.6.4 | Write developer setup guide | P0 | 2h | [ ] | |
| 6.6.5 | Write architecture overview for developers | P0 | 2h | [ ] | |

### Feature 6.7: Production Deployment

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| 6.7.1 | Create production docker-compose with security hardening | P0 | 4h | [ ] | |
| 6.7.2 | Configure resource limits for all services | P0 | 2h | [ ] | |
| 6.7.3 | Create backup/restore scripts | P0 | 3h | [ ] | |
| 6.7.4 | Set up Prometheus metrics collection | P0 | 2h | [ ] | |
| 6.7.5 | Create Grafana dashboards | P0 | 3h | [ ] | |
| 6.7.6 | Configure alerting (CPU, memory, errors) | P0 | 2h | [ ] | |

---

# Cross-Cutting Tasks

These tasks span multiple milestones and should be addressed throughout development.

### Testing

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| CC.1.1 | Set up Jest for NestJS unit tests (kms-api, search-api) | P0 | 2h | [ ] | |
| CC.1.2 | Set up Jest for Next.js tests | P0 | 2h | [ ] | |
| CC.1.3 | Set up pytest for Python workers | P0 | 2h | [ ] | |
| CC.1.4 | Achieve 80% code coverage | P0 | Ongoing | [ ] | |
| CC.1.6 | Write E2E tests for critical user flows | P0 | 8h | [ ] | |

### Error Handling & Logging

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| CC.2.1 | Define standardized error response format | P0 | 2h | [ ] | |
| CC.2.2 | Implement error middleware in NestJS | P0 | 2h | [ ] | |
| CC.2.3 | Set up structured logging (Winston for NestJS, structlog for Python) | P0 | 3h | [ ] | |
| CC.2.4 | Document all error codes | P0 | 2h | [ ] | |

### CI/CD

| ID | Task | Priority | Effort | Status | Notes |
|----|------|----------|--------|--------|-------|
| CC.3.1 | Set up GitHub Actions workflow | P0 | 4h | [ ] | |
| CC.3.2 | Add linting step (ESLint, Black, Prettier) | P0 | 2h | [ ] | |
| CC.3.3 | Add test step with coverage reporting | P0 | 2h | [ ] | |
| CC.3.4 | Add Docker build step | P0 | 2h | [ ] | |
| CC.3.5 | Configure dependency scanning (npm audit, safety) | P0 | 2h | [ ] | |

---

## Task Summary

| Milestone | Total Tasks | P0 | P1 | P2 |
|-----------|-------------|----|----|-----|
| M1: Foundation | 43 | 41 | 0 | 2 |
| M2: Google Drive | 24 | 24 | 0 | 0 |
| M3: Content Processing | 22 | 22 | 0 | 0 |
| M4: Search | 20 | 20 | 0 | 0 |
| M5: Deduplication | 18 | 14 | 4 | 0 |
| M6: Polish & Release | 16 | 15 | 1 | 0 |
| **Total** | **142** | **135** | **5** | **2** |

---

**Document Version**: 1.2
**Last Updated**: 2026-01-08
**Tech Stack**: NestJS (APIs), Python (Workers), Next.js (Frontend)
**Observability**: OpenTelemetry, Jaeger, Prometheus, Grafana
