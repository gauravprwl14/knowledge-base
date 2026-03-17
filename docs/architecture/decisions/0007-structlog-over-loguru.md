# 0007 — structlog over loguru for Python Logging

- **Status**: Accepted
- **Date**: 2026-03-17
- **Deciders**: Architecture Team
- **Tags**: [python, logging, observability]

## Context and Problem Statement

Python services need structured JSON logging with automatic injection of OpenTelemetry `trace_id`, `span_id`, and `request_id` from contextvars. The choice must integrate cleanly with FastAPI middleware, asyncio, and OTel.

## Decision Drivers

- JSON output for Grafana/Loki
- OTel context auto-injection (trace_id, span_id)
- contextvars support for async request correlation
- Active maintenance

## Considered Options

- Option A: `structlog` with `contextvars`
- Option B: `loguru`
- Option C: `python-json-logger` + stdlib `logging`

## Decision Outcome

Chosen: **Option A — structlog** — First-class `contextvars` support via `merge_contextvars` processor; integrates with OTel trace context; highly composable processor pipeline.

### Consequences

**Good:**
- `merge_contextvars` automatically injects all bound context (trace_id, request_id, user_id) into every log entry within the async context
- Processor pipeline allows custom enrichment without modifying call sites
- `bind_contextvars()` / `clear_contextvars()` in FastAPI middleware enables per-request context

**Bad / Trade-offs:**
- More configuration than loguru (explicit processor chain)
- API is less intuitive than loguru for new developers

## Pros and Cons of the Options

### Option A: structlog

- ✅ Native contextvars support via `merge_contextvars` processor
- ✅ Composable processor pipeline
- ✅ Works with OTel — can extract trace_id from active span
- ✅ Actively maintained
- ❌ More verbose setup than loguru
- ❌ Less intuitive API at first glance

### Option B: loguru

- ✅ Extremely simple API (`from loguru import logger`)
- ✅ Beautiful development output
- ❌ No native contextvars support — requires patching
- ❌ OTel integration is manual and fragile
- ❌ Contextvars injection requires thread-local workarounds in async code

### Option C: python-json-logger + stdlib

- ✅ Stdlib-compatible — lowest dependency risk
- ✅ JSON output built-in
- ❌ Verbose setup
- ❌ No contextvars support
- ❌ Each module needs `logging.getLogger(__name__)` — scattered configuration
