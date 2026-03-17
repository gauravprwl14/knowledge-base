from app.connectors.base import BaseConnector
from app.connectors.local import LocalFileConnector
from app.models.messages import SourceType

_REGISTRY: dict[str, type[BaseConnector]] = {
    SourceType.LOCAL: LocalFileConnector,
}


def get_connector(source_type: str) -> BaseConnector:
    """Factory: return a connector instance for the given source type."""
    connector_cls = _REGISTRY.get(source_type)
    if not connector_cls:
        raise ValueError(f"No connector registered for source type: {source_type}")
    return connector_cls()


def register_connector(source_type: str, connector_cls: type[BaseConnector]) -> None:
    """Register a new connector. Call from connector module to self-register."""
    _REGISTRY[source_type] = connector_cls
