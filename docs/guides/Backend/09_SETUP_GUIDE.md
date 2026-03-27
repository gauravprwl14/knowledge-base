# 🛠️ Backend Setup Guide

> **Goal:** Complete setup for a production-ready Node.js/Express backend.

---

## 1. Prerequisites

| Software | Version | Command to Check |
|----------|---------|------------------|
| Node.js | v20+ LTS | `node --version` |
| npm | v10+ | `npm --version` |
| PostgreSQL | v15+ | `psql --version` |
| Git | Latest | `git --version` |

---

## 2. Project Initialization

```bash
# Create project
mkdir my-api && cd my-api
npm init -y

# Install core dependencies
npm install express zod prisma @prisma/client jsonwebtoken bcryptjs pino

# Install dev dependencies
npm install -D typescript @types/node @types/express vitest tsx eslint prettier

# Initialize TypeScript
npx tsc --init
```

---

## 3. TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

---

## 4. Prisma Setup

```bash
# Initialize Prisma
npx prisma init

# After editing schema.prisma
npx prisma generate
npx prisma migrate dev --name init
```

---

## 5. Package Scripts

```json
// package.json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint src --ext .ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:studio": "prisma studio"
  }
}
```

---

## 6. Application Entry Point

```typescript
// src/index.ts
import express from 'express';
import { setupSecurity } from './api/middleware/security';
import { errorHandler, notFoundHandler } from './api/middleware/errorHandler';
import { requestLogger } from './lib/logger';
import routes from './api';

const app = express();

// Security middleware
setupSecurity(app);

// Logging
app.use(requestLogger);

// Body parsing
app.use(express.json());

// Routes
app.use('/api', routes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { app };
```

---

## 7. Development Workflow

```bash
# Start development server
npm run dev

# Run tests
npm test

# Open Prisma Studio
npm run db:studio

# Build for production
npm run build
```

---

## 8. Folder Creation Script

```bash
# Create project structure
mkdir -p src/{api/{v1,middleware},services,repositories,models,lib/{errors,utils,validation},config,types}
```

---

## 9. Essential Files

### .env.example
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
JWT_ACCESS_SECRET=your-access-secret-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars
NODE_ENV=development
PORT=3000
```

### .gitignore
```
node_modules/
dist/
.env
*.log
.DS_Store
coverage/
```

---

## 10. Troubleshooting

| Issue | Solution |
|-------|----------|
| Prisma client not found | Run `npx prisma generate` |
| TypeScript path errors | Check tsconfig paths |
| Port already in use | `lsof -ti:3000 | xargs kill` |
| Database connection failed | Check DATABASE_URL |

---

> ✅ **Setup Complete!** Start building your API in `src/api/v1/`

