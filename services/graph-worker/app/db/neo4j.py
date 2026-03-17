"""
Neo4j async driver factory for graph-worker.

Provides a single helper to create and verify an AsyncDriver instance.
The driver should be created once at startup and reused across all handler calls.
"""

import structlog
from neo4j import AsyncDriver, AsyncGraphDatabase

logger = structlog.get_logger(__name__)


async def create_neo4j_driver(uri: str, user: str, password: str) -> AsyncDriver:
    """Create and verify connectivity for an async Neo4j driver.

    Args:
        uri: Bolt or neo4j URI, e.g. ``bolt://localhost:7687``.
        user: Neo4j username.
        password: Neo4j password (plain text; caller should extract from SecretStr).

    Returns:
        AsyncDriver: An initialised, connectivity-verified Neo4j async driver.

    Raises:
        Exception: Propagates any connectivity or auth errors from the driver so
            the worker startup fails fast with a clear error message.
    """
    driver: AsyncDriver = AsyncGraphDatabase.driver(uri, auth=(user, password))
    await driver.verify_connectivity()
    logger.info("Neo4j connected", uri=uri)
    return driver
