"""
LLM Provider Factory — capability-based routing.

Routes LLM calls to the appropriate provider based on the task capability:
- analysis/synthesis/generation/research → Claude API (primary)
- Ollama is fallback only, used if Claude API key is missing

ADR-0026: LLM provider abstraction, Anthropic-primary.
"""
from __future__ import annotations

import asyncio
from enum import Enum
from typing import AsyncIterator, Optional

import structlog

logger = structlog.get_logger(__name__)


class LLMCapability(str, Enum):
    """Task capability used to route to the correct LLM provider."""

    ANALYSIS = "analysis"
    SYNTHESIS = "synthesis"
    GENERATION = "generation"
    RESEARCH = "research"
    SUMMARIZATION = "summarization"
    CHAT_COMPLETION = "chat_completion"


class LLMResponse:
    """Standardised response envelope from any LLM provider."""

    def __init__(
        self,
        text: str,
        provider: str,
        model: str,
        tokens_used: Optional[int] = None,
    ) -> None:
        """Initialise an LLMResponse.

        Args:
            text: The generated text content.
            provider: Name of the provider that generated the response.
            model: Model identifier used for generation.
            tokens_used: Number of output tokens consumed, if available.
        """
        self.text = text
        self.provider = provider
        self.model = model
        self.tokens_used = tokens_used


class LLMProviderUnavailableError(Exception):
    """Raised when no LLM provider is available (no API key, Ollama down)."""

    pass


class AnthropicProvider:
    """Anthropic Claude API provider.

    Uses the anthropic Python SDK for async calls.
    """

    def __init__(self, api_key: str, model: str, max_tokens: int) -> None:
        """Initialise the Anthropic provider.

        Args:
            api_key: Anthropic API key (required).
            model: Claude model identifier (e.g. ``claude-opus-4-5``).
            max_tokens: Default maximum tokens for completions.

        Raises:
            ValueError: If ``api_key`` is empty.
            ImportError: If the ``anthropic`` package is not installed.
        """
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is required for AnthropicProvider")
        try:
            import anthropic

            self._client = anthropic.AsyncAnthropic(api_key=api_key)
        except ImportError as e:
            raise ImportError(
                "anthropic package not installed. Run: pip install anthropic"
            ) from e
        self.model = model
        self.max_tokens = max_tokens

    async def complete(
        self,
        prompt: str,
        system: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> LLMResponse:
        """Send a non-streaming completion request to Claude.

        Args:
            prompt: The user prompt text.
            system: Optional system prompt.
            max_tokens: Override for max tokens (defaults to instance setting).

        Returns:
            LLMResponse with the generated text.
        """
        messages = [{"role": "user", "content": prompt}]
        response = await self._client.messages.create(
            model=self.model,
            max_tokens=max_tokens or self.max_tokens,
            system=system or "",
            messages=messages,
        )
        text = "".join(
            block.text for block in response.content if hasattr(block, "text")
        )
        return LLMResponse(
            text=text,
            provider="anthropic",
            model=self.model,
            tokens_used=response.usage.output_tokens if response.usage else None,
        )

    async def stream(
        self,
        prompt: str,
        system: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> AsyncIterator[str]:
        """Stream tokens from Claude.

        Args:
            prompt: The user prompt text.
            system: Optional system prompt.
            max_tokens: Override for max tokens.

        Yields:
            Text token strings as they arrive.
        """
        messages = [{"role": "user", "content": prompt}]
        async with self._client.messages.stream(
            model=self.model,
            max_tokens=max_tokens or self.max_tokens,
            system=system or "",
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text


class OllamaProvider:
    """Ollama provider — fallback only.

    Uses raw HTTP to avoid the heavy ollama package.
    Only used if Anthropic is unavailable.
    """

    def __init__(self, base_url: str, model: str, timeout: int) -> None:
        """Initialise the Ollama provider.

        Args:
            base_url: Base URL of the Ollama server (e.g. ``http://localhost:11434``).
            model: Ollama model name (e.g. ``llama3.2``).
            timeout: HTTP request timeout in seconds.
        """
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    async def complete(
        self,
        prompt: str,
        system: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> LLMResponse:
        """Send a completion request to Ollama via HTTP.

        Args:
            prompt: The user prompt text.
            system: Optional system prompt.
            max_tokens: Not used by Ollama directly (model controls output).

        Returns:
            LLMResponse with the generated text.

        Raises:
            LLMProviderUnavailableError: If Ollama is not reachable or returns an error.
        """
        import aiohttp

        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "system": system or "",
            "stream": False,
        }
        try:
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=self.timeout)
            ) as session:
                async with session.post(url, json=payload) as resp:
                    if resp.status != 200:
                        raise LLMProviderUnavailableError(
                            f"Ollama returned HTTP {resp.status}"
                        )
                    data = await resp.json()
                    return LLMResponse(
                        text=data.get("response", ""),
                        provider="ollama",
                        model=self.model,
                    )
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            raise LLMProviderUnavailableError(f"Ollama unreachable: {e}") from e

    async def stream(
        self,
        prompt: str,
        system: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> AsyncIterator[str]:
        """Stream tokens from Ollama via HTTP NDJSON.

        Ollama uses NDJSON streaming — each line is a JSON object with a
        ``response`` field and a ``done`` boolean.

        Args:
            prompt: The user prompt text.
            system: Optional system prompt.
            max_tokens: Not used by Ollama directly (model controls output).

        Yields:
            Text token strings as they arrive.

        Raises:
            LLMProviderUnavailableError: If Ollama is not reachable or returns an error.
        """
        import aiohttp
        import json as _json

        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "system": system or "",
            "stream": True,
        }
        try:
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=self.timeout)
            ) as session:
                async with session.post(url, json=payload) as resp:
                    if resp.status != 200:
                        raise LLMProviderUnavailableError(
                            f"Ollama returned HTTP {resp.status}"
                        )
                    async for raw_line in resp.content:
                        line = raw_line.strip()
                        if not line:
                            continue
                        try:
                            data = _json.loads(line)
                        except _json.JSONDecodeError:
                            continue
                        if token := data.get("response"):
                            yield token
                        if data.get("done"):
                            break
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            raise LLMProviderUnavailableError(f"Ollama unreachable: {e}") from e


