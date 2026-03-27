# Design Spec: File Rendering Engine & @kb/ui Design System

**Date**: 2026-03-27
**Status**: Approved
**Author**: Brainstorming session — Gaurav (Ved) + Claude

---

## Decisions Made

| Question | Decision | Rationale |
|----------|----------|-----------|
| Primary surface | File section + Design System in parallel | Design system must exist before viewers; file browser is highest-value surface |
| Viewer UX pattern | Hybrid: Drawer (quick) + `/files/:id` full page (deep work) | Single component covers both casual and power user workflows |
| File types | All 9 types, delivered incrementally over 4 sprints | Design for all, ship iteratively |
| Chat artifacts | Artifact side panel — two-column layout, Claude Code style | `FileViewerShell` reused in chat at zero extra cost |
| Design system home | `packages/ui` — `@kb/ui` monorepo package | Shareable to future apps; consistent with project scale |
| Real-time strategy | SSE for chat (existing), WebSocket for file processing status | SSE is proven for AI streaming; WS fits bidirectional file status |
| Architectural approach | Approach 1: Layered design system + MIME registry-driven renderer | Only approach consistent with `frontend/CLAUDE.md` layer rules |

---

## Architecture

### Package Structure

```
packages/ui/
├── src/
│   ├── tokens/
│   │   ├── colors.css          # --color-surface-*, --color-text-*, --color-accent-*, --color-status-*
│   │   ├── spacing.css         # --space-1 through --space-16 (4px base)
│   │   ├── typography.css      # --font-size-*, --font-weight-*, --line-height-*
│   │   ├── radius.css          # --radius-sm/md/lg/full
│   │   ├── motion.css          # --duration-fast/base/slow, --ease-*
│   │   ├── elevation.css       # --shadow-sm/md/glow, --z-drawer/modal/tooltip/overlay
│   │   └── tailwind-preset.ts  # Exports Tailwind config preset consuming the above tokens
│   │
│   ├── primitives/
│   │   ├── Button/             # cva variants: solid, ghost, outline; sizes: sm, md, lg
│   │   ├── Badge/              # variants: status, tag, count
│   │   ├── Icon/               # Wraps lucide-react, size + color tokens
│   │   ├── Text/               # Polymorphic (as prop), variant: heading/body/caption/label
│   │   ├── Stack/              # Flex/Grid layout primitive with gap token
│   │   ├── Skeleton/           # Loading placeholder, shimmer animation
│   │   ├── Spinner/            # Circular progress, size variants
│   │   ├── ProgressBar/        # Horizontal progress, color by status
│   │   ├── Tooltip/            # Radix Tooltip wrapper
│   │   ├── Avatar/             # Initials or image, size variants
│   │   └── Divider/            # Horizontal/vertical separator
│   │
│   ├── composites/
│   │   ├── viewers/
│   │   │   ├── registry.ts         # MIME type → viewer component map (single source of truth)
│   │   │   ├── ImageViewer.tsx     # Sprint 1
│   │   │   ├── VideoPlayer.tsx     # Sprint 2
│   │   │   ├── AudioPlayer.tsx     # Sprint 2
│   │   │   ├── PDFViewer.tsx       # Sprint 2 (react-pdf, lazy)
│   │   │   ├── CodeViewer.tsx      # Sprint 3 (shiki, lazy)
│   │   │   ├── MarkdownRenderer.tsx # Sprint 3 (react-markdown)
│   │   │   ├── DataTableViewer.tsx  # Sprint 4
│   │   │   ├── DocumentRenderer.tsx # Sprint 4 (Google Docs Viewer + mammoth.js)
│   │   │   ├── ObsidianRenderer.tsx # Sprint 4
│   │   │   └── UnsupportedFileViewer.tsx  # Fallback with download link
│   │   │
│   │   ├── FileViewerShell.tsx     # Dispatcher: reads mimeType → registry → mounts viewer
│   │   ├── ArtifactPanel.tsx       # Chat side panel shell (Sprint 3)
│   │   ├── MediaPlayer.tsx         # Shared base for Video + Audio
│   │   └── ProcessingStatus.tsx    # WebSocket-driven progress (Sprint 2)
│   │
│   └── index.ts                    # Barrel — every export lives here
│
├── package.json                    # name: "@kb/ui", sideEffects: ["*.css"]
└── tsconfig.json
```

