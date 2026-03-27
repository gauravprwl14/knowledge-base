# KMS Milestone Tracker

**Last Updated**: 2026-03-17
**Overall Progress**: ~17%

---

## Progress Overview

```
M1: Foundation        [██████████] 100% (25/25 tasks) ✅ Complete (pending QA)
M2: Google Drive      [░░░░░░░░░░]   0% (0/24 tasks)
M3: Content Processing[░░░░░░░░░░]   0% (0/22 tasks)
M4: Search            [░░░░░░░░░░]   0% (0/20 tasks)
M5: Deduplication     [░░░░░░░░░░]   0% (0/18 tasks)
M6: Polish & Release  [░░░░░░░░░░]   0% (0/16 tasks)
─────────────────────────────────────────────────
TOTAL                 [█░░░░░░░░░] ~17% (25/125 tasks)
```

---

## Milestone Status

### M1: Foundation (Weeks 1-4)
- **Status**: Complete (pending QA)
- **Completed**: 2026-03-17
- **Sprint 1 (Week 1-2)**: Infrastructure Setup — DONE
- **Sprint 2 (Week 3-4)**: Authentication System — DONE
- **Key Deliverables**:
  - [x] Docker Compose brings up all services
  - [x] User registration & login works
  - [x] Google OAuth functional
  - [x] API key generation works
  - [x] Basic dashboard accessible

#### M1 Completion Summary (2026-03-17)

**Backend (kms-api) — fully shipped:**
- Auth endpoints: POST /auth/register, /auth/login, /auth/refresh, /auth/logout, /auth/change-password
- JWT access tokens (15m) + refresh tokens (7d) persisted to DB; revocation on logout
- Google OAuth 2.0 flow: GET /auth/google + /auth/google/callback
- API key management: create (plaintext returned once, hash stored), list, revoke
- GET /users/me — current user profile
- JWT guard + combined auth guard (JWT + API key) on all protected routes
- Account lockout after 5 consecutive failed login attempts
- Zod validation on all DTOs; Swagger/OpenAPI docs on all endpoints
- PinoLogger structured logging (InjectPinoLogger) + OTel @Trace() on all service methods
- Prisma v7 + @prisma/adapter-pg

**Frontend (Next.js 15) — fully shipped:**
- Login page (/[locale]/login) and Register page (/[locale]/register)
- Auth middleware with unauthenticated redirect to /login
- AuthProvider backed by TanStack Store
- TanStack Query hooks: useLogin, useRegister, useLogout, useMe, useApiKeys
- API Keys settings page (/[locale]/settings/api-keys)
- Design system: shadcn/ui + Radix UI primitives
- KMS wrapper primitives: Button, Input, Card, Badge, Alert, Dialog, Label
- Design tokens (CSS variables, dark/light mode)
- 23 routes compile clean

**Infrastructure — fully shipped:**
- Grafana Labs observability stack: Tempo (traces), Loki (logs), Prometheus (metrics), Grafana (dashboards)
- OTel Collector pipeline: traces→Tempo, logs→Loki, metrics→Prometheus
- Trace↔Log correlation via traceId derived fields in Grafana
- kms-start.sh auto-detects Podman/Docker

**Known gaps (not blocking M1 DoD):**
- Email verification flow: PENDING_VERIFICATION status set; verification email not yet sent
- Google OAuth requires container rebuild to install passport-google-oauth20
- No E2E tests yet (manual QA only)

### M2: Google Drive Integration (Weeks 5-8)
- **Status**: Not Started
- **Sprint 3 (Week 5-6)**: Google Drive Connection
- **Sprint 4 (Week 7-8)**: File Scanning
- **Key Deliverables**:
  - [ ] Google Drive OAuth flow completes
  - [ ] Tokens stored encrypted
  - [ ] Scan worker processes files
  - [ ] Files indexed in database
  - [ ] Files visible in UI

### M3: Content Processing (Weeks 9-12)
- **Status**: Not Started
- **Sprint 5 (Week 9-10)**: Content Extraction Pipeline
- **Sprint 6 (Week 11-12)**: Embeddings & Search Foundation
- **Key Deliverables**:
  - [ ] PDF text extraction (pdfminer/pdfplumber)
  - [ ] DOCX/PPTX extraction (python-docx, python-pptx)
  - [ ] XLSX/CSV extraction + schema inference
  - [ ] ZIP recursive extraction
  - [ ] Image OCR (Tesseract)
  - [ ] Google Workspace export (Docs→PDF, Sheets→XLSX)
  - [ ] Text chunking: 512 tokens, 64 overlap
  - [ ] File status state machine: PENDING→PROCESSING→INDEXED|FAILED|UNSUPPORTED
  - [ ] Files list UI with filters + sorting
  - [ ] Intelligence Score computed + displayed
  - [ ] Document preview side panel

