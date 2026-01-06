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


class OpenAITranslationProvider(TranslationProvider):
    """OpenAI GPT-based translation provider."""

    name = "openai"
    API_URL = "https://api.openai.com/v1/chat/completions"

    def __init__(self):
        self.api_key = settings.openai_api_key

    async def is_available(self) -> bool:
        """Check if OpenAI API key is configured."""
        return bool(self.api_key)

    async def translate(
        self,
        text: str,
        source_language: str,
        target_language: str,
        model: str = "gpt-4o-mini",
        **kwargs
    ) -> str:
        """
        Translate text using OpenAI's GPT models.

        Args:
            text: Text to translate
            source_language: Source language code
            target_language: Target language code
            model: GPT model to use (default: gpt-4o-mini)
        """
        if not self.api_key:
            raise ValueError("OpenAI API key not configured")

        source_name = LANGUAGE_NAMES.get(source_language, source_language)
        target_name = LANGUAGE_NAMES.get(target_language, target_language)

        system_prompt = (
            "You are a professional translator. Translate the given text accurately "
            "while preserving the meaning, tone, and style. Only output the translated "
            "text without any explanations or additional commentary."
        )

        if source_language == "auto":
            user_prompt = f"Translate the following text to {target_name}:\n\n{text}"
        else:
            user_prompt = (
                f"Translate the following text from {source_name} to {target_name}:\n\n{text}"
            )

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.3,
            "max_tokens": 4096
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.API_URL,
                json=payload,
                headers=headers
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"OpenAI API error ({response.status}): {error_text}")

                result = await response.json()

        # Extract translated text from response
        choices = result.get("choices", [])
        if not choices:
            raise Exception("No translation returned from OpenAI")

        translated_text = choices[0].get("message", {}).get("content", "").strip()
        return translated_text
