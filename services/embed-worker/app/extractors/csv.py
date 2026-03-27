"""CSV text extractor — reads raw file content as plain text."""

import aiofiles
from pathlib import Path

from app.extractors.base import BaseExtractor


class CsvExtractor(BaseExtractor):
    """Extract text from CSV files by reading the raw file contents.

    CSV is already plain text, so this extractor simply returns the
    file contents unchanged. Downstream chunkers handle the splitting.
    """

    supported_mime_types = [
        "text/csv",
        "application/csv",
    ]

    async def extract(self, file_path: Path) -> str:
        """Return the full contents of a CSV file as a string.

        Args:
            file_path: Path to the CSV file on disk.

        Returns:
            Raw file contents as a UTF-8 string.
        """
        async with aiofiles.open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return await f.read()
