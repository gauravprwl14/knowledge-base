"""
Unit tests for UrlIngestor — specifically the SSRF protection logic.

These are regression tests (R3 from the test plan). Every test case in the
SSRF section must pass before any deploy. A single failure means the SSRF
guard is broken and external URL ingestion must be disabled in production.

Test coverage:
  - Private IPv4 ranges (RFC-1918): 10.x, 172.16-31.x, 192.168.x
  - Loopback: 127.0.0.1
  - Link-local (AWS metadata endpoint): 169.254.169.254
  - IPv6 loopback: ::1
  - Hostname that resolves to private IP (DNS-based SSRF)
  - Public IP: allowed through
  - Firecrawl path: called when FIRECRAWL_API_KEY set
  - Fallback path: used when no API key
  - SSRF-via-redirect: public host redirects to private IP must be blocked
"""
import socket
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.config import Settings
from app.errors import ContentIngestionError
from app.pipeline.ingestion.url_ingestor import (
    MAX_REDIRECTS,
    UrlIngestor,
    _fetch_with_ssrf_checked_redirects,
    _is_ssrf_target,
)


# ── _is_ssrf_target unit tests ────────────────────────────────────────────────

class TestSsrfGuard:
    """Tests for the SSRF hostname checker."""

    def test_blocks_rfc1918_class_a(self):
        """10.0.0.0/8 must be blocked."""
        with patch("socket.getaddrinfo") as mock_dns:
            mock_dns.return_value = [(None, None, None, None, ("10.0.0.1", 0))]
            assert _is_ssrf_target("internal.corp.com") is True

    def test_blocks_rfc1918_class_b(self):
        """172.16.0.0/12 must be blocked."""
        with patch("socket.getaddrinfo") as mock_dns:
            mock_dns.return_value = [(None, None, None, None, ("172.20.0.5", 0))]
            assert _is_ssrf_target("internal.example.com") is True

    def test_blocks_rfc1918_class_c(self):
        """192.168.0.0/16 must be blocked."""
        with patch("socket.getaddrinfo") as mock_dns:
            mock_dns.return_value = [(None, None, None, None, ("192.168.1.1", 0))]
            assert _is_ssrf_target("router.local") is True

    def test_blocks_loopback_ipv4(self):
        """127.0.0.1 must be blocked."""
        with patch("socket.getaddrinfo") as mock_dns:
            mock_dns.return_value = [(None, None, None, None, ("127.0.0.1", 0))]
            assert _is_ssrf_target("localhost") is True

    def test_blocks_link_local(self):
        """169.254.x.x must be blocked (AWS metadata endpoint lives here)."""
        with patch("socket.getaddrinfo") as mock_dns:
            mock_dns.return_value = [(None, None, None, None, ("169.254.169.254", 0))]
            assert _is_ssrf_target("169.254.169.254") is True

    def test_blocks_ipv6_loopback(self):
        """IPv6 loopback ::1 must be blocked."""
        with patch("socket.getaddrinfo") as mock_dns:
            mock_dns.return_value = [(None, None, None, None, ("::1", 0, 0, 0))]
            assert _is_ssrf_target("ip6-localhost") is True

    def test_blocks_hostname_resolving_to_private_ip(self):
        """
        A public-looking hostname that resolves to a private IP must be blocked.
        This is the key bypass that string matching alone misses.
        """
        with patch("socket.getaddrinfo") as mock_dns:
            # internal.example.com → 10.0.0.5 (private)
            mock_dns.return_value = [(None, None, None, None, ("10.0.0.5", 0))]
            assert _is_ssrf_target("internal.example.com") is True

    def test_allows_public_ip(self):
        """A real public IP must be allowed through."""
        with patch("socket.getaddrinfo") as mock_dns:
            # example.com → 93.184.216.34 (public)
            mock_dns.return_value = [(None, None, None, None, ("93.184.216.34", 0))]
            assert _is_ssrf_target("example.com") is False

    def test_blocks_on_dns_resolution_failure(self):
        """If DNS resolution fails, block the request (fail-safe)."""
        with patch("socket.getaddrinfo", side_effect=socket.gaierror):
            assert _is_ssrf_target("nonexistent.tld.invalid") is True


# ── UrlIngestor integration-level unit tests ──────────────────────────────────

