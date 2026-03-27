# ADR-0032: Hybrid Viewer UX — Drawer + Full Detail Page

**Date**: 2026-03-27
**Status**: Accepted
**Deciders**: Gaurav (Ved)

---

## Context

When a user clicks a file card, the application needs to present the file preview. Four layouts were considered:

1. **Side Drawer** — slides in from the right, file list stays visible
2. **Full Detail Page** — navigates to `/files/:id`, full-screen view
3. **Split Panel** — persistent master/detail, file list left, preview right
4. **Hybrid** — drawer for quick preview, "Open full view" navigates to detail page

---

## Decision

Implement the **Hybrid** pattern: a slide-in drawer for quick inline preview, with an "Open full view" button that navigates to `/files/:id` for deep work. Both surfaces use the same `FileViewerShell` composite with a different `mode` prop (`mode="drawer"` vs `mode="page"`).

---

## Rationale

**Why not drawer-only?**
- A drawer is constrained in width (~400–500px). PDFs, spreadsheets, and video benefit from a full-screen layout. Forcing everything into a drawer degrades the experience for complex file types.

**Why not full-page-only?**
- Users browsing 50 files to find the right one do not want to navigate away from the file list for each inspection. Full-page navigation breaks the scanning workflow.

**Why not split panel?**
- Persistent split panel consumes 40–50% of horizontal screen real estate at all times, even when not viewing a file. On smaller screens (1280px laptops), this makes the file list too narrow for comfortable browsing.
- Split panel is optimal for note-taking apps (Obsidian, Bear) but not for a file browser where the primary action is filtering and selecting, not side-by-side comparison.

**Why hybrid?**
- The drawer handles 80% of use cases: "let me quickly see what this file is".
- The full detail page handles 20% of use cases: "I want to read this PDF carefully and see all its metadata and related search results".
- The single `FileViewerShell` component with a `mode` prop means zero code duplication between the two.
- The "Open full view" affordance educates users about the detail page without forcing them there.
- The same pattern scales to chat: `mode="artifact"` in the side panel uses identical rendering logic.

---

## Consequences

**Positive:**
- `FileViewerShell` works in 4 contexts (`drawer`, `page`, `artifact`, `inline`) with one component
- Users have a progressive disclosure path: card → drawer → detail page
- Detail page (`/files/:id`) is a proper route — shareable URL, linkable from search results and chat

**Negative:**
- Two entry points to the same content means the `FilesDrawer` and `FileDetailPage` feature components both need to be maintained
- Drawer state (open file, scroll position) is lost on navigation to detail page — acceptable trade-off

---

## Implementation Notes

**Drawer behaviour:**
- Opens via `useState` in `FilesBrowserPage` — `selectedFileId` state
- Close on: Esc key, backdrop click, explicit × button, navigation away
- Width: `w-[480px]` on desktop, full-width on mobile
- Animation: `translate-x-full → translate-x-0`, 200ms ease-out

**Detail page:**
- Route: `app/[locale]/(dashboard)/files/[id]/page.tsx`
- Layout: 60% viewer / 40% metadata + related chunks panel
- Breadcrumb: Files → [filename]

**Mode prop effect on FileViewerShell:**
- `drawer`: compact header, close button, "Open full view" CTA
- `page`: no close button, full height, expanded metadata
- `artifact`: minimal chrome, fixed height, no navigation CTA
- `inline`: no chrome, just the rendered content
