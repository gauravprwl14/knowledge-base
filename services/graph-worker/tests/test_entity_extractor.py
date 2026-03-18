"""
Unit tests for EntityExtractor.

All spaCy model interactions are mocked so these tests run without a real
spaCy installation or downloaded model.
"""

from unittest.mock import MagicMock, patch

import pytest

from app.extractors.entity_extractor import EntityExtractor


# ---------------------------------------------------------------------------
# Wiki-link extraction
# ---------------------------------------------------------------------------


def test_extract_wiki_links_returns_targets() -> None:
    """Both plain and aliased wiki-links should be returned as normalised targets.

    Input:  ``"See [[Python]] and [[NestJS|NestJS Framework]]"``
    Expected: ``["Python", "Nestjs"]``

    Note: title() lowercases after the first character, so "NestJS" becomes
    "Nestjs". This is intentional normalisation behaviour in EntityExtractor.
    """
    extractor = EntityExtractor()
    result = extractor.extract_wiki_links("See [[Python]] and [[NestJS|NestJS Framework]]")
    assert result == ["Python", "Nestjs"]


def test_extract_wiki_links_empty_text() -> None:
    """An empty string should return an empty list without raising.

    Expected: ``[]``
    """
    extractor = EntityExtractor()
    assert extractor.extract_wiki_links("") == []


def test_extract_wiki_links_no_links_in_text() -> None:
    """Plain text without any wiki-link syntax should return an empty list.

    Expected: ``[]``
    """
    extractor = EntityExtractor()
    assert extractor.extract_wiki_links("No links here at all.") == []


def test_extract_wiki_links_multiple_same_chunk() -> None:
    """Multiple wiki-links in one text should all be returned.

    Expected: three targets in insertion order.
    """
    extractor = EntityExtractor()
    result = extractor.extract_wiki_links(
        "Read [[Python]], [[JavaScript]], and [[Rust]] for more."
    )
    assert result == ["Python", "Javascript", "Rust"]


def test_extract_wiki_links_aliased_uses_target_not_display() -> None:
    """Aliased links ``[[Target|Display]]`` should return ``Target``, not ``Display``.

    Expected: ``["Graph Database"]``
    """
    extractor = EntityExtractor()
    result = extractor.extract_wiki_links("[[Graph Database|Graph DB]]")
    assert result == ["Graph Database"]


# ---------------------------------------------------------------------------
# Entity extraction — happy path (spaCy mocked)
# ---------------------------------------------------------------------------


def _make_nlp_mock(entities: list[tuple[str, str]]):
    """Build a minimal spaCy nlp mock that returns the specified (text, label) pairs.

    Args:
        entities: List of ``(text, label)`` tuples to return as doc.ents.

    Returns:
        MagicMock: A callable mock that returns a doc with ``ents`` populated.
    """
    doc_mock = MagicMock()
    ent_mocks = []
    for text, label in entities:
        ent = MagicMock()
        ent.text = text
        ent.label_ = label
        ent_mocks.append(ent)
    doc_mock.ents = ent_mocks
    nlp_mock = MagicMock(return_value=doc_mock)
    return nlp_mock


def test_extract_entities_returns_list() -> None:
    """Entities with recognised labels should be returned with mapped labels.

    Mocks spaCy to return a PERSON and an ORG entity. Both should appear in
    the result with their canonical labels.
    """
    extractor = EntityExtractor()
    extractor._nlp = _make_nlp_mock([("Alice Smith", "PERSON"), ("OpenAI", "ORG")])

    result = extractor.extract_entities("Alice Smith works at OpenAI.")

    assert len(result) == 2
    assert {"text": "Alice Smith", "label": "PERSON"} in result
    assert {"text": "OpenAI", "label": "ORG"} in result


def test_extract_entities_maps_norp_to_concept() -> None:
    """spaCy NORP label should be mapped to canonical CONCEPT label.

    Expected: one entity with label ``"CONCEPT"``.
    """
    extractor = EntityExtractor()
    extractor._nlp = _make_nlp_mock([("Americans", "NORP")])

    result = extractor.extract_entities("Americans are innovative.")

    assert result == [{"text": "Americans", "label": "CONCEPT"}]


def test_extract_entities_skips_unknown_labels() -> None:
    """Entities with labels not in _LABEL_MAP should be silently excluded.

    DATE is not a mapped label, so the result should be empty.
    """
    extractor = EntityExtractor()
    extractor._nlp = _make_nlp_mock([("Monday", "DATE")])

    result = extractor.extract_entities("See you Monday.")

    assert result == []


def test_extract_entities_empty_text_returns_empty() -> None:
    """Empty string input should short-circuit before calling spaCy.

    The nlp callable should not be invoked at all.
    """
    extractor = EntityExtractor()
    nlp_mock = _make_nlp_mock([])
    extractor._nlp = nlp_mock

    result = extractor.extract_entities("")

    assert result == []
    nlp_mock.assert_not_called()


# ---------------------------------------------------------------------------
# Entity extraction — spaCy model unavailable
# ---------------------------------------------------------------------------


def test_extract_entities_no_model_returns_empty() -> None:
    """When spaCy raises OSError on model load, extract_entities should return [].

    The error must be swallowed and a warning logged; no exception should propagate.
    """
    extractor = EntityExtractor()
    # _nlp is None → triggers lazy load

    with patch("app.extractors.entity_extractor.logger") as mock_logger:
        with patch("spacy.load", side_effect=OSError("Model not found")):
            result = extractor.extract_entities("Alice works at OpenAI.")

    assert result == []
    mock_logger.warning.assert_called_once()
    # Subsequent state: _nlp should be False (sentinel for "tried and failed")
    assert extractor._nlp is False


def test_extract_entities_no_model_does_not_retry() -> None:
    """Once the sentinel False is set, spacy.load should not be called again.

    This verifies that the lazy-load guard prevents repeated failed imports.
    """
    extractor = EntityExtractor()
    extractor._nlp = False  # pre-set sentinel

    with patch("spacy.load") as mock_load:
        result = extractor.extract_entities("Some text.")

    assert result == []
    mock_load.assert_not_called()
