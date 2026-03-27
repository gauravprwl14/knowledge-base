# PRD: M12 — Obsidian Plugin Integration

## Status

`IMPLEMENTED`

**Created**: 2026-03-19
**Implemented**: 2026-03-19
**Depends on**: M01 (JWT auth), M10 (ACP gateway, SSE streaming), M03/M04 (inline_content embed path)

---

## Business Context

Knowledge workers who use Obsidian as their primary note-taking environment must currently leave Obsidian to index notes into the KMS or to query the knowledge base. This context switch breaks flow, reduces adoption, and means notes written in Obsidian are often never indexed. The plugin eliminates both friction points: a single command sends the active note to the KMS pipeline, and a second command lets the user ask the knowledge base a question and receive a streamed answer — all without leaving Obsidian.

---

## Problem Statement

Users want to:
1. Send Obsidian notes to KMS for indexing without leaving their vault.
2. Query the KMS knowledge base from within Obsidian and receive a streamed, cited response that is also saved as a new note.

There was no native integration between Obsidian and KMS, forcing manual API calls or copy-paste workflows.

---

## Goals

- Provide two Obsidian command-palette commands: **Send current note to KMS** and **Ask KMS**.
- Zero-configuration defaults: plugin works out of the box once API URL and JWT token are set.
- Streamed responses — the user sees the answer appear word-by-word inside the modal.
- Responses are persisted as vault notes for future reference.
- No new backend services required — the plugin uses existing KMS API endpoints.

## Non-Goals

- Bidirectional sync (KMS → Obsidian) — not in scope for M12.
- Batch ingest of multiple notes in a single operation.
- Conflict resolution for notes that have changed since last ingest.
- Obsidian Mobile support (desktop plugin only in this iteration).
- OAuth / token refresh — users manage JWT tokens manually.

---

## User Stories

| As a... | I want to... | So that... |
|---------|-------------|-----------|
| Obsidian user | Send my current note to KMS with one command | My notes are indexed and searchable without leaving Obsidian |
| Obsidian user | Be notified when a note has been queued for indexing | I know the operation succeeded |
| Obsidian user | Ask a natural-language question to KMS from Obsidian | I get AI-synthesised answers grounded in my knowledge base |
| Obsidian user | See the answer stream in live, word by word | I don't wait for the full response before reading |
| Obsidian user | Have the response auto-saved as a note in my vault | I can reference the answer later without re-querying |
| Obsidian user | Configure the API URL, token, and response folder in plugin settings | I can point the plugin at any KMS deployment |

---

## Scope

**In scope:**

- Obsidian community plugin (`plugins/obsidian-kms/`)
- Two command-palette commands: `send-to-kms` and `ask-kms`
- Settings tab: API URL, JWT token, response folder
- `POST /files/ingest` integration (note title + content + path)
- ACP session lifecycle: create → prompt (SSE) → delete
- SSE chunk streaming rendered live in the `AskKmsModal`
- Response saved as a markdown note (`KMS - {query} - {timestamp}.md`)
- Newly created response note opened automatically in the active workspace leaf
- Input validation: settings check before any network call; empty-query guard

**Out of scope:**

- Tag / collection assignment during ingest
- Vault-wide batch indexing
- Authentication flow inside the plugin (token must be obtained externally)
- Offline / cache mode

---

## Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | Plugin registers two commands in the Obsidian command palette | Must | Done |
| FR-02 | `send-to-kms` command is only active when a Markdown view is open | Must | Done |
| FR-03 | `send-to-kms` POSTs `{ title, content, path }` to `POST /files/ingest` | Must | Done |
| FR-04 | Success notice shows first 8 chars of returned `fileId` | Must | Done |
| FR-05 | `ask-kms` opens a modal with a text input and streaming result panel | Must | Done |
| FR-06 | Modal submits on Enter key or click of the Ask button | Must | Done |
| FR-07 | Response streams live via SSE (`agent_message_chunk` events) | Must | Done |
| FR-08 | Result panel auto-scrolls to the latest chunk | Should | Done |
| FR-09 | ACP session is always deleted in the `finally` block (even on error) | Must | Done |
| FR-10 | Full response is saved as a note in the configured response folder | Must | Done |
| FR-11 | Response folder is created automatically if it does not exist | Must | Done |
| FR-12 | Filename format: `KMS - {first 40 chars of query} - {YYYY-MM DD-HH-MM}.md` | Must | Done |
| FR-13 | Response note is opened in the active workspace leaf after save | Should | Done |
| FR-14 | Settings tab exposes API URL, JWT token (password field), and response folder | Must | Done |
| FR-15 | Both commands validate settings before making any network call | Must | Done |

---

## Technical Approach

### Plugin Architecture

The plugin is a standard Obsidian community plugin written in TypeScript and bundled with esbuild. It has three files:

- `main.ts` — plugin entry point, command registration, `sendNoteToKms()`, `queryKms()`, `saveResponseAsNote()`, and `AskKmsModal` class.
- `settings.ts` — `KmsSettings` interface, `DEFAULT_SETTINGS`, and `KmsSettingTab`.
- `manifest.json` — Obsidian plugin metadata.

### Send Note Flow

```
User: Cmd+P → "Send current note to KMS"
  │
  ├─ validateSettings() — abort with Notice if apiUrl or jwtToken is empty
  ├─ vault.read(file) — read raw markdown content
  └─ POST {apiUrl}/files/ingest
       Body: { title: file.basename, content, path: file.path }
       Auth: Bearer {jwtToken}
       Response: { fileId, sourceId }
  └─ Notice: "Note queued for indexing (file ID: {first 8 chars}...)"
```

