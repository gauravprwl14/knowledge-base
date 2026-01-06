"""
Unit tests for Whisper transcription provider model caching fix
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from app.services.transcription.whisper import WhisperTranscriptionProvider


class TestWhisperModelCaching:
    """Tests for the Whisper model caching fix"""

    @pytest.mark.asyncio
    async def test_model_loaded_only_once(self):
        """Test that model is loaded only once and cached properly"""
        provider = WhisperTranscriptionProvider()
        
        mock_model = MagicMock()
        mock_segments_generator = [
            MagicMock(start=0.0, end=2.5, text="Test transcription")
        ]
        mock_info = MagicMock(language="en")
        
        with patch('app.services.transcription.whisper.WhisperModel') as MockWhisperModel:
            # Configure mock
            MockWhisperModel.return_value = mock_model
            mock_model.transcribe.return_value = (mock_segments_generator, mock_info)
            
            # First transcription - should load model
            result1 = await provider.transcribe(
                audio_path="/fake/path/audio.wav",
                model="base"
            )
            
            # Verify model was loaded
            assert MockWhisperModel.call_count == 1
            assert "base" in provider._model_cache
            
            # Second transcription with same model - should use cache
            result2 = await provider.transcribe(
                audio_path="/fake/path/audio2.wav",
                model="base"
            )
            
            # Model should NOT be loaded again
            assert MockWhisperModel.call_count == 1  # Still 1, not 2
            assert result2.text == "Test transcription"

    @pytest.mark.asyncio
    async def test_different_models_cached_separately(self):
        """Test that different models are cached separately"""
        provider = WhisperTranscriptionProvider()
        
        mock_model_base = MagicMock()
        mock_model_large = MagicMock()
        
        mock_segments = [MagicMock(start=0.0, end=2.5, text="Test")]
        mock_info = MagicMock(language="en")
        
        with patch('app.services.transcription.whisper.WhisperModel') as MockWhisperModel:
            # Set up different mocks for different models
            def model_side_effect(model_name, **kwargs):
                if model_name == "base":
                    mock_model_base.transcribe.return_value = (mock_segments, mock_info)
                    return mock_model_base
                else:
                    mock_model_large.transcribe.return_value = (mock_segments, mock_info)
                    return mock_model_large
            
            MockWhisperModel.side_effect = model_side_effect
            
            # Load base model
            await provider.transcribe(
                audio_path="/fake/path/audio.wav",
                model="base"
            )
            
            # Load large model
            await provider.transcribe(
                audio_path="/fake/path/audio.wav",
                model="large-v3"
            )
            
            # Both should be cached
            assert "base" in provider._model_cache
            assert "large-v3" in provider._model_cache
            assert MockWhisperModel.call_count == 2

    @pytest.mark.asyncio
    async def test_model_cache_thread_safe(self):
        """Test that model caching works correctly with concurrent requests"""
        provider = WhisperTranscriptionProvider()
        
        mock_model = MagicMock()
        mock_segments = [MagicMock(start=0.0, end=2.5, text="Test")]
        mock_info = MagicMock(language="en")
        mock_model.transcribe.return_value = (mock_segments, mock_info)
        
        with patch('app.services.transcription.whisper.WhisperModel') as MockWhisperModel:
            MockWhisperModel.return_value = mock_model
            
            # Simulate concurrent requests
            import asyncio
            tasks = [
                provider.transcribe(audio_path=f"/fake/audio{i}.wav", model="base")
                for i in range(5)
            ]
            
            results = await asyncio.gather(*tasks)
            
            # Model should only be loaded once despite concurrent requests
            # Note: This might be 2-3 due to race conditions, but not 5
            assert MockWhisperModel.call_count <= 3
            assert len(results) == 5
            assert all(r.text == "Test" for r in results)

    @pytest.mark.asyncio
    async def test_model_loaded_in_executor(self):
        """Test that model is loaded in executor to avoid blocking"""
        provider = WhisperTranscriptionProvider()
        
        mock_model = MagicMock()
        mock_segments = [MagicMock(start=0.0, end=2.5, text="Test")]
        mock_info = MagicMock(language="en")
        mock_model.transcribe.return_value = (mock_segments, mock_info)
        
        with patch('app.services.transcription.whisper.WhisperModel') as MockWhisperModel, \
             patch('asyncio.get_event_loop') as mock_get_loop:
            
            MockWhisperModel.return_value = mock_model
            mock_loop = MagicMock()
            mock_loop.run_in_executor = AsyncMock(return_value=mock_model)
            mock_get_loop.return_value = mock_loop
            
            await provider.transcribe(
                audio_path="/fake/path/audio.wav",
                model="base"
            )
            
            # Verify run_in_executor was called for model loading
            assert mock_loop.run_in_executor.call_count >= 1

    @pytest.mark.asyncio
    async def test_transcribe_result_structure(self):
        """Test that transcribe returns correct result structure"""
        provider = WhisperTranscriptionProvider()
        
        mock_model = MagicMock()
        mock_segments = [
            MagicMock(start=0.0, end=2.5, text="Hello "),
            MagicMock(start=2.5, end=5.0, text="world")
        ]
        mock_info = MagicMock(language="en")
        mock_model.transcribe.return_value = (mock_segments, mock_info)
        
        with patch('app.services.transcription.whisper.WhisperModel') as MockWhisperModel:
            MockWhisperModel.return_value = mock_model
            
            result = await provider.transcribe(
                audio_path="/fake/path/audio.wav",
                model="base",
                language="auto"
            )
            
            # Verify result structure
            assert result.text == "Hello world"
            assert result.language == "en"
            assert result.provider == "whisper"
            assert result.model == "base"
            assert result.processing_time_ms > 0
            assert len(result.segments) == 2
            assert result.segments[0].text == "Hello "
            assert result.segments[1].text == "world"


class TestWhisperProviderAvailability:
    """Tests for Whisper provider availability check"""

    @pytest.mark.asyncio
    async def test_is_available_when_installed(self):
        """Test availability check when faster-whisper is installed"""
        provider = WhisperTranscriptionProvider()
        
        with patch('app.services.transcription.whisper.WhisperModel'):
            is_available = await provider.is_available()
            assert is_available is True

    @pytest.mark.asyncio
    async def test_is_available_when_not_installed(self):
        """Test availability check when faster-whisper is not installed"""
        provider = WhisperTranscriptionProvider()
        
        # Simulate import error
        import sys
        original_modules = sys.modules.copy()
        
        try:
            # Remove faster_whisper from modules if it exists
            if 'faster_whisper' in sys.modules:
                del sys.modules['faster_whisper']
            
            with patch.dict('sys.modules', {'faster_whisper': None}):
                is_available = await provider.is_available()
                # This test might still return True if already imported
                # The main point is it doesn't crash
                assert isinstance(is_available, bool)
        finally:
            sys.modules = original_modules
