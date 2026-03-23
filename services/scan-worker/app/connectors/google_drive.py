"""
Google Drive connector for the scan worker.

Authenticates with stored OAuth2 credentials, handles token refresh, paginates
Drive file listings, and for incremental scans uses the Drive Changes API with a
persisted ``startPageToken`` to return only files modified since the last sync.

Scan modes
----------
- **FULL**: lists every non-GApps file via ``files.list`` and stores the
  ``startPageToken`` obtained at the *start* of the scan in Redis so the next
  incremental scan picks up exactly the changes that happened after this point.
- **INCREMENTAL**: calls ``changes.list(startPageToken)`` to retrieve only
  changed/deleted Drive items since the last scan.  Updates the stored
  ``startPageToken`` after all pages are consumed.

Error handling
--------------
- HTTP 429 (rate limit) → :class:`~app.utils.errors.DriveRateLimitError`
  (retryable=True).  The AMQP handler nacks with requeue=True and exponential
  backoff must be applied at the broker level (via message TTL / DLQ).
- HTTP 401/403 (auth failure) → tries one token refresh; if that also fails
  raises :class:`~app.utils.errors.TokenRefreshError` (retryable=False).
- Network timeout → raised as :class:`~app.utils.errors.FileDiscoveryError`
  (retryable=True) after three internal retries.
"""
import json
import os
import base64
import asyncio
from datetime import datetime, timezone
from typing import AsyncIterator

import structlog
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from cryptography.hazmat.backends import default_backend
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.connectors.base import BaseConnector
from app.models.messages import FileDiscoveredMessage, ScanJobMessage, ScanType, SourceType
from app.config import get_settings
from app.services.delta_sync_service import DeltaSyncService
from app.utils.errors import (
    ConnectorError,
    DriveRateLimitError,
    FileDiscoveryError,
    TokenRefreshError,
)

logger = structlog.get_logger(__name__)
settings = get_settings()

# Drive API field mask for file listings
_DRIVE_FIELDS = (
    "nextPageToken, files(id, name, mimeType, size, webViewLink, modifiedTime, parents)"
)
# Field mask for changes listings
_CHANGES_FIELDS = (
    "nextPageToken, newStartPageToken, "
    "changes(removed, fileId, file(id, name, mimeType, size, webViewLink, modifiedTime, parents))"
)
# Base query: exclude trashed items
_DRIVE_QUERY = "trashed = false"
_PAGE_SIZE = 100

# Google Workspace mime-type prefix — these need export; skipped in discovery
_GAPPS_PREFIX = "application/vnd.google-apps"

# Number of retries for transient network failures
_MAX_NETWORK_RETRIES = 3
# Initial backoff in seconds for network retries (doubles each attempt)
_INITIAL_BACKOFF_SECONDS = 2.0


