"""Typed error hierarchy for rag-service.

Error codes follow the KBRAG* namespace as defined in ENGINEERING_STANDARDS.md.
"""


class RAGServiceError(Exception):
    """Base error for all rag-service failures.

    Args:
        message: Human-readable description of the failure.
        code: Stable machine-readable error code (e.g. KBRAG0001).
        status_code: HTTP status code to return to the caller.
    """

    def __init__(self, message: str, code: str, status_code: int = 500):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class RetrievalError(RAGServiceError):
    """Raised when the retrieval step fails (embedding or Qdrant unavailable).

    Args:
        detail: Short description of the retrieval failure.
    """

    def __init__(self, detail: str = "retrieval failed"):
        super().__init__(detail, "KBRAG0001", 503)


class SearchUnavailableError(RAGServiceError):
    """Raised when search-api is unreachable.

    Args:
        detail: Short description of the connectivity failure.
    """

    def __init__(self, detail: str = "search-api unreachable"):
        super().__init__(detail, "KBRAG0003", 503)


class LLMUnavailableError(RAGServiceError):
    """Raised when the configured LLM provider is unavailable.

    Args:
        detail: Short description of the LLM connectivity failure.
    """

    def __init__(self, detail: str = "LLM provider unavailable"):
        super().__init__(detail, "KBRAG0002", 503)


class GeneratorError(RAGServiceError):
    """Raised when all LLM generation attempts fail (Ollama + OpenRouter).

    Args:
        detail: Short description of the generation failure.
    """

    def __init__(self, detail: str = "all LLM providers failed"):
        super().__init__(detail, "KBRAG0005", 503)


class RunNotFoundError(RAGServiceError):
    """Raised when a requested run ID does not exist in the store.

    Args:
        run_id: The run identifier that was not found.
    """

    def __init__(self, run_id: str):
        super().__init__(f"Run {run_id} not found", "KBRAG0007", 404)


class QueryTooLongError(RAGServiceError):
    """Raised when the query exceeds the maximum allowed length.

    Args: None — message is fixed.
    """

    def __init__(self):
        super().__init__("Query exceeds 500 characters", "KBRAG0004", 400)


class NoRelevantContentError(RAGServiceError):
    """Raised when retrieval returns no relevant chunks for the query.

    Args: None — message is fixed.
    """

    def __init__(self):
        super().__init__("No relevant content found for query", "KBRAG0006", 200)
