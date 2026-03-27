---
id: gap-analysis-2026-03-18
created_at: 2026-03-18T00:00:00Z
content_type: index
status: current
generator_model: claude-sonnet-4-6
---

# KMS Gap Analysis & Feature Matrix — 2026-03-18

## Legend
- ✅ Implemented & committed
- 🔨 In progress / partially implemented
- ❌ Not started
- ⚠️ Implemented but has known gap

## 1. Module Implementation Matrix

| Module | Feature | Backend Status | Frontend Status | Test Coverage | Notes |
|--------|---------|----------------|-----------------|---------------|-------|
| M00 | NestJS app bootstrap | ✅ | ✅ | ✅ | |
| M00 | Python worker bootstrap | ✅ | N/A | ✅ | |
| M00 | Docker Compose stack | ✅ | N/A | N/A | |
| M00 | OpenTelemetry wiring | ✅ | ❌ | ❌ | Frontend OTel not added |
| M01 | JWT auth (login/register) | ✅ | 🔨 | 🔨 | Login page exists, no registration flow |
| M01 | Google OAuth | ✅ | 🔨 | ❌ | Backend strategy exists, no callback page |
| M01 | API keys | ✅ | ❌ | ❌ | Backend complete, no UI |
| M01 | JWT refresh | ✅ | ❌ | ❌ | Backend complete, no silent refresh in frontend |
| M02 | POST /sources/local | ✅ | ✅ | ❌ | ConnectLocalFolderButton exists |
| M02 | POST /sources/obsidian | ✅ | ✅ | ❌ | ConnectObsidianButton exists |
| M02 | Google Drive OAuth + source | ✅ | 🔨 | ❌ | Backend complete, no Drive connect button/flow |
| M02 | Scan job trigger | ✅ | ✅ | ❌ | SourceCard "Scan Now" button |
| M02 | Scan progress polling | ✅ | ❌ | ❌ | useSourcesStatus hook not built |
| M03 | Plain text extraction | ✅ | N/A | ❌ | |
| M03 | PDF extraction | ✅ | N/A | ❌ | |
| M03 | DOCX extraction | ✅ | N/A | ❌ | |
| M03 | XLSX extraction | ✅ | N/A | ❌ | |
| M03 | HTML extraction | ✅ | N/A | ❌ | |
| M03 | Image OCR | ❌ | N/A | ❌ | Needs Tesseract |
| M03 | Audio transcription (embed) | ❌ | N/A | ❌ | |
| M03 | Text chunking (512/64 overlap) | ✅ | N/A | ❌ | |
| M04 | BGE-M3 embedding (mock) | ✅ | N/A | ✅ | SHA-256 seeded mock |
| M04 | BGE-M3 embedding (real) | 🔨 | N/A | ❌ | MOCK_EMBEDDING=true by default |
| M04 | Qdrant upsert (mock) | ✅ | N/A | ✅ | |
| M04 | Qdrant upsert (real) | 🔨 | N/A | ❌ | MOCK_QDRANT=true by default |
| M05 | BM25 keyword search (mock) | ✅ | N/A | ✅ | 5 seed docs |
| M05 | BM25 keyword search (real) | 🔨 | N/A | ❌ | MOCK_BM25=true by default |
| M05 | Semantic ANN search (mock) | ✅ | N/A | ✅ | |
| M05 | Semantic ANN search (real) | 🔨 | N/A | ❌ | |
| M05 | RRF hybrid fusion | ✅ | N/A | ✅ | k=60, 33 tests |
| M05 | Query Classifier | ✅ | N/A | ✅ | 24 tests, ~5ms |
| M05 | Tier Router | ✅ | N/A | ❌ | |
| M05 | LLM Guard | ✅ | N/A | ❌ | |
| M06 | SHA-256 dedup | ✅ | N/A | ❌ | |
| M06 | Semantic dedup | ❌ | N/A | ❌ | |
| M06 | Version grouping | ❌ | N/A | ❌ | |
| M07 | Junk detection | ❌ | N/A | ❌ | |
| M08 | Voice transcription (Whisper) | 🔨 | ❌ | ❌ | voice-app service exists, not integrated |
| M09 | Neo4j entity extraction | 🔨 | N/A | ❌ | graph-worker exists, Neo4j not wired |
| M09 | Knowledge graph queries | ❌ | ❌ | ❌ | |
| M10 | RAG chat (LangGraph) | 🔨 | ✅ | ❌ | ACP gateway + frontend chat exist |
| M10 | Tiered retrieval | ✅ | ❌ | ❌ | Backend complete, frontend RAG not using it yet |
| M10 | SSE streaming | ⚠️ | ⚠️ | ❌ | Race condition + CORS fix pending (feat/sse-gaps-fix) |
| M11 | Sources page | ✅ | ✅ | ❌ | |
| M11 | Drive file browser | ❌ | ❌ | ❌ | In progress (feat/drive-frontend) |
| M11 | File multi-select + bulk ops | ❌ | ❌ | ❌ | In progress |
| M11 | Tag system UI | ❌ | ❌ | ❌ | In progress |
| M11 | Chat page | ✅ | ✅ | ❌ | |
| M11 | Search page | ❌ | ❌ | ❌ | |
| M11 | Collections UI | ❌ | ❌ | ❌ | |
| M12 | Obsidian plugin | ❌ | ❌ | ❌ | Not started |
| M13 | ACP gateway | ✅ | ✅ | ✅ | |
| M13 | kms_search tool | ✅ | N/A | ❌ | |
| M13 | ACP session store (Redis) | ✅ | N/A | ❌ | |
| M14 | WorkflowEngine (BullMQ) | ✅ | N/A | ❌ | |
| M14 | url-agent (YouTube) | ✅ | N/A | ✅ | 19 tests, mock-first |
| M14 | url-agent (web) | ✅ | N/A | ✅ | |
| M14 | Blog post generation workflow | ❌ | ❌ | ❌ | |
| M15 | LLM factory (Anthropic) | ✅ | N/A | ❌ | |
| M15 | LLM factory (Ollama fallback) | ✅ | N/A | ❌ | |
| M15 | MCP server | ❌ | N/A | ❌ | Not started |
| M15 | Codex adapter | ❌ | N/A | ❌ | |
| M15 | Gemini adapter | ❌ | N/A | ❌ | |
| TAG | Tag system (kms_tags DB) | ❌ | ❌ | ❌ | In progress (feat/drive-backend) |
| TAG | CRUD /tags endpoints | ❌ | ❌ | ❌ | In progress |
| TAG | AI auto-tagging | ❌ | N/A | ❌ | |

