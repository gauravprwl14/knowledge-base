"""Tests for the voice transcription routing logic in EmbedHandler.

Covers:
- Audio/video MIME types trigger publishing to kms.voice queue
- Non-audio MIME types do NOT publish to voice queue
- voiceTranscription feature flag disabled skips voice publish
- Source-level transcribeVideos=false skips publish
- File size limit exceeded skips publish
- Filename exclude patterns skip publish
- TranscriptionResultMessage chunks are stored with start_secs timestamps
"""

from __future__ import annotations

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest

from app.handlers.embed_handler import (
    AUDIO_VIDEO_MIME_TYPES,
    EmbedHandler,
    _align_chunks_to_segments,
    _should_transcribe,
)
from app.models.messages import FileDiscoveredMessage, TextChunk


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

AUDIO_MIME = "video/mp4"
NON_AUDIO_MIME = "application/pdf"

ENABLED_CONFIG = {
    "features": {
        "voiceTranscription": {
            "enabled": True,
            "maxFileSizeMb": 500,
        }
    }
}

DISABLED_CONFIG = {
    "features": {
        "voiceTranscription": {
            "enabled": False,
        }
    }
}


def _make_payload(**overrides) -> dict:
    """Build a minimal valid FileDiscoveredMessage payload dict.

    Args:
        **overrides: Fields to override in the default payload.

    Returns:
        Dict that passes ``FileDiscoveredMessage.model_validate``.
    """
    base = {
        "scan_job_id": str(uuid.uuid4()),
        "source_id": str(uuid.uuid4()),
        "user_id": str(uuid.uuid4()),
        "file_path": "/tmp/test.mp4",
        "original_filename": "test.mp4",
        "mime_type": AUDIO_MIME,
        "file_size_bytes": 1024 * 1024 * 10,  # 10 MB
        "checksum_sha256": "abc123",
        "source_type": "local",
        "source_metadata": {},
    }
    base.update(overrides)
    return base


def _make_amqp_msg(body: bytes) -> MagicMock:
    """Create a mock aio_pika.IncomingMessage.

    Args:
        body: Raw bytes body.

    Returns:
        MagicMock with async ack / nack / reject methods.
    """
    msg = MagicMock()
    msg.body = body
    msg.ack = AsyncMock()
    msg.nack = AsyncMock()
    msg.reject = AsyncMock()
    return msg


def _make_channel() -> MagicMock:
    """Return a mock aio_pika channel whose default_exchange.publish is an AsyncMock.

    Returns:
        MagicMock channel with ``default_exchange.publish`` wired as AsyncMock.
    """
    channel = MagicMock()
    channel.default_exchange = MagicMock()
    channel.default_exchange.publish = AsyncMock()
    return channel


def _make_handler(
    channel=None,
    kms_config=None,
    db_pool=None,
    embedding_service=None,
    qdrant_service=None,
) -> EmbedHandler:
    """Construct an EmbedHandler with fully mocked dependencies.

    Args:
        channel: Optional aio_pika channel mock.
        kms_config: Optional KMS config dict.
        db_pool: Optional asyncpg pool mock.
        embedding_service: Optional embedding service mock.
        qdrant_service: Optional Qdrant service mock.

    Returns:
        EmbedHandler instance wired with mocks.
    """
    pool = db_pool or AsyncMock()
    pool.execute = AsyncMock()

    emb = embedding_service or AsyncMock()
    emb.encode_batch = AsyncMock(return_value=[[0.0] * 1024])

    qdr = qdrant_service or AsyncMock()
    qdr.ensure_collection = AsyncMock()
    qdr.upsert_chunks = AsyncMock()

    return EmbedHandler(
        db_pool=pool,
        embedding_service=emb,
        qdrant_service=qdr,
        channel=channel,
        kms_config=kms_config or ENABLED_CONFIG,
    )


# ---------------------------------------------------------------------------
# _should_transcribe unit tests
# ---------------------------------------------------------------------------


