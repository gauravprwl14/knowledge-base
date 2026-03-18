"""Markdown text extractor — returns raw markdown content."""

import aiofiles
from pathlib import Path

from app.extractors.base import BaseExtractor


class MarkdownExtractor(BaseExtractor):
    """Extract text from Markdown files.

    Returns the raw Markdown content. Markdown syntax is preserved because
    the downstream chunker handles the text as-is, and stripping syntax
    (e.g. ``#``, ``*``, ``_``) can discard structural meaning.
    """

    supported_mime_types = [
        "text/markdown",
        "text/x-markdown",
    ]

    async def extract(self, file_path: Path) -> str:
        """Return the raw contents of a Markdown file as a string.

        Args:
            file_path: Path to the Markdown file on disk.

        Returns:
            Raw file contents as a UTF-8 string.
        """
        async with aiofiles.open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return await f.read()
