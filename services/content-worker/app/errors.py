"""
Typed error hierarchy for content-worker.

All errors must:
- Have a KBCNT error code (matches NestJS ContentModule error codes)
- Declare whether they are retryable (nack requeue=True) or terminal (reject)
- Include a human-readable message safe to surface in the UI

Usage:
    raise ContentIngestionError("No captions available for this video")
    raise ContentGenerationError("Claude API rate limit exceeded", retryable=True)
"""


class KMSContentError(Exception):
    """
    Base class for all content-worker errors.

    Args:
        message: Human-readable error message (will be stored in job.error_message).
        code: KBCNT error code string (e.g. 'KBCNT0003').
        retryable: If True, worker nacks with requeue=True (→ retry queue).
                   If False, worker rejects (→ dead-letter exchange).
    """

    def __init__(self, message: str, code: str, retryable: bool = False) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.retryable = retryable


class ContentIngestionError(KMSContentError):
    """
    Source ingestion failed (transcript/content unavailable).

    Raised by: youtube_ingestor, url_ingestor, video_ingestor, document_ingestor.
    Terminal: most ingestion failures are non-retryable (e.g. video has no captions).
    Exception: voice-app timeout uses KBCNT0011 (retryable=True).
    """

    def __init__(self, message: str, retryable: bool = False) -> None:
        super().__init__(message, code="KBCNT0003", retryable=retryable)


class ContentGenerationError(KMSContentError):
    """
    A generation step (Claude API call) failed.

    Raised by step runners when Claude returns an error or times out.
    retryable=True for rate limits (429); False for content policy rejections.
    """

    def __init__(self, message: str, retryable: bool = False) -> None:
        super().__init__(message, code="KBCNT0004", retryable=retryable)


class ContentVariationError(KMSContentError):
    """Variation generation failed (max variations exceeded, etc.)."""

    def __init__(self, message: str) -> None:
        super().__init__(message, code="KBCNT0009", retryable=False)


class VoiceAppUnavailableError(KMSContentError):
    """
    voice-app HTTP call failed (timeout or connection refused).

    retryable=True — the job will be re-queued to kms.content.retry.
    Worker sends nack(requeue=False) so the message goes to DLX, then the
    DLX binding routes it to kms.content.retry with a delay.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message, code="KBCNT0011", retryable=True)


class ChatContextError(KMSContentError):
    """Chat context could not be built (job or piece not found, etc.)."""

    def __init__(self, message: str) -> None:
        super().__init__(message, code="KBCNT0008", retryable=False)


class UnsupportedSourceTypeError(KMSContentError):
    """Source type in AMQP message is not recognised."""

    def __init__(self, source_type: str) -> None:
        super().__init__(
            f"Unsupported source type: {source_type}",
            code="KBCNT0002",
            retryable=False,
        )
