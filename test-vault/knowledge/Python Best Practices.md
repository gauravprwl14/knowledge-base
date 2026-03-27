# Python Best Practices

## Async First
Use `asyncio` and `aio-pika` for all I/O-bound operations. Never block the event loop.

## Structured Logging
Use `structlog` with JSON output. Always bind context: `logger.bind(user_id=..., job_id=...)`.

## Pydantic for Validation
All external data (AMQP messages, API responses, config) must be parsed through Pydantic models.

## Error Classification
Distinguish retryable errors (rate limits, timeouts) from terminal errors (auth failures, bad data).
- Retryable: `nack(requeue=True)`
- Terminal: `reject(requeue=False)` → dead letter queue

## Dependencies
Pin all dependencies in `requirements.txt`. Use `pip-compile` for reproducible builds.