def test_should_transcribe_returns_true_when_all_rules_pass():
    """Returns (True, '') when feature is enabled and no rules block."""
    msg = FileDiscoveredMessage.model_validate(_make_payload())
    ok, reason = _should_transcribe(msg, ENABLED_CONFIG, {})
    assert ok is True
    assert reason == ""


def test_should_transcribe_feature_flag_disabled():
    """Returns (False, 'feature_disabled') when voiceTranscription.enabled=false."""
    msg = FileDiscoveredMessage.model_validate(_make_payload())
    ok, reason = _should_transcribe(msg, DISABLED_CONFIG, {})
    assert ok is False
    assert reason == "feature_disabled"


def test_should_transcribe_source_toggle_off():
    """Returns (False, 'disabled_for_source') when source sets transcribeVideos=false."""
    msg = FileDiscoveredMessage.model_validate(_make_payload())
    ok, reason = _should_transcribe(msg, ENABLED_CONFIG, {"transcribeVideos": False})
    assert ok is False
    assert reason == "disabled_for_source"


def test_should_transcribe_file_too_large():
    """Returns (False, 'file_too_large_...') when file exceeds maxFileSizeMb."""
    # 600 MB > 500 MB limit
    msg = FileDiscoveredMessage.model_validate(
        _make_payload(file_size_bytes=600 * 1024 * 1024)
    )
    ok, reason = _should_transcribe(msg, ENABLED_CONFIG, {})
    assert ok is False
    assert reason.startswith("file_too_large_")


def test_should_transcribe_exclude_pattern_match():
    """Returns (False, 'excluded_by_pattern_...') when filename matches an exclude pattern."""
    msg = FileDiscoveredMessage.model_validate(
        _make_payload(original_filename="draft_raw_preview.mp4")
    )
    ok, reason = _should_transcribe(
        msg, ENABLED_CONFIG, {"transcriptionExcludePatterns": ["raw_preview"]}
    )
    assert ok is False
    assert "excluded_by_pattern_raw_preview" in reason


def test_should_transcribe_none_file_size_skips_size_check():
    """When file_size_bytes is None, the size gate is skipped."""
    msg = FileDiscoveredMessage.model_validate(_make_payload(file_size_bytes=None))
    ok, reason = _should_transcribe(msg, ENABLED_CONFIG, {})
    assert ok is True


# ---------------------------------------------------------------------------
# EmbedHandler.handle — audio/video routing tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_audio_file_publishes_to_voice_queue():
    """embed-worker publishes a VoiceJobMessage when MIME is audio/video."""
    channel = _make_channel()
    handler = _make_handler(channel=channel, kms_config=ENABLED_CONFIG)

    payload = _make_payload(mime_type="video/mp4")
    amqp_msg = _make_amqp_msg(json.dumps(payload).encode())

    await handler.handle(amqp_msg)

    # Voice queue publish should have been called exactly once
    channel.default_exchange.publish.assert_awaited_once()

    # Inspect the published body
    publish_call: call = channel.default_exchange.publish.await_args
    routing_key = publish_call.kwargs.get("routing_key") or publish_call.args[1]
    assert routing_key == "kms.voice"

    published_body = json.loads(publish_call.args[0].body)
    assert "job_id" in published_body
    assert "file_id" in published_body
    assert published_body["mime_type"] == "video/mp4"

    # Message should be acked after successful routing
    amqp_msg.ack.assert_awaited_once()
    amqp_msg.nack.assert_not_awaited()
    amqp_msg.reject.assert_not_awaited()


@pytest.mark.asyncio
async def test_all_audio_video_mime_types_publish():
    """Every MIME type in AUDIO_VIDEO_MIME_TYPES triggers a voice queue publish."""
    for mime in AUDIO_VIDEO_MIME_TYPES:
        channel = _make_channel()
        handler = _make_handler(channel=channel, kms_config=ENABLED_CONFIG)
        payload = _make_payload(mime_type=mime)
        amqp_msg = _make_amqp_msg(json.dumps(payload).encode())

        await handler.handle(amqp_msg)

        assert channel.default_exchange.publish.await_count >= 1, (
            f"No voice publish for MIME type: {mime}"
        )
        amqp_msg.ack.assert_awaited_once()