class LLMFactory:
    """Capability-based LLM provider factory.

    Routes task capabilities to the appropriate provider:
    - All capabilities → AnthropicProvider (primary)
    - OllamaProvider is fallback if Anthropic key is absent

    Usage:
        factory = LLMFactory(settings)
        provider = factory.get_provider(LLMCapability.SYNTHESIS)
        response = await provider.complete(prompt, system=system_prompt)
    """

    def __init__(self, settings) -> None:
        """Initialise the factory with application settings.

        Args:
            settings: The application Settings instance (from config.py).
        """
        self._settings = settings
        self._anthropic: Optional[AnthropicProvider] = None
        self._ollama: Optional[OllamaProvider] = None
        self._init_providers()

    def _init_providers(self) -> None:
        """Initialise available providers based on configuration."""
        if self._settings.anthropic_api_key:
            try:
                self._anthropic = AnthropicProvider(
                    api_key=self._settings.anthropic_api_key,
                    model=self._settings.anthropic_model,
                    max_tokens=self._settings.anthropic_max_tokens,
                )
                logger.info(
                    "AnthropicProvider initialised",
                    model=self._settings.anthropic_model,
                )
            except (ImportError, ValueError) as e:
                logger.warning("AnthropicProvider unavailable", error=str(e))

        # Ollama is always available as fallback (lazy health check at call time)
        self._ollama = OllamaProvider(
            base_url=self._settings.ollama_url,
            model=self._settings.ollama_model,
            timeout=self._settings.ollama_timeout_seconds,
        )

    def get_provider(
        self,
        capability: LLMCapability = LLMCapability.SYNTHESIS,
    ) -> "AnthropicProvider | OllamaProvider":
        """Return the best available provider for the given capability.

        All capabilities route to Anthropic (primary) if available.
        Falls back to Ollama if Anthropic key is not configured.

        Args:
            capability: The task capability (used for logging/future routing).

        Returns:
            The selected LLM provider instance.

        Raises:
            LLMProviderUnavailableError: If no provider is available.
        """
        if self._anthropic is not None:
            logger.debug(
                "Routing to AnthropicProvider", capability=capability.value
            )
            return self._anthropic

        logger.warning(
            "AnthropicProvider not available, falling back to Ollama",
            capability=capability.value,
        )
        if self._ollama is not None:
            return self._ollama

        raise LLMProviderUnavailableError(
            "No LLM provider available. Set ANTHROPIC_API_KEY or ensure Ollama is running."
        )

    @property
    def has_anthropic(self) -> bool:
        """True if the Anthropic provider is available."""
        return self._anthropic is not None
