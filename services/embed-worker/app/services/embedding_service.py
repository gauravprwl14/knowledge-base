"""Embedding service — wraps BGE-M3 (FlagEmbedding) with a mock fallback.

When MOCK_EMBEDDING=true (env) or FlagEmbedding is not installed,
returns deterministic pseudo-random vectors (seeded by text hash) so
the full pipeline runs in dev without the 2 GB model download.

Production: set MOCK_EMBEDDING=false and ensure FlagEmbedding is installed.
"""
from __future__ import annotations

import hashlib
import math
import os
from typing import Optional

import structlog

logger = structlog.get_logger(__name__)

# BGE-M3 produces 1024-dimensional dense vectors.
EMBEDDING_DIMS = 1024


class EmbeddingService:
    """Encodes text chunks into 1024-dimensional BGE-M3 vectors.

    In mock mode (MOCK_EMBEDDING=true or FlagEmbedding unavailable) the service
    returns deterministic pseudo-random unit vectors derived from the SHA-256 hash
    of each input string.  This lets the full ingest pipeline run end-to-end in dev
    and CI without downloading the 2 GB model weights.

    Args:
        mock_mode: Explicitly set mock mode.  When ``None`` (default) the value
            is read from the ``MOCK_EMBEDDING`` environment variable (default
            ``"true"`` so dev environments work without extra setup).
    """

    def __init__(self, mock_mode: Optional[bool] = None) -> None:
        # Resolve mock mode: explicit arg > env var > safe default (True)
        self._mock = mock_mode if mock_mode is not None else (
            os.getenv("MOCK_EMBEDDING", "true").lower() == "true"
        )
        self._model = None  # Lazily loaded when real mode is active

        if not self._mock:
            # Attempt to load the real BGE-M3 model at construction time.
            # Any failure will downgrade to mock mode with a warning.
            self._load_model()
        else:
            logger.warning(
                "EmbeddingService running in MOCK mode — vectors are not real embeddings",
                dims=EMBEDDING_DIMS,
            )

    def _load_model(self) -> None:
        """Load the BGE-M3 FlagEmbedding model.

        Uses ``BAAI/bge-m3`` with FP16 to halve GPU/CPU memory usage.
        Falls back to mock mode if:
        - FlagEmbedding is not installed (ImportError)
        - Model cannot be downloaded (no internet in CI, disk full, etc.)
        """
        try:
            # FlagEmbedding is the canonical library for BGE-M3.
            # It is listed in requirements.txt but may not be present in CI.
            from FlagEmbedding import BGEM3FlagModel  # type: ignore

            logger.info("Loading BGE-M3 model — this may take a few minutes on first run")
            self._model = BGEM3FlagModel(
                "BAAI/bge-m3",
                use_fp16=True,   # halves memory usage; negligible quality loss for retrieval
                device="cpu",    # override with "cuda" if a GPU is available
            )
            logger.info("BGE-M3 model loaded successfully")
        except ImportError:
            # FlagEmbedding not installed — silently downgrade so the worker still boots.
            logger.warning(
                "FlagEmbedding not installed — falling back to mock embeddings. "
                "Install with: pip install FlagEmbedding",
            )
            self._mock = True
        except Exception as e:
            # Any other failure (download timeout, CUDA OOM, etc.) should not crash
            # the worker; degrade gracefully so CI/dev keeps working.
            logger.error(
                "Failed to load BGE-M3 model — falling back to mock",
                error=str(e),
            )
            self._mock = True

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Encode a list of text strings into embedding vectors.

        Args:
            texts: List of text chunks to embed.  Empty strings are valid
                (they produce a deterministic zero-ish vector in mock mode).

        Returns:
            List of 1024-dim float vectors, one per input text.
            Returns an empty list if ``texts`` is empty.
        """
        # Fast path: nothing to embed
        if not texts:
            return []

        if self._mock:
            # Each text gets a deterministic pseudo-random unit vector.
            return [self._mock_vector(t) for t in texts]

        # Real BGE-M3 path — encode() is synchronous/CPU-bound.
        # The embed_handler already runs inside an AMQP worker context, so
        # blocking the event loop briefly is acceptable here.  For very large
        # batches (>500 chunks) the caller should split before calling embed().
        output = self._model.encode(
            texts,
            batch_size=12,             # tune per available RAM; 12 works on 16 GB
            max_length=8192,           # BGE-M3 supports up to 8 192 tokens per chunk
            return_dense=True,         # we store dense vectors in Qdrant
            return_sparse=False,       # SPLADE sparse vectors deferred to Phase 3
            return_colbert_vecs=False, # ColBERT multi-vector deferred to Phase 3
        )
        return output["dense_vecs"].tolist()

    # ------------------------------------------------------------------
    # Legacy alias — older callers (embed_handler, tests) use encode_batch.
    # We keep both names so nothing breaks.
    # ------------------------------------------------------------------
    async def encode_batch(self, texts: list[str]) -> list[list[float]]:
        """Alias for :meth:`embed` retained for backwards compatibility.

        Args:
            texts: List of text strings to encode.

        Returns:
            List of 1024-dim float vectors.
        """
        return await self.embed(texts)

    def _mock_vector(self, text: str) -> list[float]:
        """Generate a deterministic pseudo-random L2-normalised vector from text.

        Algorithm:
        1. SHA-256 of the UTF-8 encoded input gives a 32-byte seed.
        2. We iteratively hash the seed to expand to >=1024 floats.
        3. Each byte maps linearly to [-1, 1].
        4. The result is L2-normalised so cosine similarity is meaningful.

        This ensures:
        - Same text always → same vector (deterministic / reproducible).
        - Different texts → different vectors with high probability.
        - Vectors lie on the unit sphere (required for cosine distance in Qdrant).

        Args:
            text: Input text string.

        Returns:
            1024-dimensional normalised float vector.
        """
        # Step 1: deterministic 32-byte seed from text content
        digest = hashlib.sha256(text.encode()).digest()

        # Step 2: expand seed to EMBEDDING_DIMS floats via repeated hashing.
        # Each SHA-256 pass produces 32 bytes = 32 floats, so ceil(1024/32)=32 passes.
        raw: list[float] = []
        seed = digest
        while len(raw) < EMBEDDING_DIMS:
            seed = hashlib.sha256(seed).digest()
            # Map each byte [0, 255] → [-1.0, 1.0]
            raw.extend((b - 128) / 128.0 for b in seed)

        # Trim to exactly EMBEDDING_DIMS
        raw = raw[:EMBEDDING_DIMS]

        # Step 3: L2-normalise so the vector lies on the unit hypersphere.
        magnitude = math.sqrt(sum(x * x for x in raw))
        if magnitude == 0:
            # Theoretically impossible with SHA-256 output, but guard anyway.
            magnitude = 1.0
        return [x / magnitude for x in raw]
