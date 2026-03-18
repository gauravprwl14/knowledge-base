"""URL Classifier — identifies YouTube vs web page URLs.

Rule-based classification using URL patterns.
No network calls required.

Example:
    clf = UrlClassifier()
    clf.classify("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    # → UrlType.YOUTUBE
"""
from __future__ import annotations

import re
from enum import Enum
from urllib.parse import urlparse


class UrlType(str, Enum):
    """Type of URL for routing to the correct extractor."""

    YOUTUBE = "youtube"
    WEB = "web"
    UNKNOWN = "unknown"


# YouTube URL patterns — covers youtube.com, youtu.be, and m.youtube.com
_YOUTUBE_PATTERNS = [
    re.compile(r"(?:https?://)?(?:www\.|m\.)?youtube\.com/watch\?.*v=[\w-]+"),
    re.compile(r"(?:https?://)?youtu\.be/[\w-]+"),
    re.compile(r"(?:https?://)?(?:www\.)?youtube\.com/shorts/[\w-]+"),
]


class UrlClassifier:
    """Classifies a URL string into a UrlType for extractor routing."""

    def classify(self, url: str) -> UrlType:
        """Classify a URL string.

        Args:
            url: Raw URL string (with or without scheme).

        Returns:
            UrlType.YOUTUBE, UrlType.WEB, or UrlType.UNKNOWN.
        """
        if not url:
            return UrlType.UNKNOWN

        # Check YouTube patterns first — more specific than generic HTTP check
        for pattern in _YOUTUBE_PATTERNS:
            if pattern.search(url):
                return UrlType.YOUTUBE

        # Validate it's a parseable HTTP/HTTPS URL with a real host.
        # Require at least one dot in the netloc — bare words like "not-a-url"
        # have a netloc but are not routable internet hostnames.
        try:
            parsed = urlparse(url if "://" in url else f"https://{url}")
            if (
                parsed.scheme in ("http", "https")
                and parsed.netloc
                and "." in parsed.netloc  # e.g. "example.com", not "localhost-like-words"
            ):
                return UrlType.WEB
        except Exception:
            # urlparse should never throw, but be safe
            pass

        return UrlType.UNKNOWN

    def extract_video_id(self, url: str) -> str | None:
        """Extract the YouTube video ID from a URL.

        Args:
            url: YouTube URL string.

        Returns:
            Video ID string or None if not found.
        """
        # youtube.com/watch?v=VIDEO_ID (also handles &v= in the middle)
        m = re.search(r"[?&]v=([\w-]+)", url)
        if m:
            return m.group(1)
        # youtu.be/VIDEO_ID
        m = re.search(r"youtu\.be/([\w-]+)", url)
        if m:
            return m.group(1)
        # youtube.com/shorts/VIDEO_ID
        m = re.search(r"/shorts/([\w-]+)", url)
        if m:
            return m.group(1)
        return None
