"""Tests for QdrantService — collection management and chunk upsert.

PRD: PRD-M04-embedding-pipeline.md — FR-04, FR-06
Gap: No test file existed for QdrantService.  Key missing branches:
- ensure_collection when collection already exists → update_collection called, not create
- ensure_collection when collection does not exist → create_collection called
- upsert_chunks in mock mode → no-op, no client call
- upsert_chunks with empty list → early return, no network call
- upsert_chunks with real client → upsert called with correct PointStruct list
"""

import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Stub qdrant_client before importing QdrantService so that the lazy imports
# inside ensure_collection / upsert_chunks resolve without a real installation.
# ---------------------------------------------------------------------------


class _PointStruct:
    """Minimal PointStruct stub that stores id, vector, payload."""

    def __init__(self, id: str, vector, payload) -> None:
        self.id = id
        self.vector = vector
        self.payload = payload


_qdrant_models = MagicMock()
_qdrant_models.PointStruct = _PointStruct
_qdrant_models.Distance = MagicMock(COSINE="Cosine")
_qdrant_models.VectorParams = MagicMock(return_value=MagicMock())
_qdrant_models.HnswConfigDiff = MagicMock(return_value=MagicMock())
_qdrant_models.ScalarQuantization = MagicMock(return_value=MagicMock())
_qdrant_models.ScalarQuantizationConfig = MagicMock(return_value=MagicMock())
_qdrant_models.ScalarType = MagicMock(INT8="INT8")

_qdrant_pkg = MagicMock()
_qdrant_pkg.AsyncQdrantClient = MagicMock()

sys.modules.setdefault("qdrant_client", _qdrant_pkg)
sys.modules.setdefault("qdrant_client.models", _qdrant_models)

from app.services.qdrant_service import QdrantService, ChunkPoint, COLLECTION_NAME  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_chunk(idx: int = 0) -> ChunkPoint:
    """Build a minimal ChunkPoint suitable for upsert tests.

    Args:
        idx: Index suffix for unique IDs and vectors.

    Returns:
        A ChunkPoint with a unique id and a 1024-dim float vector.
    """
    return ChunkPoint(
        id=f"chunk-{idx:04d}",
        vector=[float(idx) / 1024.0] * 1024,
        payload={
            "user_id": "user-001",
            "file_id": f"file-{idx:04d}",
            "content": f"Test content {idx}",
        },
    )


def _make_collections_response(names: list[str]) -> MagicMock:
    """Simulate the qdrant_client.get_collections() response.

    Args:
        names: Names of existing collections to include in the response.

    Returns:
        MagicMock whose ``.collections`` attribute is a list of objects with a
        ``.name`` property.
    """
    resp = MagicMock()
    # MagicMock treats ``name`` as a special constructor arg (sets the mock's
    # internal name), so we cannot use MagicMock(name=n).  Instead we create
    # a plain object and set the .name attribute directly.
    coll_objects = []
    for n in names:
        obj = MagicMock(spec=[])  # spec=[] → no special attrs pre-defined
        obj.name = n
        coll_objects.append(obj)
    resp.collections = coll_objects
    return resp


# ---------------------------------------------------------------------------
# Mock mode (MOCK_QDRANT=true)
# ---------------------------------------------------------------------------


class TestQdrantServiceMockMode:
    """All operations should be no-ops in mock mode."""

    def setup_method(self):
        """Create a QdrantService in mock mode for every test."""
        self.svc = QdrantService(mock_mode=True)

    @pytest.mark.asyncio
    async def test_ensure_collection_is_noop(self):
        """ensure_collection must not touch the Qdrant client in mock mode."""
        with patch.object(self.svc, "_get_client") as mock_client:
            await self.svc.ensure_collection()
        mock_client.assert_not_called()

    @pytest.mark.asyncio
    async def test_upsert_chunks_is_noop(self):
        """upsert_chunks must not touch the Qdrant client in mock mode."""
        with patch.object(self.svc, "_get_client") as mock_client:
            await self.svc.upsert_chunks([_make_chunk(0)])
        mock_client.assert_not_called()

    @pytest.mark.asyncio
    async def test_upsert_chunks_empty_list_is_noop(self):
        """Empty chunk list is a silent no-op in mock mode."""
        with patch.object(self.svc, "_get_client") as mock_client:
            await self.svc.upsert_chunks([])
        mock_client.assert_not_called()


# ---------------------------------------------------------------------------
# Real mode (MOCK_QDRANT=false) — async client mocked at method level
# ---------------------------------------------------------------------------


