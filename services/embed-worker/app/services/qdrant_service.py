<<<<<<< HEAD
"""Qdrant vector store service for the embed-worker."""

from dataclasses import dataclass, field

import structlog

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

_VECTOR_SIZE = 1024  # BGE-M3 output dimension
=======
"""Qdrant vector store service — upserts chunk points with mock fallback.

When MOCK_QDRANT=true (env) or Qdrant is unreachable, all operations are
no-ops that emit warning logs.  This lets the pipeline run end-to-end in
dev without a running Qdrant instance.

Production: set MOCK_QDRANT=false and ensure Qdrant is reachable at QDRANT_URL.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Optional

import structlog

logger = structlog.get_logger(__name__)

# Collection name and vector config must match the search-api expectations.
COLLECTION_NAME = "kms_chunks"
VECTOR_SIZE = 1024     # BGE-M3 dense vector dimensions
DISTANCE = "Cosine"    # cosine similarity is the standard for semantic search
>>>>>>> feat/sprint2-embed-pipeline


@dataclass
class ChunkPoint:
<<<<<<< HEAD
    """A single chunk ready to be upserted into Qdrant.

    Attributes:
        id: Unique UUID string for this chunk (used as Qdrant point ID).
        vector: 1024-dimensional embedding from BGE-M3.
        payload: Metadata stored alongside the vector in Qdrant.
=======
    """A single vector point ready to be upserted into Qdrant.

    Attributes:
        id: UUID string used as the Qdrant point ID (must be unique per chunk).
        vector: 1024-dimensional dense embedding from BGE-M3.
        payload: Metadata stored alongside the vector for filtering and
            snippet retrieval (user_id, source_id, file_id, content, etc.).
>>>>>>> feat/sprint2-embed-pipeline
    """

    id: str
    vector: list[float]
    payload: dict = field(default_factory=dict)


