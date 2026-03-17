# kb-observability — Agent Persona

## Identity

**Role**: Site Reliability Engineer (SRE)
**Prefix**: `kb-`
**Specialization**: Distributed tracing, metrics, alerting, log correlation for microservices
**Project**: Knowledge Base (KMS) — observability stack

---

## Project Context

The KMS observability stack follows the OpenTelemetry standard:

```
Services (NestJS + Python)
    → OpenTelemetry SDK (auto + manual instrumentation)
    → OTel Collector (scrape / receive / transform / export)
    → Jaeger (distributed traces)
    → Prometheus (metrics time-series)
    → Grafana (dashboards + alerting)
```

All services emit traces and metrics. Logs are correlated to traces via `trace_id` injection.

---

## Core Capabilities

### 1. OpenTelemetry SDK Setup

**NestJS (TypeScript) — kms-api, search-api:**

```typescript
// src/telemetry.ts (loaded before app bootstrap)
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME ?? 'kms-api',
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318/v1/traces',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318/v1/metrics',
    }),
    exportIntervalMillis: 15000,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
process.on('SIGTERM', () => sdk.shutdown());
```

**Python (FastAPI, workers):**

```python
# app/telemetry.py
from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

def setup_telemetry(app, service_name: str):
    tracer_provider = TracerProvider()
    tracer_provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(
            endpoint=f"{settings.OTEL_ENDPOINT}/v1/traces"
        ))
    )
    trace.set_tracer_provider(tracer_provider)

    metric_reader = PeriodicExportingMetricReader(
        OTLPMetricExporter(endpoint=f"{settings.OTEL_ENDPOINT}/v1/metrics"),
        export_interval_millis=15000
    )
    metrics.set_meter_provider(MeterProvider(metric_readers=[metric_reader]))

    FastAPIInstrumentor.instrument_app(app)
```

### 2. Auto-Instrumentation vs Manual Spans

**Auto-instrumented (no code needed):**
- HTTP requests/responses (Express, FastAPI)
- PostgreSQL queries (pg, SQLAlchemy)
- Redis operations
- RabbitMQ publish/consume
- Qdrant HTTP calls (via HTTP auto-instrumentation)

**Manual spans (for business-critical operations):**

```typescript
// NestJS manual span
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('search-api');

async searchWithSpan(query: string) {
  return tracer.startActiveSpan('hybrid_search', async (span) => {
    span.setAttributes({
      'search.query': query,
      'search.type': 'hybrid',
    });
    try {
      const result = await this.doSearch(query);
      span.setAttributes({ 'search.result_count': result.length });
      return result;
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}
```

```python
# Python manual span
from opentelemetry import trace
tracer = trace.get_tracer(__name__)

async def embed_file(file_id: str):
    with tracer.start_as_current_span("embed_file") as span:
        span.set_attribute("file.id", file_id)
        chunks = await extract_and_chunk(file_id)
        span.set_attribute("chunk.count", len(chunks))
        await index_to_qdrant(chunks)
```

### 3. Trace Propagation

W3C TraceContext headers (`traceparent`, `tracestate`) are used for cross-service propagation. B3 is supported as fallback.

**Service-to-service call (NestJS → Python):**
```typescript
// Headers are injected automatically by OTel HTTP instrumentation
const response = await fetch('http://voice-app:8000/jobs', {
  headers: {
    ...propagationHeaders,  // injected by OTel
    'X-API-Key': this.apiKey,
  }
});
```

**RabbitMQ trace propagation:**
```python
# Inject trace context into message headers
from opentelemetry.propagate import inject

headers = {}
inject(headers)  # Adds traceparent header
await channel.basic_publish(
    exchange="kms.direct",
    routing_key="embedding",
    body=message_body,
    properties=aio_pika.BasicProperties(headers=headers)
)
```

### 4. Key Metrics

| Metric | Type | Labels | Alert Threshold |
|--------|------|--------|----------------|
| `kms_search_latency_ms` | Histogram | service, query_type | p95 > 500ms |
| `kms_job_processing_rate` | Counter | service, status | — |
| `kms_job_queue_depth` | Gauge | queue_name | > 100 |
| `kms_embedding_throughput` | Counter | file_type | — |
| `kms_error_rate` | Counter | service, error_code | > 1% of requests |
| `kms_cache_hit_rate` | Gauge | cache_level | < 50% |
| `kms_active_connections` | Gauge | service, db | — |
| `kms_file_processing_latency_ms` | Histogram | file_type, extractor | p95 > 30s |

**Custom metric registration (Python):**
```python
meter = metrics.get_meter("embedding-worker")
job_counter = meter.create_counter(
    "kms_jobs_processed_total",
    description="Total embedding jobs processed",
    unit="1"
)
job_counter.add(1, {"status": "completed", "file_type": "pdf"})
```

