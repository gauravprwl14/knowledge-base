"""
Video ingestor — transcribes a raw video file via the voice-app Whisper service.

Calls the existing voice-app HTTP endpoint at VOICE_APP_URL/api/transcribe.
A timeout or connection refused raises VoiceAppUnavailableError (retryable=True)
so the job is re-queued to kms.content.retry rather than dead-lettered.

Prompt injection: video URLs are external input — callers wrap the returned
transcript in <external_content>...</external_content> before passing to Claude.
"""
import httpx
import structlog

from app.config import Settings
from app.errors import ContentIngestionError, VoiceAppUnavailableError

logger = structlog.get_logger(__name__)


class VideoIngestor:
    """
    Transcribes a raw video file by calling the voice-app Whisper service.

    Args:
        settings: Application configuration (VOICE_APP_URL).
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def ingest(self, video_url: str) -> str:
        """
        Transcribe a video file via voice-app.

        Args:
            video_url: URL of the video file accessible by voice-app.

        Returns:
            Transcript text.

        Raises:
            VoiceAppUnavailableError: On connection refused or timeout (retryable).
            ContentIngestionError: On non-retryable transcription failure.
        """
        log = logger.bind(video_url=video_url[:80])
        log.info("video_ingest_started")

        endpoint = f"{self._settings.voice_app_url.rstrip('/')}/api/transcribe"

        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(
                    endpoint,
                    json={"url": video_url, "language": "en"},
                )
                response.raise_for_status()

        except httpx.ConnectError as exc:
            raise VoiceAppUnavailableError(
                f"voice-app is unavailable at {self._settings.voice_app_url}. "
                "The service may be starting up. Will retry."
            ) from exc
        except httpx.TimeoutException as exc:
            raise VoiceAppUnavailableError(
                "voice-app transcription timed out (5 min). "
                "The video may be very long. Will retry."
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise ContentIngestionError(
                f"voice-app returned HTTP {exc.response.status_code}. "
                "Transcription failed.",
                retryable=exc.response.status_code >= 500,
            ) from exc

        data = response.json()
        transcript = data.get("transcript", "").strip()
        if not transcript:
            raise ContentIngestionError("voice-app returned empty transcript.")

        log.info("video_ingest_done", chars=len(transcript))
        return transcript
