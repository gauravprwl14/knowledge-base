from pathlib import Path
import asyncio
from app.extractors.base import BaseExtractor

class PdfExtractor(BaseExtractor):
    supported_mime_types = ["application/pdf"]

    async def extract(self, file_path: Path) -> str:
        # Run in thread pool to not block event loop
        return await asyncio.to_thread(self._extract_sync, file_path)

    def _extract_sync(self, file_path: Path) -> str:
        try:
            import pdfminer.high_level
            return pdfminer.high_level.extract_text(str(file_path))
        except Exception as e:
            raise RuntimeError(f"PDF extraction failed for {file_path}: {e}") from e
