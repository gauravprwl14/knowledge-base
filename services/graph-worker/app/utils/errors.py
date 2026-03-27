"""
Error classes for graph-worker.

All errors are typed subclasses of KMSWorkerError with a stable error code
and a retryable flag that drives AMQP ack/nack behaviour in graph_handler.

Error code namespace: KBWRK03xx — reserved for graph-worker.
"""


class KMSWorkerError(Exception):
    """Base error for all KMS worker services.

    Args:
        message: Human-readable description of the failure.
        code: Stable machine-readable error code (e.g. KBWRK0301).
        retryable: When True the AMQP handler should nack with requeue=True;
            when False it should reject (dead-letter) the message.
    """

    def __init__(self, message: str, code: str, retryable: bool = True) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class GraphWorkerError(KMSWorkerError):
    """Base error for all graph-building failures.

    Args:
        message: Human-readable description of the failure.
        code: Stable machine-readable error code.
        retryable: Whether the operation may succeed on retry.
    """

    def __init__(self, message: str, code: str, retryable: bool = True) -> None:
        super().__init__(message, code=code, retryable=retryable)


class ChunkLoadError(GraphWorkerError):
    """Raised when asyncpg fails to retrieve chunks from kms_chunks.

    Args:
        file_id: The file whose chunks could not be loaded.
        reason: Short description of the database failure.
        retryable: Defaults to True — connection errors are typically transient.
    """

    def __init__(self, file_id: str, reason: str, retryable: bool = True) -> None:
        super().__init__(
            f"Failed to load chunks for file {file_id}: {reason}",
            code="KBWRK0301",
            retryable=retryable,
        )
        self.file_id = file_id


class NERExtractionError(GraphWorkerError):
    """Raised when the NER extraction step fails to produce entity annotations.

    Args:
        file_id: The file being processed during the failure.
        reason: Short description of the NER failure.
        retryable: Defaults to False — NER errors are usually deterministic.
    """

    def __init__(self, file_id: str, reason: str, retryable: bool = False) -> None:
        super().__init__(
            f"NER extraction failed for file {file_id}: {reason}",
            code="KBWRK0302",
            retryable=retryable,
        )
        self.file_id = file_id


class Neo4jWriteError(GraphWorkerError):
    """Raised when a Cypher write to Neo4j fails.

    Args:
        operation: Short label for the Cypher operation (e.g. 'MERGE File', 'MERGE Entity').
        reason: Short description of the Neo4j failure.
        retryable: Defaults to True — write failures may be transient.
    """

    def __init__(self, operation: str, reason: str, retryable: bool = True) -> None:
        super().__init__(
            f"Neo4j write failed during '{operation}': {reason}",
            code="KBWRK0303",
            retryable=retryable,
        )
        self.operation = operation


class StatusUpdateError(GraphWorkerError):
    """Raised when updating the kms_files status in PostgreSQL fails.

    Args:
        file_id: The file whose status could not be updated.
        reason: Short description of the database failure.
        retryable: Defaults to True — connection errors are typically transient.
    """

    def __init__(self, file_id: str, reason: str, retryable: bool = True) -> None:
        super().__init__(
            f"Failed to update status for file {file_id}: {reason}",
            code="KBWRK0304",
            retryable=retryable,
        )
        self.file_id = file_id
