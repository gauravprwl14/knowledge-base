# PRD-M14: Agentic Workflows — Workflow Engine, Multi-Agent Orchestration & YouTube URL Ingestion

- **Status**: Draft
- **Module**: M14
- **Author**: Claude Code (claude-sonnet-4-6)
- **Created**: 2026-03-17
- **Updated**: 2026-03-17
- **Depends on**: PRD-M13 (ACP Integration)

---

## 1. Business Context

KMS today is a retrieval-augmented chatbot: a user asks a question, the system fetches relevant chunks, and an LLM generates an answer. This works for read-only question-answering but cannot act on knowledge — it cannot ingest a new source, summarise a YouTube video, classify a document library, or kick off a multi-step research pipeline without manual user intervention at every step.

M14 transforms KMS from a passive RAG system into an Agentic Knowledge Platform. A user drops a YouTube URL and receives a fully ingested, summarised, and tagged document — automatically. An agent can spawn sub-agents to process different sections of a corpus in parallel and reunite the results. Every workflow step is observable, auditable, and controllable through a real-time SSE stream.

Without M14, every "more than one tool call" task requires the user to orchestrate steps manually: trigger a scan, wait, open the transcript, paste into chat, ask for a summary, copy-paste the summary into a note. With M14 that entire workflow is a single API call. The platform becomes a programmable knowledge operating system rather than a search interface.

The concrete first workflow shipped in M14 is **YouTube URL ingestion**: given a YouTube URL, the system extracts the transcript via yt-dlp, stores the raw text as a KMS document, generates a summary, classifies the content, embeds it, and makes it searchable — all as a single user action.

---

## 2. User Stories

| ID    | As a...            | I want to...                                                                                          | So that...                                                                                             |
|-------|--------------------|-------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| US-01 | Knowledge worker   | Paste a YouTube URL into KMS and receive a fully ingested, summarised, searchable transcript          | I can build a knowledge base from video content without manual transcript editing                      |
| US-02 | Knowledge worker   | Trigger any workflow from a KMS event (file uploaded, scan completed, cron schedule, webhook)         | Ingestion and enrichment happen automatically without me logging in to press buttons                   |
| US-03 | Knowledge worker   | Watch a workflow's progress in real time via an SSE stream                                            | I know exactly which step is running, what it produced, and whether it succeeded or is retrying        |
| US-04 | Platform developer | Register a new agent service (FastAPI, any language) with the agent registry without touching core code | I can extend KMS capabilities by adding microservices; no core code changes required                   |
| US-05 | Platform developer | Define a workflow as a typed TypeScript object (WorkflowDefinition) and register it via code          | Workflows are version-controlled, type-safe, and testable without a visual UI or YAML parser           |
| US-06 | Agent service      | Call `kms_spawn_agent` from within a workflow step to fan out sub-tasks across parallel sub-agents    | A single workflow can process a large document corpus in parallel and merge results automatically       |
| US-07 | Security auditor   | View a complete, immutable audit log of every workflow run and every tool call within it              | I can trace exactly what the system did, when, with what inputs and outputs, for compliance purposes   |
| US-08 | Administrator      | Cancel a running workflow from the UI or API at any step                                              | Long-running or misbehaving workflows do not consume resources indefinitely                             |
| US-09 | Knowledge worker   | Receive a failure notification with a retry option when a workflow step fails                         | I can recover from transient errors (network blip, rate limit) without re-triggering the full workflow  |
| US-10 | Knowledge worker   | Configure a cron trigger to ingest a YouTube channel weekly                                           | My knowledge base stays current with new content from recurring sources without manual effort           |

---

## 3. Scope

### In Scope

- **Workflow Engine** (`kms-api/src/modules/workflow/`): `WorkflowEngine`, `WorkflowStore`, `AgentRouter` — step orchestration, state machine lifecycle, sequential and parallel branches
- **WorkflowDefinition DSL**: TypeScript typed objects (`WorkflowDefinition`, `WorkflowStep`, `StepBranch`) — code-defined, version-controlled, no YAML
- **`kms_spawn_agent` tool**: spawn a sub-agent by agent_id with a task payload and input; supports synchronous (await) and fire-and-forget (async) modes; links child run to parent session
- **6 new ACP tools** beyond M13's 5:
  - `kms_extract_transcript` — YouTube/podcast URL to transcript text (via url-agent)
  - `kms_summarize` — LLM-powered summarization with style and length control
  - `kms_classify` — document classification and tagging against a taxonomy
  - `kms_spawn_agent` — spawn a named sub-agent with a task
  - `kms_fetch_url` — fetch and parse any web page (via url-agent)
  - `kms_web_search` — web search for knowledge enrichment (via url-agent)
- **url-agent service** (`services/url-agent/`, FastAPI, port 8005): handles `kms_extract_transcript`, `kms_fetch_url`, `kms_web_search`
- **YouTube URL ingestion workflow**: first concrete workflow definition — end-to-end from URL to searchable KMS document
- **SSE streaming** for all workflow events: `workflow_started`, `step_started`, `step_completed`, `step_failed`, `step_retrying`, `workflow_completed`, `workflow_failed`, `workflow_cancelled`
- **Agent health monitoring**: periodic health checks against registered agent endpoints; `kms_agents.health_status` updated; unhealthy agents surface in `GET /api/v1/agents`
- **Audit logging**: every tool call within a workflow persisted to `kms_acp_tool_calls` (reusing M13 table); every workflow run and step persisted to new tables
- **Retry logic**: per-step configurable retry count (max 3), exponential backoff, retryable vs terminal error distinction
- **Timeout handling**: per-step `stepTimeoutSeconds` and per-workflow global timeout; exceeded → step/run marked TIMEOUT
- **New DB tables**: `kms_workflow_runs`, `kms_workflow_steps`, `kms_agents`
- **Error code domain**: `KBWFL0001`–`KBWFL0015`
- **Feature flags** under `workflow.*` and `urlIngest.*` in `.kms/config.json`
- **Docker Compose addition**: `url-agent` service in `docker-compose.kms.yml`
- **Prisma migration**: `20260317000002_add_workflow_tables`
- Unit, integration, and E2E tests at 80% coverage minimum

### Out of Scope

- Visual drag-and-drop workflow builder UI (deferred to M15)
- YAML or JSON Schema workflow definitions (TypeScript typed objects only for M14)
- General-purpose coding agents or IDE integration (M13 scope)
- External agent bridging — see PRD-M15
- LLM-as-router pattern (LLM decides which tools to invoke) — current design uses deterministic step definitions
- OAuth2 / non-JWT authentication for workflow triggers
- Paid API billing per workflow run or per tool invocation
- Embedding model swap (still `BAAI/bge-m3` at 1024 dimensions)
- Mobile UI for workflow monitoring

---

## 4. Functional Requirements

### Workflow Engine

