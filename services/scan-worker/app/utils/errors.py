"""
Error classes for scan-worker.

All errors are typed subclasses of KMSWorkerError with a stable error code
and a retryable flag that drives AMQP ack/nack behaviour in scan_handler.
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


class FileDiscoveryError(KMSWorkerError):
    """Raised when the connector fails to list or access files from a source.

    Args:
        source_id: UUID of the source being scanned.
        reason: Short description of the failure.
        retryable: Defaults to True (transient connector failures are retryable).
    """

    def __init__(self, source_id: str, reason: str, retryable: bool = True) -> None:
        super().__init__(
            f"File discovery failed for source {source_id}: {reason}",
            code="KBWRK0101",
            retryable=retryable,
        )
        self.source_id = source_id


class ConnectorError(KMSWorkerError):
    """Raised when a source connector cannot connect or authenticate.

    Args:
        connector: Name/type of the connector (e.g. 'google_drive', 'local').
        reason: Short description of the failure.
        retryable: Defaults to False — auth/config errors are typically terminal.
    """

    def __init__(self, connector: str, reason: str, retryable: bool = False) -> None:
        super().__init__(
            f"Connector '{connector}' error: {reason}",
            code="KBWRK0102",
            retryable=retryable,
        )
        self.connector = connector


class QueuePublishError(KMSWorkerError):
    """Raised when publishing a downstream message to RabbitMQ fails.

    Args:
        queue: Name of the target queue.
        reason: Short description of the failure.
    """

    def __init__(self, queue: str, reason: str) -> None:
        super().__init__(
            f"Failed to publish to queue '{queue}': {reason}",
            code="KBWRK0103",
            retryable=True,
        )
        self.queue = queue
