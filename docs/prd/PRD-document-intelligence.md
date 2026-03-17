---
title: Document Intelligence — Master PRD
status: Draft
version: 1.0
created: 2026-03-17
milestone: M3/M4/M5 (overlapping)
owner: Product
---

# PRD: Document Intelligence System

## 1. Problem Statement

KMS ingests files from Google Drive and local folders, but today those files are opaque — the system knows a file *exists* (name, size, MIME type, date) but has no understanding of what is *inside* it. Users cannot search for content they only half-remember. They cannot browse their knowledge base intelligently. They cannot tell which documents are authoritative, which are junk, and which are near-duplicates of each other.

The Document Intelligence system transforms KMS from a file *index* into a genuine *knowledge* base by delivering three tightly integrated capabilities:

1. **Ingestion & Processing** — extract structured text and knowledge from every supported file type, chunk it for embedding, and store it in a way that makes it queryable at multiple levels.
2. **Document Discovery** — give users a rich, filterable, browsable view of their knowledge base with intelligent signals (Intelligence Score, junk flags, duplicate badges, quick preview).
3. **Search & Ranking** — three search tiers (keyword → semantic → hybrid) with defined UX flows, result card anatomy, autocomplete, and zero/error states — all the way down to button labels and copy.

Without Document Intelligence, KMS is a glorified file list. With it, KMS becomes the one place users reach for when they need to find *what they know*.

---

## 2. Target Users & Personas

### Persona A — Maya, Individual Knowledge Worker
- Stores 3,000–8,000 files across personal Google Drive (PDFs, notes, DOCX reports, spreadsheets)
- Pain: "I know I wrote about this somewhere — I just can't find it"
- Needs: fast semantic search, at-a-glance file summaries, immediate preview without opening Drive

### Persona B — Rajan, Small Team Lead
- Manages a shared Drive with 15,000+ files across team members
- Pain: "Our Drive is a black hole. We keep writing the same documents"
- Needs: duplicate detection, collection organisation, relevance ranking so top results are actually useful

### Persona C — Dev / Power User (API consumer)
- Builds automations on top of KMS, calls search API programmatically
- Needs: predictable JSON result shapes, machine-readable scores, stable pagination contracts

---

## 3. Goals & Non-Goals

### Goals

| # | Goal | Measure |
|---|------|---------|
| G1 | Any indexed file's text content is searchable | ≥ 95% of supported MIME types extracted successfully |
| G2 | Semantic search finds conceptually related docs even with no keyword match | Recall@10 ≥ 0.80 on held-out test set |
| G3 | Users can discover their most relevant documents without typing a query | Discovery page loads < 1s; Intelligence Score visible on every card |
| G4 | Hybrid search returns a ranked, deduplicated result list in < 800ms p95 | p95 latency < 800ms measured at search-api |
| G5 | Users can preview document content without leaving KMS | Preview panel opens in < 300ms |

### Non-Goals (explicitly out of scope for this PRD)

- Real-time file watching / push-based sync (MVP uses manual scan trigger only)
- Cross-user search or admin "search all users" view
- RAG chat / answer generation (covered in PRD-M10-rag-chat.md)
- Obsidian vault sync (PRD-M12-obsidian.md)
- Saved searches or search alerts (post-MVP)
- Mobile native apps
- Audio/video *transcription* as a search source (M6 scope; this PRD covers metadata-only for media)

---

## 4. User Stories

### Pillar 1 — Ingestion & Processing

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | Upload any file type and have it processed automatically | I don't have to worry about format compatibility |
| US-02 | User | See a real-time processing status for each file | I know when a file is ready to search |
| US-03 | User | Know why a file failed processing | I can take corrective action |
| US-04 | User | Re-trigger processing for a failed file | I don't have to re-upload it |
| US-05 | User | Have ZIP archives unpacked and each contained file indexed | Compressed archives don't hide content |
| US-06 | User | Have Google Docs/Sheets/Slides treated like native documents | Cloud-native files are as searchable as local ones |

**BDD Acceptance Criteria — US-01:**
```
Given a user has connected a Google Drive source
And the source contains a .pdf, .docx, .xlsx, .pptx, .txt, .md, .png, and .mp3 file
When the user triggers a scan
Then each file appears in the files list within 60 seconds of scan completion
And each file shows status "Processing" while the pipeline runs
And each file transitions to "Indexed" on success or "Failed" on error
And at least one chunk is visible in the file preview for text-bearing file types
```

**BDD Acceptance Criteria — US-03:**
```
Given a file has failed processing
When the user views that file's detail panel
Then they see the exact failure reason (e.g. "Encrypted PDF — password required", "File too large (>500 MB)")
And they see a "Retry Processing" button
And clicking "Retry Processing" re-queues the file to the embed queue
```

### Pillar 2 — Document Discovery

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-07 | User | Browse all my indexed documents in a grid or list view | I get a complete picture of my knowledge base |
| US-08 | User | Filter by file type, source, date range, status, and collection | I can narrow to what I care about |
| US-09 | User | Sort by Intelligence Score, date modified, name, or size | I can surface the most valuable files first |
| US-10 | User | See a quick preview of any file without leaving the discovery page | I can confirm relevance at a glance |
| US-11 | User | Identify duplicate files at a glance | I can clean up redundant content |
| US-12 | User | Identify junk files (empty, corrupted, temp) at a glance | I can delete noise quickly |
| US-13 | User | Group related files into named collections | I can organise thematic sets for focused search |

**BDD Acceptance Criteria — US-09:**
```
Given the user is on the Files page
When they click the sort dropdown and select "Intelligence Score — High to Low"
Then the file grid re-renders with the highest-scored files first
And each file card shows the score badge (e.g. "87")
And the sort selection persists for that session
```

