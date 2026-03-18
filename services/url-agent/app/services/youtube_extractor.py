"""YouTube transcript extractor.

Extracts transcripts from YouTube videos using yt-dlp (production)
or returns a mock transcript (development/testing).

Mock mode is enabled by default (MOCK_YOUTUBE=true) so the full
url-agent → embed pipeline can be tested without yt-dlp installed.

Production setup:
    pip install yt-dlp
    Set MOCK_YOUTUBE=false

Example:
    extractor = YouTubeExtractor()
    result = await extractor.extract("https://youtube.com/watch?v=dQw4w9WgXcQ")
    print(result.title, result.transcript[:200])
"""
from __future__ import annotations

import asyncio
import hashlib
from dataclasses import dataclass

import structlog

from app.config import get_settings
from app.errors import ExtractionError
from app.utils.url_classifier import UrlClassifier

logger = structlog.get_logger(__name__)
settings = get_settings()


@dataclass
class YouTubeResult:
    """Result from YouTube transcript extraction."""

    video_id: str
    title: str
    transcript: str            # full transcript text, may be truncated by max_transcript_chars
    channel: str
    duration_seconds: int
    url: str


class YouTubeExtractor:
    """Extracts transcripts from YouTube URLs.

    Args:
        mock_mode: If True, returns a deterministic mock transcript.
                   Defaults to MOCK_YOUTUBE env var.
    """

    def __init__(self, mock_mode: bool | None = None) -> None:
        # Prefer explicit argument; fall back to environment setting
        self._mock = mock_mode if mock_mode is not None else settings.mock_youtube
        self._classifier = UrlClassifier()
        if self._mock:
            logger.warning("YouTubeExtractor running in MOCK mode — transcripts are not real")

    async def extract(self, url: str) -> YouTubeResult:
        """Extract transcript from a YouTube URL.

        Args:
            url: YouTube video URL.

        Returns:
            YouTubeResult with title, transcript, and metadata.

        Raises:
            ExtractionError: If extraction fails.
        """
        video_id = self._classifier.extract_video_id(url) or "unknown"

        if self._mock:
            # Short-circuit to mock — no network, no yt-dlp needed
            return self._mock_result(video_id, url)

        return await self._extract_real(url, video_id)

    async def _extract_real(self, url: str, video_id: str) -> YouTubeResult:
        """Use yt-dlp to extract the actual transcript.

        Runs yt-dlp in a thread pool executor because it's a synchronous
        library. Downloads only subtitle/caption data — no video download.

        Args:
            url: YouTube video URL.
            video_id: Pre-extracted video ID.

        Returns:
            YouTubeResult with real transcript data.
        """
        try:
            import yt_dlp  # type: ignore  # noqa: F401 — check availability early
        except ImportError as e:
            raise ExtractionError(
                "yt-dlp not installed. Set MOCK_YOUTUBE=true or: pip install yt-dlp",
                retryable=False,  # permanent — missing dependency, don't retry
            ) from e

        # yt-dlp options: caption/subtitle extraction only, no video binary
        ydl_opts = {
            "writeautomaticsub": True,   # auto-generated captions (YouTube ASR)
            "subtitleslangs": ["en"],    # English only — extend later for i18n
            "skip_download": True,       # critical: no 4 GB video file
            "quiet": True,               # suppress yt-dlp console output
        }

        try:
            # yt-dlp is synchronous; run in a thread so we don't block the event loop
            loop = asyncio.get_event_loop()
            info = await loop.run_in_executor(
                None,
                lambda: self._run_ytdlp(url, ydl_opts),
            )
            transcript = self._flatten_transcript(info.get("subtitles", {}))
            return YouTubeResult(
                video_id=video_id,
                title=info.get("title", "Unknown Title"),
                transcript=transcript[: settings.max_transcript_chars],
                channel=info.get("uploader", "Unknown Channel"),
                duration_seconds=int(info.get("duration", 0)),
                url=url,
            )
        except ExtractionError:
            raise
        except Exception as e:
            raise ExtractionError(f"yt-dlp extraction failed: {e}", retryable=True) from e

    def _run_ytdlp(self, url: str, opts: dict) -> dict:
        """Synchronous yt-dlp call (intended to be run in an executor).

        Args:
            url: YouTube video URL.
            opts: yt-dlp option dictionary.

        Returns:
            yt-dlp info dict with subtitles, title, uploader, duration.
        """
        import yt_dlp  # type: ignore

        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=False) or {}

    def _flatten_transcript(self, subtitles: dict) -> str:
        """Flatten yt-dlp subtitle dict into plain text.

        yt-dlp returns subtitles as a nested dict of language → list of segments,
        each segment having a 'text' key. We join them into a single string.

        Args:
            subtitles: yt-dlp subtitles dict from the info object.

        Returns:
            Plain text transcript, or empty string if no English subtitles.
        """
        # Try the most common English locale codes in order of preference
        for lang in ("en", "en-US", "en-GB"):
            if lang in subtitles:
                entries = subtitles[lang]
                if isinstance(entries, list):
                    return " ".join(
                        e.get("text", "") for e in entries if isinstance(e, dict)
                    )
        return ""

    def _mock_result(self, video_id: str, url: str) -> YouTubeResult:
        """Return a deterministic mock transcript for testing.

        Uses the video_id hash to vary the content slightly so different
        URLs produce different (but reproducible) mock results.

        Args:
            video_id: YouTube video ID.
            url: Original URL (stored in the result for reference).

        Returns:
            YouTubeResult with mock data and '[MOCK]' suffix in title.
        """
        # Use the first 8 hex chars of the MD5 as a reproducible seed
        seed = int(hashlib.md5(video_id.encode()).hexdigest()[:8], 16) % 3

        MOCK_TRANSCRIPTS = [
            (
                "Introduction to Retrieval-Augmented Generation",
                "KMSChannel",
                """In this video, we explore Retrieval-Augmented Generation, commonly known as RAG.
RAG combines the power of large language models with a retrieval system that fetches
relevant documents from a knowledge base before generating an answer.

The key components of a RAG system are:
First, an embedding model that converts documents and queries into vector representations.
We recommend using BAAI/bge-m3 which provides 1024-dimensional dense vectors and supports
over 100 languages.

Second, a vector store like Qdrant that indexes these embeddings and supports fast
approximate nearest neighbour search.

Third, a retriever that queries the vector store with the user's question embedding
and returns the most similar document chunks.

Fourth, a generator — typically a large language model like Claude — that reads the
retrieved chunks and produces a grounded answer.

The main advantage of RAG over pure LLM generation is that it reduces hallucination
by grounding the model's response in actual retrieved documents.""",
            ),
            (
                "Building Agent Workflows with ACP Protocol",
                "AIEngineeringChannel",
                """Today we're building an agentic knowledge management system using the
Agent Client Protocol, or ACP, developed by Zed Industries.

ACP uses JSON-RPC 2.0 over NDJSON and supports two transports: stdio for local processes
and HTTP for distributed systems.

In our KMS architecture, we expose KMS as an ACP server with tools like kms_search,
kms_retrieve, and kms_ingest. External agents like Claude Code connect as ACP clients
and call these tools during their reasoning process.

The key insight is that ACP allows any ACP-compatible agent to use KMS as a
knowledge oracle — without tight coupling to any specific LLM or agent framework.

We also use ACP as a client: KMS can delegate tasks to Claude for generation,
to Codex for code analysis, and to Gemini for multi-modal understanding.
This bidirectional pattern makes KMS a true agent hub.""",
            ),
            (
                "Knowledge Graph Design with Neo4j for AI Applications",
                "GraphDBChannel",
                """Knowledge graphs are powerful structures for representing entities and their
relationships. In this video, we build a knowledge graph using Neo4j that complements
vector search for more nuanced retrieval.

The core idea is to store entity mentions from documents as nodes in Neo4j,
with MENTIONS edges connecting document chunks to entities, and RELATED_TO edges
between related concepts.

When a user asks a question, we don't just look up semantically similar chunks —
we also traverse the knowledge graph to find related entities and their associated
documents. This graph expansion step can surface relevant context that pure vector
search would miss.

For example, if a user asks about 'BGE-M3', vector search finds chunks containing
that term. But graph expansion also finds documents about 'Qdrant' (because BGE-M3
is used with Qdrant in our system) and 'embedding models' in general.

The Leiden community detection algorithm identifies clusters of highly connected
entities, which we use to organise the knowledge base into thematic collections.""",
            ),
        ]

        title, channel, transcript = MOCK_TRANSCRIPTS[seed]
        return YouTubeResult(
            video_id=video_id,
            title=f"{title} [MOCK]",
            transcript=transcript,
            channel=channel,
            duration_seconds=600 + seed * 120,  # vary duration so mocks look realistic
            url=url,
        )
