"""
Graph handler — processes graph-build messages from the kms.graph queue.

Two message variants are supported:

GraphBuildMessage (legacy)
  1. Parse the incoming AMQP message body as GraphBuildMessage.
  2. Load chunk content from PostgreSQL (kms_chunks) using asyncpg.
  3. Run NER extraction on each chunk via _extract_entities_stub().
  4. Write graph nodes and relationships to Neo4j:
       - MERGE (:File {id, name, user_id, source_id, mime_type})
       - MERGE (:Entity {name, type}) for each extracted entity
       - MERGE (:File)-[:MENTIONS]->(:Entity)
       - MERGE (:Entity)-[:CO_OCCURS_WITH {weight}]->(:Entity) for same-chunk co-occurrences
  5. Ack on success; nack/reject on error according to retryability.

GraphJobMessage (inline-chunks)
  1. Parse the incoming AMQP message body as GraphJobMessage.
  2. Use inline chunk text directly (no PostgreSQL round-trip for content).
  3. Extract named entities using EntityExtractor (spaCy).
  4. For Markdown files, also extract [[wiki links]] and create REFERENCES edges.
  5. Write all nodes and relationships via Neo4jService.
  6. Update kms_files status to GRAPH_INDEXED in PostgreSQL.
  7. Ack on success; nack/reject on error according to retryability.

NER note: _extract_entities_stub() returns hard-coded fake entities.  Replace
with a real spaCy pipeline call once the model is available in the image.
"""

import json
from collections import Counter
from itertools import combinations

import aio_pika
import asyncpg
import structlog
from neo4j import AsyncDriver

from app.extractors.entity_extractor import EntityExtractor
from app.db.neo4j_service import Neo4jService
from app.models.messages import GraphBuildMessage, GraphJobMessage
from app.utils.errors import (
    ChunkLoadError,
    KMSWorkerError,
    NERExtractionError,
    Neo4jWriteError,
    StatusUpdateError,
)

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


class Entity:
    """Represents a named entity extracted by NER.

    Attributes:
        name: Surface form of the entity (e.g. "OpenAI").
        type: spaCy entity label (PERSON, ORG, GPE, EVENT, PRODUCT).
    """

    __slots__ = ("name", "type")

    def __init__(self, name: str, entity_type: str) -> None:
        """Initialise an entity.

        Args:
            name: Surface form of the entity text.
            entity_type: spaCy NER label string.
        """
        self.name = name
        self.type = entity_type

    def __repr__(self) -> str:  # pragma: no cover
        return f"Entity(name={self.name!r}, type={self.type!r})"


# ---------------------------------------------------------------------------
# NER stub
# ---------------------------------------------------------------------------

_SUPPORTED_ENTITY_TYPES = {"PERSON", "ORG", "GPE", "EVENT", "PRODUCT"}


def _extract_entities_stub(text: str) -> list[Entity]:
    """Stub NER extraction — returns deterministic fake entities for boilerplate.

    Replace this function with a real spaCy call once the model is downloaded:

    .. code-block:: python

        import spacy
        nlp = spacy.load("en_core_web_trf")
        doc = nlp(text)
        return [
            Entity(ent.text, ent.label_)
            for ent in doc.ents
            if ent.label_ in _SUPPORTED_ENTITY_TYPES
        ]

    Args:
        text: Raw chunk text to process.

    Returns:
        list[Entity]: Extracted entities with name and type populated.
    """
    # Stub: simulate entity extraction without loading a real spaCy model.
    # Two fake entities are returned so the relationship logic is exercised in tests.
    return [
        Entity("Example Corp", "ORG"),
        Entity("Alice Smith", "PERSON"),
    ]


# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------


