"""
URL ingestor — scrapes web pages and blog posts as content creator source material.

Primary path: Firecrawl API (production-grade, handles JS-rendered pages, SSRF-safe).
Fallback path: requests + BeautifulSoup4 — used when FIRECRAWL_API_KEY is absent.

IMPORTANT SECURITY NOTE (ADR-0034 / CEO Review finding S1):
The fallback path performs DNS resolution and blocks RFC-1918, loopback, and
link-local addresses BEFORE making any HTTP request. String matching alone is
insufficient — a hostname like `internal.corp.com` could resolve to 10.0.0.5.
The check must happen AFTER DNS resolution.

SSRF-via-redirect defense (fixed 2026-04-01):
The fallback path previously used follow_redirects=True with a pre-fetch SSRF
check only on the *initial* hostname. A malicious server at a public IP could
issue a 301 redirect to http://169.254.169.254/ (AWS metadata endpoint), which
would bypass the guard. The fix: follow_redirects=False, and manually follow
each redirect while re-running _is_ssrf_target() on every Location header before
following it. Cap at MAX_REDIRECTS (3) hops.

Prompt injection defense (ADR-0034 / CEO Review finding S2):
Scraped content is returned as-is; the caller (pipeline runner) wraps it in
<external_content>...</external_content> XML delimiters before passing to Claude.
We do NOT strip content here — structural delimiters are more reliable than regex.
"""
import ipaddress
import socket
import urllib.parse
from urllib.parse import urlparse

import httpx
import structlog

from app.config import Settings
from app.errors import ContentIngestionError

logger = structlog.get_logger(__name__)

# RFC-1918 private ranges + loopback + link-local + documentation ranges
# These are never legitimate public web content sources.
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),       # RFC-1918 Class A
    ipaddress.ip_network("172.16.0.0/12"),     # RFC-1918 Class B
    ipaddress.ip_network("192.168.0.0/16"),    # RFC-1918 Class C
    ipaddress.ip_network("127.0.0.0/8"),       # Loopback
    ipaddress.ip_network("::1/128"),           # IPv6 loopback
    ipaddress.ip_network("169.254.0.0/16"),    # Link-local (AWS metadata endpoint)
    ipaddress.ip_network("fe80::/10"),         # IPv6 link-local
    ipaddress.ip_network("100.64.0.0/10"),     # Shared address space (RFC 6598)
    ipaddress.ip_network("192.0.0.0/24"),      # IETF protocol assignments
    ipaddress.ip_network("198.18.0.0/15"),     # Benchmark testing (RFC 2544)
    ipaddress.ip_network("240.0.0.0/4"),       # Reserved (RFC 1112)
]


def _is_ssrf_target(hostname: str) -> bool:
    """
    Return True if the hostname resolves to a private/loopback/link-local address.

    Resolves the hostname to its IP address(es) FIRST, then checks each against
    the blocked networks list. String matching alone is not sufficient — a hostname
    like 'internal.example.com' could resolve to 10.0.0.5 and bypass a naive check.

    Args:
        hostname: Hostname extracted from the target URL (e.g. 'example.com').

    Returns:
        True if any resolved IP is in a blocked network; False if all are public.
    """
    try:
        # getaddrinfo returns all addresses (IPv4 + IPv6) for the hostname
        addr_infos = socket.getaddrinfo(hostname, None)
        for addr_info in addr_infos:
            ip_str = addr_info[4][0]
            try:
                ip = ipaddress.ip_address(ip_str)
                for network in _BLOCKED_NETWORKS:
                    if ip in network:
                        return True
            except ValueError:
                # Malformed IP string — block it to be safe
                return True
        return False
    except socket.gaierror:
        # DNS resolution failed — block; we can't verify the target is safe
        return True


# Maximum number of redirects the fallback scraper will follow.
# Matching the previous max_redirects=3 intent, but now checked per-hop.
MAX_REDIRECTS = 3


