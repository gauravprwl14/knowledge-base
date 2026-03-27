# Frontend — Design System & Component Guidelines

This file governs all frontend component work in this directory.
It EXTENDS (never duplicates) the root `CLAUDE.md` and `CLAUDE.local.md`.

---

## Design System Architecture

The KMS frontend uses a **4-layer component hierarchy**. Every component must live at exactly one layer. Never skip a layer — a feature component must not implement raw styling logic that belongs in a primitive.

```
Layer 1 — Design Tokens       packages/ui/src/tokens/
Layer 2 — Primitives          packages/ui/src/primitives/
Layer 3 — Composites          packages/ui/src/composites/
Layer 4 — Feature Components  frontend/components/features/
```

### Layer 1 — Design Tokens (`packages/ui/src/tokens/`)

CSS custom properties and Tailwind theme extensions. **No JSX lives here.**

- Colors: `--color-surface-*`, `--color-text-*`, `--color-accent-*`, `--color-status-*`
- Spacing scale: `--space-1` through `--space-16` (4px base unit)
- Typography: `--font-size-*`, `--font-weight-*`, `--line-height-*`
- Radius: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-full`
- Motion: `--duration-fast` (150ms), `--duration-base` (250ms), `--duration-slow` (400ms)
- Shadows: `--shadow-sm`, `--shadow-md`, `--shadow-glow`
- Z-index: `--z-drawer`, `--z-modal`, `--z-tooltip`, `--z-overlay`

**Rule:** Never hardcode a hex color or pixel value in a component. Always reference a token.

### Layer 2 — Primitives (`packages/ui/src/primitives/`)

Single-responsibility, stateless, **domain-agnostic** components. They know nothing about KMS business logic.

Examples: `Button`, `Badge`, `Icon`, `Text`, `Stack`, `Divider`, `Skeleton`, `Spinner`, `Tooltip`, `ProgressBar`, `Avatar`

**Rules for primitives:**
- Accept `className` prop for override escape hatch
- Expose `as` prop for polymorphic rendering where it makes sense (e.g. `Text as="h1"`)
- Use `cva()` (class-variance-authority) for variant definitions — never inline ternaries for variants
- Zero business logic, zero API calls, zero state management imports
- All variants and sizes must be typed — no `string` prop where an enum will do
- Export both the component AND its props type: `export type { ButtonProps }`

### Layer 3 — Composites (`packages/ui/src/composites/`)

Composed from primitives. May hold **local UI state only** (open/closed, hovered, active tab). Still domain-agnostic.

Examples: `FileViewerShell`, `ArtifactPanel`, `MediaPlayer`, `DocumentRenderer`, `CodeViewer`, `ImageViewer`, `PDFViewer`, `AudioPlayer`, `VideoPlayer`, `DataTable`, `MarkdownRenderer`

**Rules for composites:**
- Build from Layer 2 primitives + shadcn/ui Radix primitives only
- May use `useState`, `useRef`, `useReducer` for internal UI state
- Must NOT import from `lib/api/`, `lib/stores/`, or `lib/hooks/` (those live in Layer 4)
- Receive all data as props — composites are "dumb" about where data comes from
- Each composite must have a **Loading state**, **Error state**, and **Empty state** as named exports or sub-components
- Lazy-load heavy renderers: `const PDFViewer = dynamic(() => import('./PDFViewer'), { ssr: false })`

### Layer 4 — Feature Components (`frontend/components/features/`)

Wire composites to application state. Know about KMS domain objects (files, sources, collections, chat sessions).

Examples: `FilesDrawer` (wraps `FileViewerShell` + fetches file data), `ChatArtifactPanel` (wraps `ArtifactPanel` + subscribes to SSE stream)

**Rules for feature components:**
- May import from `lib/api/`, `lib/stores/`, `lib/hooks/`
- Must NOT re-implement styling — use composites and primitives
- One feature component = one domain concern

---

## Package: `@kb/ui`

### Location
`/packages/ui/` in the monorepo root (NOT inside `frontend/`).

### Import Rule
```ts
// ✅ Correct — always import from the package
import { Button, FileViewerShell } from '@kb/ui'

