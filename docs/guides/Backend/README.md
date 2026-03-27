# 🖥️ Backend Documentation (Node.js API)

> **Starter kit documentation for building production-ready REST APIs.**

---

## 📁 Contents

| File | Description | Read When |
|------|-------------|-----------|
| [00_QUICK_START.md](./00_QUICK_START.md) | Get started quickly | First thing |
| [01_ARCHITECTURE_OVERVIEW.md](./01_ARCHITECTURE_OVERVIEW.md) | Layered architecture | Understanding the codebase |
| [02_API_DESIGN_GUIDE.md](./02_API_DESIGN_GUIDE.md) | REST conventions | Creating endpoints |
| [03_DATABASE_GUIDE.md](./03_DATABASE_GUIDE.md) | Prisma & repositories | Working with data |
| [04_AUTH_GUIDE.md](./04_AUTH_GUIDE.md) | JWT & RBAC | Implementing auth |
| [05_ERROR_HANDLING.md](./05_ERROR_HANDLING.md) | Error codes & handling | Handling errors |
| [06_TESTING_GUIDE.md](./06_TESTING_GUIDE.md) | Vitest & Supertest | Writing tests |
| [07_SECURITY_GUIDE.md](./07_SECURITY_GUIDE.md) | Security best practices | Securing your API |
| [08_DEPLOYMENT_GUIDE.md](./08_DEPLOYMENT_GUIDE.md) | Docker & CI/CD | Going to production |
| [09_SETUP_GUIDE.md](./09_SETUP_GUIDE.md) | Full project setup | Initial configuration |
| [10_LOGGING_MONITORING.md](./10_LOGGING_MONITORING.md) | Pino & metrics | Observability |

---

## 🎯 Key Principles

1. **Layered Architecture** - API → Service → Repository → Database
2. **Validation First** - Zod schemas at API boundaries
3. **Type Safety** - TypeScript strict mode everywhere
4. **Error Codes** - Consistent, traceable error system

---

## 🚀 Quick Start

```bash
# Initialize project
npm init -y
npm install express zod prisma @prisma/client

# Setup Prisma
npx prisma init
npx prisma migrate dev --name init

# Start development
npm run dev
```

---

## 🏗️ Architecture at a Glance

```text
API Layer (Routes)     → HTTP handling, validation
        ↓
Service Layer          → Business logic
        ↓
Repository Layer       → Data access
        ↓
Database               → PostgreSQL
```

---

## 📚 Recommended Reading Order

**For new developers:**
1. Quick Start → Architecture → API Design

**For feature development:**
1. API Design → Database → Error Handling

**For production:**
1. Security → Deployment → Logging

---

> 📖 **Parent Docs:** See [../ERROR_GUIDE.md](../ERROR_GUIDE.md) for shared error patterns.

