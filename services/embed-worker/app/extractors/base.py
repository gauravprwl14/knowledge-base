from abc import ABC, abstractmethod
from pathlib import Path

class BaseExtractor(ABC):
    """Extract plain text from a file. One extractor per MIME type family."""

    @abstractmethod
    async def extract(self, file_path: Path) -> str:
        """Return full text content of the file."""
        ...

    @property
    @abstractmethod
    def supported_mime_types(self) -> list[str]:
        ...
