import os
import aiofiles
from pathlib import Path
from datetime import datetime, timedelta
import asyncio

from app.config import get_settings

settings = get_settings()


class FileStorageService:
    """Service for managing temporary file storage."""

    def __init__(self):
        self.upload_dir = Path(settings.temp_upload_dir)
        self.processed_dir = Path(settings.temp_processed_dir)
        self._ensure_directories()

    def _ensure_directories(self):
        """Create storage directories if they don't exist."""
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.processed_dir.mkdir(parents=True, exist_ok=True)

    async def save_upload(self, file_id: str, filename: str, content: bytes) -> str:
        """
        Save uploaded file to temporary storage.

        Args:
            file_id: Unique identifier for the file
            filename: Original filename
            content: File content as bytes

        Returns:
            Path to the saved file
        """
        # Get extension from original filename
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "wav"
        safe_filename = f"{file_id}.{ext}"
        file_path = self.upload_dir / safe_filename

        async with aiofiles.open(file_path, "wb") as f:
            await f.write(content)

        return str(file_path)

    async def save_processed(self, file_id: str, content: bytes, ext: str = "wav") -> str:
        """
        Save processed audio file.

        Args:
            file_id: Unique identifier for the file
            content: File content as bytes
            ext: File extension

        Returns:
            Path to the saved file
        """
        safe_filename = f"{file_id}_processed.{ext}"
        file_path = self.processed_dir / safe_filename

        async with aiofiles.open(file_path, "wb") as f:
            await f.write(content)

        return str(file_path)

    async def read_file(self, file_path: str) -> bytes:
        """Read file content."""
        async with aiofiles.open(file_path, "rb") as f:
            return await f.read()

    async def delete_file(self, file_path: str) -> bool:
        """Delete a file."""
        try:
            path = Path(file_path)
            if path.exists():
                path.unlink()
                return True
        except Exception:
            pass
        return False

    async def cleanup_old_files(self, max_age_hours: int = None):
        """
        Remove files older than specified age.

        Args:
            max_age_hours: Maximum age in hours (default from settings)
        """
        if max_age_hours is None:
            max_age_hours = settings.temp_file_ttl_hours

        cutoff_time = datetime.now() - timedelta(hours=max_age_hours)

        for directory in [self.upload_dir, self.processed_dir]:
            for file_path in directory.iterdir():
                if file_path.is_file():
                    mtime = datetime.fromtimestamp(file_path.stat().st_mtime)
                    if mtime < cutoff_time:
                        try:
                            file_path.unlink()
                        except Exception:
                            pass

    def get_file_path(self, file_id: str, processed: bool = False) -> Path:
        """Get the path for a file ID."""
        directory = self.processed_dir if processed else self.upload_dir
        # Find file with any extension
        for file_path in directory.iterdir():
            if file_path.stem == file_id or file_path.stem == f"{file_id}_processed":
                return file_path
        return None
