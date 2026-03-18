"""Generator service for rag-service.

Streams answers from Ollama (local) with an OpenRouter API fallback.
Both providers are called via aiohttp with NDJSON / SSE line-by-line parsing.
"""

from __future__ import annotations

import json
from typing import AsyncIterator

import aiohttp
import structlog

from app.config import get_settings
from app.errors import GeneratorError

logger = structlog.get_logger(__name__)
settings = get_settings()

_PROMPT_TEMPLATE = """\
You are a knowledge base assistant. Answer based on the context below.

Context:
{context}

Question: {query}
Answer:"""


class Generator:
    """Generates answers using Ollama (local) with OpenRouter fallback.

    Token streaming is implemented via async generators so the caller can
    yield SSE events to the client without buffering the full answer.

    Example:
        generator = Generator()
        async for token in generator.generate_stream(query, chunks, run_id="..."):
            print(token, end="", flush=True)
    """

    async def generate_stream(
        self,
        query: str,
        context_chunks: list,
        run_id: str,
    ) -> AsyncIterator[str]:
        """Build a prompt from query + context and stream tokens to the caller.

        Tries Ollama first; falls back to OpenRouter if Ollama is unavailable
        or returns a non-2xx response. Raises GeneratorError when both fail.

        Args:
            query: The user's natural-language question.
            context_chunks: List of RetrievedChunk (or any objects with a
                ``content`` attribute / "content" key) used to build context.
            run_id: Unique run identifier — attached to log records.

        Yields:
            str: Successive text tokens from the LLM.

        Raises:
            GeneratorError: When both Ollama and OpenRouter fail.
        """
        log = logger.bind(run_id=run_id)
        context = self._build_context(context_chunks)
        prompt = _PROMPT_TEMPLATE.format(context=context, query=query)

        # Try Ollama first
        try:
            log.info("Streaming from Ollama", model=settings.ollama_model)
            async for token in self._ollama_stream(prompt):
                yield token
            return
        except Exception as ollama_exc:
            log.warning(
                "Ollama unavailable — falling back to OpenRouter",
                error=str(ollama_exc),
            )

        # Fallback: OpenRouter
        if settings.openrouter_api_key:
            try:
                log.info("Streaming from OpenRouter", model=settings.openrouter_model)
                async for token in self._openrouter_stream(prompt):
                    yield token
                return
            except Exception as or_exc:
                log.error("OpenRouter also failed", error=str(or_exc))
                raise GeneratorError(
                    f"Both Ollama and OpenRouter failed: {or_exc}"
                ) from or_exc

        raise GeneratorError("Ollama failed and no OpenRouter key configured")

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _build_context(self, chunks: list) -> str:
        """Concatenate chunk contents into a single context block.

        Args:
            chunks: List of RetrievedChunk instances or dicts with a ``content`` key.

        Returns:
            str: Context string with chunks separated by ``---``.
        """
        parts: list[str] = []
        for chunk in chunks:
            if hasattr(chunk, "content"):
                parts.append(chunk.content)
            elif isinstance(chunk, dict):
                parts.append(chunk.get("content", ""))
        return "\n---\n".join(parts)

    async def _ollama_stream(self, prompt: str) -> AsyncIterator[str]:
        """Stream tokens from the Ollama /api/generate endpoint.

        Ollama uses NDJSON streaming — each line is a JSON object with a
        ``response`` field carrying a token and a ``done`` boolean.

        Args:
            prompt: Fully-assembled prompt string.

        Yields:
            str: Token text from each non-empty Ollama response line.

        Raises:
            Exception: Propagates HTTP or connectivity errors to the caller.
        """
        url = f"{settings.ollama_base_url}/api/generate"
        payload = {
            "model": settings.ollama_model,
            "prompt": prompt,
            "stream": True,
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=120),
            ) as resp:
                resp.raise_for_status()
                async for raw_line in resp.content:
                    line = raw_line.strip()
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if token := data.get("response"):
                        yield token
                    if data.get("done"):
                        break

    async def _openrouter_stream(self, prompt: str) -> AsyncIterator[str]:
        """Stream tokens from the OpenRouter chat completions endpoint.

        OpenRouter uses the OpenAI-compatible SSE format — lines prefixed with
        ``data: `` and the sentinel ``data: [DONE]`` to signal end of stream.

        Args:
            prompt: Fully-assembled prompt string.

        Yields:
            str: Token text extracted from each SSE data chunk.

        Raises:
            Exception: Propagates HTTP or connectivity errors to the caller.
        """
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": settings.openrouter_model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": settings.max_tokens,
            "temperature": settings.temperature,
            "stream": True,
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=120),
            ) as resp:
                resp.raise_for_status()
                async for raw_line in resp.content:
                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[len("data: "):]
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue
                    token = (
                        data.get("choices", [{}])[0]
                        .get("delta", {})
                        .get("content", "")
                    )
                    if token:
                        yield token


# ---------------------------------------------------------------------------
# Legacy non-streaming helper retained for backward-compat with existing
# chat.py which calls generator.generate() (non-streaming path).
# ---------------------------------------------------------------------------


class LLMGenerator(Generator):
    """Alias kept for backward-compatibility with existing chat endpoint code.

    The async ``generate`` method wraps the streaming generator by accumulating
    all tokens into a single string.

    Example:
        gen = LLMGenerator()
        answer = await gen.generate(question, context)
    """

    async def generate(self, question: str, context: str) -> str:
        """Generate a complete (non-streaming) answer.

        Accumulates all tokens from generate_stream into a single string.

        Args:
            question: The user's question.
            context: Pre-built context string.

        Returns:
            str: Complete generated answer, or a fallback message when the LLM
                is disabled.
        """
        if not settings.llm_enabled:
            return self._fallback_response(context)

        # Wrap context string into a minimal list for generate_stream
        class _Chunk:
            def __init__(self, content: str) -> None:
                self.content = content

        tokens: list[str] = []
        try:
            async for token in self.generate_stream(
                question, [_Chunk(context)], run_id="legacy"
            ):
                tokens.append(token)
        except GeneratorError:
            return self._fallback_response(context)

        return "".join(tokens)

    async def generate_stream(  # type: ignore[override]
        self, question: str, context: str, run_id: str = "legacy"  # type: ignore[override]
    ) -> "AsyncIterator[str]":
        """Stream wrapper accepting a plain context string (legacy signature).

        Delegates to the parent implementation after wrapping context in a list.

        Args:
            question: The user's question.
            context: Pre-built context string.
            run_id: Optional run identifier for log context.

        Yields:
            str: Token strings.
        """
        if not settings.llm_enabled:
            yield self._fallback_response(context)
            return

        class _Chunk:
            def __init__(self, content: str) -> None:
                self.content = content

        async for token in super().generate_stream(
            question, [_Chunk(context)], run_id=run_id
        ):
            yield token

    def _fallback_response(self, context: str) -> str:
        """Return a static response when LLM is disabled.

        Args:
            context: Context string to include in the fallback response.

        Returns:
            str: Human-readable message with context excerpts or a no-results note.
        """
        if not context:
            return (
                "No relevant documents found in the knowledge base for your question."
            )
        return (
            "LLM is disabled. Here are the most relevant excerpts from your "
            f"knowledge base:\n\n{context}"
        )
