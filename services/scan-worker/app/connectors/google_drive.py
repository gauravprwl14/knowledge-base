"""
Google Drive connector for the scan worker.

Authenticates with stored OAuth2 credentials, paginates Drive file listings,
and yields FileDiscoveredMessage for each non-Google-Workspace file.
"""
import json
import os
import base64
from datetime import datetime, timezone
from typing import AsyncIterator

import structlog
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from cryptography.hazmat.backends import default_backend
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.connectors.base import BaseConnector
from app.models.messages import FileDiscoveredMessage, ScanJobMessage, SourceType
from app.config import get_settings
from app.utils.errors import ConnectorError, FileDiscoveryError

logger = structlog.get_logger(__name__)
settings = get_settings()

# Drive API parameters
_DRIVE_FIELDS = "nextPageToken, files(id, name, mimeType, size, webViewLink, modifiedTime, parents)"
_DRIVE_QUERY = "trashed = false"
_PAGE_SIZE = 100
# Google Workspace mime-type prefix — these need export, skipped in discovery
_GAPPS_PREFIX = "application/vnd.google-apps"


class GoogleDriveConnector(BaseConnector):
    """Connector that scans a user's Google Drive and yields file messages.

    Auth tokens are stored encrypted in the DB. The connector decrypts them
    using the same AES-256-GCM + scrypt scheme as the NestJS
    TokenEncryptionService and builds a google-auth Credentials object.
    """

    source_type = SourceType.GOOGLE_DRIVE

    # Set by connect()
    _service = None
    _credentials: Credentials | None = None

    async def connect(self, config: dict) -> None:
        """Decrypt stored OAuth2 tokens and initialise the Drive service.

        Args:
            config: dict with key ``encrypted_tokens`` (base64-encoded AES-GCM ciphertext).

        Raises:
            ConnectorError: if tokens are missing, malformed, or Drive is unreachable.
        """
        encrypted = config.get("encrypted_tokens")
        if not encrypted:
            raise ConnectorError(
                "google_drive",
                "No encrypted_tokens in config — reconnect Google Drive",
                retryable=False,
            )

        try:
            tokens = self._decrypt_tokens(encrypted)
        except Exception as exc:
            raise ConnectorError(
                "google_drive",
                f"Failed to decrypt tokens: {exc}",
                retryable=False,
            ) from exc

        self._credentials = Credentials(
            token=tokens.get("access_token"),
            refresh_token=tokens.get("refresh_token"),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=tokens.get("client_id"),
            client_secret=tokens.get("client_secret"),
        )

        try:
            self._service = build(
                "drive", "v3",
                credentials=self._credentials,
                cache_discovery=False,
            )
            # Validate credentials with a lightweight quota check
            self._service.about().get(fields="user").execute()
        except HttpError as exc:
            status = exc.resp.status
            raise ConnectorError(
                "google_drive",
                f"Drive API error on connect ({status}): {exc}",
                retryable=status not in (401, 403),
            ) from exc

        logger.info("google_drive_connector_connected")

    async def list_files(self, job: ScanJobMessage) -> AsyncIterator[FileDiscoveredMessage]:
        """Paginate all Drive files and yield one message per non-GApps file.

        Args:
            job: The scan job being processed.

        Yields:
            FileDiscoveredMessage for each eligible file.

        Raises:
            FileDiscoveryError: on Drive API errors during pagination.
        """
        if self._service is None:
            raise FileDiscoveryError(str(job.source_id), "Connector not connected")

        page_token: str | None = None
        page_num = 0

        while True:
            page_num += 1
            try:
                result = self._service.files().list(
                    q=_DRIVE_QUERY,
                    pageSize=_PAGE_SIZE,
                    fields=_DRIVE_FIELDS,
                    pageToken=page_token,
                    orderBy="modifiedTime desc",
                ).execute()
            except HttpError as exc:
                status = exc.resp.status
                if status == 429:
                    raise FileDiscoveryError(
                        str(job.source_id),
                        f"Drive rate limited: {exc}",
                        retryable=True,
                    ) from exc
                if status in (401, 403):
                    raise FileDiscoveryError(
                        str(job.source_id),
                        f"Drive access denied ({status}): {exc}",
                        retryable=False,
                    ) from exc
                raise FileDiscoveryError(
                    str(job.source_id),
                    f"Drive API error ({status}): {exc}",
                    retryable=True,
                ) from exc

            items = result.get("files", [])
            logger.debug("drive_page_fetched", page=page_num, items=len(items))

            for item in items:
                mime_type = item.get("mimeType", "application/octet-stream")

                # Skip Google Workspace documents — content extraction handled separately
                if mime_type.startswith(_GAPPS_PREFIX):
                    continue

                modified_raw = item.get("modifiedTime")
                last_modified: datetime | None = None
                if modified_raw:
                    last_modified = datetime.fromisoformat(
                        modified_raw.replace("Z", "+00:00")
                    )

                yield FileDiscoveredMessage(
                    scan_job_id=job.scan_job_id,
                    source_id=job.source_id,
                    user_id=job.user_id,
                    file_path=item["id"],  # Drive has no path; use file ID as stable ref
                    original_filename=item["name"],
                    mime_type=mime_type,
                    file_size_bytes=int(item.get("size", 0)) if item.get("size") else None,
                    last_modified=last_modified,
                    checksum_sha256=None,  # not available from Drive listing
                    source_type=SourceType.GOOGLE_DRIVE,
                    source_metadata={
                        "external_id": item["id"],
                        "web_view_link": item.get("webViewLink"),
                        "parents": item.get("parents", []),
                    },
                )

            page_token = result.get("nextPageToken")
            if not page_token:
                break

    async def disconnect(self) -> None:
        """Release Drive service resources."""
        self._service = None
        self._credentials = None
        logger.debug("google_drive_connector_disconnected")

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _decrypt_tokens(encrypted: str) -> dict:
        """Decrypt AES-256-GCM token blob produced by NestJS TokenEncryptionService.

        The wire format is: base64(IV[12] || TAG[16] || CIPHERTEXT).
        Key is derived via scrypt from ``API_KEY_ENCRYPTION_SECRET``.

        Args:
            encrypted: base64-encoded ciphertext string from the DB column.

        Returns:
            Parsed JSON dict of OAuth2 token fields.
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
