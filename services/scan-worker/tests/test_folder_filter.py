"""
Unit tests for GoogleDriveConnector folder-filter and extension-filter helpers.

Covers:
- _build_drive_query: folder ID conditions when syncFolderIds is set
- _build_drive_query: no parent filter when syncFolderIds is empty / absent
- _should_include_file: includeExtensions allowlist
- _should_include_file: excludeExtensions blocklist
- _should_include_file: combined include + exclude
- _should_include_file: no filter means all files pass
- _list_full: extension-filtered files are skipped (integration-style unit test)
"""
from typing import AsyncIterator
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.connectors.google_drive import GoogleDriveConnector
from app.models.messages import ScanJobMessage, ScanType, SourceType


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_connector() -> GoogleDriveConnector:
    """Return a connector instance with a dummy connected service."""
    connector = GoogleDriveConnector()
    connector._service = MagicMock()
    connector._source_id = "test-source"
    return connector


def _make_job(config: dict | None = None) -> ScanJobMessage:
    """Build a minimal ScanJobMessage with optional config override."""
    return ScanJobMessage(
        scan_job_id=uuid4(),
        source_id=uuid4(),
        source_type=SourceType.GOOGLE_DRIVE,
        user_id=uuid4(),
        scan_type=ScanType.FULL,
        config=config or {},
    )


def _make_file_item(
    file_id: str = "file-abc",
    name: str = "document.pdf",
    mime_type: str = "application/pdf",
    size: str = "1024",
) -> dict:
    return {
        "id": file_id,
        "name": name,
        "mimeType": mime_type,
        "size": size,
        "webViewLink": f"https://drive.google.com/file/d/{file_id}/view",
        "modifiedTime": "2025-01-15T10:00:00Z",
        "parents": ["root"],
    }


# ---------------------------------------------------------------------------
# _build_drive_query tests
# ---------------------------------------------------------------------------

class TestBuildDriveQuery:
    """Tests for GoogleDriveConnector._build_drive_query."""

    def test_build_drive_query_with_single_folder_id(self):
        """Query includes parent condition for a single syncFolderIds entry."""
        connector = _make_connector()
        config = {"syncFolderIds": ["folder-1"]}
        query = connector._build_drive_query(config)

        assert "trashed=false" in query
        assert "'folder-1' in parents" in query

    def test_build_drive_query_with_multiple_folder_ids(self):
        """Query includes parent conditions for all syncFolderIds."""
        connector = _make_connector()
        config = {"syncFolderIds": ["folder-1", "folder-2"]}
        query = connector._build_drive_query(config)

        assert "trashed=false" in query
        assert "'folder-1' in parents" in query
        assert "'folder-2' in parents" in query

    def test_build_drive_query_folder_ids_joined_with_or(self):
        """Multiple folder conditions are joined with ' or '."""
        connector = _make_connector()
        config = {"syncFolderIds": ["folder-1", "folder-2"]}
        query = connector._build_drive_query(config)

        # Both parent conditions should be inside a combined clause
        assert "or" in query

    def test_build_drive_query_without_folder_ids_scans_all(self):
        """Empty syncFolderIds means no parent filter — full Drive scan."""
        connector = _make_connector()
        config = {"syncFolderIds": []}
        query = connector._build_drive_query(config)

        assert "in parents" not in query
        assert "trashed=false" in query

    def test_build_drive_query_with_no_sync_folder_ids_key(self):
        """Absent syncFolderIds key behaves the same as empty list."""
        connector = _make_connector()
        config = {}
        query = connector._build_drive_query(config)

        assert "in parents" not in query
        assert "trashed=false" in query

    def test_build_drive_query_folders_wrapped_in_parentheses(self):
        """Multi-folder OR clause is wrapped in parentheses for correct precedence."""
        connector = _make_connector()
        config = {"syncFolderIds": ["folder-1", "folder-2"]}
        query = connector._build_drive_query(config)

        # The OR clause should be parenthesised: trashed=false and (... or ...)
        assert "(" in query and ")" in query


# ---------------------------------------------------------------------------
# _should_include_file tests
# ---------------------------------------------------------------------------

