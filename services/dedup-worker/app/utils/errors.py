"""
Error classes for dedup-worker.

All errors are typed subclasses of KMSWorkerError with a stable error code
and a retryable flag that drives AMQP ack/nack behaviour in dedup_handler.

Error code namespace: KBWRK02xx — reserved for dedup-worker.
"""


class KMSWorkerError(Exception):
    """Base error for all KMS worker services.

    Args:
        message: Human-readable description of the failure.
        code: Stable machine-readable error code (e.g. KBWRK0201).
        retryable: When True the AMQP handler should nack with requeue=True;
            when False it should reject (dead-letter) the message.
    """

    def __init__(self, message: str, code: str, retryable: bool = True) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class DedupError(KMSWorkerError):
    """Base error for all deduplication-specific failures.

    Args:
        message: Human-readable description of the failure.
        code: Stable machine-readable error code.
        retryable: Whether the operation may succeed on retry.
    """

    def __init__(self, message: str, code: str, retryable: bool = True) -> None:
        super().__init__(message, code=code, retryable=retryable)


class HashLookupError(DedupError):
    """Raised when a Redis hash lookup or write operation fails.

    Args:
        checksum: The SHA-256 hash that was being looked up or stored.
        reason: Short description of the Redis failure.
        retryable: Defaults to True — Redis failures are typically transient.
    """

    def __init__(self, checksum: str, reason: str, retryable: bool = True) -> None:
        super().__init__(
            f"Redis hash lookup failed for checksum {checksum[:16]}...: {reason}",
            code="KBWRK0201",
            retryable=retryable,
        )
        self.checksum = checksum


class DatabaseError(DedupError):
    """Raised when an asyncpg query to kms_file_duplicates fails.

    Args:
        operation: The DB operation that failed (e.g. 'insert', 'select').
        reason: Short description of the database failure.
        retryable: Defaults to True — connection errors are typically transient.
    """

    def __init__(self, operation: str, reason: str, retryable: bool = True) -> None:
        super().__init__(
            f"Database operation '{operation}' failed: {reason}",
            code="KBWRK0202",
            retryable=retryable,
        )
        self.operation = operation
