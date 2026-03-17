# rag-service

Python 3.12 FastAPI service providing RAG (Retrieval-Augmented Generation) Q&A over the knowledge base.

## Responsibilities
- Retrieve relevant document chunks via keyword/vector search
- Generate answers using Ollama (local) or OpenRouter (cloud)
- Stream responses via Server-Sent Events (SSE)
- Return citations with file references

## Port
8002

## Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/chat/completions | Ask a question, get streamed answer + citations |
| GET | /health | Health (includes llm_enabled flag) |
| GET | /health/ready | Readiness (DB pool connected) |

## LLM Configuration
```bash
LLM_ENABLED=false           # Default — returns search excerpts only
LLM_ENABLED=true            # Enable LLM
LLM_PROVIDER=ollama         # Local Ollama (default)
LLM_PROVIDER=openrouter     # Cloud OpenRouter
OPENROUTER_API_KEY=sk-...   # Required for openrouter
```

## Graceful Degradation
When `LLM_ENABLED=false`, the service still returns relevant document excerpts (no LLM call). Frontend shows a "LLM disabled" indicator. This is the default for the minimal prototype tier.

## Error Codes
| Code | Meaning |
|------|---------|
| RAG1000 | Invalid chat request |
| RAG2000 | Context retrieval failed |
| RAG3000 | LLM provider unavailable |
| RAG4000 | Context too large |
