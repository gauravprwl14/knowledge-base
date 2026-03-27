# Backlog Index

All open backlog items and PRDs awaiting implementation. Updated: 2026-03-23.

---

## Legend

| Field | Values |
|-------|--------|
| Priority | HIGH / MEDIUM / LOW |
| Effort | XS (< 4h) / S (1 day) / M (2–4 days) / L (1–2 weeks) |
| Status | Backlog / In Progress / Done |

---

## Backlog Items

| # | Document | Title | Priority | Effort | Blocks Production? | Status |
|---|----------|-------|----------|--------|--------------------|--------|
| 1 | [PRD-minio-transcript-storage.md](PRD-minio-transcript-storage.md) | MinIO Transcript Storage | HIGH | M (3–4 days) | Yes | Backlog |
| 2 | [BACKLOG-file-deletion-sync.md](BACKLOG-file-deletion-sync.md) | File Deletion Sync (Google Drive) | HIGH | S (1 day) | Yes | Backlog |
| 3 | [BACKLOG-security-hardening.md](BACKLOG-security-hardening.md) | Security Hardening (7 items) | HIGH / MEDIUM | M–L total | Items 1, 3, 6 block prod | Backlog |
| 4 | [BACKLOG-scan-progress-realtime.md](BACKLOG-scan-progress-realtime.md) | Scan Progress Real-Time Updates (SSE) | MEDIUM | M (2–3 days) | No | Backlog |
| 5 | [BACKLOG-image-ocr-production.md](BACKLOG-image-ocr-production.md) | Image OCR in Production (Tesseract) | MEDIUM | XS (2–3 hours) | No | Backlog |
| 6 | [BACKLOG-multimodal-processing.md](BACKLOG-multimodal-processing.md) | Multimodal Processing (Video, Slides, Charts) | LOW | L (2 weeks) | No | Backlog |

---

## Production Gate Checklist

Items that MUST be resolved before any production deployment:

- [ ] **MinIO Transcript Storage** — `PRD-minio-transcript-storage.md` — bloats PostgreSQL with 50 KB+ TEXT per voice file
- [ ] **File Deletion Sync** — `BACKLOG-file-deletion-sync.md` — stale data in search results (deleted files still indexed)
- [ ] **Qdrant Access Control** — `BACKLOG-security-hardening.md` Item 6 — Qdrant unauthenticated by default
- [ ] **Token Encryption Key Rotation** — `BACKLOG-security-hardening.md` Item 3 — static key, no rotation path
- [ ] **Transcript Encryption at Rest** — `BACKLOG-security-hardening.md` Item 1 — transcripts stored unencrypted

---

## Recommended Implementation Order

Given the dependency graph and production gate requirements:

1. **MinIO Transcript Storage** (HIGH, M) — prerequisite for security Item 1; deploy MinIO first
2. **Security: Qdrant Access Control** (HIGH, XS) — quick win, unblock prod
3. **Security: Transcript Encryption at Rest** (HIGH, XS) — quick win once MinIO is deployed
4. **File Deletion Sync** (HIGH, S) — data quality; stale search results affect user trust
5. **Security: Token Key Rotation** (HIGH, M) — complex, but required before handling real OAuth tokens
6. **Image OCR** (MEDIUM, XS) — quick win, fixes silent failure in embed-worker
7. **Scan Progress SSE** (MEDIUM, M) — UX improvement; implement after core pipeline is stable
8. **Security: Rate Limiting** (MEDIUM, S) — pair with ongoing auth work
9. **Security: Audit Log** (MEDIUM, S) — implement alongside MinIO transcript endpoint
10. **Security: PII Detection** (MEDIUM, M) — requires presidio evaluation; do not rush
11. **Security: Secret Scanning CI** (MEDIUM, XS) — add to CI config at any time
12. **Multimodal Processing** (LOW, L) — do NOT start until v1 is stable in production

---

## Notes

- Full PRDs (with user stories, flow diagrams, API contracts) are written for features that are large enough to require architecture decisions. Smaller items use the lighter backlog ticket format.
- Each item should have a sequence diagram written before implementation begins (see `docs/workflow/ENGINEERING_WORKFLOW.md`).
- Run `/task-completion-check` before closing any backlog item.