@pytest.mark.asyncio
async def test_non_audio_file_does_not_publish_to_voice_queue():
    """embed-worker does NOT publish to kms.voice for non-audio MIME types."""
    channel = _make_channel()
    handler = _make_handler(channel=channel, kms_config=ENABLED_CONFIG)

    payload = _make_payload(mime_type=NON_AUDIO_MIME, file_path="/tmp/doc.pdf")
    amqp_msg = _make_amqp_msg(json.dumps(payload).encode())

    with (
        patch("app.handlers.embed_handler.Path") as mock_path_cls,
        patch("app.handlers.embed_handler.get_extractor") as mock_get_extractor,
    ):
        mock_path_inst = MagicMock()
        mock_path_inst.exists.return_value = False
        mock_path_cls.return_value = mock_path_inst
        mock_get_extractor.return_value = None  # No extractor for this type

        await handler.handle(amqp_msg)

    channel.default_exchange.publish.assert_not_awaited()
    amqp_msg.ack.assert_awaited_once()


@pytest.mark.asyncio
async def test_voice_transcription_disabled_flag_skips_publish():
    """When voiceTranscription.enabled=false, no voice queue publish occurs."""
    channel = _make_channel()
    handler = _make_handler(channel=channel, kms_config=DISABLED_CONFIG)

    payload = _make_payload(mime_type="video/mp4")
    amqp_msg = _make_amqp_msg(json.dumps(payload).encode())

    await handler.handle(amqp_msg)

    # Channel should NOT have been asked to publish a voice job
    channel.default_exchange.publish.assert_not_awaited()
    amqp_msg.ack.assert_awaited_once()


@pytest.mark.asyncio
async def test_exclude_pattern_skips_publish():
    """Files matching transcriptionExcludePatterns are NOT routed to voice queue."""
    channel = _make_channel()
    config = {
        "features": {
            "voiceTranscription": {
                "enabled": True,
                "maxFileSizeMb": 500,
            }
        }
    }
    handler = _make_handler(channel=channel, kms_config=config)

    payload = _make_payload(
        mime_type="video/mp4",
        original_filename="meeting_raw_preview.mp4",
        source_metadata={"transcriptionExcludePatterns": ["raw_preview"]},
    )
    amqp_msg = _make_amqp_msg(json.dumps(payload).encode())

    await handler.handle(amqp_msg)

    channel.default_exchange.publish.assert_not_awaited()
    amqp_msg.ack.assert_awaited_once()


@pytest.mark.asyncio
async def test_no_channel_configured_skips_publish_gracefully():
    """When channel is None, the handler skips publishing without raising."""
    handler = _make_handler(channel=None, kms_config=ENABLED_CONFIG)

    payload = _make_payload(mime_type="audio/mpeg")
    amqp_msg = _make_amqp_msg(json.dumps(payload).encode())

    # Should not raise; should still ack
    await handler.handle(amqp_msg)
    amqp_msg.ack.assert_awaited_once()