**BDD Acceptance Criteria — US-13:**
```
Given the user is on the Files page
When they right-click a file card and select "Add to Collection"
Then a modal appears with a searchable list of existing collections and a "+ New Collection" option
And selecting an existing collection adds the file immediately with a toast "Added to [Collection Name]"
And selecting "+ New Collection" opens a name input, creates the collection, and adds the file
```

### Pillar 3 — Search & Ranking

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-14 | User | Search for files by keyword and get highlighted results in < 200ms | Finding exact terms feels instant |
| US-15 | User | Search by meaning ("quarterly planning notes") and get semantically relevant results | I find documents even when I don't remember exact wording |
| US-16 | User | See a "Top Pick" badge on the most relevant results | I know which result to open first |
| US-17 | User | Filter search results by file type, source, and date | I narrow large result sets without a new query |
| US-18 | User | See autocomplete suggestions as I type | My query is faster to construct |
| US-19 | User | See a helpful zero-results message with suggestions | I'm not left staring at a blank page |
| US-20 | User | Open a file preview directly from a search result card | I confirm relevance without opening a new tab |
| US-21 | Dev | Query the search API and receive a stable, documented JSON response | I can build reliable integrations |

**BDD Acceptance Criteria — US-15:**
```
Given semantic search is enabled (features.semanticSearch.enabled = true)
And the user has indexed a document titled "Q3 Growth Strategy.pdf" containing "expanding into Southeast Asian markets"
When the user searches for "international expansion plans"
Then the Q3 Growth Strategy document appears in the top 5 results
And the result card shows a matching snippet from the document
And the result card shows the Relevance Score bar
```

**BDD Acceptance Criteria — US-16:**
```
Given the user has executed a hybrid search
When results are returned
Then the top 3 results with a normalised RRF score above 0.85 display a gold star badge labelled "Top Pick"
And results ranked 4th and below never display this badge regardless of score
```

---

## 5. Functional Requirements

### 5.1 Ingestion & Processing

| ID | Requirement | Priority | Milestone |
|----|-------------|----------|-----------|
| FR-001 | System detects MIME type for every discovered file using `python-magic` (not filename extension alone) | Must | M3 |
| FR-002 | System validates file against max size limit (configurable, default 500 MB); files over limit are marked `UNSUPPORTED` with reason "File exceeds size limit" | Must | M3 |
| FR-003 | System runs a virus scan stub (placeholder hook; actual AV integration is post-MVP) and logs the result | Could | M3 |
| FR-004 | Extract plain text from TXT, MD, CSV, JSON files using `PlainTextExtractor` | Must | M3 |
| FR-005 | Extract text from PDF files using `pdfminer.six`; preserve page breaks as section delimiters; handle multi-column layouts | Must | M3 |
| FR-006 | Extract text from DOCX/DOC files using `python-docx`; preserve heading hierarchy (H1/H2/H3) as `## ` markdown; preserve table rows as pipe-delimited text | Must | M3 |
| FR-007 | Extract text from XLSX/CSV files using `openpyxl`; convert each sheet to a markdown table; prepend sheet name as heading; generate a statistical summary row (row count, column names, numeric ranges) | Should | M3 |
| FR-008 | Extract text from PPTX files using `python-pptx`; extract slide title + body text + speaker notes per slide; prefix each slide with `--- Slide N ---` | Should | M3 |
| FR-009 | Extract text from HTML files using `BeautifulSoup`; strip navigation/footer/sidebar elements; extract main content area | Should | M3 |
| FR-010 | Extract text from images (PNG, JPG, WEBP, GIF) using `pytesseract` (Tesseract OCR); feature-gated by `features.ocr.enabled` | Could | M4 |
| FR-011 | For ZIP archives: unpack recursively up to 3 levels deep; create a child `KmsFile` record for each contained file; process each child through the full pipeline; mark parent ZIP as `INDEXED` when all children complete | Should | M4 |
| FR-012 | For Google Docs: export via Drive API as PDF then process through `PdfExtractor`; for Google Sheets: export as XLSX; for Google Slides: export as PPTX | Must | M3 |
| FR-013 | For audio/video (MP3, MP4, MOV, WAV, M4A, OGG, WEBM): extract metadata only (filename, duration, codec, size) via `mutagen`; store as structured chunk; mark for transcription queue (voice-app M6) | Should | M3 |
| FR-014 | For unknown/unsupported MIME types: store file metadata only; set `status = UNSUPPORTED`; set `junk_reason = "Unsupported file type"`; do not queue for embedding | Must | M3 |
| FR-015 | Chunk extracted text into segments of 512 tokens with 64-token overlap; snap chunk boundaries to nearest word boundary; discard chunks shorter than 10 characters | Must | M3 |
| FR-016 | Store each chunk in `kms_chunks` with: `file_id`, `user_id`, `chunk_index`, `content`, `token_count`, `checksum_sha256`, `embedding_status = PENDING` | Must | M3 |
| FR-017 | Generate BGE-M3 dense (1024-dim) + sparse vectors for each chunk; upsert to Qdrant `kms_chunks` collection; update `embedding_status = COMPLETED` | Must | M4 |
| FR-018 | On extraction failure: set `kms_files.status = ERROR`; set `kms_files.error_message` to human-readable reason; publish to DLQ; do NOT retry automatically (user must trigger retry) | Must | M3 |
| FR-019 | `POST /api/v1/files/{id}/reindex` — re-queue a file for the full pipeline; only allowed when current `status = ERROR` or `status = INDEXED` | Should | M4 |
| FR-020 | `GET /api/v1/files/{id}/chunks` — return paginated list of chunks for a file (admin/debug use) | Could | M4 |
| FR-021 | Extract named entities and key concepts per chunk (spaCy NER); store in `kms_chunk_entities` table for preview display; feature-gated by `features.ner.enabled` | Could | M5 |
| FR-022 | Build Neo4j graph: nodes for files, chunks, entities; edges for `CONTAINS`, `REFERENCES`, `SIMILAR_TO`; feature-gated by `features.graph.enabled` | Could | M5 |

