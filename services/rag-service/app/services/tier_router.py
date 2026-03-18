"""Tier Router — executes the appropriate retrieval tier for a query.

Routes through tiers from cheapest to most expensive, short-circuiting
when a tier returns results above the confidence threshold.

ADR-0024: Tiered retrieval — ~90% of queries resolved without LLM call.

Tier thresholds:
    Tier 0 (cache):  Redis exact match
    Tier 1 (BM25):   Score >= 0.9 → return immediately
    Tier 2 (hybrid): Score >= 0.8 → return immediately
    Tier 3 (hybrid+rerank): Always returns results (min tier for SYNTHESIZE)
    Tier 4 (LLM):    LLM Guard must permit; used only for SYNTHESIZE/GENERATE
"""
from __future__ import annotations

import time
from typing import Optional

import aiohttp
import structlog

from app.config import get_settings
from app.services.query_classifier import MIN_TIER, QueryClassifier, QueryType

logger = structlog.get_logger(__name__)
settings = get_settings()

# Score thresholds for early exit at each tier.
# If the top result's score exceeds the threshold, return without going deeper.
TIER_THRESHOLDS = {
    1: 0.9,   # Tier 1 BM25: very high confidence → no need for vector search
    2: 0.8,   # Tier 2 hybrid: high confidence → no need for graph/rerank
    3: 0.0,   # Tier 3: always proceed with results (no threshold — return what we have)
}


class SearchResult:
    """A single search result from any retrieval tier.

    Attributes:
        file_id: UUID of the parent file.
        filename: Original filename for display.
        snippet: Short excerpt of the matching content.
        score: Relevance score in [0, 1].
        chunk_index: Ordinal position of the chunk within the file.
        source_id: UUID of the source that owns this file.
    """

    def __init__(
        self,
        file_id: str,
        filename: str,
        snippet: str,
        score: float,
        chunk_index: int = 0,
        source_id: str = "",
    ) -> None:
        self.file_id = file_id
        self.filename = filename
        self.snippet = snippet
        self.score = score
        self.chunk_index = chunk_index
        self.source_id = source_id

    def to_dict(self) -> dict:
        """Serialise to a plain dict for JSON responses.

        Returns:
            dict: All attributes as a flat dictionary.
        """
        return {
            "file_id": self.file_id,
            "filename": self.filename,
            "snippet": self.snippet,
            "score": self.score,
            "chunk_index": self.chunk_index,
            "source_id": self.source_id,
        }


