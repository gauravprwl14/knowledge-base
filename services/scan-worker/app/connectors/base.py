from abc import ABC, abstractmethod
from typing import AsyncIterator

from app.models.messages import FileDiscoveredMessage, ScanJobMessage


class BaseConnector(ABC):
    """
    Plug-and-play connector interface for all source types.
    Implement this to add new data sources (Notion, GitHub, etc.).
    """

    @abstractmethod
    async def connect(self, config: dict) -> None:
        """Establish connection to the source. Raise ExternalServiceError on failure."""
        ...

    @abstractmethod
    async def list_files(self, job: ScanJobMessage) -> AsyncIterator[FileDiscoveredMessage]:
        """
        Async generator yielding FileDiscoveredMessage for each discovered file.
        Must respect max_file_size_mb and supported_extensions from settings.
        """
        ...

    @abstractmethod
    async def disconnect(self) -> None:
        """Clean up connection resources."""
        ...

    @property
    @abstractmethod
    def source_type(self) -> str:
        """Return the SourceType string this connector handles."""
        ...