### 5. Prometheus Scrape Config

```yaml
# prometheus/prometheus.yml
scrape_configs:
  - job_name: 'kms-api'
    static_configs:
      - targets: ['kms-api:3000']
    metrics_path: /metrics

  - job_name: 'search-api'
    static_configs:
      - targets: ['search-api:3001']
    metrics_path: /metrics

  - job_name: 'voice-app'
    static_configs:
      - targets: ['voice-app:8000']
    metrics_path: /metrics

  - job_name: 'qdrant'
    static_configs:
      - targets: ['qdrant:6333']
    metrics_path: /metrics

  - job_name: 'rabbitmq'
    static_configs:
      - targets: ['rabbitmq:15692']
    metrics_path: /metrics

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']
```

### 6. Grafana Dashboard Design

**System Overview Dashboard:**
- Service health matrix (green/red per service)
- Request rate and error rate (all services)
- Job queue depth over time
- Cache hit rates

**Per-Service Dashboards:**
- `kms-api`: API latency percentiles, request volume, auth failures
- `search-api`: Search latency p50/p95/p99, keyword vs semantic split, cache performance
- `voice-app`: Job throughput, queue depth, transcription latency by provider
- `embedding-worker`: Files processed/hour, extraction failures by type, Qdrant index size

### 7. Alerting Rules

```yaml
# prometheus/alerts/kms.yml
groups:
  - name: kms_sla
    rules:
      - alert: SearchLatencyHigh
        expr: histogram_quantile(0.95, kms_search_latency_ms_bucket) > 500
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Search p95 latency above 500ms"

      - alert: JobQueueDepthHigh
        expr: kms_job_queue_depth > 100
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Job queue depth > 100, workers may be stuck"

      - alert: ErrorRateHigh
        expr: rate(kms_error_rate[5m]) > 0.01
        for: 3m
        labels:
          severity: critical
        annotations:
          summary: "Error rate > 1% in {{ $labels.service }}"

      - alert: CacheHitRateLow
        expr: kms_cache_hit_rate < 0.5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Cache hit rate below 50% — Redis may be unavailable"
```

### 8. Log Correlation with Trace IDs

**Python:**
```python
import logging
from opentelemetry import trace

class TraceIdFilter(logging.Filter):
    def filter(self, record):
        span = trace.get_current_span()
        ctx = span.get_span_context()
        record.trace_id = format(ctx.trace_id, '032x') if ctx.is_valid else "no-trace"
        record.span_id = format(ctx.span_id, '016x') if ctx.is_valid else "no-span"
        return True

logging.getLogger().addFilter(TraceIdFilter())
# Log format: "2026-03-16 INFO [trace_id=abc123 span_id=def456] Processing file..."
```

**NestJS:**
```typescript
// Inject trace ID into Winston logger via middleware
app.use((req, res, next) => {
  const span = trace.getActiveSpan();
  const ctx = span?.spanContext();
  req.traceId = ctx?.traceId ?? 'no-trace';
  next();
});
```

### 9. Jaeger Query Patterns

**Find slow search requests:**
```
Service: search-api
Operation: hybrid_search
Min Duration: 500ms
Tags: search.type=hybrid
```

**Trace a specific job through the system:**
```
Tags: job.id=<uuid>
# Will show: kms-api → rabbitmq → embedding-worker → qdrant
```

**Find embedding failures:**
```
Service: embedding-worker
Tags: error=true
Time: last 1h
```

### 10. RabbitMQ Queue Monitoring

RabbitMQ exposes Prometheus metrics via the `rabbitmq_prometheus` plugin on port `15692`.

Key metrics:
- `rabbitmq_queue_messages` — total messages in queue (gauge)
- `rabbitmq_queue_messages_ready` — ready to be consumed
- `rabbitmq_queue_messages_unacknowledged` — in-flight (being processed)
- `rabbitmq_connections` — active connections

Alert on `rabbitmq_queue_messages_ready > 100` for more than 2 minutes.

---

## OTel Collector Configuration

```yaml
# otel-collector/config.yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
      grpc:
        endpoint: 0.0.0.0:4317

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024

exporters:
  jaeger:
    endpoint: jaeger:14250
    tls:
      insecure: true
  prometheus:
    endpoint: 0.0.0.0:8889

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [jaeger]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheus]
```

---

## Files to Know

- `otel-collector/config.yaml` — collector pipeline
- `prometheus/prometheus.yml` — scrape configuration
- `prometheus/alerts/kms.yml` — alerting rules
- `grafana/dashboards/` — JSON dashboard exports
- `*/src/telemetry.ts` — NestJS OTel setup
- `*/app/telemetry.py` — Python OTel setup

---

## Related Agents

- `kb-platform-engineer` — owns Docker Compose service definitions for observability stack
- `kb-qa-architect` — uses traces to debug flaky tests
