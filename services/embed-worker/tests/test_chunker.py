"""Tests for the text chunker."""

import pytest

from app.chunkers.text_chunker import chunk_text


def test_chunk_empty_string_returns_empty_list():
    """chunk_text with empty input should return an empty list."""
    result = chunk_text("")
    assert result == []


def test_chunk_whitespace_only_returns_empty_list():
    """chunk_text with whitespace-only input should return an empty list."""
    result = chunk_text("   \n\t  ")
    assert result == []


def test_chunk_short_text_returns_single_chunk():
    """Text shorter than chunk_size should produce exactly one chunk."""
    short_text = "Hello world, this is a short sentence."
    result = chunk_text(short_text)
    assert len(result) == 1
    assert result[0].chunk_index == 0
    assert short_text.strip() in result[0].text or result[0].text in short_text.strip()


def test_chunk_long_text_returns_multiple_chunks():
    """Text much longer than chunk_size should be split into multiple chunks."""
    # Generate text well over the default 512-char chunk size
    long_text = " ".join(["word"] * 500)  # ~2500 chars
    result = chunk_text(long_text)
    assert len(result) > 1
    # Chunks should be indexed sequentially
    for i, chunk in enumerate(result):
        assert chunk.chunk_index == i


def test_chunks_have_overlap():
    """Adjacent chunks should share some text due to the overlap window."""
    # Build text long enough for 2+ chunks with overlap
    long_text = " ".join([f"token{i}" for i in range(300)])
    result = chunk_text(long_text)

    assert len(result) >= 2, "Need at least 2 chunks to test overlap"

    # The end of chunk[0] and the beginning of chunk[1] should share words
    first_words = set(result[0].text.split())
    second_words = set(result[1].text.split())
    shared = first_words & second_words
    assert len(shared) > 0, "Adjacent chunks should share overlapping tokens"


def test_chunk_preserves_text_content():
    """All words from the original text should appear in at least one chunk."""
    text = "alpha beta gamma delta epsilon zeta eta theta iota kappa " * 30
    result = chunk_text(text)
    combined = " ".join(c.text for c in result)
    for word in ["alpha", "gamma", "kappa"]:
        assert word in combined


def test_chunk_token_count_is_set():
    """Each chunk should have a non-negative token_count."""
    text = "The quick brown fox jumps over the lazy dog. " * 20
    result = chunk_text(text)
    for chunk in result:
        assert chunk.token_count is not None
        assert chunk.token_count >= 0