## 2. API Endpoint Matrix

### kms-api (port 8000, global prefix /api/v1)

| Method | Path | Auth | Status | Notes |
|--------|------|------|--------|-------|
| POST | /auth/login | public | ✅ | |
| POST | /auth/register | public | ✅ | |
| POST | /auth/refresh | JWT | ✅ | |
| GET | /auth/google | public | ✅ | |
| GET | /auth/google/callback | public | ✅ | |
| POST | /acp/v1/initialize | public | ✅ | |
| POST | /acp/v1/sessions | JWT | ✅ | |
| POST | /acp/v1/sessions/:id/prompt | JWT | ⚠️ | SSE gap fix in progress |
| DELETE | /acp/v1/sessions/:id | JWT | ✅ | |
| GET | /files | JWT | 🔨 | tags/search params not passed |
| DELETE | /files/:id | JWT | ⚠️ | not wired (fix in progress) |
| POST | /files/bulk-delete | JWT | ⚠️ | not wired (fix in progress) |
| POST | /files/bulk-move | JWT | ❌ | in progress |
| POST | /files/bulk-tag | JWT | ❌ | in progress |
| GET | /sources | JWT | ✅ | |
| POST | /sources/local | JWT | ✅ | |
| POST | /sources/obsidian | JWT | ✅ | |
| POST | /sources/:id/scan | JWT | ✅ | |
| GET | /collections | JWT | ✅ | |
| POST | /collections | JWT | ✅ | |
| DELETE | /collections/:id | JWT | ✅ | |
| POST | /collections/:id/files | JWT | ✅ | |
| GET | /tags | JWT | ❌ | in progress |
| POST | /tags | JWT | ❌ | in progress |
| DELETE | /tags/:id | JWT | ❌ | in progress |
| POST | /workflow/urls/ingest | JWT | ✅ | |
| GET | /workflow/jobs/:id | JWT | ✅ | |

### search-api (port 8001)

| Method | Path | Auth | Status | Notes |
|--------|------|------|--------|-------|
| POST | /search | x-user-id | ✅ | BM25+semantic+RRF, mock-first |
| POST | /search/seed | none | ✅ | dev only, 403 in prod |
| GET | /health | none | ✅ | |

