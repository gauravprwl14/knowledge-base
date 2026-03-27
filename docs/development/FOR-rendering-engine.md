# FOR-rendering-engine.md — File Rendering Engine & @kb/ui Design System

**Layer**: Frontend (packages/ui + frontend/components/features)
**Sprint**: 1–4 (incremental delivery)
**PRD**: `docs/prd/PRD-M16-rendering-engine.md`
**ADRs**: 0030, 0031, 0032, 0033

---

## What This Is

The File Rendering Engine is the in-app system for displaying any file type inline — images, video, audio, PDF, code, markdown, CSV, Office docs, and Obsidian notes. It is backed by `@kb/ui`, a shared monorepo component package that provides design tokens, primitives, and composites reusable across the file browser, chat interface, search results, and future apps.

The two main surfaces are:
1. **FilesDrawer** — slides in when a file card is clicked; quick preview
2. **ChatArtifactPanel** — appears next to chat when the AI references a file; same viewer, different mode

---

## Package Location

```
packages/ui/          ← @kb/ui — shared component library
frontend/components/features/   ← feature wiring (imports from @kb/ui)
```

Import rule: **always `import { X } from '@kb/ui'`** — never from a relative path inside `packages/ui`.

---

## Component Map

| Component | Package | Layer | Sprint |
|-----------|---------|-------|--------|
| Design tokens (CSS vars) | `@kb/ui/tokens` | 1 — Tokens | 1 |
| Button, Badge, Icon, Text, Stack | `@kb/ui` | 2 — Primitives | 1 |
| Skeleton, Spinner, ProgressBar, Tooltip | `@kb/ui` | 2 — Primitives | 1 |
| FileViewerShell | `@kb/ui` | 3 — Composite | 1 |
| ImageViewer | `@kb/ui` | 3 — Composite | 1 |
| VideoPlayer, AudioPlayer | `@kb/ui` | 3 — Composite | 2 |
| PDFViewer | `@kb/ui` | 3 — Composite | 2 |
| ProcessingStatus | `@kb/ui` | 3 — Composite | 2 |
| ArtifactPanel | `@kb/ui` | 3 — Composite | 3 |
| CodeViewer, MarkdownRenderer | `@kb/ui` | 3 — Composite | 3 |
| DataTableViewer, DocumentRenderer | `@kb/ui` | 3 — Composite | 4 |
| ObsidianRenderer | `@kb/ui` | 3 — Composite | 4 |
| FilesDrawer | `frontend/features/files` | 4 — Feature | 1 |
| FileDetailPage | `frontend/app/.../files/[id]` | 4 — Feature | 2 |
| ChatArtifactPanel | `frontend/features/chat` | 4 — Feature | 3 |
| SearchResultViewer | `frontend/features/search` | 4 — Feature | 4 |

---

## Adding a New File Type

1. Create `packages/ui/src/composites/viewers/MyViewer.tsx`
2. Implement the `ViewerProps` interface (see below)
3. Export 3 named sub-components: `MyViewer.Loading`, `MyViewer.Error`, `MyViewer.Empty`
4. Add to `packages/ui/src/composites/viewers/registry.ts`:
   ```ts
   'application/x-my-type': lazy(() => import('./MyViewer')),
   ```
5. Add to `packages/ui/src/index.ts` barrel export
6. Write unit tests covering all 4 states
7. Done. `FileViewerShell` picks it up automatically.

---

## ViewerProps Interface

All viewer components must implement this interface:

```ts
// packages/ui/src/composites/viewers/types.ts

export interface KMSFile {
  id: string
  filename: string
  mimeType: string
  storageUrl: string
  sizeBytes: number
  status: 'PENDING' | 'PROCESSING' | 'INDEXED' | 'ERROR' | 'UNSUPPORTED' | 'DELETED'
  metadata: Record<string, unknown>
  webViewLink?: string   // fallback external link (e.g., Google Drive)
}

export interface ViewerProps {
  file: KMSFile
  /** Controls shell chrome and sizing */
  mode: 'drawer' | 'page' | 'artifact' | 'inline'
  className?: string
}
```

---

## FileViewerShell Modes

| Mode | Used by | Chrome | Size | Actions |
|------|---------|--------|------|---------|
| `drawer` | FilesDrawer | Header + close + "Open full view" CTA | 480px wide | Download, close |
| `page` | FileDetailPage | No chrome (page has its own layout) | Full viewport | Download, share |
| `artifact` | ChatArtifactPanel | Minimal header, no nav | Fixed panel height | Download, dismiss |
| `inline` | Expandable card (mobile) | None | Auto | None |

---

## Design Token Reference

All tokens are CSS custom properties set in `packages/ui/src/tokens/*.css`.

