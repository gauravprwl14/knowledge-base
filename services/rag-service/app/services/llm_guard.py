"""LLM Guard — decides whether an LLM call is warranted.

Prevents unnecessary Claude API calls for queries that retrieval alone
can answer. The guard checks:
1. Is query type GENERATE or SYNTHESIZE? (always needs LLM)
2. Did retrieval return high-confidence results? (score > 0.85 → skip LLM)
3. Is LLM available? (falls back gracefully if Claude API unreachable)

ADR-0024: ~90% of queries resolved without LLM call.
"""
from __future__ import annotations

import structlog

from app.services.query_classifier import QueryType
from app.services.tier_router import RoutingResult

logger = structlog.get_logger(__name__)

# Score threshold: if the top result exceeds this, retrieval alone is sufficient
# for LOOKUP/FIND/EXPLAIN queries — no LLM needed.
HIGH_CONFIDENCE_THRESHOLD = 0.85


class LLMGuard:
    """Decides whether an LLM call should be made for a given routing result.

    Args:
        llm_available: Whether an LLM (Claude/Ollama) is reachable.
                       Defaults to True — guard will be checked at call time.

    Example:
        guard = LLMGuard(llm_available=bool(settings.anthropic_api_key))
        if guard.should_call_llm(routing_result):
            answer = await llm.complete(...)
        else:
            answer = format_direct_results(routing_result.results)
    """

    def __init__(self, llm_available: bool = True) -> None:
        self._llm_available = llm_available

    def should_call_llm(self, result: RoutingResult) -> bool:
        """Determine whether an LLM call is needed for this routing result.

        Decision logic:
        - GENERATE queries always need LLM (user asked for generation)
        - SYNTHESIZE queries always need LLM (multi-doc reasoning required)
        - LOOKUP/FIND/EXPLAIN with high-confidence results (score > 0.85) → skip LLM
        - LOOKUP/FIND/EXPLAIN with low-confidence results → use LLM if available
        - No results found → use LLM if available to explain the gap

        Args:
            result: RoutingResult from TierRouter containing results and metadata.

        Returns:
            True if an LLM call should be made, False to return retrieval results directly.
        """
        # Generation tasks always need LLM — no amount of retrieval alone suffices
        if result.query_type in (QueryType.GENERATE, QueryType.SYNTHESIZE):
            if not self._llm_available:
                # Degrade gracefully: warn and return retrieval results rather than error
                logger.warning(
                    "LLM needed for GENERATE/SYNTHESIZE but not available — returning retrieval results",
                    query_type=result.query_type.value,
                )
                return False
            return True

        # No results at all: LLM can explain the gap ("I couldn't find anything on X")
        if not result.results:
            decision = self._llm_available
            logger.info("No retrieval results — LLM decision", call_llm=decision)
            return decision

        # High-confidence result: the top chunk answers the question directly;
        # no LLM synthesis needed (~70-80% of real LOOKUP/FIND/EXPLAIN queries)
        top_score = result.results[0].score
        if top_score >= HIGH_CONFIDENCE_THRESHOLD:
            logger.info(
                "High-confidence result — skipping LLM",
                top_score=round(top_score, 3),
                threshold=HIGH_CONFIDENCE_THRESHOLD,
            )
            return False

        # Moderate confidence: the top result may partially answer the question;
        # use LLM to synthesise a more complete answer if the provider is reachable.
        logger.info(
            "Moderate confidence — LLM decision",
            top_score=round(top_score, 3),
            llm_available=self._llm_available,
            call_llm=self._llm_available,
        )
        return self._llm_available
