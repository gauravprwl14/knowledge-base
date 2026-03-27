"""
OTel instrumentation setup for dedup-worker.

Call configure_telemetry() before any route or AMQP imports in lifespan.
"""

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.aio_pika import AioPikaInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


def configure_telemetry(service_name: str) -> None:
    """Configure OTel tracing with OTLP gRPC export and aio-pika auto-instrumentation.

    No-op when the OTEL_ENABLED env var is set to 'false' (checked by the caller
    via settings.otel_enabled before this function is invoked).

    Args:
        service_name: Logical name for this service (used as OTel service.name resource attribute).
    """
    provider = TracerProvider()
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    AioPikaInstrumentor().instrument()


tracer = trace.get_tracer(__name__)
