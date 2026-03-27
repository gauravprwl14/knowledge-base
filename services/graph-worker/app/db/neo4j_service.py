"""
High-level Neo4j service for graph-worker.

Wraps the raw AsyncDriver with domain-specific upsert and link operations
used during graph-build processing. All methods open short-lived async
sessions and raise Neo4jWriteError on failure.
"""

import structlog
from neo4j import AsyncDriver

from app.utils.errors import Neo4jWriteError

logger = structlog.get_logger(__name__)


class Neo4jService:
    """High-level Neo4j operations for knowledge graph building.

    Wraps an AsyncDriver instance with typed methods for merging File nodes,
    Entity nodes, and the MENTIONS / REFERENCES relationships between them.
    Each method is idempotent — repeated calls with the same arguments are safe.

    Attributes:
        _driver: The underlying Neo4j async driver shared across all calls.

    Example:
        service = Neo4jService(driver)
        await service.upsert_file_node(file_id, filename, user_id, mime_type)
        await service.upsert_entity_node("OpenAI", "ORG", user_id)
        await service.link_file_to_entity(file_id, "OpenAI", user_id)
        await service.close()
    """

    def __init__(self, driver: AsyncDriver) -> None:
        """Initialise the service with a connected Neo4j async driver.

        Args:
            driver: An initialised and connectivity-verified AsyncDriver instance.
        """
        self._driver = driver

    async def upsert_file_node(
        self,
        file_id: str,
        filename: str,
        user_id: str,
        mime_type: str,
    ) -> None:
        """Create or merge a File node in Neo4j.

        Uses MERGE on ``id`` so that re-processing the same file is idempotent.
        Properties are set unconditionally on every call to keep the node current.

        Args:
            file_id: UUID string of the file in kms_files.
            filename: Original filename stored on the node as ``filename``.
            user_id: UUID of the owning user stored on the node.
            mime_type: MIME type stored on the node (e.g. ``text/markdown``).

        Raises:
            Neo4jWriteError: If the Cypher write fails for any reason.
        """
        cypher = """
            MERGE (f:File {id: $file_id})
            SET f.filename  = $filename,
                f.user_id   = $user_id,
                f.mime_type = $mime_type
        """
        try:
            async with self._driver.session() as session:
                await session.run(
                    cypher,
                    file_id=file_id,
                    filename=filename,
                    user_id=user_id,
                    mime_type=mime_type,
                )
            logger.debug("File node upserted", file_id=file_id)
        except Exception as exc:
            raise Neo4jWriteError(operation="MERGE File", reason=str(exc)) from exc

    async def upsert_entity_node(
        self,
        entity_text: str,
        entity_label: str,
        user_id: str,
    ) -> str:
        """Create or merge an Entity node. Returns the entity's text identifier.

        MERGE is keyed on ``(text, user_id)`` so that the same entity surface
        form is shared across files belonging to the same user.

        Args:
            entity_text: Surface form of the entity (e.g. ``"Alice Smith"``).
            entity_label: KMS canonical label (PERSON, ORG, GPE, CONCEPT).
            user_id: UUID of the owning user — scopes entities per user.

        Returns:
            str: The ``entity_text`` value, used as the stable node identifier.

        Raises:
            Neo4jWriteError: If the Cypher write fails for any reason.
        """
        cypher = """
            MERGE (e:Entity {text: $text, user_id: $user_id})
            ON CREATE SET e.label = $label
        """
        try:
            async with self._driver.session() as session:
                await session.run(
                    cypher,
                    text=entity_text,
                    user_id=user_id,
                    label=entity_label,
                )
            logger.debug(
                "Entity node upserted",
                entity_text=entity_text,
                entity_label=entity_label,
            )
            return entity_text
        except Exception as exc:
            raise Neo4jWriteError(operation="MERGE Entity", reason=str(exc)) from exc

    async def link_file_to_entity(
        self,
        file_id: str,
        entity_text: str,
        user_id: str,
    ) -> None:
        """Create a MENTIONS relationship between a File node and an Entity node.

        Requires that both the File node (keyed on ``id``) and the Entity node
        (keyed on ``text`` + ``user_id``) already exist. The relationship is
        idempotent via MERGE.

        Args:
            file_id: UUID string of the File node.
            entity_text: Surface form of the entity matching the Entity node's ``text``.
            user_id: UUID of the owning user, used to scope the Entity lookup.

        Raises:
            Neo4jWriteError: If the Cypher write fails for any reason.
        """
        cypher = """
            MATCH (f:File {id: $file_id})
            MATCH (e:Entity {text: $entity_text, user_id: $user_id})
            MERGE (f)-[:MENTIONS]->(e)
        """
        try:
            async with self._driver.session() as session:
                await session.run(
                    cypher,
                    file_id=file_id,
                    entity_text=entity_text,
                    user_id=user_id,
                )
            logger.debug(
                "MENTIONS edge created",
                file_id=file_id,
                entity_text=entity_text,
            )
        except Exception as exc:
            raise Neo4jWriteError(
                operation="MERGE MENTIONS", reason=str(exc)
            ) from exc

    async def link_wiki_references(
        self,
        source_filename: str,
        target_name: str,
        user_id: str,
    ) -> None:
        """Create a REFERENCES relationship for a [[wiki link]] target.

        Merges a Topic node for the link target (scoped by user), then merges
        a REFERENCES edge from the File node (matched by filename + user_id).

        Args:
            source_filename: Filename of the File node that contains the link.
            target_name: Normalised link target (e.g. ``"Python"``).
            user_id: UUID of the owning user — scopes both nodes.

        Raises:
            Neo4jWriteError: If the Cypher write fails for any reason.
        """
        cypher = """
            MERGE (t:Topic {name: $target_name, user_id: $user_id})
            WITH t
            MATCH (f:File {filename: $source_filename, user_id: $user_id})
            MERGE (f)-[:REFERENCES]->(t)
        """
        try:
            async with self._driver.session() as session:
                await session.run(
                    cypher,
                    target_name=target_name,
                    user_id=user_id,
                    source_filename=source_filename,
                )
            logger.debug(
                "REFERENCES edge created",
                source_filename=source_filename,
                target_name=target_name,
            )
        except Exception as exc:
            raise Neo4jWriteError(
                operation="MERGE REFERENCES", reason=str(exc)
            ) from exc

    async def close(self) -> None:
        """Close the underlying Neo4j async driver.

        Should be called once during worker shutdown. After calling this method
        the service instance must not be used again.
        """
        await self._driver.close()
        logger.info("Neo4j driver closed")
