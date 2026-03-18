"""Embedding service using BAAI/bge-m3 via sentence-transformers."""

import asyncio
import time

import structlog

from app.utils.errors import EmbeddingError

logger = structlog.get_logger(__name__)

_MODEL_NAME = "BAAI/bge-m3"
_EMBEDDING_DIM = 1024


class EmbeddingService:
    """Generate dense text embeddings using the BGE-M3 model.

    The sentence-transformers model is loaded lazily on the first call
    to :meth:`encode_batch` so that import time is not impacted and
    the model is only downloaded/loaded when actually needed.

    Attributes:
        _model: Lazily loaded ``SentenceTransformer`` instance (``None``
            until first use).
    """

    def __init__(self) -> None:
        self._model = None

    def _load_model(self):
        """Load the BGE-M3 model if it has not been loaded yet.

        Returns:
            The loaded ``SentenceTransformer`` model.

        Raises:
            EmbeddingError: If the model cannot be loaded (non-retryable).
        """
        if self._model is not None:
            return self._model

        try:
            from sentence_transformers import SentenceTransformer

            logger.info("Loading embedding model", model=_MODEL_NAME)
            start = time.monotonic()
            self._model = SentenceTransformer(_MODEL_NAME)
            elapsed = time.monotonic() - start
            logger.info(
                "Embedding model loaded",
                model=_MODEL_NAME,
                load_time_seconds=round(elapsed, 2),
                dimensions=_EMBEDDING_DIM,
            )
        except Exception as exc:
            raise EmbeddingError(
                f"Failed to load model '{_MODEL_NAME}': {exc}", retryable=False
            ) from exc

        return self._model

    async def encode_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a batch of text strings.

        Encoding is offloaded to a thread pool so the event loop is not
        blocked during model inference.

        Args:
            texts: List of non-empty text strings to embed.

        Returns:
            A list of 1024-dimensional float vectors, one per input text.

        Raises:
            EmbeddingError: If embedding generation fails (retryable by default).
        """
        if not texts:
            return []

        try:
            vectors: list[list[float]] = await asyncio.to_thread(
                self._encode_sync, texts
            )
            return vectors
        except EmbeddingError:
            raise
        except Exception as exc:
            raise EmbeddingError(str(exc)) from exc

    def _encode_sync(self, texts: list[str]) -> list[list[float]]:
        """Synchronous encoding, intended for thread pool execution.

        Args:
            texts: List of text strings to embed.

        Returns:
            List of 1024-dimensional float vectors.
        """
        model = self._load_model()
        embeddings = model.encode(texts, normalize_embeddings=True)
        return [emb.tolist() for emb in embeddings]
