"""Google Drive file downloader for the embed-worker.

Downloads raw file bytes from Google Drive using stored OAuth2 credentials,
so the embed pipeline can extract text from Drive files whose ``file_path``
is a Drive file ID rather than a local filesystem path.

Token decryption uses the same AES-256-GCM scheme as the scan-worker and the
NestJS ``TokenEncryptionService``.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import os
from typing import Optional

import structlog
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

logger = structlog.get_logger(__name__)

# Google Workspace MIME type prefix — these files must be exported, not downloaded.
_GOOGLE_APPS_PREFIX = "application/vnd.google-apps."

# Maximum file size we will attempt to download (50 MB).
_MAX_BYTES = 50 * 1024 * 1024

# Export MIME type mapping for Google Workspace document types.
_GAPPS_EXPORT_MIME: dict[str, str] = {
    "application/vnd.google-apps.document": "text/plain",
    "application/vnd.google-apps.spreadsheet": "text/csv",
    "application/vnd.google-apps.presentation": "text/plain",
    "application/vnd.google-apps.drawing": "application/pdf",
    "application/vnd.google-apps.form": "text/plain",
}


class GoogleDriveDownloader:
    """Downloads file bytes from Google Drive for a single OAuth2 source.

    One instance is created per Drive source (keyed by ``source_id``) and
    cached on the :class:`~app.handlers.embed_handler.EmbedHandler` so that
    token decryption and credential building only happen once per worker
    lifetime, not once per file.

    Args:
        encrypted_tokens: AES-256-GCM token blob (base64) as stored in the
            ``kms_sources.encrypted_tokens`` DB column.
        client_id: OAuth2 client ID from ``GOOGLE_CLIENT_ID``.
        client_secret: OAuth2 client secret from ``GOOGLE_CLIENT_SECRET``.
    """

    def __init__(
        self,
        encrypted_tokens: str,
        client_id: str = "",
        client_secret: str = "",
    ) -> None:
        self._encrypted_tokens = encrypted_tokens
        self._client_id = client_id
        self._client_secret = client_secret
        self._credentials: Optional[Credentials] = None

    # ------------------------------------------------------------------
    # Token decryption — identical to scan-worker's _decrypt_tokens
    # ------------------------------------------------------------------

    @staticmethod
    def _decrypt_tokens(encrypted: str) -> dict:
        """Decrypt AES-256-GCM token blob produced by NestJS ``TokenEncryptionService``.

        Wire format: ``base64(IV[12] || TAG[16] || CIPHERTEXT)``.
        Key is derived via scrypt from ``API_KEY_ENCRYPTION_SECRET``.

        Args:
            encrypted: Base64-encoded ciphertext string from the DB column.

        Returns:
            Parsed JSON dict of OAuth2 token fields.

        Raises:
            Exception: On any decryption or JSON parsing failure.
        """
        secret = (
            os.environ.get("API_KEY_ENCRYPTION_SECRET") or "dev-secret-32-bytes-exactly!!!!!!"
        ).encode()

        kdf = Scrypt(
            salt=b"kms-salt",
            length=32,
            n=2 ** 14,
            r=8,
            p=1,
            backend=default_backend(),
        )
        key = kdf.derive(secret)

        buf = base64.b64decode(encrypted)
        iv = buf[:12]
        tag = buf[12:28]
        ciphertext = buf[28:]

        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(iv, ciphertext + tag, None)
        return json.loads(plaintext.decode())

    # ------------------------------------------------------------------
    # Credential management
    # ------------------------------------------------------------------

    def _build_credentials(self) -> Credentials:
        """Decrypt stored tokens and build a :class:`google.oauth2.credentials.Credentials` object.

        Returns:
            A ``Credentials`` instance, refreshed if expired.
        """
        token_data = self._decrypt_tokens(self._encrypted_tokens)

        creds = Credentials(
            token=token_data.get("access_token"),
            refresh_token=token_data.get("refresh_token"),
            token_uri=token_data.get("token_uri", "https://oauth2.googleapis.com/token"),
            client_id=token_data.get("client_id") or self._client_id,
            client_secret=token_data.get("client_secret") or self._client_secret,
            scopes=token_data.get("scopes"),
        )

        if creds.expired and creds.refresh_token:
            # 30-second timeout avoids indefinite hangs if Google auth is unreachable.
            creds.refresh(GoogleRequest(timeout=30))

        return creds

    def _get_credentials(self) -> Credentials:
        """Return cached credentials, refreshing if expired.

        Returns:
            A valid :class:`google.oauth2.credentials.Credentials` instance.
        """
        if self._credentials is None:
            self._credentials = self._build_credentials()
        elif self._credentials.expired and self._credentials.refresh_token:
            try:
                self._credentials.refresh(GoogleRequest(timeout=30))
            except Exception as exc:
                logger.warning(
                    "Token refresh failed — rebuilding credentials from DB",
                    error=str(exc),
                )
                self._credentials = self._build_credentials()
        return self._credentials

    # ------------------------------------------------------------------
    # Download helpers (synchronous — called via run_in_executor)
    # ------------------------------------------------------------------

    def _download_sync(self, external_id: str, mime_type: str) -> Optional[bytes]:
        """Download or export a Drive file synchronously.

        This method runs inside a thread pool via :func:`asyncio.get_event_loop`
        ``run_in_executor`` to avoid blocking the asyncio event loop.

        Args:
            external_id: Google Drive file ID.
            mime_type: MIME type of the file as recorded in the KMS database.

        Returns:
            Raw file bytes, or ``None`` if the file cannot be fetched.
        """
        try:
            creds = self._get_credentials()
            # static_discovery=True uses the bundled local discovery doc — no HTTP call to
            # googleapis.com, which avoids the httplib2 default-no-timeout hang.
            service = build("drive", "v3", credentials=creds, static_discovery=True, num_retries=2)

            # Determine file size before downloading to enforce the 50 MB cap.
            # For Google Workspace files size is reported as 0 — skip the check.
            if not mime_type.startswith(_GOOGLE_APPS_PREFIX):
                meta = (
                    service.files()
                    .get(fileId=external_id, fields="size")
                    .execute()
                )
                size = int(meta.get("size") or 0)
                if size > _MAX_BYTES:
                    logger.warning(
                        "Drive file exceeds 50 MB limit — skipping download",
                        external_id=external_id,
                        size_bytes=size,
                    )
                    return None

            buf = io.BytesIO()

            if mime_type.startswith(_GOOGLE_APPS_PREFIX):
                # Google Workspace document — must be exported as a different MIME.
                export_mime = _GAPPS_EXPORT_MIME.get(mime_type, "text/plain")
                request = service.files().export_media(
                    fileId=external_id, mimeType=export_mime
                )
            else:
                # Binary / office file — download as-is.
                request = service.files().get_media(fileId=external_id)

            downloader = MediaIoBaseDownload(buf, request, chunksize=8 * 1024 * 1024)
            done = False
            while not done:
                _, done = downloader.next_chunk()

            return buf.getvalue()

        except Exception as exc:
            logger.warning(
                "Drive download failed",
                external_id=external_id,
                mime_type=mime_type,
                error=str(exc),
            )
            return None

    # ------------------------------------------------------------------
    # Public async interface
    # ------------------------------------------------------------------

    async def download_content(self, external_id: str, mime_type: str) -> Optional[bytes]:
        """Download file bytes from Google Drive asynchronously.

        Wraps the synchronous Drive API call in :func:`asyncio.get_event_loop`
        ``run_in_executor`` so the event loop is never blocked.

        Args:
            external_id: Google Drive file ID (e.g. ``1abc2def3ghi``).
            mime_type: MIME type of the file (used to choose download vs export).

        Returns:
            Raw file bytes on success, or ``None`` on any failure (size limit
            exceeded, auth error, network error, etc.).  Failures are logged as
            warnings; exceptions are never propagated to the caller.
        """
        loop = asyncio.get_event_loop()
        try:
            return await asyncio.wait_for(
                loop.run_in_executor(None, self._download_sync, external_id, mime_type),
                timeout=120,  # 2-minute hard cap per file download
            )
        except asyncio.TimeoutError:
            logger.warning(
                "Drive download timed out after 120 s",
                external_id=external_id,
                mime_type=mime_type,
            )
            return None
