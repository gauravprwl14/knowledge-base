# 🔒 Backend Security Guide

> **Goal:** Implement security best practices to protect your API and users.

---

## 1. Security Checklist

### Authentication & Authorization
- [ ] Use bcrypt (12+ rounds) for password hashing
- [ ] Implement JWT with short expiry (15min access, 7d refresh)
- [ ] Store tokens in httpOnly cookies
- [ ] Validate tokens on every request
- [ ] Implement role-based access control

### Input Validation
- [ ] Validate ALL input with Zod schemas
- [ ] Sanitize user input before database queries
- [ ] Use parameterized queries (Prisma does this)
- [ ] Limit request body size
- [ ] Validate file uploads (type, size)

### API Security
- [ ] Enable CORS with specific origins
- [ ] Implement rate limiting
- [ ] Add security headers (Helmet)
- [ ] Use HTTPS in production
- [ ] Log security events

---

## 2. Security Middleware Setup

```typescript
// api/middleware/security.ts
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Express } from 'express';

export function setupSecurity(app: Express) {
  // Security headers
  app.use(helmet());

  // CORS
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  }));

  // Rate limiting
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
  }));

  // Auth endpoints - stricter limits
  app.use('/api/v1/auth', rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 attempts per hour
    message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts' } },
  }));

  // Body size limit
  app.use(express.json({ limit: '10kb' }));
}
```

---

## 3. SQL Injection Prevention

```typescript
// ✅ Safe: Prisma uses parameterized queries
const user = await prisma.user.findFirst({
  where: { email: userInput },
});

// ❌ Dangerous: Raw query with string interpolation
const user = await prisma.$queryRaw`
  SELECT * FROM users WHERE email = '${userInput}'
`;

// ✅ Safe: Parameterized raw query
const user = await prisma.$queryRaw`
  SELECT * FROM users WHERE email = ${userInput}
`;
```

---

## 4. XSS Prevention

```typescript
// Sanitize HTML in user content
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'],
    ALLOWED_ATTR: ['href'],
  });
}

// Use in service layer
const sanitizedBio = sanitizeHtml(input.bio);
```

---

## 5. Secrets Management

```typescript
// config/index.ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'production', 'test']),
});

// Validate at startup - fail fast if missing
export const config = envSchema.parse(process.env);
```

### Environment Variables
```bash
# .env.example - NEVER commit actual secrets
DATABASE_URL=postgresql://user:pass@localhost:5432/db
JWT_ACCESS_SECRET=your-secret-min-32-chars-here
JWT_REFRESH_SECRET=different-secret-min-32-chars
```

---

## 6. Common Vulnerabilities

| Vulnerability | Prevention |
|--------------|------------|
| SQL Injection | Parameterized queries (Prisma) |
| XSS | Sanitize output, CSP headers |
| CSRF | SameSite cookies, CSRF tokens |
| Broken Auth | Strong passwords, rate limiting |
| Sensitive Data | Encrypt at rest, HTTPS |
| Mass Assignment | Whitelist allowed fields |

---

## 7. Logging Security Events

```typescript
// Log authentication attempts
logger.info({
  event: 'AUTH_LOGIN_ATTEMPT',
  email: data.email,
  success: true,
  ip: req.ip,
});

// Log failed attempts
logger.warn({
  event: 'AUTH_LOGIN_FAILED',
  email: data.email,
  reason: 'invalid_password',
  ip: req.ip,
});

// Log suspicious activity
logger.error({
  event: 'SECURITY_ALERT',
  type: 'rate_limit_exceeded',
  ip: req.ip,
  path: req.path,
});
```

---

> 📚 **Next:** Learn deployment → [DEPLOYMENT_GUIDE.md](./08_DEPLOYMENT_GUIDE.md)

