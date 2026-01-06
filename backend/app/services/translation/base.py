from abc import ABC, abstractmethod
from typing import Optional


class TranslationProvider(ABC):
    """Abstract base class for translation providers."""

    name: str = "base"

    @abstractmethod
    async def translate(
        self,
        text: str,
        source_language: str,
        target_language: str,
        **kwargs
    ) -> str:
        """
        Translate text from source language to target language.

        Args:
            text: Text to translate
            source_language: Source language code (e.g., 'en', 'auto')
            target_language: Target language code (e.g., 'es', 'fr')

        Returns:
            Translated text
        """
        pass

    @abstractmethod
    async def is_available(self) -> bool:
        """Check if provider is available and properly configured."""
        pass
