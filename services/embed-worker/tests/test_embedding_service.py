"""Unit tests for EmbeddingService mock mode.

These tests verify the mock embedding behaviour without requiring the BGE-M3
model to be downloaded.  They run in CI with no external dependencies.

Test coverage
-------------
- Correct output shape (1024 dims per text)
- Determinism (same text → same vector across calls)
- Distinctness (different texts → different vectors)
- Empty-list fast path
- encode_batch alias works identically to embed()
- L2 normalisation: each mock vector should be a unit vector
"""

import math

import pytest

from app.services.embedding_service import EmbeddingService, EMBEDDING_DIMS


# ---------------------------------------------------------------------------
# Output shape
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mock_embed_returns_1024_dims():
    """embed() should return exactly one 1024-dimensional vector per input text."""
    svc = EmbeddingService(mock_mode=True)
    result = await svc.embed(["hello world"])
    # One vector per input text
    assert len(result) == 1
    # Each vector must be 1024-dimensional (BGE-M3 dense output)
    assert len(result[0]) == EMBEDDING_DIMS


@pytest.mark.asyncio
async def test_mock_embed_multiple_texts_returns_correct_count():
    """embed() should return one vector per input text, even for large batches."""
    svc = EmbeddingService(mock_mode=True)
    texts = [f"chunk {i}" for i in range(10)]
    result = await svc.embed(texts)
    assert len(result) == 10
    for vec in result:
        assert len(vec) == EMBEDDING_DIMS


# ---------------------------------------------------------------------------
# Determinism
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mock_embed_is_deterministic():
    """The same input text must produce the same vector on every call.

    This property is required for idempotent re-processing: if a file is
    re-indexed, the resulting Qdrant point IDs and vectors must be identical.
    """
    svc = EmbeddingService(mock_mode=True)
    r1 = await svc.embed(["test text"])
    r2 = await svc.embed(["test text"])
    assert r1 == r2


@pytest.mark.asyncio
async def test_mock_embed_deterministic_across_instances():
    """Determinism must hold across different EmbeddingService instances.

    Two separate instances given the same text should return the same vector
    because the mock is seeded by the text hash, not by any instance state.
    """
    svc_a = EmbeddingService(mock_mode=True)
    svc_b = EmbeddingService(mock_mode=True)
    text = "determinism check"
    assert await svc_a.embed([text]) == await svc_b.embed([text])


# ---------------------------------------------------------------------------
# Distinctness
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mock_embed_different_texts_give_different_vectors():
    """Different input texts must produce different vectors.

    This is a sanity check that the mock isn't returning a constant vector
    (which would make all chunks appear semantically identical).
    """
    svc = EmbeddingService(mock_mode=True)
    result = await svc.embed(["text A", "text B"])
    # Vectors for distinct texts must differ
    assert result[0] != result[1]


@pytest.mark.asyncio
async def test_mock_embed_similar_texts_give_different_vectors():
    """Even very similar texts should produce distinct vectors in mock mode."""
    svc = EmbeddingService(mock_mode=True)
    r = await svc.embed(["hello world", "hello world!"])
    assert r[0] != r[1]


# ---------------------------------------------------------------------------
# Empty list fast path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_embed_empty_list():
    """embed([]) must return an empty list without error."""
    svc = EmbeddingService(mock_mode=True)
    result = await svc.embed([])
    assert result == []


# ---------------------------------------------------------------------------
# encode_batch alias
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_encode_batch_alias_matches_embed():
    """encode_batch() must return the same result as embed() for the same input.

    encode_batch is the legacy API name used by existing callers (embed_handler,
    older tests).  The alias must behave identically to embed().
    """
    svc = EmbeddingService(mock_mode=True)
    texts = ["alias test", "another chunk"]
    assert await svc.encode_batch(texts) == await svc.embed(texts)


# ---------------------------------------------------------------------------
# L2 normalisation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mock_vector_is_unit_length():
    """Mock vectors should be L2-normalised (magnitude ≈ 1.0).

    Qdrant cosine similarity requires unit vectors for correct distance
    calculation.  A tolerance of 1e-6 accounts for float rounding.
    """
    svc = EmbeddingService(mock_mode=True)
    result = await svc.embed(["normalisation check"])
    vec = result[0]
    # Compute L2 magnitude
    magnitude = math.sqrt(sum(x * x for x in vec))
    assert abs(magnitude - 1.0) < 1e-6, f"Expected unit vector, got magnitude {magnitude}"
