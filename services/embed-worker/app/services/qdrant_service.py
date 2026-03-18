"""Qdrant vector store service for the embed-worker."""

from dataclasses import dataclass, field

import structlog

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

_VECTOR_SIZE = 1024  # BGE-M3 output dimension


@dataclass
class ChunkPoint:
    """A single chunk ready to be upserted into Qdrant.

    Attributes:
        id: Unique UUID string for this chunk (used as Qdrant point ID).
        vector: 1024-dimensional embedding from BGE-M3.
        payload: Metadata stored alongside the vector in Qdrant.
    """

    id: str
    vector: list[float]
    payload: dict = field(default_factory=dict)


class QdrantService:
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
            points=points,
        )
        logger.info(
            "Upserted chunk vectors to Qdrant",
            collection=settings.qdrant_collection,
            count=len(points),
        )
