from typing import AsyncIterator
import aiohttp
import structlog
from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()


class LLMGenerator:
    """Calls Ollama (local) or OpenRouter (cloud) to generate answers.
    Gracefully degrades: if LLM disabled, returns a search-results-only response."""

    async def generate(self, question: str, context: str) -> str:
        if not settings.llm_enabled:
            return self._fallback_response(context)

        if settings.llm_provider == "ollama":
            return await self._call_ollama(question, context)
        elif settings.llm_provider == "openrouter":
            return await self._call_openrouter(question, context)
        else:
            return self._fallback_response(context)

    async def generate_stream(self, question: str, context: str) -> AsyncIterator[str]:
        if not settings.llm_enabled:
            yield self._fallback_response(context)
            return

        if settings.llm_provider == "ollama":
            async for token in self._stream_ollama(question, context):
                yield token

    def _build_prompt(self, question: str, context: str) -> str:
        return f"""You are a helpful assistant. Answer the question using ONLY the provided context.
If the context doesn't contain relevant information, say so clearly.

Context:
{context}

Question: {question}

Answer:"""

    async def _call_ollama(self, question: str, context: str) -> str:
        prompt = self._build_prompt(question, context)
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{settings.ollama_base_url}/api/generate",
                json={"model": settings.ollama_model, "prompt": prompt, "stream": False},
                timeout=aiohttp.ClientTimeout(total=60),
            ) as resp:
                data = await resp.json()
                return data.get("response", "")

    async def _stream_ollama(self, question: str, context: str) -> AsyncIterator[str]:
        import json as _json
        prompt = self._build_prompt(question, context)
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{settings.ollama_base_url}/api/generate",
                json={"model": settings.ollama_model, "prompt": prompt, "stream": True},
                timeout=aiohttp.ClientTimeout(total=120),
            ) as resp:
                async for line in resp.content:
                    if line:
                        try:
                            data = _json.loads(line)
                            if token := data.get("response"):
                                yield token
                            if data.get("done"):
                                break
                        except Exception:
                            continue

    async def _call_openrouter(self, question: str, context: str) -> str:
        prompt = self._build_prompt(question, context)
        headers = {
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type": "application/json",
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json={
                    "model": settings.openrouter_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": settings.max_tokens,
                    "temperature": settings.temperature,
                },
                timeout=aiohttp.ClientTimeout(total=60),
            ) as resp:
                data = await resp.json()
                return data["choices"][0]["message"]["content"]

    def _fallback_response(self, context: str) -> str:
        if not context:
            return "No relevant documents found in the knowledge base for your question."
        return f"LLM is disabled. Here are the most relevant excerpts from your knowledge base:\n\n{context}"
