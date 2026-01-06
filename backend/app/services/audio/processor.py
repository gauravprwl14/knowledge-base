import subprocess
import tempfile
import os
from pathlib import Path
import struct
import numpy as np
from typing import Optional, Tuple

from app.config import get_settings

settings = get_settings()


class AudioProcessor:
    """
    Audio processing service for format conversion and normalization.

    Target format for transcription:
    - Sample rate: 16000 Hz
    - Channels: 1 (mono)
    - Bit depth: 16-bit PCM
    - Format: WAV
    """

    TARGET_SAMPLE_RATE = 16000
    TARGET_CHANNELS = 1
    TARGET_BIT_DEPTH = 16

    @staticmethod
    def is_video_file(file_path: str) -> bool:
        """Check if file is a video format."""
        video_extensions = {"mp4", "mov", "avi", "mkv", "webm", "flv", "wmv"}
        ext = Path(file_path).suffix.lower().lstrip(".")
        return ext in video_extensions

    @staticmethod
    async def get_audio_info(file_path: str) -> dict:
        """
        Get audio file information using ffprobe.

        Returns:
            Dict with sample_rate, channels, duration, format
        """
        try:
            cmd = [
                "ffprobe",
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                file_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.returncode != 0:
                return {}

            import json
            data = json.loads(result.stdout)

            # Find audio stream
            audio_stream = None
            for stream in data.get("streams", []):
                if stream.get("codec_type") == "audio":
                    audio_stream = stream
                    break

            if not audio_stream:
                return {}

            return {
                "sample_rate": int(audio_stream.get("sample_rate", 0)),
                "channels": int(audio_stream.get("channels", 0)),
                "duration": float(data.get("format", {}).get("duration", 0)),
                "format": data.get("format", {}).get("format_name", ""),
                "codec": audio_stream.get("codec_name", "")
            }
        except Exception as e:
            return {"error": str(e)}

    @staticmethod
    async def convert_to_wav(
        input_path: str,
        output_path: Optional[str] = None,
        sample_rate: int = 16000,
        channels: int = 1
    ) -> str:
        """
        Convert audio/video file to WAV format suitable for transcription.

        Args:
            input_path: Path to input file
            output_path: Path for output file (optional, creates temp file if not provided)
            sample_rate: Target sample rate (default 16000)
            channels: Target channels (default 1 for mono)

        Returns:
            Path to converted WAV file
        """
        if output_path is None:
            # Create temp file
            fd, output_path = tempfile.mkstemp(suffix=".wav", dir=settings.temp_processed_dir)
            os.close(fd)

        cmd = [
            "ffmpeg",
            "-y",  # Overwrite output
            "-i", input_path,
            "-vn",  # No video
            "-acodec", "pcm_s16le",  # 16-bit PCM
            "-ar", str(sample_rate),
            "-ac", str(channels),
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            raise Exception(f"FFmpeg conversion failed: {result.stderr}")

        return output_path

    @staticmethod
    async def extract_samples(wav_path: str) -> np.ndarray:
        """
        Extract audio samples from WAV file as float32 array.

        Args:
            wav_path: Path to WAV file

        Returns:
            NumPy array of float32 samples normalized to [-1.0, 1.0]
        """
        import wave

        with wave.open(wav_path, 'rb') as wav_file:
            n_channels = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
            n_frames = wav_file.getnframes()
            sample_rate = wav_file.getframerate()

            # Read raw data
            raw_data = wav_file.readframes(n_frames)

        # Convert to numpy array
        if sample_width == 2:  # 16-bit
            samples = np.frombuffer(raw_data, dtype=np.int16)
            samples = samples.astype(np.float32) / 32767.0
        elif sample_width == 4:  # 32-bit
            samples = np.frombuffer(raw_data, dtype=np.int32)
            samples = samples.astype(np.float32) / 2147483647.0
        else:
            raise ValueError(f"Unsupported sample width: {sample_width}")

        # Convert to mono if stereo
        if n_channels > 1:
            samples = samples.reshape(-1, n_channels).mean(axis=1)

        # Normalize
        max_val = np.abs(samples).max()
        if max_val > 0:
            samples = samples / max_val

        return samples

    @staticmethod
    async def process_for_transcription(input_path: str) -> Tuple[str, np.ndarray]:
        """
        Full processing pipeline: convert to WAV and extract samples.

        Args:
            input_path: Path to input audio/video file

        Returns:
            Tuple of (wav_path, samples_array)
        """
        processor = AudioProcessor()

        # Check if video and extract audio
        if processor.is_video_file(input_path):
            from app.services.audio.video_extractor import VideoExtractor
            extractor = VideoExtractor()
            input_path = await extractor.extract_audio(input_path)

        # Convert to target format
        wav_path = await processor.convert_to_wav(
            input_path,
            sample_rate=AudioProcessor.TARGET_SAMPLE_RATE,
            channels=AudioProcessor.TARGET_CHANNELS
        )

        # Extract samples
        samples = await processor.extract_samples(wav_path)

        return wav_path, samples