### Ask KMS Flow

```
User: Cmd+P → "Ask KMS" → AskKmsModal opens
  │
  ├─ User types query + presses Enter / clicks Ask
  ├─ validateSettings()
  │
  ├─ POST {apiUrl}/acp/v1/sessions   { agent: "claude-api" }
  │    Response: { sessionId }
  │
  ├─ POST {apiUrl}/acp/v1/sessions/{sessionId}/prompt
  │    Body: { message: query, tools: ["kms_search"] }
  │    Response: SSE stream
  │    Events:
  │      data: { type: "agent_message_chunk", data: { text } }  → append to resultEl
  │      data: { type: "done" }                                  → stream complete
  │      data: { type: "error", data: { message } }             → throw
  │
  ├─ saveResponseAsNote(query, fullText) → creates note in responseFolder
  ├─ workspace.openLinkText(noteFile.path) → opens new note
  └─ DELETE {apiUrl}/acp/v1/sessions/{sessionId}   (always, in finally)
```

---

## API Contracts Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/files/ingest` | Ingest note inline — bypasses scan-worker, publishes directly to `kms.embed` |
| `POST` | `/acp/v1/sessions` | Create a new ACP agent session |
| `POST` | `/acp/v1/sessions/:id/prompt` | Submit a prompt and receive SSE-streamed response |
| `DELETE` | `/acp/v1/sessions/:id` | Terminate the ACP session |

### POST /files/ingest — Request Body

```json
{
  "title": "My Note Title",
  "content": "Full markdown content of the note...",
  "path": "folder/My Note Title.md"
}
```

### POST /files/ingest — Response

```json
{
  "fileId": "550e8400-e29b-41d4-a716-446655440000",
  "sourceId": "7a1f3e9c-12ab-4cde-8901-234567890abc"
}
```

### SSE Event Shapes

```
data: {"type":"agent_message_chunk","data":{"text":"Hello "}}
data: {"type":"agent_message_chunk","data":{"text":"world."}}
data: {"type":"done","data":{}}
data: [DONE]
```

---

## Configuration

| Setting | Key | Default | Description |
|---------|-----|---------|-------------|
| KMS API URL | `apiUrl` | `http://localhost:3000` | Base URL of the KMS API — no trailing slash |
| JWT Token | `jwtToken` | _(empty)_ | Access token; rendered as a password field; stored in Obsidian's local plugin data |
| Response folder | `responseFolder` | `KMS Responses` | Vault-relative folder path where Ask KMS responses are saved as notes |

Both `apiUrl` and `jwtToken` must be non-empty before either command will execute.

---

## Acceptance Criteria

All criteria are met — the plugin is fully implemented.

| Criterion | Result |
|-----------|--------|
| "Send current note to KMS" command appears in the Obsidian command palette | Pass |
| Command is disabled (checkCallback returns false) when no Markdown view is open | Pass |
| POSTs `{ title, content, path }` with `Authorization: Bearer {token}` header | Pass |
| Success notice shows `file ID: {first 8 chars}...` | Pass |
| Notice shown and no network call made when apiUrl or jwtToken is empty | Pass |
| "Ask KMS" opens a modal with a query input | Pass |
| Enter key and Ask button both trigger submission | Pass |
| Response streams live chunk by chunk inside the modal | Pass |
| Modal result panel auto-scrolls on each chunk | Pass |
| ACP session DELETE is called even when the prompt request fails | Pass |
| Response saved as `KMS - {query slice} - {timestamp}.md` in configured folder | Pass |
| Response folder created automatically when missing | Pass |
| Response note opened in active workspace leaf after save | Pass |
| Settings tab renders three fields with correct defaults | Pass |

---

## Non-Functional Requirements

| Concern | Requirement |
|---------|-------------|
| Security | JWT token stored in Obsidian's local plugin data file (`data.json`); never logged or displayed in plaintext after initial entry |
| Resilience | Session cleanup (DELETE) is always attempted regardless of prompt errors |
| UX | Streaming starts within 200ms of the prompt response arriving |
| Build | esbuild bundles to a single `main.js`; no runtime node_modules required |
| Compatibility | Obsidian 1.4+ (Electron Chromium — uses native `fetch` + `ReadableStream`) |

---

## Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| `kms-api` — ACP gateway module | Plugin → API | `POST /acp/v1/sessions`, `POST /acp/v1/sessions/:id/prompt`, `DELETE /acp/v1/sessions/:id` |
| `kms-api` — files module | Plugin → API | `POST /files/ingest` with `inline_content` embed path |
| `embed-worker` — inline_content support | API → Worker | Embed job must carry note content inline so no disk read is needed |
| M01 JWT auth | Plugin → API | Every request carries `Authorization: Bearer {token}` |
| M10 ACP / SSE streaming | Plugin → API | SSE event types `agent_message_chunk`, `done`, `error` |

---

## Files

| File | Purpose |
|------|---------|
| `plugins/obsidian-kms/main.ts` | Plugin entry point, both commands, `AskKmsModal`, streaming logic |
| `plugins/obsidian-kms/settings.ts` | `KmsSettings` type, `DEFAULT_SETTINGS`, `KmsSettingTab` |
| `plugins/obsidian-kms/manifest.json` | Obsidian plugin metadata |
| `plugins/obsidian-kms/package.json` | Build dependencies (esbuild, TypeScript, Obsidian types) |
| `plugins/obsidian-kms/tsconfig.json` | TypeScript config for the plugin |
| `plugins/obsidian-kms/README.md` | Installation, configuration, and usage guide |
