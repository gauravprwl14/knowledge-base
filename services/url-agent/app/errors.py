"""Typed error hierarchy for url-agent.

All errors inherit from UrlAgentError which carries a retryable flag.
Workers should nack(requeue=True) for retryable errors and reject() for terminal ones.
"""
from __future__ import annotations


class UrlAgentError(Exception):
    """Base error for all url-agent errors."""

    code: str = "KBURL0000"

    def __init__(self, message: str, retryable: bool = False) -> None:
        super().__init__(message)
        # retryable=True → caller should nack(requeue=True); False → reject()
        self.retryable = retryable


class UnsupportedUrlError(UrlAgentError):
    """URL scheme or domain is not supported."""

    code: str = "KBURL0001"

    def __init__(self, url: str) -> None:
        super().__init__(f"Unsupported URL: {url}", retryable=False)


class ExtractionError(UrlAgentError):
    """Content extraction failed.

    retryable defaults to True because most extraction failures are
    transient (network timeouts, rate limits). Set retryable=False
    for permanent failures like missing dependencies.
    """

    code: str = "KBURL0002"

    def __init__(self, message: str, retryable: bool = True) -> None:
        super().__init__(message, retryable=retryable)


class PublishError(UrlAgentError):
    """Failed to publish to RabbitMQ.

    Always retryable — RabbitMQ connection failures are transient.
    """

    code: str = "KBURL0003"

    def __init__(self, message: str) -> None:
        super().__init__(message, retryable=True)