### 5.2 Document Discovery

| ID | Requirement | Priority | Milestone |
|----|-------------|----------|-----------|
| FR-030 | `GET /api/v1/files` — paginated list of files; default sort: `created_at DESC`; default page size: 20; max page size: 100 | Must | M2 |
| FR-031 | Filter params on `GET /api/v1/files`: `mime_type`, `source_id`, `status`, `collection_id`, `from_date`, `to_date`, `junk_status`, `has_duplicates` | Must | M3 |
| FR-032 | Sort params on `GET /api/v1/files`: `intelligence_score`, `created_at`, `updated_at`, `name`, `size_bytes` — ascending or descending | Should | M3 |
| FR-033 | Intelligence Score computation (see Section 8.3); stored as `kms_files.intelligence_score` REAL; recomputed on file access, on re-index, and via nightly batch | Should | M4 |
| FR-034 | File grid view (default): 4 columns on desktop, 2 on tablet, 1 on mobile; each card shows: file type icon, name (truncated at 60 chars), source badge, Intelligence Score chip, status badge, date modified | Must | M3 |
| FR-035 | File list view: single-row layout per file; same fields as grid plus size; toggled via "Grid / List" toggle button in page header | Should | M3 |
| FR-036 | Quick preview panel: clicking any file card opens a right-side slide-over panel (width: 480px) containing: file name, file type, source, date modified, size, status, Intelligence Score, AI Summary (first 300 chars of extracted text or generated summary if `features.rag.enabled`), key entities list, chunk count, action buttons | Must | M4 |
| FR-037 | Junk badge: files with `junk_status = FLAGGED` display an orange "Junk?" badge on the card; files with `junk_status = CONFIRMED` display a red "Junk" badge | Should | M5 |
| FR-038 | Duplicate badge: files belonging to a `KmsDuplicateGroup` display a yellow "Duplicate" badge; clicking the badge opens the duplicate group detail view | Should | M5 |
| FR-039 | Collections sidebar: left panel lists user's collections; clicking a collection filters the file grid to that collection's files | Should | M4 |
| FR-040 | `POST /api/v1/collections` — create collection (`name`, optional `description`) | Must | M4 |
| FR-041 | `POST /api/v1/collections/{id}/files` — add file(s) to collection | Must | M4 |
| FR-042 | `DELETE /api/v1/collections/{id}/files/{fileId}` — remove file from collection | Must | M4 |
| FR-043 | `DELETE /api/v1/files/{id}` — soft-delete file; marks `deleted_at`; removes chunks from Qdrant; does NOT delete from Google Drive | Must | M3 |
| FR-044 | Bulk selection: checkbox appears on card hover; bulk action bar appears at bottom when ≥ 1 file is selected; bulk actions: "Delete", "Add to Collection", "Mark as Not Junk" | Should | M5 |
| FR-045 | Empty state on Files page (no files indexed): show illustration + text "Your knowledge base is empty. Connect a source and scan your files to get started." + button "Connect a Source" | Must | M2 |
| FR-046 | Empty state when filter returns no results: show text "No files match your filters." + button "Clear Filters" | Must | M3 |

### 5.3 Search & Ranking

| ID | Requirement | Priority | Milestone |
|----|-------------|----------|-----------|
| FR-050 | `GET /api/v1/search?q=&type=keyword` — PostgreSQL FTS on `kms_chunks.search_vector` + `kms_files.name`; ranked by `ts_rank_cd`; user-isolated | Must | M3 |
| FR-051 | `GET /api/v1/search?q=&type=semantic` — embed query via BGE-M3; cosine ANN in Qdrant; user-isolated; feature-gated by `features.semanticSearch.enabled` | Must | M4 |
| FR-052 | `GET /api/v1/search?q=&type=hybrid` — RRF merge of keyword + semantic lists (k=60); deduplicated by file_id; feature-gated by `features.hybridSearch.enabled` | Should | M4 |
| FR-053 | `GET /api/v1/search?q=&type=auto` — auto-select keyword if semantic disabled, hybrid if both enabled | Must | M3 |
| FR-054 | Search filter params: `source_id`, `mime_type`, `collection_id`, `from_date`, `to_date` | Should | M4 |
| FR-055 | Search pagination: `page` (1-based, default 1) + `limit` (default 10, max 50) + `total` count in response | Must | M3 |
| FR-056 | Result response shape: `{ results: SearchResultItem[], total: number, page: number, limit: number, query: string, type: string, cached: boolean, took_ms: number }` | Must | M3 |
| FR-057 | `SearchResultItem` shape: `{ file_id, name, mime_type, source_id, source_name, collection_id?, snippet, score, normalised_score, is_top_pick, date_modified, web_view_link? }` | Must | M3 |
| FR-058 | Snippet generation: keyword search uses `ts_headline(content, query, 'MaxFragments=2, MaxWords=30, MinWords=10')`; semantic search uses first 200 chars of best-matching chunk; matched terms are wrapped in `<mark>` tags | Must | M3 |
| FR-059 | "Top Pick" flag: `is_top_pick = true` for top 3 results where `normalised_score ≥ 0.85`; if fewer than 3 results exceed threshold, only qualifying results get the flag | Must | M4 |
| FR-060 | Autocomplete: `GET /api/v1/search/autocomplete?q=` — returns up to 8 suggestions from: (a) file name prefix matches, (b) frequent queries cache (Redis sorted set); response time < 100ms p95 | Should | M4 |
| FR-061 | Search result cache: `kms:search:{user_id}:{sha256(q+type+filters+page)}` in Redis; TTL 60s; invalidated on file status change for that user | Must | M4 |
| FR-062 | Rate limiting on search: 30 req/min per authenticated user; 429 response with `Retry-After` header | Must | M3 |
| FR-063 | Zero results state: response includes `{ suggestions: string[], did_you_mean?: string }` populated from spell-check on query tokens | Should | M4 |
| FR-064 | Answer card (M5): if query matches a single authoritative chunk with score > 0.95, return `answer_card: { text: string, file_id: string, file_name: string, chunk_index: number }` at top of response | Could | M5 |

