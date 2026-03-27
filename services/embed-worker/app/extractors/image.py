"""Image OCR extractor using Pillow and pytesseract."""

import asyncio
from pathlib import Path

import structlog

from app.extractors.base import BaseExtractor

logger = structlog.get_logger(__name__)


class ImageExtractor(BaseExtractor):
    """Extract text from image files using OCR (Optical Character Recognition).

    Uses Pillow for image loading and pytesseract as the OCR engine.
    If Tesseract is not installed on the system, logs a warning and
    returns an empty string rather than raising an exception.
    """

    supported_mime_types = [
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "image/tiff",
    ]

    async def extract(self, file_path: Path) -> str:
        """Extract text from an image file via OCR.

        Args:
            file_path: Path to the image file on disk.

        Returns:
            OCR-extracted text, or an empty string if Tesseract is unavailable
            or the image contains no recognisable text.
        """
        return await asyncio.to_thread(self._extract_sync, file_path)

    def _extract_sync(self, file_path: Path) -> str:
        """Synchronous OCR extraction, intended for thread pool execution.

        Args:
            file_path: Path to the image file.

        Returns:
            Extracted text string, or empty string on OCR engine failure.
        """
        try:
            import pytesseract
            from PIL import Image

            image = Image.open(str(file_path))
            return pytesseract.image_to_string(image)
        except Exception as exc:
            # Check if it's a TesseractNotFoundError (by name to avoid import issues)
            if type(exc).__name__ == "TesseractNotFoundError" or "tesseract" in str(exc).lower():
                logger.warning(
                    "Tesseract not found — skipping OCR extraction",
                    file_path=str(file_path),
                    error=str(exc),
                )
                return ""
            # Re-raise unexpected errors so EmbedHandler can wrap them correctly
            raise
