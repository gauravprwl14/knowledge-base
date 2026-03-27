# BRD: File Rendering Engine & Design System

## Document Info

**Type**: Business Requirements Document
**Status**: Draft
**Created**: 2026-03-27
**Related PRD**: `PRD-M16-rendering-engine.md`

---

## Executive Summary

KMS currently has no inline file rendering capability. Users must leave the application to view any file they have indexed — images open in a browser tab, videos require an external player, PDFs redirect to Google Drive. This is a fundamental usability failure for a knowledge management system. The File Rendering Engine and `@kb/ui` Design System address this by delivering in-app, contextual file viewing across every surface of the product, paired with a shared component library that guarantees visual and behavioural consistency as the product scales.

---

## Business Problem

### Current State Pain Points

1. **Trust erosion**: Users cannot verify their indexed content without leaving KMS. If a file looks wrong, they have no way to confirm without switching context.
2. **Chat is disconnected from content**: The AI references files in conversation but users cannot see those files alongside the response. They have to search for the file manually in a separate tab.
3. **No product identity**: The UI has no consistent visual language. Components built at different times look different and behave differently, raising the perceived quality ceiling.
4. **Developer velocity**: Every developer who touches the UI re-solves the same problems (file type detection, status badges, loading states) independently. There is no shared component library.

### Business Impact of Not Building This

- User retention: Users who cannot see their files lose trust in what is indexed and stop using the product.
- Demo quality: A KMS that cannot show a PDF or play a video in-app cannot compete with Notion, Obsidian, or any modern knowledge tool in a demo or sales context.
- Technical debt: Without a design system, the frontend diverges with every sprint. Refactoring later costs 3–5x more than doing it now.

---

## Stakeholders

| Role | Name | Interest |
|------|------|----------|
| Product Owner | Gaurav (Ved) | Deliver a product that can win Upwork clients |
| End User | Knowledge worker | View and interact with indexed files without leaving the app |
| Developer | Solo (Ved) | Reusable components that don't need to be rebuilt for every surface |

---

## Business Objectives

| ID | Objective | Measurement |
|----|-----------|-------------|
| BO-01 | Eliminate all file-view exits from KMS for supported types | 0 navigations away for image, video, audio, PDF, code, markdown |
| BO-02 | Establish a single source of truth for UI components | 100% of new components built from `@kb/ui` |
| BO-03 | Deliver a demo-ready chat + artifact experience | AI response can show referenced file inline in chat |
| BO-04 | Enable incremental delivery — each sprint ships working feature | Sprint 1 ships image viewer end-to-end |
| BO-05 | Future-proof the component library for mobile and additional apps | `@kb/ui` importable in any React app with zero changes |

---

## User Needs

### Primary Persona: Knowledge Worker

- Has 1,000+ files indexed across Google Drive, local folders, and web scrapes
- Spends 40% of their time in KMS searching and reviewing content
- Currently frustrated that clicking a file card shows nothing useful
- Would use the chat interface more if they could see files alongside AI responses

### Secondary Persona: Developer (Solo Build)

- Needs components that are fast to build with, well-documented, and don't require rewrites
- Wants to add a new file type renderer without touching 6 different files
- Wants to build the mobile app later without recreating the entire design system

---

## Business Constraints

| Constraint | Impact |
|------------|--------|
| Solo developer, ~2–6 hrs/day | Drives incremental sprint structure — each sprint must ship independently |
| Free/open-source tools preferred | PDF.js over Adobe PDF Embed; react-pdf for rendering; no paid component libraries |
| No existing design system | Building `@kb/ui` from scratch — Tailwind + shadcn/ui Radix primitives as foundation |
| Dark-first design | All components default dark; no light/dark toggle in MVP |

---

## Assumptions

1. The backend already returns `mimeType` and `storageUrl` on every file object — no API changes needed for Sprint 1.
2. The `kms-api` can add a WebSocket gateway for file status events without major architectural changes (Sprint 2).
3. The RAG service can emit `file_reference` SSE events when it cites a file — minor backend change (Sprint 3).
4. Google Docs Viewer embed is acceptable for DOCX/XLSX/PPTX if the user's browser has internet access (Sprint 4).

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| PDF.js bundle size makes initial load slow | Medium | High | Lazy-load via `next/dynamic`, only load on first PDF encounter |
| WebSocket infra in kms-api is complex to add | Low | Medium | Fallback to 10s polling (RT-04 requirement) |
| `@kb/ui` package wiring in monorepo is brittle | Low | High | Use `tsconfig` path aliases + workspace symlinks; validate in CI |
| Office doc rendering via Google Docs Viewer requires internet | Medium | Medium | mammoth.js as local DOCX fallback; note limitation in UnsupportedFileViewer |

---

## Definition of Done (Business Level)

A sprint is considered "done" from a business perspective when:

1. A user can open any supported file type inline without leaving KMS
2. The feature works in the file browser AND can be rendered in chat (mode prop works)
3. Loading, error, and empty states are handled gracefully — no blank screens
4. The component is exported from `@kb/ui/src/index.ts` and importable by consumers
5. 80% test coverage is met on new code
6. Documentation is updated (PRD status, CONTEXT.md routing, FOR-rendering-engine.md)
