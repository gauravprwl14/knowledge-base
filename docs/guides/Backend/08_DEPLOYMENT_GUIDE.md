# 🚀 Backend Deployment Guide

> **Goal:** Deploy your Node.js backend securely and reliably.

---

## 1. Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Environment variables configured
- [ ] Database migrations tested
- [ ] Security headers enabled
- [ ] Logging configured
- [ ] Health check endpoint ready

### Post-Deployment
- [ ] Verify health check
- [ ] Check logs for errors
- [ ] Test critical endpoints
- [ ] Monitor performance
- [ ] Set up alerts

---

## 2. Docker Setup

### Dockerfile
```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 api
USER api

COPY --from=builder --chown=api:nodejs /app/dist ./dist
COPY --from=builder --chown=api:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=api:nodejs /app/prisma ./prisma

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/app
      - NODE_ENV=production
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=app
    restart: unless-stopped

volumes:
  postgres_data:
```

---

## 3. Health Check Endpoint

```typescript
// api/health.ts
router.get('/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Database connection failed',
    });
  }
});
```

---

## 4. Database Migrations in Production

```bash
# Run migrations in CI/CD
npx prisma migrate deploy

# Never use 'migrate dev' in production!
```

### Migration Script
```bash
#!/bin/bash
# scripts/deploy.sh

set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting application..."
node dist/index.js
```

---

## 5. Environment Configuration

```bash
# .env.production
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
JWT_ACCESS_SECRET=<long-random-string>
JWT_REFRESH_SECRET=<different-long-random-string>
CORS_ORIGIN=https://yourdomain.com
LOG_LEVEL=info
```

---

## 6. CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Build and push Docker image
        run: |
          docker build -t myapp:${{ github.sha }} .
          docker push registry.example.com/myapp:${{ github.sha }}
      
      - name: Deploy to production
        run: |
          # Deploy command here
```

---

## 7. Monitoring & Logging

### Structured Logging
```typescript
// In production, logs should be JSON
const logger = pino({
  level: 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});
```

### Key Metrics to Monitor
| Metric | Alert Threshold |
|--------|-----------------|
| Response time | > 500ms |
| Error rate | > 1% |
| CPU usage | > 80% |
| Memory usage | > 80% |
| Database connections | > 80% pool |

---

## 8. Platform Deployment Options

| Platform | Best For | Complexity |
|----------|----------|------------|
| **Railway** | Fast deployment | Low |
| **Render** | Simple apps | Low |
| **AWS ECS** | Production scale | Medium |
| **Kubernetes** | Enterprise | High |

---

> ✅ **Deployment Complete!** Monitor your logs and metrics closely.

