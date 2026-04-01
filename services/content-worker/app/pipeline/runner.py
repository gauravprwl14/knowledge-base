"""
PipelineRunner — orchestrates content generation steps for a single job.

Step execution order:
  1. ingestion  (critical — failure halts pipeline)
  2. concept-extractor (critical)
  3. voice-builder (critical)
  4. [platform writers] (non-critical — failure marks step failed, pipeline continues)

Key invariants:
- Step status updates + content_piece INSERT happen in a single PostgreSQL transaction
  (prevents partial writes where the step appears done but the piece is missing).
- Already-DONE steps are skipped on retry (enables partial re-runs).
- job.updated_at is refreshed every 2 minutes as a heartbeat to prevent false
  stale-job detection (TODO-014 — not yet implemented; gap documented).
"""
import asyncio
import json
from typing import Any

import asyncpg
import structlog
from opentelemetry import trace

from app.config import Settings
from app.errors import (
    ContentIngestionError,
    KMSContentError,
    UnsupportedSourceTypeError,
)
from app.pipeline.ingestion.document_ingestor import DocumentIngestor
from app.pipeline.ingestion.url_ingestor import UrlIngestor
from app.pipeline.ingestion.youtube_ingestor import YouTubeIngestor
from app.pipeline.steps.concept_extractor import ConceptExtractor
from app.pipeline.steps.voice_builder import VoiceBuilder
from app.pipeline.steps.blog_writer import BlogWriter
from app.pipeline.steps.instagram_writer import InstagramWriter
from app.pipeline.steps.linkedin_writer import LinkedInWriter
from app.pipeline.steps.newsletter_writer import NewsletterWriter
from app.pipeline.steps.reels_scripter import ReelsScripter
from app.pipeline.steps.twitter_writer import TwitterWriter

logger = structlog.get_logger(__name__)
tracer = trace.get_tracer(__name__)

# Steps that must succeed; failure halts the pipeline and marks job FAILED.
# "video-ingest" was removed — VIDEO source type now routes to "doc-ingest"
# via DocumentIngestor (same as KMS_FILE/DOCUMENT).
CRITICAL_STEPS = {"yt-ingest", "url-ingest", "doc-ingest", "concept-extractor", "voice-builder"}

# Mapping of platform name → step class
PLATFORM_STEP_MAP = {
    "linkedin": LinkedInWriter,
    "twitter": TwitterWriter,
    "instagram": InstagramWriter,
    "blog": BlogWriter,
    "reels": ReelsScripter,
    "newsletter": NewsletterWriter,
}


