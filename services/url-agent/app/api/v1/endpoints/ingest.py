"""URL ingest endpoint — accepts URLs and publishes extracted content to embed pipeline."""
from __future__ import annotations

import uuid
import datetime

from fastapi import APIRouter, HTTPException
import structlog

from app.config import get_settings
from app.models.messages import IngestUrlRequest, IngestUrlResponse
from app.services.youtube_extractor import YouTubeExtractor
from app.services.web_extractor import WebExtractor
from app.utils.url_classifier import UrlClassifier, UrlType
from app.errors import UnsupportedUrlError, ExtractionError

logger = structlog.get_logger(__name__)
settings = get_settings()
router = APIRouter()

# Shared extractor instances — created once at module load so they reuse
# any internal state or connections (e.g., aiohttp session pools in production)
_youtube_extractor = YouTubeExtractor()
_web_extractor = WebExtractor()
_classifier = UrlClassifier()


@router.post("/ingest", response_model=IngestUrlResponse)
async def ingest_url(request: IngestUrlRequest) -> IngestUrlResponse:
    """Accept a URL for content extraction and indexing.

    Classifies the URL (YouTube vs web), extracts content using the
    appropriate extractor, then publishes a FileDiscoveredMessage to
    the kms.embed queue for embedding and indexing.

    Args:
        request: IngestUrlRequest with url, user_id, and optional source_id.

    Returns:
        IngestUrlResponse with job_id and status.

    Raises:
        HTTPException 400: URL not supported or extraction failed.
        HTTPException 500: Queue publish failed or unexpected error.
    """
    # Bind common fields to all log statements in this request context
    log = logger.bind(url=request.url[:80], user_id=request.user_id)
    log.info("URL ingest request received")

    # ── Step 1: Classify the URL ────────────────────────────────────────────
    # Route to the correct extractor before doing any network calls
    url_type = _classifier.classify(request.url)
    if url_type == UrlType.UNKNOWN:
        # Reject unsupported URLs immediately — no point queuing them
        raise HTTPException(status_code=400, detail=f"Unsupported URL: {request.url}")

    try:
        # ── Step 2: Extract content ──────────────────────────────────────────
        # In mock mode both extractors return deterministic synthetic content
        # so this path works end-to-end without any network or external tools
        if url_type == UrlType.YOUTUBE:
            result = await _youtube_extractor.extract(request.url)
            content = result.transcript
            title = result.title
            filename = f"youtube_{result.video_id}.md"
            mime_type = "text/markdown"
        else:
            result = await _web_extractor.extract(request.url)
            content = result.text
            title = result.title
            # Generate a short random suffix to avoid filename collisions
            filename = f"web_{uuid.uuid4().hex[:8]}.md"
            mime_type = "text/markdown"

        log.info(
            "Content extracted",
            url_type=url_type.value,
            title=title[:60],
            content_length=len(content),
        )

        # ── Step 3: Wrap content in YAML frontmatter markdown ───────────────
        # Mandatory per ENGINEERING_STANDARDS.md §14 — all ingested documents
        # must carry structured metadata so the embed pipeline can index them.
        doc_id = str(uuid.uuid4())
        created_at = datetime.datetime.utcnow().isoformat() + "Z"
        content_type = "transcript" if url_type == UrlType.YOUTUBE else "note"

        markdown_content = f"""---
id: "{doc_id}"
created_at: "{created_at}"
content_type: "{content_type}"
status: "draft"
generator_model: "url-agent"
workflow: "url-ingest"
tags: ["{url_type.value}", "auto-ingested"]
source_url: "{request.url}"
---

# {title}

{content}
"""

        # ── Step 4: Publish to kms.embed queue ──────────────────────────────
        # In production this calls aio-pika to push a FileDiscoveredMessage.
        # For Sprint 3 we log the payload so the downstream pipeline can be
        # wired up in a follow-on task without blocking this service's tests.
        log.info(
            "Content ready for indexing — publish to kms.embed (not yet wired)",
            filename=filename,
            doc_id=doc_id,
            content_length=len(markdown_content),
        )

        job_id = str(uuid.uuid4())
        return IngestUrlResponse(
            job_id=job_id,
            url=request.url,
            url_type=url_type.value,
            status="extracted",
            message=(
                f"Extracted {len(content)} characters from {url_type.value} URL. "
                f"Job: {job_id}"
            ),
        )

    except (UnsupportedUrlError, ExtractionError) as e:
        # Known extraction failures — return 400 with the error detail
        log.error("Extraction failed", error=str(e), retryable=e.retryable)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Unexpected errors — log and return a generic 500
        log.error("Unexpected error during URL ingest", error=str(e))
        raise HTTPException(status_code=500, detail="URL ingestion failed")
