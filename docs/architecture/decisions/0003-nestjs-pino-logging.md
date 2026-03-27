# 0003 — nestjs-pino over Winston for NestJS Logging

- **Status**: Accepted
- **Date**: 2026-03-17
- **Deciders**: Architecture Team
- **Tags**: [nestjs, logging, observability]

## Context and Problem Statement

NestJS provides a built-in `Logger` and supports third-party logging libraries. For production observability, we need structured JSON logging, OpenTelemetry context injection (trace_id, span_id), and low overhead. The choice affects every service and is hard to change later.

## Decision Drivers

- Structured JSON output (required for Grafana/Loki log parsing)
- Automatic injection of OTel `trace_id` and `span_id`
- Low logging overhead (benchmarked)
- Native NestJS integration (no manual wiring)

## Considered Options

- Option A: `nestjs-pino` + `pino`
- Option B: Winston + `nest-winston`
- Option C: NestJS built-in Logger

## Decision Outcome

Chosen: **Option A — nestjs-pino** — Pino is the fastest Node.js JSON logger; `nestjs-pino` integrates it with NestJS DI via `@InjectPinoLogger`, providing automatic OTel context propagation.

### Consequences

**Good:**
- Structured JSON logs out of the box with `pino-pretty` for development
- `pino-http` middleware adds `trace_id`/`span_id` from OTel active context automatically
- `@InjectPinoLogger(ServiceName.name)` provides per-class logger context
- 5-7x faster than Winston in throughput benchmarks

**Bad / Trade-offs:**
- Requires switching from `new Logger(ServiceName.name)` across all files
- `pino` is async (uses a worker thread) — very rare edge cases with uncaught exceptions may lose last log line

## Pros and Cons of the Options

### Option A: nestjs-pino

- ✅ Fastest JSON logger in Node.js ecosystem
- ✅ First-class NestJS integration with `LoggerModule`
- ✅ Automatic HTTP request logging via `pino-http`
- ✅ OTel trace context automatically included
- ❌ Breaking change from built-in Logger pattern
- ❌ Async logging (negligible in practice)

### Option B: Winston

- ✅ Extremely flexible transport system
- ✅ Large ecosystem of transports
- ❌ 3-5x slower than pino
- ❌ Manual OTel context injection
- ❌ `nest-winston` wrapper adds indirection

### Option C: Built-in Logger

- ✅ Zero dependencies
- ✅ Works out of the box
- ❌ No JSON output (console text only)
- ❌ No OTel trace injection
- ❌ Not suitable for production observability