| ID    | Priority | Requirement                                                                                                                                              |
|-------|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-01 | Must     | `POST /api/v1/workflows/run` accepts a `workflow_type` string and `input` JSON, creates a `kms_workflow_runs` row with status `PENDING`, returns `runId` in < 100 ms |
| FR-02 | Must     | The WorkflowEngine resolves the `workflow_type` to a registered `WorkflowDefinition` object; unknown types return 422 KBWFL0002                         |
| FR-03 | Must     | Steps execute in the order defined in `WorkflowDefinition.steps`; each step completes (or fails terminally) before the next begins in sequential mode    |
| FR-04 | Must     | Parallel branch steps (`step.parallel: true`) are dispatched concurrently; the engine waits for all branches to settle before advancing                  |
| FR-05 | Must     | Each step's output JSON is passed as `context.previousStepOutput` into the next step's input, enabling output chaining                                   |
| FR-06 | Must     | `GET /api/v1/workflows/run/:id` returns the full run record including `status`, `input_json`, `output_json`, `error_message`, and a list of step summaries |
| FR-07 | Must     | `GET /api/v1/workflows/run/:id/stream` returns an `text/event-stream` SSE stream of workflow events for the lifetime of the run                          |
| FR-08 | Must     | `DELETE /api/v1/workflows/run/:id` cancels a `PENDING` or `RUNNING` run; in-flight steps receive a cancellation signal; run transitions to `CANCELLED`   |
| FR-09 | Must     | `GET /api/v1/workflows/runs` returns a paginated list of the authenticated user's runs, sortable by `created_at` desc, filterable by `status` and `workflow_type` |
| FR-10 | Must     | Feature flag `workflow.enabled: false` causes all workflow endpoints to return 503 with KBWFL0001                                                         |
| FR-11 | Must     | Per-user concurrent workflow limit enforced (`workflow.maxConcurrentWorkflows`, default 10; per-user cap 3); exceeded returns 429 KBWFL0009               |
| FR-12 | Should   | `POST /api/v1/workflows/run/:id/steps/:stepId/retry` re-queues a `FAILED` step; only allowed if `run.status = FAILED` and the step is the last failed step |

### Step Execution & Retry

| ID    | Priority | Requirement                                                                                                                                              |
|-------|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-13 | Must     | Each step dispatches to a named ACP tool or sub-agent via `AgentRouter`; the router maps `step.agent_id` to a registered endpoint URL in `kms_agents`     |
| FR-14 | Must     | Failed step with `retryable: true` is retried up to `step.maxRetries` (default 3) with exponential backoff starting at 2 s; each retry emits `step_retrying` SSE event |
| FR-15 | Must     | Failed step with `retryable: false` (terminal error) immediately transitions the run to `FAILED` without retry; emits `step_failed` SSE event             |
| FR-16 | Must     | Per-step timeout enforced via `workflow.stepTimeoutSeconds` (default 300 s); exceeded step transitions to `FAILED` with KBWFL0008 and is treated as retryable |
| FR-17 | Must     | All step inputs, outputs, status, `started_at`, `completed_at` persisted to `kms_workflow_steps`                                                         |

### Sub-Agent Spawning

| ID    | Priority | Requirement                                                                                                                                              |
|-------|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-18 | Must     | `kms_spawn_agent` tool accepts `{ agent_id, task, input, mode: "sync" | "async", parent_session_id }` and creates a new child workflow run linked to the parent via `kms_workflow_runs.parent_run_id` |
| FR-19 | Must     | In `sync` mode, `kms_spawn_agent` blocks until the child run reaches a terminal state (`COMPLETED`, `FAILED`, `CANCELLED`) and returns the child run's `output_json` |
| FR-20 | Must     | In `async` mode, `kms_spawn_agent` returns immediately with `{ childRunId, status: "PENDING" }`; the parent step is responsible for polling or ignoring the result |
| FR-21 | Must     | Sub-agent spawn overhead (time from tool call to child run first `step_started` event) must be p95 < 200 ms                                              |
| FR-22 | Should   | Maximum sub-agent nesting depth is 3 levels; exceeding depth returns 422 KBWFL0010                                                                       |

### Agent Registry

| ID    | Priority | Requirement                                                                                                                                              |
|-------|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-23 | Must     | `GET /api/v1/agents` returns the list of all registered agents with `id`, `name`, `endpoint_url`, `capabilities`, and `health_status`                     |
| FR-24 | Must     | Agent health is checked on a 30 s interval by calling `GET {endpoint_url}/health/live`; `health_status` updated to `HEALTHY`, `DEGRADED`, or `UNREACHABLE` |
| FR-25 | Must     | Routing a step to an `UNREACHABLE` agent returns KBWFL0011 and retries up to `step.maxRetries` before terminal failure                                    |
| FR-26 | Should   | New agents can be registered at runtime via `POST /api/v1/agents` (admin only); deregistered via `DELETE /api/v1/agents/:id`                              |

### url-agent Service

| ID    | Priority | Requirement                                                                                                                                              |
|-------|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-27 | Must     | `kms_extract_transcript` accepts a YouTube or podcast URL, runs yt-dlp to download the audio track, transcribes with Whisper (local) or Groq (cloud fallback), and returns transcript text + segment timestamps |
| FR-28 | Must     | Transcript extraction for a 10-minute video must complete in p95 < 90 s; a 60-minute video must complete in p95 < 10 min                                 |
| FR-29 | Must     | `kms_fetch_url` fetches any HTTP/HTTPS URL, extracts clean text using `trafilatura`, and returns `{ url, title, text, fetched_at }`                       |
| FR-30 | Should   | `kms_web_search` accepts a `query` and `limit` (default 5), calls the configured search provider (DuckDuckGo by default), and returns `[{ title, url, snippet }]` |
| FR-31 | Must     | url-agent exposes `/health/live` and `/health/ready` endpoints; ready only when yt-dlp binary is present and Whisper model is loaded                      |
| FR-32 | Must     | Transcript text exceeding `urlIngest.maxTranscriptChars` (default 100,000) is truncated with a `truncated: true` flag in the response                     |

### Summary & Classification Tools

| ID    | Priority | Requirement                                                                                                                                              |
|-------|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-33 | Must     | `kms_summarize` accepts `{ text, style?: "bullet" | "paragraph" | "tldr", max_length?: number }` and returns `{ summary, style, word_count }` via the configured LLM (provider fallback: Ollama → OpenRouter) |
| FR-34 | Must     | `kms_classify` accepts `{ text, taxonomy?: string[] }` and returns `{ tags: string[], primary_category: string, confidence: number }` using the configured LLM; default taxonomy covers 20 standard knowledge categories |

### Workflow Event Streaming

| ID    | Priority | Requirement                                                                                                                                              |
|-------|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-35 | Must     | The SSE stream for a run emits typed events: `workflow_started`, `step_started`, `tool_call`, `tool_call_update`, `step_completed`, `step_failed`, `step_retrying`, `workflow_completed`, `workflow_failed`, `workflow_cancelled` |
| FR-36 | Must     | Each SSE event carries: `{ event, runId, timestamp, payload }` where `payload` is event-specific JSON                                                    |
| FR-37 | Must     | Clients connecting to `GET /api/v1/workflows/run/:id/stream` after the run has completed receive a replay of all historical events followed by a terminal event |
| FR-38 | Should   | SSE keep-alive pings are emitted every 15 s to prevent proxy timeouts                                                                                    |

### Audit Logging

