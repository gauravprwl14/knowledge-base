from typing import Dict, Type

from app.services.transcription.base import TranscriptionProvider
from app.services.transcription.whisper import WhisperTranscriptionProvider
from app.services.transcription.groq import GroqTranscriptionProvider
from app.services.transcription.deepgram import DeepgramTranscriptionProvider


class TranscriptionFactory:
    """Factory for creating transcription providers."""

    _providers: Dict[str, Type[TranscriptionProvider]] = {
        "whisper": WhisperTranscriptionProvider,
        "groq": GroqTranscriptionProvider,
        "deepgram": DeepgramTranscriptionProvider,
    }

    _instances: Dict[str, TranscriptionProvider] = {}

    @classmethod
    def get_provider(cls, provider_name: str) -> TranscriptionProvider:
        """
        Get a transcription provider instance.

        Args:
            provider_name: Name of the provider ('whisper', 'groq', 'deepgram')

        Returns:
            TranscriptionProvider instance

        Raises:
            ValueError if provider not found
        """
        provider_name = provider_name.lower()

        if provider_name not in cls._providers:
            available = ", ".join(cls._providers.keys())
            raise ValueError(
                f"Unknown transcription provider: {provider_name}. "
                f"Available: {available}"
            )

        # Return cached instance or create new one
        if provider_name not in cls._instances:
            cls._instances[provider_name] = cls._providers[provider_name]()

        return cls._instances[provider_name]

    @classmethod
    def list_providers(cls) -> list[str]:
        """List available provider names."""
        return list(cls._providers.keys())

    @classmethod
    async def get_available_providers(cls) -> list[str]:
        """List providers that are properly configured and available."""
        available = []
        for name in cls._providers:
            provider = cls.get_provider(name)
            if await provider.is_available():
                available.append(name)
        return available

    @classmethod
    def register_provider(
        cls,
        name: str,
        provider_class: Type[TranscriptionProvider]
    ):
        """Register a new provider."""
        cls._providers[name.lower()] = provider_class