---

## 6. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-001 | Keyword search latency | p50 < 80ms; p95 < 200ms; p99 < 400ms — measured at search-api |
| NFR-002 | Semantic search latency | p50 < 300ms; p95 < 500ms — measured at search-api (includes query embedding time) |
| NFR-003 | Hybrid search latency | p50 < 500ms; p95 < 800ms |
| NFR-004 | Autocomplete latency | p95 < 100ms |
| NFR-005 | Discovery page load | First Contentful Paint < 1.5s; Time to Interactive < 3s on 3G |
| NFR-006 | Preview panel open | < 300ms from click to panel visible |
| NFR-007 | Throughput (extraction) | ≥ 20 PDF pages/min per worker; ≥ 100 TXT files/min per worker |
| NFR-008 | Throughput (embedding) | ≥ 100 chunks/min CPU; ≥ 1,000 chunks/min GPU |
| NFR-009 | Scale | System must handle 100,000 chunks per user without degradation |
| NFR-010 | Isolation | Zero cross-user data leakage; all queries filtered by `user_id` at DB and Qdrant layer |
| NFR-011 | Idempotency | Re-processing same file produces identical chunk checksums; `ON CONFLICT DO NOTHING` on chunk insert |
| NFR-012 | Max file size | 500 MB configurable ceiling; files above limit immediately marked `UNSUPPORTED` |
| NFR-013 | Observability | Every pipeline stage emits an OTel span; extraction failure rate exposed as Prometheus counter `kms_extraction_failures_total{mime_type}` |
| NFR-014 | Availability | search-api target 99.5% uptime; graceful degradation: if Qdrant unavailable, fall back to keyword-only search automatically |

---

## 7. UX/UI Specification

### 7.1 Navigation

The main left sidebar contains the following items (in order):

```
[KMS Logo]
─────────────
Dashboard         (icon: grid)
Files             (icon: folder-open)   ← primary discovery surface
Search            (icon: magnifying-glass)
Collections       (icon: stack)
─────────────
Sources           (icon: plug)
Settings          (icon: gear)
─────────────
[User avatar] [Name] [Logout icon]
```

### 7.2 Files Page

**Page Header:**
```
[Page Title: "Files"]   [Sort: Intelligence Score ▼]   [Filter icon]   [Grid icon | List icon]
                                                        [+ New Collection button]
```

**Filter Sidebar (collapsible, 260px):**

Section "File Type":
- All Types (default, shows count of all)
- PDF  (count badge)
- Word Document  (count badge)
- Spreadsheet  (count badge)
- Presentation  (count badge)
- Image  (count badge)
- Audio / Video  (count badge)
- Other  (count badge)

Section "Source":
- (dynamically lists connected sources with count badge)

Section "Status":
- All Statuses (default)
- Indexed
- Processing
- Failed
- Unsupported

Section "Date Modified":
- Any Time (default)
- Today
- Last 7 Days
- Last 30 Days
- Last 90 Days
- Custom Range… (opens date picker)

Section "Intelligence Score":
- Any Score (default)
- 80–100 (High)
- 50–79 (Medium)
- 0–49 (Low)

Section "Flags":
- [ ] Show Junk Only
- [ ] Show Duplicates Only

**[Clear All Filters]** button at bottom of filter panel.

**File Grid Card (default view):**
```
┌────────────────────────────────┐
│ [FILE TYPE ICON — 40×40px]  [☐]│  ← checkbox appears on hover
│                                │
│ Q3 Revenue Report.pdf          │  ← truncated at 60 chars, title case
│                                │
│ [PDF] [Google Drive]           │  ← type badge (red) + source badge (blue)
│                                │
│ Score: [████░░] 74             │  ← score bar + numeric
│                                │
│ Modified: Jan 12, 2026         │
│                                │
│ [Indexed ✓]   [⋮ More]        │  ← status badge + overflow menu
└────────────────────────────────┘
```

Status badge colours:
- "Indexed" — green background, white text
- "Processing" — amber background, white text, animated pulse dot
- "Failed" — red background, white text
- "Unsupported" — grey background, dark text
- "Pending" — light blue background, dark text