class GraphHandler:
    """Consumes GraphBuildMessage from kms.graph and writes to Neo4j.

    Attributes:
        _channel: The aio_pika channel (kept for future downstream publishes).
        _db_pool: asyncpg connection pool for loading kms_chunks content.
        _neo4j: Neo4j async driver for Cypher write operations.
    """

    def __init__(
        self,
        channel: aio_pika.Channel,
        db_pool: asyncpg.Pool,
        neo4j_driver: AsyncDriver,
    ) -> None:
        """Initialise the handler with shared I/O resources.

        Args:
            channel: aio_pika channel (kept for future downstream publishes).
            db_pool: asyncpg connection pool for chunk content retrieval.
            neo4j_driver: Initialised and connected Neo4j async driver.
        """
        self._channel = channel
        self._db_pool = db_pool
        self._neo4j = neo4j_driver

    async def handle(self, message: aio_pika.IncomingMessage) -> None:
        """Entry point called by aio_pika for each message delivered on kms.graph.

        Parses the message body, runs graph-build logic, then acks or nacks the
        message based on the outcome.

        Args:
            message: Raw AMQP message from the kms.graph queue.
        """
        try:
            payload = json.loads(message.body)
            job = GraphBuildMessage.model_validate(payload)
        except Exception as exc:
            logger.error(
                "Invalid graph build message — dead-lettering",
                error=str(exc),
                body=message.body[:200],
            )
            await message.reject(requeue=False)
            return

        log = logger.bind(
            file_id=job.file_id,
            user_id=job.user_id,
            source_id=job.source_id,
            file_name=job.file_name,
            chunk_count=len(job.chunk_ids),
        )
        log.info("Processing graph build job", mime_type=job.mime_type)

        try:
            await self._run_graph_build(job, log)
            await message.ack()

        except KMSWorkerError as exc:
            log.error(
                "Graph build failed",
                code=exc.code,
                retryable=exc.retryable,
                error=str(exc),
            )
            if exc.retryable:
                await message.nack(requeue=True)
            else:
                await message.reject(requeue=False)

        except Exception as exc:
            log.error("Unexpected error during graph build", error=str(exc))
            await message.nack(requeue=True)

    async def _run_graph_build(self, job: GraphBuildMessage, log: structlog.BoundLogger) -> None:
        """Execute the full graph-build pipeline for a single file.

        Args:
            job: Validated graph build message.
            log: Bound structlog logger carrying per-message context fields.

        Raises:
            ChunkLoadError: When chunk content cannot be retrieved from PostgreSQL.
            NERExtractionError: When entity extraction fails for a chunk.
            Neo4jWriteError: When a Cypher write operation fails.
        """
        chunks = await self._load_chunks(job.chunk_ids, job.file_id)
        log.info("Chunks loaded", count=len(chunks))

        # Map chunk_id -> entities extracted from that chunk's text
        chunk_entities: dict[str, list[Entity]] = {}
        for chunk_id, content in chunks.items():
            try:
                entities = _extract_entities_stub(content)
            except Exception as exc:
                raise NERExtractionError(file_id=job.file_id, reason=str(exc)) from exc
            chunk_entities[chunk_id] = entities
            log.debug(
                "Entities extracted",
                chunk_id=chunk_id,
                entity_count=len(entities),
            )

        all_entities = [e for ents in chunk_entities.values() for e in ents]
        log.info("NER complete", total_entities=len(all_entities))

        await self._write_graph(job, chunk_entities, log)

    async def _load_chunks(self, chunk_ids: list[str], file_id: str) -> dict[str, str]:
        """Retrieve chunk content from PostgreSQL for the given chunk IDs.

        Args:
            chunk_ids: List of chunk UUIDs to fetch from kms_chunks.
            file_id: Parent file ID — used only for error context.

        Returns:
            dict[str, str]: Mapping of chunk_id -> content text for all found chunks.

        Raises:
            ChunkLoadError: If the asyncpg query fails for any reason.
        """
        if not chunk_ids:
            return {}

        sql = "SELECT id::text, content FROM kms_chunks WHERE id = ANY($1::uuid[])"
        try:
            async with self._db_pool.acquire() as conn:
                rows = await conn.fetch(sql, chunk_ids)
            return {row["id"]: row["content"] for row in rows}
        except Exception as exc:
            raise ChunkLoadError(file_id=file_id, reason=str(exc)) from exc

    async def _write_graph(
        self,
        job: GraphBuildMessage,
        chunk_entities: dict[str, list[Entity]],
        log: structlog.BoundLogger,
    ) -> None:
        """Write all nodes and relationships for the file into Neo4j.

        Executes three Cypher operations within a single async session:
          1. MERGE the File node.
          2. MERGE each Entity node and create a MENTIONS relationship.
          3. MERGE CO_OCCURS_WITH relationships (weighted by co-occurrence count).

        Args:
            job: Validated graph build message with file metadata.
            chunk_entities: Mapping of chunk_id -> extracted entities for that chunk.
            log: Bound structlog logger carrying per-message context fields.

        Raises:
            Neo4jWriteError: If any Cypher write operation fails.
        """
        async with self._neo4j.session() as session:
            await self._merge_file_node(session, job)
            log.debug("File node merged", file_id=job.file_id)

            # Collect all unique (entity_name, entity_type) pairs
            all_entities: list[Entity] = [
                e for ents in chunk_entities.values() for e in ents
            ]

            for entity in all_entities:
                await self._merge_entity_and_mentions(session, job.file_id, entity)

            log.debug("Entity nodes and MENTIONS edges written", count=len(all_entities))

            # CO_OCCURS_WITH: count pairs within each chunk
            co_occurrence_weights: Counter = Counter()
            for entities in chunk_entities.values():
                entity_names = [e.name for e in entities]
                for name_a, name_b in combinations(sorted(set(entity_names)), 2):
                    co_occurrence_weights[(name_a, name_b)] += 1

            for (name_a, name_b), weight in co_occurrence_weights.items():
                await self._merge_co_occurs_with(session, name_a, name_b, weight)

            log.info(
                "Graph build complete",
                file_id=job.file_id,
                entities=len(all_entities),
                co_occurrence_pairs=len(co_occurrence_weights),
            )

    async def _merge_file_node(self, session, job: GraphBuildMessage) -> None:
        """Create or update the File node in Neo4j.

        Uses MERGE so that re-processing the same file is idempotent.

        Args:
            session: Open Neo4j async session.
            job: Graph build message containing file metadata.

        Raises:
            Neo4jWriteError: If the Cypher query fails.
        """
        cypher = """
            MERGE (f:File {id: $id})
            SET f.name      = $name,
                f.user_id   = $user_id,
                f.source_id = $source_id,
                f.mime_type = $mime_type
        """
        try:
            await session.run(
                cypher,
                id=job.file_id,
                name=job.file_name,
                user_id=job.user_id,
                source_id=job.source_id,
                mime_type=job.mime_type,
            )
        except Exception as exc:
            raise Neo4jWriteError(operation="MERGE File", reason=str(exc)) from exc

    async def _merge_entity_and_mentions(
        self, session, file_id: str, entity: Entity
    ) -> None:
        """Create or update an Entity node and add a MENTIONS edge from the File.

        Args:
            session: Open Neo4j async session.
            file_id: ID of the parent File node.
            entity: Named entity to merge.

        Raises:
            Neo4jWriteError: If the Cypher query fails.
        """
        cypher = """
            MATCH (f:File {id: $file_id})
            MERGE (e:Entity {name: $name, type: $type})
            MERGE (f)-[:MENTIONS]->(e)
        """
        try:
            await session.run(
                cypher,
                file_id=file_id,
                name=entity.name,
                type=entity.type,
            )
        except Exception as exc:
            raise Neo4jWriteError(
                operation="MERGE Entity + MENTIONS", reason=str(exc)
            ) from exc

    async def _merge_co_occurs_with(
        self, session, name_a: str, name_b: str, weight: int
    ) -> None:
        """Create or update a CO_OCCURS_WITH relationship between two entities.

        The ``weight`` property accumulates across calls (using += in Cypher).

        Args:
            session: Open Neo4j async session.
            name_a: Name of the first entity (alphabetically smaller).
            name_b: Name of the second entity (alphabetically larger).
            weight: Number of chunks in which both entities appear together.

        Raises:
            Neo4jWriteError: If the Cypher query fails.
        """
        cypher = """
            MATCH (a:Entity {name: $name_a})
            MATCH (b:Entity {name: $name_b})
            MERGE (a)-[r:CO_OCCURS_WITH]-(b)
            ON CREATE SET r.weight = $weight
            ON MATCH  SET r.weight = r.weight + $weight
        """
        try:
            await session.run(cypher, name_a=name_a, name_b=name_b, weight=weight)
        except Exception as exc:
            raise Neo4jWriteError(operation="MERGE CO_OCCURS_WITH", reason=str(exc)) from exc


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_MARKDOWN_MIME_TYPES = frozenset({"text/markdown", "text/x-markdown", "text/md"})
_MARKDOWN_EXTENSIONS = frozenset({".md", ".markdown", ".mdx"})


