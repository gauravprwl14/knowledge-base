# 0020 — Agent Registry Design

- **Status**: Proposed
- **Date**: 2026-03-17
- **Deciders**: KMS Team
- **Tags**: [acp, agents, registry, workflow]

## Context and Problem Statement

KMS's agentic platform introduces a set of specialized first-party agents — `url-agent`, `summary-agent`, `ingest-agent`, `rag-agent`, and `search-agent` — each responsible for a discrete capability within the larger workflow orchestration system. Before any agent can be invoked by the WorkflowEngine or an ACP client, kms-api must know the agent exists, where to reach it, and whether it is currently healthy.

The agent registry is the component that answers three questions at runtime: (1) which agents are available, (2) what are their ACP endpoints, and (3) are they ready to accept work? The design of this registry directly affects startup complexity, operational overhead, and the reliability of workflow dispatch.

KMS currently has six specialized agents, all of which are first-party services deployed in the same Docker Compose network. There is no near-term requirement to support third-party or user-installed agent plugins. All agents are known at design time, their ACP endpoint URLs are deterministic (based on Docker service DNS), and their availability is gated by the same `.kms/config.json` feature-flag mechanism used throughout the stack.

## Decision Drivers

- All KMS agents are first-party services known at design time — no third-party plugin requirement exists now or on the near-term roadmap
- `.kms/config.json` already provides a feature-flag mechanism used by every other subsystem; the agent registry should integrate with it rather than introduce a separate registration protocol
- Startup-time validation is preferred over runtime discovery — a misconfigured or missing agent should cause a fast failure before the first workflow request arrives
- kms-api is the single orchestration gateway; it should remain authoritative about which agents exist without delegating that authority to the agents themselves
- Operational simplicity is a constraint — the team does not run a service mesh, Consul, or Kubernetes service discovery; the infra is Docker Compose
- Health checking must be lightweight and must not require any changes to individual agent implementations beyond exposing a `GET /health/ready` endpoint (already mandated by the platform standard)

## Considered Options

- **Option A**: Static declarative registry — agents defined in code/config at startup; agent IDs and endpoint URLs sourced from environment variables and `.kms/config.json`; health checked periodically via `GET /health/ready`
- **Option B**: Dynamic self-registration — agents POST to `kms-api /api/v1/agents/register` at startup with their capability manifest; kms-api stores registrations in PostgreSQL and caches in Redis
- **Option C**: Service discovery via Docker Compose labels — kms-api reads Docker network DNS at startup; agents expose a `/.well-known/acp-capabilities` endpoint that kms-api polls to build its internal registry

## Decision Outcome

Chosen: **Option A — Static declarative registry** — the agent set is fully known at design time and changes only with code deployments. A static registry aligns with the existing feature-flag pattern in `.kms/config.json`, provides startup-time validation, requires no registration API, and adds zero operational overhead. Configuration lives under `workflow.agents` in `.kms/config.json`; health checks run on a configurable periodic interval via a `GET /health/ready` probe against each agent's base URL.

### Consequences

**Good:**
- Agent configuration is version-controlled alongside code — changes are reviewed, auditable, and rolled back with the same deployment that introduced them
- Startup validation: the `AgentRegistryService` fails fast on `onModuleInit` if a required agent's endpoint is unreachable or its feature flag is disabled, preventing silent misconfiguration
- `GET /api/v1/agents` is served from an in-memory cache populated at startup — zero per-request database overhead
- No registration API surface to design, version, secure, or document — reduces attack surface
- Health check loop is a simple `setInterval` HTTP probe — no distributed coordination required
- Fully consistent with how tool availability is resolved in ADR-0019 (static declarative registry for ACP tools)

**Bad / Trade-offs:**
- Adding a new agent requires a code/config change and redeployment — cannot register an agent at runtime without restarting kms-api
- If a future requirement introduces user-installed or marketplace agents, the registry will need to be extended to support dynamic entries alongside static ones
- Endpoint URLs are environment-variable-driven; local development vs. staging vs. production requires careful `.env` management

## Pros and Cons of the Options

### Option A — Static declarative registry

- ✅ All agents visible in one config file — easy to audit and review
- ✅ Feature-flag integration is trivial: agent is included in the registry if and only if its flag is enabled in `.kms/config.json`
- ✅ Startup validation catches missing or unreachable agents before the service accepts traffic
- ✅ No runtime state to reconcile — registry is a pure function of config + feature flags
- ✅ Matches NestJS module pattern: `AgentRegistryModule` is a provider that resolves at `onModuleInit`
- ✅ Zero additional infrastructure dependencies
- ❌ New agent requires config change + redeployment
- ❌ Not extensible by external parties without touching core configuration

### Option B — Dynamic self-registration

- ✅ Agents self-describe their capabilities — kms-api does not need to know agent schemas upfront
- ✅ Supports future third-party agent plugins without architectural changes
- ✅ Agents that restart re-register automatically, giving real-time availability updates
- ❌ kms-api must expose and maintain a registration API (`POST /api/v1/agents/register`) with its own auth, validation, and versioning
- ❌ Race condition at startup: if kms-api starts before agents, the registry is temporarily empty and workflow dispatch would fail
- ❌ Registration state in PostgreSQL + Redis introduces a new consistency surface — stale registrations must be expired and cleaned up
- ❌ All KMS agents are first-party and known at deploy time — YAGNI

### Option C — Service discovery via Docker Compose labels

- ✅ No configuration needed — agent location is derived from Docker network topology
- ✅ Works automatically when new containers are added to the Compose network
- ❌ Requires the Docker daemon socket to be mounted into kms-api — a significant security concern
- ❌ `/.well-known/acp-capabilities` polling adds a startup dependency on Docker label conventions not currently in use
- ❌ Does not translate to non-Docker environments (bare metal, Kubernetes) without significant rework
- ❌ Adds an implicit contract between kms-api and Docker infrastructure that is not version-controlled

## Registry Design

Agent registry configuration lives in `.kms/config.json` under the `workflow.agents` key:

```json
{
  "workflow": {
    "agents": {
      "url-agent":     { "url": "${URL_AGENT_URL}",     "featureFlag": "ENABLE_URL_AGENT",     "timeoutSeconds": 30 },
      "summary-agent": { "url": "${SUMMARY_AGENT_URL}", "featureFlag": "ENABLE_SUMMARY_AGENT", "timeoutSeconds": 60 },
      "ingest-agent":  { "url": "${INGEST_AGENT_URL}",  "featureFlag": null,                   "timeoutSeconds": 120 },
      "rag-agent":     { "url": "${RAG_AGENT_URL}",     "featureFlag": "ENABLE_RAG",           "timeoutSeconds": 120 },
      "search-agent":  { "url": "${SEARCH_AGENT_URL}",  "featureFlag": null,                   "timeoutSeconds": 30 }
    },
    "healthCheck": {
      "intervalSeconds": 30,
      "path": "/health/ready"
    }
  }
}
```

`AgentRegistryService` in `kms-api/src/modules/agents/` reads this config at `onModuleInit`, resolves feature flags, and runs an initial health probe for each enabled agent. Subsequent probes run on the configured interval and update an in-memory `healthy` boolean per agent. Workflow dispatch skips agents whose `healthy` flag is `false` and records a `KBWRK0010` error event on the run.