class QdrantService:
<<<<<<< HEAD
    """Async Qdrant client wrapper for chunk vector storage.

    Manages collection lifecycle and batch upsert operations.
    The target collection is configured via ``settings.qdrant_collection``
    (default ``kms_chunks``) and uses Cosine distance at 1024 dimensions.
    """

    def __init__(self) -> None:
        self._client = None

    def _get_client(self):
        """Lazily initialise the Qdrant async client.

        Returns:
            An ``AsyncQdrantClient`` connected to ``settings.qdrant_url``.
        """
        if self._client is None:
            from qdrant_client import AsyncQdrantClient

            self._client = AsyncQdrantClient(url=settings.qdrant_url)
        return self._client

    async def ensure_collection(self) -> None:
        """Create the Qdrant collection if it does not already exist.

        Uses Cosine distance and the BGE-M3 vector size (1024).
        If the collection already exists the call is a no-op.
        """
        from qdrant_client.models import Distance, VectorParams

        client = self._get_client()
        collection_name = settings.qdrant_collection

        existing = await client.get_collections()
        existing_names = {c.name for c in existing.collections}

        if collection_name not in existing_names:
            await client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=_VECTOR_SIZE, distance=Distance.COSINE),
            )
            logger.info(
                "Qdrant collection created",
                collection=collection_name,
                vector_size=_VECTOR_SIZE,
            )
        else:
            logger.debug("Qdrant collection already exists", collection=collection_name)

    async def upsert_chunks(self, chunks: list[ChunkPoint]) -> None:
        """Batch-upsert chunk vectors into Qdrant.

        Args:
            chunks: List of ``ChunkPoint`` objects, each carrying an ID,
                embedding vector, and metadata payload.
        """
        if not chunks:
            return

        from qdrant_client.models import PointStruct

        client = self._get_client()
        points = [
            PointStruct(id=c.id, vector=c.vector, payload=c.payload) for c in chunks
        ]

        await client.upsert(
            collection_name=settings.qdrant_collection,
=======
    """Upserts embedding vectors into the Qdrant ``kms_chunks`` collection.

    Supports two backends:
    - **Real mode** (MOCK_QDRANT=false): uses ``qdrant-client`` async HTTP client.
    - **Mock mode** (MOCK_QDRANT=true, default): all operations are no-ops so
      the pipeline can run without a Qdrant instance.

    Args:
        mock_mode: Explicit override for mock mode.  When ``None`` the value
            is read from the ``MOCK_QDRANT`` environment variable (default
            ``"true"`` for dev safety).
    """

    def __init__(
        self,
        mock_mode: Optional[bool] = None,
    ) -> None:
        # Resolve mock mode: explicit arg > env var > safe default (True)
        self._mock = mock_mode if mock_mode is not None else (
            os.getenv("MOCK_QDRANT", "true").lower() == "true"
        )
        self._client = None  # Lazily created on first real operation

        if self._mock:
            logger.warning(
                "QdrantService running in MOCK mode — vectors are not persisted"
            )

    def _get_client(self):
        """Lazily initialise the qdrant-client async client.

        The client is created once and reused for the lifetime of the service.
        Connection failures here will propagate to the caller.

        Returns:
            An ``AsyncQdrantClient`` connected to ``QDRANT_URL``.
        """
        if self._client is None:
            from qdrant_client import AsyncQdrantClient  # type: ignore

            qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
            self._client = AsyncQdrantClient(url=qdrant_url)
        return self._client

    async def ensure_collection(self) -> None:
        """Create the ``kms_chunks`` collection if it does not already exist.

        Uses Cosine distance and BGE-M3 vector size (1024).  Safe to call
        repeatedly — the collection is only created on the first call.

        No-op in mock mode.
        """
        # Skip all Qdrant interaction when running in mock mode
        if self._mock:
            logger.debug("MOCK: ensure_collection skipped")
            return

        from qdrant_client.models import Distance, VectorParams  # type: ignore

        client = self._get_client()
        existing = await client.get_collections()
        existing_names = {c.name for c in existing.collections}

        if COLLECTION_NAME not in existing_names:
            # Create with on-disk payload storage to reduce RAM usage
            await client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(
                    size=VECTOR_SIZE,
                    distance=Distance.COSINE,
                    on_disk=True,          # payload on disk; index stays in RAM
                ),
            )
            logger.info(
                "Qdrant collection created",
                collection=COLLECTION_NAME,
                vector_size=VECTOR_SIZE,
            )
        else:
            logger.debug("Qdrant collection already exists", collection=COLLECTION_NAME)

    async def upsert_chunks(self, chunks: list[ChunkPoint]) -> None:
        """Batch-upsert chunk vectors into the ``kms_chunks`` collection.

        For large files (>500 chunks) the caller should split the list into
        batches of <=100 before calling this method to avoid timeouts.

        Args:
            chunks: List of ``ChunkPoint`` objects to upsert.  Each point
                must have a unique ``id`` (UUID string).

        No-op in mock mode or when ``chunks`` is empty.
        """
        # Skip all Qdrant interaction when running in mock mode
        if self._mock:
            logger.debug("MOCK: upsert_chunks skipped", count=len(chunks))
            return

        if not chunks:
            # Nothing to upsert — avoid an unnecessary network call
            return

        from qdrant_client.models import PointStruct  # type: ignore

        client = self._get_client()
        # Build PointStruct list from our domain dataclass
        points = [
            PointStruct(id=c.id, vector=c.vector, payload=c.payload)
            for c in chunks
        ]

        await client.upsert(
            collection_name=COLLECTION_NAME,
>>>>>>> feat/sprint2-embed-pipeline
            points=points,
        )
        logger.info(
            "Upserted chunk vectors to Qdrant",
<<<<<<< HEAD
            collection=settings.qdrant_collection,
=======
            collection=COLLECTION_NAME,
>>>>>>> feat/sprint2-embed-pipeline
            count=len(points),
        )
