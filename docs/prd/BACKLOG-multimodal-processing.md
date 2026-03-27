# Backlog: Multimodal Processing (Future)

**Type**: Future Feature — Tracking Only
**Priority**: LOW (backlog)
**Effort**: L (2 weeks)
**Status**: Backlog — do NOT implement in v1
**Created**: 2026-03-23

---

## Overview

This ticket tracks future work to extract semantic meaning from non-text content: video frames, embedded document images, charts, diagrams, and slide decks. None of this should be implemented until the core text extraction, embedding, and search pipeline is stable in production.

The prerequisite for all items in this ticket is that `BACKLOG-image-ocr-production.md` is complete (Tesseract OCR working in the embed-worker Docker image).

---

## Scope

**In scope (future):**
- Video keyframe extraction + image captioning using a vision model
- Slide extraction from PowerPoint (.pptx) and Keynote (.key) files
- Chart and diagram understanding from PDFs with embedded images
- Scene description embedding for video files (to make video content searchable)

**Out of scope for v1:** All items below. Do not implement. Track only.

---

## Feature Breakdown

### 1. Video Keyframe Extraction + Captioning

**Goal:** Make video files searchable by their visual content.

**Approach:**
- Use `ffmpeg` or `opencv-python` to extract keyframes at regular intervals (e.g., every 30 seconds)
- Send keyframe images to a vision model (Claude claude-haiku-4-5 vision API or local LLaVA via Ollama) for caption generation
- Concatenate captions into a single document for embedding
- Store captions in `kms_chunks` with `content_type = 'video_caption'`

**Dependencies:**
- `ffmpeg` in embed-worker Docker image
- Vision model API access (Claude claude-haiku-4-5 costs money per frame; LLaVA is free but lower quality)
- Decision pending: cloud vision API vs local LLaVA

### 2. Slide Extraction from PowerPoint / Keynote

**Goal:** Extract text AND visual content from presentation files.

**Approach:**
- For `.pptx`: use `python-pptx` to extract text per slide + export slide images via LibreOffice headless
- For `.key`: limited support; may require conversion via LibreOffice or iWork export
- Each slide image captioned by vision model
- Per-slide text + captions concatenated for embedding

**Dependencies:**
- LibreOffice headless in embed-worker Docker image (large, ~200 MB)
- `python-pptx` pip package
- Vision model for slide image captioning

### 3. Chart and Diagram Understanding from PDFs

**Goal:** Extract meaning from charts, graphs, and diagrams embedded in PDF files.

**Approach:**
- Current PDF extractor (`pdfplumber` / `PyMuPDF`) extracts text but not embedded images
- Enhance PDF extractor to detect image regions and extract them
- Pass extracted images to vision model for description
- Append descriptions to the chunk text for the surrounding page

**Dependencies:**
- Vision model API access
- `PyMuPDF` (already likely present) image extraction capability

### 4. Scene Description Embedding for Video

**Goal:** Index video files so users can search "meeting where Alice discussed the Q3 roadmap" and find the correct video segment.

**Approach:**
- Extend video keyframe captioning (item 1) to include scene-level summaries
- Generate a per-scene embedding in addition to per-file embedding
- Store scene timestamps + descriptions as separate chunks with `content_type = 'video_scene'`
- Search results for video files show timestamp + scene description snippet

**Dependencies:**
- Item 1 (keyframe extraction) must be complete first
- Chunk schema must support `start_time_ms` and `end_time_ms` fields

---

## Decision Points (Resolve Before Implementation)

| # | Question | Options |
|---|---------|---------|
| 1 | Vision model: cloud vs local? | Claude claude-haiku-4-5 vision (cost per call), LLaVA via Ollama (free, slower, lower quality) |
| 2 | Video captioning granularity? | Per-keyframe (fine, expensive), Per-scene-segment (coarse, cheaper) |
| 3 | Embed-worker image size budget? | Adding ffmpeg + LibreOffice could add 400–600 MB to image size |
| 4 | Separate multimodal-worker service or extend embed-worker? | Extend embed-worker (simpler), New service (cleaner separation) |

---

## Prerequisites (must be done first)

1. `BACKLOG-image-ocr-production.md` — Tesseract OCR working
2. Core search pipeline stable in production
3. Vision model budget approved (if using Claude API)
4. Docker image size budget reviewed

---

## Related

- `BACKLOG-image-ocr-production.md` — immediate predecessor (Tesseract OCR)
- `PRD-M03-content-extraction.md` — base content extraction pipeline
- `PRD-M04-embedding-pipeline.md` — embedding pipeline this extends
- `services/embed-worker/` — where new extractors would live