class TierRouter:
    """Routes a search query through tiers, short-circuiting at confidence thresholds.

    Args:
        search_api_url: Base URL for the search-api service.
        classifier: QueryClassifier instance for determining starting tier.

    Example:
        router = TierRouter()
        result = await router.route("what is BGE-M3?", user_id="user-001")
        print(result.tier_used, result.results)
    """

    def __init__(
        self,
        search_api_url: Optional[str] = None,
        classifier: Optional[QueryClassifier] = None,
    ) -> None:
        # Strip trailing slash once; reuse across all requests for performance.
        self._search_api = (search_api_url or settings.search_api_url).rstrip("/")
        self._classifier = classifier or QueryClassifier()

    async def route(
        self,
        query: str,
        user_id: str,
        limit: int = 10,
        source_ids: Optional[list[str]] = None,
    ) -> "RoutingResult":
        """Route a query through retrieval tiers and return the best results.

        Starts at the minimum tier for the query type and escalates until
        either a confidence threshold is met or Tier 3 is exhausted.
        Tier 4 (LLM) is NOT triggered here — the caller (LLM Guard) decides.

        Args:
            query: User's natural language query.
            user_id: Authenticated user UUID for result scoping.
            limit: Maximum number of results to return.
            source_ids: Optional list of source UUIDs to filter by.

        Returns:
            RoutingResult with results, tier_used, took_ms, and llm_needed flag.
        """
        start = time.monotonic()
        query_type = self._classifier.classify(query)
        min_tier = MIN_TIER[query_type]

        log = logger.bind(
            query=query[:80],
            user_id=user_id,
            query_type=query_type.value,
            min_tier=min_tier,
        )
        log.info("TierRouter starting")

        results: list[SearchResult] = []
        # Default tier_used to min_tier; will be updated as we escalate.
        tier_used = min_tier

        # Escalate through tiers until we have results or reach Tier 3.
        # Tier 0 (Redis cache) is handled separately outside this loop.
        # We start from whichever is larger: the query's min_tier or Tier 1
        # (since Tier 0/cache has no search-api equivalent here).
        for tier in range(max(min_tier, 1), 4):
            tier_used = tier
            # Tier 1 = keyword-only BM25; Tier 2+ = hybrid (BM25 + vector)
            mode = "keyword" if tier == 1 else "hybrid"
            results = await self._call_search_api(query, user_id, mode, limit, source_ids)

            if results:
                top_score = results[0].score
                threshold = TIER_THRESHOLDS.get(tier, 0.0)
                log.info(
                    "Tier search completed",
                    tier=tier,
                    mode=mode,
                    result_count=len(results),
                    top_score=round(top_score, 3),
                    threshold=threshold,
                )
                # Short-circuit: if the top result's score clears the tier threshold,
                # there is no benefit in running a more expensive tier.
                if top_score >= threshold:
                    log.info("Confidence threshold met — short-circuiting", tier=tier)
                    break
            else:
                # No results at this tier — escalate to the next tier
                log.info("Tier returned no results — escalating", tier=tier)

        took_ms = (time.monotonic() - start) * 1000

        # LLM is needed if:
        # (a) query type inherently requires synthesis/generation, OR
        # (b) retrieval returned nothing or very low-confidence results.
        llm_needed = query_type in (QueryType.SYNTHESIZE, QueryType.GENERATE) or (
            not results or results[0].score < 0.5
        )

        log.info(
            "TierRouter completed",
            tier_used=tier_used,
            result_count=len(results),
            llm_needed=llm_needed,
            took_ms=round(took_ms, 1),
        )
        return RoutingResult(
            results=results,
            tier_used=tier_used,
            query_type=query_type,
            llm_needed=llm_needed,
            took_ms=took_ms,
        )

    async def _call_search_api(
        self,
        query: str,
        user_id: str,
        mode: str,
        limit: int,
        source_ids: Optional[list[str]],
    ) -> list[SearchResult]:
        """Call the search-api and parse results.

        Falls back to empty list if search-api is unreachable (graceful degradation).
        The caller will escalate to the next tier or mark llm_needed=True as appropriate.

        Args:
            query: Search query string.
            user_id: User UUID for result scoping.
            mode: Search mode — 'keyword' or 'hybrid'.
            limit: Max results to return.
            source_ids: Optional source filter.

        Returns:
            List of SearchResult objects ordered by score descending.
        """
        params: dict = {"q": query, "mode": mode, "limit": limit}
        if source_ids:
            # Comma-join because query param arrays have inconsistent browser support
            params["source_ids"] = ",".join(source_ids)

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self._search_api}/search",
                    params=params,
                    headers={"x-user-id": user_id},
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    if not resp.ok:
                        logger.warning(
                            "search-api returned non-2xx",
                            status=resp.status,
                            mode=mode,
                        )
                        # Return empty rather than raising — caller will escalate tier
                        return []
                    data = await resp.json()
                    return [
                        SearchResult(
                            file_id=r.get("fileId", ""),
                            filename=r.get("filename", ""),
                            snippet=r.get("snippet", ""),
                            score=float(r.get("score", 0)),
                            chunk_index=r.get("chunkIndex", 0),
                            source_id=r.get("sourceId", ""),
                        )
                        for r in data.get("results", [])
                    ]
        except (aiohttp.ClientError, TimeoutError) as e:
            # Log and swallow — tiered routing is designed for graceful degradation
            logger.warning("search-api unreachable", error=str(e), mode=mode)
            return []


class RoutingResult:
    """Output of TierRouter.route().

    Attributes:
        results: Ordered list of search results (score descending).
        tier_used: The tier number at which the final results were obtained.
        query_type: Classified query type from QueryClassifier.
        llm_needed: True if LLM should be consulted (LLMGuard makes final decision).
        took_ms: Wall-clock latency of the full routing pass in milliseconds.
    """

    def __init__(
        self,
        results: list[SearchResult],
        tier_used: int,
        query_type: QueryType,
        llm_needed: bool,
        took_ms: float,
    ) -> None:
        self.results = results
        self.tier_used = tier_used
        self.query_type = query_type
        self.llm_needed = llm_needed
        self.took_ms = took_ms