// ❌ Wrong — never import from internal package paths
import { Button } from '../../packages/ui/src/primitives/Button'
```

### Package Structure
```
packages/ui/
├── src/
│   ├── tokens/           # CSS variables + Tailwind preset
│   ├── primitives/       # Layer 2 components
│   ├── composites/       # Layer 3 components
│   │   ├── viewers/      # File type renderers
│   │   │   ├── ImageViewer.tsx
│   │   │   ├── VideoPlayer.tsx
│   │   │   ├── AudioPlayer.tsx
│   │   │   ├── PDFViewer.tsx
│   │   │   ├── CodeViewer.tsx
│   │   │   ├── MarkdownRenderer.tsx
│   │   │   ├── DataTableViewer.tsx
│   │   │   └── DocumentRenderer.tsx   # Office docs fallback
│   │   ├── FileViewerShell.tsx        # Unified renderer dispatcher
│   │   ├── ArtifactPanel.tsx          # Chat artifact side panel
│   │   └── MediaPlayer.tsx            # Shared audio+video base
│   └── index.ts          # Single barrel export — everything exported here
├── package.json          # name: "@kb/ui", sideEffects: ["*.css"]
└── tsconfig.json
```

### Barrel Export Rule
**Every new component MUST be added to `packages/ui/src/index.ts` immediately.**
A component that is not exported from the barrel does not exist as far as consumers are concerned.

---

## File Viewer / Rendering Engine

### The `FileViewerShell` Contract

`FileViewerShell` is the single dispatch point for all file rendering. It receives a `KMSFile` and selects the correct viewer automatically.

```ts
interface FileViewerShellProps {
  file: KMSFile            // Full file object with mimeType, storageUrl, metadata
  mode: 'drawer' | 'page' | 'artifact' | 'inline'
  onClose?: () => void     // Required when mode === 'drawer'
  className?: string
}
```

**MIME → viewer mapping lives in one place:** `packages/ui/src/composites/viewers/registry.ts`
Never add mime-type conditionals in feature components — always go through the registry.

### Viewer States (required for every viewer)
Every viewer component MUST handle all 4 states:
1. **Loading** — skeleton placeholder sized to the content type
2. **Error** — inline error with retry action
3. **Empty** — "No preview available" with download fallback
4. **Rendered** — the actual content

### Lazy Loading Rule
All viewers that load a third-party library (PDF.js, highlight.js, video.js, etc.) MUST be
dynamically imported:
```ts
const PDFViewer = dynamic(() => import('./PDFViewer'), {
  ssr: false,
  loading: () => <PDFSkeleton />
})
```

---

## Component API Design Rules

1. **Variant props use string literals, not booleans.** `size="sm" | "md" | "lg"`, not `small={true}`.
2. **Compound components for complex UIs.** Use `Component.Sub` pattern for related sub-parts.
3. **Forward refs on all primitives** that wrap a DOM element.
4. **`data-testid` on interactive elements.** Required for Playwright E2E tests.
5. **ARIA attributes are not optional.** Every interactive composite must be keyboard-navigable and screen-reader-labelled.
6. **No magic numbers.** Any numeric constant (timeout, z-index, breakpoint) must reference a token or a named constant.

---

## Styling Rules

- **Token-first:** Use CSS variables from `packages/ui/src/tokens/` before reaching for Tailwind utilities.
- **Tailwind for layout only** at the feature layer (flex, grid, gap, padding). Tokens handle color, shadow, radius.
- **No inline `style={{}}` props** unless for dynamic computed values (e.g. animation progress width).
- **Dark mode is default.** The app uses a dark theme. Do not add `dark:` variants — style for dark first.
- **Glass morphism pattern:** Use `bg-white/5 backdrop-blur-sm border border-white/10` for card surfaces. This is the established app aesthetic.

---

## Testing Rules for UI Components

- **Primitives:** Pure unit tests — render, snapshot, variant coverage. No mocks needed.
- **Composites:** Test all 4 states (loading, error, empty, rendered). Use MSW for any fetch inside composites.
- **Feature components:** Integration tests using React Testing Library. Mock `lib/api/` at the module boundary.
- **Storybook (future):** Each composite must have a `.stories.tsx` file once Storybook is configured.
- **Coverage gate:** 80% on `packages/ui/src/` — same as root DoD.

---

## What NOT to do

| ❌ Don't | ✅ Do instead |
|---------|--------------|
| Import API clients in `packages/ui` | Pass data as props |
| Use `console.log` in components | Use `@InjectPinoLogger` in services; no logging in UI components |
| Create a new primitive when one exists | Extend via `className` or `cva` variant |
| Hardcode `#1e293b` or `16px` | Use `--color-surface-card` or `--space-4` |
| Add `dark:` Tailwind variants | Style for dark mode by default |
| Skip the barrel export | Always add to `index.ts` immediately |
| Put API logic in a composite | Feature component wraps the composite and provides data |
| Use `any` type for file/viewer props | Define and export explicit TypeScript interfaces |
