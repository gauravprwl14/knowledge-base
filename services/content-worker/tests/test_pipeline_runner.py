"""
Unit tests for ContentPipelineRunner (app/pipeline/runner.py).

Covers:
  - Skip-on-retry: already-DONE steps are skipped; their stored output is re-loaded.
  - Critical step failure: pipeline halts and job is marked FAILED.
  - Non-critical step failure: pipeline continues; only that step is marked FAILED.
  - Full happy-path run: job is marked DONE after all steps complete.
  - Platform extraction: enabled/disabled flags in config_snapshot are respected.
  - Ingest routing: each source_type maps to the correct ingestor class.

All asyncpg pool calls and all ingestors/steps are mocked — no real DB or
network connections are made.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import Settings
from app.errors import ContentIngestionError, ContentGenerationError, UnsupportedSourceTypeError
from app.pipeline.runner import PipelineRunner


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_settings() -> Settings:
    """Return a Settings instance with test-safe values."""
    return Settings(
        database_url="postgresql://test:test@localhost/test",
        rabbitmq_url="amqp://guest:guest@localhost/",
        anthropic_api_key="test-key",
        firecrawl_api_key="",
    )


def _make_runner() -> tuple[PipelineRunner, MagicMock]:
    """
    Construct a PipelineRunner with a pre-wired mock asyncpg pool.

    Returns:
        Tuple of (runner, mock_db) where mock_db is the AsyncMock pool
        attached to runner._db.
    """
    settings = _make_settings()
    runner = PipelineRunner(settings)

    # Build a mock pool that returns sensible defaults for all DB calls.
    mock_db = AsyncMock()

    # _load_steps: fetchrow returns {"steps_json": {}} by default (no done steps)
    steps_row = MagicMock()
    steps_row.__getitem__ = lambda self, key: {} if key == "steps_json" else None
    mock_db.fetchrow = AsyncMock(return_value=steps_row)

    # _update_step_status, _mark_job_failed, _mark_job_done, _update_job_field
    mock_db.execute = AsyncMock(return_value=None)

    runner._db = mock_db
    return runner, mock_db


def _make_message(
    source_type: str = "URL",
    source_url: str = "https://example.com/article",
    source_file_id: str | None = None,
    platforms: dict | None = None,
) -> dict:
    """Build a minimal valid AMQP message body for the pipeline runner."""
    return {
        "job_id": "job-uuid-1234",
        "user_id": "user-uuid-5678",
        "source_type": source_type,
        "source_url": source_url,
        "source_file_id": source_file_id,
        "voice_profile": "I speak casually and use lots of metaphors.",
        "config_snapshot": {
            "platforms": platforms or {}
        },
    }


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestSkipDoneSteps:
    """Verify that already-DONE steps are skipped on retry runs."""

    @pytest.mark.asyncio
    async def test_pipeline_skips_done_ingest_step_on_retry(self):
        """
        When steps_json shows url-ingest as 'done', the ingestor is not called
        and the stored transcript_text is re-loaded from the job row.
        """
        runner, mock_db = _make_runner()

        # Simulate DB state: ingest step already done
        steps_row = MagicMock()
        steps_row.__getitem__ = lambda self, key: (
            {"url-ingest": "done"} if key == "steps_json" else None
        )

        # _load_steps returns the done state; _load_step_output returns the stored text
        transcript_row = MagicMock()
        transcript_row.__getitem__ = lambda self, key: "Stored transcript" if key == "transcript_text" else None

        mock_db.fetchrow = AsyncMock(side_effect=[steps_row, transcript_row])

        message = _make_message(source_type="URL")

        with patch("app.pipeline.runner.UrlIngestor") as mock_url_ingestor_cls, \
             patch("app.pipeline.runner.ConceptExtractor") as mock_concept_cls, \
             patch("app.pipeline.runner.VoiceBuilder") as mock_voice_cls:

            mock_url_ingestor_cls.return_value.ingest = AsyncMock(return_value="Fresh transcript")
            mock_concept_cls.return_value.run = AsyncMock(return_value="concepts")
            mock_voice_cls.return_value.run = AsyncMock(return_value="voice brief")

            await runner.run(message)

        # UrlIngestor.ingest must NOT have been called — step was skipped
        mock_url_ingestor_cls.return_value.ingest.assert_not_called()

    @pytest.mark.asyncio
    async def test_pipeline_skips_done_concept_step_on_retry(self):
        """
        When steps_json shows concept-extractor as 'done', ConceptExtractor.run
        is not called and the stored concepts_text is re-loaded.
        """
        runner, mock_db = _make_runner()

        # Both ingest and concept-extractor already done
        steps_row = MagicMock()
        steps_row.__getitem__ = lambda self, key: (
            {"url-ingest": "done", "concept-extractor": "done"} if key == "steps_json" else None
        )

        transcript_row = MagicMock()
        transcript_row.__getitem__ = lambda self, key: "Stored transcript" if key == "transcript_text" else None

        concepts_row = MagicMock()
        concepts_row.__getitem__ = lambda self, key: "Stored concepts" if key == "concepts_text" else None

        mock_db.fetchrow = AsyncMock(side_effect=[steps_row, transcript_row, concepts_row])

        message = _make_message(source_type="URL")

        with patch("app.pipeline.runner.UrlIngestor"), \
             patch("app.pipeline.runner.ConceptExtractor") as mock_concept_cls, \
             patch("app.pipeline.runner.VoiceBuilder") as mock_voice_cls:

            mock_concept_cls.return_value.run = AsyncMock(return_value="fresh concepts")
            mock_voice_cls.return_value.run = AsyncMock(return_value="voice brief")

            await runner.run(message)

        # ConceptExtractor.run must NOT have been called
        mock_concept_cls.return_value.run.assert_not_called()


class TestCriticalStepFailure:
    """Verify that a critical step failure halts the pipeline and marks job FAILED."""

    @pytest.mark.asyncio
    async def test_critical_step_failure_halts_pipeline(self):
        """
        When UrlIngestor.ingest raises ContentIngestionError, the pipeline:
        1. Marks the ingest step as 'failed'.
        2. Marks the job as FAILED.
        3. Re-raises so the caller can nack the message.
        4. Does NOT run ConceptExtractor or VoiceBuilder.
        """
        runner, mock_db = _make_runner()
        message = _make_message(source_type="URL")

        ingest_error = ContentIngestionError("Page not found", retryable=False)

        with patch("app.pipeline.runner.UrlIngestor") as mock_url_cls, \
             patch("app.pipeline.runner.ConceptExtractor") as mock_concept_cls, \
             patch("app.pipeline.runner.VoiceBuilder") as mock_voice_cls:

            mock_url_cls.return_value.ingest = AsyncMock(side_effect=ingest_error)

            with pytest.raises(ContentIngestionError):
                await runner.run(message)

        # ConceptExtractor and VoiceBuilder must NOT have been called
        mock_concept_cls.return_value.run.assert_not_called()
        mock_voice_cls.return_value.run.assert_not_called()

        # _mark_job_failed must have been called once
        execute_calls = mock_db.execute.call_args_list
        failed_calls = [c for c in execute_calls if "FAILED" in str(c)]
        assert len(failed_calls) >= 1, "Job was not marked FAILED after critical step error"

    @pytest.mark.asyncio
    async def test_concept_extractor_failure_marks_job_failed(self):
        """
        When ConceptExtractor.run raises, the job is marked FAILED and the
        pipeline does not proceed to VoiceBuilder.
        """
        runner, mock_db = _make_runner()
        message = _make_message(source_type="URL")

        generation_error = ContentGenerationError("Rate limit exceeded", retryable=True)

        with patch("app.pipeline.runner.UrlIngestor") as mock_url_cls, \
             patch("app.pipeline.runner.ConceptExtractor") as mock_concept_cls, \
             patch("app.pipeline.runner.VoiceBuilder") as mock_voice_cls:

            mock_url_cls.return_value.ingest = AsyncMock(return_value="transcript")
            mock_concept_cls.return_value.run = AsyncMock(side_effect=generation_error)

            with pytest.raises(ContentGenerationError):
                await runner.run(message)

        mock_voice_cls.return_value.run.assert_not_called()

        execute_calls = mock_db.execute.call_args_list
        failed_calls = [c for c in execute_calls if "FAILED" in str(c)]
        assert len(failed_calls) >= 1, "Job was not marked FAILED after concept extractor error"


class TestNonCriticalStepFailure:
    """Verify that non-critical platform step failures do NOT halt the pipeline."""

    @pytest.mark.asyncio
    async def test_non_critical_step_failure_continues_pipeline(self):
        """
        When a platform writer raises an exception, the pipeline:
        1. Marks only that step FAILED.
        2. Continues to the next platform.
        3. Eventually marks the job DONE.
        """
        runner, mock_db = _make_runner()
        platforms = {
            "linkedin": {"enabled": True, "variations": 1, "formats": ["post"]},
            "twitter": {"enabled": True, "variations": 1, "formats": ["post"]},
        }
        message = _make_message(source_type="URL", platforms=platforms)

        # Simulate atomic commit for platform steps
        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=None)
        mock_conn.transaction = MagicMock(return_value=mock_conn)
        mock_conn.execute = AsyncMock(return_value=None)
        mock_db.acquire = MagicMock(return_value=mock_conn)

        mock_linkedin_inst = AsyncMock()
        mock_linkedin_inst.run = AsyncMock(side_effect=RuntimeError("LinkedIn API down"))
        mock_twitter_inst = AsyncMock()
        mock_twitter_inst.run = AsyncMock(return_value="tweet content")
        mock_linkedin_cls = MagicMock(return_value=mock_linkedin_inst)
        mock_twitter_cls = MagicMock(return_value=mock_twitter_inst)

        with patch("app.pipeline.runner.UrlIngestor") as mock_url_cls, \
             patch("app.pipeline.runner.ConceptExtractor") as mock_concept_cls, \
             patch("app.pipeline.runner.VoiceBuilder") as mock_voice_cls, \
             patch.dict("app.pipeline.runner.PLATFORM_STEP_MAP", {
                 "linkedin": mock_linkedin_cls,
                 "twitter": mock_twitter_cls,
             }):

            mock_url_cls.return_value.ingest = AsyncMock(return_value="transcript")
            mock_concept_cls.return_value.run = AsyncMock(return_value="concepts")
            mock_voice_cls.return_value.run = AsyncMock(return_value="voice brief")

            # Should NOT raise — non-critical failures are absorbed
            await runner.run(message)

        # Twitter writer must have been called despite LinkedIn failure
        mock_twitter_inst.run.assert_called_once()

        # Job must be marked DONE (not FAILED)
        execute_calls = mock_db.execute.call_args_list
        done_calls = [c for c in execute_calls if "DONE" in str(c)]
        assert len(done_calls) >= 1, "Job was not marked DONE after non-critical step failure"

    @pytest.mark.asyncio
    async def test_non_critical_step_failure_marks_step_failed(self):
        """
        When a platform writer raises, its step status is set to 'failed'
        in steps_json (not left as 'in_progress').
        """
        runner, mock_db = _make_runner()
        platforms = {
            "linkedin": {"enabled": True, "variations": 1, "formats": ["post"]},
        }
        message = _make_message(source_type="URL", platforms=platforms)

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=None)
        mock_conn.transaction = MagicMock(return_value=mock_conn)
        mock_conn.execute = AsyncMock(return_value=None)
        mock_db.acquire = MagicMock(return_value=mock_conn)

        with patch("app.pipeline.runner.UrlIngestor") as mock_url_cls, \
             patch("app.pipeline.runner.ConceptExtractor") as mock_concept_cls, \
             patch("app.pipeline.runner.VoiceBuilder") as mock_voice_cls, \
             patch("app.pipeline.runner.LinkedInWriter") as mock_linkedin_cls:

            mock_url_cls.return_value.ingest = AsyncMock(return_value="transcript")
            mock_concept_cls.return_value.run = AsyncMock(return_value="concepts")
            mock_voice_cls.return_value.run = AsyncMock(return_value="voice brief")
            mock_linkedin_cls.return_value.run = AsyncMock(side_effect=RuntimeError("boom"))

            await runner.run(message)

        # Verify that _update_step_status was called with 'failed' for linkedin-writer
        execute_calls = mock_db.execute.call_args_list
        failed_step_calls = [
            c for c in execute_calls
            if "failed" in str(c) and "linkedin-writer" in str(c)
        ]
        assert len(failed_step_calls) >= 1, (
            "linkedin-writer step was not marked 'failed' in steps_json after the exception"
        )


class TestAllStepsComplete:
    """Verify that a clean full run marks the job DONE."""

    @pytest.mark.asyncio
    async def test_all_steps_complete_marks_job_done(self):
        """
        Full happy-path run: ingest → concept → voice → platform writers.
        Job must be marked DONE at the end.
        """
        runner, mock_db = _make_runner()
        platforms = {
            "linkedin": {"enabled": True, "variations": 1, "formats": ["post"]},
        }
        message = _make_message(source_type="URL", platforms=platforms)

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=None)
        mock_conn.transaction = MagicMock(return_value=mock_conn)
        mock_conn.execute = AsyncMock(return_value=None)
        mock_db.acquire = MagicMock(return_value=mock_conn)

        mock_linkedin_inst = AsyncMock()
        mock_linkedin_inst.run = AsyncMock(return_value="linkedin post")
        mock_linkedin_cls = MagicMock(return_value=mock_linkedin_inst)

        with patch("app.pipeline.runner.UrlIngestor") as mock_url_cls, \
             patch("app.pipeline.runner.ConceptExtractor") as mock_concept_cls, \
             patch("app.pipeline.runner.VoiceBuilder") as mock_voice_cls, \
             patch.dict("app.pipeline.runner.PLATFORM_STEP_MAP", {"linkedin": mock_linkedin_cls}):

            mock_url_cls.return_value.ingest = AsyncMock(return_value="transcript text")
            mock_concept_cls.return_value.run = AsyncMock(return_value="extracted concepts")
            mock_voice_cls.return_value.run = AsyncMock(return_value="voice brief text")

            await runner.run(message)

        # Verify job is marked DONE
        execute_calls = mock_db.execute.call_args_list
        done_calls = [c for c in execute_calls if "DONE" in str(c)]
        assert len(done_calls) >= 1, "Job was not marked DONE after successful run"

    @pytest.mark.asyncio
    async def test_all_critical_steps_called_in_order(self):
        """
        Ingest → concept → voice calls must happen in that order.
        Verified by checking call counts on all three mocks.
        """
        runner, mock_db = _make_runner()
        message = _make_message(source_type="YOUTUBE")

        call_order: list[str] = []

        async def ingest_side_effect(url):
            call_order.append("ingest")
            return "transcript"

        async def concept_side_effect(*args, **kwargs):
            call_order.append("concept")
            return "concepts"

        async def voice_side_effect(*args, **kwargs):
            call_order.append("voice")
            return "voice brief"

        with patch("app.pipeline.runner.YouTubeIngestor") as mock_yt_cls, \
             patch("app.pipeline.runner.ConceptExtractor") as mock_concept_cls, \
             patch("app.pipeline.runner.VoiceBuilder") as mock_voice_cls:

            mock_yt_cls.return_value.ingest = ingest_side_effect
            mock_concept_cls.return_value.run = concept_side_effect
            mock_voice_cls.return_value.run = voice_side_effect

            await runner.run(message)

        assert call_order == ["ingest", "concept", "voice"], (
            f"Steps ran out of order: {call_order}"
        )


class TestPlatformConfig:
    """Verify platform enabling/disabling from config_snapshot."""

    @pytest.mark.asyncio
    async def test_disabled_platform_is_skipped(self):
        """
        A platform with enabled=False must not have its writer called.
        """
        runner, mock_db = _make_runner()
        platforms = {
            "linkedin": {"enabled": False, "variations": 1, "formats": ["post"]},
            "twitter": {"enabled": True, "variations": 1, "formats": ["post"]},
        }
        message = _make_message(source_type="URL", platforms=platforms)

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=None)
        mock_conn.transaction = MagicMock(return_value=mock_conn)
        mock_conn.execute = AsyncMock(return_value=None)
        mock_db.acquire = MagicMock(return_value=mock_conn)

        mock_linkedin_inst = AsyncMock()
        mock_linkedin_inst.run = AsyncMock(return_value="linkedin post")
        mock_twitter_inst = AsyncMock()
        mock_twitter_inst.run = AsyncMock(return_value="tweet")
        mock_linkedin_cls = MagicMock(return_value=mock_linkedin_inst)
        mock_twitter_cls = MagicMock(return_value=mock_twitter_inst)

        with patch("app.pipeline.runner.UrlIngestor") as mock_url_cls, \
             patch("app.pipeline.runner.ConceptExtractor") as mock_concept_cls, \
             patch("app.pipeline.runner.VoiceBuilder") as mock_voice_cls, \
             patch.dict("app.pipeline.runner.PLATFORM_STEP_MAP", {
                 "linkedin": mock_linkedin_cls,
                 "twitter": mock_twitter_cls,
             }):

            mock_url_cls.return_value.ingest = AsyncMock(return_value="transcript")
            mock_concept_cls.return_value.run = AsyncMock(return_value="concepts")
            mock_voice_cls.return_value.run = AsyncMock(return_value="voice brief")

            await runner.run(message)

        # LinkedIn is disabled — must not have been called
        mock_linkedin_inst.run.assert_not_called()
        # Twitter is enabled — must have been called
        mock_twitter_inst.run.assert_called_once()

    @pytest.mark.asyncio
    async def test_platforms_are_extracted_from_config_snapshot(self):
        """
        All enabled platforms in config_snapshot.platforms are processed.
        """
        runner, mock_db = _make_runner()
        platforms = {
            "linkedin": {"enabled": True, "variations": 1, "formats": ["post"]},
            "blog": {"enabled": True, "variations": 1, "formats": ["post"]},
        }
        message = _make_message(source_type="URL", platforms=platforms)

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=None)
        mock_conn.transaction = MagicMock(return_value=mock_conn)
        mock_conn.execute = AsyncMock(return_value=None)
        mock_db.acquire = MagicMock(return_value=mock_conn)

        mock_linkedin_inst = AsyncMock()
        mock_linkedin_inst.run = AsyncMock(return_value="linkedin post")
        mock_blog_inst = AsyncMock()
        mock_blog_inst.run = AsyncMock(return_value="blog post")
        mock_linkedin_cls = MagicMock(return_value=mock_linkedin_inst)
        mock_blog_cls = MagicMock(return_value=mock_blog_inst)

        with patch("app.pipeline.runner.UrlIngestor") as mock_url_cls, \
             patch("app.pipeline.runner.ConceptExtractor") as mock_concept_cls, \
             patch("app.pipeline.runner.VoiceBuilder") as mock_voice_cls, \
             patch.dict("app.pipeline.runner.PLATFORM_STEP_MAP", {
                 "linkedin": mock_linkedin_cls,
                 "blog": mock_blog_cls,
             }):

            mock_url_cls.return_value.ingest = AsyncMock(return_value="transcript")
            mock_concept_cls.return_value.run = AsyncMock(return_value="concepts")
            mock_voice_cls.return_value.run = AsyncMock(return_value="voice brief")

            await runner.run(message)

        mock_linkedin_inst.run.assert_called_once()
        mock_blog_inst.run.assert_called_once()

    @pytest.mark.asyncio
    async def test_no_platforms_skips_all_writers(self):
        """
        An empty platforms dict means no platform writers are called.
        Job still completes as DONE (critical steps are enough).
        """
        runner, mock_db = _make_runner()
        message = _make_message(source_type="URL", platforms={})

        with patch("app.pipeline.runner.UrlIngestor") as mock_url_cls, \
             patch("app.pipeline.runner.ConceptExtractor") as mock_concept_cls, \
             patch("app.pipeline.runner.VoiceBuilder") as mock_voice_cls, \
             patch("app.pipeline.runner.LinkedInWriter") as mock_linkedin_cls:

            mock_url_cls.return_value.ingest = AsyncMock(return_value="transcript")
            mock_concept_cls.return_value.run = AsyncMock(return_value="concepts")
            mock_voice_cls.return_value.run = AsyncMock(return_value="voice brief")

            await runner.run(message)

        mock_linkedin_cls.return_value.run.assert_not_called()

        execute_calls = mock_db.execute.call_args_list
        done_calls = [c for c in execute_calls if "DONE" in str(c)]
        assert len(done_calls) >= 1


class TestIngestRouting:
    """Verify that each source_type routes to the correct ingestor."""

    @pytest.mark.asyncio
    async def test_youtube_source_type_routes_to_youtube_ingestor(self):
        """YOUTUBE source_type must use YouTubeIngestor, not UrlIngestor."""
        runner, mock_db = _make_runner()
        message = _make_message(source_type="YOUTUBE", source_url="https://youtu.be/dQw4w9WgXcQ")

        with patch("app.pipeline.runner.YouTubeIngestor") as mock_yt_cls, \
             patch("app.pipeline.runner.UrlIngestor") as mock_url_cls, \
             patch("app.pipeline.runner.ConceptExtractor") as mock_concept_cls, \
             patch("app.pipeline.runner.VoiceBuilder") as mock_voice_cls:

            mock_yt_cls.return_value.ingest = AsyncMock(return_value="yt transcript")
            mock_concept_cls.return_value.run = AsyncMock(return_value="concepts")
            mock_voice_cls.return_value.run = AsyncMock(return_value="voice brief")

            await runner.run(message)

        mock_yt_cls.return_value.ingest.assert_called_once()
        mock_url_cls.return_value.ingest.assert_not_called()

    @pytest.mark.asyncio
    async def test_url_source_type_routes_to_url_ingestor(self):
        """URL source_type must use UrlIngestor."""
        runner, mock_db = _make_runner()
        message = _make_message(source_type="URL", source_url="https://example.com/post")

        with patch("app.pipeline.runner.UrlIngestor") as mock_url_cls, \
             patch("app.pipeline.runner.YouTubeIngestor") as mock_yt_cls, \
             patch("app.pipeline.runner.ConceptExtractor") as mock_concept_cls, \
             patch("app.pipeline.runner.VoiceBuilder") as mock_voice_cls:

            mock_url_cls.return_value.ingest = AsyncMock(return_value="url content")
            mock_concept_cls.return_value.run = AsyncMock(return_value="concepts")
            mock_voice_cls.return_value.run = AsyncMock(return_value="voice brief")

            await runner.run(message)

        mock_url_cls.return_value.ingest.assert_called_once()
        mock_yt_cls.return_value.ingest.assert_not_called()

    @pytest.mark.asyncio
    async def test_kms_file_source_type_routes_to_document_ingestor(self):
        """KMS_FILE source_type must use DocumentIngestor with source_file_id."""
        runner, mock_db = _make_runner()
        message = _make_message(
            source_type="KMS_FILE",
            source_url="",
            source_file_id="file-uuid-9999",
        )

        with patch("app.pipeline.runner.DocumentIngestor") as mock_doc_cls, \
             patch("app.pipeline.runner.UrlIngestor") as mock_url_cls, \
             patch("app.pipeline.runner.ConceptExtractor") as mock_concept_cls, \
             patch("app.pipeline.runner.VoiceBuilder") as mock_voice_cls:

            mock_doc_cls.return_value.ingest = AsyncMock(return_value="doc content")
            mock_concept_cls.return_value.run = AsyncMock(return_value="concepts")
            mock_voice_cls.return_value.run = AsyncMock(return_value="voice brief")

            await runner.run(message)

        mock_doc_cls.return_value.ingest.assert_called_once_with("file-uuid-9999")
        mock_url_cls.return_value.ingest.assert_not_called()

    @pytest.mark.asyncio
    async def test_video_source_type_routes_to_document_ingestor(self):
        """
        VIDEO source_type routes to DocumentIngestor (not VideoIngestor).
        VIDEO files are already transcribed by the embed-worker; their text
        lives in kms_chunks, same as DOCUMENT and KMS_FILE.
        """
        runner, mock_db = _make_runner()
        message = _make_message(
            source_type="VIDEO",
            source_url="",
            source_file_id="file-uuid-video",
        )

        with patch("app.pipeline.runner.DocumentIngestor") as mock_doc_cls, \
             patch("app.pipeline.runner.ConceptExtractor") as mock_concept_cls, \
             patch("app.pipeline.runner.VoiceBuilder") as mock_voice_cls:

            mock_doc_cls.return_value.ingest = AsyncMock(return_value="video transcript from chunks")
            mock_concept_cls.return_value.run = AsyncMock(return_value="concepts")
            mock_voice_cls.return_value.run = AsyncMock(return_value="voice brief")

            await runner.run(message)

        mock_doc_cls.return_value.ingest.assert_called_once_with("file-uuid-video")

    @pytest.mark.asyncio
    async def test_unsupported_source_type_raises(self):
        """An unknown source_type raises UnsupportedSourceTypeError."""
        runner, _ = _make_runner()
        message = _make_message(source_type="UNKNOWN_TYPE")

        with pytest.raises(UnsupportedSourceTypeError):
            await runner.run(message)


class TestIngestStepNameMapping:
    """Verify _ingest_step_name maps source types to canonical step names."""

    def test_youtube_maps_to_yt_ingest(self):
        """YOUTUBE → 'yt-ingest'."""
        runner, _ = _make_runner()
        assert runner._ingest_step_name("YOUTUBE") == "yt-ingest"

    def test_url_maps_to_url_ingest(self):
        """URL → 'url-ingest'."""
        runner, _ = _make_runner()
        assert runner._ingest_step_name("URL") == "url-ingest"

    def test_kms_file_maps_to_doc_ingest(self):
        """KMS_FILE → 'doc-ingest'."""
        runner, _ = _make_runner()
        assert runner._ingest_step_name("KMS_FILE") == "doc-ingest"

    def test_video_maps_to_doc_ingest(self):
        """
        VIDEO → 'doc-ingest', not 'video-ingest'.
        This confirms the intentional routing fix: VIDEO now goes through
        DocumentIngestor so the old 'video-ingest' step name is never used.
        """
        runner, _ = _make_runner()
        assert runner._ingest_step_name("VIDEO") == "doc-ingest"

    def test_document_maps_to_doc_ingest(self):
        """DOCUMENT → 'doc-ingest'."""
        runner, _ = _make_runner()
        assert runner._ingest_step_name("DOCUMENT") == "doc-ingest"

    def test_unknown_type_maps_to_ingest_fallback(self):
        """Unknown source types fall back to generic 'ingest' key."""
        runner, _ = _make_runner()
        assert runner._ingest_step_name("SOMETHING_NEW") == "ingest"
