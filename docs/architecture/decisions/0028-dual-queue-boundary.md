---
id: ADR-0028
created_at: 2026-03-18
content_type: architecture-decision-record
status: accepted
generator_model: claude-sonnet-4-6
---

# 0028 — Consolidate to RabbitMQ: Remove BullMQ from Queue Infrastructure

- **Status**: Accepted
- **Date**: 2026-03-18
- **Deciders**: Architecture Team
- **Tags**: [queue, rabbitmq, amqp, bullmq, nestjs, python]

## Context and Problem Statement

`kms-api` currently imports both `@nestjs/bullmq` (Redis-backed) and `amqplib` (RabbitMQ/AMQP).
All Python workers use RabbitMQ exclusively.

The original `queue.module.ts` registered BullMQ queues named `kms.embed`, `kms.graph`,
`kms.transcription` — the same names as the RabbitMQ queues Python workers consume.
These were placeholders. No BullMQ consumer ever existed for them. They created a false
impression that NestJS was wired to Python via BullMQ, when it was not.

The question: **do we need two queue systems at all?**

## Decision Drivers

- Operational simplicity: one queue system to monitor, configure, and debug
- RabbitMQ is already the source of truth for all worker coordination
- NestJS already has `amqplib` wired for `ScanJobPublisher`
- `@nestjs/schedule` covers all cron/periodic scheduling needs within NestJS without Redis
- ADR-0021 explicitly rejected BullMQ for the WorkflowEngine — it chose a NestJS state machine
  with Redis key-value state, not BullMQ job chains
- Redis is already in the stack for the ACP session store (not for queuing)

## Considered Options

### Option A — Keep BullMQ + RabbitMQ (dual-queue with strict boundary)

- ✅ BullMQ gives job dashboard, progress tracking, repeatable jobs
- ✅ BullMQ `@nestjs/bullmq` has good NestJS integration
- ❌ Two queue systems to operate and reason about
- ❌ Same names (`kms.embed`, `kms.graph`) appear in both systems — developers must memorise
  which broker each queue uses; silent message loss if the wrong one is published to
- ❌ ADR-0021 rejected BullMQ for workflow orchestration; adding it back for scheduling
  is inconsistent with that decision
- ❌ No NestJS service actually consumes BullMQ queues at present — the registered queues
  are all placeholders

### Option B — RabbitMQ for all async jobs + `@nestjs/schedule` for cron (CHOSEN)

- ✅ Single queue infrastructure: one broker, one mental model, one set of credentials
- ✅ RabbitMQ supports durable queues, DLX, priority, message TTL, W3C trace headers
- ✅ `@nestjs/schedule` (`@Cron`, `@Interval`) replaces BullMQ repeatable jobs for NestJS-internal
  timing with zero new infrastructure
- ✅ Python workers already use RabbitMQ — no change needed on their side
- ✅ Redis remains in the stack for the ACP session store (not removed) — BullMQ dependency
  on Redis was the only additional consumer; removing BullMQ doesn't remove Redis
- ❌ Loses BullMQ's job progress UI (acceptable: OTel + Grafana provide observability)
- ❌ RabbitMQ does not natively support delayed/scheduled messages without a plugin; use
  `@nestjs/schedule` for timing instead

## Decision Outcome

**Option B — Consolidate to RabbitMQ + `@nestjs/schedule`.**

Remove `@nestjs/bullmq` and `bullmq` from `kms-api/package.json`.
Use `@nestjs/schedule` for all time-based triggers inside NestJS.
All queue messages (regardless of producer/consumer language) go through RabbitMQ.

## Queue Topology (final)

```
kms-api (NestJS / amqplib)
    │
    ├── Cron: @nestjs/schedule @Cron('*/5 * * * *')
    │         → scheduleDriveSyncCheck() → publish kms.scan
    │
    ├── Cron: @nestjs/schedule @Cron('*/25 * * * *')
    │         → scheduleTokenRefresh()
    │
    └── On-demand: ScanJobPublisher.publishScanJob()
                  → kms.scan (RabbitMQ, durable, DLX: kms.dlx)

scan-worker (Python / aio-pika)
    ├── consume: kms.scan
    ├── publish: kms.embed
    └── publish: kms.dedup

embed-worker (Python / aio-pika)
    ├── consume: kms.embed
    └── publish: kms.graph (future)

dedup-worker (Python / aio-pika)
    └── consume: kms.dedup

graph-worker (Python / aio-pika)
    └── consume: kms.graph
```

## Migration Steps

1. **Remove BullMQ packages** from `kms-api/package.json`:
   - Remove `@nestjs/bullmq` and `bullmq` from dependencies

2. **Replace `queue.module.ts`**:
   - Remove all `BullModule` imports and `BullModule.registerQueue()` calls
   - Keep only `ScanJobPublisher` (amqplib)
   - Add `ScheduleModule.forRoot()` from `@nestjs/schedule`

3. **Replace `SyncSchedulerService` `setInterval` with `@Cron`**:
   ```typescript
   @Cron('*/5 * * * *')
   async driveSyncCheck() { ... }

   @Cron('*/25 * * * *')
   async tokenRefresh() { ... }
   ```

4. **Remove `BULL_*` constants** from `queue.constants.ts` — keep only `AMQP_*` constants

5. **Verify WorkflowEngine** does not use BullMQ consumers (ADR-0021 chose state machine + Redis
   key-value, not BullMQ chains — any BullMQ usage there is a deviation from the ADR)

## queue.constants.ts (new shape)

Only RabbitMQ queue name constants remain:

```typescript
export const AMQP_SCAN_QUEUE          = 'kms.scan';
export const AMQP_EMBED_QUEUE         = 'kms.embed';
export const AMQP_DEDUP_QUEUE         = 'kms.dedup';
export const AMQP_GRAPH_QUEUE         = 'kms.graph';
export const AMQP_TRANSCRIPTION_QUEUE = 'kms.transcription';
```

## References

- ADR-0006 — aio-pika over Celery (Python RabbitMQ choice)
- ADR-0021 — WorkflowEngine: custom NestJS state machine, explicitly rejected BullMQ
- `@nestjs/schedule` docs — `@Cron`, `@Interval`, `CronExpression`