| ID    | Priority | Requirement                                                                                                                                              |
|-------|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-39 | Must     | Every tool call executed within a workflow step is persisted to `kms_acp_tool_calls` with `session_id` linked to the workflow's owning ACP session        |
| FR-40 | Must     | Every step record in `kms_workflow_steps` stores the full `input_json`, `output_json`, `status`, `started_at`, `completed_at`; output capped at 64 KB (excess truncated) |
| FR-41 | Must     | `kms_workflow_runs` rows are retained for 30 days after `completed_at`; a nightly cron job purges older records                                           |

---

## 5. Non-Functional Requirements

| Concern            | Requirement                                                                                                          |
|--------------------|----------------------------------------------------------------------------------------------------------------------|
| Performance        | Workflow creation (`POST /api/v1/workflows/run`): p95 < 100 ms                                                      |
| Performance        | Step dispatch (tool call to first byte of agent response): p95 < 50 ms, excluding downstream service time           |
| Performance        | YouTube transcript extraction (10-min video): p95 < 90 s                                                            |
| Performance        | Sub-agent spawn overhead (tool call to child run first step_started): p95 < 200 ms                                  |
| Performance        | SSE first event after workflow start: p95 < 300 ms                                                                   |
| Concurrency        | Global max concurrent workflows: `workflow.maxConcurrentWorkflows` (default 10)                                      |
| Concurrency        | Per-user max concurrent workflows: 3; exceeded returns 429 KBWFL0009                                                 |
| Steps per run      | Max steps per workflow: `workflow.maxStepsPerWorkflow` (default 20); exceeded at definition time returns 422 KBWFL0003 |
| Security           | All workflow endpoints require valid JWT; missing/invalid JWT returns 401                                             |
| Security           | Step input/output stored in DB must not exceed 64 KB per field; excess truncated with flag                           |
| Security           | `kms_spawn_agent` can only spawn agents registered in `kms_agents`; unregistered agent_id returns KBWFL0012         |
| Security           | url-agent must reject non-HTTP/HTTPS URL schemes (file://, ftp://, etc.) with KBWFL0013                             |
| Scalability        | WorkflowEngine is stateless in kms-api; all mutable run state lives in PostgreSQL; horizontal scaling supported       |
| Scalability        | url-agent must support at least 4 concurrent transcript extractions (Docker resource limit: 4 CPU, 8 GB RAM)         |
| Availability       | Workflow engine follows kms-api SLA (99.5% uptime target); url-agent is best-effort (95% uptime)                    |
| Availability       | url-agent unavailability (UNREACHABLE) causes transcript steps to fail with KBWFL0011 and retry; does not crash kms-api |
| Data Retention     | `kms_workflow_runs` and `kms_workflow_steps`: 30 days after `completed_at`; purged nightly                           |
| Data Retention     | `kms_agents`: rows retained indefinitely; deregistered agents soft-deleted                                           |
| Observability      | All workflow run and step operations wrapped in OTel spans with `workflow.run_id`, `workflow.type`, `step.index` attributes |

---

## 6. Data Model

```sql
-- Migration: 20260317000002_add_workflow_tables

CREATE TYPE workflow_run_status AS ENUM (
  'PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT'
);

CREATE TYPE workflow_step_status AS ENUM (
  'PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRYING', 'SKIPPED', 'TIMEOUT'
);

CREATE TYPE agent_health_status AS ENUM (
  'HEALTHY', 'DEGRADED', 'UNREACHABLE', 'UNKNOWN'
);

-- Registered agent services
CREATE TABLE kms_agents (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  endpoint_url      TEXT        NOT NULL,
  capabilities_json JSONB       NOT NULL DEFAULT '[]',  -- array of tool names
  health_status     agent_health_status NOT NULL DEFAULT 'UNKNOWN',
  last_checked_at   TIMESTAMPTZ,
  registered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deregistered_at   TIMESTAMPTZ,                        -- soft delete
  CONSTRAINT uq_kms_agents_name UNIQUE (name)
);

CREATE INDEX idx_kms_agents_health ON kms_agents (health_status);

-- Workflow run records
CREATE TABLE kms_workflow_runs (
  id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID                NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  parent_run_id   UUID                REFERENCES kms_workflow_runs(id) ON DELETE SET NULL,
  workflow_type   TEXT                NOT NULL,
  status          workflow_run_status NOT NULL DEFAULT 'PENDING',
  input_json      JSONB               NOT NULL DEFAULT '{}',
  output_json     JSONB,
  error_message   TEXT,
  error_code      TEXT,
  nesting_depth   SMALLINT            NOT NULL DEFAULT 0,  -- 0 = root, 1 = first sub-agent, etc.
  created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  CONSTRAINT chk_nesting_depth CHECK (nesting_depth >= 0 AND nesting_depth <= 3)
);

CREATE INDEX idx_kms_workflow_runs_user_id       ON kms_workflow_runs (user_id);
CREATE INDEX idx_kms_workflow_runs_status        ON kms_workflow_runs (status);
CREATE INDEX idx_kms_workflow_runs_workflow_type ON kms_workflow_runs (workflow_type);
CREATE INDEX idx_kms_workflow_runs_created_at    ON kms_workflow_runs (created_at DESC);
CREATE INDEX idx_kms_workflow_runs_parent_run_id ON kms_workflow_runs (parent_run_id)
  WHERE parent_run_id IS NOT NULL;

-- Individual steps within a run
CREATE TABLE kms_workflow_steps (
  id               UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           UUID                 NOT NULL REFERENCES kms_workflow_runs(id) ON DELETE CASCADE,
  step_index       SMALLINT             NOT NULL,           -- 0-based position in workflow definition
  step_name        TEXT                 NOT NULL,
  agent_id         TEXT                 NOT NULL,           -- logical agent name, FK to kms_agents.name
  task             TEXT                 NOT NULL,           -- human-readable task description
  input_json       JSONB                NOT NULL DEFAULT '{}',
  output_json      JSONB,
  output_truncated BOOLEAN              NOT NULL DEFAULT FALSE,
  status           workflow_step_status NOT NULL DEFAULT 'PENDING',
  retry_count      SMALLINT             NOT NULL DEFAULT 0,
  error_message    TEXT,
  error_code       TEXT,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  CONSTRAINT uq_kms_workflow_steps_run_index UNIQUE (run_id, step_index)
);

CREATE INDEX idx_kms_workflow_steps_run_id    ON kms_workflow_steps (run_id);
CREATE INDEX idx_kms_workflow_steps_status    ON kms_workflow_steps (status);
CREATE INDEX idx_kms_workflow_steps_agent_id  ON kms_workflow_steps (agent_id);
```

**Prisma schema additions** (`kms-api/prisma/schema.prisma`):

```prisma
model KmsAgent {
  id               String          @id @default(uuid())
  name             String          @unique
  endpointUrl      String          @map("endpoint_url")
  capabilitiesJson Json            @default("[]") @map("capabilities_json")
  healthStatus     AgentHealth     @default(UNKNOWN) @map("health_status")
  lastCheckedAt    DateTime?       @map("last_checked_at")
  registeredAt     DateTime        @default(now()) @map("registered_at")
  deregisteredAt   DateTime?       @map("deregistered_at")

  @@map("kms_agents")
}

model KmsWorkflowRun {
  id            String             @id @default(uuid())
  userId        String             @map("user_id")
  parentRunId   String?            @map("parent_run_id")
  workflowType  String             @map("workflow_type")
  status        WorkflowRunStatus  @default(PENDING)
  inputJson     Json               @default("{}") @map("input_json")
  outputJson    Json?              @map("output_json")
  errorMessage  String?            @map("error_message")
  errorCode     String?            @map("error_code")
  nestingDepth  Int                @default(0) @map("nesting_depth")
  createdAt     DateTime           @default(now()) @map("created_at")
  startedAt     DateTime?          @map("started_at")
  completedAt   DateTime?          @map("completed_at")
  user          AuthUser           @relation(fields: [userId], references: [id], onDelete: Cascade)
  parentRun     KmsWorkflowRun?    @relation("SubAgentRuns", fields: [parentRunId], references: [id])
  childRuns     KmsWorkflowRun[]   @relation("SubAgentRuns")
  steps         KmsWorkflowStep[]

  @@map("kms_workflow_runs")
}

model KmsWorkflowStep {
  id              String              @id @default(uuid())
  runId           String              @map("run_id")
  stepIndex       Int                 @map("step_index")
  stepName        String              @map("step_name")
  agentId         String              @map("agent_id")
  task            String
  inputJson       Json                @default("{}") @map("input_json")
  outputJson      Json?               @map("output_json")
  outputTruncated Boolean             @default(false) @map("output_truncated")
  status          WorkflowStepStatus  @default(PENDING)
  retryCount      Int                 @default(0) @map("retry_count")
  errorMessage    String?             @map("error_message")
  errorCode       String?             @map("error_code")
  startedAt       DateTime?           @map("started_at")
  completedAt     DateTime?           @map("completed_at")
  run             KmsWorkflowRun      @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@unique([runId, stepIndex])
  @@map("kms_workflow_steps")
}

enum WorkflowRunStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
  TIMEOUT
}

enum WorkflowStepStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  RETRYING
  SKIPPED
  TIMEOUT
}

enum AgentHealth {
  HEALTHY
  DEGRADED
  UNREACHABLE
  UNKNOWN
}
```

---

## 7. API Contract

### Endpoint Table

| Method | Path                                              | Auth  | Description                                    |
|--------|---------------------------------------------------|-------|------------------------------------------------|
| POST   | `/api/v1/workflows/run`                           | JWT   | Trigger a new workflow run                     |
| GET    | `/api/v1/workflows/run/:id`                       | JWT   | Get run status and step summary                |
| GET    | `/api/v1/workflows/run/:id/stream`                | JWT   | SSE stream of workflow events                  |
| DELETE | `/api/v1/workflows/run/:id`                       | JWT   | Cancel a pending or running workflow           |
| GET    | `/api/v1/workflows/runs`                          | JWT   | List authenticated user's workflow runs        |
| GET    | `/api/v1/agents`                                  | JWT   | List registered agents and health status       |
| POST   | `/api/v1/agents`                                  | JWT+Admin | Register a new agent                       |
| DELETE | `/api/v1/agents/:id`                              | JWT+Admin | Deregister an agent (soft delete)          |
| POST   | `/api/v1/workflows/run/:id/steps/:stepId/retry`   | JWT   | Retry the last failed step of a failed run     |

---

### `POST /api/v1/workflows/run`

**Request body**:
```json
{
  "workflowType": "youtube_url_ingest",
  "input": {
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "collectionId": "col-uuid-optional",
    "summaryStyle": "bullet",
    "tags": ["video", "music"]
  }
}
```

**Response 202**:
```json
{
  "runId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "workflowType": "youtube_url_ingest",
  "status": "PENDING",
  "createdAt": "2026-03-17T10:00:00Z",
  "streamUrl": "/api/v1/workflows/run/f47ac10b-58cc-4372-a567-0e02b2c3d479/stream"
}
```

**Errors**:
- 422 KBWFL0002 — unknown `workflowType`
- 422 KBWFL0003 — workflow definition exceeds `maxStepsPerWorkflow`
- 429 KBWFL0009 — user concurrent run limit exceeded
- 503 KBWFL0001 — `workflow.enabled` is false

---

### `GET /api/v1/workflows/run/:id`

**Response 200**:
```json
{
  "runId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "workflowType": "youtube_url_ingest",
  "status": "COMPLETED",
  "inputJson": { "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  "outputJson": {
    "fileId": "kms-file-uuid",
    "title": "Never Gonna Give You Up",
    "summary": "• Classic 1987 pop song by Rick Astley...",
    "tags": ["pop", "music", "1980s"],
    "searchable": true
  },
  "createdAt": "2026-03-17T10:00:00Z",
  "startedAt": "2026-03-17T10:00:00.150Z",
  "completedAt": "2026-03-17T10:01:23Z",
  "steps": [
    {
      "stepId": "step-uuid-1",
      "stepIndex": 0,
      "stepName": "extract_transcript",
      "agentId": "url-agent",
      "status": "COMPLETED",
      "startedAt": "2026-03-17T10:00:00.200Z",
      "completedAt": "2026-03-17T10:01:05Z",
      "retryCount": 0
    },
    {
      "stepId": "step-uuid-2",
      "stepIndex": 1,
      "stepName": "summarize",
      "agentId": "summary-agent",
      "status": "COMPLETED",
      "startedAt": "2026-03-17T10:01:05Z",
      "completedAt": "2026-03-17T10:01:15Z",
      "retryCount": 0
    },
    {
      "stepId": "step-uuid-3",
      "stepIndex": 2,
      "stepName": "classify",
      "agentId": "summary-agent",
      "status": "COMPLETED",
      "startedAt": "2026-03-17T10:01:15Z",
      "completedAt": "2026-03-17T10:01:18Z",
      "retryCount": 0
    },
    {
      "stepId": "step-uuid-4",
      "stepIndex": 3,
      "stepName": "ingest_to_kms",
      "agentId": "ingest-agent",
      "status": "COMPLETED",
      "startedAt": "2026-03-17T10:01:18Z",
      "completedAt": "2026-03-17T10:01:23Z",
      "retryCount": 0
    }
  ]
}
```

**Errors**: 401 / 403 KBWFL0005 (not owner) / 404 KBWFL0006 (not found)

---

### `GET /api/v1/workflows/run/:id/stream`

**Response**: `Content-Type: text/event-stream`

Each SSE event is formatted as `data: <JSON>\n\n`. All events share a common envelope:

```
data: {"event":"workflow_started","runId":"f47ac10b-...","timestamp":"2026-03-17T10:00:00.150Z","payload":{"workflowType":"youtube_url_ingest","totalSteps":4}}

data: {"event":"step_started","runId":"f47ac10b-...","timestamp":"2026-03-17T10:00:00.200Z","payload":{"stepId":"step-uuid-1","stepIndex":0,"stepName":"extract_transcript","agentId":"url-agent","task":"Extract transcript from YouTube URL"}}

data: {"event":"tool_call","runId":"f47ac10b-...","timestamp":"2026-03-17T10:00:00.210Z","payload":{"toolCallId":"tc-001","toolName":"kms_extract_transcript","input":{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}}}

data: {"event":"tool_call_update","runId":"f47ac10b-...","timestamp":"2026-03-17T10:01:05.000Z","payload":{"toolCallId":"tc-001","status":"SUCCESS","durationMs":64790}}

data: {"event":"step_completed","runId":"f47ac10b-...","timestamp":"2026-03-17T10:01:05.010Z","payload":{"stepId":"step-uuid-1","stepIndex":0,"durationMs":64810}}

data: {"event":"step_started","runId":"f47ac10b-...","timestamp":"2026-03-17T10:01:05.020Z","payload":{"stepId":"step-uuid-2","stepIndex":1,"stepName":"summarize","agentId":"summary-agent"}}

data: {"event":"step_retrying","runId":"f47ac10b-...","timestamp":"2026-03-17T10:01:06.000Z","payload":{"stepId":"step-uuid-2","stepIndex":1,"retryCount":1,"retryAfterMs":2000,"errorCode":"KBWFL0008","errorMessage":"Step timed out after 300s"}}

data: {"event":"step_completed","runId":"f47ac10b-...","timestamp":"2026-03-17T10:01:15.000Z","payload":{"stepId":"step-uuid-2","stepIndex":1,"durationMs":9980}}

data: {"event":"workflow_completed","runId":"f47ac10b-...","timestamp":"2026-03-17T10:01:23.000Z","payload":{"totalDurationMs":82850,"outputSummary":{"fileId":"kms-file-uuid","searchable":true}}}
```

**Retry / failure events**:
```
data: {"event":"step_failed","runId":"f47ac10b-...","timestamp":"...","payload":{"stepId":"step-uuid-2","stepIndex":1,"retryCount":3,"errorCode":"KBWFL0011","errorMessage":"Agent url-agent is UNREACHABLE after 3 retries","terminal":true}}

data: {"event":"workflow_failed","runId":"f47ac10b-...","timestamp":"...","payload":{"failedStepIndex":1,"errorCode":"KBWFL0011"}}
```

**Keep-alive**:
```
: keep-alive

```
*(emitted every 15 s; colon prefix is SSE comment syntax)*

**Late connect / replay**: clients connecting after the run has completed receive all historical events in order, followed immediately by the terminal event (`workflow_completed`, `workflow_failed`, or `workflow_cancelled`).

---

### `GET /api/v1/workflows/runs`

**Query parameters**: `status`, `workflowType`, `page` (default 1), `limit` (default 20, max 100)

**Response 200**:
```json
{
  "data": [
    {
      "runId": "f47ac10b-...",
      "workflowType": "youtube_url_ingest",
      "status": "COMPLETED",
      "createdAt": "2026-03-17T10:00:00Z",
      "completedAt": "2026-03-17T10:01:23Z",
      "stepCount": 4,
      "failedSteps": 0
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1 }
}
```

---

### `GET /api/v1/agents`

**Response 200**:
```json
{
  "agents": [
    {
      "id": "agent-uuid-1",
      "name": "url-agent",
      "endpointUrl": "http://url-agent:8005",
      "capabilities": ["kms_extract_transcript", "kms_fetch_url", "kms_web_search"],
      "healthStatus": "HEALTHY",
      "lastCheckedAt": "2026-03-17T10:05:00Z"
    },
    {
      "id": "agent-uuid-2",
      "name": "summary-agent",
      "endpointUrl": "http://rag-service:8002",
      "capabilities": ["kms_summarize", "kms_classify"],
      "healthStatus": "HEALTHY",
      "lastCheckedAt": "2026-03-17T10:05:00Z"
    },
    {
      "id": "agent-uuid-3",
      "name": "ingest-agent",
      "endpointUrl": "http://kms-api:8000",
      "capabilities": ["kms_ingest"],
      "healthStatus": "HEALTHY",
      "lastCheckedAt": "2026-03-17T10:05:00Z"
    }
  ]
}
```

---

### WorkflowDefinition TypeScript Shape

The DSL used to register workflows in `kms-api/src/modules/workflow/definitions/`:

```typescript
// kms-api/src/modules/workflow/types/workflow-definition.types.ts

export type StepMode = 'sequential' | 'parallel';
export type SpawnMode = 'sync' | 'async';

export interface WorkflowStepDefinition {
  /** Unique name within the workflow; used as step_name in DB */
  name: string;
  /** Logical agent name matching kms_agents.name */
  agentId: string;
  /** Tool to invoke on the agent */
  toolName: string;
  /** Human-readable description of this step's purpose */
  task: string;
  /** Build the tool input from the run's root input + previous step outputs */
  buildInput: (context: WorkflowStepContext) => Record<string, unknown>;
  /** Maximum retries before terminal failure (default 3) */
  maxRetries?: number;
  /** Whether to run in parallel with adjacent parallel=true steps */
  parallel?: boolean;
  /** Skip this step if the condition returns false */
  condition?: (context: WorkflowStepContext) => boolean;
}

export interface WorkflowDefinition {
  /** Must match workflowType string used in POST /api/v1/workflows/run */
  type: string;
  /** Display name for UI and logs */
  displayName: string;
  /** Input validation — Zod schema */
  inputSchema: ZodSchema;
  steps: WorkflowStepDefinition[];
  /** Merge all step outputs into the final run output_json */
  buildOutput: (context: WorkflowFinalContext) => Record<string, unknown>;
}

export interface WorkflowStepContext {
  /** Original run input */
  input: Record<string, unknown>;
  /** Map of step name → step output for all completed steps */
  stepOutputs: Record<string, Record<string, unknown>>;
  /** Current step index */
  stepIndex: number;
}

export interface WorkflowFinalContext {
  input: Record<string, unknown>;
  stepOutputs: Record<string, Record<string, unknown>>;
}
```

**Example — YouTube URL ingestion workflow definition**:

```typescript
// kms-api/src/modules/workflow/definitions/youtube-url-ingest.workflow.ts
import { z } from 'zod';
import type { WorkflowDefinition } from '../types/workflow-definition.types';

export const YoutubeUrlIngestWorkflow: WorkflowDefinition = {
  type: 'youtube_url_ingest',
  displayName: 'YouTube URL Ingestion',
  inputSchema: z.object({
    url: z.string().url().startsWith('https://www.youtube.com'),
    collectionId: z.string().uuid().optional(),
    summaryStyle: z.enum(['bullet', 'paragraph', 'tldr']).default('bullet'),
    tags: z.array(z.string()).optional(),
  }),
  steps: [
    {
      name: 'extract_transcript',
      agentId: 'url-agent',
      toolName: 'kms_extract_transcript',
      task: 'Extract transcript from YouTube URL',
      buildInput: ({ input }) => ({ url: input.url, format: 'text' }),
      maxRetries: 2,
    },
    {
      name: 'summarize',
      agentId: 'summary-agent',
      toolName: 'kms_summarize',
      task: 'Summarize the extracted transcript',
      buildInput: ({ input, stepOutputs }) => ({
        text: stepOutputs['extract_transcript'].transcript,
        style: input.summaryStyle ?? 'bullet',
        max_length: 500,
      }),
      maxRetries: 3,
    },
    {
      name: 'classify',
      agentId: 'summary-agent',
      toolName: 'kms_classify',
      task: 'Classify and tag the transcript',
      buildInput: ({ stepOutputs }) => ({
        text: stepOutputs['extract_transcript'].transcript,
      }),
      maxRetries: 3,
    },
    {
      name: 'ingest_to_kms',
      agentId: 'ingest-agent',
      toolName: 'kms_ingest',
      task: 'Ingest transcript as a KMS document',
      buildInput: ({ input, stepOutputs }) => ({
        content: stepOutputs['extract_transcript'].transcript,
        title: stepOutputs['extract_transcript'].title,
        source_url: input.url,
        collection_id: input.collectionId,
        tags: [
          ...(input.tags ?? []),
          ...(stepOutputs['classify'].tags ?? []),
        ],
        summary: stepOutputs['summarize'].summary,
        mime_type: 'text/plain',
      }),
      maxRetries: 2,
    },
  ],
  buildOutput: ({ stepOutputs }) => ({
    fileId: stepOutputs['ingest_to_kms'].fileId,
    title: stepOutputs['extract_transcript'].title,
    summary: stepOutputs['summarize'].summary,
    tags: stepOutputs['classify'].tags,
    primaryCategory: stepOutputs['classify'].primary_category,
    searchable: true,
  }),
};
```

---

### `kms_spawn_agent` Tool Input/Output

```json
// Input
{
  "agent_id": "summary-agent",
  "task": "Summarize sections 1-3 of the corpus",
  "input": {
    "text": "...",
    "style": "bullet"
  },
  "mode": "sync",
  "parent_session_id": "acp-session-uuid"
}

// Output (sync mode — returned after child run completes)
{
  "childRunId": "child-run-uuid",
  "status": "COMPLETED",
  "output": {
    "summary": "...",
    "word_count": 120
  },
  "durationMs": 8200
}

// Output (async mode — returned immediately)
{
  "childRunId": "child-run-uuid",
  "status": "PENDING"
}
```

---

### `kms_extract_transcript` Tool Input/Output

```json
// Input
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "format": "text"   // "text" | "segments" (default: "text")
}

// Output
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "title": "Rick Astley - Never Gonna Give You Up",
  "duration_seconds": 213,
  "transcript": "We're no strangers to love...",
  "segments": [
    { "start": 0.0, "end": 3.5, "text": "We're no strangers to love" }
  ],
  "language": "en",
  "truncated": false,
  "extraction_method": "yt_dlp+whisper"
}
```

---

### Error Code Registry (KBWFL domain)

| Code       | HTTP Status | Meaning                                                                                          |
|------------|-------------|--------------------------------------------------------------------------------------------------|
| KBWFL0001  | 503         | `workflow.enabled` feature flag is false; all workflow endpoints unavailable                    |
| KBWFL0002  | 422         | Unknown or unregistered `workflowType`; no matching WorkflowDefinition found                    |
| KBWFL0003  | 422         | WorkflowDefinition exceeds `workflow.maxStepsPerWorkflow` limit                                  |
| KBWFL0004  | 401         | Missing or invalid JWT on any workflow endpoint                                                  |
| KBWFL0005  | 403         | Run belongs to a different authenticated user                                                    |
| KBWFL0006  | 404         | Workflow run not found                                                                           |
| KBWFL0007  | 409         | Run is already in a terminal state (`COMPLETED`, `FAILED`, `CANCELLED`, `TIMEOUT`); cannot modify |
| KBWFL0008  | 408         | Step exceeded `workflow.stepTimeoutSeconds`; step marked TIMEOUT and retried if retries remain   |
| KBWFL0009  | 429         | User concurrent workflow run limit (3) exceeded; wait for a run to complete                     |
| KBWFL0010  | 422         | `kms_spawn_agent` nesting depth exceeds maximum (3 levels)                                      |
| KBWFL0011  | 502         | Target agent is UNREACHABLE; step failed after max retries                                      |
| KBWFL0012  | 422         | `kms_spawn_agent` references an unregistered or deregistered agent_id                           |
| KBWFL0013  | 422         | url-agent rejected URL: unsupported scheme (non-HTTP/HTTPS) or blocked domain                   |
| KBWFL0014  | 409         | Cannot retry: run is not in FAILED status, or the specified step is not the last failed step     |
| KBWFL0015  | 503         | url-agent service is unavailable; `urlIngest.enabled` check or health check failed              |

---

## 8. Flow Diagram — YouTube URL Ingestion Workflow

```mermaid
sequenceDiagram
  autonumber
  participant C as Client (Browser / API)
  participant GW as kms-api<br/>WorkflowController
  participant WE as WorkflowEngine<br/>(kms-api)
  participant DB as PostgreSQL
  participant UA as url-agent<br/>(port 8005)
  participant YTDLP as yt-dlp + Whisper<br/>(url-agent subprocess)
  participant SA as summary-agent<br/>(rag-service port 8002)
  participant LLM as LLM<br/>(Ollama / OpenRouter)
  participant IA as ingest-agent<br/>(kms-api ingest tool)
  participant AMQP as RabbitMQ<br/>(kms.embed queue)

  C->>GW: POST /api/v1/workflows/run { workflowType: "youtube_url_ingest", input: { url } }
  GW->>DB: INSERT kms_workflow_runs (status=PENDING)
  DB-->>GW: runId
  GW-->>C: 202 { runId, streamUrl }

  Note over C,WE: Client opens SSE stream in parallel
  C->>GW: GET /api/v1/workflows/run/:id/stream
  GW-->>C: SSE: workflow_started

  WE->>DB: UPDATE run status=RUNNING; INSERT step[0] status=PENDING
  GW-->>C: SSE: step_started { stepIndex: 0, stepName: "extract_transcript" }

  WE->>UA: POST /acp/v1/sessions/:sid/prompt → kms_extract_transcript { url }
  GW-->>C: SSE: tool_call { toolName: "kms_extract_transcript" }
  UA->>YTDLP: yt-dlp --extract-audio → audio file
  YTDLP-->>UA: audio file (m4a)
  UA->>YTDLP: whisper transcribe audio
  YTDLP-->>UA: transcript segments + text
  UA-->>WE: { transcript, title, duration_seconds, language }
  GW-->>C: SSE: tool_call_update { status: SUCCESS }
  WE->>DB: UPDATE step[0] status=COMPLETED, output_json
  GW-->>C: SSE: step_completed { stepIndex: 0 }

  WE->>DB: INSERT step[1] status=PENDING
  GW-->>C: SSE: step_started { stepIndex: 1, stepName: "summarize" }
  WE->>SA: POST /acp/v1/sessions/:sid/prompt → kms_summarize { text: transcript }
  GW-->>C: SSE: tool_call { toolName: "kms_summarize" }
  SA->>LLM: generate summary (bullet style)
  LLM-->>SA: summary text
  SA-->>WE: { summary, style, word_count }
  GW-->>C: SSE: tool_call_update { status: SUCCESS }
  WE->>DB: UPDATE step[1] status=COMPLETED
  GW-->>C: SSE: step_completed { stepIndex: 1 }

  WE->>DB: INSERT step[2] status=PENDING
  GW-->>C: SSE: step_started { stepIndex: 2, stepName: "classify" }
  WE->>SA: kms_classify { text: transcript }
  SA->>LLM: classify + tag
  LLM-->>SA: { tags, primary_category, confidence }
  SA-->>WE: classification result
  WE->>DB: UPDATE step[2] status=COMPLETED
  GW-->>C: SSE: step_completed { stepIndex: 2 }

  WE->>DB: INSERT step[3] status=PENDING
  GW-->>C: SSE: step_started { stepIndex: 3, stepName: "ingest_to_kms" }
  WE->>IA: kms_ingest { content, title, tags, summary, source_url }
  IA->>DB: INSERT kms_files + kms_chunks
  IA->>AMQP: publish FileDiscoveredMessage → kms.embed queue
  AMQP-->>IA: ack
  IA-->>WE: { fileId, queued: true }
  WE->>DB: UPDATE step[3] status=COMPLETED; UPDATE run status=COMPLETED, output_json
  GW-->>C: SSE: step_completed { stepIndex: 3 }
  GW-->>C: SSE: workflow_completed { outputSummary: { fileId, searchable: true } }
```

---

## 9. Decisions Required

| # | Question | Options | Recommendation | ADR |
|---|----------|---------|----------------|-----|
| 1 | **WorkflowDefinition format**: TypeScript typed objects registered in code vs YAML/JSON file-based definitions | (A) TypeScript objects — type-safe, testable, no parser needed; (B) YAML — human-editable, no redeploy for changes; (C) JSON Schema — portable, language-agnostic | Option A for M14 — type-safety and testability outweigh convenience; YAML deferred to M15 visual builder | ADR-0020 |
| 2 | **YouTube transcript extraction backend**: yt-dlp + Whisper (local) vs YouTube Data API v3 (captions) | (A) yt-dlp + Whisper — works for all videos including those without captions; higher cost (CPU/GPU); (B) YouTube Data API v3 — free, fast, but only works for ~40% of videos that have caption tracks | Option A — broader coverage is the primary requirement; GPU acceleration via url-agent Docker image | ADR-0021 |
| 3 | **Sub-agent session model**: one new ACP session per workflow step vs persistent ACP session per workflow run | (A) Per-step session — clean isolation, simpler state management, more DB rows; (B) Per-run session — session reuse, fewer DB rows, step outputs accumulate in session Redis key | Option B — session per run; `kms_acp_sessions` row created when run starts, all steps share it | ADR-0022 |
| 4 | **Workflow engine implementation**: extend LangGraph (Python) vs custom NestJS state machine vs BullMQ queue-per-step | (A) LangGraph — rich graph model, already used in rag-service, Python only; (B) Custom NestJS state machine — TypeScript, same process as kms-api, full control; (C) BullMQ — proven job queue, retry/delay built-in, adds dependency | Option B — NestJS state machine keeps the engine in the API tier, avoids Python/TS process split for orchestration, and BullMQ overhead is unnecessary for < 20 steps | ADR-0021 |

---

## 10. ADRs Written

- [ ] [ADR-0020: Agent Registry Design — Static Seed vs Runtime Registration](../architecture/decisions/0020-agent-registry-design.md)
- [ ] [ADR-0021: Workflow Engine Implementation — LangGraph vs Custom NestJS State Machine vs BullMQ](../architecture/decisions/0021-workflow-engine.md)
- [ ] [ADR-0022: Sub-Agent Session Model — Per-Step vs Per-Run ACP Session](../architecture/decisions/0022-sub-agent-session-model.md)

---

## 11. Sequence Diagrams Written

- [ ] [11 — YouTube URL Workflow (happy path + retry)](../architecture/sequence-diagrams/11-youtube-url-workflow.md)
- [ ] [12 — Multi-Agent Parallel Spawn](../architecture/sequence-diagrams/12-multi-agent-parallel-spawn.md)

---

## 12. Feature Guide Written

- [ ] [FOR-agentic-workflows.md](../development/FOR-agentic-workflows.md)

---

## 13. Testing Plan

### Unit Tests

| Target | Coverage Goal | Key Scenarios |
|--------|---------------|---------------|
| `WorkflowEngine` — run lifecycle, step sequencing | 95% | PENDING→RUNNING→COMPLETED; FAILED on terminal error; CANCELLED mid-run |
| `WorkflowEngine` — parallel branch execution | 90% | All branches complete; one branch fails; fan-out + fan-in merge |
| `WorkflowEngine` — retry logic | 95% | Retryable error retries 3×; terminal error skips retries; backoff timing |
| `WorkflowEngine` — timeout handling | 90% | Step timeout triggers retry; workflow timeout cancels remaining steps |
| `AgentRouter` — dispatch + health routing | 95% | Healthy agent dispatched; UNREACHABLE agent triggers KBWFL0011 |
| `AgentHealthService` — health check loop | 85% | HEALTHY→DEGRADED→UNREACHABLE state transitions; re-check restores HEALTHY |
| `WorkflowStore` — CRUD operations | 95% | Create run; update step; list runs paginated; cancel run |
| `kms_spawn_agent` tool | 90% | Sync mode blocks on child run; async mode returns immediately; depth limit enforced |
| `kms_extract_transcript` tool | 90% | Mock yt-dlp and Whisper; truncation at maxTranscriptChars; URL scheme rejection |
| `kms_summarize` tool | 90% | Style variations; LLM provider fallback (Ollama → OpenRouter) |
| `kms_classify` tool | 85% | Custom taxonomy; default taxonomy; confidence scores |
| `kms_fetch_url` tool | 85% | Mock HTTP; trafilatura parsing; non-HTTP scheme rejection |
| Error code mapping KBWFL0001–KBWFL0015 | 100% | Each error code exercised by at least one test |
| `YoutubeUrlIngestWorkflow` definition | 95% | `buildInput` for each step; `buildOutput` shape |

### Integration Tests

| Scenario | Assertion |
|----------|-----------|
| `POST /api/v1/workflows/run` → DB row created with status PENDING | PostgreSQL row present with correct user_id and workflow_type |
| Full youtube_url_ingest run with mocked url-agent, summary-agent, ingest-agent | All 4 steps COMPLETED; run status COMPLETED; output_json contains fileId |
| SSE stream: client connects before run starts, receives all 12+ events in order | Event sequence correct; `workflow_completed` is last event |
| SSE stream: client connects after run completes | Full event replay delivered; terminal event received immediately |
| Step retry: url-agent returns 503 twice then succeeds | `retry_count = 2`; `step_retrying` events emitted; step eventually COMPLETED |
| Step terminal failure: url-agent returns non-retryable 422 | Run transitions to FAILED after 0 retries; `workflow_failed` SSE emitted |
| `DELETE /api/v1/workflows/run/:id` mid-run | Run status CANCELLED; in-flight step receives cancellation; `workflow_cancelled` SSE |
| Per-user concurrency limit (3 concurrent runs) | 4th run returns 429 KBWFL0009 |
| Feature flag `workflow.enabled: false` | All endpoints return 503 KBWFL0001 |
| `kms_spawn_agent` sync mode | Parent step blocks; child run visible in `GET /api/v1/workflows/runs` |
| Agent health check: agent returns 503 for 3 consecutive checks | `kms_agents.health_status` transitions to UNREACHABLE |

### E2E Tests

| Scenario | Stack required |
|----------|---------------|
| Full youtube_url_ingest against live url-agent (short public YouTube video < 60 s) | url-agent, rag-service, kms-api, PostgreSQL, RabbitMQ, embed-worker |
| Workflow run visible in `GET /api/v1/workflows/runs` after completion | kms-api, PostgreSQL |
| Audit trail: every step's input/output persisted in `kms_workflow_steps` | kms-api, PostgreSQL |
| Cancel running workflow; re-trigger; verify new run succeeds | kms-api, PostgreSQL |
| url-agent `/health/ready` returns 200 only when yt-dlp binary present and Whisper model loaded | url-agent |

---

## 14. Rollout

### Feature Flags

New entries to add to `.kms/config.json` under `features`:

```json
"workflow": {
  "enabled": false,
  "maxConcurrentWorkflows": 10,
  "maxStepsPerWorkflow": 20,
  "stepTimeoutSeconds": 300,
  "agents": {
    "urlAgent": {
      "enabled": false,
      "endpoint": "http://url-agent:8005",
      "comment": "Requires url-agent Docker service"
    },
    "summaryAgent": {
      "enabled": false,
      "comment": "Requires llm.enabled=true"
    },
    "ingestAgent": {
      "enabled": false,
      "comment": "Write-class; requires explicit permission gate"
    },
    "searchAgent": {
      "enabled": true,
      "comment": "Always available; uses existing search-api"
    }
  }
},
"urlIngest": {
  "enabled": false,
  "youtubeEnabled": false,
  "maxTranscriptChars": 100000,
  "ytDlpPath": "/usr/local/bin/yt-dlp",
  "whisperModel": "base",
  "comment": "youtubeEnabled requires ytDlpPath binary present in url-agent container"
}
```

### Rollout Phases

| Phase | Action | Validation |
|-------|--------|------------|
| 1 — Deploy | Deploy M14 code with `workflow.enabled: false` and `urlIngest.enabled: false` | Zero user-facing impact; health checks pass; Prisma migration runs |
| 2 — Internal (staging) | Flip `workflow.enabled: true`; add url-agent to Docker Compose; flip `urlIngest.enabled: true` and `urlIngest.youtubeEnabled: true` | Run E2E suite; test youtube_url_ingest workflow with a public video; verify SSE stream and audit trail |
| 3 — Beta users | Enable for beta user group on production; monitor p95 latencies, error rates, url-agent memory and CPU | Watch for yt-dlp quota issues, Whisper model load time on cold start, DB row growth rate |
| 4 — General availability | Enable `workflow.enabled: true` for all users; enable `ingest-agent` behind explicit permission gate | Monitor per-user concurrency at limit; verify KBWFL0009 behaviour under load |

### Docker Compose Changes

Add to `docker-compose.kms.yml`:

```yaml
url-agent:
  build:
    context: ./services/url-agent
    target: production
  ports:
    - "8005:8005"
  environment:
    - AMQP_URL=amqp://guest:guest@rabbitmq:5672
    - WHISPER_MODEL=base
    - YTDLP_PATH=/usr/local/bin/yt-dlp
    - OTLP_ENDPOINT=http://otel-collector:4317
    - LOG_LEVEL=info
  volumes:
    - url-agent-tmp:/tmp/url-agent
  deploy:
    resources:
      limits:
        cpus: '4'
        memory: 8G
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8005/health/live"]
    interval: 30s
    timeout: 10s
    retries: 3
  depends_on:
    rabbitmq:
      condition: service_healthy
```

### Migration

1. Run Prisma migration `20260317000002_add_workflow_tables` — creates `kms_agents`, `kms_workflow_runs`, `kms_workflow_steps`
2. Seed `kms_agents` with the 4 built-in agents (url-agent, summary-agent, ingest-agent, search-agent) via a Prisma seed script
3. No changes to existing tables; migration is additive-only
4. Register `WorkflowModule` in `kms-api/src/app.module.ts`; add `WorkflowRepository` to `database.module.ts`

### Dependencies

| Dependency | Required for | Must ship before M14 |
|------------|-------------|----------------------|
| M13 ACP Integration | ACP session model, tool registry, `kms_acp_tool_calls` audit table | Yes |
| yt-dlp binary | `kms_extract_transcript` | In url-agent Docker image |
| Whisper model (`base` or larger) | `kms_extract_transcript` fallback | In url-agent Docker image |
| LLM enabled (`llm.enabled: true`) | `kms_summarize`, `kms_classify` | Required in staging; not for unit tests |
| ADR-0020, ADR-0021, ADR-0022 | Architecture decisions before implementation | Yes — must be accepted before coding begins |

### Rollback Plan

1. Set `workflow.enabled: false` in `.kms/config.json` — all workflow endpoints return 503 immediately; no data loss
2. If url-agent causes resource pressure: remove `url-agent` service from Docker Compose and set `urlIngest.enabled: false`; kms-api unaffected
3. DB tables (`kms_workflow_runs`, `kms_workflow_steps`, `kms_agents`) can be retained (additive only) or dropped via a rollback migration — no FK constraints from other existing tables
4. M13 ACP tables are unchanged by M14; M13 rollback remains independent

---

## 15. Linked Resources

| Resource | Path |
|----------|------|
| Architecture overview (agentic platform) | `docs/architecture/KMS-AGENTIC-PLATFORM.md` *(planned)* |
| PRD-M13: ACP Integration (prerequisite) | `docs/prd/PRD-M13-acp-integration.md` |
| ADR-0012: ACP as agent protocol | `docs/architecture/decisions/0012-acp-protocol.md` |
| ADR-0013: NestJS orchestrator + LangGraph | `docs/architecture/decisions/0013-orchestrator-pattern.md` |
| ADR-0018: ACP HTTP transport | `docs/architecture/decisions/0018-acp-http-transport.md` |
| ADR-0019: ACP tool registry design | `docs/architecture/decisions/0019-acp-tool-registry.md` |
| ADR-0020: Agent registry design *(planned)* | `docs/architecture/decisions/0020-agent-registry-design.md` |
| ADR-0021: Workflow engine *(planned)* | `docs/architecture/decisions/0021-workflow-engine.md` |
| ADR-0022: Sub-agent session model *(planned)* | `docs/architecture/decisions/0022-sub-agent-session-model.md` |
| Sequence diagram 11: YouTube URL workflow *(planned)* | `docs/architecture/sequence-diagrams/11-youtube-url-workflow.md` |
| Sequence diagram 12: Multi-agent parallel spawn *(planned)* | `docs/architecture/sequence-diagrams/12-multi-agent-parallel-spawn.md` |
| Feature guide: Agentic workflows *(planned)* | `docs/development/FOR-agentic-workflows.md` |
| PRD-M15: External agent integration (Claude Code, Codex, Gemini, MCP server) | `docs/prd/PRD-M15-external-agent-integration.md` |
| Engineering standards | `docs/architecture/ENGINEERING_STANDARDS.md` |
| Engineering workflow | `docs/workflow/ENGINEERING_WORKFLOW.md` |
| Feature flags | `.kms/config.json` |
| OpenAPI contract | `contracts/openapi.yaml` |
| url-agent service | `services/url-agent/` *(new in M14)* |
| Workflow module | `kms-api/src/modules/workflow/` *(new in M14)* |
| ACP module (M13) | `kms-api/src/modules/acp/` |
| RAG service | `services/rag-service/` |
