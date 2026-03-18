"""YAML frontmatter builder for ingested URL content.

Produces YAML-frontmatted markdown that the embed pipeline can parse to
extract structured metadata (id, source URL, content type, etc.) alongside
the raw document text.

Example:
    markdown = build_frontmatted_markdown(
        job_id="abc-123",
        url="https://youtube.com/watch?v=dQw4w9WgXcQ",
        url_type="youtube",
        content_data={"title": "My Video", "content": "Transcript text..."},
    )
"""
from __future__ import annotations

from datetime import datetime, timezone

import structlog

logger = structlog.get_logger(__name__)


def build_yaml_frontmatter(title: str, url: str, content_type: str) -> str:
    """Build a minimal YAML frontmatter block (no body) for a URL-sourced document.

    Useful when callers only need the frontmatter string without the full
    markdown body — e.g., for inserting into a pre-existing document template.

    Args:
        title: Human-readable title of the document (video title or page title).
        url: Original source URL from which content was extracted.
        content_type: Logical content type — "transcript" for YouTube, "note" for web.

    Returns:
        YAML frontmatter string including opening and closing ``---`` delimiters.
    """
    # Timestamp is always UTC so downstream indexing can sort consistently
    now = datetime.now(timezone.utc).isoformat()

    # Escape any double-quotes in user-supplied strings so YAML stays valid
    safe_title = title.replace('"', '\\"')
    safe_url = url.replace('"', '\\"')

    # Build the frontmatter block — fields match the KMS embed pipeline schema
    frontmatter = (
        f'---\n'
        f'created_at: "{now}"\n'
        f'content_type: "{content_type}"\n'
        f'status: "ingested"\n'
        f'generator_model: "url-agent-v1"\n'
        f'source_url: "{safe_url}"\n'
        f'url_type: "{content_type}"\n'
        f'title: "{safe_title}"\n'
        f'---'
    )

    return frontmatter


def build_frontmatted_markdown(
    job_id: str,
    url: str,
    url_type: str,
    content_data: dict,
) -> str:
    """Build a complete YAML-frontmatted markdown document from extracted content.

    Combines a YAML frontmatter header with the document body so the embed
    pipeline receives a single self-describing artefact. All metadata fields
    required by ``ENGINEERING_STANDARDS.md §14`` are included.

    Args:
        job_id: UUID string for this ingestion job — used as the document ``id``.
        url: Original source URL from which content was extracted.
        url_type: Classified URL type — ``"youtube"`` or ``"web"``.
        content_data: Dict with at minimum ``"title"`` and ``"content"`` keys.
                      May also include ``"channel"``, ``"duration_seconds"`` etc.

    Returns:
        Full markdown string with YAML frontmatter header and document body.
    """
    # Extract fields from content_data with safe defaults
    title = content_data.get("title", "Untitled")
    content = content_data.get("content", "")

    # Map url_type to human-readable content_type for embed pipeline metadata
    content_type = "transcript" if url_type == "youtube" else "note"

    # Generate timestamp once so frontmatter and log share the same value
    now = datetime.now(timezone.utc).isoformat()

    # Escape double-quotes so YAML values remain well-formed
    safe_title = title.replace('"', '\\"')
    safe_url = url.replace('"', '\\"')

    # Build YAML frontmatter — id ties this markdown to the job for status polling
    frontmatter_lines = (
        f'---\n'
        f'id: "{job_id}"\n'
        f'created_at: "{now}"\n'
        f'content_type: "{content_type}"\n'
        f'status: "ingested"\n'
        f'generator_model: "url-agent-v1"\n'
        f'source_url: "{safe_url}"\n'
        f'url_type: "{url_type}"\n'
        f'title: "{safe_title}"\n'
        f'---'
    )

    # Assemble the full document: frontmatter + H1 heading + body content
    markdown = f"{frontmatter_lines}\n\n# {title}\n\n{content}\n"

    logger.debug(
        "Built frontmatted markdown",
        job_id=job_id,
        url_type=url_type,
        title=title[:60],
        content_length=len(markdown),
    )

    return markdown
