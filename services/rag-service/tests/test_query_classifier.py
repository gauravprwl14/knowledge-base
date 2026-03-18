"""Tests for QueryClassifier rule-based routing.

Verifies that the regex patterns correctly classify natural language queries
into the expected QueryType, and that min_tier() returns the correct integer.
No mocking required — QueryClassifier is pure Python with no I/O.
"""
import pytest

from app.services.query_classifier import QueryClassifier, QueryType


@pytest.fixture
def classifier():
    """Shared QueryClassifier instance for all tests."""
    return QueryClassifier()


# ---------------------------------------------------------------------------
# Individual QueryType classification tests
# ---------------------------------------------------------------------------


def test_lookup_what_is(classifier):
    """'what is X' should resolve to LOOKUP — the cheapest tier."""
    assert classifier.classify("what is BGE-M3?") == QueryType.LOOKUP


def test_lookup_when(classifier):
    """Temporal fact queries should resolve to LOOKUP."""
    assert classifier.classify("when was this document created?") == QueryType.LOOKUP


def test_lookup_who(classifier):
    """Person fact queries should resolve to LOOKUP."""
    assert classifier.classify("who is the author of the KMS spec?") == QueryType.LOOKUP


def test_generate_blog_post(classifier):
    """Explicit generation request should resolve to GENERATE (Tier 4)."""
    assert classifier.classify("write a blog post about embeddings") == QueryType.GENERATE


def test_generate_draft_article(classifier):
    """'draft an article' is a generation task — never retrieval-only."""
    assert classifier.classify("draft an article about RAG pipelines") == QueryType.GENERATE


def test_generate_summarize_into(classifier):
    """'summarize into' pattern signals generation, not simple retrieval."""
    assert classifier.classify("summarize these notes into a report") == QueryType.GENERATE


def test_synthesize_compare(classifier):
    """Comparison queries need multi-document reasoning → SYNTHESIZE."""
    assert classifier.classify("compare BGE-M3 vs all-MiniLM") == QueryType.SYNTHESIZE


def test_synthesize_difference(classifier):
    """Difference queries require multiple sources → SYNTHESIZE."""
    assert classifier.classify("what is the difference between RAG and fine-tuning?") == QueryType.SYNTHESIZE


def test_synthesize_pros_cons(classifier):
    """Pros-and-cons analysis requires synthesis across sources."""
    assert classifier.classify("pros and cons of using Qdrant over Pinecone") == QueryType.SYNTHESIZE


def test_explain_how_does(classifier):
    """Conceptual 'how does X work' should be EXPLAIN → Tier 2."""
    assert classifier.classify("how does RAG work?") == QueryType.EXPLAIN


def test_explain_why(classifier):
    """'why does X' is conceptual → EXPLAIN."""
    assert classifier.classify("why does chunking size affect retrieval quality?") == QueryType.EXPLAIN


def test_explain_describe(classifier):
    """'describe X' is an explanation request."""
    assert classifier.classify("describe the embedding pipeline") == QueryType.EXPLAIN


def test_find_files(classifier):
    """'find files about' should resolve to FIND → Tier 1 BM25."""
    assert classifier.classify("find files about authentication") == QueryType.FIND


def test_find_search(classifier):
    """'search for' is a FIND intent."""
    assert classifier.classify("search for documents about GDPR") == QueryType.FIND


def test_find_list(classifier):
    """'list' without complex reasoning should be FIND.

    Note: queries containing the word 'all' hit the SYNTHESIZE pattern,
    so this test uses 'list' with a plain object noun to avoid that overlap.
    """
    assert classifier.classify("list markdown files in the vault") == QueryType.FIND


def test_unknown_defaults_to_explain(classifier):
    """Queries with no pattern match should default to EXPLAIN (safe mid-tier)."""
    assert classifier.classify("embedding model") == QueryType.EXPLAIN


def test_empty_string_defaults_to_explain(classifier):
    """Empty input should return EXPLAIN rather than raising an exception."""
    assert classifier.classify("") == QueryType.EXPLAIN


def test_whitespace_only_defaults_to_explain(classifier):
    """Whitespace-only input should return EXPLAIN (treated as empty)."""
    assert classifier.classify("   ") == QueryType.EXPLAIN


# ---------------------------------------------------------------------------
# min_tier() tests
# ---------------------------------------------------------------------------


def test_min_tier_lookup_is_zero(classifier):
    """LOOKUP queries start at Tier 0 (cache check)."""
    assert classifier.min_tier("what is X?") == 0


def test_min_tier_find_is_one(classifier):
    """FIND queries start at Tier 1 (BM25 keyword search)."""
    assert classifier.min_tier("find files about kubernetes") == 1


def test_min_tier_explain_is_two(classifier):
    """EXPLAIN queries start at Tier 2 (hybrid search)."""
    assert classifier.min_tier("how does vector search work?") == 2


def test_min_tier_synthesize_is_three(classifier):
    """SYNTHESIZE queries start at Tier 3 (hybrid + rerank)."""
    assert classifier.min_tier("compare Qdrant vs Weaviate") == 3


def test_min_tier_generate_is_four(classifier):
    """GENERATE queries start at Tier 4 (always requires LLM)."""
    assert classifier.min_tier("write me a summary") == 4


# ---------------------------------------------------------------------------
# Pattern priority tests — GENERATE must win over SYNTHESIZE
# ---------------------------------------------------------------------------


def test_generate_wins_over_synthesize_for_blog(classifier):
    """'create a blog post comparing X and Y' should be GENERATE, not SYNTHESIZE.

    The GENERATE pattern is checked before SYNTHESIZE to prevent mis-classification
    of requests that are generation tasks with comparison language embedded.
    """
    result = classifier.classify("create a blog post comparing Qdrant and Pinecone")
    # This has both generation AND comparison keywords — GENERATE must win.
    assert result == QueryType.GENERATE
