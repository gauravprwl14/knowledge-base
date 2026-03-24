# CLAUDE.local.md — Session-Derived Rules

> These rules were established from repeated corrections during live sessions.
> They EXTEND (never duplicate) the patterns in `CLAUDE.md`.

---

## Mandatory Workflow

Rules that apply to EVERY task before writing a single line of code.

1. **[BLOCKING] Do RCA first** — never jump to a fix. State the root cause explicitly before proposing any solution. Format: "Root cause: [X]. Evidence: [Y]. Fix: [Z]."
2. **[BLOCKING] Analyse before verdict** — if unsure of the cause, read the relevant files, traces, and logs before giving a recommendation.
3. **[BLOCKING] Regression check** — for every change, explicitly list what else could break and why it won't. State: "Regression surface: [list of affected paths]."
4. **[BLOCKING] Infrastructure first** — before suggesting new config (nginx, Docker service, env var), search the repo for what already exists. Only create new config when you have confirmed nothing covers it.

---

## Bug Investigation Protocol

Do not skip steps. Apply to every bug report, regression, or unexpected behaviour.

1. Read the error in full — get the real API response or stack trace, never assume.
2. Trace the call path: frontend fetch → API gateway/nginx → service → DB/queue.
3. Check existing infra: `docker-compose.prod.yml`, `infra/nginx/`, `.env.prod.example` before touching config.
4. State root cause (one sentence) and supporting evidence (file + line).
5. Propose the minimal fix. Then list tests that will verify it.
6. After fixing, verify in Grafana/OTel that the trace is clean (see Observability Standards).

---

## Error Handling Standards

Errors must flow end-to-end — never swallowed, never hardcoded.

**Backend (NestJS)**
- Throw `AppException` with a KB error code and a human-readable `message` field.
- Log the full error context at `error` level with `@InjectPinoLogger` before re-throwing.
- The JSON response body MUST contain `{ statusCode, error, message, code }`.

**Backend (Python)**
- Raise a typed subclass of `KMSWorkerError` with `.code`, `.message`, `.retryable`.
- `structlog` bind the error before raising: `logger.error("...", error=str(e), code=err.code)`.

**Frontend**
- NEVER show a hardcoded string like "Something went wrong" when the API returned a real message.
- Always extract `error.response?.data?.message ?? error.message` and surface it to the user.
- Log the raw API error to the browser console at `error` level for debugging.
- Pattern for every API call in the frontend:
  ```ts
  try {
    const data = await apiClient.someCall();
  } catch (err: unknown) {
    const msg = extractApiError(err); // reads .response.data.message
    toast.error(msg);                 // shows real server message
    console.error('[ComponentName]', err);
  }
  ```

---

## Observability Standards

Every code change must include the following. This is not optional.

- **OTel span**: wrap every new service method or worker handler in a named span.
- **Structured log events**: log at `info` on entry with input context, `error` on failure with full error details.
- **No `console.log` / `print`** — use `@InjectPinoLogger` (NestJS) or `structlog` (Python).
- **After any bug fix**: open Grafana and confirm the trace shows no error spans. Screenshot or describe what you see.
- Grafana is available at `http://localhost:3002` (dev) or the configured prod URL.
- Confirm: "Trace verified in Grafana: [span name] is green / error span is gone."

---

## Testing Standards

Tests are part of the task, not an afterthought. They are planned upfront, not added after.

- **[BLOCKING]** Before starting implementation, list the unit tests and integration tests you will write.
- Unit tests: cover the happy path, all error branches, and edge cases for every new function/method.
- Integration tests: cover the full request/response cycle for every new endpoint.
- For bug fixes: add a regression test that would have caught the bug.
- Minimum coverage gate: **80%** on new files (matches DoD in `CLAUDE.md`).
- Run tests before declaring the task done:
  ```bash
  cd kms-api && npm run test
  cd frontend && npx jest --testPathPattern=<changed-file>
  ```
- State coverage output explicitly: "Tests passed: X/Y. Coverage: Z%."

---

## Production Deployment Rules

Always use this exact pattern. Do NOT omit `--env-file` or `--no-deps`.

```bash
# Deploy a single service without restarting unrelated containers
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps <service-name>

# View logs immediately after deploy
docker compose -f docker-compose.prod.yml logs -f <service-name>

# Full stack restart (only when necessary)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

**Never run** `docker compose up` without `--env-file .env.prod` in production — secrets will be missing.
**Never omit** `--no-deps` for single-service deploys — it prevents cascading restarts.

---

## Infrastructure First Check

Before creating any new nginx block, Docker service, or environment variable:

1. Search: `grep -r "<config keyword>" infra/ docker-compose*.yml nginx/` (or use Grep tool).
2. Read the existing file fully before suggesting a change.
3. Only add new config if you have confirmed the existing config does not already handle it.
4. State: "Checked [file paths]. Existing config does [X]. New config is needed because [Y]."

Relevant infra files to check first:
- `docker-compose.kms.yml`, `docker-compose.prod.yml`
- `infra/nginx/` (nginx proxy config)
- `.env.prod`, `.env.prod.example`

---

## Secret Management

- All secrets live in `.env.*` files — never hardcoded in source.
- When adding a new secret or env var:
  1. Add to the relevant `.env.prod` / `.env.dev` (actual values, not committed).
  2. Add the key (with a placeholder value) to `.env.example` and `.env.prod.example`.
  3. Document the var in the service's `README` or `FOR-docker.md`.
- [BLOCKING] A task that introduces a new secret is NOT done until `.env.example` is updated.

---

## Agent Usage

Use parallel agents by default for multi-file or multi-domain tasks. Do not do everything in a single sequential thread.

- **When to use parallel agents**: any task touching ≥ 2 services, or requiring both backend + frontend changes, or analysis + implementation simultaneously.
- **Pattern**: spin up one agent per domain (e.g., `kb-backend-lead` + `kb-qa-architect` in parallel), then merge results.
- **Do not ask for permission** — if a task has parallel workstreams, launch them without prompting.
- Use `/coordinate` when the task scope is unclear and routing is needed first.
- Reference skill triggers in `CLAUDE.md` — always use the right specialist, not a general agent.
