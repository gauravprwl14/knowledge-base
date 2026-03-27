# ADR-0031: Registry-Driven MIME Type File Renderer

**Date**: 2026-03-27
**Status**: Accepted
**Deciders**: Gaurav (Ved)

---

## Context

The file rendering engine must dispatch the correct viewer component based on a file's MIME type. There are 9+ file types to support across 4 sprints. The question is how to structure the dispatch logic:

1. **Switch/if-else chain** — inline conditional in `FileViewerShell` component
2. **Registry map** — a static `Record<mimeType, ViewerComponent>` in a separate file
3. **Plugin/dynamic import system** — viewers self-register at module load time

---

## Decision

Use a static MIME registry map in `packages/ui/src/composites/viewers/registry.ts`. `FileViewerShell` imports `getViewer(mimeType)` and renders the result. All lazy-loading is handled in the registry via `React.lazy()`.

```ts
// packages/ui/src/composites/viewers/registry.ts
const MIME_REGISTRY: Record<string, ComponentType<ViewerProps>> = {
  'image/jpeg': lazy(() => import('./ImageViewer')),
  'video/mp4':  lazy(() => import('./VideoPlayer')),
  // ... one line per type
}

export function getViewer(mimeType: string): ComponentType<ViewerProps> { ... }
```

---

## Rationale

**Why not a switch/if-else chain?**
- Every new file type requires modifying `FileViewerShell` — a composite that should not grow indefinitely.
- With 9+ types, the switch statement becomes the largest function in the composites layer.
- It violates the Open/Closed Principle: adding a type should not require changing the dispatcher.

**Why not a plugin/self-registration system?**
- Self-registration requires module-side effects — viewers import a `register()` function and call it at load time. This makes the order of imports observable, complicates tree-shaking, and adds non-obvious indirection.
- The registry's full contents must be visible in one place for auditability. A plugin system scatters that across many files.

**Why a static registry map?**
- Adding a new type is exactly one line in one file: `'text/csv': DataTableViewer`
- The full registry is readable as a specification of what is supported
- `React.lazy()` inside the registry ensures viewers are only loaded when their type is first encountered — zero cost for types not in the session
- Prefix fallback (`getViewer` checks `mimeType.split('/')[0]` if exact match fails) handles `video/x-matroska` and similar non-standard types gracefully

---

## Consequences

**Positive:**
- One file (`registry.ts`) is the authoritative list of supported file types — easy to audit and update
- Adding a new file type requires changing exactly one file
- All viewer bundles are lazy-loaded — no impact on initial page load
- `UnsupportedFileViewer` fallback is explicit and always reachable

**Negative:**
- Registry must be manually updated — there is no automatic discovery of new viewers
- TypeScript will not error if you create a viewer file but forget to add it to the registry (mitigated by barrel export rule and code review)

---

## Implementation Notes

The `getViewer` function must handle:
1. Exact match: `'image/jpeg'` → `ImageViewer`
2. Prefix fallback: `'video/x-unknown'` → `VideoPlayer` (matches `video/*`)
3. No match → `UnsupportedFileViewer`

Every viewer component must implement the `ViewerProps` interface:
```ts
interface ViewerProps {
  file: KMSFile
  mode: 'drawer' | 'page' | 'artifact' | 'inline'
  className?: string
}
```

And must export named loading/error/empty sub-components.
