from pathlib import Path
import aiofiles
from app.extractors.base import BaseExtractor

class PlainTextExtractor(BaseExtractor):
    supported_mime_types = ["text/plain"]

    async def extract(self, file_path: Path) -> str:
        async with aiofiles.open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return await f.read()
