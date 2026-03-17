# PRD: M11 — Web UI — Design System & Application Shell

## Status

`Approved`

**Created**: 2026-03-17
**Depends on**: M00 (shell), M01 (auth pages), M02+ (feature pages)

---

## Business Context

The web UI is the primary surface users interact with. A consistent design system (tokens → components) ensures the UI looks and behaves predictably across 14 pages, dark/light modes, and future teams. Getting the shell and design system right in M00/M11 avoids costly visual rework as features are added. The UI must feel polished for a knowledge tool — fast, clean, and focused.

---

## User Stories

| As a... | I want to... | So that... |
|---------|-------------|-----------|
| User | See my dashboard with key stats at a glance | I understand the state of my knowledge base |
| User | Navigate quickly between sections | I don't get lost |
| User | Use dark mode | My eyes don't hurt at night |
| User | Browse and preview files | I can quickly verify what's indexed |
| User | Filter and sort in every list view | I find what I'm looking for fast |

---

## Scope

**In scope — Design System:**
- 3-tier design token system: Primitive → Semantic → Component
- TailwindCSS v4 with `@theme` directive
- Dark/light mode via CSS variables
- 15+ reusable components (see FR list)
- Consistent spacing, typography, color system

**In scope — Application Shell (M00):**
- Base layout: collapsible sidebar nav + topbar + main content area
- Global search bar (always visible in topbar)
- Notification / activity bell (stub)
- User avatar menu (profile, settings, logout)

**In scope — All 14 Pages:**
Dashboard, Sources, File Browser, File Detail, Search Results, Duplicates, Junk, Knowledge Graph, Chat, Transcriptions, Collections, Notes, Settings, Admin

**Out of scope:**
- Mobile responsive (web desktop + tablet only for MVP)
- Native mobile app
- Real-time collaboration (post-MVP)

---

## Functional Requirements

### Design Tokens

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | Primitive tokens: 60-step color scale, 8-step spacing, 6 border-radius values | Must |
| FR-02 | Semantic tokens: `--color-background`, `--color-foreground`, `--color-border`, `--color-primary` etc | Must |
| FR-03 | Component tokens: `--button-bg`, `--input-border`, `--card-shadow` etc | Must |
| FR-04 | Dark mode: all semantic tokens switch via `[data-theme="dark"]` | Must |

### Core Components

| ID | Component | Priority |
|----|-----------|----------|
| FR-10 | `Button` (primary, secondary, ghost, destructive, loading state) | Must |
| FR-11 | `Input`, `Textarea`, `Select`, `Checkbox`, `Switch` | Must |
| FR-12 | `Badge` (status: info, success, warning, error, neutral) | Must |
| FR-13 | `Card`, `CardHeader`, `CardContent`, `CardFooter` | Must |
| FR-14 | `Modal` + `Drawer` with focus trap | Must |
| FR-15 | `Toast` notification (top-right, auto-dismiss) | Must |
| FR-16 | `Table` with sortable columns + `Pagination` | Must |
| FR-17 | `Tabs` (horizontal + vertical) | Must |
| FR-18 | `Skeleton` loading placeholder | Must |
| FR-19 | `Avatar` (initials fallback) | Must |
| FR-20 | `ProgressBar` (determinate + indeterminate) | Must |
| FR-21 | `DropZone` file upload area | Must |
| FR-22 | `MediaPlayer` (audio + video, custom controls) | Must |
| FR-23 | `EmptyState` (icon + title + action button) | Must |
| FR-24 | `SearchInput` with debounce + clear button | Must |

### Pages

