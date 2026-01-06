import aiohttp
from typing import Optional

from app.services.translation.base import TranslationProvider
from app.config import get_settings

settings = get_settings()


# Language code to name mapping
LANGUAGE_NAMES = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "ar": "Arabic",
    "hi": "Hindi",
    "nl": "Dutch",
    "pl": "Polish",
    "tr": "Turkish",
    "vi": "Vietnamese",
    "th": "Thai",
    "id": "Indonesian",
    "auto": "the original language"
}


class GeminiTranslationProvider(TranslationProvider):
    """Google Gemini-based translation provider."""

    name = "gemini"
    API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def __init__(self):
        self.api_key = settings.gemini_api_key

    async def is_available(self) -> bool:
        """Check if Gemini API key is configured."""
        return bool(self.api_key)

    async def translate(
        self,
        text: str,
        source_language: str,
        target_language: str,
        model: str = "gemini-2.0-flash",
        **kwargs
    ) -> str:
        """
        Translate text using Google Gemini models.

        Args:
            text: Text to translate
            source_language: Source language code
            target_language: Target language code
            model: Gemini model to use (default: gemini-2.0-flash)
        """
        if not self.api_key:
            raise ValueError("Gemini API key not configured")

        source_name = LANGUAGE_NAMES.get(source_language, source_language)
        target_name = LANGUAGE_NAMES.get(target_language, target_language)

        if source_language == "auto":
            prompt = (
                f"Translate the following text to {target_name}. "
                f"Only output the translated text without any explanations:\n\n{text}"
            )
        else:
            prompt = (
                f"Translate the following text from {source_name} to {target_name}. "
                f"Only output the translated text without any explanations:\n\n{text}"
            )

        url = self.API_URL.format(model=model)

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 4096
            }
        }

        headers = {
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json"
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json=payload,
                headers=headers
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Gemini API error ({response.status}): {error_text}")

                result = await response.json()

        # Extract translated text from Gemini response
        candidates = result.get("candidates", [])
        if not candidates:
            raise Exception("No translation returned from Gemini")

        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        if not parts:
            raise Exception("No translation content in Gemini response")

        translated_text = parts[0].get("text", "").strip()
        return translated_text
