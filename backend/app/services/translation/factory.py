from typing import Dict, Type

from app.services.translation.base import TranslationProvider
from app.services.translation.openai_translator import OpenAITranslationProvider
from app.services.translation.gemini_translator import GeminiTranslationProvider


class TranslationFactory:
    """Factory for creating translation providers."""

    _providers: Dict[str, Type[TranslationProvider]] = {
        "openai": OpenAITranslationProvider,
        "gemini": GeminiTranslationProvider,
    }

    _instances: Dict[str, TranslationProvider] = {}

    @classmethod
    def get_translator(cls, provider_name: str) -> TranslationProvider:
        """
        Get a translation provider instance.

        Args:
            provider_name: Name of the provider ('openai', 'gemini')

        Returns:
            TranslationProvider instance

        Raises:
            ValueError if provider not found
        """
        provider_name = provider_name.lower()

        if provider_name not in cls._providers:
            available = ", ".join(cls._providers.keys())
            raise ValueError(
                f"Unknown translation provider: {provider_name}. "
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
            provider = cls.get_translator(name)
            if await provider.is_available():
                available.append(name)
        return available
