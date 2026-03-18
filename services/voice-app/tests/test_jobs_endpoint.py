"""Tests for POST/GET /api/v1/jobs endpoints.

All database operations are mocked so no real DB connection is required.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.models.job import TranscriptionJob

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_NOW = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
_JOB_ID = uuid.uuid4()
_USER_ID = uuid.uuid4()


def _make_job(**overrides) -> TranscriptionJob:
    """Create a test TranscriptionJob with sensible defaults."""
    defaults = dict(
        id=_JOB_ID,
        user_id=_USER_ID,
        source_id=None,
        file_path="/vault/audio/meeting.mp3",
        original_filename="meeting.mp3",
        mime_type="audio/mpeg",
        status="PENDING",
        transcript=None,
        language=None,
        duration_seconds=None,
        error_msg=None,
        model_used="base",
        created_at=_NOW,
        updated_at=_NOW,
        completed_at=None,
    )
    defaults.update(overrides)
    return TranscriptionJob(**defaults)


@pytest.fixture()
def client():
    """Return a TestClient with DB pool and consumer mocked out."""
    with (
        patch("app.main.asyncpg.create_pool", new_callable=AsyncMock),
        patch("app.main.job_store.set_pool"),
        patch("app.workers.job_consumer.run_consumer", new_callable=AsyncMock),
        patch("asyncio.create_task"),
    ):
        # Import app after patches are applied so lifespan doesn't actually run
        from app.main import app

        with TestClient(app, raise_server_exceptions=False) as c:
            yield c


# ---------------------------------------------------------------------------
# POST /api/v1/jobs
# ---------------------------------------------------------------------------


def test_create_job_returns_201_with_job_id(client: TestClient) -> None:
    """POST /jobs with valid body returns 201 and a job_id UUID."""
    job = _make_job()

    with (
        patch(
            "app.api.v1.endpoints.jobs.job_store.create_job",
            new_callable=AsyncMock,
            return_value=_JOB_ID,
        ),
        patch(
            "app.api.v1.endpoints.jobs.job_store.get_job",
            new_callable=AsyncMock,
            return_value=job,
        ),
    ):
        resp = client.post(
            "/api/v1/jobs",
            json={
                "file_path": "/vault/audio/meeting.mp3",
                "original_filename": "meeting.mp3",
                "mime_type": "audio/mpeg",
                "user_id": str(_USER_ID),
            },
        )

    assert resp.status_code == 201
    data = resp.json()
    assert data["job_id"] == str(_JOB_ID)
    assert data["status"] == "PENDING"
    assert "created_at" in data


def test_create_job_missing_required_fields_returns_422(client: TestClient) -> None:
    """POST /jobs without required fields returns 422 Unprocessable Entity."""
    resp = client.post("/api/v1/jobs", json={"file_path": "/vault/audio/meeting.mp3"})
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/v1/jobs/{job_id}
# ---------------------------------------------------------------------------


def test_get_job_returns_200_for_existing_job(client: TestClient) -> None:
    """GET /jobs/{job_id} returns 200 and the full job object."""
    job = _make_job(status="COMPLETED", transcript="Hello world", language="en")

    with patch(
        "app.api.v1.endpoints.jobs.job_store.get_job",
        new_callable=AsyncMock,
        return_value=job,
    ):
        resp = client.get(f"/api/v1/jobs/{_JOB_ID}")

    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == str(_JOB_ID)
    assert data["status"] == "COMPLETED"
    assert data["transcript"] == "Hello world"


def test_get_job_returns_404_for_unknown_id(client: TestClient) -> None:
    """GET /jobs/{job_id} returns 404 when no job exists with that UUID."""
    unknown_id = uuid.uuid4()

    with patch(
        "app.api.v1.endpoints.jobs.job_store.get_job",
        new_callable=AsyncMock,
        return_value=None,
    ):
        resp = client.get(f"/api/v1/jobs/{unknown_id}")

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/v1/jobs
# ---------------------------------------------------------------------------


def test_list_jobs_requires_user_id(client: TestClient) -> None:
    """GET /jobs without user_id query param returns 422."""
    resp = client.get("/api/v1/jobs")
    assert resp.status_code == 422


def test_list_jobs_returns_paginated_results(client: TestClient) -> None:
    """GET /jobs?user_id=... returns jobs list and total count."""
    jobs = [_make_job(), _make_job(id=uuid.uuid4())]

    with patch(
        "app.api.v1.endpoints.jobs.job_store.list_jobs",
        new_callable=AsyncMock,
        return_value=(jobs, 2),
    ):
        resp = client.get(f"/api/v1/jobs?user_id={_USER_ID}")

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["jobs"]) == 2
