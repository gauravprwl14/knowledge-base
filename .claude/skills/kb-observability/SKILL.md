---
name: kb-observability
description: |
  Instruments services with OpenTelemetry spans, configures Prometheus metrics, Grafana dashboards,
  and structured logging. Use when adding OTel spans to a new I/O path, setting up a new service
  for observability, diagnosing missing traces, adding Prometheus metrics, or creating Grafana panels.
  Trigger phrases: "add tracing", "instrument this service", "add a span", "set up metrics",
  "configure OTel", "add Prometheus metric", "create a dashboard", "why is there no trace".
argument-hint: "<observability-task>"
---

## Step 0 — Orient Before Instrumenting

1. Read `CLAUDE.md` — OTel mandatory patterns: `import './instrumentation'` line 1 in main.ts, `configure_telemetry(app)` before route imports in Python
2. Run `git log --oneline -5` — understand what service was recently changed
3. Check if the service already has OTel setup: look for `instrumentation.ts` or `configure_telemetry` call
4. Check existing Prometheus metrics: `curl localhost:9090/metrics` — avoid duplicate metric names
5. Read the relevant `FOR-*.md` docs — understand what this service does before instrumenting it

## Observability Engineer's Cognitive Mode

As the KMS observability engineer, these questions run automatically:

**Tracing instincts**
- Is every I/O operation wrapped in a span? A trace with gaps is misleading — it shows fast when the missing span is the slow part.
- Is the W3C `traceparent` header propagated across every service boundary? Without it, traces break at the first HTTP call and you lose the distributed picture.
- Does the span have useful attributes? A span named `handler` with no attributes is useless. A span named `search.hybrid` with `user_id`, `query_length`, `result_count` is actionable.
- Are errors recorded on the span? `span.record_exception(e)` and `span.set_status(StatusCode.ERROR)` — both required, not just one.

**Metrics instincts**
- Is this metric a counter, gauge, or histogram? Latency is a histogram. Active connections is a gauge. Request count is a counter. Using the wrong type breaks aggregation.
- Will this metric create a high-cardinality label? Never use `userId`, `fileId`, or `query_text` as a label — that's millions of time series and will OOM Prometheus.
- Is there a corresponding alert? A metric that nobody alerts on is decoration. Every SLO-critical metric needs an alerting rule.
- Is the metric name namespaced by service? `kms_search_duration_seconds` not `search_duration` — prevents collision across services.

**Logging instincts**
- Does every log entry have `trace_id` and `span_id`? Without these, you cannot correlate logs to traces.
- Is the log level correct? INFO for normal operations, WARN for recoverable issues, ERROR for failures that need attention.
- Is there a log entry at the start and end of every significant operation? A log entry only on failure means you have no baseline to compare against.

**Completeness standard**
An instrumented service without latency histograms, without error rate counters, and without trace propagation is partially instrumented — which is worse than uninstrumented, because it creates false confidence in observability. Always instrument the full triad: traces + metrics + logs.

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