| ID | Page | Route | Key UI |
|----|------|-------|--------|
| FR-30 | Dashboard | `/` | Stats cards, activity feed, quick-action buttons |
| FR-31 | Sources | `/sources` | Source cards with status badge, "Add Source" modal |
| FR-32 | File Browser | `/files` | Table + grid view toggle, filter sidebar, bulk select, preview panel |
| FR-33 | File Detail | `/files/{id}` | Metadata panel, extracted text, chunk list, transcription, graph neighbors |
| FR-34 | Search Results | `/search` | Results list, type tabs, filter panel, snippet highlights |
| FR-35 | Duplicates | `/duplicates` | Group accordion, keep/delete actions, space-saved badge |
| FR-36 | Junk | `/junk` | File list with reason badges, confidence slider, bulk delete |
| FR-37 | Knowledge Graph | `/graph` | React Flow canvas, node/edge inspector panel |
| FR-38 | Chat | `/chat` | Message thread, SSE streaming, citation chips, session sidebar |
| FR-39 | Transcriptions | `/transcriptions` | Job list, MediaPlayer + transcript panel |
| FR-40 | Collections | `/collections` | Collection list, file picker, add/remove |
| FR-41 | Notes | `/notes` | Note list, Markdown preview |
| FR-42 | Settings | `/settings` | Profile, API keys, preferences tabs |
| FR-43 | Admin | `/admin` | User table (admin only) |

---

## Non-Functional Requirements

| Concern | Requirement |
|---------|-------------|
| First paint | < 1.5s (LCP on dashboard) |
| Layout shift | CLS < 0.1 (Skeleton placeholders) |
| Accessibility | WCAG 2.1 AA: keyboard nav, screen reader labels, focus rings |
| Browser support | Chrome 120+, Firefox 120+, Safari 17+ |
| Bundle size | < 300KB gzipped initial JS bundle |

---

## State Management Architecture

```
Zustand Stores:
  useAuthStore         { user, tokens, login(), logout(), refresh() }
  useSearchStore       { query, type, results, filters, search() }
  useFilesStore        { files, selected, bulkDelete() }
  useSourcesStore      { sources, triggerScan(), addSource() }
  useChatStore         { sessions, currentSession, sendMessage() }
  useUIStore           { theme, sidebarCollapsed, toasts }

React Query:
  useFiles(filters)    → GET /files
  useSearch(query)     → GET /search
  useSources()         → GET /sources
  useChatSessions()    → GET /chat/sessions
  useStats()           → GET /dashboard/stats
```

---

## Design Token Structure

```css
/* Primitive tokens (never use directly in components) */
:root {
  --gray-50: #f9fafb;
  --gray-900: #111827;
  --blue-500: #3b82f6;
  --space-1: 4px;
  --space-2: 8px;
  --radius-md: 8px;
}

/* Semantic tokens (use in components) */
:root {
  --color-background: var(--gray-50);
  --color-foreground: var(--gray-900);
  --color-primary: var(--blue-500);
  --color-border: var(--gray-200);
}

[data-theme="dark"] {
  --color-background: var(--gray-950);
  --color-foreground: var(--gray-50);
  --color-border: var(--gray-800);
}
```

---

## API Client

```typescript
// lib/api-client.ts
export const apiClient = {
  // Injects Authorization: Bearer {token}
  // Auto-refreshes on 401
  // Wraps all errors in AppError shape
  get<T>(path: string, params?: Record<string, string>): Promise<T>,
  post<T>(path: string, body: unknown): Promise<T>,
  patch<T>(path: string, body: unknown): Promise<T>,
  delete(path: string): Promise<void>,
  stream(path: string, onToken: (token: string) => void): Promise<void>,  // SSE
}
```

---

## Testing Plan

| Test Type | Scope | Key Cases |
|-----------|-------|-----------|
| Unit | Button, Input, Badge, Card components | Render, variant props, disabled state |
| Unit | useAuthStore | login/logout/refresh state transitions |
| Integration | Login flow | Render → fill form → submit → redirect |
| Integration | Search page | Type query → debounce → results render |
| E2E (Playwright) | Full user journey | Register → connect source → search → find file |

---

## Tech Stack

| Library | Purpose | Version |
|---------|---------|---------|
| Next.js | App framework | 15 (App Router) |
| TailwindCSS | Styling | v4 |
| Zustand | Client state | 5.x |
| TanStack Query | Server state + caching | 5.x |
| React Flow | Graph visualization | 11.x |
| Axios | HTTP client | 1.x |
| Jest + RTL | Unit + integration tests | Latest |
| Playwright | E2E tests | 1.x |
