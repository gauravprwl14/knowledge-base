# ADR-0026 — LLM Provider Abstraction Layer

- **Status**: Accepted
- **Date**: 2026-03-17
- **Deciders**: Engineering Team
- **Tags**: llm, providers, anthropic, claude, ollama, openrouter, abstraction

---

## Context and Problem Statement

KMS currently has LLM calls scattered across the codebase: rag-service calls Ollama directly, with OpenRouter referenced as a fallback. There is no typed abstraction — each call site performs its own provider check and model selection. This creates three concrete problems:

1. **Ollama is too heavy for most development machines.** Running `llama3.2:3b` locally requires significant RAM/VRAM. The default `.kms/config.json` ships with `llm.enabled: false` precisely because Ollama cannot be assumed available.
2. **Different tasks require different model capabilities.** Research queries benefit from Perplexity's live-index models; analysis and generation benefit from Claude's reasoning quality. A single model selection cannot serve all task types well.
3. **API keys are optional by design.** The system must remain fully functional with zero LLM providers configured — graceful degradation to Tier 3 retrieval (ADR-0024) is the defined fallback, not an error condition.

The question is how to introduce a clean provider abstraction without over-engineering for a system that may have zero, one, or multiple LLM providers configured at any given time.

---

## Decision Drivers

- Ollama is explicitly not the default — Claude API should be the primary LLM for all generation tasks
- The factory pattern must return `None` (not raise) when no provider is configured — the LLM Guard (ADR-0024) converts `None` into a Tier 3 retrieval result
- Different capability classes (research, analysis, generation) warrant different provider preferences
- No new mandatory dependency: the abstraction must work with zero API keys configured
- NestJS (kms-api) also selects an external agent provider — the same hierarchy should apply there
- LiteLLM and similar unified SDKs add meaningful dependency weight and indirection for a capability requirement that can be expressed in ~50 lines of typed Python

---

## Considered Options

### Option 1 — LiteLLM unified interface

LiteLLM provides a single `completion()` call across 100+ LLM providers. Routing is done via model name strings.

- Production-tested, broad provider coverage
- Adds a non-trivial dependency (`litellm` pulls in many transitive packages)
- Model name strings are stringly-typed — capability routing requires a separate mapping layer on top
- May over-engineer the requirement: KMS uses three providers, not one hundred

### Option 2 — OpenRouter only

Route all LLM calls through the OpenRouter API. Select the model per task (e.g., `perplexity/sonar-pro` for research, `anthropic/claude-3.5-sonnet` for analysis).

- Single API key, 200+ models, no local GPU requirement
- Vendor lock-in: all LLM traffic routes through a third-party proxy
- Direct Anthropic API is more reliable and lower-latency for Claude calls
- If OpenRouter is unreachable, all LLM capabilities fail simultaneously

### Option 3 — Custom capability-based factory (no new dependency)

Typed factory functions — `get_research_llm()`, `get_analysis_llm()`, `get_generation_llm()` — each with an explicit ordered provider preference list. Functions return `None` when no configured provider matches.

- No new dependency: uses `anthropic`, `openai` (for OpenRouter), `langchain_anthropic`, `langchain_openai` which are already present or lightweight
- Provider preference is explicit and auditable per capability class
- `None` return is first-class — callers must handle it, enforcing graceful degradation at compile time
- Easy to extend: adding a new provider means adding one conditional branch per factory function

### Option 4 — Anthropic SDK + optional Ollama (with Option 3 factory pattern)

Use the Anthropic SDK (`anthropic` / `langchain-anthropic`) as the primary provider for analysis, synthesis, and generation. Use OpenRouter as a secondary (alternative or research routing). Use Ollama only as an optional local fallback when `OLLAMA_BASE_URL` is set. Apply Option 3's factory pattern to express this hierarchy.

