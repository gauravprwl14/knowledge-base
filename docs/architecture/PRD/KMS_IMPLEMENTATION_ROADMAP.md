# Knowledge Management System - Implementation Roadmap

**Version**: 1.1
**Date**: 2026-01-08
**Purpose**: Phased delivery plan with milestones, tasks, and success criteria

> **Note**: For active task tracking and progress monitoring, see [docs/delivery-plan/TASK_BREAKDOWN.md](../../delivery-plan/TASK_BREAKDOWN.md). This document provides the roadmap context; the delivery-plan folder is the canonical source for tracking individual task completion.

---

## Table of Contents

1. [Overview](#overview)
2. [Development Principles](#development-principles)
3. [Milestone 1: Foundation](#milestone-1-foundation-weeks-1-4)
4. [Milestone 2: Google Drive Integration](#milestone-2-google-drive-integration-weeks-5-8)
5. [Milestone 3: Content Processing](#milestone-3-content-processing-weeks-9-12)
6. [Milestone 4: Search & Discovery](#milestone-4-search--discovery-weeks-13-16)
7. [Milestone 5: Deduplication & Cleanup](#milestone-5-deduplication--cleanup-weeks-17-20)
8. [Milestone 6: Transcription & Polish](#milestone-6-transcription--polish-weeks-21-24)
9. [Post-MVP Roadmap](#post-mvp-roadmap)
10. [Risk Mitigation](#risk-mitigation)

---

## Overview

### Timeline Summary

| Phase | Duration | Deliverables | Status |
|-------|----------|--------------|--------|
| **Milestone 1** | Weeks 1-4 | Auth, database, Docker setup, basic UI | Planned |
| **Milestone 2** | Weeks 5-8 | Google Drive integration, file scanning | Planned |
| **Milestone 3** | Weeks 9-12 | Content extraction, embeddings | Planned |
| **Milestone 4** | Weeks 13-16 | Search (keyword + semantic) | Planned |
| **Milestone 5** | Weeks 17-20 | Deduplication, junk cleanup | Planned |
| **Milestone 6** | Weeks 21-24 | Transcription integration, MVP release | Planned |
| **Total** | **6 months** | **Fully functional MVP** | Planned |

### Success Metrics (MVP)

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Files indexed** | 10,000+ per user | Database count |
| **Search latency** | <500ms (p95) | Monitoring dashboard |
| **Duplicate detection accuracy** | >95% for exact duplicates | Manual audit |
| **User onboarding time** | <5 minutes | Time to first scan |
| **System uptime** | >99% | Monitoring alerts |
| **Transcription success rate** | >90% | Job status tracking |

---

## Development Principles

### Agile Methodology

- **Sprint Duration**: 2 weeks
- **Sprint Planning**: Every 2 weeks
- **Daily Standups**: Async (Slack updates)
- **Sprint Review/Demo**: End of each sprint
- **Retrospective**: After each milestone

### Code Quality Standards

```yaml
Quality Gates:
  - Code Review: Required (1 approver minimum)
  - Unit Tests: 80% coverage
  - Integration Tests: Critical paths covered
  - Linting: ESLint (TypeScript), Black (Python)
  - Type Checking: TypeScript strict mode, Python mypy
  - Security: Dependency scanning (npm audit, safety)
```

### Git Workflow

```
main (production-ready)
  ↑
develop (integration branch)
  ↑
feature/KMS-123-google-drive-auth (feature branches)
```

**Commit Convention**:
```
feat(auth): implement Google OAuth flow
fix(search): resolve duplicate results bug
docs(readme): update setup instructions
test(embedding): add unit tests for chunking
```

**PR Template**:
```markdown
## What does this PR do?
[Description]

## Related Issue
Closes #123

## How to Test
1. Step 1
2. Step 2

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes
```

---

## Milestone 1: Foundation (Weeks 1-4)

### Goals

- Set up development environment
- Implement authentication system
- Create database schema
- Build basic Web UI structure

### Sprint 1 (Week 1-2): Infrastructure Setup

#### Tasks

**Backend Setup** (2 days)
- [ ] **Task 1.1.1**: Initialize NestJS project (`kms-api`)
  - Install dependencies: TypeORM, class-validator, @nestjs/jwt
  - Configure tsconfig.json
  - Set up folder structure: modules/, services/, controllers/
- [ ] **Task 1.1.2**: Set up PostgreSQL with Docker Compose
  - Create `docker-compose.kms.yml`
  - Configure volume for data persistence
  - Add health check
- [ ] **Task 1.1.3**: Configure TypeORM
  - Database connection
  - Migration setup (`npm run migration:generate`)
  - Seeding scripts (optional)

**Frontend Setup** (2 days)
- [ ] **Task 1.1.4**: Initialize Next.js 14 project (`web-ui`)
  - App Router structure
  - Install shadcn/ui components
  - Configure Tailwind CSS
- [ ] **Task 1.1.5**: Set up API client
  - Create `lib/api-client.ts`
  - Configure axios with interceptors
  - Error handling utilities

**DevOps** (1 day)
- [ ] **Task 1.1.6**: Docker Compose orchestration
  - Multi-service setup (postgres, rabbitmq, kms-api, web-ui)
  - Hot reload configuration
  - Environment variable management (.env.example)

#### Deliverables

- ✅ Docker Compose successfully starts all services
- ✅ Health check endpoint returns 200
- ✅ Database migrations run successfully
- ✅ Next.js dev server accessible at localhost:3000

---

### Sprint 2 (Week 3-4): Authentication System

#### Tasks

**Database Schema** (1 day)
- [ ] **Task 1.2.1**: Create auth tables migration
  ```sql
  - auth_users
  - auth_api_keys
  - auth_teams (placeholder for future)
  - auth_team_members (placeholder for future)
  ```
- [ ] **Task 1.2.2**: Add indexes and constraints

**Backend Auth** (3 days)
- [ ] **Task 1.2.3**: Implement `AuthModule`
  - `UsersService`: CRUD operations on auth_users
  - `AuthService`: login, register, JWT generation
  - bcrypt password hashing
- [ ] **Task 1.2.4**: Implement Google OAuth
  - Install `@nestjs/passport`, `passport-google-oauth20`
  - Create `GoogleStrategy`
  - Callback handling
- [ ] **Task 1.2.5**: API key management
  - Generate API key endpoint
  - List/revoke endpoints
  - API key guard (for authentication)
- [ ] **Task 1.2.6**: Write unit tests
  - Auth service tests
  - API key validation tests

**Frontend Auth** (3 days)
- [ ] **Task 1.2.7**: Create auth pages
  - `/login` page with email/password form
  - `/register` page with validation
  - "Sign in with Google" button
- [ ] **Task 1.2.8**: Implement auth context
  - React Context for user state
  - JWT storage (httpOnly cookie)
  - Auto-refresh logic
- [ ] **Task 1.2.9**: Protected routes
  - Redirect to login if unauthenticated
  - Dashboard route (`/dashboard`)

**Testing** (1 day)
- [ ] **Task 1.2.10**: E2E tests
  - User registration flow
  - Login flow
  - Google OAuth flow (mock)

#### Deliverables

- ✅ User can register with email/password
- ✅ User can log in with email/password
- ✅ User can sign in with Google OAuth
- ✅ API key generated and displayed
- ✅ Protected routes redirect unauthenticated users
- ✅ Unit tests pass (80% coverage)

#### Demo

- Register new user
- Log in and see dashboard
- Generate API key
- Make authenticated API call with API key

---

## Milestone 2: Google Drive Integration (Weeks 5-8)

### Goals

- Connect Google Drive to KMS
- Scan and index files from Google Drive
- Display files in UI

### Sprint 3 (Week 5-6): Google Drive Connection

#### Tasks

**Database Schema** (1 day)
- [ ] **Task 2.1.1**: Create sources tables migration
  ```sql
  - kms_sources
  - kms_scan_jobs
  - kms_files (basic structure)
  ```

**Google Cloud Setup** (1 day)
- [ ] **Task 2.1.2**: Configure Google Cloud Project
  - Enable Google Drive API
  - Create OAuth 2.0 credentials
  - Configure consent screen
  - Add test users (during development)

**Backend Integration** (4 days)
- [ ] **Task 2.1.3**: Implement token encryption
  - AES-256-GCM encryption utility
  - Store encryption key in environment
- [ ] **Task 2.1.4**: Create `SourcesModule`
  - `SourcesService`: CRUD for kms_sources
  - Google Drive OAuth flow endpoints
  - Token refresh logic
- [ ] **Task 2.1.5**: Test Google Drive connection
  - Fetch user's Drive info
  - List root folder files (10 files max)
  - Handle auth errors (invalid token, etc.)

**Frontend Integration** (2 days)
- [ ] **Task 2.1.6**: Create Sources page (`/sources`)
  - List connected sources
  - "Connect Google Drive" button
  - OAuth redirect flow
- [ ] **Task 2.1.7**: Display connection status
  - Last scan time
  - File count
  - Connection errors

#### Deliverables

- ✅ User can click "Connect Google Drive"
- ✅ OAuth flow completes successfully
- ✅ Tokens stored encrypted in database
- ✅ Test connection succeeds (fetch Drive info)
- ✅ Source displayed in UI

#### Demo

- Navigate to Sources page
- Click "Connect Google Drive"
- Authorize app in Google
- See source listed with status "Connected"

---

### Sprint 4 (Week 7-8): File Scanning

#### Tasks

**Scan Worker Setup** (2 days)
- [ ] **Task 2.2.1**: Create Python scan worker
  - Install `google-api-python-client`, `aiofiles`, `asyncpg`
  - Set up project structure
  - Docker container configuration
- [ ] **Task 2.2.2**: Implement RabbitMQ consumer
  - Connect to `scan.queue`
  - Message handler skeleton

**Google Drive Scanner** (4 days)
- [ ] **Task 2.2.3**: Implement file discovery
  - Paginated `files.list()` API call
  - Support for shared drives
  - Folder hierarchy reconstruction
- [ ] **Task 2.2.4**: File metadata extraction
  - Parse Google Drive metadata
  - Map mimeType to file_type enum
  - Extract file hash (md5Checksum from API)
- [ ] **Task 2.2.5**: Database insertion
  - Batch upsert (1000 files at a time)
  - Conflict resolution (update if modified)
  - Link files to parent folders
- [ ] **Task 2.2.6**: Progress tracking
  - Update `kms_scan_jobs` progress
  - Emit progress events (WebSocket, optional)

**Backend API** (2 days)
- [ ] **Task 2.2.7**: Create scan job endpoints
  - `POST /api/v1/scan-jobs` (initiate scan)
  - `GET /api/v1/scan-jobs/:id` (get status)
  - `GET /api/v1/scan-jobs` (list all scans)

**Frontend UI** (2 days)
- [ ] **Task 2.2.8**: Scan trigger UI
  - "Scan Now" button on source page
  - Scan job status display
  - Progress bar
- [ ] **Task 2.2.9**: Files list page (`/files`)
  - Table with file name, type, size, date
  - Pagination
  - Basic filtering (file type)

#### Deliverables

- ✅ Scan worker consumes from queue
- ✅ Google Drive files discovered and indexed
- ✅ Folder hierarchy preserved
- ✅ Progress updates visible in UI
- ✅ Scan completes successfully (status: completed)
- ✅ Files listed in UI

#### Demo

- Click "Scan Now" on Google Drive source
- Watch progress bar update
- See scan complete
- Navigate to Files page
- See all discovered files with metadata

---

## Milestone 3: Content Processing (Weeks 9-12)

### Goals

- Extract text from PDFs and Office documents
- Generate embeddings for semantic search
- Store embeddings in Qdrant

### Sprint 5 (Week 9-10): Content Extraction

#### Tasks

**Worker Setup** (1 day)
- [ ] **Task 3.1.1**: Create Python embedding worker
  - Install: PyPDF2, python-docx, openpyxl, Pillow
  - Docker container setup
  - RabbitMQ consumer (`embed.queue`)

**PDF Extraction** (2 days)
- [ ] **Task 3.1.2**: Implement PDF text extraction
  - PyPDF2 for standard PDFs
  - pdfplumber fallback for complex PDFs
  - Error handling for encrypted/corrupted PDFs
- [ ] **Task 3.1.3**: Update `kms_files.extracted_text`
  - Store full text
  - Generate preview (first 500 chars)

**Office Documents** (2 days)
- [ ] **Task 3.1.4**: DOCX extraction
  - Extract paragraphs with python-docx
- [ ] **Task 3.1.5**: XLSX extraction
  - Extract sheet names + cell values

**Google Docs Export** (2 days)
- [ ] **Task 3.1.6**: Google Docs export as text
  - Use Drive API `export()` method
  - Handle different mimeTypes
- [ ] **Task 3.1.7**: Google Sheets export as CSV
  - Parse CSV to extract data

**Media Metadata** (1 day)
- [ ] **Task 3.1.8**: Image EXIF extraction
  - Use Pillow to read EXIF
  - Store in `source_metadata` JSONB
- [ ] **Task 3.1.9**: Audio/video metadata
  - Use ffprobe to extract duration, codec, etc.

#### Deliverables

- ✅ PDF text extracted and stored
- ✅ DOCX text extracted
- ✅ XLSX data extracted
- ✅ Google Docs exported as text
- ✅ Image EXIF data stored
- ✅ Worker handles 100+ files without errors

#### Demo

- Upload PDF to Google Drive
- Trigger scan
- View file in UI, see extracted text preview
- Search for keywords from PDF content

---

### Sprint 6 (Week 11-12): Embeddings & Indexing

#### Tasks

**Qdrant Setup** (1 day)
- [ ] **Task 3.2.1**: Add Qdrant to Docker Compose
  - Configure volume for persistence
  - Expose ports
  - Health check
- [ ] **Task 3.2.2**: Create Qdrant collection
  - Collection name: `kms_files_default`
  - Vector size: 384
  - Distance: Cosine

**Embedding Generation** (3 days)
- [ ] **Task 3.2.3**: Install sentence-transformers
  - Model: `all-MiniLM-L6-v2`
  - Download and cache model
- [ ] **Task 3.2.4**: Implement chunking logic
  - Use RecursiveCharacterTextSplitter
  - Chunk size: 1000 chars
  - Overlap: 100 chars
- [ ] **Task 3.2.5**: Generate embeddings
  - Batch processing (32 texts at a time)
  - GPU support (if available)
  - Progress tracking

**Qdrant Storage** (2 days)
- [ ] **Task 3.2.6**: Insert vectors into Qdrant
  - Batch upsert (100 points at a time)
  - Store metadata payload
- [ ] **Task 3.2.7**: Create `kms_embeddings` records
  - Link to files
  - Store vector_id reference

**Neo4j Setup** (2 days)
- [ ] **Task 3.2.8**: Add Neo4j to Docker Compose
  - Configure volume for persistence
  - Set authentication
- [ ] **Task 3.2.9**: Create graph schema
  - Node labels: File, Folder, User
  - Relationships: IN_FOLDER, OWNS
- [ ] **Task 3.2.10**: Sync files to graph
  - Create nodes for each file
  - Create folder hierarchy relationships

#### Deliverables

- ✅ Qdrant running and accessible
- ✅ Embeddings generated for all files with text
- ✅ Vectors stored in Qdrant
- ✅ Neo4j running with file graph
- ✅ Can query graph for folder hierarchy

#### Demo

- Show Qdrant collection with vector count
- Query Qdrant for similar files manually
- Show Neo4j browser with file graph
- Query "all files in folder X"

---

## Milestone 4: Search & Discovery (Weeks 13-16)

### Goals

- Implement keyword search (PostgreSQL)
- Implement semantic search (Qdrant)
- Build search UI with filters
- Combine into hybrid search

### Sprint 7 (Week 13-14): Search API

#### Tasks

**Search API Setup** (2 days)
- [ ] **Task 4.1.1**: Initialize NestJS project (`search-api`)
  - Install: @qdrant/js-client-rest, TypeORM, ioredis
  - Project structure
  - Docker container
- [ ] **Task 4.1.2**: Database connection pooling
  - PostgreSQL connection with TypeORM (read-only)
  - Connection pool configuration

**Keyword Search** (3 days)
- [ ] **Task 4.1.3**: Implement full-text search
  - Use PostgreSQL `to_tsvector` and `to_tsquery`
  - Rank results with `ts_rank`
  - Apply filters (file_type, date_range, etc.)
- [ ] **Task 4.1.4**: Generate snippets
  - Use `ts_headline` for context snippets
  - Highlight matching terms

**Semantic Search** (3 days)
- [ ] **Task 4.1.5**: Implement Qdrant search
  - Generate query embedding (use sentence-transformers)
  - Query Qdrant with filters
  - Fetch top 100 results
- [ ] **Task 4.1.6**: Enrich results
  - Bulk fetch file metadata from PostgreSQL
  - Combine scores with metadata

#### Deliverables

- ✅ Search API running on port 8001
- ✅ Keyword search returns relevant results
- ✅ Semantic search returns relevant results
- ✅ Search latency <500ms (p95)
- ✅ Unit tests for search functions

#### Demo

- Make keyword search API call
- Make semantic search API call
- Show results with scores and snippets

---

### Sprint 8 (Week 15-16): Hybrid Search & UI

#### Tasks

**Hybrid Search** (2 days)
- [ ] **Task 4.2.1**: Implement hybrid search
  - Run keyword + semantic in parallel
  - Merge results with weighted scores (40/60)
  - Deduplicate
- [ ] **Task 4.2.2**: Tuning and optimization
  - Test different weight combinations
  - Measure accuracy improvements

**Search UI** (4 days)
- [ ] **Task 4.2.3**: Create search page (`/search`)
  - Search input with auto-suggest
  - Search mode toggle (keyword/semantic/hybrid)
  - Results list with file cards
- [ ] **Task 4.2.4**: Implement filters panel
  - File type multi-select
  - Date range picker
  - Source filter
  - Size range slider
- [ ] **Task 4.2.5**: Result cards
  - File name, preview, metadata
  - Highlighted snippets
  - Actions: View, Download, Delete
- [ ] **Task 4.2.6**: Pagination
  - Load more / infinite scroll
  - Page size selector

**Performance** (2 days)
- [ ] **Task 4.2.7**: Caching layer
  - Redis cache for popular queries
  - TTL: 5 minutes
- [ ] **Task 4.2.8**: Load testing
  - Simulate 50 concurrent users
  - Measure latency and throughput
  - Optimize bottlenecks

#### Deliverables

- ✅ Hybrid search API endpoint functional
- ✅ Search UI responsive and user-friendly
- ✅ Filters work correctly
- ✅ Pagination works
- ✅ Search latency <500ms (p95) under load
- ✅ Load test passes (50 concurrent users)

#### Demo

- Open search page
- Enter query "machine learning"
- Toggle between search modes
- Apply filters (file type: PDF, last 30 days)
- See relevant results with snippets
- Click file to view details

---

## Milestone 5: Deduplication & Cleanup (Weeks 17-20)

### Goals

- Detect exact duplicates (hash-based)
- Detect semantic duplicates
- Build duplicate management UI
- Implement junk file detection
- Build junk cleanup UI

### Sprint 9 (Week 17-18): Deduplication

#### Tasks

**Dedup Worker** (1 day)
- [ ] **Task 5.1.1**: Create Python dedup worker
  - RabbitMQ consumer (`dedup.queue`)
  - Docker container setup

**Hash-Based Deduplication** (2 days)
- [ ] **Task 5.1.2**: Implement exact duplicate detection
  - Query files by hash
  - Create duplicate groups
  - Insert into `kms_duplicates`
  - Create Neo4j DUPLICATE_OF relationships
- [ ] **Task 5.1.3**: Auto-suggest primary file
  - Logic: Oldest file = primary
  - Mark in `auto_suggested_primary` field

**Semantic Deduplication** (3 days)
- [ ] **Task 5.1.4**: Implement embedding similarity
  - Query Qdrant for similar vectors (>95%)
  - Cluster semantically similar files
  - Create duplicate groups
- [ ] **Task 5.1.5**: Tune threshold
  - Test different similarity thresholds
  - Minimize false positives

**Duplicates API** (2 days)
- [ ] **Task 5.1.6**: Create duplicates endpoints
  - `GET /api/v1/duplicates` (list groups)
  - `PATCH /api/v1/duplicates/:group_id` (mark primary)
  - `POST /api/v1/duplicates/bulk-delete` (delete duplicates)

#### Deliverables

- ✅ Exact duplicates detected accurately
- ✅ Semantic duplicates detected with >90% accuracy
- ✅ Duplicate groups created
- ✅ API endpoints functional
- ✅ Unit tests pass

#### Demo

- Show duplicate groups in database
- Call API to mark primary file
- Delete duplicates via API

---

### Sprint 10 (Week 19-20): Junk Detection & UI

#### Tasks

**Junk Detection** (2 days)
- [ ] **Task 5.2.1**: Implement rule-based junk detection
  - Temporary files (.tmp, .cache, .DS_Store)
  - Empty files
  - Very small files (<10 bytes)
- [ ] **Task 5.2.2**: Implement corrupted file detection
  - Try to open/parse files
  - Mark corrupted as junk

**Junk API** (1 day)
- [ ] **Task 5.2.3**: Create junk endpoints
  - `GET /api/v1/junk-files` (list junk)
  - `POST /api/v1/junk-files/bulk-delete` (delete)
  - `PATCH /api/v1/files/:id/not-junk` (exclude)

**Duplicates UI** (3 days)
- [ ] **Task 5.2.4**: Create duplicates page (`/duplicates`)
  - List duplicate groups
  - Show all files in group
  - Highlight suggested primary
  - Actions: Mark primary, Delete duplicates
- [ ] **Task 5.2.5**: Bulk operations
  - Select multiple groups
  - Bulk delete all non-primary files

**Junk UI** (2 days)
- [ ] **Task 5.2.6**: Create junk page (`/junk`)
  - List junk files grouped by reason
  - Show total size to be freed
  - Actions: Bulk delete, Exclude
- [ ] **Task 5.2.7**: Confirmation dialogs
  - Prevent accidental deletion
  - Show details before delete

#### Deliverables

- ✅ Junk files detected and listed
- ✅ Duplicates UI functional
- ✅ Junk UI functional
- ✅ Bulk delete works
- ✅ Confirmation dialogs prevent accidents
- ✅ User can exclude false positives

#### Demo

- Navigate to Duplicates page
- Show duplicate groups
- Mark primary file
- Delete duplicates
- Navigate to Junk page
- Show junk files grouped by reason
- Bulk delete junk files
- Show storage freed

---

## Milestone 6: Transcription & Polish (Weeks 21-24)

### Goals

- Integrate with voice-app for transcription
- Implement auto-transcription
- Manual transcription trigger
- Performance optimization
- Bug fixes and polish
- **MVP RELEASE**

### Sprint 11 (Week 21-22): Transcription Integration

#### Tasks

**Transcription Worker** (2 days)
- [ ] **Task 6.1.1**: Create transcription trigger
  - Consume from `trans.queue`
  - Download audio/video file
  - Call voice-app API
- [ ] **Task 6.1.2**: Implement polling
  - Poll voice-app job status
  - Store transcription result

**Integration Table** (1 day)
- [ ] **Task 6.1.3**: Create `kms_transcription_links` table
  - Link KMS files to voice-app jobs
  - Store transcription text (duplicate for fast access)

**Auto-Transcription** (2 days)
- [ ] **Task 6.1.4**: Implement auto-trigger logic
  - Check source config `auto_transcribe`
  - Publish to queue when audio/video found
- [ ] **Task 6.1.5**: Update `kms_files.extracted_text`
  - Store transcription text
  - Trigger embedding generation

**Manual Transcription** (2 days)
- [ ] **Task 6.1.6**: Create transcription endpoints
  - `POST /api/v1/files/:id/transcribe` (trigger)
  - `GET /api/v1/files/:id/transcription-status` (poll status)
- [ ] **Task 6.1.7**: Transcription UI
  - "Transcribe" button on file details
  - Provider/model selection
  - Progress indicator

#### Deliverables

- ✅ Auto-transcription works for configured sources
- ✅ Manual transcription triggered from UI
- ✅ Transcription text stored and searchable
- ✅ Integration with voice-app successful
- ✅ Error handling for failed transcriptions

#### Demo

- Upload audio file to Google Drive
- Trigger scan
- See auto-transcription initiated
- View transcription text in file details
- Search for keywords from transcription

---

### Sprint 12 (Week 23-24): Polish & Release

#### Tasks

**Performance Optimization** (3 days)
- [ ] **Task 6.2.1**: Database query optimization
  - Add missing indexes
  - Optimize slow queries (pg_stat_statements)
  - Tune connection pool
- [ ] **Task 6.2.2**: Qdrant optimization
  - Tune HNSW parameters
  - Optimize payload storage
- [ ] **Task 6.2.3**: API caching
  - Redis cache for common queries
  - ETag support for unchanged responses

**Bug Fixes** (3 days)
- [ ] **Task 6.2.4**: QA testing
  - Test all user flows
  - Document bugs
- [ ] **Task 6.2.5**: Fix critical bugs
  - P0 bugs must be fixed before release
- [ ] **Task 6.2.6**: Fix high-priority bugs
  - P1 bugs if time permits

**Documentation** (2 days)
- [ ] **Task 6.2.7**: User guide
  - How to connect sources
  - How to search
  - How to manage duplicates
  - How to clean up junk
- [ ] **Task 6.2.8**: API documentation
  - OpenAPI/Swagger spec
  - Host Swagger UI at `/docs`
- [ ] **Task 6.2.9**: Developer guide
  - Setup instructions
  - Architecture overview
  - How to contribute

**Deployment** (2 days)
- [ ] **Task 6.2.10**: Production Docker Compose
  - Optimize for production
  - Security hardening
  - Resource limits
- [ ] **Task 6.2.11**: Deployment scripts
  - Backup/restore scripts
  - Migration scripts
- [ ] **Task 6.2.12**: Monitoring setup
  - Prometheus metrics
  - Grafana dashboards
  - Alerts (CPU, memory, disk, errors)

#### Deliverables

- ✅ All critical bugs fixed
- ✅ Performance targets met
- ✅ Documentation complete
- ✅ Production deployment ready
- ✅ Monitoring in place
- ✅ **MVP RELEASED** 🎉

#### Demo

- **Full end-to-end flow**:
  1. New user signs up
  2. Connects Google Drive
  3. Scans Google Drive (1000+ files)
  4. Searches for documents
  5. Views duplicates, deletes some
  6. Views junk files, bulk deletes
  7. Triggers transcription for video
  8. Shows fast search results (<500ms)

---

## Post-MVP Roadmap

### Phase 2: Enhanced Discovery (Months 7-9)

**Features**:
- Local file system scanning
- External drive scanning script
- Code project recognition
- Semantic duplicate detection (improved accuracy)
- Advanced filters and faceted search
- File preview in UI
- Related files discovery

### Phase 3: Intelligence & Automation (Months 10-12)

**Features**:
- ML-based junk detection
- OCR for scanned PDFs and images
- Vision models for image content description
- Automated duplicate clustering
- Smart folder organization suggestions
- Real-time sync (Google Drive webhooks)

### Phase 4: Collaboration (Months 13-15)

**Features**:
- Team workspace
- Role-based access control
- File-level permissions
- Activity feed and notifications
- OneDrive and Dropbox integration
- Mobile app (React Native)

### Phase 5: Enterprise (Months 16+)

**Features**:
- Encryption at rest and in transit
- HashiCorp Vault integration
- Compliance (GDPR, SOC 2)
- SSO (SAML, OIDC)
- Advanced analytics
- API rate limiting
- Multi-region deployment

---

## Risk Mitigation

### Identified Risks

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| **Google Drive API rate limits** | High | Medium | Implement exponential backoff, batch requests, cache responses |
| **Qdrant performance at scale** | High | Low | Benchmark early, tune HNSW parameters, plan for cluster mode |
| **Embedding generation too slow** | Medium | Medium | Use GPU, batch processing, queue multiple workers |
| **Search latency > 500ms** | High | Medium | Caching, index optimization, horizontal scaling |
| **Deduplication false positives** | Medium | Medium | Tune thresholds, user review required, feedback loop |
| **Data loss during migration** | Critical | Low | Automated backups, transaction safety, rollback plan |
| **Security vulnerability** | Critical | Medium | Security audits, dependency scanning, penetration testing |
| **Team bandwidth constraints** | High | Medium | Clear priorities, reduce scope if needed, hire contractors |

### Contingency Plans

**If behind schedule**:
1. De-scope non-critical features (move to Phase 2)
2. Extend timeline by 1-2 months
3. Focus on MVP success metrics

**If performance issues**:
1. Add Redis caching layer
2. Horizontal scaling (more workers, API instances)
3. Database read replicas
4. Optimize slow queries

**If Google Drive API limits hit**:
1. Implement smarter batching
2. Incremental sync instead of full scans
3. User notification of rate limits
4. Retry with exponential backoff

---

## Definition of Done (MVP)

- ✅ All Milestone 1-6 tasks completed
- ✅ Unit tests pass (80% coverage)
- ✅ Integration tests pass
- ✅ E2E tests cover critical flows
- ✅ Performance targets met (search <500ms, scan 1000 files/min)
- ✅ Documentation complete (user guide, API docs, dev guide)
- ✅ Security review passed
- ✅ Production deployment successful
- ✅ Monitoring alerts configured
- ✅ User onboarding flow tested
- ✅ **Demo to stakeholders successful**

---

**Document Version**: 1.0
**Last Updated**: 2026-01-07
**Next Review**: End of each milestone