### rag-service (port 8002)

| Method | Path | Auth | Status | Notes |
|--------|------|------|--------|-------|
| POST | /api/v1/chat | JWT | 🔨 | LangGraph pipeline |
| GET | /api/v1/runs/:id | JWT | 🔨 | |
| GET | /health | none | ✅ | |

### url-agent (port 8004)

| Method | Path | Auth | Status | Notes |
|--------|------|------|--------|-------|
| POST | /api/v1/urls/ingest | none | ✅ | mock-first, 19 tests |
| GET | /health | none | ✅ | |

## 3. Frontend Page Matrix

| Route | Page | Status | Notes |
|-------|------|--------|-------|
| / | Landing | ✅ | |
| /login | Login | ✅ | |
| /dashboard | Dashboard | ✅ | |
| /drive | Sources + Files | 🔨 | Sources tab done; Files tab in progress |
| /drive/files | File browser | ❌ | in progress |
| /chat | Chat (ACP) | ✅ | SSE gap fix pending |
| /search | Search | ❌ | not started |
| /tags | Tag management | ❌ | in progress |
| /collections | Collections | ❌ | not started |
| /settings | Settings | 🔨 | |

## 4. Known Gaps — Priority Order

### P0 (blocks end-to-end testing)
1. **SSE URL prefix**: Frontend sends to `/acp/v1/...` but backend serves at `/api/v1/acp/v1/...` — **fix in feat/sse-gaps-fix**
2. **CORS**: Missing Accept, Cache-Control in allowedHeaders — **fix in feat/sse-gaps-fix**
3. **ReplaySubject race**: Events lost before SSE subscriber attaches — **fix in feat/sse-gaps-fix**
4. **JWT silent refresh**: Frontend never refreshes tokens — sessions expire silently

### P1 (important UX)
5. **File browser**: Drive page has no file listing — **feat/drive-frontend in progress**
6. **DELETE /files/:id**: Repository method exists, controller not wired — **feat/drive-backend in progress**
7. **Tag system**: Zero infrastructure — **feat/drive-backend + feat/drive-frontend in progress**
8. **Mock flags**: MOCK_EMBEDDING=true, MOCK_BM25=true, MOCK_QDRANT=true — not useful without real services but need a dev toggle

### P2 (completeness)
9. **Collections UI**: Backend complete, no frontend page
10. **Search page**: search-api exists, no frontend page
11. **Google Drive OAuth callback page**: Backend complete, no frontend
12. **Scan progress polling**: SourceCard shows status but no real-time progress bar

## 5. SSE Streaming Architecture (Corrected)

### Why fetch not EventSource
Browser's native EventSource API only supports GET requests. ACP prompt requires a POST
body (the question text). Therefore we use `fetch()` with `Accept: text/event-stream` and
read `response.body` as a ReadableStream.

### Full data flow (step-by-step)

```
1. Frontend                         2. kms-api (NestJS/Fastify)
   fetch(POST /api/v1/acp/v1/...   →  @Sse handler runs synchronously:
   Accept: text/event-stream)           AcpEventEmitter = new ReplaySubject(100)
                                        executePromptPipeline() fires async
                                        returns Observable immediately
                                    ↓
                                    NestJS SSE adapter subscribes to Observable
                                    Sets: Content-Type: text/event-stream
                                          Cache-Control: no-cache
                                          Connection: keep-alive
                                          X-Accel-Buffering: no

3. Async pipeline runs:             4. For each Subject.next():
   sessionStore.get(id)                Server writes:
   → kmsSearch(question)               "data: {"type":"agent_message_chunk","data":{"text":"Hi"}}\n\n"
   → emitToolCallStart                 to the HTTP response body
   → emitToolCallResult             ↓
   → anthropicAdapter.stream...    5. Browser ReadableStream yields chunks
   → emitChunk(text) per token         decode UTF-8
   → emitDone()                        split on \n
                                       find "data:" lines
                                       JSON.parse each
                                       yield AcpEvent
                                    ↓
                                   6. useChat hook
                                       appends text to assistantMessage
                                       re-renders ChatMessage component
```

### Why ReplaySubject(100) is critical
The async pipeline starts BEFORE NestJS's SSE adapter subscribes to the Observable.
With plain Subject (hot), the first events (tool_call_start, tool_call_result) are
emitted and lost. ReplaySubject(100) buffers them — the subscriber receives all
buffered events immediately on subscription.
