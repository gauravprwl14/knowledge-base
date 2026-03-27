"""Typed error classes for voice-app.

All errors are typed subclasses of VoiceWorkerError with a stable error code
(``KBWRK*``) and a ``retryable`` flag that drives AMQP nack/reject behaviour.
"""


class VoiceWorkerError(Exception):
    """Base error for the voice-app AMQP worker.

    Args:
        message: Human-readable description of the failure.
        retryable: When True the consumer should nack with requeue=True;
            when False the message should be rejected (sent to DLQ).
        code: Stable KBWRK error code for structured logging.
    """

    def __init__(
        self,
        message: str,
        retryable: bool = True,
        code: str = "KBWRK0001",
    ) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.code = code


class TranscriptionError(VoiceWorkerError):
    """Raised when Whisper fails to transcribe an audio file.

    Args:
        file_path: Path to the audio file that failed.
        reason: Short description of why transcription failed.
        retryable: Defaults to False — missing/corrupt files are terminal.
    """

    def __init__(self, file_path: str, reason: str, retryable: bool = False) -> None:
        super().__init__(
            f"Transcription failed for {file_path}: {reason}",
            retryable=retryable,
            code="KBWRK0010",
        )
        self.file_path = file_path


class FileTooLargeError(VoiceWorkerError):
    """Raised when the audio file exceeds the configured size limit.

    Args:
        file_path: Path to the oversized file.
        size_mb: Actual file size in megabytes.
    """

    def __init__(self, file_path: str, size_mb: float) -> None:
        super().__init__(
            f"File too large: {file_path} ({size_mb:.1f}MB)",
            retryable=False,
            code="KBWRK0011",
        )
        self.file_path = file_path
        self.size_mb = size_mb


class UnsupportedAudioFormatError(VoiceWorkerError):
    """Raised when the MIME type is not in the supported audio formats list.

    Args:
        mime_type: The unsupported MIME type string.
    """

    def __init__(self, mime_type: str) -> None:
        super().__init__(
            f"Unsupported audio format: {mime_type}",
            retryable=False,
            code="KBWRK0012",
        )
        self.mime_type = mime_type


# Keep legacy name for backward compatibility with any pre-existing imports.
VoiceAppError = VoiceWorkerError
