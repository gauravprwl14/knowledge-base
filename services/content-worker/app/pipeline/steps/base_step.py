"""
Base class for all content generation steps.

Handles:
- Anthropic API call with exponential backoff (1s/2s/4s, max 3 retries) for rate limits
- XML delimiter wrapping of external content (prompt injection defense)
- SKILL.md loading for prompt templates

Usage:
    class LinkedInWriter(BaseStep):
        SKILL_NAME = "linkedin-writer"

        def _build_user_prompt(self, **kwargs) -> str:
            return f"Write a LinkedIn post about:\\n{kwargs['concepts_text']}"
"""
import asyncio
from pathlib import Path

import anthropic
import structlog

from app.config import Settings
from app.errors import ContentGenerationError

logger = structlog.get_logger(__name__)

# Anthropic backoff: 1s, 2s, 4s — covers transient rate limits
_BACKOFF_DELAYS = [1, 2, 4]
_DEFAULT_MAX_TOKENS = 4096


class BaseStep:
    """
    Base class for content generation steps.

    Subclasses must set SKILL_NAME (matches skills/<name>/SKILL.md)
    and implement _build_user_prompt().

    Args:
        settings: Application configuration.
    """

    #: Name of the skills/<name>/SKILL.md file to load as system prompt
    SKILL_NAME: str = ""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        self._system_prompt: str | None = None

    def _load_skill(self) -> str:
        """
        Load the SKILL.md system prompt for this step.

        The file path is relative to the content-worker package root.
        If the file doesn't exist, falls back to a generic system prompt.

        Returns:
            System prompt text from SKILL.md.
        """
        if self._system_prompt:
            return self._system_prompt

        skill_path = Path(__file__).parent.parent.parent.parent / "skills" / self.SKILL_NAME / "SKILL.md"
        if skill_path.exists():
            self._system_prompt = skill_path.read_text(encoding="utf-8")
        else:
            self._system_prompt = (
                "You are an expert content creator. "
                "Write the requested content exactly as specified. "
                "Return only the raw content — no preamble, no explanation."
            )
        return self._system_prompt

    @staticmethod
    def wrap_external(label: str, content: str) -> str:
        """
        Wrap external content in XML structural delimiters.

        This is the Anthropic-recommended defense against prompt injection.
        External content (transcripts, scraped URLs, documents) must ALWAYS
        be wrapped before being inserted into a prompt.

        Args:
            label: XML tag name (e.g. 'transcript', 'concepts').
            content: The external content to wrap.

        Returns:
            Content wrapped in <label>...</label> XML tags.
        """
        return f"<{label}>\n{content}\n</{label}>"

    def _build_user_prompt(self, **kwargs) -> str:
        """
        Build the user-facing prompt for this step.

        Subclasses MUST override this method. All external content
        (concepts, transcripts, etc.) must be wrapped with wrap_external().

        Args:
            **kwargs: Step-specific inputs.

        Returns:
            User prompt string.
        """
        raise NotImplementedError(f"{self.__class__.__name__} must implement _build_user_prompt")

    async def run(self, **kwargs) -> str:
        """
        Execute this generation step with retry on rate limits.

        Makes up to 3 attempts with exponential backoff (1s/2s/4s).
        Rate limit errors (429) are retried; other errors raise immediately.

        Args:
            **kwargs: Step-specific inputs passed through to _build_user_prompt().

        Returns:
            Generated content text (raw, no preamble).

        Raises:
            ContentGenerationError: On unrecoverable error after retries.
        """
        system = self._load_skill()
        user = self._build_user_prompt(**kwargs)
        max_tokens = kwargs.get("max_tokens", _DEFAULT_MAX_TOKENS)

        last_error: Exception | None = None

        for attempt, delay in enumerate([0] + _BACKOFF_DELAYS):
            if delay:
                logger.info(
                    "content_step_retry",
                    step=self.SKILL_NAME,
                    attempt=attempt,
                    delay=delay,
                )
                await asyncio.sleep(delay)

            try:
                response = await self._client.messages.create(
                    model="claude-opus-4-6",
                    max_tokens=max_tokens,
                    system=system,
                    messages=[{"role": "user", "content": user}],
                )
                content = response.content[0].text.strip()
                return content

            except anthropic.RateLimitError as exc:
                last_error = exc
                logger.warning(
                    "content_step_rate_limited",
                    step=self.SKILL_NAME,
                    attempt=attempt,
                )
                # Continue to next retry iteration

            except anthropic.APIError as exc:
                raise ContentGenerationError(
                    f"Anthropic API error in step '{self.SKILL_NAME}': {exc}",
                    retryable=False,
                ) from exc

        raise ContentGenerationError(
            f"Step '{self.SKILL_NAME}' failed after {len(_BACKOFF_DELAYS) + 1} attempts due to rate limits.",
            retryable=True,  # Rate-limit exhaustion is retryable after a longer delay
        ) from last_error
