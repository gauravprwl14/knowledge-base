"""Retriever service for rag-service.

Retrieves relevant chunks from Qdrant using semantic search with an optional
Neo4j graph-expansion step to surface related documents via MENTIONS edges.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

import aiohttp
import structlog

from app.config import get_settings
from app.errors import RetrievalError
from app.schemas.chat import Citation

logger = structlog.get_logger(__name__)
settings = get_settings()


@dataclass
class RetrievedChunk:
    """A single chunk returned by the retriever.

    Attributes:
        chunk_id: Qdrant point ID (string form).
        file_id: Parent file UUID.
        filename: Original filename.
        content: Raw text content of the chunk.
        score: Similarity score in [0, 1].
        chunk_index: Ordinal position of the chunk within the file.
        web_view_link: External URL to view the source file (e.g. Google Drive).
        start_secs: Start timestamp in seconds for voice transcript chunks.
        source_type: Source type of the parent file (e.g. "google_drive", "local").
    """

    chunk_id: str
    file_id: str
    filename: str
    content: str
    score: float
    chunk_index: int = 0
    web_view_link: Optional[str] = None
    start_secs: Optional[float] = None
    source_type: Optional[str] = None


class Retriever:
    """Retrieves relevant chunks using Qdrant semantic search + optional Neo4j graph expansion.

    The retrieval pipeline:
      1. Generate a query embedding via HTTP POST to the embed-worker /embed endpoint.
      2. Search the Qdrant collection ``kms_chunks`` with a user_id payload filter.
      3. Optionally expand results via Neo4j: find entities MENTIONS-linked to the top
         results' files and fetch related files, then append any new chunks for those files.
      4. Return deduplicated chunks ordered by score descending.

    Example:
        retriever = Retriever()
        chunks = await retriever.retrieve("what is RAG?", user_id="user-001", top_k=10)
    """

    async def retrieve(
        self,
        query: str,
        user_id: str,
        top_k: int = 10,
        use_graph: bool = True,
    ) -> list[RetrievedChunk]:
        """Retrieve relevant chunks for a query.

        Args:
            query: The natural-language query string.
            user_id: UUID of the requesting user — used as a payload filter in Qdrant.
            top_k: Maximum number of chunks to return.
            use_graph: When True, attempt Neo4j graph expansion after initial Qdrant search.

        Returns:
            list[RetrievedChunk]: Deduplicated list of chunks ranked by score.

        Raises:
            RetrievalError: When the embedding service is unavailable or the Qdrant
                search fails for any reason.
        """
        log = logger.bind(user_id=user_id, top_k=top_k, use_graph=use_graph)
        log.info("Starting retrieval", query=query[:100])

        try:
            embedding = await self._embed(query)
        except Exception as exc:
            log.error("Embedding service unavailable", error=str(exc))
            raise RetrievalError(f"Embedding service unavailable: {exc}") from exc

        try:
            chunks = await self._search_qdrant(embedding, user_id, top_k)
        except Exception as exc:
            log.error("Qdrant search failed", error=str(exc))
            raise RetrievalError(f"Qdrant search failed: {exc}") from exc

        log.info("Qdrant search complete", chunk_count=len(chunks))

        if use_graph and chunks:
            try:
                expanded = await self._expand_via_graph(chunks, user_id, top_k)
                chunks = _deduplicate(chunks + expanded, top_k)
                log.info("Graph expansion applied", total_chunks=len(chunks))
            except Exception as exc:
                # Graph expansion is best-effort; log and continue with base results.
                log.warning(
                    "Graph expansion failed — returning base results",
                    error=str(exc),
                )

        return chunks

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _embed(self, text: str) -> list[float]:
        """Call the embed-worker /embed endpoint to generate a query embedding.

        Args:
            text: Raw text to embed.

        Returns:
            list[float]: Dense embedding vector (1024 dimensions for BAAI/bge-m3).

        Raises:
            Exception: Propagates any HTTP or connection errors to the caller.
        """
        url = f"{settings.embed_worker_url}/embed"
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json={"text": text},
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                resp.raise_for_status()
                data: dict[str, Any] = await resp.json()
                return data["embedding"]

    async def _search_qdrant(
        self,
        embedding: list[float],
        user_id: str,
        top_k: int,
    ) -> list[RetrievedChunk]:
        """Search the Qdrant collection for the nearest neighbours.

        Applies a ``must`` payload filter on ``user_id`` to scope results to
        the requesting user's documents.

        Args:
            embedding: Query embedding vector.
            user_id: UUID used as a payload filter.
            top_k: Maximum number of results to retrieve.

        Returns:
            list[RetrievedChunk]: Matching chunks ordered by score descending.

        Raises:
            Exception: Propagates HTTP or JSON errors to the caller.
        """
        url = f"{settings.qdrant_url}/collections/{settings.qdrant_collection}/points/search"
        payload = {
            "vector": embedding,
            "limit": top_k,
            "with_payload": True,
            "filter": {
                "must": [
                    {"key": "user_id", "match": {"value": user_id}}
                ]
            },
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                resp.raise_for_status()
                data: dict[str, Any] = await resp.json()

        results: list[RetrievedChunk] = []
        for point in data.get("result", []):
            pl = point.get("payload", {})
            start_secs_raw = pl.get("start_secs")
            results.append(
                RetrievedChunk(
                    chunk_id=str(point.get("id", "")),
                    file_id=pl.get("file_id", ""),
                    filename=pl.get("filename", ""),
                    content=pl.get("content", ""),
                    score=float(point.get("score", 0.0)),
                    chunk_index=int(pl.get("chunk_index", 0)),
                    web_view_link=pl.get("web_view_link") or None,
                    start_secs=float(start_secs_raw) if start_secs_raw is not None else None,
                    source_type=pl.get("source_type") or None,
                )
            )
        return results

    async def _expand_via_graph(
        self,
        base_chunks: list[RetrievedChunk],
        user_id: str,
        top_k: int,
    ) -> list[RetrievedChunk]:
        """Expand results using Neo4j MENTIONS relationships.

        For each unique file in the base results, queries Neo4j for Entity nodes
        linked via MENTIONS edges and then fetches Qdrant chunks for the related
        files' IDs.

        Args:
            base_chunks: Initial Qdrant search results.
            user_id: UUID of the requesting user.
            top_k: Maximum additional chunks to append.

        Returns:
            list[RetrievedChunk]: Additional chunks from related files. May be empty.
        """
        from neo4j import AsyncGraphDatabase  # noqa: PLC0415

        file_ids = list({c.file_id for c in base_chunks})
        cypher = """
            MATCH (f:File {user_id: $user_id})-[:MENTIONS]->(e:Entity)
            WHERE f.id IN $file_ids
            WITH e
            MATCH (related:File)-[:MENTIONS]->(e)
            WHERE related.user_id = $user_id AND NOT related.id IN $file_ids
            RETURN DISTINCT related.id AS file_id
            LIMIT 10
        """
        driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
        try:
            async with driver.session() as session:
                result = await session.run(
                    cypher, user_id=user_id, file_ids=file_ids
                )
                records = await result.data()
        finally:
            await driver.close()

        related_file_ids = [r["file_id"] for r in records if r.get("file_id")]
        if not related_file_ids:
            return []

        # Fetch a representative chunk for each related file from Qdrant
        extra_chunks: list[RetrievedChunk] = []
        for file_id in related_file_ids[:top_k]:
            url = (
                f"{settings.qdrant_url}/collections/"
                f"{settings.qdrant_collection}/points/scroll"
            )
            payload = {
                "limit": 1,
                "with_payload": True,
                "filter": {
                    "must": [
                        {"key": "user_id", "match": {"value": user_id}},
                        {"key": "file_id", "match": {"value": file_id}},
                    ]
                },
            }
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    if resp.status != 200:
                        continue
                    data = await resp.json()

            for point in data.get("result", {}).get("points", []):
                pl = point.get("payload", {})
                start_secs_raw = pl.get("start_secs")
                extra_chunks.append(
                    RetrievedChunk(
                        chunk_id=str(point.get("id", "")),
                        file_id=pl.get("file_id", ""),
                        filename=pl.get("filename", ""),
                        content=pl.get("content", ""),
                        score=0.5,  # graph-expanded chunks use a fixed relevance proxy
                        chunk_index=int(pl.get("chunk_index", 0)),
                        web_view_link=pl.get("web_view_link") or None,
                        start_secs=float(start_secs_raw) if start_secs_raw is not None else None,
                        source_type=pl.get("source_type") or None,
                    )
                )

        return extra_chunks


class ContextRetriever:
    """Thin wrapper around Retriever for use by the chat endpoint.

    Accepts an asyncpg pool (kept for future metadata enrichment) and exposes a
    simplified ``retrieve(question, top_k)`` interface that returns a
    ``(context_text, citations)`` tuple consumed by LLMGenerator.

    Args:
        db: asyncpg connection pool (stored for future use; not used in current retrieval path).
    """

    #: Maximum characters for a citation snippet.
    SNIPPET_MAX_CHARS: int = 300

    def __init__(self, db) -> None:
        self._db = db
        self._retriever = Retriever()

    async def retrieve(
        self,
        question: str,
        top_k: int = 10,
        user_id: str = "anonymous",
    ) -> tuple[str, list[Citation]]:
        """Retrieve context chunks and format them for the LLM.

        Each chunk is mapped to a :class:`~app.schemas.chat.Citation` that
        carries a ``snippet`` (up to 300 chars), ``web_view_link``, and
        ``start_secs`` in addition to the standard file/score fields.

        Args:
            question: Natural-language question from the user.
            top_k: Maximum number of chunks to retrieve.
            user_id: Optional user scope for Qdrant payload filtering.

        Returns:
            Tuple of (context_text, citations) where context_text is a
            newline-joined string of chunk content and citations is a
            list of :class:`~app.schemas.chat.Citation` objects deduplicated
            by file_id, preserving the highest-scored chunk per file.
        """
        chunks = await self._retriever.retrieve(question, user_id=user_id, top_k=top_k)
        context_text = "\n\n".join(c.content for c in chunks)

        # Deduplicate by file_id keeping the highest-scored chunk per file,
        # then build Citation objects with snippet, web_view_link, start_secs.
        seen_files: dict[str, RetrievedChunk] = {}
        for chunk in chunks:
            if chunk.file_id not in seen_files or chunk.score > seen_files[chunk.file_id].score:
                seen_files[chunk.file_id] = chunk

        citations: list[Citation] = [
            Citation(
                file_id=c.file_id,
                filename=c.filename,
                snippet=c.content[: self.SNIPPET_MAX_CHARS],
                score=c.score,
                web_view_link=c.web_view_link,
                start_secs=c.start_secs,
            )
            for c in seen_files.values()
        ]

        return context_text, citations


def _deduplicate(chunks: list[RetrievedChunk], top_k: int) -> list[RetrievedChunk]:
    """Deduplicate chunks by chunk_id and sort by score descending.

    Args:
        chunks: Combined list of base + expanded chunks, possibly with duplicates.
        top_k: Maximum number of results to return.

    Returns:
        list[RetrievedChunk]: Deduplicated, score-sorted chunks truncated to top_k.
    """
    seen: set[str] = set()
    unique: list[RetrievedChunk] = []
    for chunk in sorted(chunks, key=lambda c: c.score, reverse=True):
        if chunk.chunk_id not in seen:
            seen.add(chunk.chunk_id)
            unique.append(chunk)
            if len(unique) >= top_k:
                break
    return unique
