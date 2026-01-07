# Knowledge Management System - Feature Breakdown

**Version**: 1.0
**Date**: 2026-01-07
**Purpose**: Detailed breakdown of all features, modules, sub-features, and tasks with expected behaviors

---

## Table of Contents

1. [Module Overview](#module-overview)
2. [Module 1: Authentication & User Management](#module-1-authentication--user-management)
3. [Module 2: Source Integration & Scanning](#module-2-source-integration--scanning)
4. [Module 3: Content Extraction & Processing](#module-3-content-extraction--processing)
5. [Module 4: Embedding & Indexing](#module-4-embedding--indexing)
6. [Module 5: Search & Discovery](#module-5-search--discovery)
7. [Module 6: Deduplication](#module-6-deduplication)
8. [Module 7: Junk Detection & Cleanup](#module-7-junk-detection--cleanup)
9. [Module 8: Transcription Integration](#module-8-transcription-integration)
10. [Module 9: User Interface](#module-9-user-interface)
11. [Cross-Cutting Concerns](#cross-cutting-concerns)

---

## Module Overview

| Module # | Module Name | Priority | Dependencies | Microservices Involved |
|----------|-------------|----------|--------------|----------------------|
| M1 | Authentication & User Management | P0 (MVP) | None | kms-api |
| M2 | Source Integration & Scanning | P0 (MVP) | M1 | kms-api, scan-worker |
| M3 | Content Extraction & Processing | P0 (MVP) | M2 | embedding-worker |
| M4 | Embedding & Indexing | P0 (MVP) | M3 | embedding-worker, Qdrant, Neo4j |
| M5 | Search & Discovery | P0 (MVP) | M4 | search-api |
| M6 | Deduplication | P0 (MVP) | M4 | dedup-worker |
| M7 | Junk Detection & Cleanup | P0 (MVP) | M2, M6 | junk-detector, kms-api |
| M8 | Transcription Integration | P0 (MVP) | M2, voice-app | kms-api, voice-app-api |
| M9 | User Interface | P0 (MVP) | All | web-ui |
| CC | Cross-Cutting Concerns | P0 (MVP) | All | All services |

**Priority Levels:**
- **P0 (MVP)**: Must-have for initial release
- **P1 (Phase 2)**: Important, soon after MVP
- **P2 (Phase 3)**: Nice-to-have, future enhancement
- **P3 (Future)**: Long-term roadmap

---

## Module 1: Authentication & User Management

**Owner**: kms-api (NestJS)
**Database Tables**: `auth_users`, `auth_api_keys`, `auth_teams`, `auth_team_members`
**Priority**: P0 (MVP)

### Feature 1.1: User Registration & Login (P0)

#### Sub-feature 1.1.1: Email/Password Registration
**Expected Behavior**:
- User provides email, password, name
- System validates email format and password strength (min 8 chars, 1 uppercase, 1 number)
- Password hashed with bcrypt (cost factor 12)
- Activation email sent (future: for now, auto-activate)
- User record created in `auth_users`
- Default API key auto-generated and returned

**Tasks**:
1. **Task 1.1.1.1**: Create `AuthModule` in NestJS
   - Set up `UsersService`, `AuthService`
   - Implement bcrypt hashing utility
2. **Task 1.1.1.2**: Create `POST /api/v1/auth/register` endpoint
   - Validate input DTO (email, password, name)
   - Check email uniqueness
   - Hash password
   - Insert into `auth_users`
   - Generate default API key
3. **Task 1.1.1.3**: Create `POST /api/v1/auth/login` endpoint
   - Validate credentials
   - Generate JWT token (optional for session)
   - Return user profile + API key

**Acceptance Criteria**:
- [x] Email validation rejects invalid formats
- [x] Weak passwords rejected (test: "weak123" fails, "Strong123!" succeeds)
- [x] Duplicate email returns 409 Conflict
- [x] Successful registration returns 201 with API key
- [x] Login with correct credentials returns 200 with token
- [x] Login with wrong password returns 401

#### Sub-feature 1.1.2: Google OAuth Login (P0)
**Expected Behavior**:
- User clicks "Sign in with Google"
- Redirected to Google consent screen
- After approval, OAuth code exchanged for user info
- If email exists, link to existing account; else create new user
- Auto-generate API key if new user

**Tasks**:
1. **Task 1.1.2.1**: Set up Google OAuth in Google Cloud Console
   - Create OAuth 2.0 client ID
   - Configure authorized redirect URIs
2. **Task 1.1.2.2**: Implement OAuth flow in NestJS
   - Install `@nestjs/passport`, `passport-google-oauth20`
   - Create `GoogleStrategy`
3. **Task 1.1.2.3**: Create `GET /api/v1/auth/google` and `/api/v1/auth/google/callback` endpoints
   - Initiate OAuth flow
   - Handle callback with user profile
   - Create or link user account

**Acceptance Criteria**:
- [x] Clicking "Sign in with Google" redirects to Google
- [x] After approval, user redirected back to app
- [x] New Google user creates account automatically
- [x] Existing Google user logs in without creating duplicate
- [x] API key generated for new OAuth users

### Feature 1.2: API Key Management (P0)

#### Sub-feature 1.2.1: Generate API Key
**Expected Behavior**:
- User can create multiple API keys with custom names
- Each key has scopes (permissions): `['kms:read', 'kms:write', 'voice:read', 'voice:write']`
- Raw key returned ONCE (never stored, only hash stored)
- Keys can have expiration dates (optional)

**Tasks**:
1. **Task 1.2.1.1**: Create `POST /api/v1/api-keys` endpoint
   - Input: `{ name: "My API Key", scopes: [...], expires_at: "2025-12-31" }`
   - Generate random key with `crypto.randomBytes(32).toString('base64url')`
   - Hash key with SHA256
   - Store hash, name, scopes in `auth_api_keys`
   - Return raw key (only time it's visible)
2. **Task 1.2.1.2**: Create API key guard for authentication
   - Extract `X-API-Key` header
   - Hash and lookup in `auth_api_keys`
   - Check `is_active` and `expires_at`
   - Inject `user` object into request context

**Acceptance Criteria**:
- [x] New API key created with custom name
- [x] Raw key returned in response
- [x] Hash stored in database (raw key never stored)
- [x] Requests with valid key authenticated successfully
- [x] Expired keys rejected with 401
- [x] Inactive keys rejected with 401

#### Sub-feature 1.2.2: List & Revoke API Keys (P0)
**Expected Behavior**:
- User can view all their API keys (without raw values)
- User can revoke (deactivate) keys
- Revoked keys immediately stop working

**Tasks**:
1. **Task 1.2.2.1**: Create `GET /api/v1/api-keys` endpoint
   - Return all keys for authenticated user
   - Show: name, scopes, created_at, last_used_at, is_active
   - Hide: key_hash, raw key
2. **Task 1.2.2.2**: Create `DELETE /api/v1/api-keys/:id` endpoint
   - Set `is_active = FALSE`
   - Soft delete (keep record for audit)

**Acceptance Criteria**:
- [x] List returns all user's API keys
- [x] Raw key never exposed in list
- [x] Revoke immediately invalidates key
- [x] Requests with revoked key return 401

### Feature 1.3: Team Management (P2 - Future)

#### Sub-feature 1.3.1: Create Team
**Expected Behavior**:
- User can create a team with name
- Creator becomes team owner
- Team has default role: owner

**Tasks** (P2 - not MVP):
- Create `POST /api/v1/teams` endpoint
- Insert into `auth_teams`, `auth_team_members`

#### Sub-feature 1.3.2: Invite Members
**Expected Behavior**:
- Team owner/admin can invite members via email
- Invitees receive email with invite link
- On acceptance, added to team with specified role

**Tasks** (P2 - not MVP):
- Create invite system with tokens
- Email service integration

---

## Module 2: Source Integration & Scanning

**Owner**: kms-api (NestJS) + scan-worker (Python)
**Database Tables**: `kms_sources`, `kms_scan_jobs`, `kms_files`
**Priority**: P0 (MVP)

### Feature 2.1: Google Drive Integration (P0)

#### Sub-feature 2.1.1: Connect Google Drive
**Expected Behavior**:
- User clicks "Connect Google Drive" in UI
- OAuth flow initiated (similar to login)
- Permissions requested: `drive.readonly`, `drive.metadata.readonly`
- On approval, access_token and refresh_token stored (encrypted)
- Source record created with `source_type = 'google_drive'`

**Tasks**:
1. **Task 2.1.1.1**: Set up Google Drive API in Google Cloud Console
   - Enable Google Drive API
   - Create OAuth consent screen
   - Add scopes: `drive.readonly`, `drive.metadata.readonly`
2. **Task 2.1.1.2**: Create `POST /api/v1/sources/google-drive/connect` endpoint
   - Initiate OAuth flow
   - Store tokens in `kms_sources.config` (encrypted with AES-256)
3. **Task 2.1.1.3**: Create encryption utilities
   - Use `crypto` module to encrypt/decrypt tokens
   - Store encryption key in environment variable
4. **Task 2.1.1.4**: Create `GET /api/v1/sources/google-drive/callback` endpoint
   - Exchange code for tokens
   - Test connection by fetching user's Drive info
   - Create source record

**Acceptance Criteria**:
- [x] OAuth flow completes successfully
- [x] Tokens stored encrypted in database
- [x] Source marked as active
- [x] Connection test succeeds (fetch Drive info)

#### Sub-feature 2.1.2: Google Drive Scanning (P0)
**Expected Behavior**:
- User clicks "Scan Now" or scheduled scan triggers
- Scan job created with status `pending`
- Scan worker picks up job, fetches all files from Google Drive (paginated)
- For each file:
  - Check if already indexed (by `source_file_id` = Google Drive file ID)
  - If new or modified (compare `modifiedTime`), create/update `kms_files` record
  - Extract metadata: name, size, mimeType, parents (folder structure)
- Progress updated in real-time (files_discovered, files_processed)
- On completion, status → `completed`

**Tasks**:
1. **Task 2.1.2.1**: Create `POST /api/v1/scan-jobs` endpoint
   - Input: `{ source_id: "uuid" }`
   - Insert into `kms_scan_jobs` with status `pending`
   - Publish message to `scan.queue`
2. **Task 2.1.2.2**: Create scan worker (Python)
   - Install `google-api-python-client`
   - Consume from `scan.queue`
   - Decrypt tokens from `kms_sources.config`
   - Initialize Google Drive API client
3. **Task 2.1.2.3**: Implement `scan_google_drive()` function
   - Fetch files using `drive.files().list()` with pagination
   - Fields: `id, name, mimeType, size, modifiedTime, md5Checksum, parents`
   - Include shared drives: `supportsAllDrives=True`
   - For each file, upsert into `kms_files`
4. **Task 2.1.2.4**: Implement progress tracking
   - Update `kms_scan_jobs.progress` every 100 files
   - Emit WebSocket event for real-time UI update (optional)
5. **Task 2.1.2.5**: Handle folder hierarchy
   - Reconstruct folder paths from `parents` field
   - Create folder records in `kms_files` with `is_folder = TRUE`
   - Link files to parent folders via `parent_folder_id`

**Acceptance Criteria**:
- [x] Scan discovers all files in Google Drive
- [x] Shared drive files included
- [x] Folder structure preserved
- [x] Modified files updated (not duplicated)
- [x] Progress updates visible in UI
- [x] Scan completes with status `completed`
- [x] Worker handles pagination (>1000 files)

#### Sub-feature 2.1.3: Incremental Sync (P1 - Post-MVP)
**Expected Behavior**:
- Only fetch files changed since last scan
- Use Google Drive `changes.list` API with `pageToken`
- Faster than full scan

**Tasks** (P1):
- Implement `changes.list` API integration
- Store `pageToken` in `kms_sources.config`

### Feature 2.2: Local File System Scanning (P1)

#### Sub-feature 2.2.1: Add Local Folder Source
**Expected Behavior**:
- User provides folder path (e.g., `/Users/name/Documents`)
- System validates path exists and is readable
- Source created with `source_type = 'local_fs'`
- Initial scan triggered

**Tasks** (P1):
1. Create `POST /api/v1/sources/local-fs` endpoint
2. Validate path accessibility
3. Create source record

#### Sub-feature 2.2.2: Scan Local Folder (P1)
**Expected Behavior**:
- Recursively walk directory tree
- For each file, create `kms_files` record
- Calculate file hash (SHA256) for deduplication
- Extract file metadata (size, timestamps)

**Tasks** (P1):
1. Implement recursive directory walker (Python `os.walk`)
2. Calculate file hashes
3. Insert into `kms_files`

### Feature 2.3: External Drive Scanning (P1)

#### Sub-feature 2.3.1: Scan Script (P1)
**Expected Behavior**:
- User runs CLI script: `kms-scan /Volumes/ExternalDrive`
- Script authenticates with API key
- Scans drive and uploads file metadata via API
- Progress shown in terminal

**Tasks** (P1):
1. Create Python CLI script
2. Implement authentication with API key
3. Scan and upload file metadata

---

## Module 3: Content Extraction & Processing

**Owner**: embedding-worker (Python)
**Database Tables**: `kms_files` (updates extracted_text)
**Priority**: P0 (MVP)

### Feature 3.1: PDF Text Extraction (P0)

#### Sub-feature 3.1.1: Extract Text from PDF
**Expected Behavior**:
- Worker receives message from `embed.queue` with file_id
- Download PDF from source (Google Drive API) or local path
- Extract text using PyPDF2 or pdfplumber
- Store extracted text in `kms_files.extracted_text`
- Generate content preview (first 500 chars)

**Tasks**:
1. **Task 3.1.1.1**: Install PDF libraries
   - `pip install PyPDF2 pdfplumber`
2. **Task 3.1.1.2**: Implement `extract_pdf_text()` function
   - Try PyPDF2 first (faster)
   - If fails, fallback to pdfplumber (more robust)
   - Handle encrypted PDFs (skip or use password if provided)
3. **Task 3.1.1.3**: Update `kms_files` record
   - Set `extracted_text` field
   - Set `content_preview` (first 500 chars)
4. **Task 3.1.1.4**: Handle large PDFs
   - Skip files > 2GB
   - Log error and mark as failed in scan job

**Acceptance Criteria**:
- [x] Text extracted from standard PDFs
- [x] Large PDFs (500+ pages) processed successfully
- [x] Encrypted PDFs handled gracefully (skip with log)
- [x] Extracted text stored in database
- [x] Files > 2GB skipped

### Feature 3.2: Microsoft Office Document Extraction (P0)

#### Sub-feature 3.2.1: Extract Text from DOCX/XLSX
**Expected Behavior**:
- Extract text from Word documents (.docx)
- Extract text from Excel spreadsheets (.xlsx) - sheet names + cell values
- Store in `extracted_text` field

**Tasks**:
1. **Task 3.2.1.1**: Install Office libraries
   - `pip install python-docx openpyxl`
2. **Task 3.2.1.2**: Implement `extract_docx_text()` function
   - Extract all paragraphs
   - Preserve basic formatting (newlines)
3. **Task 3.2.1.3**: Implement `extract_xlsx_text()` function
   - Iterate sheets
   - Extract all cell values
   - Format as "Sheet1: value1, value2, ..."

**Acceptance Criteria**:
- [x] DOCX text extracted with paragraphs
- [x] XLSX data extracted from all sheets
- [x] Large files handled (skip if > 2GB)

### Feature 3.3: Google Docs/Sheets Export (P0)

#### Sub-feature 3.3.1: Export Google Docs as Text
**Expected Behavior**:
- For files with `mimeType = 'application/vnd.google-apps.document'`
- Use Google Drive API to export as plain text
- Store exported text in `extracted_text`

**Tasks**:
1. **Task 3.3.1.1**: Implement `export_google_doc()` function
   - Use `drive.files().export()` API
   - Export as `text/plain` format
2. **Task 3.3.1.2**: Handle Google Sheets
   - Export as CSV
   - Parse CSV to extract text

**Acceptance Criteria**:
- [x] Google Docs exported as text
- [x] Google Sheets exported as CSV and parsed

### Feature 3.4: Media Metadata Extraction (P0)

#### Sub-feature 3.4.1: Extract EXIF from Images
**Expected Behavior**:
- For images (PNG, JPG), extract EXIF metadata
- Store in `kms_files.source_metadata` JSONB field
- Include: camera model, GPS coordinates, date taken

**Tasks**:
1. **Task 3.4.1.1**: Install EXIF library
   - `pip install Pillow exifread`
2. **Task 3.4.1.2**: Implement `extract_image_metadata()` function
   - Read EXIF tags
   - Parse GPS coordinates
   - Store as JSON

**Acceptance Criteria**:
- [x] EXIF data extracted from images
- [x] GPS coordinates parsed correctly

#### Sub-feature 3.4.2: Extract Audio/Video Metadata (P0)
**Expected Behavior**:
- Extract duration, codec, bitrate, resolution
- Store in `source_metadata`

**Tasks**:
1. **Task 3.4.2.1**: Install FFmpeg wrapper
   - `pip install ffmpeg-python`
2. **Task 3.4.2.2**: Implement `extract_media_metadata()` function
   - Use ffprobe to get metadata

**Acceptance Criteria**:
- [x] Duration extracted from audio/video
- [x] Resolution extracted from video

### Feature 3.5: Code Project Detection (P1)

#### Sub-feature 3.5.1: Detect Code Projects
**Expected Behavior**:
- When scanning a folder, check for presence of:
  - `package.json` (Node.js)
  - `requirements.txt` or `setup.py` (Python)
  - `pom.xml` (Java)
  - `.git` directory (any language)
- If detected, mark folder as code project
- Create record in `kms_code_projects`

**Tasks** (P1):
1. Implement project detection logic
2. Extract README content
3. Detect languages (count file extensions)
4. Store in `kms_code_projects`

**Acceptance Criteria**:
- [x] Node.js projects detected
- [x] Python projects detected
- [x] README extracted
- [x] Languages auto-detected

---

## Module 4: Embedding & Indexing

**Owner**: embedding-worker (Python) + Qdrant + Neo4j
**Database Tables**: `kms_embeddings`
**Priority**: P0 (MVP)

### Feature 4.1: Text Embedding Generation (P0)

#### Sub-feature 4.1.1: Generate Embeddings with Sentence Transformers
**Expected Behavior**:
- After content extraction, worker generates embeddings
- Uses `sentence-transformers/all-MiniLM-L6-v2` model (default)
- For large documents, split into semantic chunks
- Each chunk gets separate embedding
- Embeddings stored in Qdrant vector database

**Tasks**:
1. **Task 4.1.1.1**: Install Sentence Transformers
   - `pip install sentence-transformers`
   - Download model on first run (cached locally)
2. **Task 4.1.1.2**: Implement `generate_embeddings()` function
   - Input: text content
   - Output: 384-dimensional vector
   - Batch process for efficiency (32 texts at once)
3. **Task 4.1.1.3**: Set up Qdrant
   - Docker container: `docker run -p 6333:6333 qdrant/qdrant`
   - Create collection: `kms_files` with vector size 384
4. **Task 4.1.1.4**: Store embeddings in Qdrant
   - Use `qdrant-client` Python library
   - Upsert points with `file_id` as ID
   - Store metadata: file_name, file_type, user_id
5. **Task 4.1.1.5**: Store reference in PostgreSQL
   - Insert into `kms_embeddings` with `vector_id`

**Acceptance Criteria**:
- [x] Embeddings generated for all files with text
- [x] Qdrant collection created and populated
- [x] Embeddings searchable via vector similarity
- [x] Batch processing handles 1000+ files efficiently

#### Sub-feature 4.1.2: Semantic Chunking for Large Documents (P0)
**Expected Behavior**:
- Documents > 5000 words split into chunks
- Chunking based on paragraphs/sections (not fixed size)
- Each chunk embedded separately
- Chunks linked to parent document

**Tasks**:
1. **Task 4.1.2.1**: Implement semantic chunking
   - Use `langchain.text_splitter.RecursiveCharacterTextSplitter`
   - Chunk by paragraphs with overlap
2. **Task 4.1.2.2**: Store chunks
   - Each chunk → separate `kms_embeddings` record
   - Use `chunk_index` to order chunks
3. **Task 4.1.2.3**: Handle chunk overlap
   - 10% overlap between consecutive chunks
   - Helps maintain context

**Acceptance Criteria**:
- [x] Large documents split into reasonable chunks (<1000 words each)
- [x] Chunk overlap preserves context
- [x] All chunks searchable independently

### Feature 4.2: Cloud Embedding (Optional) (P0)

#### Sub-feature 4.2.1: User-Selected Cloud Embeddings
**Expected Behavior**:
- User can manually select files/folders for cloud embedding
- Supports OpenAI (text-embedding-3-small) or Cohere
- User provides their own API key
- Cloud embeddings stored separately in Qdrant

**Tasks**:
1. **Task 4.2.1.1**: Create `POST /api/v1/files/:id/embed-cloud` endpoint
   - Input: provider ('openai', 'cohere'), api_key
   - Trigger cloud embedding job
2. **Task 4.2.1.2**: Implement OpenAI embedding
   - Use `openai` Python SDK
   - Generate 1536-dim embeddings
3. **Task 4.2.1.3**: Store in separate Qdrant collection
   - Collection: `kms_files_cloud`
   - Include source field to distinguish

**Acceptance Criteria**:
- [x] User can select files for cloud embedding
- [x] OpenAI embeddings generated successfully
- [x] Cloud embeddings searchable

### Feature 4.3: Graph Relationships (P0)

#### Sub-feature 4.3.1: Build File Hierarchy in Neo4j
**Expected Behavior**:
- Create graph nodes for files and folders
- Relationships:
  - `(File)-[:IN_FOLDER]->(Folder)`
  - `(Folder)-[:CHILD_OF]->(Folder)` (nested folders)
  - `(User)-[:OWNS]->(File)`
- Enables queries like "find all files in this folder tree"

**Tasks**:
1. **Task 4.3.1.1**: Set up Neo4j
   - Docker: `docker run -p 7474:7474 -p 7687:7687 neo4j`
   - Configure authentication
2. **Task 4.3.1.2**: Install Neo4j Python driver
   - `pip install neo4j`
3. **Task 4.3.1.3**: Create graph nodes
   - On file insert, create corresponding Neo4j node
   - Node properties: id, name, type
4. **Task 4.3.1.4**: Create relationships
   - Link file to parent folder
   - Link folder to parent folder
   - Link file to owner user

**Acceptance Criteria**:
- [x] All files have corresponding graph nodes
- [x] Folder hierarchy represented correctly
- [x] Ownership relationships exist
- [x] Can query "all files in folder X" efficiently

#### Sub-feature 4.3.2: Duplicate Relationships (P0)
**Expected Behavior**:
- When duplicates detected, create graph relationship
- `(File)-[:DUPLICATE_OF {similarity: 0.98}]->(File)`
- Enables cluster visualization

**Tasks**:
1. Create duplicate relationships on detection
2. Store similarity score as edge property

**Acceptance Criteria**:
- [x] Duplicate files linked in graph
- [x] Similarity scores stored

---

## Module 5: Search & Discovery

**Owner**: search-api (Go)
**Database**: PostgreSQL + Qdrant + Neo4j
**Priority**: P0 (MVP)

### Feature 5.1: Keyword Search (P0)

#### Sub-feature 5.1.1: Full-Text Search
**Expected Behavior**:
- User enters search query: "machine learning notes"
- System searches file names and extracted text
- Uses PostgreSQL full-text search (GIN index)
- Returns ranked results (relevance score)

**Tasks**:
1. **Task 5.1.1.1**: Create search API service (Go)
   - Initialize Gin web framework
   - Connect to PostgreSQL with `pgx`
2. **Task 5.1.1.2**: Create `POST /api/v1/search` endpoint
   - Input: `{ query: "string", filters: {...} }`
   - Parse query
3. **Task 5.1.1.3**: Implement PostgreSQL full-text search
   - Use `to_tsvector` for indexing
   - Use `ts_rank` for relevance scoring
   - Query: `WHERE to_tsvector('english', file_name || ' ' || extracted_text) @@ to_tsquery('query')`
4. **Task 5.1.1.4**: Apply filters
   - file_type, date_range, source, size, tags

**Acceptance Criteria**:
- [x] Search returns relevant results
- [x] Results ranked by relevance
- [x] Filters work correctly
- [x] Search handles 1M+ files efficiently (<500ms)

### Feature 5.2: Semantic Search (P0)

#### Sub-feature 5.2.1: Vector Similarity Search
**Expected Behavior**:
- User enters natural language query: "documents about climate change"
- System generates embedding for query
- Searches Qdrant for similar vectors
- Returns semantically similar files (even if exact keywords don't match)

**Tasks**:
1. **Task 5.2.1.1**: Embed query text
   - Use same model (sentence-transformers)
   - Generate 384-dim vector
2. **Task 5.2.1.2**: Query Qdrant
   - Use `qdrant_client.search()`
   - Find top 100 nearest neighbors
   - Apply filters (file_type, user_id)
3. **Task 5.2.1.3**: Fetch file metadata from PostgreSQL
   - Bulk fetch by file IDs
   - Enrich results with full file details

**Acceptance Criteria**:
- [x] Semantic search finds relevant files without exact keywords
- [x] Query "climate change" returns files about "global warming"
- [x] Search latency <500ms

### Feature 5.3: Hybrid Search (P0)

#### Sub-feature 5.3.1: Combine Keyword + Semantic Search
**Expected Behavior**:
- Run both keyword and semantic search in parallel
- Merge results using weighted score
- Keyword score: 40%, Semantic score: 60%
- Re-rank combined results

**Tasks**:
1. **Task 5.3.1.1**: Run searches concurrently
   - Use Go goroutines
   - Wait for both to complete
2. **Task 5.3.1.2**: Merge and re-rank
   - Combine scores: `final_score = 0.4 * keyword_score + 0.6 * semantic_score`
   - Deduplicate (same file from both searches)
   - Sort by final score

**Acceptance Criteria**:
- [x] Hybrid search combines both methods
- [x] Results better than either method alone
- [x] No duplicate results

### Feature 5.4: Advanced Filters (P0)

#### Sub-feature 5.4.1: Multiple Filter Types
**Expected Behavior**:
- File type filter: "Show only PDFs"
- Date range filter: "Last 30 days"
- Source filter: "Only Google Drive"
- Size filter: "> 10MB"
- Tag filter: "Tagged as 'important'"
- Category filter: "Documents"

**Tasks**:
1. **Task 5.4.1.1**: Implement filter query builder
   - Build SQL WHERE clauses dynamically
   - Support AND/OR logic
2. **Task 5.4.1.2**: Add Qdrant filter support
   - Use Qdrant's filter syntax
   - Apply metadata filters

**Acceptance Criteria**:
- [x] All filter types work
- [x] Filters combinable with AND logic
- [x] Filters work with both keyword and semantic search

### Feature 5.5: Faceted Search (P1)

#### Sub-feature 5.5.1: Facet Counts
**Expected Behavior**:
- After search, show facet counts:
  - File type: PDF (30), DOCX (15), Image (10)
  - Year: 2024 (40), 2023 (20), 2022 (5)
  - Source: Google Drive (50), Local (15)
- User can click facet to apply filter

**Tasks** (P1):
1. Implement facet counting queries
2. Return facets in search response

**Acceptance Criteria**:
- [x] Facets shown after search
- [x] Facet counts accurate
- [x] Clicking facet applies filter

---

## Module 6: Deduplication

**Owner**: dedup-worker (Python)
**Database Tables**: `kms_duplicates`, Neo4j
**Priority**: P0 (MVP)

### Feature 6.1: Exact Duplicate Detection (P0)

#### Sub-feature 6.1.1: Hash-Based Deduplication
**Expected Behavior**:
- After file indexed, calculate SHA256 hash of content
- Query database for files with same hash
- If match found, create duplicate group
- Insert records into `kms_duplicates` with `detection_method = 'hash'`
- Mark first file as primary, others as duplicates

**Tasks**:
1. **Task 6.1.1.1**: Calculate file hashes
   - During scan, calculate SHA256
   - Store in `kms_files.file_hash`
2. **Task 6.1.1.2**: Implement duplicate detection
   - Query: `SELECT file_id FROM kms_files WHERE file_hash = ? AND user_id = ?`
   - If multiple results, create duplicate group
3. **Task 6.1.1.3**: Create duplicate records
   - Generate `group_id` (UUID)
   - Insert one record per file in group
   - Set `is_primary = TRUE` for oldest file
4. **Task 6.1.1.4**: Create Neo4j relationships
   - `(File)-[:DUPLICATE_OF {method: 'hash', similarity: 1.0}]->(PrimaryFile)`

**Acceptance Criteria**:
- [x] Exact duplicates detected (same content)
- [x] Duplicate groups created
- [x] Primary file auto-selected (oldest)
- [x] Duplicates visible in UI

### Feature 6.2: Semantic Duplicate Detection (P1)

#### Sub-feature 6.2.1: Embedding Similarity Detection
**Expected Behavior**:
- Compare embeddings of all files
- If similarity > 95%, mark as semantic duplicate
- Useful for files with same meaning but different formatting

**Tasks** (P1):
1. **Task 6.2.1.1**: Query Qdrant for similar vectors
   - For each file, search for nearest neighbors
   - Threshold: similarity > 0.95
2. **Task 6.2.1.2**: Create semantic duplicate groups
   - Insert into `kms_duplicates` with `detection_method = 'semantic'`
   - Store `similarity_score`

**Acceptance Criteria**:
- [x] Semantically similar files detected
- [x] Similarity score accurate
- [x] False positives minimized

### Feature 6.3: Version Duplicate Detection (P1)

#### Sub-feature 6.3.1: Filename Pattern Matching
**Expected Behavior**:
- Detect version patterns in filenames:
  - `file_v1.pdf`, `file_v2.pdf`, `file_final.pdf`
  - `document.pdf`, `document (1).pdf`, `document (2).pdf`
- Group as version duplicates
- Suggest keeping latest version

**Tasks** (P1):
1. Implement regex pattern matching
2. Group files by base name
3. Sort by version number or date
4. Suggest latest as primary

**Acceptance Criteria**:
- [x] Version patterns detected
- [x] Latest version suggested
- [x] User can override suggestion

### Feature 6.4: User Duplicate Management (P0)

#### Sub-feature 6.4.1: Review Duplicates UI
**Expected Behavior**:
- User sees list of duplicate groups
- Each group shows:
  - All duplicate files
  - Suggested primary (highlighted)
  - Similarity score
  - File size, location, date
- User can:
  - Mark primary
  - Mark files for deletion
  - Exclude files from group (not duplicate)

**Tasks**:
1. **Task 6.4.1.1**: Create `GET /api/v1/duplicates` endpoint
   - Return duplicate groups
   - Include file details
2. **Task 6.4.1.2**: Create `PATCH /api/v1/duplicates/:group_id` endpoint
   - Update primary selection
   - Mark files for deletion
3. **Task 6.4.1.3**: Build UI component
   - Display duplicate groups
   - Allow user decisions

**Acceptance Criteria**:
- [x] Duplicates listed in UI
- [x] User can mark primary
- [x] User can mark for deletion
- [x] Changes saved to database

---

## Module 7: Junk Detection & Cleanup

**Owner**: junk-detector (Python) + kms-api
**Database Tables**: `kms_files` (is_junk, junk_confidence, junk_reasons)
**Priority**: P0 (MVP)

### Feature 7.1: Rule-Based Junk Detection (P0)

#### Sub-feature 7.1.1: Detect Temporary Files
**Expected Behavior**:
- Files with extensions `.tmp`, `.cache`, `.DS_Store`, `Thumbs.db` marked as junk
- Empty files (0 bytes) marked as junk
- Very small files (<10 bytes) marked as junk

**Tasks**:
1. **Task 7.1.1.1**: Define junk rules
   - Create rule engine with configurable patterns
2. **Task 7.1.1.2**: Apply rules during scan
   - Check each file against rules
   - Set `is_junk = TRUE`, `junk_confidence = 1.0`
   - Set `junk_reasons = ['temporary_file']`

**Acceptance Criteria**:
- [x] Temporary files detected
- [x] Empty files detected
- [x] Junk reasons recorded

#### Sub-feature 7.1.2: Detect Corrupted Files
**Expected Behavior**:
- Try to open/read file
- If fails (corruption), mark as junk

**Tasks**:
1. **Task 7.1.2.1**: Implement file integrity check
   - Try to read file header
   - For images, use PIL
   - For PDFs, use PyPDF2
2. **Task 7.1.2.2**: Mark corrupted files
   - Set `is_junk = TRUE`, `junk_reasons = ['corrupted']`

**Acceptance Criteria**:
- [x] Corrupted files detected
- [x] False positives minimized

### Feature 7.2: ML-Based Junk Detection (P2 - Future)

#### Sub-feature 7.2.1: Train Junk Classifier
**Expected Behavior**:
- Learn from user behavior (files they delete)
- Train classifier to predict junk
- Features: file type, size, age, access frequency, name patterns

**Tasks** (P2):
- Collect training data
- Train scikit-learn or XGBoost model
- Apply model predictions

**Acceptance Criteria**:
- [x] Model accuracy > 90%
- [x] User can approve/reject predictions

### Feature 7.3: Bulk Junk Cleanup (P0)

#### Sub-feature 7.3.1: Review & Delete Junk
**Expected Behavior**:
- User sees list of files marked as junk
- Grouped by junk reason
- Shows total size to be freed
- User can:
  - Approve deletion (bulk or individual)
  - Exclude files (mark not junk)
- Deletion is permanent (no recovery for MVP)

**Tasks**:
1. **Task 7.3.1.1**: Create `GET /api/v1/junk-files` endpoint
   - Return all files where `is_junk = TRUE`
   - Group by `junk_reasons`
   - Calculate total size
2. **Task 7.3.1.2**: Create `POST /api/v1/junk-files/bulk-delete` endpoint
   - Input: `{ file_ids: [...] }`
   - Delete files from source (Google Drive API, local FS)
   - Delete records from `kms_files`
   - Return deletion report
3. **Task 7.3.1.3**: Create `PATCH /api/v1/files/:id/not-junk` endpoint
   - Set `is_junk = FALSE`
   - Clear `junk_reasons`

**Acceptance Criteria**:
- [x] Junk files listed in UI
- [x] Bulk delete works
- [x] Files deleted from source and database
- [x] User can exclude false positives
- [x] Deletion report shows success/failures

---

## Module 8: Transcription Integration

**Owner**: kms-api + voice-app-api
**Database Tables**: `kms_transcription_links`
**Priority**: P0 (MVP)

### Feature 8.1: Audio/Video Transcription (P0)

#### Sub-feature 8.1.1: Auto-Trigger Transcription
**Expected Behavior**:
- When scan discovers audio/video file, check source config
- If `auto_transcribe: true`, trigger transcription
- Call voice-app API: `POST /api/v1/upload`
- Voice-app creates job, transcribes, returns result
- Store transcription text in `kms_files.extracted_text`
- Create link in `kms_transcription_links`

**Tasks**:
1. **Task 8.1.1.1**: Create transcription trigger
   - After file inserted, check if audio/video
   - Check source config for auto_transcribe
   - If enabled, publish to `trans.queue`
2. **Task 8.1.1.2**: Implement transcription worker
   - Consume from `trans.queue`
   - Download file from source
   - Call voice-app API
   - Wait for completion (poll job status)
3. **Task 8.1.1.3**: Store transcription result
   - Update `kms_files.extracted_text`
   - Insert into `kms_transcription_links`
   - Trigger embedding generation

**Acceptance Criteria**:
- [x] Audio files auto-transcribed (if enabled)
- [x] Transcription text stored
- [x] Transcription searchable

#### Sub-feature 8.1.2: Manual Transcription Trigger
**Expected Behavior**:
- User can manually trigger transcription for specific files
- Select provider (Whisper, Groq, Deepgram) and model
- Transcription job tracked in UI

**Tasks**:
1. **Task 8.1.2.1**: Create `POST /api/v1/files/:id/transcribe` endpoint
   - Input: `{ provider: 'whisper', model: 'base', language: 'en' }`
   - Call voice-app API
   - Return job ID
2. **Task 8.1.2.2**: Create `GET /api/v1/files/:id/transcription-status` endpoint
   - Poll voice-app for job status
   - Return progress

**Acceptance Criteria**:
- [x] Manual transcription works
- [x] User can select provider/model
- [x] Progress visible in UI

### Feature 8.2: Translation Integration (P2 - Future)

#### Sub-feature 8.2.1: Translate Transcriptions
**Expected Behavior**:
- After transcription, user can request translation
- Uses voice-app translation API
- Stores translated text

**Tasks** (P2):
- Call voice-app translation endpoint
- Store translated text

**Acceptance Criteria**:
- [x] Translations work
- [x] Multiple languages supported

---

## Module 9: User Interface

**Owner**: web-ui (Next.js)
**Priority**: P0 (MVP)

### Feature 9.1: Authentication UI (P0)

#### Sub-feature 9.1.1: Login/Register Pages
**Expected Behavior**:
- `/login` page with email/password form
- `/register` page with name, email, password
- "Sign in with Google" button
- Redirect to dashboard after login
- JWT token stored in httpOnly cookie

**Tasks**:
1. **Task 9.1.1.1**: Create login page
   - Form with validation (Zod)
   - Call `POST /api/v1/auth/login`
   - Store JWT in cookie
2. **Task 9.1.1.2**: Create register page
   - Form with validation
   - Password strength indicator
   - Call `POST /api/v1/auth/register`
3. **Task 9.1.1.3**: Implement Google OAuth button
   - Redirect to Google consent
   - Handle callback

**Acceptance Criteria**:
- [x] Login page functional
- [x] Registration works
- [x] Google login works
- [x] Redirects to dashboard after auth

### Feature 9.2: Dashboard (P0)

#### Sub-feature 9.2.1: Overview Dashboard
**Expected Behavior**:
- Show stats:
  - Total files indexed
  - Total storage used
  - Recent scans
  - Duplicate count
  - Junk file count
- Quick actions:
  - Connect new source
  - Run scan
  - Search files

**Tasks**:
1. **Task 9.2.1.1**: Create dashboard layout
   - Header with user menu
   - Sidebar navigation
   - Main content area
2. **Task 9.2.1.2**: Fetch dashboard stats
   - Call `GET /api/v1/stats`
   - Display cards with counts
3. **Task 9.2.1.3**: Recent activity feed
   - List recent scans
   - List recent files indexed

**Acceptance Criteria**:
- [x] Dashboard shows stats
- [x] Stats accurate
- [x] UI responsive (mobile-friendly)

### Feature 9.3: Sources Management (P0)

#### Sub-feature 9.3.1: Sources List
**Expected Behavior**:
- List all connected sources
- Show: source name, type, last scan, file count
- Actions: Scan now, Disconnect, Settings

**Tasks**:
1. **Task 9.3.1.1**: Create sources page
   - Fetch `GET /api/v1/sources`
   - Display source cards
2. **Task 9.3.1.2**: Connect source flow
   - "Connect Google Drive" button
   - OAuth flow
   - Redirect back to sources page

**Acceptance Criteria**:
- [x] Sources listed
- [x] Connect Google Drive works
- [x] Scan trigger works

#### Sub-feature 9.3.2: Source Settings
**Expected Behavior**:
- Edit source name
- Configure auto-transcription
- Set scan frequency
- View scan history

**Tasks**:
1. **Task 9.3.2.1**: Create source settings modal
   - Form to edit config
   - Save to `PATCH /api/v1/sources/:id`

**Acceptance Criteria**:
- [x] Settings editable
- [x] Auto-transcription toggle works
- [x] Scan frequency configurable

### Feature 9.4: Search UI (P0)

#### Sub-feature 9.4.1: Search Page
**Expected Behavior**:
- Search bar with auto-suggest
- Filter panel (file type, date, source, tags)
- Search results with file cards
- Pagination
- Search mode toggle (keyword, semantic, hybrid)

**Tasks**:
1. **Task 9.4.1.1**: Create search page
   - Input with debounce
   - Call `POST /api/v1/search`
   - Display results
2. **Task 9.4.1.2**: Implement filters
   - Multi-select filters
   - Apply filters to search
3. **Task 9.4.1.3**: Result cards
   - Show file name, preview, metadata
   - Highlight matching text
   - Actions: View, Download, Delete

**Acceptance Criteria**:
- [x] Search returns results
- [x] Filters work
- [x] Results paginated
- [x] Search latency < 500ms

### Feature 9.5: Duplicates UI (P0)

#### Sub-feature 9.5.1: Duplicates Page
**Expected Behavior**:
- List duplicate groups
- Show all files in group
- Highlight suggested primary
- Actions: Mark primary, Delete duplicates, Exclude

**Tasks**:
1. **Task 9.5.1.1**: Create duplicates page
   - Fetch `GET /api/v1/duplicates`
   - Display groups
2. **Task 9.5.1.2**: Group actions
   - Select primary
   - Bulk delete
   - Exclude files

**Acceptance Criteria**:
- [x] Duplicates displayed
- [x] User can mark primary
- [x] Bulk delete works

### Feature 9.6: Junk Cleanup UI (P0)

#### Sub-feature 9.6.1: Junk Files Page
**Expected Behavior**:
- List junk files grouped by reason
- Show total size to free
- Actions: Bulk delete, Exclude

**Tasks**:
1. **Task 9.6.1.1**: Create junk page
   - Fetch `GET /api/v1/junk-files`
   - Display grouped list
2. **Task 9.6.1.2**: Bulk delete action
   - Select files
   - Call `POST /api/v1/junk-files/bulk-delete`
   - Show confirmation dialog

**Acceptance Criteria**:
- [x] Junk files listed
- [x] Bulk delete works
- [x] Confirmation dialog prevents accidents

### Feature 9.7: File Browser (P1)

#### Sub-feature 9.7.1: Browse Files by Folder
**Expected Behavior**:
- Tree view of folders
- Navigate folder hierarchy
- File list in selected folder

**Tasks** (P1):
1. Create folder tree component
2. Fetch folder contents
3. Navigate on click

**Acceptance Criteria**:
- [x] Folder tree interactive
- [x] Files load on folder select

---

## Cross-Cutting Concerns

### CC1: Error Handling & Logging

**All Services**

**Expected Behavior**:
- Standardized error response format
- Structured logging (JSON format)
- Error codes for all error types
- Logging levels: DEBUG, INFO, WARN, ERROR

**Tasks**:
1. **Task CC1.1**: Define error code schema
   - Format: `{SERVICE}{MODULE}{ERROR_NUMBER}`
   - Example: `KMS1001` = "File not found"
2. **Task CC1.2**: Implement error middleware
   - Catch all exceptions
   - Return standardized response
3. **Task CC1.3**: Set up logging
   - Use Winston (NestJS), structlog (Python), zap (Go)
   - Log to stdout (Docker captures)

**Acceptance Criteria**:
- [x] All errors return consistent format
- [x] Logs structured and searchable
- [x] Error codes documented

### CC2: Performance Monitoring

**All Services**

**Expected Behavior**:
- Track request latency
- Monitor queue depths
- Alert on slow queries (>1s)

**Tasks** (P1):
1. Integrate Prometheus metrics
2. Set up Grafana dashboards
3. Configure alerts

### CC3: Testing

**All Services**

**Expected Behavior**:
- Unit tests for business logic (80% coverage)
- Integration tests for API endpoints
- E2E tests for critical flows

**Tasks**:
1. **Task CC3.1**: Set up testing frameworks
   - Jest (NestJS, Next.js)
   - pytest (Python)
   - testing package (Go)
2. **Task CC3.2**: Write unit tests for services
3. **Task CC3.3**: Write integration tests
4. **Task CC3.4**: Set up CI/CD with test automation

**Acceptance Criteria**:
- [x] 80% code coverage
- [x] All tests pass in CI
- [x] E2E tests cover happy paths

### CC4: Documentation

**All Features**

**Expected Behavior**:
- API documentation (OpenAPI/Swagger)
- User guide
- Developer setup guide
- Architecture diagrams

**Tasks**:
1. **Task CC4.1**: Generate OpenAPI specs
   - Auto-generate from NestJS decorators
   - Host Swagger UI
2. **Task CC4.2**: Write user guide
   - How to connect sources
   - How to search
   - How to manage duplicates
3. **Task CC4.3**: Write developer guide
   - Setup instructions
   - Architecture overview
   - Contribution guidelines

**Acceptance Criteria**:
- [x] API docs auto-generated
- [x] User guide complete
- [x] Developer guide helps new contributors

---

## Priority Matrix

| Priority | Features |
|----------|----------|
| **P0 (MVP)** | M1 (Auth), M2 (Google Drive + Scanning), M3 (PDF/Office Extraction), M4 (Embeddings + Indexing), M5 (Search), M6 (Exact Dedup), M7 (Junk Cleanup), M8 (Transcription), M9 (Web UI) |
| **P1 (Phase 2)** | Local FS scanning, External drive script, Code project detection, Semantic dedup, File browser UI |
| **P2 (Phase 3)** | ML junk detection, OCR, Vision models, Teams/collaboration |
| **P3 (Future)** | Mobile app, Multi-region, Advanced analytics |

---

## Milestone-Based Delivery Plan

### Milestone 1: Foundation (Weeks 1-4)
- ✅ M1: Authentication (email/password + Google OAuth)
- ✅ Database schema created
- ✅ Docker Compose setup (PostgreSQL, RabbitMQ, Qdrant, Neo4j)
- ✅ Basic Web UI (login, dashboard)

### Milestone 2: Google Drive Integration (Weeks 5-8)
- ✅ M2: Google Drive OAuth flow
- ✅ M2: Scan worker (Python)
- ✅ M2: File indexing
- ✅ M9: Sources management UI

### Milestone 3: Content Processing (Weeks 9-12)
- ✅ M3: PDF text extraction
- ✅ M3: Office document extraction
- ✅ M3: Image/video metadata extraction
- ✅ M4: Embedding generation (sentence-transformers)
- ✅ M4: Qdrant integration

### Milestone 4: Search & Discovery (Weeks 13-16)
- ✅ M5: Keyword search (PostgreSQL full-text)
- ✅ M5: Semantic search (Qdrant)
- ✅ M5: Hybrid search
- ✅ M5: Filters
- ✅ M9: Search UI

### Milestone 5: Deduplication & Cleanup (Weeks 17-20)
- ✅ M6: Exact duplicate detection (hash-based)
- ✅ M7: Rule-based junk detection
- ✅ M7: Bulk cleanup
- ✅ M9: Duplicates UI
- ✅ M9: Junk cleanup UI

### Milestone 6: Transcription & Polish (Weeks 21-24)
- ✅ M8: Voice-app integration
- ✅ M8: Auto-transcription
- ✅ M8: Manual transcription
- ✅ Performance optimization
- ✅ Bug fixes and polish
- ✅ **MVP RELEASE**

---

**Document Version**: 1.0
**Last Updated**: 2026-01-07
**Next Review**: After each milestone completion
