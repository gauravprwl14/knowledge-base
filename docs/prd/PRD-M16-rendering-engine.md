# PRD: M16 — File Rendering Engine & Design System

## Status

`Draft`

**Created**: 2026-03-27
**Depends on**: M11 (Web UI shell), M08 (Transcription), M05 (Search), M10 (RAG Chat / ACP)
**Blocks**: Chat Artifact Panel (M10 enhancement), Search result rich previews (M05 enhancement)

---

## Business Context

Users currently cannot preview any file inline — images show as icons, videos have no player, PDFs require navigating to Google Drive, and code files are unreadable. This forces users to leave the application to view their own knowledge, breaking the core value proposition of the KMS as a unified knowledge workspace.

The Rendering Engine closes this gap by providing inline, in-app rendering for every major file type, paired with a `@kb/ui` design system package that ensures every surface (file browser, chat, search results, mobile) shares the same rendering primitives. The AI-native Artifact Panel brings the chat interface to parity with tools like Claude Code, where file context is visually anchored to the conversation rather than buried in links.

This is not a cosmetic improvement — it is the primary UX unlock that makes KMS feel like a product rather than a prototype.

---

## Business Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-01 | Users must be able to preview files without leaving KMS | P0 |
| BR-02 | The rendering system must be reusable across file browser, chat, and search | P0 |
| BR-03 | All file type renderers must be incrementally deliverable (no big-bang release) | P0 |
| BR-04 | Real-time processing status (embedding, transcription) must be visible in the viewer | P1 |
| BR-05 | The design system must enforce visual consistency across all surfaces | P1 |
| BR-06 | The artifact panel must bring chat to AI-native standard (anchored file context) | P1 |
| BR-07 | The component library must be shareable with future apps (mobile, admin) | P2 |

---

## User Stories

| As a... | I want to... | So that... |
|---------|-------------|-----------|
| User | Click a file card and see an inline preview | I don't have to leave KMS to view my files |
| User | Watch a video or play audio directly in the drawer | I can review media without external players |
| User | Read a PDF page by page inline | I can read documents without Google Drive |
| User | See syntax-highlighted code with copy button | I can read and share code snippets immediately |
| User | View a rendered markdown file | I see formatted content, not raw markup |
| User | See a file the AI referenced pinned in the chat panel | I understand what the AI is talking about |
| User | See real-time embedding progress on a processing file | I know when a file will be ready to search |
| Developer | Add a new file type renderer in one place | I don't hunt for conditionals across 10 components |
| Developer | Import a component from `@kb/ui` | I have one authoritative source for UI primitives |

---

## Scope

### In Scope — Sprint 1 (Foundation)

- `packages/ui` monorepo package scaffold with TypeScript, Tailwind preset, barrel export
- Design token system (CSS custom properties): colors, spacing, typography, radius, motion, z-index, shadows
- Core primitives: `Button`, `Badge`, `Icon`, `Text`, `Stack`, `Skeleton`, `Spinner`, `ProgressBar`, `Tooltip`
- `FileViewerShell` composite with MIME-type registry
- `ImageViewer` composite (JPG, PNG, WebP, GIF, SVG) — first viewer
- `FilesDrawer` feature component wired to `FileViewerShell`
- File card click → drawer open wiring in `FilesBrowserPage` and `drive/FilesBrowser`

### In Scope — Sprint 2 (Media + Detail Page)

- `VideoPlayer` composite (MP4, WebM, MOV) — HTML5 native with timeline scrubbing
- `AudioPlayer` composite (MP3, WAV, M4A, OGG) — minimal waveform or progress bar player
- `PDFViewer` composite (PDF) — react-pdf, page navigation, lazy-loaded
- `ProcessingStatus` composite — WebSocket-driven real-time embedding/transcription progress
- `FileDetailPage` at `/files/:id` — full-screen layout wrapping `FileViewerShell` + metadata panel
- WebSocket connection for file processing status events

### In Scope — Sprint 3 (Chat Artifact Panel)

- `ArtifactPanel` composite — side panel shell with header, content area, action bar
- `ChatArtifactPanel` feature component — subscribes to SSE stream, mounts `FileViewerShell` (mode="artifact") when `file_reference` events arrive
- `CodeViewer` composite — syntax highlighting via highlight.js or shiki, line numbers, copy
- `MarkdownRenderer` composite — react-markdown with GFM support, code block highlighting
- Chat page layout update: two-column split (conversation + artifact panel)
- SSE protocol extension: `file_reference` event type in `use-chat.ts`

### In Scope — Sprint 4 (Remaining Types + Polish)

- `DataTableViewer` composite — CSV/TSV rendered as paginated, sortable table
- `DocumentRenderer` composite — DOCX/XLSX/PPTX via Google Docs Viewer embed or mammoth.js
- `ObsidianRenderer` composite — MD with `[[wikilink]]` resolution and backlinks panel
- `SearchResultViewer` feature component — search result chunks with `FileViewerShell` context
- Mobile responsive pass across all composites
- Storybook setup for `packages/ui`