class PipelineRunner:
    """
    Orchestrates the full content generation pipeline for one job.

    Args:
        settings: Application configuration.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._db: asyncpg.Pool | None = None

    async def setup(self) -> None:
        """
        Create the asyncpg connection pool.

        Called once at worker startup, before any messages are processed.
        """
        self._db = await asyncpg.create_pool(self._settings.database_url)

    async def run(self, message: dict[str, Any]) -> None:
        """
        Execute the pipeline for a single content job.

        Steps are run in order. Critical step failures mark the job FAILED and
        raise to the caller (which nacks the message). Non-critical step failures
        mark only that step FAILED; execution continues.

        Already-DONE steps are skipped to support partial re-runs after failures.

        Args:
            message: Decoded AMQP message body from kms.content queue.

        Raises:
            KMSContentError: On critical step failure.
            UnsupportedSourceTypeError: If source_type is not recognised.
        """
        job_id: str = message["job_id"]
        source_type: str = message["source_type"]
        config: dict = message.get("config_snapshot", {})
        voice_profile: str = message.get("voice_profile", "")

        with tracer.start_as_current_span("content_pipeline.run") as span:
            span.set_attribute("job_id", job_id)
            span.set_attribute("source_type", source_type)

            log = logger.bind(job_id=job_id, source_type=source_type)

            # Load current step statuses from DB to support retry (skip DONE steps)
            current_steps = await self._load_steps(job_id)

            # ── Step 1: Ingestion (critical) ──────────────────────────────────
            ingest_step_name = self._ingest_step_name(source_type)
            transcript_text = await self._run_critical_step(
                job_id=job_id,
                step_name=ingest_step_name,
                current_steps=current_steps,
                fn=lambda: self._ingest(source_type, message),
                log=log,
            )

            # Store transcript in DB
            await self._update_job_field(job_id, "transcript_text", transcript_text)

            # ── Step 2: Concept extraction (critical) ─────────────────────────
            concepts_text = await self._run_critical_step(
                job_id=job_id,
                step_name="concept-extractor",
                current_steps=current_steps,
                fn=lambda: ConceptExtractor(self._settings).run(transcript_text),
                log=log,
            )
            await self._update_job_field(job_id, "concepts_text", concepts_text)

            # ── Step 3: Voice builder (critical) ──────────────────────────────
            voice_brief_text = await self._run_critical_step(
                job_id=job_id,
                step_name="voice-builder",
                current_steps=current_steps,
                fn=lambda: VoiceBuilder(self._settings).run(concepts_text, voice_profile),
                log=log,
            )
            await self._update_job_field(job_id, "voice_brief_text", voice_brief_text)

            # ── Steps 4+: Platform writers (non-critical) ─────────────────────
            platforms: dict = config.get("platforms", {})
            enabled_platforms = [p for p, cfg in platforms.items() if cfg.get("enabled", False)]

            for platform in enabled_platforms:
                step_name = f"{platform}-writer"
                if current_steps.get(step_name) == "done":
                    log.info("content_step_skipped", step=step_name, reason="already_done")
                    continue

                variations_count: int = platforms[platform].get("variations", 1)
                formats: list[str] = platforms[platform].get("formats", ["post"])

                for fmt in formats:
                    for variation_index in range(variations_count):
                        await self._run_platform_step(
                            job_id=job_id,
                            user_id=message["user_id"],
                            step_name=step_name,
                            platform=platform,
                            fmt=fmt,
                            variation_index=variation_index,
                            concepts_text=concepts_text,
                            voice_brief_text=voice_brief_text,
                            log=log,
                        )

            # ── Mark job DONE ─────────────────────────────────────────────────
            await self._mark_job_done(job_id)
            log.info("content_pipeline_done")

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _ingest(self, source_type: str, message: dict[str, Any]) -> str:
        """
        Route to the correct ingestor based on source_type.

        Args:
            source_type: One of YOUTUBE, URL, VIDEO, DOCUMENT, KMS_FILE.
            message: Full AMQP message body.

        Returns:
            Plain-text transcript/content from the source.

        Raises:
            UnsupportedSourceTypeError: If source_type is not recognised.
            ContentIngestionError: If the ingestor fails.
        """
        source_url: str = message.get("source_url", "")
        source_file_id: str | None = message.get("source_file_id")

        if source_type == "YOUTUBE":
            return await YouTubeIngestor(self._settings).ingest(source_url)
        elif source_type == "URL":
            return await UrlIngestor(self._settings).ingest(source_url)
        elif source_type in ("VIDEO", "DOCUMENT", "KMS_FILE"):
            # VIDEO, DOCUMENT, and KMS_FILE all supply source_file_id — the DTO
            # enforces this via @ValidateIf.  source_url is None for all three types
            # so routing VIDEO to VideoIngestor(source_url) would always fail.
            # DocumentIngestor reassembles the indexed kms_chunks rows from
            # PostgreSQL; for a VIDEO file those chunks are the transcription text
            # produced after the embed-worker processed the file.
            assert source_file_id, f"source_file_id required for {source_type} source"
            return await DocumentIngestor(self._settings, self._db).ingest(source_file_id)
        else:
            raise UnsupportedSourceTypeError(source_type)

    def _ingest_step_name(self, source_type: str) -> str:
        """
        Map source_type to the canonical step name used in steps_json.

        VIDEO is mapped to "doc-ingest" (same as KMS_FILE/DOCUMENT) because
        all three now route through DocumentIngestor via source_file_id.
        "video-ingest" is intentionally absent — it was only used when VIDEO
        incorrectly routed to VideoIngestor(source_url), which is now fixed.
        """
        mapping = {
            "YOUTUBE": "yt-ingest",
            "URL": "url-ingest",
            "VIDEO": "doc-ingest",
            "DOCUMENT": "doc-ingest",
            "KMS_FILE": "doc-ingest",
        }
        return mapping.get(source_type, "ingest")

    async def _run_critical_step(
        self,
        job_id: str,
        step_name: str,
        current_steps: dict[str, str],
        fn,
        log,
    ) -> str:
        """
        Run a critical pipeline step.

        If the step is already DONE in the DB, returns the stored result.
        On failure, marks step FAILED, marks job FAILED, and raises.

        Args:
            job_id: Content job UUID.
            step_name: Step name key used in steps_json.
            current_steps: Current steps_json dict from DB.
            fn: Async callable that performs the step and returns its output text.
            log: Bound structlog logger.

        Returns:
            The step's text output.

        Raises:
            KMSContentError: On step failure.
        """
        if current_steps.get(step_name) == "done":
            log.info("content_step_skipped", step=step_name, reason="already_done")
            # Re-load the stored output from the job row
            return await self._load_step_output(job_id, step_name)

        await self._update_step_status(job_id, step_name, "in_progress")
        log.info("content_step_started", step=step_name)

        try:
            result: str = await fn()
            await self._update_step_status(job_id, step_name, "done")
            log.info("content_step_done", step=step_name)
            return result

        except KMSContentError as exc:
            await self._update_step_status(job_id, step_name, "failed")
            await self._mark_job_failed(job_id, exc.message)
            log.error("content_critical_step_failed", step=step_name, code=exc.code, error=exc.message)
            raise

    async def _run_platform_step(
        self,
        job_id: str,
        user_id: str,
        step_name: str,
        platform: str,
        fmt: str,
        variation_index: int,
        concepts_text: str,
        voice_brief_text: str,
        log,
    ) -> None:
        """
        Run a non-critical platform writer step.

        On failure: marks only this step FAILED; pipeline continues.
        Step status update + content_piece INSERT happen in a single transaction
        (prevents partial writes).

        Args:
            job_id: Content job UUID.
            user_id: Owning user UUID (denormalised into content_pieces).
            step_name: Step name key (e.g. 'linkedin-writer').
            platform: Platform name (e.g. 'linkedin').
            fmt: Format (e.g. 'post', 'thread').
            variation_index: 0 = primary; 1-N = additional variations.
            concepts_text: Extracted concepts markdown.
            voice_brief_text: Per-job voice brief markdown.
            log: Bound structlog logger.
        """
        await self._update_step_status(job_id, step_name, "in_progress")
        log.info("content_step_started", step=step_name, platform=platform, variation=variation_index)

        step_class = PLATFORM_STEP_MAP.get(platform)
        if step_class is None:
            log.warning("content_step_skipped", step=step_name, reason="no_writer_for_platform")
            await self._update_step_status(job_id, step_name, "skipped")
            return

        try:
            content: str = await step_class(self._settings).run(
                concepts_text=concepts_text,
                voice_brief_text=voice_brief_text,
                fmt=fmt,
                variation_index=variation_index,
            )

            # Atomic: step status update + piece INSERT in one transaction
            await self._commit_piece(
                job_id=job_id,
                user_id=user_id,
                step_name=step_name,
                platform=platform,
                fmt=fmt,
                variation_index=variation_index,
                content=content,
            )

            log.info("content_step_done", step=step_name, platform=platform, variation=variation_index)

        except Exception as exc:  # noqa: BLE001
            await self._update_step_status(job_id, step_name, "failed")
            log.error(
                "content_step_failed",
                step=step_name,
                platform=platform,
                error=str(exc),
            )
            # Non-critical — do not re-raise; pipeline continues to next platform

    async def _commit_piece(
        self,
        job_id: str,
        user_id: str,
        step_name: str,
        platform: str,
        fmt: str,
        variation_index: int,
        content: str,
    ) -> None:
        """
        Atomically write step status=done and INSERT content_piece in one transaction.

        Uses INSERT ... ON CONFLICT DO NOTHING for idempotency — if the worker
        crashes after INSERT but before ACK, the re-delivered message won't
        duplicate the piece.

        Args:
            job_id: Content job UUID.
            user_id: Owning user UUID.
            step_name: Step name for steps_json update.
            platform: Platform name.
            fmt: Format name.
            variation_index: Variation index.
            content: Generated content text.
        """
        assert self._db is not None, "DB pool not initialised"

        async with self._db.acquire() as conn:
            async with conn.transaction():
                # Update step status to done
                await conn.execute(
                    """
                    UPDATE content_jobs
                    SET steps_json = jsonb_set(steps_json, $1::text[], $2::jsonb),
                        updated_at = NOW()
                    WHERE id = $3::uuid
                    """,
                    [step_name],
                    '"done"',
                    job_id,
                )

                # Insert piece — ON CONFLICT DO NOTHING for idempotency
                # The @@unique([jobId, platform, format, variationIndex]) constraint
                # prevents duplicates if this message is re-delivered after a crash.
                await conn.execute(
                    """
                    INSERT INTO content_pieces
                        (id, job_id, user_id, platform, format, variation_index,
                         content, status, is_active, version, created_at, updated_at)
                    VALUES
                        (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5,
                         $6, 'draft', $7, 1, NOW(), NOW())
                    ON CONFLICT (job_id, platform, format, variation_index)
                    DO NOTHING
                    """,
                    job_id,
                    user_id,
                    platform,
                    fmt,
                    variation_index,
                    content,
                    variation_index == 0,  # only primary variation is active initially
                )

    async def _update_step_status(
        self, job_id: str, step_name: str, status: str
    ) -> None:
        """Update a single step's status in steps_json + bump updated_at."""
        assert self._db is not None
        await self._db.execute(
            """
            UPDATE content_jobs
            SET steps_json = jsonb_set(steps_json, $1::text[], $2::jsonb),
                updated_at = NOW()
            WHERE id = $3::uuid
            """,
            [step_name],
            json.dumps(status),
            job_id,
        )

    async def _mark_job_failed(self, job_id: str, error_message: str) -> None:
        """Mark job status as FAILED with error message."""
        assert self._db is not None
        await self._db.execute(
            """
            UPDATE content_jobs
            SET status = 'FAILED', error_message = $1, updated_at = NOW()
            WHERE id = $2::uuid
            """,
            error_message,
            job_id,
        )

    async def _mark_job_done(self, job_id: str) -> None:
        """Mark job status as DONE and set completed_at."""
        assert self._db is not None
        await self._db.execute(
            """
            UPDATE content_jobs
            SET status = 'DONE', completed_at = NOW(), updated_at = NOW()
            WHERE id = $1::uuid
            """,
            job_id,
        )

    async def _update_job_field(self, job_id: str, field: str, value: str) -> None:
        """Update a text field on content_jobs (transcript_text, concepts_text, voice_brief_text)."""
        assert self._db is not None
        # Field names are internal constants — not from user input — so f-string is safe here
        await self._db.execute(
            f"UPDATE content_jobs SET {field} = $1, updated_at = NOW() WHERE id = $2::uuid",
            value,
            job_id,
        )

    async def _load_steps(self, job_id: str) -> dict[str, str]:
        """Load the current steps_json from DB for skip-on-retry logic."""
        assert self._db is not None
        row = await self._db.fetchrow(
            "SELECT steps_json FROM content_jobs WHERE id = $1::uuid",
            job_id,
        )
        if row is None:
            return {}
        steps = row["steps_json"]
        return steps if isinstance(steps, dict) else {}

    async def _load_step_output(self, job_id: str, step_name: str) -> str:
        """
        Re-load a completed step's output from the job row.

        Called when a step is already DONE on retry — avoids re-running it.
        Maps step_name to the appropriate content_jobs column.

        Args:
            job_id: Content job UUID.
            step_name: Step name (e.g. 'yt-ingest', 'concept-extractor').

        Returns:
            Stored text output for the step, or empty string if not found.
        """
        field_map = {
            "yt-ingest": "transcript_text",
            "url-ingest": "transcript_text",
            "video-ingest": "transcript_text",
            "doc-ingest": "transcript_text",
            "concept-extractor": "concepts_text",
            "voice-builder": "voice_brief_text",
        }
        field = field_map.get(step_name)
        if not field:
            return ""

        assert self._db is not None
        row = await self._db.fetchrow(
            f"SELECT {field} FROM content_jobs WHERE id = $1::uuid",
            job_id,
        )
        return (row[field] or "") if row else ""
