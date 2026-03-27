"""
OTel instrumentation setup for embed-worker.
Call configure_telemetry() before any route or AMQP imports in lifespan.
"""
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.aio_pika import AioPikaInstrumentor


def configure_telemetry(service_name: str) -> None:
    """Configure OTel tracing with OTLP gRPC export and aio-pika auto-instrumentation.

    Args:
        service_name: Logical name for this service (used as OTel service.name).
    """
    provider = TracerProvider()
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    AioPikaInstrumentor().instrument()
