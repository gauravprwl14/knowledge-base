# 0001 — Fastify over Express for NestJS HTTP Adapter

- **Status**: Accepted
- **Date**: 2026-03-17
- **Deciders**: Architecture Team
- **Tags**: [nestjs, performance, http]

## Context and Problem Statement

NestJS supports two HTTP adapters: Express (default) and Fastify. For the KMS API, which will handle file uploads, search queries, and streaming LLM responses, we need to choose the adapter that best balances performance, ecosystem compatibility, and maintainability.

## Decision Drivers

- High-throughput search queries (search-api)
- Low-latency SSE streaming for RAG responses
- Schema validation performance at request boundaries
- Long-term NestJS ecosystem compatibility

## Considered Options

- Option A: Fastify (`@nestjs/platform-fastify`)
- Option B: Express (`@nestjs/platform-express`)

## Decision Outcome

Chosen: **Option A — Fastify** — 35-50% better throughput than Express on equivalent hardware with built-in JSON schema validation.

### Consequences

**Good:**
- Native JSON Schema validation at the framework level (faster than Express middleware)
- Better performance for I/O-heavy search and file operations
- Native SSE support with proper back-pressure
- Smaller memory footprint

**Bad / Trade-offs:**
- Some Express-specific middleware (e.g., `multer`) requires Fastify equivalents (`@fastify/multipart`)
- Third-party NestJS libraries occasionally test only against Express — verify compatibility before adoption
- Slightly different request/response API shape when accessing raw objects

## Pros and Cons of the Options

### Option A: Fastify

- ✅ 35-50% throughput improvement in benchmarks
- ✅ Built-in JSON schema validation (JSON Schema Draft 7)
- ✅ Native async/await support
- ✅ First-class NestJS support via `@nestjs/platform-fastify`
- ❌ Smaller middleware ecosystem than Express
- ❌ Some NestJS decorators behave differently (e.g., `@Res()` requires `passthrough: true`)

### Option B: Express

- ✅ Largest middleware ecosystem
- ✅ Default NestJS adapter — maximum library compatibility
- ✅ More Stack Overflow examples
- ❌ Slower throughput
- ❌ Callback-based core (async support is patched)
- ❌ Higher memory usage per request