class GoogleDriveConnector(BaseConnector):
    """Connector that scans a user's Google Drive and yields file messages.

    Auth tokens are stored encrypted in the DB.  The connector decrypts them
    using the same AES-256-GCM + scrypt scheme as the NestJS
    ``TokenEncryptionService`` and builds a ``google.oauth2.credentials.Credentials``
    object.  Token refresh is handled transparently before each API call.

    Delta sync:
        On a FULL scan the connector fetches the Drive Changes API
        ``startPageToken`` before listing files and stores it in Redis via
        :class:`~app.services.delta_sync_service.DeltaSyncService`.  On the
        next INCREMENTAL scan the connector calls ``changes.list`` with that
        stored token to receive only the diff.

    Attributes:
        _service: Authenticated ``googleapiclient`` Drive v3 resource.
        _credentials: Live ``google.oauth2.credentials.Credentials`` instance.
        _delta_sync: Redis-backed service for page token persistence.
        _source_id: Drive source UUID (set during connect for logging).
    """

    source_type = SourceType.GOOGLE_DRIVE

    def __init__(self) -> None:
        self._service = None
        self._credentials: Credentials | None = None
        self._delta_sync = DeltaSyncService()
        self._source_id: str | None = None

    # ------------------------------------------------------------------
    # BaseConnector interface
    # ------------------------------------------------------------------

    async def connect(self, config: dict) -> None:
        """Decrypt stored OAuth2 tokens, refresh if expired, initialise Drive service.

        Args:
            config: Dict with key ``encrypted_tokens`` (base64-encoded AES-GCM
                ciphertext) and optionally ``source_id`` for logging context.

        Raises:
            ConnectorError: If tokens are missing, malformed, or Drive
                cannot be reached after refresh.
            TokenRefreshError: If the access token has expired and the refresh
                token cannot be used to obtain a new one (terminal error).
        """
        self._source_id = config.get("source_id", "unknown")

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
            client_id=tokens.get("client_id") or settings.google_client_id or None,
            client_secret=tokens.get("client_secret") or settings.google_client_secret or None,
        )

        # Refresh the token if it is already expired before building the service
        await self._ensure_valid_credentials()

        try:
            self._service = build(
                "drive", "v3",
                credentials=self._credentials,
                cache_discovery=False,
            )
            # Validate credentials with a lightweight quota call
            self._service.about().get(fields="user").execute()
        except HttpError as exc:
            status = exc.resp.status
            raise ConnectorError(
                "google_drive",
                f"Drive API error on connect ({status}): {exc}",
                retryable=status not in (401, 403),
            ) from exc

        logger.info(
            "google_drive_connector_connected",
            source_id=self._source_id,
        )

    async def list_files(self, job: ScanJobMessage) -> AsyncIterator[FileDiscoveredMessage]:
        """Paginate Drive and yield one message per non-GApps file.

        Dispatches to :meth:`_list_full` or :meth:`_list_incremental` based on
        ``job.scan_type``.  After an incremental listing is fully consumed the
        new ``startPageToken`` is persisted so subsequent scans resume from
        the correct position.

        After a successful full scan, stores the ``startPageToken`` captured at
        the *start* of the scan (before any files changed) and the
        ``last_sync`` timestamp.

        Args:
            job: The scan job being processed.

        Yields:
            :class:`~app.models.messages.FileDiscoveredMessage` for each
            eligible file (new, modified, or still present).

        Raises:
            FileDiscoveryError: On Drive API errors during pagination.
            DriveRateLimitError: When Drive returns HTTP 429.
            TokenRefreshError: When OAuth2 refresh fails mid-scan.
        """
        if self._service is None:
            raise FileDiscoveryError(str(job.source_id), "Connector not connected")

        source_id = str(job.source_id)

        if job.scan_type == ScanType.INCREMENTAL:
            page_token = await self._delta_sync.get_page_token(source_id)
            if page_token:
                logger.info(
                    "google_drive_incremental_scan_start",
                    source_id=source_id,
                    token_prefix=page_token[:8],
                )
                async for msg in self._list_incremental(job, page_token):
                    yield msg
                return
            else:
                # No stored token — fall through to full scan
                logger.info(
                    "google_drive_incremental_no_token_fallback_to_full",
                    source_id=source_id,
                )

        # FULL scan path
        # Capture the startPageToken *before* listing so the next incremental
        # scan sees changes that occurred while we were scanning.
        start_page_token = await self._get_start_page_token(source_id)

        async for msg in self._list_full(job):
            yield msg

        # Persist token + timestamp after exhausting all pages
        if start_page_token:
            await self._delta_sync.set_page_token(source_id, start_page_token)
        await self._delta_sync.set_last_sync(source_id)
        logger.info(
            "google_drive_full_scan_complete_delta_state_saved",
            source_id=source_id,
            has_page_token=bool(start_page_token),
        )

    async def disconnect(self) -> None:
        """Release Drive service resources."""
        self._service = None
        self._credentials = None
        logger.debug("google_drive_connector_disconnected", source_id=self._source_id)

    # ------------------------------------------------------------------
    # Full scan implementation
    # ------------------------------------------------------------------

    async def _list_full(self, job: ScanJobMessage) -> AsyncIterator[FileDiscoveredMessage]:
        """Paginate the full Drive ``files.list`` API.

        Applies folder filter (``syncFolderIds``) and file extension filters
        (``includeExtensions`` / ``excludeExtensions``) from ``job.config``
        when they are present.

        Args:
            job: The scan job providing source/user context.

        Yields:
            :class:`~app.models.messages.FileDiscoveredMessage` for each
            non-GApps file that passes the configured filters.

        Raises:
            DriveRateLimitError: On HTTP 429.
            FileDiscoveryError: On other Drive API errors.
        """
        page_token: str | None = None
        page_num = 0
        drive_query = self._build_drive_query(job.config)

        logger.info(
            "drive_full_scan_query",
            source_id=str(job.source_id),
            query=drive_query,
            sync_folder_ids=job.config.get("syncFolderIds", []),
        )

        while True:
            page_num += 1
            try:
                result = await self._execute_with_retry(
                    lambda pt=page_token: self._service.files().list(
                        q=drive_query,
                        pageSize=_PAGE_SIZE,
                        fields=_DRIVE_FIELDS,
                        pageToken=pt,
                        orderBy="modifiedTime desc",
                    ).execute(),
                    job,
                )
            except (DriveRateLimitError, FileDiscoveryError, TokenRefreshError):
                raise

            items = result.get("files", [])
            logger.debug(
                "drive_full_page_fetched",
                source_id=str(job.source_id),
                page=page_num,
                items=len(items),
            )

            for item in items:
                # Apply file extension filter before building the message
                if not self._should_include_file(
                    item.get("name", ""),
                    item.get("mimeType", ""),
                    job.config,
                ):
                    logger.debug(
                        "drive_file_excluded_by_extension_filter",
                        source_id=str(job.source_id),
                        filename=item.get("name"),
                    )
                    continue

                msg = self._item_to_message(item, job)
                if msg:
                    yield msg

            page_token = result.get("nextPageToken")
            if not page_token:
                break

    # ------------------------------------------------------------------
    # Filter helpers
    # ------------------------------------------------------------------

    def _build_drive_query(self, config: dict) -> str:
        """Build Drive API query string respecting the folder filter.

        When ``syncFolderIds`` is provided and non-empty, the query restricts
        results to files that are direct children of any of those folders.
        Otherwise all non-trashed files are returned (original behaviour).

        Args:
            config: Scan job config dict (``ScanJobMessage.config``).

        Returns:
            A Drive API query string suitable for the ``q`` parameter.
        """
        base_query = "trashed=false"

        sync_folder_ids = config.get("syncFolderIds", [])
        if sync_folder_ids:
            parent_conditions = " or ".join(
                f"'{folder_id}' in parents" for folder_id in sync_folder_ids
            )
            return f"{base_query} and ({parent_conditions})"

        return base_query

    def _should_include_file(self, filename: str, mime_type: str, config: dict) -> bool:
        """Check whether a file passes the configured extension filters.

        When neither ``includeExtensions`` nor ``excludeExtensions`` is set the
        function returns ``True`` (no filtering — preserve existing behaviour).

        ``includeExtensions`` acts as an allowlist: if set, only files whose
        extension is in the list are kept.  ``excludeExtensions`` acts as a
        blocklist applied after the allowlist check.

        Extensions are compared case-insensitively.  Dot prefix is optional in
        the config (both ``".pdf"`` and ``"pdf"`` are accepted).

        Args:
            filename: Original filename from the Drive API.
            mime_type: MIME type from the Drive API (currently unused but kept
                for future content-type filtering).
            config: Scan job config dict (``ScanJobMessage.config``).

        Returns:
            ``True`` if the file should be included in the scan results.
        """
        def _normalise(e: str) -> str:
            """Ensure extension has a leading dot and is lowercase."""
            e = e.lower()
            return e if e.startswith(".") else f".{e}"

        include_exts = [_normalise(e) for e in config.get("includeExtensions", [])]
        exclude_exts = [_normalise(e) for e in config.get("excludeExtensions", [])]

        if not include_exts and not exclude_exts:
            return True

        ext = (f".{filename.rsplit('.', 1)[-1].lower()}" if "." in filename else "")

        if include_exts and ext not in include_exts:
            return False
        if exclude_exts and ext in exclude_exts:
            return False

        return True

    # ------------------------------------------------------------------
    # Incremental scan implementation (Changes API)
    # ------------------------------------------------------------------

    async def _list_incremental(
        self,
        job: ScanJobMessage,
        start_page_token: str,
    ) -> AsyncIterator[FileDiscoveredMessage]:
        """Use the Drive Changes API to yield only changed/added files.

        Deleted files (``change.removed == True``) are logged but not yielded
        — tombstone handling is left to a future deletion pipeline.

        After all change pages are consumed, persists the ``newStartPageToken``
        returned by the final page so the *next* incremental scan resumes from
        the correct position.

        Args:
            job: The scan job providing source/user context.
            start_page_token: Drive Changes API page token from Redis.

        Yields:
            :class:`~app.models.messages.FileDiscoveredMessage` for each
            changed (non-deleted, non-GApps) file.

        Raises:
            DriveRateLimitError: On HTTP 429.
            FileDiscoveryError: On other Drive API errors.
            TokenRefreshError: When OAuth2 refresh fails mid-scan.
        """
        source_id = str(job.source_id)
        page_token: str | None = start_page_token
        new_start_token: str | None = None
        page_num = 0

        while True:
            page_num += 1
            try:
                result = await self._execute_with_retry(
                    lambda pt=page_token: self._service.changes().list(
                        pageToken=pt,
                        fields=_CHANGES_FIELDS,
                        pageSize=_PAGE_SIZE,
                        includeRemoved=True,
                    ).execute(),
                    job,
                )
            except (DriveRateLimitError, FileDiscoveryError, TokenRefreshError):
                raise

            # Drive returns newStartPageToken on the last page
            if result.get("newStartPageToken"):
                new_start_token = result["newStartPageToken"]

            changes = result.get("changes", [])
            logger.debug(
                "drive_changes_page_fetched",
                source_id=source_id,
                page=page_num,
                changes=len(changes),
            )

            for change in changes:
                if change.get("removed"):
                    # File was deleted — log for future tombstone pipeline
                    logger.info(
                        "drive_file_deleted_detected",
                        source_id=source_id,
                        file_id=change.get("fileId"),
                    )
                    continue

                file_item = change.get("file")
                if not file_item:
                    continue

                msg = self._item_to_message(file_item, job)
                if msg:
                    yield msg

            page_token = result.get("nextPageToken")
            if not page_token:
                break

        # Persist the new page token so subsequent scans start from here
        if new_start_token:
            await self._delta_sync.set_page_token(source_id, new_start_token)
            logger.info(
                "google_drive_incremental_scan_complete_token_updated",
                source_id=source_id,
                token_prefix=new_start_token[:8],
            )
        else:
            # Unexpected: Drive should always return newStartPageToken on the last page
            logger.warning(
                "google_drive_incremental_scan_no_new_token",
                source_id=source_id,
            )

        await self._delta_sync.set_last_sync(source_id)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _get_start_page_token(self, source_id: str) -> str | None:
        """Fetch the current Drive Changes API ``startPageToken`` for a new scan.

        This must be called *before* listing files so that any changes that
        occur during the (potentially slow) full listing are captured on the
        next incremental run.

        Args:
            source_id: UUID string for logging context.

        Returns:
            The ``startPageToken`` string, or ``None`` on API failure
            (non-fatal — the next incremental will fall back to a full scan).
        """
        try:
            result = self._service.changes().getStartPageToken().execute()
            token = result.get("startPageToken")
            logger.debug(
                "drive_start_page_token_fetched",
                source_id=source_id,
                token_prefix=(token or "")[:8],
            )
            return token
        except HttpError as exc:
            logger.warning(
                "drive_get_start_page_token_failed",
                source_id=source_id,
                error=str(exc),
            )
            return None

    async def _ensure_valid_credentials(self) -> None:
        """Refresh the access token if it is expired or missing.

        Uses the google-auth library's built-in refresh mechanism.
        On failure raises :class:`~app.utils.errors.TokenRefreshError` which
        is non-retryable (the user must reconnect their Drive account).

        Raises:
            TokenRefreshError: When the refresh token is invalid or revoked.
        """
        if self._credentials and not self._credentials.valid:
            try:
                # google-auth's synchronous refresh — wrap in executor to avoid
                # blocking the event loop
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    None,
                    lambda: self._credentials.refresh(GoogleRequest()),
                )
                logger.info(
                    "google_drive_token_refreshed",
                    source_id=self._source_id,
                )
            except Exception as exc:
                raise TokenRefreshError(
                    self._source_id or "unknown",
                    f"Token refresh failed: {exc}",
                ) from exc

    async def _execute_with_retry(self, call, job: ScanJobMessage):
        """Execute a Drive API synchronous call with retry logic.

        Retries up to ``_MAX_NETWORK_RETRIES`` times for transient network
        errors.  HTTP 429 is immediately raised as
        :class:`~app.utils.errors.DriveRateLimitError`.  HTTP 401/403 triggers
        a single token refresh attempt; if the retry also fails the error is
        raised as :class:`~app.utils.errors.TokenRefreshError`.

        Args:
            call: A zero-argument callable wrapping a Drive API ``.execute()``
                call.  Must be a lambda (new closure per retry so pagination
                tokens are captured correctly).
            job: The scan job providing source context for error messages.

        Returns:
            The API response dict on success.

        Raises:
            DriveRateLimitError: On HTTP 429.
            TokenRefreshError: On persistent auth failure after one refresh.
            FileDiscoveryError: On other HTTP errors or network exhaustion.
        """
        source_id = str(job.source_id)
        last_exc: Exception | None = None

        for attempt in range(1, _MAX_NETWORK_RETRIES + 1):
            try:
                loop = asyncio.get_event_loop()
                return await loop.run_in_executor(None, call)
            except HttpError as exc:
                status = exc.resp.status

                if status == 429:
                    raise DriveRateLimitError(source_id, str(exc)) from exc

                if status in (401, 403):
                    if attempt == 1:
                        # Attempt one token refresh then retry
                        logger.warning(
                            "drive_auth_error_attempting_token_refresh",
                            source_id=source_id,
                            status=status,
                            attempt=attempt,
                        )
                        try:
                            await self._ensure_valid_credentials()
                            # Rebuild service with refreshed credentials
                            self._service = build(
                                "drive", "v3",
                                credentials=self._credentials,
                                cache_discovery=False,
                            )
                            continue
                        except TokenRefreshError:
                            raise
                    raise TokenRefreshError(
                        source_id,
                        f"Auth still failing after token refresh (HTTP {status})",
                    ) from exc

                last_exc = exc
                logger.warning(
                    "drive_api_error_retrying",
                    source_id=source_id,
                    status=status,
                    attempt=attempt,
                    max_retries=_MAX_NETWORK_RETRIES,
                    error=str(exc),
                )

            except Exception as exc:
                last_exc = exc
                logger.warning(
                    "drive_network_error_retrying",
                    source_id=source_id,
                    attempt=attempt,
                    max_retries=_MAX_NETWORK_RETRIES,
                    error=str(exc),
                )

            if attempt < _MAX_NETWORK_RETRIES:
                backoff = _INITIAL_BACKOFF_SECONDS * (2 ** (attempt - 1))
                logger.info(
                    "drive_api_backoff",
                    source_id=source_id,
                    backoff_seconds=backoff,
                )
                await asyncio.sleep(backoff)

        raise FileDiscoveryError(
            source_id,
            f"Drive API call failed after {_MAX_NETWORK_RETRIES} retries: {last_exc}",
            retryable=True,
        ) from last_exc

    def _item_to_message(
        self,
        item: dict,
        job: ScanJobMessage,
    ) -> FileDiscoveredMessage | None:
        """Convert a Drive file item dict to a :class:`FileDiscoveredMessage`.

        Returns ``None`` for Google Workspace documents (they need a separate
        export flow not yet implemented).

        Args:
            item: Raw Drive API file resource dict.
            job: The scan job providing source/user UUIDs.

        Returns:
            A populated :class:`FileDiscoveredMessage`, or ``None`` if the
            file should be skipped.
        """
        mime_type = item.get("mimeType", "application/octet-stream")

        # Skip Google Workspace documents (Docs, Sheets, Slides …)
        if mime_type.startswith(_GAPPS_PREFIX):
            return None

        modified_raw = item.get("modifiedTime")
        last_modified: datetime | None = None
        if modified_raw:
            last_modified = datetime.fromisoformat(
                modified_raw.replace("Z", "+00:00")
            )

        return FileDiscoveredMessage(
            scan_job_id=job.scan_job_id,
            source_id=job.source_id,
            user_id=job.user_id,
            # Drive has no filesystem path; use file ID as the stable external reference
            file_path=item["id"],
            external_id=item["id"],
            original_filename=item["name"],
            mime_type=mime_type,
            file_size_bytes=int(item.get("size", 0)) if item.get("size") else None,
            last_modified=last_modified,
            external_modified_at=last_modified,
            checksum_sha256=None,  # Not available from Drive listing API
            source_type=SourceType.GOOGLE_DRIVE,
            source_metadata={
                "external_id": item["id"],
                "web_view_link": item.get("webViewLink"),
                "parents": item.get("parents", []),
            },
        )

    # ------------------------------------------------------------------
    # Token decryption (matches NestJS TokenEncryptionService)
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