### MIME Registry Pattern

```ts
// packages/ui/src/composites/viewers/registry.ts

import { lazy } from 'react'
import type { ComponentType } from 'react'
import type { ViewerProps } from './types'

// Lazy-load every viewer — zero cost unless the type is encountered
const ImageViewer    = lazy(() => import('./ImageViewer'))
const VideoPlayer    = lazy(() => import('./VideoPlayer'))
const AudioPlayer    = lazy(() => import('./AudioPlayer'))
const PDFViewer      = lazy(() => import('./PDFViewer'))
const CodeViewer     = lazy(() => import('./CodeViewer'))
const MarkdownRenderer = lazy(() => import('./MarkdownRenderer'))
const DataTableViewer  = lazy(() => import('./DataTableViewer'))
const DocumentRenderer = lazy(() => import('./DocumentRenderer'))
const UnsupportedFileViewer = lazy(() => import('./UnsupportedFileViewer'))

// Adding a new type = one line in this map, nothing else
export const MIME_REGISTRY: Record<string, ComponentType<ViewerProps>> = {
  'image/jpeg':      ImageViewer,
  'image/png':       ImageViewer,
  'image/gif':       ImageViewer,
  'image/webp':      ImageViewer,
  'image/svg+xml':   ImageViewer,
  'video/mp4':       VideoPlayer,
  'video/webm':      VideoPlayer,
  'video/quicktime': VideoPlayer,
  'audio/mpeg':      AudioPlayer,
  'audio/wav':       AudioPlayer,
  'audio/mp4':       AudioPlayer,
  'audio/ogg':       AudioPlayer,
  'application/pdf': PDFViewer,
  'text/plain':      MarkdownRenderer,
  'text/markdown':   MarkdownRenderer,
  'text/csv':        DataTableViewer,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': DocumentRenderer,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':       DocumentRenderer,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': DocumentRenderer,
}

export function getViewer(mimeType: string): ComponentType<ViewerProps> {
  // Check exact match first, then prefix match (e.g. 'text/*')
  if (MIME_REGISTRY[mimeType]) return MIME_REGISTRY[mimeType]
  const prefix = mimeType.split('/')[0]
  const prefixMatch = Object.entries(MIME_REGISTRY).find(([k]) => k.startsWith(prefix + '/'))
  return prefixMatch?.[1] ?? UnsupportedFileViewer
}
```

### FileViewerShell Props Contract

```ts
interface KMSFile {
  id: string
  filename: string
  mimeType: string
  storageUrl: string
  sizeBytes: number
  status: 'PENDING' | 'PROCESSING' | 'INDEXED' | 'ERROR' | 'UNSUPPORTED'
  metadata: Record<string, unknown>
  webViewLink?: string   // Google Drive external link (fallback)
}

interface FileViewerShellProps {
  file: KMSFile
  /** Controls layout and sizing of the shell */
  mode: 'drawer' | 'page' | 'artifact' | 'inline'
  onClose?: () => void   // Required when mode === 'drawer'
  className?: string
}
```

### Viewer Props Contract (all viewers must implement)

```ts
interface ViewerProps {
  file: KMSFile
  mode: FileViewerShellProps['mode']
  className?: string
}

// Each viewer must export these named sub-components:
// - ViewerName.Loading  — skeleton sized for this type
// - ViewerName.Error    — error state with retry + download fallback
// - ViewerName.Empty    — empty/unavailable state with download fallback
```

---

## Data Flows

### Flow 1: File Viewer — Drawer Mode

