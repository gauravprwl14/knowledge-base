---
name: kb-observability
description: OpenTelemetry instrumentation, Jaeger tracing, Prometheus metrics, Grafana dashboards
argument-hint: "<observability-task>"
---

# KMS Observability

You instrument and monitor the KMS system using OpenTelemetry, Jaeger, Prometheus, and Grafana.

## OTel SDK Setup — NestJS

```typescript
// src/telemetry.ts — load BEFORE app modules
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
  metricReader: new PrometheusExporter({ port: 9464 }),
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```

## OTel SDK Setup — Python (FastAPI / Workers)

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

provider = TracerProvider()
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
trace.set_tracer_provider(provider)
FastAPIInstrumentor.instrument_app(app)
```

## Key Metrics to Track

| Metric | Type | Labels | Alert Threshold |
|---|---|---|---|
| `kms_search_duration_seconds` | Histogram | service, method | p95 > 500ms |
| `kms_search_requests_total` | Counter | status, user_tier | error rate > 1% |
| `kms_job_processing_duration` | Histogram | provider, status | p95 > 60s |
| `kms_job_queue_depth` | Gauge | queue_name | > 100 pending |
| `kms_embed_throughput_chunks` | Counter | model | — |
| `kms_embed_batch_duration` | Histogram | batch_size | p95 > 5s |
| `kms_api_errors_total` | Counter | endpoint, code | rate > 5/min |
| `kms_cache_hit_ratio` | Gauge | cache_type | < 0.50 warning |

## Trace Propagation Headers

Always propagate these headers between services:
- `traceparent` (W3C standard)
- `tracestate`

In NestJS HTTP client: use `@opentelemetry/instrumentation-http` (auto-instrumented).
In Python `httpx` / `requests`: use `opentelemetry-instrumentation-httpx`.

## Prometheus Scrape Config

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'kms-api'
    static_configs: [{ targets: ['kms-api:9464'] }]
  - job_name: 'search-api'
    static_configs: [{ targets: ['search-api:9464'] }]
  - job_name: 'voice-app'
    static_configs: [{ targets: ['voice-app:9464'] }]
  - job_name: 'workers'
    static_configs: [{ targets: ['worker-embed:9464', 'worker-extract:9464'] }]
```

## Grafana Dashboard Structure

Organize dashboards into 3 rows:

1. **Service Health**: request rate, error rate, p95 latency per service
2. **Job Processing**: queue depth, processing duration, success/fail rates per provider
3. **Infrastructure**: CPU, memory, DB connections, RabbitMQ queue depth

## Alerting Thresholds

| Condition | Severity |
|---|---|
| Search p95 > 500ms for 5 min | Warning |
| Search p95 > 1000ms for 2 min | Critical |
| Job queue depth > 100 | Warning |
| Error rate > 1% over 5 min | Warning |
| Error rate > 5% over 1 min | Critical |
| Worker processing 0 jobs for 10 min | Warning |

## Quality Checklist

- [ ] Every service exports metrics on `/metrics` endpoint
- [ ] Trace context propagated on all outbound HTTP calls
- [ ] Span names are meaningful (not just HTTP method + path)
- [ ] Key business spans include `user_id` attribute
- [ ] Dashboards cover all 3 rows (health, jobs, infra)
