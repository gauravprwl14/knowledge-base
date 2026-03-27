# 📊 Logging & Monitoring Guide

> **Goal:** Implement comprehensive logging and monitoring for production visibility.

---

## 1. Logging Levels

| Level | When to Use | Example |
|-------|-------------|---------|
| `error` | Errors requiring attention | Database failures |
| `warn` | Potential issues | Deprecated API usage |
| `info` | Normal operations | Request completed |
| `debug` | Development details | Variable values |
| `trace` | Detailed tracing | Function entry/exit |

---

## 2. Pino Logger Setup

```typescript
// lib/logger/index.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  base: { service: 'api', env: process.env.NODE_ENV },
  redact: ['password', 'token', 'authorization'],
});
```

---

## 3. Request Logging

```typescript
// Middleware for request logging
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  req.headers['x-request-id'] = requestId;

  res.on('finish', () => {
    logger.info({
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: Date.now() - start,
      userId: req.user?.userId,
    });
  });

  next();
}
```

---

## 4. What to Log

### ✅ Do Log
- Request/response (method, path, status, duration)
- Authentication events (login, logout, failures)
- Business events (order created, payment processed)
- Errors with context
- Performance metrics

### ❌ Don't Log
- Passwords or secrets
- Full credit card numbers
- Personal data (PII) unless necessary
- Large request/response bodies

---

## 5. Error Logging

```typescript
logger.error({
  error: {
    code: error.code,
    message: error.message,
    stack: error.stack,
  },
  context: {
    requestId,
    userId: req.user?.userId,
    path: req.path,
  },
});
```

---

## 6. Key Metrics to Track

| Metric | Description | Alert If |
|--------|-------------|----------|
| Response Time | P95 latency | > 500ms |
| Error Rate | 5xx / total | > 1% |
| Request Rate | Requests/sec | Sudden spike |
| Database Latency | Query time | > 100ms |
| Memory Usage | Heap used | > 80% |

---

## 7. Health Check Metrics

```typescript
router.get('/metrics', (req, res) => {
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: Date.now(),
  });
});
```

---

> 💡 **Tip:** Use structured JSON logging in production for easier parsing and searching.

