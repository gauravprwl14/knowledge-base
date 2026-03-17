# Sprint 5 Board — Content Extraction Pipeline
**Milestone**: M3 — Content Processing
**Sprint Goal**: Any file from Google Drive is extracted, chunked, and stored as searchable text
**Dates**: Weeks 9–10

---

## TODO

### Python embed-worker — Extractors
- [ ] [L] Base extractor interface + dispatcher (routes file by MIME type)
- [ ] [M] PDFExtractor — pdfminer.six, page-by-page, preserve structure
- [ ] [M] DocxExtractor — python-docx, headings/tables/paragraphs
- [ ] [M] XlsxExtractor — openpyxl, row iteration, schema inference
- [ ] [M] CsvExtractor — csv stdlib, detect encoding, statistical summary
- [ ] [M] PptxExtractor — python-pptx, slide text + speaker notes
- [ ] [S] TxtMdExtractor — direct passthrough + markdown stripping
- [ ] [S] ZipExtractor — recursive decompress, dispatch each inner file
- [ ] [S] ImageExtractor — Tesseract OCR via pytesseract
- [ ] [S] HtmlExtractor — BeautifulSoup, strip tags, extract main content
- [ ] [S] UnsupportedHandler — store metadata only, set status=UNSUPPORTED

### Python embed-worker — Chunking
- [ ] [M] TextChunker — 512 token chunks, 64 token overlap, sentence-boundary aware
- [ ] [S] StructuredChunker — for tables/spreadsheets: chunk by row groups

### Python embed-worker — File Status
- [ ] [M] Update kms_files.status via asyncpg: PENDING→PROCESSING→INDEXED|FAILED|UNSUPPORTED
- [ ] [S] Error logging with chunk-level granularity

### Backend — kms-api
- [ ] [S] GET /files/:id/chunks — list chunks for a file (for preview)
- [ ] [S] File status filter in GET /files endpoint

### Frontend
- [ ] [M] Files list page (/[locale]/files) — grid/list toggle, file type icons
- [ ] [S] Filter sidebar: type, source, status, date range
- [ ] [S] Sort: date modified, name, intelligence score
- [ ] [S] File card: type icon, name, size, status badge, source badge
- [ ] [S] Empty state: "No files yet. Connect Google Drive and run a scan."
- [ ] [S] Processing state: file card shows spinner + "Processing..."
- [ ] [S] Document preview side panel: summary placeholder + metadata

---

## IN PROGRESS

(empty — sprint not started)

---

## DONE

(empty — sprint not started)

---

## Blocked / Risks
| Risk | Impact | Mitigation |
|------|--------|-----------|
| Corrupted/password-protected PDFs | Medium | Catch extraction errors, set status=FAILED, log reason |
| Tesseract accuracy on low-res images | Medium | Log confidence score; flag for manual review if < 60% |
| Large XLSX files (100k+ rows) | Medium | Stream rows, chunk by row group, enforce memory cap |
| ZIP bombs / deeply nested archives | High | Limit recursion depth to 3; cap total uncompressed size |

---

## Definition of Done
- [ ] PDF/DOCX/XLSX/CSV/PPTX files extracted into kms_chunks
- [ ] File status updates visible in UI (PROCESSING → INDEXED)
- [ ] Files list page shows all indexed documents with correct type icons
- [ ] Filter by file type returns correct results
- [ ] Intelligence Score stub (just recency score for now, full score in M4)