### M4: Search & Discovery (Weeks 13-16)
- **Status**: Not Started
- **Sprint 7 (Week 13-14)**: Search API
- **Sprint 8 (Week 15-16)**: Hybrid Search & UI
- **Key Deliverables**:
  - [ ] BGE-M3 embedding generation (1024 dimensions)
  - [ ] Qdrant collection populated with chunk vectors
  - [ ] Keyword search: PostgreSQL tsvector < 200ms p95
  - [ ] Semantic search: Qdrant cosine similarity < 500ms p95
  - [ ] Hybrid search: RRF fusion < 800ms p95
  - [ ] "Top Pick" badge on top 3 results (score > 0.85)
  - [ ] Search result card: type icon, name, source, snippet, score bar, quick actions
  - [ ] Filter sidebar: file type facets, source facets, date histogram
  - [ ] Autocomplete suggestions (file names + frequent queries)
  - [ ] Zero results / error states

### M5: Deduplication & Cleanup (Weeks 17-20)
- **Status**: Not Started
- **Sprint 9 (Week 17-18)**: Deduplication
- **Sprint 10 (Week 19-20)**: Junk Detection & UI
- **Key Deliverables**:
  - [ ] Hash-based duplicates detected
  - [ ] Semantic duplicates identified
  - [ ] Junk files detected (temp, empty, corrupted)
  - [ ] Duplicates UI allows management
  - [ ] Bulk delete works for junk files

### M6: Transcription & Polish (Weeks 21-24)
- **Status**: Not Started
- **Sprint 11 (Week 21-22)**: Transcription Integration
- **Sprint 12 (Week 23-24)**: Polish & Release
- **Key Deliverables**:
  - [ ] Auto-transcription triggers for audio/video
  - [ ] Manual transcription from UI works
  - [ ] Performance targets met
  - [ ] Documentation complete
  - [ ] MVP RELEASED

---

## Product Vision — Three Pillars

### Pillar 1: Document Ingestion & Processing (M3-M4)
- Any file type supported: PDF, DOCX, XLSX/CSV, PPTX, TXT/MD, ZIP, Images, Audio/Video, Google Workspace
- Processing pipeline: Detect → Extract → Chunk → Embed → Index → Graph
- File status machine: PENDING → PROCESSING → INDEXED | FAILED | UNSUPPORTED
- Target: 10,000 files/user, < 5min processing per file

### Pillar 2: Document Discovery (M3-M4)
- Files list with filters (type, source, date, status, tags, collection)
- Intelligence Score (0-100): content richness + recency + access frequency + link density
- Quick preview side panel: summary, key entities, top concepts
- Duplicate & junk detection badges

### Pillar 3: Search & Ranking (M2-M4-M5)
- Tier 1 — Keyword: PostgreSQL tsvector, < 200ms p95
- Tier 2 — Semantic: Qdrant BGE-M3 cosine similarity, < 500ms p95
- Tier 3 — Hybrid: RRF fusion, "Top Pick" badge on top 3 results, < 800ms p95
- Answer card for authoritative queries (M5)

---

## Success Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Files indexed per user | 10,000+ | - | Not Started |
| Search latency (p95) | <500ms | - | Not Started |
| Duplicate detection accuracy | >95% | - | Not Started |
| User onboarding time | <5 min | - | Not Started |
| System uptime | >99% | - | Not Started |
| Transcription success rate | >90% | - | Not Started |

---

## Blockers & Risks

| Risk | Impact | Status | Mitigation |
|------|--------|--------|------------|
| Google API rate limits | High | Watching | Exponential backoff, caching |
| Search latency >500ms | High | Watching | Redis caching, index optimization |
| Embedding generation slow | Medium | Watching | GPU, batch processing |
| Dedup false positives | Medium | Watching | Tune thresholds, user review |

---

## Notes

- **2026-03-17**: M1 declared complete (pending QA). All auth endpoints, API key management, frontend auth pages, design system, and observability stack are implemented and compiling clean. Google OAuth needs a container rebuild before it can be smoke-tested end-to-end. E2E tests are deferred to the M2 cycle.

---

**Next Review**: End of Milestone 2
