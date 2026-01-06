import subprocess
import tempfile
import os
from pathlib import Path

from app.config import get_settings

settings = get_settings()


class VideoExtractor:
    """Service for extracting audio from video files using FFmpeg."""

    VIDEO_EXTENSIONS = {"mp4", "mov", "avi", "mkv", "webm", "flv", "wmv", "m4v", "3gp"}

    @staticmethod
    def is_video(file_path: str) -> bool:
        """Check if file is a video based on extension."""
        ext = Path(file_path).suffix.lower().lstrip(".")
        return ext in VideoExtractor.VIDEO_EXTENSIONS

    @staticmethod
    async def extract_audio(
        video_path: str,
        output_path: str = None,
        audio_format: str = "wav"
    ) -> str:
        """
        Extract audio track from video file.

        Args:
            video_path: Path to video file
            output_path: Optional output path (creates temp file if not provided)
            audio_format: Output audio format (default: wav)

        Returns:
            Path to extracted audio file
        """
        if output_path is None:
            fd, output_path = tempfile.mkstemp(
                suffix=f".{audio_format}",
                dir=settings.temp_processed_dir
            )
            os.close(fd)

        cmd = [
            "ffmpeg",
            "-y",  # Overwrite output
            "-i", video_path,
            "-vn",  # No video output
            "-acodec", "pcm_s16le" if audio_format == "wav" else "libmp3lame",
            "-ar", "16000",  # 16kHz sample rate
            "-ac", "1",  # Mono
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            raise Exception(f"Failed to extract audio: {result.stderr}")

        return output_path

    @staticmethod
    async def get_video_info(video_path: str) -> dict:
        """
        Get video file information.

        Returns:
            Dict with duration, video_codec, audio_codec, resolution
        """
        try:
            cmd = [
                "ffprobe",
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                video_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.returncode != 0:
                return {}

            import json
            data = json.loads(result.stdout)

            video_stream = None
            audio_stream = None

            for stream in data.get("streams", []):
                if stream.get("codec_type") == "video" and video_stream is None:
                    video_stream = stream
                elif stream.get("codec_type") == "audio" and audio_stream is None:
                    audio_stream = stream

            return {
                "duration": float(data.get("format", {}).get("duration", 0)),
                "video_codec": video_stream.get("codec_name") if video_stream else None,
                "audio_codec": audio_stream.get("codec_name") if audio_stream else None,
                "width": video_stream.get("width") if video_stream else None,
                "height": video_stream.get("height") if video_stream else None,
                "has_audio": audio_stream is not None
            }
        except Exception as e:
            return {"error": str(e)}
