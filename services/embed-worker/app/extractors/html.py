"""HTML text extractor — stdlib html.parser with optional BeautifulSoup fallback."""

import asyncio
from html.parser import HTMLParser
from pathlib import Path

import aiofiles

from app.extractors.base import BaseExtractor


class _StdlibHTMLTextExtractor(HTMLParser):
    """Minimal HTMLParser subclass that strips script/style tags and collects text.

    Attributes:
        _skip: Whether we are currently inside a tag whose content should be skipped.
        _parts: Accumulated text fragments.
    """

    _SKIP_TAGS = {"script", "style", "head", "noscript"}

    def __init__(self) -> None:
        super().__init__()
        self._skip: bool = False
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list) -> None:
        """Mark entry into a skip-worthy tag.

        Args:
            tag: Lower-cased HTML tag name.
            attrs: List of (name, value) attribute pairs.
        """
        if tag in self._SKIP_TAGS:
            self._skip = True

    def handle_endtag(self, tag: str) -> None:
        """Clear skip flag when exiting a skip-worthy tag.

        Args:
            tag: Lower-cased HTML tag name.
        """
        if tag in self._SKIP_TAGS:
            self._skip = False

    def handle_data(self, data: str) -> None:
        """Collect text data that is not inside a skipped tag.

        Args:
            data: Raw text content from the parser.
        """
        if not self._skip:
            stripped = data.strip()
            if stripped:
                self._parts.append(stripped)

    def get_text(self) -> str:
        """Return all collected text joined by newlines.

        Returns:
            Concatenated visible text content.
        """
        return "\n".join(self._parts)


class HtmlExtractor(BaseExtractor):
    """Extract visible text content from HTML and XHTML files.

    Prefers BeautifulSoup (bs4) when available for more robust parsing,
    falling back to the stdlib ``html.parser`` otherwise.  In both cases
    ``<script>`` and ``<style>`` tag contents are stripped before text
    is collected.
    """

    supported_mime_types = [
        "text/html",
        "application/xhtml+xml",
    ]

    async def extract(self, file_path: Path) -> str:
        """Extract visible text from an HTML/XHTML file.

        Args:
            file_path: Path to the HTML file on disk.

        Returns:
            Visible text content with script/style sections removed.
        """
        async with aiofiles.open(file_path, "r", encoding="utf-8", errors="replace") as f:
            raw_html = await f.read()

        return await asyncio.to_thread(self._parse, raw_html)

    def _parse(self, html: str) -> str:
        """Parse HTML and return visible text.

        Tries BeautifulSoup first; falls back to stdlib HTMLParser if bs4
        is not installed.

        Args:
            html: Raw HTML string.

        Returns:
            Extracted visible text.
        """
        try:
            from bs4 import BeautifulSoup

            soup = BeautifulSoup(html, "html.parser")
            for tag in soup(["script", "style", "head", "noscript"]):
                tag.decompose()
            return soup.get_text(separator="\n", strip=True)
        except ImportError:
            parser = _StdlibHTMLTextExtractor()
            parser.feed(html)
            return parser.get_text()
