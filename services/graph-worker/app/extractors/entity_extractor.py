"""
Entity extractor for graph-worker.

Extracts named entities (PERSON, ORG, GPE, CONCEPT) using spaCy and
wiki-style links (``[[Target]]``) from Markdown text.

spaCy is loaded lazily on first use so the worker starts quickly even if
the model download is slow or unavailable.
"""

import re

import structlog

logger = structlog.get_logger(__name__)

# Regex for Markdown wiki-links: [[Target]] or [[Target|Display Text]]
WIKI_LINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]")

# Mapping from spaCy labels to canonical KMS graph labels
_LABEL_MAP: dict[str, str] = {
    "PERSON": "PERSON",
    "ORG": "ORG",
    "GPE": "GPE",
    "NORP": "CONCEPT",
    "PRODUCT": "CONCEPT",
    "WORK_OF_ART": "CONCEPT",
    "EVENT": "CONCEPT",
    "LAW": "CONCEPT",
    "LANGUAGE": "CONCEPT",
}


class EntityExtractor:
    """Extracts named entities and wiki-links from text chunks.

    Named entity recognition is performed by the spaCy ``en_core_web_sm``
    model loaded lazily on first use. If the model is not available (e.g. not
    downloaded in the container), entity extraction is silently disabled and
    an empty list is returned instead of raising.

    Wiki-link extraction uses a pure-regex approach and does not require spaCy.

    Example:
        extractor = EntityExtractor()
        entities = extractor.extract_entities("Alice works at OpenAI.")
        links = extractor.extract_wiki_links("See [[Python]] for details.")
    """

    def __init__(self) -> None:
        """Initialise the extractor with a deferred spaCy model load."""
        self._nlp = None  # lazy load; False means load was attempted and failed

    def _get_nlp(self):
        """Return the spaCy Language object, loading it on first call.

        Returns:
            The spaCy Language pipeline, or False if unavailable.
        """
        if self._nlp is None:
            try:
                import spacy  # noqa: PLC0415 — intentional deferred import

                self._nlp = spacy.load("en_core_web_sm")
                logger.info("spaCy en_core_web_sm loaded")
            except OSError:
                logger.warning(
                    "spacy en_core_web_sm not available — entity extraction disabled"
                )
                self._nlp = False  # sentinel: do not try again
        return self._nlp

    def extract_entities(self, text: str) -> list[dict]:
        """Extract named entities from text using spaCy NER.

        Entities are filtered to the labels defined in ``_LABEL_MAP`` and
        mapped to canonical KMS graph labels (PERSON, ORG, GPE, CONCEPT).

        Args:
            text: Raw chunk text to process.

        Returns:
            list[dict]: Each item has keys ``"text"`` (str) and ``"label"`` (str).
                Returns an empty list when spaCy is unavailable or text is empty.
        """
        if not text or not text.strip():
            return []

        nlp = self._get_nlp()
        if not nlp:
            return []

        doc = nlp(text)
        results: list[dict] = []
        for ent in doc.ents:
            mapped_label = _LABEL_MAP.get(ent.label_)
            if mapped_label:
                results.append({"text": ent.text.strip(), "label": mapped_label})
        return results

    def extract_wiki_links(self, text: str) -> list[str]:
        """Extract ``[[wiki link]]`` targets from Markdown text.

        Handles both plain links (``[[Target]]``) and aliased links
        (``[[Target|Display Text]]``). Duplicate targets are preserved in
        insertion order (deduplication is the caller's responsibility).

        Args:
            text: Raw Markdown text to scan for wiki-links.

        Returns:
            list[str]: Normalised link targets (stripped and title-cased).
                Returns an empty list when no links are found or text is empty.
        """
        if not text:
            return []

        matches = WIKI_LINK_RE.findall(text)
        return [target.strip().title() for target in matches]
