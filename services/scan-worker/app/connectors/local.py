import hashlib
import mimetypes
import logging
from pathlib import Path
from typing import AsyncIterator
import aiofiles

from app.connectors.base import BaseConnector
from app.models.messages import FileDiscoveredMessage, ScanJobMessage, SourceType
from app.config import get_settings
from app.utils.errors import ScanJobFailedError

logger = logging.getLogger(__name__)
settings = get_settings()


class LocalFileConnector(BaseConnector):
    """Scans local or mounted filesystem paths."""

    source_type = SourceType.LOCAL

    async def connect(self, config: dict) -> None:
        self._root_path = Path(config.get("path", "/"))
        if not self._root_path.exists():
            raise ScanJobFailedError(f"Local path does not exist: {self._root_path}")
        logger.info("LocalFileConnector connected to %s", self._root_path)

    async def list_files(self, job: ScanJobMessage) -> AsyncIterator[FileDiscoveredMessage]:
        max_bytes = settings.max_file_size_mb * 1024 * 1024
        extensions = set(settings.supported_extensions)

        for file_path in self._root_path.rglob("*"):
            if not file_path.is_file():
                continue
            if file_path.suffix.lower() not in extensions:
                continue

            try:
                stat = file_path.stat()
                if stat.st_size > max_bytes:
                    logger.debug("Skipping oversized file: %s (%d bytes)", file_path, stat.st_size)
                    continue

                checksum = await self._compute_checksum(file_path)
                mime_type, _ = mimetypes.guess_type(str(file_path))

                yield FileDiscoveredMessage(
                    scan_job_id=job.scan_job_id,
                    source_id=job.source_id,
                    user_id=job.user_id,
                    file_path=str(file_path),
                    original_filename=file_path.name,
                    mime_type=mime_type,
                    file_size_bytes=stat.st_size,
                    checksum_sha256=checksum,
                    source_type=SourceType.LOCAL,
                    source_metadata={"absolute_path": str(file_path.resolve())},
                )
            except (OSError, PermissionError) as e:
                logger.warning("Skipping file %s: %s", file_path, e)
                continue

    async def disconnect(self) -> None:
        pass

    @staticmethod
    async def _compute_checksum(path: Path) -> str:
        sha256 = hashlib.sha256()
        async with aiofiles.open(path, "rb") as f:
            while chunk := await f.read(65536):
                sha256.update(chunk)
        return sha256.hexdigest()
