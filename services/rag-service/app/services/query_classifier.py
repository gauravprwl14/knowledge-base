"""Query Classifier — rule-based routing, zero LLM calls, ~5ms latency.

Classifies queries into types that determine which retrieval tier to use.
Uses regex patterns and keyword matching — no external dependencies.

ADR-0024: Tiered retrieval response design.

Query types and their routing:
    LOOKUP:     Direct fact lookup → Tier 1 (BM25 sufficient)
    FIND:       Search for specific items → Tier 1-2
    EXPLAIN:    Conceptual explanation → Tier 2-3
    SYNTHESIZE: Multi-document synthesis → Tier 3-4 (may need LLM)
    GENERATE:   Content generation → Tier 4 (always needs LLM)
"""
from __future__ import annotations

import re
from enum import Enum

import structlog

logger = structlog.get_logger(__name__)


class QueryType(str, Enum):
    """Query type determines minimum retrieval tier required."""

    LOOKUP = "lookup"        # "what is X", "when was X", "who made X" → fast
    FIND = "find"            # "find files about X", "list all X" → BM25
    EXPLAIN = "explain"      # "how does X work", "explain X" → hybrid
    SYNTHESIZE = "synthesize"  # "compare X and Y", "what are the differences" → may need LLM
    GENERATE = "generate"    # "write a blog post", "summarize into" → always LLM


# Minimum tier per query type.
# Tier 0=cache, 1=BM25, 2=hybrid, 3=hybrid+rerank, 4=LLM
MIN_TIER: dict[QueryType, int] = {
    QueryType.LOOKUP: 0,
    QueryType.FIND: 1,
    QueryType.EXPLAIN: 2,
    QueryType.SYNTHESIZE: 3,
    QueryType.GENERATE: 4,
}

# Pattern → QueryType. Checked in order — first match wins.
# Patterns are case-insensitive and use word boundaries where relevant.
PATTERNS: list[tuple[str, QueryType]] = [
    # GENERATE patterns — must check before SYNTHESIZE to avoid mis-classification
    (
        r"\b(write|generate|create|draft|compose|make me)\b.*\b(blog|post|summary|article|essay|note|document)\b",
        QueryType.GENERATE,
    ),
    (r"\b(summarize|summarise)\b.*\b(into|as a|to a)\b", QueryType.GENERATE),

    # SYNTHESIZE — multi-source reasoning
    (
        r"\b(compare|contrast|difference|similarities|pros and cons|tradeoff|vs\.?|versus)\b",
        QueryType.SYNTHESIZE,
    ),
    (
        r"\b(what are the|list all|give me all|show me all)\b.*\b(ways|methods|options|approaches)\b",
        QueryType.SYNTHESIZE,
    ),
    (r"\b(overall|across|all|everything|comprehensive)\b", QueryType.SYNTHESIZE),

    # EXPLAIN — conceptual questions
    (
        r"\b(how does|how do|explain|why does|why is|what makes|describe)\b",
        QueryType.EXPLAIN,
    ),
    (
        r"\b(what is the difference|what are the|how would you|can you explain)\b",
        QueryType.EXPLAIN,
    ),

    # FIND — search/list patterns
    (
        r"\b(find|search|look for|locate|show me|list|which files|what files)\b",
        QueryType.FIND,
    ),

    # LOOKUP — simple fact retrieval (check last — most specific pattern)
    (
        r"\b(what is|what was|what are|who is|who was|when|where|which)\b",
        QueryType.LOOKUP,
    ),
]

# Compiled patterns for performance — compiled once at import time.
_COMPILED = [(re.compile(p, re.IGNORECASE), t) for p, t in PATTERNS]


class QueryClassifier:
    """Classifies a natural language query into a QueryType.

    Uses rule-based regex matching — no LLM, no network calls.
    Falls back to EXPLAIN when no pattern matches.

    Example:
        classifier = QueryClassifier()
        qtype = classifier.classify("what embedding model does KMS use?")
        # → QueryType.LOOKUP
    """

    def classify(self, query: str) -> QueryType:
        """Classify a query string into a QueryType.

        Args:
            query: Raw user query string.

        Returns:
            QueryType determining the minimum retrieval tier.
        """
        query_stripped = query.strip()
        # Empty queries get a safe mid-tier default to avoid crashing downstream
        if not query_stripped:
            return QueryType.EXPLAIN

        for pattern, qtype in _COMPILED:
            if pattern.search(query_stripped):
                logger.debug(
                    "Query classified",
                    query=query_stripped[:80],
                    type=qtype.value,
                    pattern=pattern.pattern[:50],
                )
                return qtype

        # No pattern matched → default to EXPLAIN (mid-tier, safe for unknown queries)
        logger.debug("Query unmatched — defaulting to EXPLAIN", query=query_stripped[:80])
        return QueryType.EXPLAIN

    def min_tier(self, query: str) -> int:
        """Return the minimum retrieval tier for the query.

        Args:
            query: Raw user query string.

        Returns:
            Integer tier 0-4.
        """
        return MIN_TIER[self.classify(query)]
