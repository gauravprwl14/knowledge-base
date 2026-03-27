"""Tests for URL classifier."""
from __future__ import annotations

import pytest

from app.utils.url_classifier import UrlClassifier, UrlType


@pytest.fixture
def clf() -> UrlClassifier:
    """Return a fresh UrlClassifier for each test."""
    return UrlClassifier()


# ── YouTube classification ───────────────────────────────────────────────────

def test_youtube_watch_url(clf: UrlClassifier) -> None:
    """Standard youtube.com/watch?v= URL is classified as YOUTUBE."""
    assert clf.classify("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == UrlType.YOUTUBE


def test_youtube_mobile_url(clf: UrlClassifier) -> None:
    """Mobile youtube URL (m.youtube.com) is classified as YOUTUBE."""
    assert clf.classify("https://m.youtube.com/watch?v=dQw4w9WgXcQ") == UrlType.YOUTUBE


def test_youtu_be_short(clf: UrlClassifier) -> None:
    """youtu.be short link is classified as YOUTUBE."""
    assert clf.classify("https://youtu.be/dQw4w9WgXcQ") == UrlType.YOUTUBE


def test_youtube_shorts(clf: UrlClassifier) -> None:
    """youtube.com/shorts/ URL is classified as YOUTUBE."""
    assert clf.classify("https://www.youtube.com/shorts/abc123xyz") == UrlType.YOUTUBE


# ── Web classification ───────────────────────────────────────────────────────

def test_web_url(clf: UrlClassifier) -> None:
    """HTTPS web page URL is classified as WEB."""
    assert clf.classify("https://example.com/article") == UrlType.WEB


def test_http_web_url(clf: UrlClassifier) -> None:
    """HTTP (non-HTTPS) web page URL is classified as WEB."""
    assert clf.classify("http://example.com/page") == UrlType.WEB


def test_web_url_with_path(clf: UrlClassifier) -> None:
    """URL with deep path is classified as WEB."""
    assert clf.classify("https://docs.qdrant.tech/concepts/indexing/") == UrlType.WEB


# ── Unknown classification ───────────────────────────────────────────────────

def test_unknown_url(clf: UrlClassifier) -> None:
    """Plain string without a valid HTTP host is UNKNOWN."""
    assert clf.classify("not-a-url") == UrlType.UNKNOWN


def test_empty_string(clf: UrlClassifier) -> None:
    """Empty string is UNKNOWN."""
    assert clf.classify("") == UrlType.UNKNOWN


def test_ftp_url(clf: UrlClassifier) -> None:
    """FTP URL is UNKNOWN (only http/https supported)."""
    assert clf.classify("ftp://files.example.com/file.txt") == UrlType.UNKNOWN


# ── Video ID extraction ──────────────────────────────────────────────────────

def test_extract_video_id_watch(clf: UrlClassifier) -> None:
    """Extract video ID from watch?v= URL."""
    assert clf.extract_video_id("https://youtube.com/watch?v=abc123") == "abc123"


def test_extract_video_id_youtu_be(clf: UrlClassifier) -> None:
    """Extract video ID from youtu.be short URL."""
    assert clf.extract_video_id("https://youtu.be/xyz789") == "xyz789"


def test_extract_video_id_shorts(clf: UrlClassifier) -> None:
    """Extract video ID from /shorts/ URL."""
    assert clf.extract_video_id("https://youtube.com/shorts/shortid") == "shortid"


def test_extract_video_id_not_found(clf: UrlClassifier) -> None:
    """Returns None for a URL with no video ID."""
    assert clf.extract_video_id("https://example.com/page") is None