async def _fetch_with_ssrf_checked_redirects(url: str) -> httpx.Response:
    """
    Fetch a URL while running an SSRF check on every redirect hop.

    The previous implementation set follow_redirects=True on the httpx client,
    meaning the initial SSRF check on the *starting* hostname was the only guard.
    A public server at example.com could respond with a 301 to
    http://169.254.169.254/latest/meta-data/ and the client would silently follow
    it — bypassing the SSRF check entirely.

    This helper disables automatic redirect following and instead loops manually,
    calling _is_ssrf_target() on the resolved Location header *before* following
    each redirect. The loop is capped at MAX_REDIRECTS to prevent infinite chains.

    Args:
        url: The initial (already SSRF-checked) URL to fetch.

    Returns:
        The final HTTP response once a non-redirect status code is received.

    Raises:
        ContentIngestionError: If any redirect hop resolves to a private/internal
            IP address, if too many redirects occur, or if no valid response is
            received after all hops are exhausted.
    """
    # Use a single persistent client for all hops to benefit from connection reuse.
    # follow_redirects=False is the critical flag — we resolve redirects ourselves.
    async with httpx.AsyncClient(
        follow_redirects=False,
        timeout=20.0,
        headers={"User-Agent": "KMS-ContentWorker/1.0 (content extraction)"},
    ) as client:
        for attempt in range(MAX_REDIRECTS + 1):
            # Re-check the current URL's hostname on every hop (not just the first).
            # This is the core fix: redirects can change the host to an internal address.
            parsed = urllib.parse.urlparse(url)
            hostname = parsed.hostname or ""
            if _is_ssrf_target(hostname):
                logger.warning(
                    "url_ingest_ssrf_redirect_blocked",
                    hostname=hostname,
                    hop=attempt,
                    # Do not log the full URL — may contain auth tokens or sensitive paths
                )
                raise ContentIngestionError(
                    f"URL resolves to a private or internal network address at redirect hop {attempt}: "
                    f"hostname '{hostname}' is blocked.",
                    retryable=False,
                )

            response = await client.get(url)

            # If the server issued a redirect, extract the Location header and loop.
            if response.status_code in (301, 302, 303, 307, 308):
                location = response.headers.get("location", "").strip()
                if not location:
                    # Redirect with no destination — treat as a terminal response.
                    # raise_for_status() below will surface the non-2xx status.
                    break

                # Resolve relative Location headers (e.g. "/new-path") against current URL.
                url = urllib.parse.urljoin(url, location)

                if attempt == MAX_REDIRECTS:
                    # We've consumed all allowed hops — next iteration would exceed the cap.
                    raise ContentIngestionError(
                        f"Too many redirects fetching URL (limit: {MAX_REDIRECTS}).",
                        retryable=False,
                    )
                # Continue to the next hop — the new URL will be SSRF-checked at the top
                # of the next iteration before any request is sent.
                continue

            # Non-redirect response — surface HTTP errors then return.
            response.raise_for_status()
            return response

    # Reached only if the loop exhausted without returning (e.g. only redirects seen).
    raise ContentIngestionError(
        "Failed to fetch URL: received only redirect responses.",
        retryable=False,
    )