- Claude is the best available model for the use cases KMS targets — making it primary rather than secondary reflects the actual quality hierarchy
- Anthropic SDK is a first-party dependency with strong reliability guarantees
- OpenRouter covers research use cases (Perplexity) and acts as a secondary for Claude access when direct Anthropic API is not preferred
- Ollama remains supported for offline/local development without being a required dependency
- Factory pattern gives clean capability routing; `None` return enforces the LLM Guard contract

---

## Decision Outcome

**Chosen option: Option 4 with Option 3's factory pattern.**

Claude API via the Anthropic SDK is the primary LLM for analysis, synthesis, and generation. This reflects the actual quality hierarchy: Claude outperforms `llama3.2:3b` for every task KMS requires generation for, and the direct SDK eliminates the OpenRouter proxy hop for the most common code path. OpenRouter serves as the secondary and as the only route to Perplexity for research queries. Ollama is retained as an optional local fallback when `OLLAMA_BASE_URL` is present but is never assumed available.

The factory pattern (Option 3) provides the typed capability routing without introducing LiteLLM or any new mandatory dependency. The `None` return contract forces callers to implement the LLM Guard, which is already the defined fallback in ADR-0024.

---

## Provider Hierarchy

Providers are checked in order per capability class. The first configured provider is used. If none is configured, the factory returns `None`.

| Capability | Primary | Secondary | Fallback | None → |
|------------|---------|-----------|----------|--------|
| `research` | Perplexity via OpenRouter | Claude API | — | Tier 3 retrieval |
| `analysis` | Claude API | OpenRouter (Claude) | — | Tier 3 retrieval |
| `synthesis` | Claude API | OpenRouter (Claude) | — | Tier 3 retrieval |
| `generation` | Claude API | OpenRouter (Claude) | Ollama (if running) | Tier 3 retrieval |
| `embedding` | BGE-M3 (local, always) | — | — | N/A (never None) |

---

## Environment Variables

Checked in priority order at startup. All are optional.

| Variable | Enables | Required |
|----------|---------|----------|
| `ANTHROPIC_API_KEY` | Claude API (primary for analysis, synthesis, generation) | No |
| `OPENROUTER_API_KEY` | OpenRouter (research via Perplexity; secondary for Claude) | No |
| `OLLAMA_BASE_URL` | Ollama local fallback for generation | No |

If none are set, all factory functions return `None` and the LLM Guard falls through to Tier 3 retrieval on every query.

---

## Python Factory Implementation

```python
# rag-service/app/services/llm_factory.py

from __future__ import annotations
from typing import Optional
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from app.config import settings

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def get_analysis_llm(temperature: float = 0.2) -> Optional[ChatAnthropic | ChatOpenAI]:
    """Return the best available LLM for analysis and synthesis tasks.

    Returns:
        Configured LLM instance, or None if no provider is available.
        Callers must handle None via the LLM Guard (see ADR-0024).
    """
    if settings.anthropic_api_key:
        return ChatAnthropic(
            model="claude-sonnet-4-6",
            temperature=temperature,
            api_key=settings.anthropic_api_key,
        )
    if settings.openrouter_api_key:
        return ChatOpenAI(
            base_url=OPENROUTER_BASE_URL,
            api_key=settings.openrouter_api_key,
            model="anthropic/claude-3.5-sonnet",
            temperature=temperature,
        )
    return None


def get_research_llm(temperature: float = 0.3) -> Optional[ChatOpenAI | ChatAnthropic]:
    """Return the best available LLM for research queries requiring live-index access.

    Returns:
        Configured LLM instance, or None if no provider is available.
    """
    if settings.openrouter_api_key:
        return ChatOpenAI(
            base_url=OPENROUTER_BASE_URL,
            api_key=settings.openrouter_api_key,
            model="perplexity/sonar-pro",
            temperature=temperature,
        )
    if settings.anthropic_api_key:
        return ChatAnthropic(
            model="claude-sonnet-4-6",
            temperature=temperature,
            api_key=settings.anthropic_api_key,
        )
    return None


def get_generation_llm(temperature: float = 0.7) -> Optional[ChatAnthropic | ChatOpenAI]:
    """Return the best available LLM for content generation tasks.

    Includes Ollama as a local fallback when OLLAMA_BASE_URL is configured.

    Returns:
        Configured LLM instance, or None if no provider is available.
    """
    if settings.anthropic_api_key:
        return ChatAnthropic(
            model="claude-sonnet-4-6",
            temperature=temperature,
            api_key=settings.anthropic_api_key,
        )
    if settings.openrouter_api_key:
        return ChatOpenAI(
            base_url=OPENROUTER_BASE_URL,
            api_key=settings.openrouter_api_key,
            model="anthropic/claude-3.5-sonnet",
            temperature=temperature,
        )
    if settings.ollama_base_url:
        return ChatOpenAI(
            base_url=settings.ollama_base_url,
            api_key="ollama",
            model="llama3.2:3b",
            temperature=temperature,
        )
    return None
```

