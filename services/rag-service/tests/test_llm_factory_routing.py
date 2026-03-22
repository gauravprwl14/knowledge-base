"""Tests for LLMFactory provider routing.

LLMFactory selects AnthropicProvider when ANTHROPIC_API_KEY is set,
falling back to OllamaProvider for local-only (no API key) deployments.
"""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from typing import AsyncIterator


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_settings(*, anthropic_api_key: str = "", ollama_url: str = "http://localhost:11434") -> MagicMock:
    """Build a minimal settings-like mock for LLMFactory."""
    settings = MagicMock()
    settings.anthropic_api_key = anthropic_api_key
    settings.anthropic_model = "claude-sonnet-4-6"
    settings.anthropic_max_tokens = 2048
    settings.ollama_url = ollama_url
    settings.ollama_model = "llama3.2:3b"
    settings.ollama_timeout_seconds = 30
    return settings


# ---------------------------------------------------------------------------
# LLMFactory.get_provider() — Anthropic present
# ---------------------------------------------------------------------------


def test_factory_returns_anthropic_when_key_present():
    """LLMFactory returns AnthropicProvider when ANTHROPIC_API_KEY is set."""
    from app.services.llm_factory import LLMFactory, LLMCapability

    settings = _make_settings(anthropic_api_key="sk-ant-test")

    # Patch the anthropic package so no real import is needed in the test env
    with patch("app.services.llm_factory.AnthropicProvider.__init__", return_value=None):
        factory = LLMFactory(settings)
        # Force anthropic provider to be non-None (init was patched)
        from app.services.llm_factory import AnthropicProvider
        factory._anthropic = AnthropicProvider.__new__(AnthropicProvider)

    provider = factory.get_provider(LLMCapability.CHAT_COMPLETION)

    from app.services.llm_factory import AnthropicProvider as AP
    assert isinstance(provider, AP)
    assert "anthropic" in type(provider).__name__.lower()


def test_factory_returns_anthropic_for_all_capabilities_when_key_present():
    """LLMFactory always returns AnthropicProvider for every capability when key is set."""
    from app.services.llm_factory import LLMFactory, LLMCapability, AnthropicProvider

    settings = _make_settings(anthropic_api_key="sk-ant-test")

    with patch("app.services.llm_factory.AnthropicProvider.__init__", return_value=None):
        factory = LLMFactory(settings)
        factory._anthropic = AnthropicProvider.__new__(AnthropicProvider)

    for cap in LLMCapability:
        provider = factory.get_provider(cap)
        assert isinstance(provider, AnthropicProvider), f"Expected Anthropic for {cap}"


# ---------------------------------------------------------------------------
# LLMFactory.get_provider() — No Anthropic key → Ollama fallback
# ---------------------------------------------------------------------------


def test_factory_returns_ollama_when_no_key():
    """LLMFactory returns OllamaProvider when ANTHROPIC_API_KEY is empty."""
    from app.services.llm_factory import LLMFactory, LLMCapability, OllamaProvider

    settings = _make_settings(anthropic_api_key="")

    factory = LLMFactory(settings)
    provider = factory.get_provider(LLMCapability.CHAT_COMPLETION)

    assert isinstance(provider, OllamaProvider)
    assert "ollama" in type(provider).__name__.lower()


def test_factory_ollama_provider_has_correct_url():
    """OllamaProvider is initialised with the URL from settings."""
    from app.services.llm_factory import LLMFactory, LLMCapability, OllamaProvider

    settings = _make_settings(anthropic_api_key="", ollama_url="http://ollama:11434")

    factory = LLMFactory(settings)
    provider = factory.get_provider(LLMCapability.GENERATION)

    assert isinstance(provider, OllamaProvider)
    assert provider.base_url == "http://ollama:11434"
    assert provider.model == "llama3.2:3b"


# ---------------------------------------------------------------------------
# LLMFactory.get_provider() — Neither available → LLMProviderUnavailableError
# ---------------------------------------------------------------------------


