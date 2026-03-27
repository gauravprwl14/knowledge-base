"""Tests for GoogleDriveDownloader.

PRD: PRD-google-drive-integration.md — Drive file download, timeout handling
Gap: No test file existed for GoogleDriveDownloader.  Key missing branches:
- download_content timeout → returns None (never raises)
- download_content on exception in _download_sync → returns None (never raises)
- _download_sync skips files > 50 MB
- _download_sync uses export for Google Workspace MIME types
- _download_sync uses get_media for binary files
"""

import asyncio
import base64
import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.connectors.google_drive_downloader import (
    GoogleDriveDownloader,
    _MAX_BYTES,
    _GOOGLE_APPS_PREFIX,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_downloader(encrypted_tokens: str = "dGVzdA==") -> GoogleDriveDownloader:
    """Instantiate a GoogleDriveDownloader with placeholder credentials.

    Args:
        encrypted_tokens: Base64-encoded token blob (placeholder for most tests).

    Returns:
        A GoogleDriveDownloader instance.
    """
    return GoogleDriveDownloader(
        encrypted_tokens=encrypted_tokens,
        client_id="test-client-id",
        client_secret="test-client-secret",
    )


# ---------------------------------------------------------------------------
# download_content — timeout handling
# ---------------------------------------------------------------------------


class TestDownloadContentTimeout:
    """Verify that a timeout returns None instead of raising."""

    @pytest.mark.asyncio
    async def test_timeout_returns_none(self):
        """asyncio.TimeoutError must be caught and None returned."""
        downloader = _make_downloader()

        with patch("app.connectors.google_drive_downloader.asyncio.wait_for") as mock_wait:
            mock_wait.side_effect = asyncio.TimeoutError()

            result = await downloader.download_content("file-id-123", "application/pdf")

        assert result is None

    @pytest.mark.asyncio
    async def test_timeout_does_not_raise(self):
        """No exception must propagate to the caller on timeout."""
        downloader = _make_downloader()

        with patch("app.connectors.google_drive_downloader.asyncio.wait_for") as mock_wait:
            mock_wait.side_effect = asyncio.TimeoutError()

            # Must not raise
            try:
                result = await downloader.download_content("file-id-123", "application/pdf")
            except asyncio.TimeoutError:
                pytest.fail("TimeoutError propagated to caller — should have been caught")

        assert result is None

    @pytest.mark.asyncio
    async def test_successful_download_returns_bytes(self):
        """A successful call must return the bytes from _download_sync."""
        downloader = _make_downloader()
        expected_bytes = b"PDF content here"

        async def fake_run_in_executor(_executor, func, *args):
            return expected_bytes

        async def fake_wait_for(coro, timeout):
            return await coro

        with patch(
            "app.connectors.google_drive_downloader.asyncio.get_event_loop"
        ) as mock_loop:
            mock_loop_inst = MagicMock()
            mock_loop.return_value = mock_loop_inst
            mock_loop_inst.run_in_executor = fake_run_in_executor

            with patch(
                "app.connectors.google_drive_downloader.asyncio.wait_for",
                side_effect=fake_wait_for,
            ):
                result = await downloader.download_content("file-id", "application/pdf")

        assert result == expected_bytes


# ---------------------------------------------------------------------------
# _download_sync — exception handling
# ---------------------------------------------------------------------------


class TestDownloadSyncExceptionHandling:
    """_download_sync must return None (not raise) on any exception."""

    def test_returns_none_when_credentials_fail(self):
        """Auth failures during _build_credentials must be caught and return None."""
        downloader = _make_downloader()

        with patch.object(downloader, "_get_credentials", side_effect=Exception("auth failed")):
            result = downloader._download_sync("file-id", "application/pdf")

        assert result is None

    def test_returns_none_on_drive_api_error(self):
        """HTTP errors from the Drive API must be caught and return None."""
        downloader = _make_downloader()

        mock_creds = MagicMock()
        mock_service = MagicMock()
        mock_service.files.return_value.get.return_value.execute.side_effect = Exception(
            "Drive API error 403"
        )

        with patch.object(downloader, "_get_credentials", return_value=mock_creds):
            with patch(
                "app.connectors.google_drive_downloader.build", return_value=mock_service
            ):
                result = downloader._download_sync("file-id", "application/pdf")

        assert result is None


# ---------------------------------------------------------------------------
# _download_sync — 50 MB size limit
# ---------------------------------------------------------------------------


class TestDownloadSyncSizeLimit:
    """Files over 50 MB must be skipped (returns None) without downloading."""

    def test_skips_file_over_50mb(self):
        """A file reported as 60 MB must be skipped; get_media must not be called."""
        downloader = _make_downloader()

        mock_creds = MagicMock()
        mock_service = MagicMock()
        over_limit_bytes = _MAX_BYTES + 1024 * 1024  # 51 MB

        # Simulate files().get().execute() returning file size metadata
        mock_service.files.return_value.get.return_value.execute.return_value = {
            "size": str(over_limit_bytes)
        }

        with patch.object(downloader, "_get_credentials", return_value=mock_creds):
            with patch(
                "app.connectors.google_drive_downloader.build", return_value=mock_service
            ):
                result = downloader._download_sync("big-file-id", "application/pdf")

        assert result is None
        # get_media must NOT have been called
        mock_service.files.return_value.get_media.assert_not_called()

    def test_downloads_file_at_exactly_50mb(self):
        """A file of exactly 50 MB must NOT be skipped."""
        downloader = _make_downloader()

        mock_creds = MagicMock()
        mock_service = MagicMock()

        mock_service.files.return_value.get.return_value.execute.return_value = {
            "size": str(_MAX_BYTES)
        }

        # Mock the download chain
        mock_request = MagicMock()
        mock_service.files.return_value.get_media.return_value = mock_request

        mock_downloader_inst = MagicMock()
        # next_chunk returns (progress, done=True) on first call
        mock_downloader_inst.next_chunk.return_value = (MagicMock(), True)
        expected_data = b"x" * 100

        with patch.object(downloader, "_get_credentials", return_value=mock_creds):
            with patch(
                "app.connectors.google_drive_downloader.build", return_value=mock_service
            ):
                with patch(
                    "app.connectors.google_drive_downloader.MediaIoBaseDownload",
                    return_value=mock_downloader_inst,
                ) as mock_dl_cls:
                    # Make the buffer write the expected data
                    import io

                    real_buf = io.BytesIO(expected_data)

                    def fake_media_io(buf, request, chunksize=None):
                        buf.write(expected_data)
                        return mock_downloader_inst

                    mock_dl_cls.side_effect = fake_media_io

                    result = downloader._download_sync("file-at-limit", "application/pdf")

        # Should NOT be None — file size is exactly at the limit
        # (the size check is `> _MAX_BYTES`, not `>=`)
        assert result is not None


# ---------------------------------------------------------------------------
# _download_sync — Google Workspace MIME type routing
# ---------------------------------------------------------------------------


class TestDownloadSyncMimeTypeRouting:
    """Google Workspace files must use export_media; binary files use get_media."""

    def _build_mock_service_for_export(self, export_data: bytes = b"exported text"):
        """Build a Drive service mock wired for an export_media call."""
        mock_service = MagicMock()
        mock_service.files.return_value.export_media.return_value = MagicMock()

        mock_downloader_inst = MagicMock()
        mock_downloader_inst.next_chunk.return_value = (MagicMock(), True)

        def fake_media_io(buf, request, chunksize=None):
            buf.write(export_data)
            return mock_downloader_inst

        return mock_service, fake_media_io

    def test_google_doc_uses_export_media(self):
        """application/vnd.google-apps.document must trigger export_media."""
        downloader = _make_downloader()
        mock_creds = MagicMock()
        mock_service, fake_dl = self._build_mock_service_for_export()

        with patch.object(downloader, "_get_credentials", return_value=mock_creds):
            with patch(
                "app.connectors.google_drive_downloader.build", return_value=mock_service
            ):
                with patch(
                    "app.connectors.google_drive_downloader.MediaIoBaseDownload",
                    side_effect=fake_dl,
                ):
                    result = downloader._download_sync(
                        "gdoc-id", "application/vnd.google-apps.document"
                    )

        mock_service.files.return_value.export_media.assert_called_once()
        mock_service.files.return_value.get_media.assert_not_called()

    def test_binary_pdf_uses_get_media(self):
        """application/pdf must trigger get_media, not export_media."""
        downloader = _make_downloader()
        mock_creds = MagicMock()
        mock_service = MagicMock()

        mock_service.files.return_value.get.return_value.execute.return_value = {"size": "1024"}
        mock_service.files.return_value.get_media.return_value = MagicMock()

        mock_downloader_inst = MagicMock()
        mock_downloader_inst.next_chunk.return_value = (MagicMock(), True)

        def fake_dl(buf, request, chunksize=None):
            buf.write(b"pdf content")
            return mock_downloader_inst

        with patch.object(downloader, "_get_credentials", return_value=mock_creds):
            with patch(
                "app.connectors.google_drive_downloader.build", return_value=mock_service
            ):
                with patch(
                    "app.connectors.google_drive_downloader.MediaIoBaseDownload",
                    side_effect=fake_dl,
                ):
                    result = downloader._download_sync("pdf-id", "application/pdf")

        mock_service.files.return_value.get_media.assert_called_once()
        mock_service.files.return_value.export_media.assert_not_called()

    def test_google_spreadsheet_uses_export_media(self):
        """application/vnd.google-apps.spreadsheet must trigger export_media."""
        downloader = _make_downloader()
        mock_creds = MagicMock()
        mock_service, fake_dl = self._build_mock_service_for_export()

        with patch.object(downloader, "_get_credentials", return_value=mock_creds):
            with patch(
                "app.connectors.google_drive_downloader.build", return_value=mock_service
            ):
                with patch(
                    "app.connectors.google_drive_downloader.MediaIoBaseDownload",
                    side_effect=fake_dl,
                ):
                    downloader._download_sync(
                        "sheet-id", "application/vnd.google-apps.spreadsheet"
                    )

        mock_service.files.return_value.export_media.assert_called_once()

    def test_size_check_skipped_for_google_apps(self):
        """Size metadata must NOT be fetched for Google Workspace MIME types."""
        downloader = _make_downloader()
        mock_creds = MagicMock()
        mock_service, fake_dl = self._build_mock_service_for_export()

        with patch.object(downloader, "_get_credentials", return_value=mock_creds):
            with patch(
                "app.connectors.google_drive_downloader.build", return_value=mock_service
            ):
                with patch(
                    "app.connectors.google_drive_downloader.MediaIoBaseDownload",
                    side_effect=fake_dl,
                ):
                    downloader._download_sync(
                        "gdoc-id", "application/vnd.google-apps.document"
                    )

        # files().get() is NOT called for metadata when it's a Google Apps type
        mock_service.files.return_value.get.assert_not_called()


# ---------------------------------------------------------------------------
# Credential caching
# ---------------------------------------------------------------------------


class TestCredentialCaching:
    """Credentials must be cached after the first call to _get_credentials."""

    def test_credentials_cached_on_second_call(self):
        """_build_credentials must only be called once even on multiple _get_credentials calls."""
        downloader = _make_downloader()
        mock_creds = MagicMock()
        mock_creds.expired = False

        with patch.object(
            downloader, "_build_credentials", return_value=mock_creds
        ) as mock_build:
            _ = downloader._get_credentials()
            _ = downloader._get_credentials()
            _ = downloader._get_credentials()

        # _build_credentials should only have been called once
        assert mock_build.call_count == 1