class UrlIngestor:
    """
    Scrapes a web URL and returns its text content for the content pipeline.

    Uses Firecrawl if FIRECRAWL_API_KEY is set; otherwise falls back to
    requests + BeautifulSoup4 with SSRF protection.

    Args:
        settings: Application configuration.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def ingest(self, url: str) -> str:
        """
        Fetch and extract text content from a web URL.

        Args:
            url: The web URL to scrape (e.g. a blog post or article URL).

        Returns:
            Cleaned plain-text content from the URL.

        Raises:
            ContentIngestionError: If scraping fails or the URL is blocked.
        """
        log = logger.bind(url=url[:100])  # truncate for log safety

        if self._settings.firecrawl_api_key:
            log.info("url_ingest_firecrawl")
            return await self._firecrawl(url, log)
        else:
            log.info("url_ingest_fallback")
            return await self._fallback_scrape(url, log)

    async def _firecrawl(self, url: str, log) -> str:
        """
        Scrape URL using Firecrawl API.

        Firecrawl handles JS rendering, paywalls, and SSRF protection internally.
        We trust Firecrawl to sanitise the target URL.

        Args:
            url: Target URL.
            log: Bound structlog logger.

        Returns:
            Markdown-formatted content from Firecrawl.

        Raises:
            ContentIngestionError: On API error or empty response.
        """
        try:
            # Use the configurable base URL so self-hosted Firecrawl works without
            # code changes. FIRECRAWL_API_URL defaults to https://api.firecrawl.dev
            # in Settings; override with http://localhost:3002 for self-hosted.
            api_base = self._settings.firecrawl_api_url.rstrip("/")
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{api_base}/v0/scrape",
                    headers={"Authorization": f"Bearer {self._settings.firecrawl_api_key}"},
                    json={"url": url, "pageOptions": {"onlyMainContent": True}},
                )
                response.raise_for_status()
                data = response.json()
                content = data.get("data", {}).get("markdown", "").strip()
                if not content:
                    raise ContentIngestionError(
                        "Firecrawl returned empty content for this URL. "
                        "The page may require authentication or have no main content."
                    )
                log.info("url_ingest_firecrawl_done", chars=len(content))
                return content

        except httpx.HTTPStatusError as exc:
            log.error("url_ingest_firecrawl_http_error", status=exc.response.status_code)
            raise ContentIngestionError(
                f"Firecrawl API returned HTTP {exc.response.status_code}. "
                "Check FIRECRAWL_API_KEY or try again later.",
                retryable=exc.response.status_code >= 500,
            ) from exc
        except httpx.TimeoutException as exc:
            raise ContentIngestionError(
                "Firecrawl API timed out. Try again later.",
                retryable=True,
            ) from exc

    async def _fallback_scrape(self, url: str, log) -> str:
        """
        Scrape URL using requests + BeautifulSoup4 with SSRF protection.

        SECURITY: Resolves the hostname to its IP address and rejects RFC-1918,
        loopback, and link-local targets BEFORE making any HTTP request.
        This prevents SSRF attacks where an attacker submits an internal URL
        (e.g. http://192.168.1.1/admin or http://internal.corp.com/).

        Args:
            url: Target URL.
            log: Bound structlog logger.

        Returns:
            Plain-text extracted from the page's main content elements.

        Raises:
            ContentIngestionError: If URL is blocked, invalid, or fetch fails.
        """
        # Parse and validate URL structure
        try:
            parsed = urlparse(url)
            hostname = parsed.hostname
            if not hostname:
                raise ContentIngestionError(f"Invalid URL: no hostname found in '{url[:100]}'")
        except Exception as exc:
            raise ContentIngestionError(f"Malformed URL: {exc}") from exc

        # SSRF check: resolve hostname and verify it does not target internal infra
        if _is_ssrf_target(hostname):
            logger.warning(
                "url_ingest_ssrf_blocked",
                hostname=hostname,
                # Log hostname only — not the full URL which may contain auth tokens
            )
            raise ContentIngestionError(
                f"URL target '{hostname}' resolves to a private or internal network address. "
                "Only public web URLs are supported."
            )

        # Fetch the page — use the SSRF-checked redirect follower so that every
        # redirect hop is validated before being followed. This replaces the old
        # follow_redirects=True approach that only checked the initial hostname.
        try:
            response = await _fetch_with_ssrf_checked_redirects(url)
            html = response.text

        except ContentIngestionError:
            # Re-raise SSRF blocks and redirect errors from the helper as-is.
            raise
        except httpx.HTTPStatusError as exc:
            raise ContentIngestionError(
                f"HTTP {exc.response.status_code} fetching URL. "
                "The page may be behind authentication.",
                retryable=exc.response.status_code >= 500,
            ) from exc
        except httpx.TimeoutException as exc:
            raise ContentIngestionError("URL fetch timed out.", retryable=True) from exc

        # Extract text using BeautifulSoup
        try:
            from bs4 import BeautifulSoup

            soup = BeautifulSoup(html, "lxml")

            # Remove non-content elements
            for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
                tag.decompose()

            # Prefer article/main content containers; fall back to body
            content_el = (
                soup.find("article")
                or soup.find("main")
                or soup.find(id="content")
                or soup.find(class_="content")
                or soup.body
            )

            if not content_el:
                raise ContentIngestionError("Could not extract content from page.")

            text = content_el.get_text(separator="\n", strip=True)
            if len(text) < 100:
                raise ContentIngestionError(
                    "Page content is too short (< 100 characters). "
                    "The page may be JavaScript-rendered. Try setting FIRECRAWL_API_KEY."
                )

            log.info("url_ingest_fallback_done", chars=len(text))
            return text

        except ContentIngestionError:
            raise
        except Exception as exc:
            raise ContentIngestionError(f"Failed to parse page content: {exc}") from exc
