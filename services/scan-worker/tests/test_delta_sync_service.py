"""Unit tests for DeltaSyncService.

Covers:
- get/set/delete page token happy paths
- get/set last_sync happy paths
- graceful degradation when Redis is unavailable (all methods must not raise)
"""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.delta_sync_service import DeltaSyncService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_service() -> tuple[DeltaSyncService, MagicMock]:
    """Return a (service, mock_redis) pair with Redis client pre-wired."""
    svc = DeltaSyncService()
    mock_redis = MagicMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.setex = AsyncMock()
    mock_redis.delete = AsyncMock()
    svc._redis = mock_redis
    return svc, mock_redis


# ---------------------------------------------------------------------------
# get_page_token
# ---------------------------------------------------------------------------


class TestGetPageToken:
    @pytest.mark.asyncio
    async def test_returns_stored_token(self):
        svc, mock_redis = _make_service()
        mock_redis.get = AsyncMock(return_value="page_token_abc")

        result = await svc.get_page_token("source-uuid-1")

        assert result == "page_token_abc"
        mock_redis.get.assert_awaited_once_with("kms:scan:drive_page_token:source-uuid-1")

    @pytest.mark.asyncio
    async def test_returns_none_when_not_stored(self):
        svc, mock_redis = _make_service()
        mock_redis.get = AsyncMock(return_value=None)

        result = await svc.get_page_token("source-uuid-1")

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_redis_error(self):
        svc, mock_redis = _make_service()
        mock_redis.get = AsyncMock(side_effect=ConnectionError("redis down"))

        result = await svc.get_page_token("source-uuid-1")

        assert result is None  # non-fatal degradation


# ---------------------------------------------------------------------------
# set_page_token
# ---------------------------------------------------------------------------


class TestSetPageToken:
    @pytest.mark.asyncio
    async def test_calls_setex_with_correct_key_and_ttl(self):
        svc, mock_redis = _make_service()

        await svc.set_page_token("source-uuid-2", "new_page_token_xyz")

        mock_redis.setex.assert_awaited_once()
        call_args = mock_redis.setex.call_args[0]
        assert call_args[0] == "kms:scan:drive_page_token:source-uuid-2"
        assert call_args[2] == "new_page_token_xyz"
        # TTL should be 30 days
        assert call_args[1] == 30 * 24 * 3600

    @pytest.mark.asyncio
    async def test_does_not_raise_on_redis_error(self):
        svc, mock_redis = _make_service()
        mock_redis.setex = AsyncMock(side_effect=ConnectionError("redis down"))

        # Should not raise
        await svc.set_page_token("source-uuid-2", "token")


# ---------------------------------------------------------------------------
# delete_page_token
# ---------------------------------------------------------------------------


class TestDeletePageToken:
    @pytest.mark.asyncio
    async def test_calls_delete_with_correct_key(self):
        svc, mock_redis = _make_service()

        await svc.delete_page_token("source-uuid-3")

        mock_redis.delete.assert_awaited_once_with(
            "kms:scan:drive_page_token:source-uuid-3"
        )

    @pytest.mark.asyncio
    async def test_does_not_raise_on_redis_error(self):
        svc, mock_redis = _make_service()
        mock_redis.delete = AsyncMock(side_effect=ConnectionError("redis down"))

        # Should not raise
        await svc.delete_page_token("source-uuid-3")


# ---------------------------------------------------------------------------
# get_last_sync
# ---------------------------------------------------------------------------


class TestGetLastSync:
    @pytest.mark.asyncio
    async def test_returns_parsed_datetime(self):
        ts = datetime(2025, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
        svc, mock_redis = _make_service()
        mock_redis.get = AsyncMock(return_value=ts.isoformat())

        result = await svc.get_last_sync("source-uuid-4")

        assert result == ts

    @pytest.mark.asyncio
    async def test_returns_none_when_not_stored(self):
        svc, mock_redis = _make_service()
        mock_redis.get = AsyncMock(return_value=None)

        result = await svc.get_last_sync("source-uuid-4")

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_redis_error(self):
        svc, mock_redis = _make_service()
        mock_redis.get = AsyncMock(side_effect=ConnectionError("redis down"))

        result = await svc.get_last_sync("source-uuid-4")

        assert result is None


# ---------------------------------------------------------------------------
# set_last_sync
# ---------------------------------------------------------------------------


class TestSetLastSync:
    @pytest.mark.asyncio
    async def test_stores_provided_timestamp(self):
        svc, mock_redis = _make_service()
        ts = datetime(2025, 6, 15, 8, 30, 0, tzinfo=timezone.utc)

        await svc.set_last_sync("source-uuid-5", ts)

        mock_redis.setex.assert_awaited_once()
        call_args = mock_redis.setex.call_args[0]
        assert call_args[0] == "kms:scan:last_sync:source-uuid-5"
        assert ts.isoformat() in call_args[2]

    @pytest.mark.asyncio
    async def test_stores_current_time_when_no_ts_given(self):
        svc, mock_redis = _make_service()

        await svc.set_last_sync("source-uuid-5")

        mock_redis.setex.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_does_not_raise_on_redis_error(self):
        svc, mock_redis = _make_service()
        mock_redis.setex = AsyncMock(side_effect=ConnectionError("redis down"))

        # Should not raise
        await svc.set_last_sync("source-uuid-5")
