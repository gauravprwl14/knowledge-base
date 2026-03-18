"""Tests for job_store asyncpg data access layer.

All asyncpg calls are mocked — no real database connection is required.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import job_store

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_NOW = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
_JOB_ID = uuid.uuid4()
_USER_ID = uuid.uuid4()


def _make_record(**overrides) -> dict:
    """Create a dict that mimics an asyncpg Record for voice_jobs."""
    row = {
        "id": _JOB_ID,
        "user_id": _USER_ID,
        "source_id": None,
        "file_path": "/vault/audio/test.mp3",
        "original_filename": "test.mp3",
        "mime_type": "audio/mpeg",
        "status": "PENDING",
        "transcript": None,
        "language": None,
        "duration_seconds": None,
        "error_msg": None,
        "model_used": "base",
        "created_at": _NOW,
        "updated_at": _NOW,
        "completed_at": None,
    }
    row.update(overrides)
    record = MagicMock()
    record.__getitem__ = lambda self, key: row[key]
    return record


def _mock_pool(fetchrow_return=None, fetch_return=None, execute_return=None) -> MagicMock:
    """Create a mocked asyncpg Pool."""
    pool = MagicMock()
    pool.fetchrow = AsyncMock(return_value=fetchrow_return)
    pool.fetch = AsyncMock(return_value=fetch_return or [])
    pool.execute = AsyncMock(return_value=execute_return)
    return pool


# ---------------------------------------------------------------------------
# test_create_job_returns_id
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_job_returns_id() -> None:
    """create_job() inserts a row and returns the new job UUID."""
    returned_record = MagicMock()
    returned_record.__getitem__ = lambda self, key: _JOB_ID if key == "id" else None

    pool = _mock_pool(fetchrow_return=returned_record)
    job_store.set_pool(pool)

    result = await job_store.create_job(
        user_id=_USER_ID,
        source_id=None,
        file_path="/vault/audio/test.mp3",
        original_filename="test.mp3",
        mime_type="audio/mpeg",
        language=None,
        model="base",
    )

    assert result == _JOB_ID
    pool.fetchrow.assert_awaited_once()


# ---------------------------------------------------------------------------
# test_get_job_returns_none_for_unknown_id
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_job_returns_none_for_unknown_id() -> None:
    """get_job() returns None when the DB returns no row."""
    pool = _mock_pool(fetchrow_return=None)
    job_store.set_pool(pool)

    result = await job_store.get_job(uuid.uuid4())

    assert result is None


# ---------------------------------------------------------------------------
# test_update_job_status_sets_completed_at_for_completed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_job_status_sets_completed_at_for_completed() -> None:
    """update_job_status() passes a non-None completed_at when status is COMPLETED."""
    pool = _mock_pool()
    job_store.set_pool(pool)

    await job_store.update_job_status(
        _JOB_ID,
        "COMPLETED",
        transcript="Hello world",
        language="en",
        duration_seconds=5.0,
    )

    pool.execute.assert_awaited_once()
    call_args = pool.execute.call_args

    # The 7th positional argument (index 6) is completed_at
    positional_args = call_args[0]
    # SQL query is first arg; positional params follow
    # status=$1, transcript=$2, language=$3, duration=$4, error=$5, updated_at=$6, completed_at=$7, id=$8
    completed_at_value = positional_args[7]  # index 7 = $7 param
    assert completed_at_value is not None, "completed_at should be set for COMPLETED status"


@pytest.mark.asyncio
async def test_update_job_status_does_not_set_completed_at_for_processing() -> None:
    """update_job_status() passes None for completed_at when status is PROCESSING."""
    pool = _mock_pool()
    job_store.set_pool(pool)

    await job_store.update_job_status(_JOB_ID, "PROCESSING")

    call_args = pool.execute.call_args
    positional_args = call_args[0]
    completed_at_value = positional_args[7]
    assert completed_at_value is None, "completed_at should NOT be set for PROCESSING status"
