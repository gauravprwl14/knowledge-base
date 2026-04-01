"""
Unit tests for BaseStep (app/pipeline/steps/base_step.py).

Covers:
  - wrap_external(): XML delimiter wrapping for prompt injection defense.
  - run(): Exponential backoff retry on RateLimitError.
  - run(): Max retries exceeded raises ContentGenerationError.
  - run(): Non-rate-limit APIError raises immediately (no retries).
  - run(): Successful response on the second attempt after one rate limit.

The Anthropic SDK client is fully mocked — no real API calls are made.
asyncio.sleep is mocked to prevent tests from actually waiting.
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import anthropic
import pytest

from app.config import Settings
from app.errors import ContentGenerationError
from app.pipeline.steps.base_step import BaseStep, _BACKOFF_DELAYS


# ── Concrete subclass for testing ─────────────────────────────────────────────

class _ConcreteStep(BaseStep):
    """
    Minimal concrete subclass of BaseStep for testing.

    Implements the required _build_user_prompt() method with a simple
    passthrough so we can exercise BaseStep.run() without needing a real step.
    """

    SKILL_NAME = "test-step"

    def _build_user_prompt(self, **kwargs) -> str:
        """Return a simple test prompt using provided transcript text."""
        return f"Test prompt: {kwargs.get('transcript_text', '')}"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_settings() -> Settings:
    """Return a Settings instance with test-safe values."""
    return Settings(
        database_url="postgresql://test:test@localhost/test",
        rabbitmq_url="amqp://guest:guest@localhost/",
        anthropic_api_key="test-anthropic-key",
    )


def _make_step() -> _ConcreteStep:
    """Construct a _ConcreteStep with a mocked Anthropic client."""
    settings = _make_settings()
    step = _ConcreteStep(settings)
    # Replace the real Anthropic client with a mock
    step._client = AsyncMock()
    return step


def _make_api_response(text: str = "Generated content") -> MagicMock:
    """
    Build a mock Anthropic Messages response with a single text content block.

    Args:
        text: The text content to put in the first content block.

    Returns:
        MagicMock that mimics anthropic.types.Message structure.
    """
    content_block = MagicMock()
    content_block.text = text
    response = MagicMock()
    response.content = [content_block]
    return response


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestWrapExternal:
    """Tests for the XML delimiter wrapping utility."""

    def test_wraps_content_in_correct_xml_tags(self):
        """wrap_external('concepts', 'text') must produce <concepts>\\ntext\\n</concepts>."""
        result = BaseStep.wrap_external("concepts", "some text")
        assert result == "<concepts>\nsome text\n</concepts>"

    def test_wraps_with_label_as_tag_name(self):
        """The label argument becomes the XML tag name."""
        result = BaseStep.wrap_external("transcript", "transcript content here")
        assert result.startswith("<transcript>")
        assert result.endswith("</transcript>")

    def test_content_is_preserved_exactly(self):
        """The content between the tags must not be altered."""
        content = "Line 1\nLine 2\n\nLine 3 with **markdown**"
        result = BaseStep.wrap_external("external", content)
        assert content in result

    def test_empty_content_still_wrapped(self):
        """Even empty content gets wrapped — consistent delimiter structure."""
        result = BaseStep.wrap_external("voice_brief", "")
        assert result == "<voice_brief>\n\n</voice_brief>"

    def test_multiword_label_with_underscore(self):
        """Labels with underscores are valid XML tag names and must be preserved."""
        result = BaseStep.wrap_external("voice_brief", "brief content")
        assert "<voice_brief>" in result
        assert "</voice_brief>" in result


class TestRunHappyPath:
    """Verify BaseStep.run() returns the first successful response."""

    @pytest.mark.asyncio
    async def test_returns_generated_content_on_first_attempt(self):
        """
        On a successful first API call, run() returns the generated text
        with no retries or sleeps.
        """
        step = _make_step()
        step._client.messages.create = AsyncMock(
            return_value=_make_api_response("My generated content")
        )

        with patch("app.pipeline.steps.base_step.asyncio.sleep") as mock_sleep:
            result = await step.run(transcript_text="some transcript")

        assert result == "My generated content"
        # No sleep on the first attempt (delay=0 for first element)
        mock_sleep.assert_not_called()

    @pytest.mark.asyncio
    async def test_strips_whitespace_from_response(self):
        """
        Anthropic responses often have leading/trailing whitespace.
        run() must strip it before returning.
        """
        step = _make_step()
        step._client.messages.create = AsyncMock(
            return_value=_make_api_response("  \nContent with surrounding whitespace\n  ")
        )

        result = await step.run(transcript_text="x")

        assert result == "Content with surrounding whitespace"

    @pytest.mark.asyncio
    async def test_passes_system_prompt_and_user_prompt_to_api(self):
        """
        run() must pass both the system prompt and the user prompt to the
        Anthropic API in the correct structure.
        """
        step = _make_step()
        # Override skill loading to return a known system prompt
        step._system_prompt = "Test system prompt"
        step._client.messages.create = AsyncMock(
            return_value=_make_api_response("response")
        )

        await step.run(transcript_text="test transcript")

        call_kwargs = step._client.messages.create.call_args[1]
        assert call_kwargs["system"] == "Test system prompt"
        assert call_kwargs["messages"][0]["role"] == "user"
        assert "test transcript" in call_kwargs["messages"][0]["content"]


class TestRunRetryLogic:
    """Verify exponential backoff retry behaviour on RateLimitError."""

    @pytest.mark.asyncio
    async def test_exponential_backoff_delays_on_rate_limit(self):
        """
        Each RateLimitError triggers an asyncio.sleep() with the next backoff
        delay in the sequence [1, 2, 4]. All three must be called in order
        when all attempts fail.
        """
        step = _make_step()
        # All 4 attempts fail with rate limit
        step._client.messages.create = AsyncMock(
            side_effect=anthropic.RateLimitError(
                message="rate limited",
                response=MagicMock(status_code=429),
                body={},
            )
        )

        sleep_calls: list[float] = []

        async def mock_sleep(delay):
            sleep_calls.append(delay)

        with patch("app.pipeline.steps.base_step.asyncio.sleep", side_effect=mock_sleep):
            with pytest.raises(ContentGenerationError):
                await step.run(transcript_text="x")

        # First attempt has delay=0 (no sleep); subsequent attempts use _BACKOFF_DELAYS
        assert sleep_calls == _BACKOFF_DELAYS, (
            f"Expected sleep calls {_BACKOFF_DELAYS}, got {sleep_calls}"
        )

    @pytest.mark.asyncio
    async def test_max_retries_raises_content_generation_error(self):
        """
        After exhausting all retries (1 initial + 3 backoffs = 4 total),
        run() raises ContentGenerationError, not RateLimitError.
        """
        step = _make_step()
        step._client.messages.create = AsyncMock(
            side_effect=anthropic.RateLimitError(
                message="still rate limited",
                response=MagicMock(status_code=429),
                body={},
            )
        )

        with patch("app.pipeline.steps.base_step.asyncio.sleep", new=AsyncMock()):
            with pytest.raises(ContentGenerationError) as exc_info:
                await step.run(transcript_text="x")

        # The raised error must be retryable=True (rate limit exhaustion is temporary)
        assert exc_info.value.retryable is True
        assert "rate limits" in exc_info.value.message.lower()

    @pytest.mark.asyncio
    async def test_successful_on_second_attempt(self):
        """
        First call raises RateLimitError, second call succeeds.
        run() must return the successful response without raising.
        """
        step = _make_step()
        step._client.messages.create = AsyncMock(
            side_effect=[
                anthropic.RateLimitError(
                    message="rate limited",
                    response=MagicMock(status_code=429),
                    body={},
                ),
                _make_api_response("Success on retry"),
            ]
        )

        with patch("app.pipeline.steps.base_step.asyncio.sleep", new=AsyncMock()):
            result = await step.run(transcript_text="x")

        assert result == "Success on retry"
        assert step._client.messages.create.call_count == 2

    @pytest.mark.asyncio
    async def test_non_rate_limit_api_error_raises_immediately(self):
        """
        An anthropic.APIError that is NOT a RateLimitError (e.g. 500 server error)
        must raise ContentGenerationError immediately without retrying.
        """
        step = _make_step()

        # Simulate a non-rate-limit API error (APIStatusError subclasses APIError)
        api_error = anthropic.APIStatusError(
            message="Internal server error",
            response=MagicMock(status_code=500),
            body={},
        )
        step._client.messages.create = AsyncMock(side_effect=api_error)

        with patch("app.pipeline.steps.base_step.asyncio.sleep", new=AsyncMock()) as mock_sleep:
            with pytest.raises(ContentGenerationError) as exc_info:
                await step.run(transcript_text="x")

        # Only 1 attempt should have been made — no retries for non-rate-limit errors
        assert step._client.messages.create.call_count == 1
        # The error must be non-retryable
        assert exc_info.value.retryable is False

    @pytest.mark.asyncio
    async def test_api_call_uses_correct_model(self):
        """
        The Anthropic API call must use the configured model name.
        This prevents accidental model downgrades.
        """
        step = _make_step()
        step._client.messages.create = AsyncMock(
            return_value=_make_api_response("response")
        )

        await step.run(transcript_text="x")

        call_kwargs = step._client.messages.create.call_args[1]
        assert call_kwargs["model"] == "claude-opus-4-6"


class TestBuildUserPromptNotImplemented:
    """Verify that BaseStep._build_user_prompt raises if not overridden."""

    def test_base_class_raises_not_implemented(self):
        """
        Calling _build_user_prompt() on the base class (not a subclass)
        must raise NotImplementedError to enforce the abstract contract.
        """
        settings = _make_settings()
        step = BaseStep(settings)
        step._client = AsyncMock()

        with pytest.raises(NotImplementedError):
            step._build_user_prompt(transcript_text="test")
