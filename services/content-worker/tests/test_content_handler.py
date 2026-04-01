"""
Unit tests for ContentHandler (app/content_handler.py).

Tests the AMQP message dispatch layer — not the full RabbitMQ connection setup
(that would require a live broker). We test _handle_message() directly to
validate the ACK/NACK/reject routing logic for all error paths.

Coverage:
  - Valid message → pipeline runs → message ACKed.
  - Terminal error (UnsupportedSourceTypeError) → nack(requeue=False).
  - Non-retryable KMSContentError → nack(requeue=False).
  - Retryable KMSContentError → nack(requeue=False) (goes to DLX → retry queue).
  - Unexpected exception → nack(requeue=False) (poison-pill protection).
  - Malformed JSON body → nack(requeue=False).
"""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import Settings
from app.content_handler import ContentHandler
from app.errors import (
    ContentIngestionError,
    ContentGenerationError,
    KMSContentError,
    UnsupportedSourceTypeError,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_settings() -> Settings:
    """Return a Settings instance with test-safe values."""
    return Settings(
        database_url="postgresql://test:test@localhost/test",
        rabbitmq_url="amqp://guest:guest@localhost/",
        anthropic_api_key="test-key",
    )


def _make_message(body: dict | None = None, raw_body: bytes | None = None) -> MagicMock:
    """
    Build a mock aio_pika AbstractIncomingMessage.

    Args:
        body: Dict that will be JSON-encoded as the message body.
              Mutually exclusive with raw_body.
        raw_body: Raw bytes to use as the message body (for malformed JSON tests).

    Returns:
        MagicMock that behaves like an aio_pika message with process() context manager.
    """
    if raw_body is None:
        body = body or {
            "job_id": "job-uuid-test",
            "user_id": "user-uuid-test",
            "source_type": "URL",
            "source_url": "https://example.com/article",
            "config_snapshot": {"platforms": {}},
        }
        raw_body = json.dumps(body).encode()

    message = MagicMock()
    message.body = raw_body
    message.ack = AsyncMock()
    message.nack = AsyncMock()
    message.reject = AsyncMock()

    # process() is used as `async with message.process(ignore_processed=True):`
    # It must return an async context manager that does nothing.
    process_ctx = AsyncMock()
    process_ctx.__aenter__ = AsyncMock(return_value=None)
    process_ctx.__aexit__ = AsyncMock(return_value=False)  # False = do not suppress exceptions
    message.process = MagicMock(return_value=process_ctx)

    return message


def _make_handler() -> ContentHandler:
    """Construct a ContentHandler with a pre-wired mock runner."""
    settings = _make_settings()
    handler = ContentHandler(settings)
    mock_runner = AsyncMock()
    mock_runner.run = AsyncMock(return_value=None)
    handler._runner = mock_runner
    return handler


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestHandleMessageSuccess:
    """Verify that a valid message runs the pipeline and ACKs."""

    @pytest.mark.asyncio
    async def test_valid_message_starts_pipeline(self):
        """
        A well-formed message body must:
        1. Call runner.run() with the decoded body dict.
        2. ACK the message.
        3. Not NACK.
        """
        handler = _make_handler()
        message = _make_message()

        await handler._handle_message(message)

        handler._runner.run.assert_called_once()
        call_args = handler._runner.run.call_args[0][0]
        assert call_args["job_id"] == "job-uuid-test"
        message.ack.assert_called_once()
        message.nack.assert_not_called()

    @pytest.mark.asyncio
    async def test_runner_receives_full_decoded_body(self):
        """The pipeline runner receives the complete decoded message body."""
        handler = _make_handler()
        body = {
            "job_id": "specific-job-id",
            "user_id": "specific-user-id",
            "source_type": "YOUTUBE",
            "source_url": "https://youtu.be/abc123",
            "voice_profile": "casual and direct",
            "config_snapshot": {
                "platforms": {
                    "linkedin": {"enabled": True, "variations": 2, "formats": ["post"]},
                }
            },
        }
        message = _make_message(body=body)

        await handler._handle_message(message)

        received_body = handler._runner.run.call_args[0][0]
        assert received_body["source_type"] == "YOUTUBE"
        assert received_body["voice_profile"] == "casual and direct"
        assert received_body["config_snapshot"]["platforms"]["linkedin"]["enabled"] is True


class TestHandleMessageTerminalErrors:
    """Verify that terminal errors cause nack(requeue=False)."""

    @pytest.mark.asyncio
    async def test_unsupported_source_type_nacks_message(self):
        """
        UnsupportedSourceTypeError is terminal — nack(requeue=False) so the
        message is routed to the DLX and not retried endlessly.
        """
        handler = _make_handler()
        message = _make_message()
        handler._runner.run = AsyncMock(
            side_effect=UnsupportedSourceTypeError("UNKNOWN_TYPE")
        )

        await handler._handle_message(message)

        message.nack.assert_called_once_with(requeue=False)
        message.ack.assert_not_called()

    @pytest.mark.asyncio
    async def test_non_retryable_kms_error_nacks_message(self):
        """
        A KMSContentError with retryable=False is terminal — nack(requeue=False).
        """
        handler = _make_handler()
        message = _make_message()
        handler._runner.run = AsyncMock(
            side_effect=ContentIngestionError("Page not found", retryable=False)
        )

        await handler._handle_message(message)

        message.nack.assert_called_once_with(requeue=False)
        message.ack.assert_not_called()

    @pytest.mark.asyncio
    async def test_malformed_json_nacks_message(self):
        """
        A message body that is not valid JSON must not crash the worker.
        The exception is caught and the message is nacked (terminal — malformed
        messages cannot be retried meaningfully).
        """
        handler = _make_handler()
        message = _make_message(raw_body=b"{not valid json")

        await handler._handle_message(message)

        # json.loads raises JSONDecodeError which falls through to the
        # generic Exception handler → nack(requeue=False)
        message.nack.assert_called_once_with(requeue=False)
        message.ack.assert_not_called()

    @pytest.mark.asyncio
    async def test_unexpected_exception_nacks_message(self):
        """
        An unexpected exception (e.g. DB connection crash) must be treated
        as terminal to avoid a poison-pill message looping forever.
        """
        handler = _make_handler()
        message = _make_message()
        handler._runner.run = AsyncMock(
            side_effect=RuntimeError("Unexpected DB crash")
        )

        await handler._handle_message(message)

        message.nack.assert_called_once_with(requeue=False)
        message.ack.assert_not_called()


class TestHandleMessageRetryableErrors:
    """Verify that retryable errors cause nack(requeue=False) → DLX → retry queue."""

    @pytest.mark.asyncio
    async def test_retryable_kms_error_nacks_for_dlx(self):
        """
        A KMSContentError with retryable=True causes nack(requeue=False).
        The DLX binding routes it to the retry queue (not immediate requeue).
        """
        handler = _make_handler()
        message = _make_message()
        handler._runner.run = AsyncMock(
            side_effect=ContentGenerationError("Rate limit exceeded", retryable=True)
        )

        await handler._handle_message(message)

        # The handler uses nack(requeue=False) for both retryable and terminal errors
        # because the DLX + retry queue handles the delay (not RabbitMQ requeue).
        message.nack.assert_called_once_with(requeue=False)
        message.ack.assert_not_called()

    @pytest.mark.asyncio
    async def test_retryable_ingestion_error_nacks_for_dlx(self):
        """
        A ContentIngestionError with retryable=True (e.g. voice-app timeout)
        follows the same DLX path as other retryable errors.
        """
        handler = _make_handler()
        message = _make_message()
        handler._runner.run = AsyncMock(
            side_effect=ContentIngestionError("voice-app timeout", retryable=True)
        )

        await handler._handle_message(message)

        message.nack.assert_called_once_with(requeue=False)
        message.ack.assert_not_called()