File type badge colours:
- PDF — red (#DC2626)
- Word / DOCX — blue (#2563EB)
- Spreadsheet / XLSX / CSV — green (#16A34A)
- Presentation / PPTX — orange (#EA580C)
- Image — purple (#7C3AED)
- Audio / Video — pink (#DB2777)
- Archive / ZIP — yellow (#CA8A04)
- Text / MD — slate (#475569)
- Other — grey (#6B7280)

Overflow menu (⋮):
- Preview
- Open in Drive (only for Google Drive files)
- Add to Collection…
- Reindex (only for Failed files)
- Mark as Not Junk (only for Junk-flagged files)
- Delete…

**Quick Preview Panel (slide-over from right, 480px):**

```
[← Back]                                [✕ Close]
────────────────────────────────────────────────
[LARGE FILE ICON 48×48]  Q3 Revenue Report
                         PDF · Google Drive

Intel. Score  [████████░░] 78
Status        Indexed ✓
Modified      Jan 12, 2026  ·  Size: 2.4 MB
────────────────────────────────────────────────
AI Summary
"This document covers Q3 2025 financial results
for the APAC region, including revenue breakdowns
by product line, headcount analysis..."

Key Entities
[Rajan Kumar] [APAC] [Q3 2025] [Revenue] [+4 more]

Chunks Indexed   47 chunks
────────────────────────────────────────────────
[Open in Drive ↗]  [Add to Collection +]  [Delete 🗑]
```

**Sort Dropdown Options:**
- Intelligence Score — High to Low (default)
- Intelligence Score — Low to High
- Date Modified — Newest First
- Date Modified — Oldest First
- Name — A to Z
- Name — Z to A
- File Size — Largest First
- File Size — Smallest First

**Empty State — No Files Indexed:**
```
[Illustration: folder with magnifying glass]

Your knowledge base is empty.
Connect a source and scan your files to get started.

[Connect a Source →]
```

**Empty State — No Filter Results:**
```
[Illustration: empty search result]

No files match your filters.
Try adjusting or clearing your filters.

[Clear Filters]
```

### 7.3 Search Page

**Search Bar (full-width, top of page):**
```
┌─[🔍]─────────────────────────────────────────[⌘K]─┐
│  Search your knowledge base…                       │
└────────────────────────────────────────────────────┘
```
- Keyboard shortcut `⌘K` / `Ctrl+K` focuses the search bar from anywhere
- Debounce: 300ms after last keystroke before API call
- Autocomplete dropdown appears below bar when ≥ 2 characters typed

**Autocomplete Dropdown:**
```
┌────────────────────────────────────────────────────┐
│ 📄 Q3 Revenue Report.pdf                    file   │
│ 📄 Q3 Planning Document.docx               file   │
│ 🔍 quarterly planning                      recent  │
│ 🔍 Q3 budget                               recent  │
└────────────────────────────────────────────────────┘
```
- Max 8 suggestions
- File name matches are preceded by file type icon
- Recent queries are preceded by 🔍 icon
- Keyboard: ↑ ↓ arrows to navigate, Enter to select, Escape to close
- Click suggestion = executes search immediately

**Search Mode Tabs (below search bar):**
```
[Auto] [Keyword] [Semantic] [Hybrid]
```
- "Auto" is the default; shows which mode is actually active in a subtitle: "Using Hybrid Search"
- "Semantic" and "Hybrid" show a lock icon and tooltip "Requires embedding to be enabled" when `features.semanticSearch.enabled = false`

**Search Results Layout:**
```
[Search bar]                                          [Mode tabs]

──────────────────────────────────────────────────────
 Left sidebar (260px)          Main results area
 ─────────────────             ───────────────────────
 FILTER BY TYPE                Showing 47 results for "Q3 Revenue"
 All (47)                      Sorted by: Relevance ▼     [List ▼]
 PDF (12)
 Word (8)                      [Result card 1 — Top Pick]
 Spreadsheet (6)               [Result card 2 — Top Pick]
 …                             [Result card 3 — Top Pick]
                               [Result card 4]
 FILTER BY SOURCE              [Result card 5]
 Google Drive (35)             …
 Local (12)
                               [← 1 2 3 4 5 →]
 FILTER BY DATE
 Any Time ○
 Today ○
 Last 7 Days ●                 [Right panel: document preview — opens on card click]
 Last 30 Days ○
 …

 [Clear Filters]
──────────────────────────────────────────────────────
```

**Search Result Card:**
```
┌────────────────────────────────────────────────────────────────────┐
│ ⭐ TOP PICK                                                         │  ← gold star + amber label (only top 3)
│                                                                    │
│ [PDF]  Q3 Revenue Report.pdf                  [Google Drive] [APAC]│
│                                                                    │
│ "…regional revenue breakdown shows APAC growth of 34% driven by   │
│  product line expansion in **Q3 2025**. Compared to Q2 the margin…"│  ← snippet; matched terms in bold
│                                                                    │
│ Relevance  [██████████░░░░] 89                                     │  ← visual score bar (0-100)
│                                                                    │
│ Modified: Jan 12, 2026   ·   PDF   ·   2.4 MB                     │
│                                                                    │
│ [Open in Drive ↗]   [Add to Collection +]   [Preview →]           │
└────────────────────────────────────────────────────────────────────┘
```

Result card field definitions:
- **TOP PICK badge**: gold star icon + text "TOP PICK"; amber background; only on cards where `is_top_pick = true`
- **File type badge**: colour-coded (per 7.2 badge colours); short label (PDF, DOCX, XLSX, PPTX, TXT, MD, IMG, AUD, VID, ZIP)
- **File name**: matched query terms displayed in bold; full name (wraps if needed)
- **Source badge**: "Google Drive" with Drive icon, or "Local" with folder icon; slate background
- **Collection badge**: collection name if file belongs to one; indigo background; only shown if `collection_id` present
- **Snippet**: 150–200 chars; matched terms wrapped in `<mark>` tags (renders as yellow highlight); ellipsis at ends
- **Relevance score bar**: horizontal bar, fills to `normalised_score * 100`; colour: green > 75, amber 50-75, red < 50; numeric score shown at right
- **Date modified**: human-readable (e.g. "Jan 12, 2026"); "Today" / "Yesterday" for recent
- **"Open in Drive" button**: only shown for Google Drive files; opens `web_view_link` in new tab
- **"Add to Collection" button**: opens collection picker modal
- **"Preview" button**: opens right-side preview panel with chunk content

**Zero Results State:**
```
[Illustration: magnifying glass with no results]

No results for "internatinoal expansion"

Did you mean: "international expansion"?

Suggestions:
• Try different keywords
• Search for a file type: PDF, DOCX, Spreadsheet
• Browse your files without a query → [Browse Files]
```

**Search Error State (Qdrant unreachable / 503):**
```
[Icon: warning triangle]

Search is temporarily unavailable.
We're falling back to keyword search while the issue resolves.

[Try Again]
```

**Search Loading State:**
- Search bar shows animated spinner icon on right side
- Results area shows 5 skeleton cards (grey shimmer blocks)
- Skeleton appears after 150ms (prevents flash on fast queries)

### 7.4 Collections Page

**Header:** "Collections" + "+ New Collection" button (top right)

**Collection card:**
```
┌────────────────────────┐
│ 📁 APAC Strategy       │
│ 12 files               │
│ Updated: Jan 10, 2026  │
│ [Open] [⋮]             │
└────────────────────────┘
```

Collection card overflow menu (⋮):
- Rename Collection…
- Delete Collection… (confirmation: "Delete 'APAC Strategy'? The files will not be deleted, only removed from this collection.")

**Empty State — No Collections:**
```
[Illustration: empty folder]

You haven't created any collections yet.
Group related files for focused search and RAG chat.

[+ New Collection]
```

---

## 8. Data Model Impact

### 8.1 New Columns on `kms_files`

```sql
ALTER TABLE kms_files ADD COLUMN intelligence_score REAL DEFAULT NULL;
ALTER TABLE kms_files ADD COLUMN intelligence_score_computed_at TIMESTAMPTZ;
ALTER TABLE kms_files ADD COLUMN ai_summary TEXT;          -- first 300 chars of content or LLM summary
ALTER TABLE kms_files ADD COLUMN error_message TEXT;       -- human-readable failure reason
ALTER TABLE kms_files ADD COLUMN page_count INT;           -- for PDFs and PPTX
ALTER TABLE kms_files ADD COLUMN language VARCHAR(10);     -- ISO 639-1 detected language code
ALTER TABLE kms_files ADD COLUMN extraction_method VARCHAR(50); -- "pdfminer" | "python-docx" | "tesseract" | etc.
```

### 8.2 New Columns on `kms_chunks`

```sql
ALTER TABLE kms_chunks ADD COLUMN checksum_sha256 CHAR(64);
ALTER TABLE kms_chunks ADD COLUMN source_id UUID;          -- denormalised for query performance
ALTER TABLE kms_chunks ADD COLUMN embedding_status VARCHAR(20) DEFAULT 'pending'; -- pending | completed | failed
ALTER TABLE kms_chunks ADD COLUMN search_vector tsvector   -- GIN-indexed for FTS
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
ALTER TABLE kms_chunks ADD COLUMN heading_context TEXT;    -- nearest H1/H2 above this chunk (for PDF/DOCX)
ALTER TABLE kms_chunks ADD COLUMN page_number INT;         -- for PDFs
```

### 8.3 Intelligence Score Formula

The `intelligence_score` (0–100) is a weighted composite:

```
score = (
    (content_richness_score * 0.40) +
    (recency_score          * 0.25) +
    (access_frequency_score * 0.20) +
    (link_density_score     * 0.15)   -- M5: defaults to 0 until graph is built
) * 100

content_richness_score = min(chunk_count / 50, 1.0)
    -- normalised: a file with 50+ chunks scores 1.0 on richness

recency_score = exp(-days_since_modified / 90)
    -- exponential decay: modified today = 1.0; 90 days ago ≈ 0.37

access_frequency_score = min(access_count / 20, 1.0)
    -- normalised: accessed 20+ times = 1.0

link_density_score = min(inbound_link_count / 10, 1.0)
    -- M5 only; 0 until Neo4j graph is built
```

### 8.4 New Table: `kms_file_access_log`

```sql
CREATE TABLE kms_file_access_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id     UUID NOT NULL REFERENCES kms_files(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL,
    accessed_at TIMESTAMPTZ DEFAULT NOW(),
    access_type VARCHAR(20) NOT NULL -- 'preview' | 'search_result' | 'direct'
);

CREATE INDEX idx_file_access_file_id ON kms_file_access_log (file_id, accessed_at DESC);
```

### 8.5 New Table: `kms_chunk_entities` (M5)

```sql
CREATE TABLE kms_chunk_entities (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id    UUID NOT NULL REFERENCES kms_chunks(id) ON DELETE CASCADE,
    file_id     UUID NOT NULL,
    user_id     UUID NOT NULL,
    entity_text VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,  -- PERSON | ORG | GPE | DATE | PRODUCT | …
    confidence  REAL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chunk_entities_file_id ON kms_chunk_entities (file_id);
CREATE INDEX idx_chunk_entities_entity_text ON kms_chunk_entities (user_id, entity_text);
```

---

## 9. API Contracts

### 9.1 File Discovery

```
GET /api/v1/files
  Query params:
    page          int       default 1
    limit         int       default 20, max 100
    sort          string    default "intelligence_score_desc"
                            values: intelligence_score_asc | intelligence_score_desc |
                                    created_at_asc | created_at_desc |
                                    name_asc | name_desc |
                                    size_bytes_asc | size_bytes_desc
    status        string    PENDING | PROCESSING | INDEXED | ERROR | UNSUPPORTED
    mime_type     string    e.g. "application/pdf"
    source_id     UUID
    collection_id UUID
    from_date     ISO 8601  filter by externalModifiedAt or createdAt
    to_date       ISO 8601
    junk_status   string    FLAGGED | CONFIRMED | DISMISSED
    has_duplicates boolean

Response 200:
{
  "data": [
    {
      "id": "uuid",
      "name": "Q3 Revenue Report.pdf",
      "mime_type": "application/pdf",
      "size_bytes": 2516582,
      "status": "INDEXED",
      "junk_status": null,
      "has_duplicates": false,
      "intelligence_score": 74,
      "chunk_count": 47,
      "ai_summary": "This document covers Q3 2025 financial results…",
      "source_id": "uuid",
      "source_name": "My Google Drive",
      "collection_id": null,
      "web_view_link": "https://drive.google.com/file/d/...",
      "date_modified": "2026-01-12T10:30:00Z",
      "created_at": "2026-01-12T10:30:00Z"
    }
  ],
  "meta": {
    "total": 342,
    "page": 1,
    "limit": 20,
    "total_pages": 18
  }
}
```

### 9.2 Search

```
GET /api/v1/search
  Query params:
    q             string    required; min 2 chars; max 500 chars
    type          string    auto | keyword | semantic | hybrid  (default: auto)
    source_id     UUID      optional filter
    mime_type     string    optional filter
    collection_id UUID      optional filter
    from_date     ISO 8601  optional filter
    to_date       ISO 8601  optional filter
    page          int       default 1
    limit         int       default 10, max 50

Response 200:
{
  "data": {
    "results": [
      {
        "file_id": "uuid",
        "name": "Q3 Revenue Report.pdf",
        "mime_type": "application/pdf",
        "source_id": "uuid",
        "source_name": "My Google Drive",
        "collection_id": null,
        "snippet": "…regional revenue breakdown shows APAC growth of 34%…",
        "score": 0.892,
        "normalised_score": 89,
        "is_top_pick": true,
        "date_modified": "2026-01-12T10:30:00Z",
        "web_view_link": "https://drive.google.com/file/d/...",
        "chunk_index": 3
      }
    ],
    "answer_card": null,
    "suggestions": [],
    "did_you_mean": null,
    "total": 47,
    "page": 1,
    "limit": 10,
    "query": "Q3 Revenue",
    "type": "hybrid",
    "active_type": "hybrid",
    "cached": false,
    "took_ms": 312
  }
}
```

### 9.3 Search Autocomplete

```
GET /api/v1/search/autocomplete
  Query params:
    q   string   required; min 2 chars

Response 200:
{
  "data": {
    "suggestions": [
      { "text": "Q3 Revenue Report.pdf",   "type": "file",   "file_id": "uuid" },
      { "text": "Q3 Planning Document",    "type": "file",   "file_id": "uuid" },
      { "text": "quarterly planning",      "type": "recent", "file_id": null   }
    ]
  }
}
```

### 9.4 File Reindex

```
POST /api/v1/files/{id}/reindex
  No request body

Response 202:
{
  "data": {
    "file_id": "uuid",
    "status": "PROCESSING",
    "message": "File queued for reprocessing."
  }
}

Error 409 (file not in ERROR or INDEXED status):
{
  "error": {
    "code": "KBFIL0010",
    "message": "File is already being processed."
  }
}
```

### 9.5 Collections

```
POST /api/v1/collections
  Body: { "name": "APAC Strategy", "description": "Optional" }
Response 201: { "data": { "id": "uuid", "name": "APAC Strategy", … } }

GET /api/v1/collections
Response 200: { "data": [{ "id", "name", "description", "file_count", "created_at" }] }

POST /api/v1/collections/{id}/files
  Body: { "file_ids": ["uuid", "uuid"] }
Response 200: { "data": { "added": 2, "already_present": 0 } }

DELETE /api/v1/collections/{id}/files/{fileId}
Response 204: (no body)

DELETE /api/v1/collections/{id}
Response 204: (no body)
```

---

## 10. File Type Support Matrix

| MIME Type | Extension | Extractor | Chunking Strategy | Embedding | Milestone |
|-----------|-----------|-----------|-------------------|-----------|-----------|
| text/plain | .txt | PlainTextExtractor | 512-token, 64 overlap | Yes | M3 |
| text/markdown | .md | PlainTextExtractor | 512-token, 64 overlap | Yes | M3 |
| text/csv | .csv | PlainTextExtractor (→ markdown table) | per-table-row | Yes | M3 |
| application/json | .json | PlainTextExtractor (pretty-printed) | 512-token | Yes | M3 |
| application/pdf | .pdf | PdfExtractor (pdfminer.six) | per-page → 512-token | Yes | M3 |
| application/vnd.openxmlformats-officedocument.wordprocessingml.document | .docx | DocxExtractor (python-docx) | per-heading-section → 512-token | Yes | M3 |
| application/msword | .doc | DocxExtractor (via libreoffice convert) | same as DOCX | Yes | M4 |
| application/vnd.openxmlformats-officedocument.spreadsheetml.sheet | .xlsx | XlsxExtractor (openpyxl) | per-sheet | Yes | M3 |
| application/vnd.ms-excel | .xls | XlsxExtractor (via openpyxl compat) | per-sheet | Yes | M4 |
| application/vnd.openxmlformats-officedocument.presentationml.presentation | .pptx | PptxExtractor (python-pptx) | per-slide | Yes | M3 |
| text/html | .html | HtmlExtractor (BeautifulSoup) | 512-token | Yes | M4 |
| application/zip | .zip | ZipExtractor (recursive) | child files processed individually | Yes | M4 |
| image/png | .png | ImageExtractor (pytesseract) | full OCR text → 512-token | Yes | M4 (feature-gated) |
| image/jpeg | .jpg .jpeg | ImageExtractor (pytesseract) | full OCR text → 512-token | Yes | M4 (feature-gated) |
| image/webp | .webp | ImageExtractor (pytesseract) | full OCR text → 512-token | Yes | M4 (feature-gated) |
| audio/mpeg audio/wav video/mp4 video/quicktime | .mp3 .wav .mp4 .mov | MetadataOnlyExtractor + transcription queue | metadata chunk + transcript chunks (M6) | Metadata only (M3); Full (M6) | M3 (metadata) / M6 (transcript) |
| application/vnd.google-apps.document | (Google Doc) | Drive API export → PDF | same as PDF | Yes | M3 |
| application/vnd.google-apps.spreadsheet | (Google Sheet) | Drive API export → XLSX | same as XLSX | Yes | M3 |
| application/vnd.google-apps.presentation | (Google Slides) | Drive API export → PPTX | same as PPTX | Yes | M3 |
| * (unknown) | any | MetadataOnlyExtractor | no content chunks | No | M3 |

---

## 11. Out of Scope

- RAG / LLM-based answer generation (PRD-M10-rag-chat.md)
- Knowledge graph entity extraction at full scale (PRD-M09-knowledge-graph.md)
- Real-time file push sync or webhooks from Google Drive
- Cross-user or admin search views
- Obsidian plugin integration (PRD-M12-obsidian.md)
- Saved searches or search alert notifications
- Mobile native apps (web-only for MVP)
- Password-protected or DRM-encrypted PDF extraction

---

## 12. Dependencies

| Dependency | Type | Required By | Notes |
|------------|------|-------------|-------|
| M01 — Authentication | Internal | All endpoints | JWT user_id required for all operations |
| M02 — Source Integration | Internal | Pillar 1 | Files must be discovered before processing |
| M03 — Content Extraction PRD | Internal | FR-004 to FR-016 | See PRD-content-processing-pipeline.md |
| M04 — Embedding Pipeline | Internal | FR-017, FR-051, FR-052 | Semantic/hybrid search requires vectors |
| BGE-M3 model | External | embed-worker | `BAAI/bge-m3` on Hugging Face |
| Qdrant | External | FR-017, FR-051 | Vector DB for ANN search |
| PostgreSQL GIN index | Internal | FR-050 | Must be created before FTS queries |
| Redis | Internal | FR-061 | Search result caching |
| python-magic | Python dep | FR-001 | MIME type detection |
| pdfminer.six | Python dep | FR-005 | PDF extraction |
| python-docx | Python dep | FR-006 | DOCX extraction |
| openpyxl | Python dep | FR-007 | XLSX extraction |
| python-pptx | Python dep | FR-008 | PPTX extraction |
| BeautifulSoup4 | Python dep | FR-009 | HTML extraction |
| pytesseract + Tesseract | Python dep | FR-010 | OCR (feature-gated) |
| mutagen | Python dep | FR-013 | Audio/video metadata |
| spaCy | Python dep | FR-021 | NER (M5, feature-gated) |

---

## 13. Success Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Extraction success rate | ≥ 95% of supported MIME types | `kms_extraction_failures_total` Prometheus counter |
| Search latency p95 (keyword) | < 200ms | Grafana Tempo / p95 histogram |
| Search latency p95 (hybrid) | < 800ms | Grafana Tempo / p95 histogram |
| Search relevance (Recall@10) | ≥ 0.80 | Monthly offline evaluation on labelled test set |
| Intelligence Score coverage | 100% of INDEXED files have a score | DB query: `COUNT(*) WHERE status=INDEXED AND intelligence_score IS NULL = 0` |
| Files page TTI | < 3s on simulated 3G | Lighthouse CI in PR pipeline |
| Autocomplete p95 | < 100ms | search-api metrics |
| Zero results rate | < 15% of queries | `kms_search_zero_results_total` / `kms_search_total` |

---

## 14. Open Questions

| # | Question | Owner | Due |
|---|----------|-------|-----|
| OQ-1 | Should Intelligence Score be user-visible as a raw number or as a qualitative label ("High / Medium / Low")? | Product + Design | M3 kickoff |
| OQ-2 | OCR via Tesseract (open-source, slower) vs Google Vision API (paid, faster, more accurate) — which for MVP? | Engineering | Before M4 sprint 1 |
| OQ-3 | For ZIP archives: should we impose a max unpacked size limit (e.g. 2GB total) or per-file limit only? | Engineering | Before M4 sprint 1 |
| OQ-4 | Answer card threshold: 0.95 RRF score is very high — should this be configurable per deployment? | Product | M5 kickoff |
| OQ-5 | How should we handle Google Workspace files when Drive API rate limits are hit mid-export? | Engineering | M3 sprint planning |
| OQ-6 | Should the Intelligence Score link density component (graph) be excluded from the UI until M5 ships? | Product | M3 kickoff |
| OQ-7 | Autocomplete: should we index query history per-user in Redis or in Postgres? Privacy implications? | Engineering + Legal | M4 sprint 1 |

---

## 15. Revision History

| Version | Date | Author | Summary |
|---------|------|--------|---------|
| 1.0 | 2026-03-17 | Product | Initial draft — all three pillars |
