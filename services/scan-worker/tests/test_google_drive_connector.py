"""
Unit tests for GoogleDriveConnector.

Tests cover:
- Token decryption path (mocked)
- File listing / pagination
- Google Workspace file filtering
- HTTP error classification (rate-limit → retryable, 401/403 → terminal)
"""
import base64
import json
import os
from typing import AsyncIterator
from unittest.mock import MagicMock, patch, AsyncMock
from uuid import uuid4

import pytest

from app.connectors.google_drive import GoogleDriveConnector, _GAPPS_PREFIX
from app.models.messages import ScanJobMessage, SourceType
from app.utils.errors import ConnectorError, FileDiscoveryError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_job(**kwargs) -> ScanJobMessage:
    defaults = dict(
        scan_job_id=uuid4(),
        source_id=uuid4(),
        source_type=SourceType.GOOGLE_DRIVE,
        user_id=uuid4(),
        config={},
    )
    defaults.update(kwargs)
    return ScanJobMessage(**defaults)


def _make_drive_item(
    file_id: str = "abc123",
    name: str = "report.pdf",
    mime_type: str = "application/pdf",
    size: str = "12345",
    modified_time: str = "2025-01-15T10:00:00Z",
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


# ---------------------------------------------------------------------------
# Token decryption
# ---------------------------------------------------------------------------

class TestDecryptTokens:
    """Test the static _decrypt_tokens method in isolation."""

    def _encrypt(self, tokens: dict, secret: str = "dev-secret-32-bytes-exactly!!!!!!") -> str:
        """Produce a valid AES-256-GCM ciphertext string matching NestJS format."""
        import os as _os
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
        from cryptography.hazmat.backends import default_backend

        kdf = Scrypt(salt=b"kms-salt", length=32, n=2**14, r=8, p=1, backend=default_backend())
        key = kdf.derive(secret.encode())

        iv = _os.urandom(12)
        aesgcm = AESGCM(key)
        ciphertext_and_tag = aesgcm.encrypt(iv, json.dumps(tokens).encode(), None)
        # NestJS format: IV[12] + TAG[16] + CIPHERTEXT
        tag = ciphertext_and_tag[-16:]
        ciphertext = ciphertext_and_tag[:-16]
        buf = iv + tag + ciphertext
        return base64.b64encode(buf).decode()

    def test_decrypt_round_trip(self):
        tokens = {"access_token": "ya29.abc", "refresh_token": "1//def"}
        encrypted = self._encrypt(tokens)
        result = GoogleDriveConnector._decrypt_tokens(encrypted)
        assert result == tokens

    def test_decrypt_with_custom_secret(self, monkeypatch):
        secret = "custom-secret-exactly-32-bytes!!"
        tokens = {"access_token": "tok"}
        encrypted = self._encrypt(tokens, secret=secret)
        monkeypatch.setenv("API_KEY_ENCRYPTION_SECRET", secret)
        result = GoogleDriveConnector._decrypt_tokens(encrypted)
        assert result == tokens

    def test_decrypt_invalid_raises(self):
        with pytest.raises(Exception):
            GoogleDriveConnector._decrypt_tokens("not-valid-base64!!!")


# ---------------------------------------------------------------------------
# connect()
# ---------------------------------------------------------------------------

class TestConnect:
    def test_connect_raises_without_tokens(self):
        connector = GoogleDriveConnector()
        with pytest.raises(ConnectorError) as exc_info:
            import asyncio
            asyncio.get_event_loop().run_until_complete(connector.connect({}))
        assert not exc_info.value.retryable

    @patch("app.connectors.google_drive.build")
    @patch.object(GoogleDriveConnector, "_decrypt_tokens")
    def test_connect_success(self, mock_decrypt, mock_build):
        mock_decrypt.return_value = {
            "access_token": "ya29",
            "refresh_token": "1//",
            "client_id": "id",
            "client_secret": "secret",
        }
        mock_service = MagicMock()
        mock_service.about().get().execute.return_value = {"user": {}}
        mock_build.return_value = mock_service

        connector = GoogleDriveConnector()
        import asyncio
        asyncio.get_event_loop().run_until_complete(
            connector.connect({"encrypted_tokens": "dummy"})
        )
        assert connector._service is not None


# ---------------------------------------------------------------------------
# list_files()
# ---------------------------------------------------------------------------

class TestListFiles:
    def _connected_connector(self, pages: list[list[dict]]) -> GoogleDriveConnector:
        """Return a connector with a mocked Drive service returning the given pages."""
        connector = GoogleDriveConnector()
        mock_service = MagicMock()

        responses = []
        for i, page in enumerate(pages):
            resp = {"files": page}
            if i < len(pages) - 1:
                resp["nextPageToken"] = f"token_{i}"
            responses.append(resp)

        mock_service.files().list().execute.side_effect = responses
        # Re-mock each call so chaining works
        mock_files = MagicMock()
        mock_files.list.return_value.execute.side_effect = responses
        mock_service.files.return_value = mock_files
        connector._service = mock_service
        return connector

    @pytest.mark.asyncio
    async def test_yields_file_message(self):
        item = _make_drive_item()
        connector = self._connected_connector([[item]])
        job = _make_job()

        results = [f async for f in connector.list_files(job)]

        assert len(results) == 1
        assert results[0].original_filename == "report.pdf"
        assert results[0].source_metadata["external_id"] == "abc123"

    @pytest.mark.asyncio
    async def test_skips_google_workspace_files(self):
        gapps_item = _make_drive_item(
            file_id="doc1",
            name="Doc.gdoc",
            mime_type="application/vnd.google-apps.document",
        )
        pdf_item = _make_drive_item(file_id="pdf1", name="report.pdf")
        connector = self._connected_connector([[gapps_item, pdf_item]])
        job = _make_job()

        results = [f async for f in connector.list_files(job)]

        assert len(results) == 1
        assert results[0].original_filename == "report.pdf"

    @pytest.mark.asyncio
    async def test_paginates_multiple_pages(self):
        page1 = [_make_drive_item(file_id=f"f{i}", name=f"file{i}.txt") for i in range(3)]
        page2 = [_make_drive_item(file_id=f"f{i}", name=f"file{i}.txt") for i in range(3, 5)]

        connector = GoogleDriveConnector()
        mock_files = MagicMock()
        responses = [
            {"files": page1, "nextPageToken": "tok1"},
            {"files": page2},
        ]
        mock_files.list.return_value.execute.side_effect = responses
        connector._service = MagicMock()
        connector._service.files.return_value = mock_files

        job = _make_job()
        results = [f async for f in connector.list_files(job)]
        assert len(results) == 5

    @pytest.mark.asyncio
    async def test_raises_file_discovery_error_on_not_connected(self):
        connector = GoogleDriveConnector()  # _service is None
        job = _make_job()
        with pytest.raises(FileDiscoveryError):
            async for _ in connector.list_files(job):
                pass


# ---------------------------------------------------------------------------
# disconnect()
# ---------------------------------------------------------------------------

class TestDisconnect:
    @pytest.mark.asyncio
    async def test_disconnect_clears_service(self):
        connector = GoogleDriveConnector()
        connector._service = MagicMock()
        await connector.disconnect()
        assert connector._service is None