### Colors

```css
/* Surfaces */
--color-surface-base        /* #0f172a — page background */
--color-surface-card        /* #1e293b — card/panel background */
--color-surface-elevated    /* #334155 — elevated surfaces, inputs */

/* Text */
--color-text-primary        /* #f1f5f9 — primary readable text */
--color-text-secondary      /* #94a3b8 — secondary/muted text */
--color-text-disabled       /* #475569 — disabled state */

/* Accents */
--color-accent-blue         /* #3b82f6 */
--color-accent-green        /* #10b981 */
--color-accent-purple       /* #8b5cf6 */
--color-accent-amber        /* #f59e0b */
--color-accent-red          /* #ef4444 */

/* Status */
--color-status-indexed      /* #10b981 — green */
--color-status-processing   /* #f59e0b — amber */
--color-status-error        /* #ef4444 — red */
--color-status-pending      /* #94a3b8 — gray */
```

### Spacing (4px base unit)

```css
--space-1: 4px    --space-2: 8px    --space-3: 12px   --space-4: 16px
--space-5: 20px   --space-6: 24px   --space-8: 32px   --space-10: 40px
--space-12: 48px  --space-16: 64px
```

### Motion

```css
--duration-fast: 150ms    /* micro-interactions, hover */
--duration-base: 250ms    /* most transitions */
--duration-slow: 400ms    /* drawer open, panel appear */
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1)
--ease-enter: cubic-bezier(0, 0, 0.2, 1)
--ease-exit: cubic-bezier(0.4, 0, 1, 1)
```

---

## Primitive Usage Examples

### Button

```tsx
import { Button } from '@kb/ui'

// Variants: solid (default), ghost, outline, destructive
// Sizes: sm, md (default), lg
<Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
<Button variant="outline" onClick={onDownload}>Download</Button>
```

### Badge

```tsx
import { Badge } from '@kb/ui'

// Variants: status, tag, count
<Badge variant="status" color="green">Indexed</Badge>
<Badge variant="tag">typescript</Badge>
<Badge variant="count">+3</Badge>
```

### Skeleton

```tsx
import { Skeleton } from '@kb/ui'

// Use inside viewer Loading sub-components
<Skeleton className="h-64 w-full rounded-lg" />
<Skeleton className="h-4 w-3/4 mt-2" />
```

### ProgressBar

```tsx
import { ProgressBar } from '@kb/ui'

// value: 0-100, color: green|amber|red|blue
<ProgressBar value={embeddingProgress} color="blue" />
```

---

## WebSocket Hook — useFileStatus

```ts
// frontend/lib/hooks/use-file-status.ts
// Used by ProcessingStatus composite to get real-time updates

import { useFileStatus } from '@/lib/hooks/use-file-status'

const { status, embeddingProgress, transcriptionStatus } = useFileStatus(fileId)
// Returns live state; falls back to 10s polling if WebSocket unavailable
```

---

## Real-Time Behaviour

- `ProcessingStatus` mounts automatically when `FileViewerShell` receives a file with `status !== 'INDEXED'`
- On `status === 'INDEXED'` event from WebSocket, `FileViewerShell` re-fetches the file and unmounts `ProcessingStatus`
- The viewer for the actual content mounts only after the file reaches `INDEXED` status

---

## Testing Strategy

### Primitives

- Pure unit tests: render, all variant combinations, ref forwarding
- No mocks required

### Composites

- Test all 4 states: Loading, Error, Empty, Rendered
- Use `React.Suspense` in test wrapper for lazy-loaded viewers
- Mock `storageUrl` with a test fixture

### Feature Components

- `FilesDrawer`: test open/close, keyboard dismiss (Esc), file fetch on open
- `ChatArtifactPanel`: test `file_reference` SSE event triggers panel open and file fetch
- Use MSW to mock `GET /files/:id`

### E2E (Playwright — Sprint 4)

- `test('open drawer from file card, view image, navigate to detail page')`
- `test('chat sends message, file_reference triggers artifact panel')`
- `test('processing file shows progress bar, auto-updates on completion')`

---

## Common Mistakes to Avoid

| ❌ Don't | ✅ Do |
|---------|-------|
| `import { Button } from '../../packages/ui/src/primitives/Button'` | `import { Button } from '@kb/ui'` |
| Add MIME conditionals in FilesBrowserPage | Add to `registry.ts`, use `FileViewerShell` |
| Hardcode `#1e293b` in a component | Use `var(--color-surface-card)` or Tailwind token class |
| Skip barrel export after creating a component | Add to `packages/ui/src/index.ts` immediately |
| Fetch API data inside a composite | Pass data as props from the feature component |
| Add `console.log` for debugging | Remove before commit; use structured logging in services |
