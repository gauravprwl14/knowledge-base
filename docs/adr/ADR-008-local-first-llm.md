# ADR-008: Local-First LLM with Cloud Fallback

**Date**: 2026-03-17
**Status**: Accepted
**Deciders**: Architecture team

## Context

The system needs LLMs for:
1. **Embeddings** — vectorizing document content for semantic search
2. **RAG generation** — answering questions from the knowledge base
3. **Entity extraction** — NER for knowledge graph building
4. **Community labeling** — naming Leiden-detected clusters

Options: fully local (free, private), fully cloud (paid, easy), hybrid.

## Decision

**Local-first, cloud-fallback configuration-driven architecture.**

```bash
# Environment variables control provider selection
EMBEDDING_PROVIDER=local         # or: openai, openrouter
LLM_PROVIDER=ollama              # or: openrouter, openai
OLLAMA_HOST=http://ollama:11434
OPENROUTER_API_KEY=sk-or-...    # Optional
OPENAI_API_KEY=sk-...           # Optional
```

**Embedding strategy:**
| Provider | Model | Dims | Cost | Use |
|----------|-------|------|------|-----|
| Ollama (local) | nomic-embed-text | 768 | Free | Default |
| OpenAI (cloud) | text-embedding-3-small | 1536 | $0.02/1M | High-quality option |
| OpenRouter | Via OpenAI-compatible API | varies | Pay-as-go | Flexible |

**Generation strategy:**
| Provider | Model | Cost | Use |
|----------|-------|------|-----|
| Ollama (local) | llama3.2:3b / mistral:7b | Free | Default |
| OpenRouter | claude-sonnet-4-6 / gpt-4o | Pay-per-token | Premium Q&A |

**Entity extraction:** spaCy `en_core_web_sm` (free, local). LLM extraction only for complex cases.

**Provider interface** (all providers implement the same interface):
```python
class EmbeddingProvider(ABC):
    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]: ...

class LLMProvider(ABC):
    @abstractmethod
    async def generate(self, prompt: str) -> str: ...
    @abstractmethod
    async def stream(self, prompt: str) -> AsyncGenerator[str, None]: ...
```

## What the User Needs to Provide

The system works **fully offline** without any API keys (using Ollama local models).

To use premium cloud models, provide:
- `OPENROUTER_API_KEY` — single key for Claude, GPT-4o, Mistral, etc. via OpenRouter
- OR `OPENAI_API_KEY` — direct OpenAI access

## Consequences

**Positive:**
- Privacy: sensitive documents processed locally by default
- Cost control: zero cost for local-only operation
- Flexibility: swap providers without code changes
- Testable: mock provider for unit tests

**Negative:**
- Ollama requires GPU or fast CPU for acceptable speed
- Local models (3b-7b) are less capable than GPT-4o / Claude
- Two model sizes to maintain (local + cloud)

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Cloud-only (OpenAI) | Privacy concerns, ongoing cost, no offline mode |
| Local-only (Ollama) | Quality limitations for complex RAG; no option to upgrade |
| Hugging Face Inference API | Slower, rate-limited on free tier |
