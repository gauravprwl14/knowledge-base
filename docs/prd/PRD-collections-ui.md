# PRD — Collections: File Organisation UI

**Status**: Ready for Implementation
**Author**: Gaurav (Ved)
**Created**: 2026-03-23
**Branch**: feat/collections-ui

---

## Problem Statement

Users can connect Google Drive and index files, but cannot organise them into logical groups for scoped search or RAG context. The backend `CollectionsController` is fully implemented with CRUD and file-membership endpoints. Only the frontend is missing, leaving an important workflow gap — users cannot curate topic-specific collections to narrow search or provide focused RAG context.

---

## Goals

1. Allow users to create and manage named collections of files from the Collections page.
2. Provide a detail view showing which files belong to a collection, with the ability to remove them.
3. Surface a consistent UI that matches the existing design system (sources page styling).
4. Keep the implementation behind the existing `NEXT_PUBLIC_USE_MOCK` flag for local development.

## Non-Goals

- Adding files to a collection from within the Collections page (files are added from the Files page, which already has partial wiring).
- Bulk operations (multi-select delete, move between collections).
- Pagination of files within a collection (out of scope for MVP).
- Sharing / collaboration on collections.

---

## Backend API (already exists)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/collections` | List user's collections — returns `{ id, name, description, fileCount, createdAt }[]` |
| POST | `/collections` | Create collection — body `{ name, description? }` |
| GET | `/collections/:id` | Get single collection with files |
| PATCH | `/collections/:id` | Update `{ name?, description? }` |
| DELETE | `/collections/:id` | Delete collection |
| POST | `/collections/:id/files` | Add files — body `{ fileIds: string[] }` |
| DELETE | `/collections/:id/files/:fileId` | Remove a file from a collection |

---

## User Stories

| ID | Story |
|----|-------|
| US-01 | As a user, I can see all my collections on the Collections page with file counts |
| US-02 | As a user, I can create a named collection with an optional description |
| US-03 | As a user, I can click into a collection and see all its files |
| US-04 | As a user, I can remove a file from a collection |
| US-05 | As a user, I can rename or delete a collection |
| US-06 | From the Files page, I can add files to collections (partially wired in FilesBrowser — not in scope here) |

---

## Acceptance Criteria

### AC-01 — Collections List
- [ ] Page renders a grid of collection cards (name, description, file count badge, created date).
- [ ] Loading state: 3 skeleton cards while data is fetching.
- [ ] Empty state: "No collections yet. Create one to organise your files."
- [ ] Error state: dismissible error banner.

### AC-02 — Create Collection
- [ ] "New Collection" button opens a modal with Name (required) and Description (optional) fields.
- [ ] Submitting the form calls `POST /collections` and adds the new card to the list without a full reload.
- [ ] Validation: name must not be empty; button is disabled while request is in flight.

### AC-03 — Collection Detail View
- [ ] Clicking a collection card navigates to a detail view (state-based, no router change).
- [ ] Detail view shows: back button, collection name, description, file table (filename, type, size).
- [ ] Empty file state: "No files in this collection yet. Add files from the Files page."

### AC-04 — Remove File
- [ ] Each file row has a Remove button.
- [ ] Clicking Remove calls `DELETE /collections/:id/files/:fileId` and removes the row optimistically.

### AC-05 — Edit Collection
- [ ] An edit button on the detail view opens an inline edit form pre-filled with current name/description.
- [ ] Saving calls `PATCH /collections/:id` and updates the heading.

### AC-06 — Delete Collection
- [ ] A Delete button on the collection card triggers an inline confirmation state.
- [ ] Confirming calls `DELETE /collections/:id` and removes the card from the list.

---

## UI / Design Tokens

Use the existing CSS custom properties:
- `var(--color-bg-primary)`, `var(--color-bg-secondary)`
- `var(--color-text-primary)`, `var(--color-text-secondary)`
- `var(--color-border)`, `var(--color-accent)`

Card layout consistent with the Sources page: `rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 shadow-sm`.

---

## File Map

| File | Purpose |
|------|---------|
| `frontend/lib/api/collections.ts` | API client (real + mock) |
| `frontend/app/[locale]/(dashboard)/collections/page.tsx` | Collections page (list + detail + modals) |
| `frontend/__tests__/unit/components/collections/CollectionsPage.test.tsx` | Unit tests |

---

## Success Metrics

- All 6 acceptance criteria checked off.
- Unit test coverage ≥ 80% for the new page component.
- No TypeScript errors in new files.
- Mock mode works with `NEXT_PUBLIC_USE_MOCK=true`.
