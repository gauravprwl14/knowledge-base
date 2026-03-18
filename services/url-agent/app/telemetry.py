"""OpenTelemetry configuration for url-agent.

Must be imported and configured before any route or service modules
are loaded, so that auto-instrumentation patches are applied in time.

Usage in main.py lifespan:
    from app.telemetry import configure_telemetry
    configure_telemetry(app)

Follows the KMS OTel pattern from ENGINEERING_STANDARDS.md §OTel Python.
"""
from __future__ import annotations

import structlog

logger = structlog.get_logger(__name__)


def configure_telemetry(app) -> None:  # noqa: ANN001
    """Configure OpenTelemetry tracing for the FastAPI application.

    When OTEL_ENABLED=false (the default in development), this is a no-op.
    When enabled, instruments FastAPI with the OTLP gRPC exporter pointed
    at OTEL_EXPORTER_OTLP_ENDPOINT.

    Args:
        app: The FastAPI application instance to instrument.
    """
    from app.config import get_settings

    settings = get_settings()

    if not settings.otel_enabled:
        # Skip OTel setup in dev/test — avoids needing a collector running locally
        logger.debug("OTel disabled — skipping telemetry configuration")
        return

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        # Build a resource identifying this service in Tempo / Grafana traces
        resource = Resource.create({"service.name": settings.app_name})
        provider = TracerProvider(resource=resource)

        # Export spans to OTel collector (Tempo) via gRPC
        exporter = OTLPSpanExporter(endpoint=settings.otel_endpoint, insecure=True)
        provider.add_span_processor(BatchSpanProcessor(exporter))

        trace.set_tracer_provider(provider)

        # Patch FastAPI to create spans for every request automatically
        FastAPIInstrumentor.instrument_app(app)

        logger.info(
            "OpenTelemetry configured",
            service=settings.app_name,
            endpoint=settings.otel_endpoint,
        )
    except ImportError:
        # OTel packages may not be installed in minimal dev environments
        logger.warning("OTel packages not installed — traces disabled")