### Out of Scope

- Native mobile app (design system is mobile-ready, native app is separate project)
- PDF editing or annotation
- Video transcoding or format conversion
- Real-time collaborative annotation on files
- File editing of any kind (read-only viewer only)
- 3D / CAD file viewing (GLB, OBJ, STL)

---

## Functional Requirements

### Design System

| ID | Requirement | Priority |
|----|-------------|----------|
| DS-01 | All color, spacing, radius, motion values must be CSS custom properties in `@kb/ui/tokens` | P0 |
| DS-02 | No hex color or raw pixel value may be hardcoded in any component | P0 |
| DS-03 | All primitive components must accept a `className` prop for escape-hatch overrides | P0 |
| DS-04 | All primitive variants must be typed with `cva()` — no inline ternaries for variants | P0 |
| DS-05 | `packages/ui/src/index.ts` must be the sole export point — no deep imports | P0 |
| DS-06 | Every new component must be added to the barrel immediately upon creation | P0 |

### FileViewerShell

| ID | Requirement | Priority |
|----|-------------|----------|
| FV-01 | `FileViewerShell` must accept `mode: 'drawer' \| 'page' \| 'artifact' \| 'inline'` | P0 |
| FV-02 | MIME-type registry must live in `viewers/registry.ts` — no MIME conditionals elsewhere | P0 |
| FV-03 | All viewers must handle 4 states: Loading, Error, Empty, Rendered | P0 |
| FV-04 | Every viewer that loads a third-party library must be dynamically imported with `next/dynamic` | P0 |
| FV-05 | All viewers must provide a download fallback in the Error and Empty states | P1 |
| FV-06 | Unsupported MIME types must render a `UnsupportedFileViewer` with download link | P0 |

### Hybrid Viewer UX

| ID | Requirement | Priority |
|----|-------------|----------|
| HV-01 | Clicking a file card opens `FilesDrawer` from the right without navigating away | P0 |
| HV-02 | Drawer must support close on Esc key, backdrop click, and explicit close button | P0 |
| HV-03 | Drawer must show file metadata panel (name, size, type, status, tags) above the viewer | P1 |
| HV-04 | "Open full view" button in drawer navigates to `/files/:id` | P0 |
| HV-05 | `/files/:id` full-screen layout shows `FileViewerShell` + rich metadata + related chunks | P1 |
| HV-06 | Keyboard navigation: arrow keys cycle through files in the drawer without closing | P2 |

### Chat Artifact Panel

| ID | Requirement | Priority |
|----|-------------|----------|
| AP-01 | Chat page splits into two columns when an artifact is active (≥ 768px viewport) | P0 |
| AP-02 | SSE stream must emit `file_reference` events with a `fileId` payload | P0 |
| AP-03 | `ChatArtifactPanel` must fetch the file by `fileId` and mount `FileViewerShell` (mode="artifact") | P0 |
| AP-04 | Panel persists across messages until the session resets or user dismisses it | P1 |
| AP-05 | Multiple file references in one session must be accessible via a tab or history list in the panel | P2 |
| AP-06 | On viewports < 768px, artifact renders as an expandable inline card in the message bubble | P1 |

### Real-Time Processing Status

| ID | Requirement | Priority |
|----|-------------|----------|
| RT-01 | A WebSocket connection must be established when `FilesDrawer` opens a processing file | P1 |
| RT-02 | `ProcessingStatus` composite must display embedding progress (0–100%) and transcription status | P1 |
| RT-03 | On completion, `ProcessingStatus` must auto-refresh the viewer without page reload | P1 |
| RT-04 | WebSocket must gracefully degrade to polling (10s interval) if connection cannot be established | P1 |

---

## Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NF-01 | Drawer open animation | ≤ 200ms (CSS transition) |
| NF-02 | Image viewer initial render | ≤ 300ms for images ≤ 2MB |
| NF-03 | PDF first page render | ≤ 1.5s |
| NF-04 | `packages/ui` bundle size (primitives only) | ≤ 30KB gzipped |
| NF-05 | All viewers tree-shakeable — unused viewers add zero bytes to consumer bundle | Required |
| NF-06 | All interactive elements WCAG 2.1 AA keyboard accessible | Required |
| NF-07 | No viewer library loaded until its MIME type is encountered (lazy-load) | Required |

---

## Architecture Links