class TestShouldIncludeFile:
    """Tests for GoogleDriveConnector._should_include_file."""

    def test_no_filter_includes_all_files(self):
        """Empty config — every file passes."""
        connector = _make_connector()
        assert connector._should_include_file("report.pdf", "application/pdf", {}) is True
        assert connector._should_include_file("data.xlsx", "application/vnd.ms-excel", {}) is True

    def test_empty_include_and_exclude_lists_include_all(self):
        """Explicitly empty lists — every file still passes."""
        connector = _make_connector()
        config = {"includeExtensions": [], "excludeExtensions": []}
        assert connector._should_include_file("report.pdf", "application/pdf", config) is True

    def test_include_extension_filter_allows_matching_file(self):
        """File whose extension is in includeExtensions is included."""
        connector = _make_connector()
        config = {"includeExtensions": [".pdf", ".docx"]}
        assert connector._should_include_file("report.pdf", "application/pdf", config) is True

    def test_include_extension_filter_blocks_non_matching_file(self):
        """File whose extension is NOT in includeExtensions is excluded."""
        connector = _make_connector()
        config = {"includeExtensions": [".pdf"]}
        assert connector._should_include_file("archive.zip", "application/zip", config) is False

    def test_include_extension_filter_case_insensitive(self):
        """Extension comparison is case-insensitive."""
        connector = _make_connector()
        config = {"includeExtensions": [".PDF"]}
        assert connector._should_include_file("REPORT.pdf", "application/pdf", config) is True

    def test_exclude_extension_filter_blocks_matching_file(self):
        """File whose extension is in excludeExtensions is excluded."""
        connector = _make_connector()
        config = {"excludeExtensions": [".tmp", ".log"]}
        assert connector._should_include_file("debug.log", "text/plain", config) is False

    def test_exclude_extension_filter_allows_non_matching_file(self):
        """File whose extension is NOT in excludeExtensions is included."""
        connector = _make_connector()
        config = {"excludeExtensions": [".tmp"]}
        assert connector._should_include_file("report.pdf", "application/pdf", config) is True

    def test_exclude_extension_without_dot_prefix(self):
        """Extension without dot prefix in config is handled correctly."""
        connector = _make_connector()
        config = {"excludeExtensions": ["tmp", "log"]}
        # Extension derived from filename will have dot, config without — should still match
        assert connector._should_include_file("debug.log", "text/plain", config) is False

    def test_include_and_exclude_combined(self):
        """includeExtensions allowlist is applied first, then excludeExtensions blocklist."""
        connector = _make_connector()
        # Include .pdf and .docx, but exclude .docx
        config = {"includeExtensions": [".pdf", ".docx"], "excludeExtensions": [".docx"]}
        assert connector._should_include_file("report.pdf", "application/pdf", config) is True
        assert connector._should_include_file("letter.docx", "application/vnd.openxmlformats...", config) is False

    def test_file_without_extension(self):
        """File with no extension and includeExtensions set is excluded."""
        connector = _make_connector()
        config = {"includeExtensions": [".pdf"]}
        assert connector._should_include_file("Makefile", "text/plain", config) is False

    def test_file_without_extension_no_filter(self):
        """File with no extension passes when no filters are configured."""
        connector = _make_connector()
        assert connector._should_include_file("Makefile", "text/plain", {}) is True


# ---------------------------------------------------------------------------
# _list_full integration-style unit test: filters applied during pagination
# ---------------------------------------------------------------------------

class TestListFullWithFilters:
    """Integration-style tests verifying that filters are applied inside _list_full."""

    @pytest.mark.asyncio
    @patch("app.connectors.google_drive.GoogleDriveConnector._execute_with_retry")
    async def test_extension_filter_skips_excluded_files(self, mock_retry):
        """Files with excluded extension are not yielded by _list_full."""
        connector = _make_connector()
        mock_retry.return_value = {
            "files": [
                _make_file_item(file_id="f1", name="report.pdf"),
                _make_file_item(file_id="f2", name="cache.tmp"),
                _make_file_item(file_id="f3", name="notes.docx"),
            ],
            # No nextPageToken — single page
        }

        job = _make_job(config={"excludeExtensions": [".tmp"]})
        results = []
        async for msg in connector._list_full(job):
            results.append(msg.original_filename)

        assert "report.pdf" in results
        assert "notes.docx" in results
        assert "cache.tmp" not in results

    @pytest.mark.asyncio
    @patch("app.connectors.google_drive.GoogleDriveConnector._execute_with_retry")
    async def test_include_extension_filter_only_yields_matching(self, mock_retry):
        """Only files with matching includeExtensions are yielded."""
        connector = _make_connector()
        mock_retry.return_value = {
            "files": [
                _make_file_item(file_id="f1", name="report.pdf"),
                _make_file_item(file_id="f2", name="image.png"),
                _make_file_item(file_id="f3", name="notes.docx"),
            ],
        }

        job = _make_job(config={"includeExtensions": [".pdf"]})
        results = []
        async for msg in connector._list_full(job):
            results.append(msg.original_filename)

        assert results == ["report.pdf"]

    @pytest.mark.asyncio
    @patch("app.connectors.google_drive.GoogleDriveConnector._execute_with_retry")
    async def test_no_filter_yields_all_non_gapps_files(self, mock_retry):
        """Without filters, all non-GApps files are yielded (existing behaviour)."""
        connector = _make_connector()
        mock_retry.return_value = {
            "files": [
                _make_file_item(file_id="f1", name="report.pdf"),
                _make_file_item(file_id="f2", name="notes.docx"),
                {
                    "id": "gapps-1",
                    "name": "Spreadsheet",
                    "mimeType": "application/vnd.google-apps.spreadsheet",
                    "parents": ["root"],
                },
            ],
        }

        job = _make_job(config={})
        results = []
        async for msg in connector._list_full(job):
            results.append(msg.original_filename)

        assert "report.pdf" in results
        assert "notes.docx" in results
        assert "Spreadsheet" not in results  # GApps are always skipped by _item_to_message
