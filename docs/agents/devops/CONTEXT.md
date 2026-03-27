# DevOps Group — CONTEXT

## Agents in This Group

| Skill | File | Responsibility |
|-------|------|----------------|
| `/kb-platform-engineer` | `devops/platform-engineer.md` | Docker Compose, CI/CD pipelines, environment configuration, secret management |
| `/kb-observability` | `devops/observability.md` | OpenTelemetry instrumentation, Jaeger tracing, Prometheus metrics, Grafana dashboards |

---

## When to Use `/kb-platform-engineer`

Use the platform engineer when:

- Adding a **new service** to `docker-compose.yml` (with health checks, dependencies, volumes)
- Configuring **docker-compose.override.yml** for development hot reload
- Writing or updating a **Dockerfile** (multi-stage build, layer caching, non-root user)
- Setting up **CI/CD pipelines** (GitHub Actions: lint, test, build, deploy)
- Managing **environment variables** and `.env` files across dev/test/prod
- Configuring **secret management** for production (external secrets, vault integration)
- Adding a **new external dependency** (Qdrant, Neo4j, MinIO, additional Redis instances)
- Writing **docker-compose.prod.yml** production configuration (resource limits, restart policies, network isolation)
- Debugging **container networking** or volume mount issues
- Setting up **healthcheck** endpoints and Docker health check commands

The platform engineer owns: all `docker-compose*.yml` files, `Dockerfile`s, CI/CD workflow files, `.env.example`.

---

## When to Use `/kb-observability`

Use the observability agent when:

- Instrumenting code with **OpenTelemetry spans** (NestJS interceptors, Python worker decorators)
- Configuring the **Jaeger** exporter and trace sampling strategy
- Defining **Prometheus metrics** (counters, gauges, histograms) for a new feature
- Creating or updating **Grafana dashboards** (search latency, worker throughput, error rates)
- Setting up **SLI/SLO definitions** for a service (P95 latency, availability, error rate)
- Adding **structured logging** with trace correlation (trace_id, span_id in log fields)
- Configuring **alerting rules** (Prometheus AlertManager or Grafana alerts)
- Debugging **missing traces** or broken trace propagation between services
- Reviewing **metric naming conventions** (use `kms_`, `search_`, `voice_` prefixes)

The observability agent owns: OTel config, Jaeger docker-compose setup, Prometheus scrape configs, Grafana provisioning files.

---

## Typical DevOps Flows

**Adding a new service:**
```
/kb-platform-engineer "Add Neo4j to docker-compose.yml with health check and volume"
    ↓
/kb-observability "Add Neo4j query duration histogram to Prometheus metrics"
```

**New feature with observability:**
```
/kb-backend-lead "Implement SearchService"
    ↓
/kb-observability "Add OTel span and search_latency_ms histogram to SearchService"
    ↓
/kb-observability "Create Grafana panel for search P50/P95/P99 latency"
```

---

## Service Port Reference

| Service | Port | Notes |
|---------|------|-------|
| Jaeger UI | 16686 | Distributed trace visualization |
| Jaeger OTLP gRPC | 4317 | Telemetry ingestion |
| Prometheus | 9090 | Metrics scraping |
| Grafana | 3001 | Dashboard UI |

---

## Shared Resources

- `docs/agents/shared/variables.md` — All service ports, environment configuration patterns
