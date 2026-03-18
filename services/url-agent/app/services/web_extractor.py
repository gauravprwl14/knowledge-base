"""Web page content extractor.

Extracts main article text from web pages using trafilatura (production)
or returns mock content (development).

Mock mode is enabled by default (MOCK_WEB=true) so tests pass without
trafilatura or network access.

Production setup:
    pip install trafilatura
    Set MOCK_WEB=false

Example:
    extractor = WebExtractor()
    result = await extractor.extract("https://example.com/article")
    print(result.title, result.text[:200])
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass

import aiohttp
import structlog

from app.config import get_settings
from app.errors import ExtractionError

logger = structlog.get_logger(__name__)
settings = get_settings()


@dataclass
class WebResult:
    """Result from web page content extraction."""

    url: str
    title: str
    text: str              # main article text, stripped of nav/ads/boilerplate
    author: str
    published_date: str


class WebExtractor:
    """Extracts main content from web page URLs.

    Args:
        mock_mode: If True, returns deterministic mock content.
                   Defaults to MOCK_WEB env var.
    """

    def __init__(self, mock_mode: bool | None = None) -> None:
        # Prefer explicit argument; fall back to environment setting
        self._mock = mock_mode if mock_mode is not None else settings.mock_web
        if self._mock:
            logger.warning("WebExtractor running in MOCK mode — content is not real")

    async def extract(self, url: str) -> WebResult:
        """Extract main content from a web page URL.

        Args:
            url: Web page URL to extract from.

        Returns:
            WebResult with title, text, and metadata.

        Raises:
            ExtractionError: If extraction fails.
        """
        if self._mock:
            # Short-circuit — no HTTP requests or trafilatura needed in mock mode
            return self._mock_result(url)

        return await self._extract_real(url)

    async def _extract_real(self, url: str) -> WebResult:
        """Fetch and extract the web page using trafilatura.

        Fetches raw HTML via aiohttp, then uses trafilatura to extract
        the main article content, stripping navigation, ads, and boilerplate.

        Args:
            url: Web page URL.

        Returns:
            WebResult with real extracted content.
        """
        try:
            import trafilatura  # type: ignore  # noqa: F401 — check early
        except ImportError as e:
            raise ExtractionError(
                "trafilatura not installed. Set MOCK_WEB=true or: pip install trafilatura",
                retryable=False,  # permanent — missing dependency
            ) from e

        try:
            # Fetch raw HTML with a generous 30s timeout; identify ourselves politely
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    timeout=aiohttp.ClientTimeout(total=30),
                    headers={"User-Agent": "KMS-url-agent/1.0"},
                ) as resp:
                    if not resp.ok:
                        # HTTP errors are not retryable (4xx) or may be retryable (5xx)
                        retryable = resp.status >= 500
                        raise ExtractionError(
                            f"HTTP {resp.status} for {url}", retryable=retryable
                        )
                    html = await resp.text()

            import trafilatura  # type: ignore

            # trafilatura's main extraction: strips nav, ads, sidebar, footer
            text = (
                trafilatura.extract(
                    html,
                    include_links=False,    # keep text clean — no markdown links
                    include_images=False,   # images can't be indexed as text
                    include_tables=True,    # tables often contain key facts
                )
                or ""
            )

            # Extract structured metadata (title, author, date) separately
            meta = trafilatura.extract_metadata(html)

            return WebResult(
                url=url,
                title=meta.title if meta else url,
                text=text[: settings.max_web_chars],
                author=meta.author if meta else "",
                published_date=str(meta.date) if meta and meta.date else "",
            )
        except ExtractionError:
            raise
        except Exception as e:
            raise ExtractionError(f"trafilatura extraction failed: {e}", retryable=True) from e

    def _mock_result(self, url: str) -> WebResult:
        """Return deterministic mock web content for testing.

        Args:
            url: Original URL (used to vary content deterministically).

        Returns:
            WebResult with mock data and '[MOCK]' suffix in title.
        """
        # Use first 8 hex chars of URL MD5 for reproducible variation
        seed = int(hashlib.md5(url.encode()).hexdigest()[:8], 16) % 2

        MOCK_CONTENT = [
            (
                "Understanding Vector Databases for AI Applications",
                "Qdrant is a vector database optimized for storing and querying high-dimensional embedding vectors. "
                "Unlike traditional databases that use B-tree indexes for exact lookups, vector databases use "
                "Approximate Nearest Neighbour (ANN) algorithms like HNSW to find semantically similar vectors "
                "in milliseconds, even over millions of documents.\n\n"
                "Key features of Qdrant include: payload filtering (filter search results by metadata without "
                "a separate database query), sparse vector support for hybrid dense+sparse search, "
                "and a Rust implementation for high performance with low memory footprint.",
            ),
            (
                "Production LangGraph: Avoiding State Bloat",
                "The most common LangGraph production issue is state bloat. The default add_messages "
                "reducer is append-only, meaning every loop iteration adds messages to state. "
                "In a 10-iteration workflow, the final state contains all 10 iterations' messages — "
                "each LLM call processes an exponentially growing context window.\n\n"
                "The fix: use Pydantic BaseModel instead of TypedDict for state, implement rolling "
                "window reducers that keep only the last N messages, and store file paths instead "
                "of large content blobs in state. With these changes, state size stays constant "
                "regardless of workflow length.",
            ),
        ]

        title, text = MOCK_CONTENT[seed]
        return WebResult(
            url=url,
            title=f"{title} [MOCK]",
            text=text,
            author="Mock Author",
            published_date="2026-03-18",
        )
