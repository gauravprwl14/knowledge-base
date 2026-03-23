# Backlog: Image OCR in Production

**Type**: Bug / Silent Failure Fix
**Priority**: MEDIUM
**Effort**: XS (2–3 hours)
**Status**: Backlog — not started
**Created**: 2026-03-23

---

## Problem

`ImageExtractor` exists in `services/embed-worker/` and is wired up to handle PNG, JPEG, WebP, GIF, and TIFF files via Tesseract OCR + Pillow. However, **Tesseract is not installed in the embed-worker Docker image**. As a result:

- `pytesseract` import succeeds (the Python package is installed)
- OCR calls silently return empty strings or raise a `TesseractNotFoundError` that is swallowed
- Image files are indexed with zero extracted text — they appear in the knowledge base but produce no search results

This is a silent failure: no error is surfaced to the user, no log message indicates that OCR was skipped, and the file appears to be processed successfully.

---

## Current State

| Component | State |
|-----------|-------|
| `ImageExtractor` class | Exists, logic correct |
| `pytesseract` pip package | Listed in requirements but possibly missing |
| `Pillow` pip package | Listed in requirements but possibly missing |
| `tesseract-ocr` system binary | NOT installed in Docker image |
| `libtesseract-dev` system library | NOT installed in Docker image |
| Feature flag | None — OCR is always attempted, always fails silently |

---

## Required Changes

### 1. embed-worker Dockerfile

Add system package installation before the Python dependency install step:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libtesseract-dev \
    && rm -rf /var/lib/apt/lists/*
```

### 2. embed-worker requirements.txt

Confirm the following are present (add if missing):

```
pytesseract>=0.3.10
Pillow>=10.0.0
```

### 3. Feature flag

Add to `.kms/config.json`:

```json
{
  "features": {
    "imageOcr": {
      "enabled": false,
      "description": "Enable Tesseract OCR for image file extraction. Set true only after verifying Tesseract is installed in the embed-worker image."
    }
  }
}
```

Default `false` until the Docker image rebuild is confirmed and tested with a real PNG file.

### 4. Structured logging

Add a log event in `ImageExtractor` when OCR is skipped due to the feature flag, and when OCR completes (log character count extracted).

---

## Acceptance Criteria

- [ ] embed-worker Docker image builds successfully with `tesseract-ocr` installed
- [ ] `pytesseract` and `Pillow` confirmed in `requirements.txt`
- [ ] `ENABLE_IMAGE_OCR` / `imageOcr.enabled` feature flag added to `.kms/config.json` defaulting to `false`
- [ ] Manual test: upload a PNG file with readable text, verify extracted text is non-empty after re-embedding
- [ ] Log event emitted when OCR runs (character count) and when skipped (flag disabled)
- [ ] No silent empty-string returns — if Tesseract binary is missing and flag is enabled, raise a loud error

---

## Test

Manual test procedure (after Docker rebuild):

```bash
# 1. Enable flag
# Edit .kms/config.json: "imageOcr": { "enabled": true }

# 2. Drop a test image into a synced source folder
# (PNG with visible text, e.g., a screenshot)

# 3. Trigger embed-worker scan
# Watch logs for: "ocr_extracted_chars": N (should be > 0)

# 4. Search for a word that appears in the image text
# Should return the image file as a result
```

---

## Related

- `services/embed-worker/` — `ImageExtractor` class
- `PRD-M03-content-extraction.md` — content extraction pipeline
- `BACKLOG-multimodal-processing.md` — future vision model OCR (this ticket is the prerequisite)
- `.kms/config.json` — feature flags runtime config
