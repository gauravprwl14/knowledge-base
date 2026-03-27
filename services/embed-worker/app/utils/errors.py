"""
Error classes for embed-worker.

All errors are typed subclasses of KMSWorkerError with a stable error code
and a retryable flag that drives AMQP ack/nack behaviour in embed_handler.
"""


class KMSWorkerError(Exception):
    """Base error for all KMS worker services.

    Args:
        message: Human-readable description of the failure.
        code: Stable machine-readable error code (e.g. KBWRK0001).
        retryable: When True the AMQP handler should nack with requeue=True;
            when False it should reject (dead-letter) the message.
    """

    def __init__(self, message: str, code: str, retryable: bool = True) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class ExtractionError(KMSWorkerError):
    """Raised when text extraction from a file fails.

    Args:
        file_path: Path to the file that could not be extracted.
        reason: Short description of the failure.
        retryable: Defaults to False — corrupt or unsupported files are terminal.
    """

    def __init__(self, file_path: str, reason: str, retryable: bool = False) -> None:
        super().__init__(
            f"Text extraction failed for '{file_path}': {reason}",
            code="KBWRK0201",
            retryable=retryable,
        )
        self.file_path = file_path


class EmbeddingError(KMSWorkerError):
    """Raised when the embedding model call fails.

    Args:
        reason: Short description of the failure.
        retryable: Defaults to True — model service outages are transient.
    """

    def __init__(self, reason: str, retryable: bool = True) -> None:
        super().__init__(
            f"Embedding generation failed: {reason}",
            code="KBWRK0202",
            retryable=retryable,
        )


class ChunkingError(KMSWorkerError):
    """Raised when text chunking produces an unexpected error.

    Args:
        reason: Short description of the failure.
        retryable: Defaults to False — chunking errors are typically logic bugs.
    """

    def __init__(self, reason: str, retryable: bool = False) -> None:
        super().__init__(
            f"Text chunking failed: {reason}",
            code="KBWRK0203",
            retryable=retryable,
        )
