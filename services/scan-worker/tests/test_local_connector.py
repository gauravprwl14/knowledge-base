import pytest
from pathlib import Path
from unittest.mock import AsyncMock, patch
import tempfile

from app.connectors.local import LocalFileConnector
from app.models.messages import ScanJobMessage, SourceType
from uuid import uuid4
from datetime import datetime


@pytest.fixture
def scan_job():
    return ScanJobMessage(
        scan_job_id=uuid4(),
        source_id=uuid4(),
        source_type=SourceType.LOCAL,
        user_id=uuid4(),
        config={"path": "/tmp"},
    )


@pytest.mark.asyncio
async def test_local_connector_lists_files(scan_job, tmp_path):
    # Arrange
    (tmp_path / "test.txt").write_text("hello world")
    (tmp_path / "test.pdf").write_bytes(b"%PDF-1.4 content")
    scan_job.config = {"path": str(tmp_path)}

    connector = LocalFileConnector()
    await connector.connect(scan_job.config)

    # Act
    files = [f async for f in connector.list_files(scan_job)]

    # Assert
    assert len(files) == 2
    filenames = {f.original_filename for f in files}
    assert "test.txt" in filenames
    assert "test.pdf" in filenames


@pytest.mark.asyncio
async def test_local_connector_skips_unsupported_extensions(scan_job, tmp_path):
    (tmp_path / "test.exe").write_bytes(b"MZ")
    (tmp_path / "notes.md").write_text("# Notes")
    scan_job.config = {"path": str(tmp_path)}

    connector = LocalFileConnector()
    await connector.connect(scan_job.config)

    files = [f async for f in connector.list_files(scan_job)]
    assert len(files) == 1
    assert files[0].original_filename == "notes.md"