def _is_markdown(mime_type: str, filename: str) -> bool:
    """Return True when the file should be treated as Markdown.

    Checks both the MIME type and the file extension so that files with a
    generic ``text/plain`` MIME type but an ``.md`` extension are still
    processed for wiki-links.

    Args:
        mime_type: MIME type string from the job message.
        filename: Original filename (used for extension fallback).

    Returns:
        bool: True when wiki-link extraction should be applied.
    """
    if mime_type.lower() in _MARKDOWN_MIME_TYPES:
        return True
    return any(filename.lower().endswith(ext) for ext in _MARKDOWN_EXTENSIONS)


# ---------------------------------------------------------------------------
# GraphJobHandler — inline-chunks variant
# ---------------------------------------------------------------------------


class GraphJobHandler:
    """Consumes GraphJobMessage from kms.graph and writes to Neo4j.

    This handler processes the inline-chunks message format where chunk text
    is embedded directly in the AMQP message body. It uses EntityExtractor for
    NER and Neo4jService for all graph writes, then updates the file status in
    PostgreSQL to GRAPH_INDEXED on success.

    Attributes:
        _db_pool: asyncpg connection pool for updating kms_files status.
        _neo4j_service: High-level Neo4j service for graph writes.
        _extractor: EntityExtractor instance (shared, thread-safe after init).
    """

    def __init__(
        self,
        db_pool: asyncpg.Pool,
        neo4j_service: Neo4jService,
        extractor: EntityExtractor | None = None,
    ) -> None:
        """Initialise the handler with shared I/O resources.

        Args:
            db_pool: asyncpg connection pool for PostgreSQL status updates.
            neo4j_service: Initialised Neo4jService for graph writes.
            extractor: Optional EntityExtractor; a default instance is created
                when not provided (useful for testing with a pre-configured mock).
        """
        self._db_pool = db_pool
        self._neo4j_service = neo4j_service
        self._extractor = extractor or EntityExtractor()

    async def handle(self, message: aio_pika.IncomingMessage) -> None:
        """Entry point called by aio_pika for each message delivered on kms.graph.

        Parses the message body as a GraphJobMessage, runs the full graph-build
        pipeline, then acks or nacks the message based on the outcome.

        Args:
            message: Raw AMQP message from the kms.graph queue.
        """
        try:
            payload = json.loads(message.body)
            job = GraphJobMessage.model_validate(payload)
        except Exception as exc:
            logger.error(
                "Invalid graph job message — dead-lettering",
                error=str(exc),
                body=message.body[:200],
            )
            await message.reject(requeue=False)
            return

        log = logger.bind(
            file_id=job.file_id,
            user_id=job.user_id,
            source_id=job.source_id,
            filename=job.filename,
            chunk_count=len(job.chunks),
        )
        log.info("Processing graph job", mime_type=job.mime_type)

        try:
            await self._run_graph_job(job, log)
            await message.ack()

        except KMSWorkerError as exc:
            log.error(
                "Graph job failed",
                code=exc.code,
                retryable=exc.retryable,
                error=str(exc),
            )
            if exc.retryable:
                await message.nack(requeue=True)
            else:
                await message.reject(requeue=False)

        except Exception as exc:
            log.error("Unexpected error during graph job", error=str(exc))
            await message.nack(requeue=True)

    async def _run_graph_job(
        self, job: GraphJobMessage, log: structlog.BoundLogger
    ) -> None:
        """Execute the full graph-build pipeline for a GraphJobMessage.

        Steps:
          1. Upsert the File node in Neo4j.
          2. For each chunk, extract entities and upsert Entity nodes + MENTIONS edges.
          3. If the file is Markdown, extract wiki-links and create REFERENCES edges.
          4. Update kms_files status to GRAPH_INDEXED in PostgreSQL.

        Args:
            job: Validated graph job message with inline chunk text.
            log: Bound structlog logger carrying per-message context fields.

        Raises:
            Neo4jWriteError: When a Neo4j write fails (retryable by default).
            StatusUpdateError: When the PostgreSQL status update fails.
        """
        await self._neo4j_service.upsert_file_node(
            file_id=job.file_id,
            filename=job.filename,
            user_id=job.user_id,
            mime_type=job.mime_type,
        )
        log.debug("File node upserted")

        is_md = _is_markdown(job.mime_type, job.filename)
        total_entities = 0
        total_links = 0

        for chunk in job.chunks:
            # Named entity extraction
            try:
                entities = self._extractor.extract_entities(chunk)
            except Exception as exc:
                raise NERExtractionError(file_id=job.file_id, reason=str(exc)) from exc

            for entity in entities:
                await self._neo4j_service.upsert_entity_node(
                    entity_text=entity["text"],
                    entity_label=entity["label"],
                    user_id=job.user_id,
                )
                await self._neo4j_service.link_file_to_entity(
                    file_id=job.file_id,
                    entity_text=entity["text"],
                    user_id=job.user_id,
                )
            total_entities += len(entities)

            # Wiki-link extraction (Markdown only)
            if is_md:
                links = self._extractor.extract_wiki_links(chunk)
                for link_target in links:
                    await self._neo4j_service.link_wiki_references(
                        source_filename=job.filename,
                        target_name=link_target,
                        user_id=job.user_id,
                    )
                total_links += len(links)

        log.info(
            "Graph job complete",
            total_entities=total_entities,
            total_wiki_links=total_links,
            is_markdown=is_md,
        )

        await self._update_file_status(job.file_id, log)

    async def _update_file_status(
        self, file_id: str, log: structlog.BoundLogger
    ) -> None:
        """Update the kms_files status to GRAPH_INDEXED in PostgreSQL.

        Args:
            file_id: UUID string of the file to update.
            log: Bound structlog logger for contextual error output.

        Raises:
            StatusUpdateError: If the asyncpg query fails.
        """
        sql = """
            UPDATE kms_files
               SET status = 'GRAPH_INDEXED',
                   updated_at = NOW()
             WHERE id = $1::uuid
        """
        try:
            async with self._db_pool.acquire() as conn:
                await conn.execute(sql, file_id)
            log.debug("File status updated to GRAPH_INDEXED", file_id=file_id)
        except Exception as exc:
            raise StatusUpdateError(file_id=file_id, reason=str(exc)) from exc