### LLM Guard Usage (enforced at every call site)

```python
# rag-service/app/services/generator.py

from app.services.llm_factory import get_analysis_llm

llm = get_analysis_llm()
if llm is None:
    # LLM Guard: no provider configured — return Tier 3 retrieval result
    return build_retrieval_response(chunks, generation_skipped=True, reason="no_llm_available")

response = await llm.ainvoke(prompt)
```

---

## NestJS Equivalent (kms-api external agent adapter)

```typescript
// kms-api/src/modules/agents/external-agent.adapter.ts

function getDefaultExternalAgent(): 'claude-api' | 'openrouter' | 'none' {
  if (process.env.ANTHROPIC_API_KEY) return 'claude-api';
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  return 'none';  // graceful degradation — caller must handle 'none'
}
```

The `'none'` return maps to the same Tier 3 fallback defined in ADR-0024 Tier 4 — the ExternalAgentAdapter returns the pre-built retrieval result with `generation_skipped: true`.

---

## New Dependencies

| Package | Service | Notes |
|---------|---------|-------|
| `langchain-anthropic>=0.3.0` | `services/rag-service` | `ChatAnthropic` wrapper |
| `anthropic>=0.40.0` | `services/rag-service` | Transitive via `langchain-anthropic` |

`langchain-openai` is already present in rag-service for the existing OpenRouter fallback. `ollama` package is not required — Ollama is accessed via its OpenAI-compatible REST API using `ChatOpenAI`.

---

## Positive Consequences

- Claude API is the primary LLM path — higher generation quality with lower latency than local Ollama
- System is fully functional with zero API keys: all factory functions return `None`, LLM Guard routes to Tier 3 retrieval
- Adding a new provider requires editing one factory function, not scattered call sites
- Research queries route to Perplexity's live-index model when OpenRouter is configured — higher relevance for current-events queries
- `None` return type is explicit in function signatures — IDEs and type checkers catch unguarded LLM calls at development time

## Negative Consequences

- Each factory function encodes provider preferences as a conditional chain — if preferences need to differ per deployment, a config-driven approach would be required
- Ollama is demoted to last-resort fallback for generation only — teams that prefer local-first development must set `OLLAMA_BASE_URL` explicitly and accept it only applies to the `generation` capability class
- `get_research_llm()` has no Ollama fallback — research capability is unavailable with zero API keys (acceptable: Perplexity/live-index requires network access by definition)
- `langchain-anthropic` introduces a transitive `httpx` dependency version constraint that must be kept compatible with `fastapi`'s `httpx` usage

---

## Links

- ADR-0024 — Tiered retrieval response strategy (LLM Guard, Tier 4 external agent, `generation_skipped` contract)
- ADR-0023 — External agent adapter design (kms-api NestJS side of provider selection)
- ADR-0013 — rag-service scoped to RAG pipeline orchestration (LangGraph + LLM call home)
- `.kms/config.json` — `llm.enabled`, `external_agents.enabled` runtime feature flags
- `services/rag-service/app/services/llm_factory.py` — implementation home
- `services/rag-service/requirements.txt` — `langchain-anthropic` dependency
- Error code namespace: `KBRAG` (RAG/generation errors from factory call sites)
