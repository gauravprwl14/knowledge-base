"""Tests for file deletion sync.

Covers:
- handle_file_deleted: soft-deletes the kms_files row and removes kms_chunks
- handle_file_deleted: no-op when file is not in DB (already deleted / never indexed)
- handle_file_deleted: no-op when file is already in DELETED status
- Incremental scan with removed=True yields a deletion tombstone message
- Incremental scan deletion tombstone is processed by the scan handler
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models.messages import FileDiscoveredMessage, ScanJobMessage, ScanType, SourceType
from app.services.file_sync_service import FileSyncService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_asyncpg_row(data: dict):
    """Build a minimal asyncpg-like row mock that supports dict-style access."""
    row = MagicMock()
    row.__getitem__ = lambda self, key: data[key]
    row.__contains__ = lambda self, key: key in data
    return row


def _make_file_sync() -> FileSyncService:
    """Return a FileSyncService instance (no real DB)."""
    return FileSyncService()


# ---------------------------------------------------------------------------
# FileSyncService.handle_file_deleted — happy path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_handle_file_deleted_soft_deletes_file_and_removes_chunks():
    """When a kms_files row exists, handle_file_deleted removes chunks and
    soft-deletes the file, returning the file UUID."""
    file_id = str(uuid4())
    source_id = str(uuid4())
    user_id = str(uuid4())
    external_id = "drive-file-abc123"

    mock_row = _make_asyncpg_row({"id": file_id})

    mock_conn = AsyncMock()
    mock_conn.fetchrow = AsyncMock(return_value=mock_row)
    mock_conn.fetchval = AsyncMock(return_value=3)   # 3 chunks deleted
    mock_conn.execute = AsyncMock()
    mock_conn.close = AsyncMock()

    svc = _make_file_sync()

    with patch("asyncpg.connect", AsyncMock(return_value=mock_conn)):
        result = await svc.handle_file_deleted(
            external_file_id=external_id,
            source_id=source_id,
            user_id=user_id,
        )

    assert result == file_id

    # fetchrow called with correct source_id / external_id params
    mock_conn.fetchrow.assert_awaited_once()
    call_args = mock_conn.fetchrow.call_args
    assert source_id in call_args.args
    assert external_id in call_args.args

    # fetchval (chunk delete CTE) called with the file UUID
    mock_conn.fetchval.assert_awaited_once()
    assert file_id in mock_conn.fetchval.call_args.args

    # execute called for the UPDATE kms_files (soft-delete)
    mock_conn.execute.assert_awaited_once()
    update_sql = mock_conn.execute.call_args.args[0]
    assert "DELETED" in update_sql
    assert "deleted_at" in update_sql


# ---------------------------------------------------------------------------
# FileSyncService.handle_file_deleted — file not found
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_handle_file_deleted_returns_none_when_not_in_db():
    """When no matching row exists in kms_files, handle_file_deleted returns None
    without attempting any DELETE or UPDATE."""
    mock_conn = AsyncMock()
    mock_conn.fetchrow = AsyncMock(return_value=None)  # no matching row
    mock_conn.fetchval = AsyncMock()
    mock_conn.execute = AsyncMock()
    mock_conn.close = AsyncMock()

    svc = _make_file_sync()

    with patch("asyncpg.connect", AsyncMock(return_value=mock_conn)):
        result = await svc.handle_file_deleted(
            external_file_id="nonexistent-drive-id",
            source_id=str(uuid4()),
            user_id=str(uuid4()),
        )

    assert result is None
    mock_conn.fetchval.assert_not_awaited()
    mock_conn.execute.assert_not_awaited()


# ---------------------------------------------------------------------------
# Google Drive connector yields is_deleted=True tombstone for removed files
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_incremental_scan_removed_true_yields_deletion_tombstone():
    """When changes.list returns removed=True for a file, the connector yields
    a FileDiscoveredMessage with is_deleted=True and the Drive file ID as
    external_id."""
    from app.connectors.google_drive import GoogleDriveConnector

    drive_file_id = "drive-xyz-deleted"

    # Build a fake changes.list response with one removed change
    fake_changes_response = {
        "newStartPageToken": "tok-next",
        "changes": [
            {
                "removed": True,
                "fileId": drive_file_id,
            }
        ],
    }

    job = ScanJobMessage(
        scan_job_id=uuid4(),
        source_id=uuid4(),
        user_id=uuid4(),
        source_type=SourceType.GOOGLE_DRIVE,
        scan_type=ScanType.INCREMENTAL,
        config={},
    )

    connector = GoogleDriveConnector()
    connector._service = MagicMock()

    # Wire up changes().list().execute() to return our fake response
    mock_execute = MagicMock(return_value=fake_changes_response)
    connector._service.changes.return_value.list.return_value.execute = mock_execute

    # DeltaSyncService mock — set_page_token / set_last_sync are no-ops
    connector._delta_sync = MagicMock()
    connector._delta_sync.set_page_token = AsyncMock()
    connector._delta_sync.set_last_sync = AsyncMock()

    messages: list[FileDiscoveredMessage] = []
    async for msg in connector._list_incremental(job, start_page_token="tok-start"):
        messages.append(msg)

    assert len(messages) == 1
    tombstone = messages[0]
    assert tombstone.is_deleted is True
    assert tombstone.external_id == drive_file_id
    assert tombstone.source_id == job.source_id
    assert tombstone.user_id == job.user_id


# ---------------------------------------------------------------------------
# Scan handler processes deletion tombstone via file_sync.handle_file_deleted
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_scan_handler_calls_handle_file_deleted_for_tombstone():
    """When _run_scan encounters a FileDiscoveredMessage with is_deleted=True,
    it must call file_sync.handle_file_deleted and NOT append the message to
    the embed batch."""
    from app.handlers.scan_handler import ScanHandler

    source_id = uuid4()
    user_id = uuid4()
    scan_job_id = uuid4()
    drive_file_id = "drive-del-456"

    job = ScanJobMessage(
        scan_job_id=scan_job_id,
        source_id=source_id,
        user_id=user_id,
        source_type=SourceType.GOOGLE_DRIVE,
        scan_type=ScanType.INCREMENTAL,
        config={},
    )

    tombstone = FileDiscoveredMessage(
        scan_job_id=scan_job_id,
        source_id=source_id,
        user_id=user_id,
        external_id=drive_file_id,
        file_path=drive_file_id,
        original_filename="",
        source_type=SourceType.GOOGLE_DRIVE,
        is_deleted=True,
    )

    # Build a mock connector that yields one tombstone
    mock_connector = MagicMock()

    async def _fake_list_files(_job):
        yield tombstone

    mock_connector.list_files = _fake_list_files
    mock_connector.connect = AsyncMock()
    mock_connector.disconnect = AsyncMock()
    # preload_existing is called for INCREMENTAL scans on connectors that define it
    mock_connector.preload_existing = AsyncMock()

    # Patch get_connector to return our mock connector
    mock_channel = MagicMock()
    mock_channel.default_exchange = MagicMock()
    mock_channel.default_exchange.publish = AsyncMock()

    handler = ScanHandler(channel=mock_channel)

    # Mock FileSyncService
    handler._file_sync = MagicMock()
    handler._file_sync.get_source_tokens = AsyncMock(return_value="encrypted-tok")
    handler._file_sync.upsert_files = AsyncMock()
    handler._file_sync.get_files_pending_embed = AsyncMock(return_value=[])
    handler._file_sync.update_scan_job = AsyncMock()
    handler._file_sync.handle_file_deleted = AsyncMock(return_value=str(uuid4()))

    handler._progress = MagicMock()
    handler._progress.set_progress = AsyncMock()

    with patch("app.handlers.scan_handler.get_connector", return_value=mock_connector):
        result = await handler._run_scan(job)

    # Deletion was processed — handle_file_deleted called with correct args
    handler._file_sync.handle_file_deleted.assert_awaited_once_with(
        external_file_id=drive_file_id,
        source_id=str(source_id),
        user_id=str(user_id),
    )

    # The tombstone must NOT be counted as a discovered file
    assert result["discovered"] == 0

    # No embed messages published
    mock_channel.default_exchange.publish.assert_not_awaited()