| Artifact | Location |
|----------|----------|
| ADR-0030 `@kb/ui` as standalone package | `docs/architecture/decisions/0030-kb-ui-standalone-package.md` |
| ADR-0031 Registry-driven MIME renderer | `docs/architecture/decisions/0031-mime-registry-renderer.md` |
| ADR-0032 Hybrid drawer + detail page UX | `docs/architecture/decisions/0032-hybrid-viewer-ux.md` |
| ADR-0033 WebSocket for file processing status | `docs/architecture/decisions/0033-websocket-file-status.md` |
| Sequence: File Viewer (drawer flow) | `docs/architecture/sequence-diagrams/rendering-file-viewer-drawer.md` |
| Sequence: Chat Artifact Panel | `docs/architecture/sequence-diagrams/rendering-chat-artifact-panel.md` |
| Feature Guide | `docs/development/FOR-rendering-engine.md` |
| Design spec | `docs/superpowers/specs/2026-03-27-rendering-engine-design.md` |

---

## Task Breakdown

### Sprint 1 — Foundation (packages/ui + Image Viewer + FilesDrawer)

| Layer | Task | Estimate |
|-------|------|----------|
| Infra | Scaffold `packages/ui` with TypeScript, Tailwind preset, barrel export | S |
| Infra | Configure monorepo workspace: root `package.json` + `tsconfig.json` path aliases | S |
| DS | Design token CSS variables (colors, spacing, radius, motion, z-index, shadows) | M |
| DS | Export Tailwind preset from `packages/ui/src/tokens/tailwind-preset.ts` | S |
| UI | Primitives: `Button`, `Badge`, `Icon`, `Text`, `Stack` | M |
| UI | Primitives: `Skeleton`, `Spinner`, `ProgressBar`, `Tooltip`, `Divider` | M |
| UI | `FileViewerShell` composite + MIME registry + `UnsupportedFileViewer` | M |
| UI | `ImageViewer` composite (zoom, pan, download, all 4 states) | M |
| Feature | `FilesDrawer` feature component — fetches file, mounts `FileViewerShell` | M |
| Feature | Wire file card click → drawer in `FilesBrowserPage` and `drive/FilesBrowser` | S |
| Test | Unit tests: all primitives (variants, states) — 80% coverage | M |
| Test | Unit tests: `FileViewerShell` registry dispatch, `ImageViewer` all 4 states | M |

### Sprint 2 — Media + Detail Page

| Layer | Task | Estimate |
|-------|------|----------|
| UI | `VideoPlayer` composite (HTML5, timeline scrub, quality badge) | M |
| UI | `AudioPlayer` composite (progress bar, time display, playback controls) | M |
| UI | `PDFViewer` composite (react-pdf, page nav, lazy load) | L |
| UI | `ProcessingStatus` composite (progress bar, status badge, auto-refresh) | M |
| Feature | `FileDetailPage` at `/files/:id` — full layout with metadata panel | M |
| Feature | WebSocket hook `useFileStatus(fileId)` — connects, parses events, returns state | M |
| Backend | WebSocket gateway in `kms-api` for file processing status events | M |
| Test | Integration tests: `FilesDrawer` open/close, keyboard dismiss | S |
| Test | Unit tests: `VideoPlayer`, `AudioPlayer`, `PDFViewer` — all 4 states | M |

### Sprint 3 — Chat Artifact Panel

| Layer | Task | Estimate |
|-------|------|----------|
| UI | `ArtifactPanel` composite — shell with header, content area, dismiss | M |
| UI | `CodeViewer` composite (shiki syntax highlight, line numbers, copy) | M |
| UI | `MarkdownRenderer` composite (react-markdown, GFM, code highlighting) | S |
| Feature | `ChatArtifactPanel` feature component — SSE `file_reference` handler | M |
| Feature | Chat page layout update: two-column with `ChatArtifactPanel` | S |
| Protocol | Extend `use-chat.ts` SSE handler with `file_reference` event type | S |
| Backend | Emit `file_reference` SSE event from RAG service when file cited | M |
| Test | Integration tests: chat artifact panel mounts on `file_reference` event | M |

### Sprint 4 — Remaining Types + Polish

| Layer | Task | Estimate |
|-------|------|----------|
| UI | `DataTableViewer` composite (CSV/TSV, pagination, column sort) | M |
| UI | `DocumentRenderer` composite (Google Docs Viewer embed, mammoth.js DOCX fallback) | L |
| UI | `ObsidianRenderer` composite (MD + wikilink resolution + backlinks) | L |
| Feature | `SearchResultViewer` — search chunk with `FileViewerShell` context | M |
| Polish | Mobile responsive pass — all composites ≤ 640px | M |
| Infra | Storybook setup for `packages/ui` | M |
| Test | E2E: Playwright — open drawer, view image, navigate to detail page | M |
| Docs | Update `CONTEXT.md` files, sync all feature guides | S |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| File types with inline preview | 9 types by Sprint 4 completion |
| Components in `@kb/ui` | ≥ 25 (primitives + composites) |
| Coverage on `packages/ui` | ≥ 80% |
| Drawer open latency (p95) | ≤ 300ms |
| User exits KMS to view a file | 0 for supported types |
