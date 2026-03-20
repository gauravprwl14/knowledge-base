"""
Unit tests for ProgressService.
Redis calls are mocked; no live Redis needed.
"""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.progress_service import ProgressService


@pytest.fixture
def mock_redis():
    r = AsyncMock()
    return r


@pytest.fixture
def svc(mock_redis):
    service = ProgressService()
    service._redis = mock_redis
    return service


@pytest.mark.asyncio
async def test_set_progress_writes_json(svc, mock_redis):
    await svc.set_progress("src-1", "RUNNING", files_found=10, files_added=8)

    mock_redis.setex.assert_awaited_once()
    key, ttl, payload = mock_redis.setex.call_args.args
    assert key == "kms:scan:progress:src-1"
    assert ttl == 3600
    data = json.loads(payload)
    # Status is normalised to lower-case by the new ProgressService API
    assert data["status"] == "running"
    assert data["filesFound"] == 10
    assert data["filesAdded"] == 8
    assert data["error"] is None


@pytest.mark.asyncio
async def test_set_progress_with_error(svc, mock_redis):
    await svc.set_progress("src-2", "FAILED", error="Drive access revoked")

    _, _, payload = mock_redis.setex.call_args.args
    data = json.loads(payload)
    # Status is normalised to lower-case by the new ProgressService API
    assert data["status"] == "failed"
    assert data["error"] == "Drive access revoked"


@pytest.mark.asyncio
async def test_get_progress_returns_none_when_missing(svc, mock_redis):
    mock_redis.get.return_value = None
    result = await svc.get_progress("src-x")
    assert result is None


@pytest.mark.asyncio
async def test_get_progress_returns_parsed_dict(svc, mock_redis):
    payload = json.dumps({"status": "COMPLETED", "filesFound": 5, "filesAdded": 5, "error": None})
    mock_redis.get.return_value = payload
    result = await svc.get_progress("src-y")
    assert result["status"] == "COMPLETED"
    assert result["filesFound"] == 5


@pytest.mark.asyncio
async def test_delete_progress_calls_delete(svc, mock_redis):
    await svc.delete_progress("src-z")
    mock_redis.delete.assert_awaited_once_with("kms:scan:progress:src-z")


@pytest.mark.asyncio
async def test_set_progress_non_fatal_on_redis_error(svc, mock_redis):
    """ProgressService must not raise even if Redis is down."""
    mock_redis.setex.side_effect = ConnectionError("redis down")
    # Should not raise
    await svc.set_progress("src-err", "RUNNING")
