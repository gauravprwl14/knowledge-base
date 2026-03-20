"""Unit tests for GoogleDriveConnector delta sync features.

Covers:
- FULL scan stores startPageToken in Redis after exhausting all pages
- INCREMENTAL scan uses stored page token and calls changes.list
- INCREMENTAL falls back to FULL when no page token is stored in Redis
- Incremental scan updates startPageToken from newStartPageToken
- Deleted files in changes list are skipped (not yielded)
- HTTP 429 raises DriveRateLimitError (retryable)
- HTTP 401 triggers token refresh; persistent failure raises TokenRefreshError
- Network errors retry up to MAX_NETWORK_RETRIES then raise FileDiscoveryError
- _item_to_message skips Google Workspace mime types
- connect() raises TokenRefreshError when token refresh fails
"""
from __future__ import annotations

import asyncio
import json
import os
from typing import AsyncIterator
from unittest.mock import AsyncMock, MagicMock, patch, call
from uuid import uuid4

import pytest
from googleapiclient.errors import HttpError

from app.connectors.google_drive import GoogleDriveConnector
from app.models.messages import ScanJobMessage, ScanType, SourceType
from app.utils.errors import (
    ConnectorError,
    DriveRateLimitError,
    FileDiscoveryError,
    TokenRefreshError,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_job(scan_type: ScanType = ScanType.FULL, **kwargs) -> ScanJobMessage:
    defaults = dict(
        scan_job_id=uuid4(),
        source_id=uuid4(),
        source_type=SourceType.GOOGLE_DRIVE,
        user_id=uuid4(),
        scan_type=scan_type,
        config={},
    )
    defaults.update(kwargs)
    return ScanJobMessage(**defaults)


def _make_drive_item(
    file_id: str = "file1",
    name: str = "doc.pdf",
    mime_type: str = "application/pdf",
    size: str = "4096",
    modified_time: str = "2025-03-10T08:00:00Z",
) -> dict:
    return {
        "id": file_id,
        "name": name,
        "mimeType": mime_type,
        "size": size,
        "webViewLink": f"https://drive.google.com/file/d/{file_id}/view",
        "modifiedTime": modified_time,
        "parents": ["root"],
    }


def _make_http_error(status: int) -> HttpError:
    resp = MagicMock()
    resp.status = status
    return HttpError(resp=resp, content=b"error")


def _connected_connector(
    files_pages: list[list[dict]] | None = None,
    changes_pages: list[dict] | None = None,
) -> GoogleDriveConnector:
    """Return a GoogleDriveConnector with a pre-mocked Drive service.

    Args:
        files_pages: List of pages for files().list().execute() side_effect.
        changes_pages: List of pages for changes().list().execute() side_effect.
    """
    connector = GoogleDriveConnector()
    mock_service = MagicMock()

    if files_pages is not None:
        responses = []
        for i, page in enumerate(files_pages):
            resp: dict = {"files": page}
            if i < len(files_pages) - 1:
                resp["nextPageToken"] = f"file_token_{i}"
            responses.append(resp)
        mock_service.files.return_value.list.return_value.execute.side_effect = responses

    if changes_pages is not None:
        mock_service.changes.return_value.list.return_value.execute.side_effect = changes_pages

    # Stub getStartPageToken
    mock_service.changes.return_value.getStartPageToken.return_value.execute.return_value = {
        "startPageToken": "start_token_001"
    }

    connector._service = mock_service
    connector._source_id = "test-source"
    return connector


# ---------------------------------------------------------------------------
# FULL scan — delta state stored after completion
# ---------------------------------------------------------------------------


class TestFullScanDeltaState:
    @pytest.mark.asyncio
    async def test_full_scan_stores_page_token_and_last_sync(self):
        """After a FULL scan, page token and last_sync are written to Redis."""
        connector = _connected_connector(files_pages=[[_make_drive_item()]])
        job = _make_job(ScanType.FULL)

        with (
            patch.object(
                connector._delta_sync,
                "get_page_token",
                new=AsyncMock(return_value=None),
            ),
            patch.object(
                connector._delta_sync,
                "set_page_token",
                new=AsyncMock(),
            ) as mock_set_token,
            patch.object(
                connector._delta_sync,
                "set_last_sync",
                new=AsyncMock(),
            ) as mock_set_sync,
        ):
            results = [f async for f in connector.list_files(job)]

        assert len(results) == 1
        mock_set_token.assert_awaited_once_with(str(job.source_id), "start_token_001")
        mock_set_sync.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_full_scan_continues_when_start_token_unavailable(self):
        """If fetching startPageToken fails, full scan still completes and yields files."""
        connector = _connected_connector(files_pages=[[_make_drive_item()]])
        job = _make_job(ScanType.FULL)

        # Patch _get_start_page_token directly so the files.list mock is unaffected
        with (
            patch.object(
                connector._delta_sync, "get_page_token", new=AsyncMock(return_value=None)
            ),
            patch.object(
                connector,
                "_get_start_page_token",
                new=AsyncMock(return_value=None),  # simulates API failure → None
            ),
            patch.object(
                connector._delta_sync, "set_page_token", new=AsyncMock()
            ) as mock_set_token,
            patch.object(
                connector._delta_sync, "set_last_sync", new=AsyncMock()
            ),
        ):
            results = [f async for f in connector.list_files(job)]

        # Files still yielded; set_page_token not called (no token to store)
        assert len(results) == 1
        mock_set_token.assert_not_awaited()


# ---------------------------------------------------------------------------
# INCREMENTAL scan — Changes API
# ---------------------------------------------------------------------------


class TestIncrementalScan:
    @pytest.mark.asyncio
    async def test_incremental_uses_changes_api_when_token_present(self):
        """INCREMENTAL scan with stored page token calls changes.list."""
        changes_page = {
            "changes": [
                {"removed": False, "fileId": "file1", "file": _make_drive_item("file1")},
            ],
            "newStartPageToken": "new_token_999",
        }
        connector = _connected_connector(changes_pages=[changes_page])
        job = _make_job(ScanType.INCREMENTAL)

        with (
            patch.object(
                connector._delta_sync,
                "get_page_token",
                new=AsyncMock(return_value="stored_token_abc"),
            ),
            patch.object(
                connector._delta_sync,
                "set_page_token",
                new=AsyncMock(),
            ) as mock_set_token,
            patch.object(
                connector._delta_sync,
                "set_last_sync",
                new=AsyncMock(),
            ),
        ):
            results = [f async for f in connector.list_files(job)]

        assert len(results) == 1
        assert results[0].original_filename == "doc.pdf"
        mock_set_token.assert_awaited_once_with(str(job.source_id), "new_token_999")

    @pytest.mark.asyncio
    async def test_incremental_falls_back_to_full_when_no_token(self):
        """INCREMENTAL scan without stored token falls back to files.list (FULL)."""
        connector = _connected_connector(
            files_pages=[[_make_drive_item("file_full")]],
        )
        job = _make_job(ScanType.INCREMENTAL)

        with (
            patch.object(
                connector._delta_sync,
                "get_page_token",
                new=AsyncMock(return_value=None),  # no token stored
            ),
            patch.object(
                connector._delta_sync, "set_page_token", new=AsyncMock()
            ),
            patch.object(
                connector._delta_sync, "set_last_sync", new=AsyncMock()
            ),
        ):
            results = [f async for f in connector.list_files(job)]

        assert len(results) == 1
        assert results[0].file_path == "file_full"

    @pytest.mark.asyncio
    async def test_incremental_skips_deleted_files(self):
        """Changes with removed=True should not yield a FileDiscoveredMessage."""
        changes_page = {
            "changes": [
                {"removed": True, "fileId": "deleted_file"},
                {"removed": False, "fileId": "active_file", "file": _make_drive_item("active_file")},
            ],
            "newStartPageToken": "tok2",
        }
        connector = _connected_connector(changes_pages=[changes_page])
        job = _make_job(ScanType.INCREMENTAL)

        with (
            patch.object(
                connector._delta_sync,
                "get_page_token",
                new=AsyncMock(return_value="tok1"),
            ),
            patch.object(connector._delta_sync, "set_page_token", new=AsyncMock()),
            patch.object(connector._delta_sync, "set_last_sync", new=AsyncMock()),
        ):
            results = [f async for f in connector.list_files(job)]

        assert len(results) == 1
        assert results[0].file_path == "active_file"

    @pytest.mark.asyncio
    async def test_incremental_skips_gapps_files_in_changes(self):
        """Google Workspace files in the changes list must be filtered out."""
        gapps_item = _make_drive_item(
            "gdoc1",
            mime_type="application/vnd.google-apps.document",
        )
        pdf_item = _make_drive_item("pdf1")
        changes_page = {
            "changes": [
                {"removed": False, "fileId": "gdoc1", "file": gapps_item},
                {"removed": False, "fileId": "pdf1", "file": pdf_item},
            ],
            "newStartPageToken": "tok_next",
        }
        connector = _connected_connector(changes_pages=[changes_page])
        job = _make_job(ScanType.INCREMENTAL)

        with (
            patch.object(connector._delta_sync, "get_page_token", new=AsyncMock(return_value="tok")),
            patch.object(connector._delta_sync, "set_page_token", new=AsyncMock()),
            patch.object(connector._delta_sync, "set_last_sync", new=AsyncMock()),
        ):
            results = [f async for f in connector.list_files(job)]

        assert len(results) == 1
        assert results[0].file_path == "pdf1"

    @pytest.mark.asyncio
    async def test_incremental_paginates_multiple_change_pages(self):
        """changes.list pagination: yield files from all pages."""
        page1 = {
            "changes": [
                {"removed": False, "fileId": f"f{i}", "file": _make_drive_item(f"f{i}", name=f"file{i}.txt")}
                for i in range(3)
            ],
            "nextPageToken": "chg_tok_1",
        }
        page2 = {
            "changes": [
                {"removed": False, "fileId": f"f{i}", "file": _make_drive_item(f"f{i}", name=f"file{i}.txt")}
                for i in range(3, 5)
            ],
            "newStartPageToken": "final_token",
        }
        connector = _connected_connector(changes_pages=[page1, page2])
        job = _make_job(ScanType.INCREMENTAL)

        with (
            patch.object(connector._delta_sync, "get_page_token", new=AsyncMock(return_value="t0")),
            patch.object(connector._delta_sync, "set_page_token", new=AsyncMock()) as mock_set,
            patch.object(connector._delta_sync, "set_last_sync", new=AsyncMock()),
        ):
            results = [f async for f in connector.list_files(job)]

        assert len(results) == 5
        # Final token from last page must be persisted
        mock_set.assert_awaited_once_with(str(job.source_id), "final_token")


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


class TestDriveErrorHandling:
    @pytest.mark.asyncio
    async def test_rate_limit_raises_drive_rate_limit_error(self):
        """HTTP 429 must raise DriveRateLimitError (retryable)."""
        connector = _connected_connector()
        connector._service.files.return_value.list.return_value.execute.side_effect = (
            _make_http_error(429)
        )
        job = _make_job(ScanType.FULL)

        with (
            patch.object(connector._delta_sync, "get_page_token", new=AsyncMock(return_value=None)),
            patch.object(connector._delta_sync, "set_page_token", new=AsyncMock()),
            patch.object(connector._delta_sync, "set_last_sync", new=AsyncMock()),
        ):
            with pytest.raises(DriveRateLimitError) as exc_info:
                async for _ in connector.list_files(job):
                    pass

        assert exc_info.value.retryable is True

    @pytest.mark.asyncio
    async def test_auth_error_triggers_token_refresh_then_raises(self):
        """HTTP 401 on first attempt triggers refresh; if still failing raises TokenRefreshError."""
        connector = _connected_connector()
        # Simulate persistent 401
        connector._service.files.return_value.list.return_value.execute.side_effect = (
            _make_http_error(401)
        )
        job = _make_job(ScanType.FULL)

        # Token refresh itself should fail (simulated by raising)
        with (
            patch.object(connector._delta_sync, "get_page_token", new=AsyncMock(return_value=None)),
            patch.object(connector._delta_sync, "set_page_token", new=AsyncMock()),
            patch.object(connector._delta_sync, "set_last_sync", new=AsyncMock()),
            patch.object(
                connector,
                "_ensure_valid_credentials",
                new=AsyncMock(side_effect=TokenRefreshError("src", "token revoked")),
            ),
        ):
            with pytest.raises(TokenRefreshError) as exc_info:
                async for _ in connector.list_files(job):
                    pass

        assert exc_info.value.retryable is False

    @pytest.mark.asyncio
    async def test_network_error_retries_then_raises_file_discovery_error(self):
        """Non-HTTP exceptions retry up to _MAX_NETWORK_RETRIES then raise FileDiscoveryError."""
        connector = _connected_connector()
        connector._service.files.return_value.list.return_value.execute.side_effect = (
            ConnectionResetError("connection dropped")
        )
        job = _make_job(ScanType.FULL)

        with (
            patch.object(connector._delta_sync, "get_page_token", new=AsyncMock(return_value=None)),
            patch.object(connector._delta_sync, "set_page_token", new=AsyncMock()),
            patch.object(connector._delta_sync, "set_last_sync", new=AsyncMock()),
            # Speed up test by mocking asyncio.sleep
            patch("app.connectors.google_drive.asyncio.sleep", new=AsyncMock()),
        ):
            with pytest.raises(FileDiscoveryError) as exc_info:
                async for _ in connector.list_files(job):
                    pass

        assert exc_info.value.retryable is True


# ---------------------------------------------------------------------------
# _item_to_message
# ---------------------------------------------------------------------------


class TestItemToMessage:
    def _make_connector(self) -> GoogleDriveConnector:
        c = GoogleDriveConnector()
        c._source_id = "src"
        return c

    def test_returns_none_for_gapps_mime(self):
        connector = self._make_connector()
        job = _make_job()
        item = _make_drive_item(mime_type="application/vnd.google-apps.spreadsheet")

        result = connector._item_to_message(item, job)

        assert result is None

    def test_returns_message_for_regular_file(self):
        connector = self._make_connector()
        job = _make_job()
        item = _make_drive_item(file_id="abc", name="report.pdf")

        result = connector._item_to_message(item, job)

        assert result is not None
        assert result.file_path == "abc"
        assert result.external_id == "abc"
        assert result.original_filename == "report.pdf"
        assert result.source_type == SourceType.GOOGLE_DRIVE

    def test_external_modified_at_is_populated(self):
        connector = self._make_connector()
        job = _make_job()
        item = _make_drive_item(modified_time="2025-01-20T09:30:00Z")

        result = connector._item_to_message(item, job)

        assert result is not None
        assert result.external_modified_at is not None
        # Both last_modified and external_modified_at should be the same value
        assert result.last_modified == result.external_modified_at


# ---------------------------------------------------------------------------
# connect() — token refresh on expired credentials
# ---------------------------------------------------------------------------


class TestConnect:
    def _make_encrypted(self) -> str:
        """Produce a valid ciphertext using the dev secret."""
        import base64 as b64
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
        from cryptography.hazmat.backends import default_backend
        import os as _os

        secret = b"dev-secret-32-bytes-exactly!!!!!!"
        kdf = Scrypt(salt=b"kms-salt", length=32, n=2**14, r=8, p=1, backend=default_backend())
        key = kdf.derive(secret)
        iv = _os.urandom(12)
        aesgcm = AESGCM(key)
        tokens = json.dumps({
            "access_token": "ya29.test",
            "refresh_token": "1//test",
        }).encode()
        ct_tag = aesgcm.encrypt(iv, tokens, None)
        tag = ct_tag[-16:]
        ct = ct_tag[:-16]
        return b64.b64encode(iv + tag + ct).decode()

    @pytest.mark.asyncio
    async def test_connect_raises_token_refresh_error_when_refresh_fails(self):
        """connect() raises TokenRefreshError (non-retryable) when refresh cannot succeed."""
        connector = GoogleDriveConnector()

        with (
            patch.object(
                GoogleDriveConnector,
                "_decrypt_tokens",
                return_value={
                    "access_token": None,  # expired / missing
                    "refresh_token": "revoked",
                },
            ),
            patch.object(
                connector,
                "_ensure_valid_credentials",
                new=AsyncMock(side_effect=TokenRefreshError("src", "token revoked")),
            ),
        ):
            with pytest.raises(TokenRefreshError) as exc_info:
                await connector.connect({"encrypted_tokens": "dummy", "source_id": "src"})

        assert exc_info.value.retryable is False