def test_factory_raises_when_no_provider_available():
    """LLMFactory raises LLMProviderUnavailableError when neither Anthropic nor Ollama is set."""
    from app.services.llm_factory import LLMFactory, LLMCapability, LLMProviderUnavailableError

    settings = _make_settings(anthropic_api_key="")

    factory = LLMFactory(settings)
    # Force both providers to None to simulate complete unavailability
    factory._anthropic = None
    factory._ollama = None

    with pytest.raises(LLMProviderUnavailableError):
        factory.get_provider(LLMCapability.CHAT_COMPLETION)


# ---------------------------------------------------------------------------
# LLMFactory.has_anthropic property
# ---------------------------------------------------------------------------


def test_factory_has_anthropic_false_when_no_key():
    """has_anthropic returns False when no Anthropic key is configured."""
    from app.services.llm_factory import LLMFactory

    factory = LLMFactory(_make_settings(anthropic_api_key=""))
    assert factory.has_anthropic is False


def test_factory_has_anthropic_true_when_key_present():
    """has_anthropic returns True when AnthropicProvider is successfully initialised."""
    from app.services.llm_factory import LLMFactory, AnthropicProvider

    settings = _make_settings(anthropic_api_key="sk-ant-test")

    with patch("app.services.llm_factory.AnthropicProvider.__init__", return_value=None):
        factory = LLMFactory(settings)
        factory._anthropic = AnthropicProvider.__new__(AnthropicProvider)

    assert factory.has_anthropic is True


# ---------------------------------------------------------------------------
# OllamaProvider.stream() — token streaming
# ---------------------------------------------------------------------------


async def test_ollama_provider_stream_yields_tokens():
    """OllamaProvider.stream() should yield tokens from Ollama NDJSON response."""
    import json
    from app.services.llm_factory import OllamaProvider

    provider = OllamaProvider(
        base_url="http://localhost:11434",
        model="llama3.2:3b",
        timeout=30,
    )

    # Build a fake NDJSON response with two tokens and a done=True sentinel
    ndjson_lines = [
        json.dumps({"response": "Hello", "done": False}).encode(),
        json.dumps({"response": " world", "done": False}).encode(),
        json.dumps({"response": "", "done": True}).encode(),
    ]

    class _FakeContent:
        """Minimal async iterator over pre-built lines."""
        def __init__(self, lines):
            self._lines = iter(lines)

        def __aiter__(self):
            return self

        async def __anext__(self):
            try:
                return next(self._lines)
            except StopIteration:
                raise StopAsyncIteration

    class _FakeResp:
        status = 200
        content = _FakeContent(ndjson_lines)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

    class _FakeSession:
        def post(self, *args, **kwargs):
            return _FakeResp()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

    with patch("aiohttp.ClientSession", return_value=_FakeSession()):
        tokens = []
        async for token in provider.stream("What is RAG?"):
            tokens.append(token)

    assert tokens == ["Hello", " world"]
    assert "".join(tokens) == "Hello world"


# ---------------------------------------------------------------------------
# OllamaProvider.stream() — HTTP error → LLMProviderUnavailableError
# ---------------------------------------------------------------------------


async def test_ollama_provider_stream_raises_on_http_error():
    """OllamaProvider.stream() raises LLMProviderUnavailableError on non-200 status."""
    from app.services.llm_factory import OllamaProvider, LLMProviderUnavailableError

    provider = OllamaProvider(
        base_url="http://localhost:11434",
        model="llama3.2:3b",
        timeout=30,
    )

    class _FakeResp:
        status = 503
        content = None

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

    class _FakeSession:
        def post(self, *args, **kwargs):
            return _FakeResp()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

    with patch("aiohttp.ClientSession", return_value=_FakeSession()):
        with pytest.raises(LLMProviderUnavailableError):
            async for _ in provider.stream("test"):
                pass