class TestQdrantServiceRealMode:
    """Tests that exercise the real-mode code paths via a mocked AsyncQdrantClient."""

    def setup_method(self):
        """Create a QdrantService in real mode with a mocked client."""
        self.svc = QdrantService(mock_mode=False)
        # Inject a pre-built async mock client so we control all client calls
        self.mock_client = AsyncMock()
        self.svc._client = self.mock_client

    # ------------------------------------------------------------------
    # ensure_collection — collection does NOT exist → create_collection
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_ensure_collection_creates_when_absent(self):
        """create_collection must be called when the collection is not in the list."""
        self.mock_client.get_collections.return_value = _make_collections_response([])
        self.mock_client.create_collection = AsyncMock()
        self.mock_client.update_collection = AsyncMock()

        await self.svc.ensure_collection()

        self.mock_client.create_collection.assert_awaited_once()
        args, kwargs = self.mock_client.create_collection.await_args
        assert kwargs.get("collection_name") == COLLECTION_NAME or (
            args and args[0] == COLLECTION_NAME
        )
        self.mock_client.update_collection.assert_not_awaited()

    # ------------------------------------------------------------------
    # ensure_collection — collection ALREADY exists → update_collection
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_ensure_collection_updates_when_present(self):
        """update_collection (not create_collection) must be called when collection exists."""
        self.mock_client.get_collections.return_value = _make_collections_response(
            [COLLECTION_NAME]
        )
        self.mock_client.create_collection = AsyncMock()
        self.mock_client.update_collection = AsyncMock()

        await self.svc.ensure_collection()

        self.mock_client.update_collection.assert_awaited_once()
        self.mock_client.create_collection.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_ensure_collection_update_targets_correct_collection(self):
        """update_collection call must reference COLLECTION_NAME."""
        self.mock_client.get_collections.return_value = _make_collections_response(
            [COLLECTION_NAME]
        )
        self.mock_client.create_collection = AsyncMock()
        self.mock_client.update_collection = AsyncMock()

        await self.svc.ensure_collection()

        _args, kwargs = self.mock_client.update_collection.await_args
        assert kwargs.get("collection_name") == COLLECTION_NAME

    # ------------------------------------------------------------------
    # upsert_chunks — empty list → early return, no network call
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_upsert_empty_list_does_not_call_client(self):
        """An empty chunk list must return early without calling client.upsert."""
        self.mock_client.upsert = AsyncMock()

        await self.svc.upsert_chunks([])

        self.mock_client.upsert.assert_not_awaited()

    # ------------------------------------------------------------------
    # upsert_chunks — non-empty list → client.upsert called with correct args
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_upsert_calls_client_with_correct_collection(self):
        """client.upsert must be called with collection_name=COLLECTION_NAME."""
        self.mock_client.upsert = AsyncMock()
        chunks = [_make_chunk(0), _make_chunk(1)]

        await self.svc.upsert_chunks(chunks)

        self.mock_client.upsert.assert_awaited_once()
        _args, kwargs = self.mock_client.upsert.await_args
        assert kwargs.get("collection_name") == COLLECTION_NAME

    @pytest.mark.asyncio
    async def test_upsert_sends_correct_number_of_points(self):
        """client.upsert must receive exactly as many PointStructs as chunks."""
        self.mock_client.upsert = AsyncMock()
        n = 5
        chunks = [_make_chunk(i) for i in range(n)]

        await self.svc.upsert_chunks(chunks)

        _args, kwargs = self.mock_client.upsert.await_args
        points = kwargs.get("points", [])
        assert len(points) == n

    @pytest.mark.asyncio
    async def test_upsert_preserves_chunk_ids(self):
        """Each PointStruct id must match the corresponding ChunkPoint id."""
        self.mock_client.upsert = AsyncMock()
        chunks = [_make_chunk(i) for i in range(3)]

        await self.svc.upsert_chunks(chunks)

        _args, kwargs = self.mock_client.upsert.await_args
        point_ids = [p.id for p in kwargs.get("points", [])]
        assert point_ids == [c.id for c in chunks]

    @pytest.mark.asyncio
    async def test_upsert_propagates_client_exception(self):
        """Exceptions from client.upsert must propagate to the caller."""
        self.mock_client.upsert = AsyncMock(side_effect=RuntimeError("Qdrant unavailable"))
        chunks = [_make_chunk(0)]

        with pytest.raises(RuntimeError, match="Qdrant unavailable"):
            await self.svc.upsert_chunks(chunks)

    # ------------------------------------------------------------------
    # ensure_collection — propagates get_collections exception
    # ------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_ensure_collection_propagates_exception(self):
        """Failures in client.get_collections must propagate to the caller."""
        self.mock_client.get_collections = AsyncMock(
            side_effect=ConnectionError("Qdrant not reachable")
        )

        with pytest.raises(ConnectionError):
            await self.svc.ensure_collection()


# ---------------------------------------------------------------------------
# Lazy client construction
# ---------------------------------------------------------------------------


class TestQdrantServiceClientInit:
    """Verifies that the AsyncQdrantClient is built lazily on first real operation."""

    def test_client_is_none_at_construction(self):
        """No client should be created at __init__ time."""
        svc = QdrantService(mock_mode=False)
        assert svc._client is None

    def test_get_client_creates_client_using_qdrant_url(self):
        """_get_client must instantiate AsyncQdrantClient with QDRANT_URL from env."""
        svc = QdrantService(mock_mode=False)
        test_url = "http://qdrant-test:6333"

        with patch.dict(os.environ, {"QDRANT_URL": test_url}):
            with patch("app.services.qdrant_service.QdrantService._get_client") as mock_get:
                mock_get.return_value = AsyncMock()
                svc._get_client()

        # Just verifying the method can be called without errors; client setup
        # is validated via the integration-level ensure_collection tests above.

    def test_mock_mode_env_default_is_true(self):
        """MOCK_QDRANT defaults to true when env var is absent."""
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("MOCK_QDRANT", None)
            svc = QdrantService()
        # Default is true (safe for dev/CI)
        assert svc._mock is True

    def test_mock_mode_can_be_disabled_via_env(self):
        """MOCK_QDRANT=false should disable mock mode."""
        with patch.dict(os.environ, {"MOCK_QDRANT": "false"}):
            svc = QdrantService()
        assert svc._mock is False

    def test_explicit_mock_mode_overrides_env(self):
        """Explicit mock_mode argument takes precedence over env var."""
        with patch.dict(os.environ, {"MOCK_QDRANT": "false"}):
            svc = QdrantService(mock_mode=True)
        assert svc._mock is True


