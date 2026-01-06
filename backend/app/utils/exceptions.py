class VoiceAppException(Exception):
    """Base exception for Voice App."""

    def __init__(self, message: str, code: str = None):
        self.message = message
        self.code = code or "VOICE_APP_ERROR"
        super().__init__(self.message)


class AudioProcessingError(VoiceAppException):
    """Error during audio processing."""

    def __init__(self, message: str):
        super().__init__(message, "AUDIO_PROCESSING_ERROR")


class TranscriptionError(VoiceAppException):
    """Error during transcription."""

    def __init__(self, message: str, provider: str = None):
        self.provider = provider
        super().__init__(message, "TRANSCRIPTION_ERROR")


class TranslationError(VoiceAppException):
    """Error during translation."""

    def __init__(self, message: str, provider: str = None):
        self.provider = provider
        super().__init__(message, "TRANSLATION_ERROR")


class StorageError(VoiceAppException):
    """Error with file storage."""

    def __init__(self, message: str):
        super().__init__(message, "STORAGE_ERROR")


class ProviderNotAvailableError(VoiceAppException):
    """Provider is not available or not configured."""

    def __init__(self, provider: str):
        super().__init__(
            f"Provider '{provider}' is not available or not properly configured",
            "PROVIDER_NOT_AVAILABLE"
        )


class RateLimitError(VoiceAppException):
    """Rate limit exceeded."""

    def __init__(self, retry_after: int = None):
        self.retry_after = retry_after
        message = "Rate limit exceeded"
        if retry_after:
            message += f". Retry after {retry_after} seconds"
        super().__init__(message, "RATE_LIMIT_ERROR")
