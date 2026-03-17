"""Typed error hierarchy for rag-service."""


class RAGServiceError(Exception):
    def __init__(self, message: str, code: str, status_code: int = 500):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class SearchUnavailableError(RAGServiceError):
    def __init__(self, detail: str = "search-api unreachable"):
        super().__init__(detail, "KBRAG0003", 503)


class LLMUnavailableError(RAGServiceError):
    def __init__(self, detail: str = "LLM provider unavailable"):
        super().__init__(detail, "KBRAG0002", 503)


class RunNotFoundError(RAGServiceError):
    def __init__(self, run_id: str):
        super().__init__(f"Run {run_id} not found", "KBRAG0007", 404)


class QueryTooLongError(RAGServiceError):
    def __init__(self):
        super().__init__("Query exceeds 500 characters", "KBRAG0004", 400)


class NoRelevantContentError(RAGServiceError):
    def __init__(self):
        super().__init__("No relevant content found for query", "KBRAG0006", 200)