# ---------------------------------------------------------------------------
# TranscriptionResultMessage (source_type == "voice") handling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transcription_result_chunks_stored_in_qdrant():
    """TranscriptionResultMessage triggers chunking and Qdrant upsert."""
    qdrant_service = AsyncMock()
    qdrant_service.ensure_collection = AsyncMock()
    qdrant_service.upsert_chunks = AsyncMock()

    # Return the correct number of vectors dynamically based on input length
    async def dynamic_encode(texts):
        return [[0.1] * 1024 for _ in texts]

    embedding_service = AsyncMock()
    embedding_service.encode_batch = dynamic_encode

    handler = _make_handler(
        kms_config=ENABLED_CONFIG,
        qdrant_service=qdrant_service,
        embedding_service=embedding_service,
    )

    # A short transcript that produces exactly 1 chunk (stays under chunk_size=512)
    transcript = "This is the transcribed audio content from the meeting recording."

    payload = _make_payload(
        mime_type="text/plain",
        source_type="voice",
        extracted_text=transcript,
        original_filename="meeting.mp4",
    )
    amqp_msg = _make_amqp_msg(json.dumps(payload).encode())

    await handler.handle(amqp_msg)

    qdrant_service.upsert_chunks.assert_awaited_once()
    upserted = qdrant_service.upsert_chunks.await_args.args[0]
    assert len(upserted) >= 1

    # Verify source_type in payload
    for point in upserted:
        assert point.payload.get("source_type") == "voice_transcript"


@pytest.mark.asyncio
async def test_transcription_result_chunks_with_timestamps():
    """TranscriptionResultMessage creates chunks with start_secs aligned to segments."""
    qdrant_service = AsyncMock()
    qdrant_service.ensure_collection = AsyncMock()
    qdrant_service.upsert_chunks = AsyncMock()

    async def dynamic_encode(texts):
        return [[0.1] * 1024 for _ in texts]

    embedding_service = AsyncMock()
    embedding_service.encode_batch = dynamic_encode

    handler = _make_handler(
        kms_config=ENABLED_CONFIG,
        qdrant_service=qdrant_service,
        embedding_service=embedding_service,
    )

    # Single-chunk transcript with a matching segment
    transcript = "hello world this is a test transcript for the voice pipeline"
    segments = [{"start": 5.5, "end": 10.0, "text": "hello world"}]

    payload = _make_payload(
        mime_type="text/plain",
        source_type="voice",
        extracted_text=transcript,
        source_metadata={"segments": segments},
    )
    amqp_msg = _make_amqp_msg(json.dumps(payload).encode())

    await handler.handle(amqp_msg)

    qdrant_service.upsert_chunks.assert_awaited_once()
    upserted = qdrant_service.upsert_chunks.await_args.args[0]
    assert len(upserted) >= 1

    # The first chunk should have start_secs populated from the segment
    first = upserted[0]
    assert "start_secs" in first.payload
    assert first.payload["start_secs"] == pytest.approx(5.5)


# ---------------------------------------------------------------------------
# _align_chunks_to_segments unit tests
# ---------------------------------------------------------------------------


def test_align_chunks_to_segments_assigns_timestamps():
    """Chunks whose text overlaps a segment receive the segment's start time."""
    chunks = [
        TextChunk(chunk_index=0, text="hello world test", start_char=0, end_char=16),
    ]
    segments = [{"start": 3.0, "end": 6.0, "text": "hello world"}]
    result = _align_chunks_to_segments(chunks, segments)
    assert result[0].start_secs == pytest.approx(3.0)


def test_align_chunks_to_segments_empty_segments_unchanged():
    """Empty segments list leaves start_secs as None."""
    chunks = [
        TextChunk(chunk_index=0, text="some text here", start_char=0, end_char=14),
    ]
    result = _align_chunks_to_segments(chunks, [])
    assert result[0].start_secs is None


def test_align_chunks_to_segments_multiple_chunks():
    """Each chunk gets the start_secs of its matching segment."""
    chunks = [
        TextChunk(chunk_index=0, text="first part of transcript", start_char=0, end_char=24),
        TextChunk(chunk_index=1, text="second part here", start_char=24, end_char=40),
    ]
    segments = [
        {"start": 0.0, "end": 2.5, "text": "first part"},
        {"start": 2.5, "end": 5.0, "text": "second part"},
    ]
    result = _align_chunks_to_segments(chunks, segments)
    assert result[0].start_secs == pytest.approx(0.0)
    assert result[1].start_secs == pytest.approx(2.5)
