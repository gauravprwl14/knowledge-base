"""OTel instrumentation — call configure_telemetry() before any route imports."""
import os
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor


def configure_telemetry(service_name: str) -> None:
    """Configure OTel SDK. Must be called before FastAPI app creation."""
    if os.getenv("OTEL_ENABLED", "true").lower() == "false":
        return
    provider = TracerProvider()
    provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(
            endpoint=os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otel-collector:4317")
        ))
    )
    trace.set_tracer_provider(provider)
    HTTPXClientInstrumentor().instrument()


tracer = trace.get_tracer("rag-service")
