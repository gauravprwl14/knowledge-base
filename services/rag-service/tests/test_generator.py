"""Tests for Generator and LLMGenerator — token streaming and error handling.

Generator uses aiohttp to stream from Ollama (primary) and OpenRouter (fallback).
Tests mock _ollama_stream and _openrouter_stream to avoid real HTTP calls.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from typing import AsyncIterator

import pytest

from app.errors import GeneratorError
from app.services.generator import Generator, LLMGenerator


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _async_tokens(*tokens: str) -> AsyncIterator[str]:
    """Yield a fixed sequence of tokens as an async generator."""
    for token in tokens:
        yield token


# ---------------------------------------------------------------------------
# Generator.generate_stream() — Ollama happy path
# ---------------------------------------------------------------------------


async def test_generate_stream_ollama_available_streams_tokens():
    """generate_stream() with Ollama available should yield all tokens from _ollama_stream."""
    generator = Generator()

    async def fake_ollama_stream(prompt: str):
        for token in ["Hello", " world", "!"]:
            yield token

    with patch.object(generator, "_ollama_stream", side_effect=fake_ollama_stream):
        tokens = []
        async for token in generator.generate_stream(
            "what is BGE-M3?",
            [{"content": "BGE-M3 is an embedding model."}],
            run_id="test-run-001",
        ):
            tokens.append(token)

    assert tokens == ["Hello", " world", "!"]
    assert "".join(tokens) == "Hello world!"


# ---------------------------------------------------------------------------
# Generator.generate_stream() — Ollama unavailable, OpenRouter succeeds
# ---------------------------------------------------------------------------


async def test_generate_stream_ollama_unavailable_falls_back_to_openrouter():
    """When Ollama fails, generate_stream() should fall back to OpenRouter."""
    generator = Generator()

    async def failing_ollama_stream(prompt: str):
        raise ConnectionError("Ollama is down")
        # unreachable — needed to make function an async generator
        yield  # noqa: unreachable

    async def fake_openrouter_stream(prompt: str):
        for token in ["Fallback", " answer"]:
            yield token

    with (
        patch.object(generator, "_ollama_stream", side_effect=failing_ollama_stream),
        patch.object(generator, "_openrouter_stream", side_effect=fake_openrouter_stream),
        patch("app.services.generator.settings") as mock_settings,
    ):
        mock_settings.openrouter_api_key = "or-test-key"
        mock_settings.openrouter_model = "anthropic/claude-3-haiku"
        mock_settings.ollama_model = "llama3.2"
        mock_settings.ollama_base_url = "http://ollama:11434"

        tokens = []
        async for token in generator.generate_stream(
            "explain RAG",
            [{"content": "RAG is retrieval-augmented generation."}],
            run_id="test-run-002",
        ):
            tokens.append(token)

    assert tokens == ["Fallback", " answer"]


# ---------------------------------------------------------------------------
# Generator.generate_stream() — both Ollama and OpenRouter fail → GeneratorError
# ---------------------------------------------------------------------------


async def test_generate_stream_both_providers_fail_raises_generator_error():
    """When Ollama and OpenRouter both fail, GeneratorError (KBRAG0005) must be raised."""
    generator = Generator()

    async def failing_ollama_stream(prompt: str):
        raise ConnectionError("Ollama is down")
        yield  # noqa: unreachable

    async def failing_openrouter_stream(prompt: str):
        raise ConnectionError("OpenRouter is down")
        yield  # noqa: unreachable

    with (
        patch.object(generator, "_ollama_stream", side_effect=failing_ollama_stream),
        patch.object(generator, "_openrouter_stream", side_effect=failing_openrouter_stream),
        patch("app.services.generator.settings") as mock_settings,
    ):
        mock_settings.openrouter_api_key = "or-test-key"
        mock_settings.ollama_model = "llama3.2"
        mock_settings.ollama_base_url = "http://ollama:11434"
        mock_settings.openrouter_model = "anthropic/claude-3-haiku"

        with pytest.raises(GeneratorError) as exc_info:
            async for _ in generator.generate_stream(
                "write a blog post",
                [{"content": "some context"}],
                run_id="test-run-003",
            ):
                pass

    assert exc_info.value.code == "KBRAG0005"


# ---------------------------------------------------------------------------
# Generator.generate_stream() — Ollama fails, no OpenRouter key → GeneratorError
# ---------------------------------------------------------------------------


async def test_generate_stream_ollama_fails_no_openrouter_key_raises_generator_error():
    """When Ollama fails and no OpenRouter key is configured, GeneratorError is raised."""
    generator = Generator()

    async def failing_ollama_stream(prompt: str):
        raise ConnectionError("Ollama is down")
        yield  # noqa: unreachable

    with (
        patch.object(generator, "_ollama_stream", side_effect=failing_ollama_stream),
        patch("app.services.generator.settings") as mock_settings,
    ):
        mock_settings.openrouter_api_key = ""  # no key configured
        mock_settings.ollama_model = "llama3.2"
        mock_settings.ollama_base_url = "http://ollama:11434"

        with pytest.raises(GeneratorError):
            async for _ in generator.generate_stream(
                "find documents",
                [{"content": "some context"}],
                run_id="test-run-004",
            ):
                pass


# ---------------------------------------------------------------------------
# Generator.generate_stream() — empty context → still calls LLM
# ---------------------------------------------------------------------------


async def test_generate_stream_empty_context_still_calls_ollama():
    """generate_stream() with no context chunks should still attempt Ollama call."""
    generator = Generator()

    async def fake_ollama_stream(prompt: str):
        assert "Context:" in prompt  # prompt template always includes Context section
        yield "Answer without context"

    with patch.object(generator, "_ollama_stream", side_effect=fake_ollama_stream):
        tokens = []
        async for token in generator.generate_stream(
            "what is the capital of France?",
            [],  # empty context list
            run_id="test-run-005",
        ):
            tokens.append(token)

    assert tokens == ["Answer without context"]


# ---------------------------------------------------------------------------
# LLMGenerator.generate() — accumulates tokens into full response
# ---------------------------------------------------------------------------


async def test_llm_generator_generate_returns_full_response():
    """LLMGenerator.generate() should accumulate all streamed tokens into a single string.

    Patches Generator.generate_stream (the parent class method) to avoid real HTTP calls.
    LLMGenerator.generate_stream delegates to Generator.generate_stream internally.
    """
    gen = LLMGenerator()

    async def fake_generate_stream(self_inner, query, context_chunks, run_id):
        for token in ["The", " answer", " is", " 42"]:
            yield token

    with (
        # Patch the parent class's generate_stream to avoid needing Ollama/OpenRouter
        patch.object(Generator, "generate_stream", fake_generate_stream),
        patch("app.services.generator.settings") as mock_settings,
    ):
        mock_settings.llm_enabled = True
        mock_settings.ollama_model = "llama3.2"
        mock_settings.ollama_base_url = "http://ollama:11434"
        mock_settings.openrouter_api_key = ""

        answer = await gen.generate("what is the answer?", "context: universe and everything")

    assert answer == "The answer is 42"


# ---------------------------------------------------------------------------
# LLMGenerator.generate() — LLM disabled → returns fallback response
# ---------------------------------------------------------------------------


async def test_llm_generator_generate_llm_disabled_returns_fallback():
    """When llm_enabled=False, generate() should return the fallback response directly."""
    gen = LLMGenerator()

    with patch("app.services.generator.settings") as mock_settings:
        mock_settings.llm_enabled = False

        answer = await gen.generate("explain RAG", "RAG context here")

    assert "LLM is disabled" in answer
    assert "RAG context here" in answer


async def test_llm_generator_generate_llm_disabled_empty_context_returns_no_results():
    """With llm_enabled=False and empty context, returns the 'no documents found' message."""
    gen = LLMGenerator()

    with patch("app.services.generator.settings") as mock_settings:
        mock_settings.llm_enabled = False

        answer = await gen.generate("what is X?", "")

    assert "No relevant documents" in answer


# ---------------------------------------------------------------------------
# LLMGenerator.generate() — GeneratorError → returns fallback (does not re-raise)
# ---------------------------------------------------------------------------


async def test_llm_generator_generate_on_generator_error_returns_fallback():
    """When generate_stream raises GeneratorError, generate() returns fallback without raising."""
    gen = LLMGenerator()

    async def failing_generate_stream(self_inner, query, context_chunks, run_id):
        raise GeneratorError("both providers failed")
        yield  # noqa: unreachable — needed to make this an async generator

    with (
        # Patch parent's generate_stream so it raises GeneratorError
        patch.object(Generator, "generate_stream", failing_generate_stream),
        patch("app.services.generator.settings") as mock_settings,
    ):
        mock_settings.llm_enabled = True
        mock_settings.openrouter_api_key = ""
        mock_settings.ollama_model = "llama3.2"
        mock_settings.ollama_base_url = "http://ollama:11434"

        # Should NOT raise — LLMGenerator.generate() catches GeneratorError and falls back
        answer = await gen.generate("what is X?", "some context")

    assert isinstance(answer, str)
    assert len(answer) > 0
