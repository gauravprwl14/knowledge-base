import os
import gc
import sys
from pathlib import Path
from typing import Optional
import asyncio
import logging

from app.services.transcription.base import (
    TranscriptionProvider,
    TranscriptionResult,
    TranscriptionSegment,
    TimeMeasure
)
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class WhisperTranscriptionProvider(TranscriptionProvider):
    """Local Whisper transcription using faster-whisper (4x faster, ARM64 compatible)."""

    name = "whisper"

    def __init__(self):
        self.models_dir = Path(settings.models_dir)
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self._model_cache = {}

    async def is_available(self) -> bool:
        """Check if faster-whisper is installed."""
        try:
            from faster_whisper import WhisperModel
            return True
        except ImportError:
            return False

    async def transcribe(
        self,
        audio_path: str,
        model: Optional[str] = None,
        language: Optional[str] = None,
        executor=None,  # Accept optional executor
        **kwargs
    ) -> TranscriptionResult:
        """
        Transcribe audio using local Whisper model via faster-whisper.

        Args:
            audio_path: Path to audio file (supports many formats via ffmpeg)
            model: Model name (tiny, base, small, medium, large-v2, large-v3, etc.)
            language: Language code or 'auto' for auto-detection
        """
        from faster_whisper import WhisperModel

        model_name = model or "base"

        # Load or get cached model
        if model_name not in self._model_cache:
            logger.info(f"Loading Whisper model: {model_name}")
            sys.stdout.flush()
            
            try:
                # faster-whisper automatically downloads models to cache
                # Using int8 quantization for better performance on CPU/ARM64
                whisper_model = await asyncio.wait_for(
                    asyncio.get_event_loop().run_in_executor(
                        executor,  # Use provided executor or default
                        lambda: WhisperModel(
                            model_name,
                            device="cpu",
                            compute_type="int8",
                            download_root=str(self.models_dir)
                        )
                    ),
                    timeout=300  # 5 minute timeout for model loading
                )
                self._model_cache[model_name] = whisper_model
                logger.info(f"Whisper model {model_name} loaded successfully")
                sys.stdout.flush()
            except asyncio.TimeoutError:
                logger.error(f"Timeout loading model {model_name}")
                raise ValueError(
                    f"Model {model_name} took too long to load (>5 min). "
                    "This model may be too large for your system. Try using 'base', 'small', or 'medium' instead."
                )
            except Exception as e:
                logger.error(f"Failed to load model {model_name}: {str(e)}", exc_info=True)
                raise ValueError(
                    f"Failed to load model {model_name}. "
                    "If using large-v3, try a smaller model like 'base', 'small', or 'medium'."
                )
        else:
            logger.debug(f"Using cached Whisper model: {model_name}")
            whisper_model = self._model_cache[model_name]

        # Set language
        lang = None if language == "auto" or not language else language

        with TimeMeasure() as timer:
            # Transcribe - run in executor to avoid blocking
            # Process both transcription AND segment iteration in executor
            def transcribe_and_collect():
                logger.info(f"Starting Whisper transcription with model: {model_name}")
                sys.stdout.flush()  # Force flush logs
                
                # Adjust beam_size based on model - large models need smaller beam
                beam_size = 1 if 'large' in model_name else 3
                
                segments_gen, info = whisper_model.transcribe(
                    audio_path,
                    language=lang,
                    beam_size=beam_size,  # Reduced for memory efficiency
                    vad_filter=True,
                    word_timestamps=False  # Disable to reduce memory usage
                )
                
                logger.info(f"Transcription started. Detected language: {info.language if hasattr(info, 'language') else 'unknown'}")
                sys.stdout.flush()
                
                # Collect all segments synchronously in the executor
                text_parts = []
                result_segments = []
                segment_count = 0
                
                try:
                    for segment in segments_gen:
                        text_parts.append(segment.text)
                        result_segments.append({
                            'start': segment.start,
                            'end': segment.end,
                            'text': segment.text
                        })
                        segment_count += 1
                        
                        # Log progress and force GC every 5 segments for large models
                        if segment_count % 5 == 0:
                            logger.info(f"Processed {segment_count} segments...")
                            sys.stdout.flush()
                            if 'large' in model_name:
                                gc.collect()  # Aggressive garbage collection for large models
                
                except Exception as e:
                    logger.error(f"Error during segment iteration: {str(e)}", exc_info=True)
                    sys.stdout.flush()
                    raise
                
                logger.info(f"Transcription completed. Total segments: {segment_count}")
                sys.stdout.flush()
                
                # Final garbage collection
                gc.collect()
                
                return text_parts, result_segments, info
            
            text_parts, segments_data, info = await asyncio.get_event_loop().run_in_executor(
                executor,  # Use provided executor or default
                transcribe_and_collect
            )

        # Convert to TranscriptionSegment objects
        result_segments = [
            TranscriptionSegment(
                start=seg['start'],
                end=seg['end'],
                text=seg['text']
            )
            for seg in segments_data
        ]

        full_text = " ".join(text_parts).strip()

        return TranscriptionResult(
            text=full_text,
            language=info.language if hasattr(info, 'language') else language,
            processing_time_ms=timer.elapsed_ms,
            segments=result_segments,
            provider=self.name,
            model=model_name
        )
    def clear_model_cache(self, model_name: Optional[str] = None):
        """Clear model cache to free memory.
        
        Args:
            model_name: Specific model to clear, or None to clear all models
        """
        if model_name:
            if model_name in self._model_cache:
                logger.info(f"Clearing model cache for: {model_name}")
                del self._model_cache[model_name]
        else:
            logger.info("Clearing all model cache")
            self._model_cache.clear()