```
User clicks FileCard
  → FilesDrawer opens (slide-in from right, 200ms CSS transition)
    → filesApi.get(fileId) called
      → [Loading state] FileViewerShell renders skeleton
      → [Success] FileViewerShell looks up mimeType in registry
        → Lazy-loads correct viewer
          → Viewer renders file from storageUrl
      → [If file is PROCESSING] ProcessingStatus mounts
        → useFileStatus(fileId) opens WebSocket to kms-api
          → Receives progress events → updates ProgressBar
          → On INDEXED → auto-refreshes viewer
  → "Open full view" button navigates to /files/:id
    → FileDetailPage renders same FileViewerShell (mode="page")
```

### Flow 2: Chat Artifact Panel

```
User sends message in chat
  → useChat sends to ACP via SSE fetch
    → SSE stream opens
      → agent_message_chunk events → ChatMessage text accumulates
      → file_reference event {fileId, filename, mimeType} arrives
        → ChatArtifactPanel receives event
          → filesApi.get(fileId) called
            → FileViewerShell renders in ArtifactPanel (mode="artifact")
      → done event → stream closes
  → Artifact panel persists until session reset or user dismisses
```

---

## Sprint Delivery Plan

### Sprint 1 — Foundation (packages/ui + Image + Drawer)
**Goal**: Any image file in the browser opens inline in a drawer.

Deliverables:
1. `packages/ui` package scaffolded, linked, importable in frontend
2. Design tokens published
3. Core primitives (Button, Badge, Icon, Text, Stack, Skeleton, Spinner, ProgressBar, Tooltip, Divider)
4. `FileViewerShell` + MIME registry
5. `ImageViewer` (all 4 states)
6. `FilesDrawer` feature component
7. File card click wired to drawer in FilesBrowserPage + drive/FilesBrowser
8. Tests: all primitives, FileViewerShell dispatch, ImageViewer states

### Sprint 2 — Media + Detail Page
**Goal**: Video, audio, and PDF work in drawer AND on detail page. Real-time status visible.

Deliverables:
1. `VideoPlayer`, `AudioPlayer`, `PDFViewer`
2. `ProcessingStatus` composite + `useFileStatus` WebSocket hook
3. `FileDetailPage` at `/files/:id`
4. WebSocket gateway in `kms-api`
5. Tests: all new viewers, WebSocket hook, FileDetailPage

### Sprint 3 — Chat Artifact Panel
**Goal**: AI can reference a file and it renders next to the conversation.

Deliverables:
1. `ArtifactPanel` composite
2. `CodeViewer`, `MarkdownRenderer`
3. `ChatArtifactPanel` feature component
4. Chat page two-column layout
5. SSE `file_reference` event in use-chat.ts
6. RAG service emits `file_reference` events
7. Tests: artifact panel mounts on SSE event, two-column layout

### Sprint 4 — Remaining Types + Polish
**Goal**: All 9 file types covered. Mobile responsive. Storybook live.

Deliverables:
1. `DataTableViewer`, `DocumentRenderer`, `ObsidianRenderer`
2. `SearchResultViewer`
3. Mobile responsive pass
4. Storybook setup
5. E2E Playwright tests (open drawer → view image → navigate to detail)
6. All docs synced

---

## Documentation Checklist

All of the following must be written/updated before this spec is considered complete:

- [x] `docs/prd/PRD-M16-rendering-engine.md` — Product requirements
- [x] `docs/prd/BRD-rendering-engine.md` — Business requirements
- [x] `docs/architecture/decisions/0030-kb-ui-standalone-package.md`
- [x] `docs/architecture/decisions/0031-mime-registry-renderer.md`
- [x] `docs/architecture/decisions/0032-hybrid-viewer-ux.md`
- [x] `docs/architecture/decisions/0033-websocket-file-status.md`
- [x] `docs/architecture/sequence-diagrams/rendering-file-viewer-drawer.md`
- [x] `docs/architecture/sequence-diagrams/rendering-chat-artifact-panel.md`
- [x] `docs/development/FOR-rendering-engine.md`
- [x] `frontend/CLAUDE.md` — Design system guidelines
- [ ] `docs/prd/CONTEXT.md` — Add M16 entry to routing table
- [ ] `docs/development/CONTEXT.md` — Add FOR-rendering-engine.md entry
- [ ] `docs/architecture/decisions/README.md` — Add ADR entries