class TestUrlIngestor:
    """Tests for UrlIngestor.ingest() — uses mocked httpx."""

    def _make_settings(self, firecrawl_key: str = "") -> Settings:
        return Settings(
            database_url="postgresql://test:test@localhost/test",
            rabbitmq_url="amqp://guest:guest@localhost/",
            anthropic_api_key="test-key",
            firecrawl_api_key=firecrawl_key,
        )

    @pytest.mark.asyncio
    async def test_raises_on_private_ip_url(self):
        """ingest() must raise ContentIngestionError for private IP URLs."""
        settings = self._make_settings()
        ingestor = UrlIngestor(settings)

        with patch("socket.getaddrinfo") as mock_dns:
            mock_dns.return_value = [(None, None, None, None, ("192.168.1.1", 0))]
            with pytest.raises(ContentIngestionError, match="private or internal network"):
                await ingestor.ingest("http://192.168.1.1/admin")

    @pytest.mark.asyncio
    async def test_uses_firecrawl_when_api_key_set(self):
        """When FIRECRAWL_API_KEY is set, Firecrawl path is used (not fallback)."""
        settings = self._make_settings(firecrawl_key="fc-test-key")
        ingestor = UrlIngestor(settings)

        mock_response = MagicMock()
        mock_response.json.return_value = {"data": {"markdown": "# Test content\n\nSome text here."}}
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            result = await ingestor.ingest("https://example.com/article")

        assert "Test content" in result
        mock_client.post.assert_called_once()
        call_url = mock_client.post.call_args[0][0]
        # URL is configurable via FIRECRAWL_API_URL — assert the path, not the host
        assert "/scrape" in call_url

    @pytest.mark.asyncio
    async def test_fallback_used_when_no_firecrawl_key(self):
        """When no FIRECRAWL_API_KEY, fallback scraper is used."""
        settings = self._make_settings(firecrawl_key="")
        ingestor = UrlIngestor(settings)

        mock_response = MagicMock()
        mock_response.text = "<html><body><article>Hello world content here with enough chars to pass the minimum length check of one hundred characters total.</article></body></html>"
        mock_response.raise_for_status = MagicMock()
        # status_code not in redirect set — simulates a direct 200
        mock_response.status_code = 200

        with patch("socket.getaddrinfo") as mock_dns, \
             patch("app.pipeline.ingestion.url_ingestor.httpx.AsyncClient") as mock_client_cls:
            # Resolve to public IP
            mock_dns.return_value = [(None, None, None, None, ("93.184.216.34", 0))]

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            result = await ingestor.ingest("https://example.com/blog/post")

        assert "Hello world" in result

    @pytest.mark.asyncio
    async def test_blocks_redirect_to_private_ip(self):
        """
        SSRF-via-redirect regression test.

        Even if the initial URL passes the SSRF check (public IP), a redirect
        to a private/link-local address must be caught and blocked.

        This was the vulnerability: follow_redirects=True with only a pre-fetch
        SSRF check on the initial hostname. A server at example.com (public) could
        issue a 301 to http://169.254.169.254/latest/meta-data/ and the client
        would silently follow it.

        After the fix (_fetch_with_ssrf_checked_redirects), the Location header
        is resolved and SSRF-checked *before* following each redirect.
        """
        settings = self._make_settings(firecrawl_key="")
        ingestor = UrlIngestor(settings)

        # First response: 301 redirect from public host to AWS metadata endpoint
        redirect_response = MagicMock()
        redirect_response.status_code = 301
        redirect_response.headers = {"location": "http://169.254.169.254/latest/meta-data/"}

        def dns_side_effect(hostname, *args, **kwargs):
            """Return public IP for example.com, private for 169.254.169.254."""
            if hostname == "example.com":
                return [(None, None, None, None, ("93.184.216.34", 0))]
            # 169.254.x.x is link-local — getaddrinfo returns it as-is
            return [(None, None, None, None, (hostname, 0))]

        with patch("socket.getaddrinfo", side_effect=dns_side_effect), \
             patch("app.pipeline.ingestion.url_ingestor.httpx.AsyncClient") as mock_client_cls:

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            # First GET returns the redirect; second would be the metadata endpoint
            # but _is_ssrf_target must block it before the GET is issued.
            mock_client.get = AsyncMock(return_value=redirect_response)
            mock_client_cls.return_value = mock_client

            with pytest.raises(ContentIngestionError, match="private or internal network"):
                await ingestor.ingest("https://example.com/article")

        # The GET to the metadata endpoint must never have been issued.
        # Only the first GET (example.com) should have been called.
        assert mock_client.get.call_count == 1, (
            "httpx.get was called more than once — the redirect was followed "
            "before the SSRF check blocked it. The fix is not working."
        )

    @pytest.mark.asyncio
    async def test_too_many_redirects_raises(self):
        """
        If a server issues more redirects than MAX_REDIRECTS, a ContentIngestionError
        must be raised instead of following indefinitely.
        """
        # Build a redirect response that always points back to a public URL
        # so only the redirect-count limit triggers the error.
        redirect_response = MagicMock()
        redirect_response.status_code = 301
        redirect_response.headers = {"location": "https://example.com/next"}

        with patch("socket.getaddrinfo") as mock_dns, \
             patch("app.pipeline.ingestion.url_ingestor.httpx.AsyncClient") as mock_client_cls:
            mock_dns.return_value = [(None, None, None, None, ("93.184.216.34", 0))]

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(return_value=redirect_response)
            mock_client_cls.return_value = mock_client

            with pytest.raises(ContentIngestionError, match="Too many redirects"):
                await _fetch_with_ssrf_checked_redirects("https://example.com/start")

        # Should have been called MAX_REDIRECTS + 1 times before the error is raised
        # (one initial request + MAX_REDIRECTS redirects = MAX_REDIRECTS + 1 GETs,
        # but the last redirect triggers the cap before issuing another GET).
        assert mock_client.get.call_count == MAX_REDIRECTS + 1
