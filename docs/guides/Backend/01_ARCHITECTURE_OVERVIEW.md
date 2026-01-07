# 🏗️ Backend Architecture Overview

> **Goal:** Understand the layered architecture and separation of concerns for scalable Node.js backends.

---

## 1. Core Philosophy

We follow a **Clean Architecture** approach with clear separation of concerns:

| Principle | Description |
|-----------|-------------|
| **Dependency Inversion** | High-level modules don't depend on low-level modules |
| **Single Responsibility** | Each module has one reason to change |
| **Interface Segregation** | Many specific interfaces over one general interface |
| **Testability** | Every layer can be tested in isolation |

---

## 2. Layered Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                      API Layer (Routes)                      │
│     Handles HTTP, validation, authentication, responses      │
└─────────────────────────────────┬───────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer (Business)                  │
│           Business logic, orchestration, transactions        │
└─────────────────────────────────┬───────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                 Repository Layer (Data Access)               │
│           Database queries, external API calls               │
└─────────────────────────────────┬───────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                     Data Layer (Storage)                     │
│              PostgreSQL, Redis, S3, etc.                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Project Structure

```text
src/
├── api/                         # HTTP Layer
│   ├── v1/                      # API Version 1
│   │   ├── users/
│   │   │   ├── users.routes.ts  # Route definitions
│   │   │   ├── users.controller.ts # Request handlers
│   │   │   └── users.schemas.ts # Zod validation schemas
│   │   └── products/
│   ├── middleware/
│   │   ├── authenticate.ts      # JWT verification
│   │   ├── authorize.ts         # Role-based access
│   │   ├── validate.ts          # Request validation
│   │   ├── errorHandler.ts      # Global error handler
│   │   └── rateLimiter.ts       # Rate limiting
│   └── index.ts                 # Route aggregation
│
├── services/                    # Business Logic Layer
│   ├── userService.ts
│   ├── productService.ts
│   └── emailService.ts
│
├── repositories/                # Data Access Layer
│   ├── userRepository.ts
│   ├── productRepository.ts
│   └── baseRepository.ts
│
├── models/                      # Database Models
│   ├── User.ts
│   ├── Product.ts
│   └── index.ts
│
├── lib/                         # Shared Utilities
│   ├── errors/                  # Error handling system
│   │   ├── AppError.ts
│   │   ├── ErrorFactory.ts
│   │   └── errorCodes.ts
│   ├── validation/              # Shared Zod schemas
│   │   ├── common.ts
│   │   └── index.ts
│   ├── logger/                  # Logging setup
│   │   └── index.ts
│   └── utils/                   # Helper functions
│       ├── hash.ts
│       └── jwt.ts
│
├── config/                      # Configuration
│   ├── database.ts
│   ├── app.ts
│   └── index.ts
│
├── types/                       # TypeScript Types
│   ├── express.d.ts            # Express augmentation
│   └── index.ts
│
└── index.ts                     # Application entry point
```

---

## 4. Layer Responsibilities

### API Layer (Controllers/Routes)
**Location:** `src/api/`

| Responsibility | NOT Responsible For |
|---------------|---------------------|
| Parse HTTP requests | Business logic |
| Validate input | Database queries |
| Authentication check | External API calls |
| Format responses | Complex calculations |
| Error transformation | Transaction management |

```typescript
// api/v1/users/users.controller.ts
export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    // ✅ Validation already done by middleware
    const user = await userService.createUser(req.body);
    res.status(201).json({ data: user });
  } catch (error) {
    next(error);
  }
}
```

### Service Layer
**Location:** `src/services/`

| Responsibility | NOT Responsible For |
|---------------|---------------------|
| Business rules | HTTP handling |
| Transaction management | Request parsing |
| Orchestration | Direct DB queries |
| Data transformation | Response formatting |

```typescript
// services/userService.ts
export async function createUser(data: CreateUserInput) {
  // ✅ Business logic
  const hashedPassword = await hash(data.password);
  
  // ✅ Orchestration
  const user = await userRepository.create({
    ...data,
    password: hashedPassword,
  });
  
  // ✅ Side effects
  await emailService.sendWelcomeEmail(user.email);
  
  return user;
}
```

### Repository Layer
**Location:** `src/repositories/`

| Responsibility | NOT Responsible For |
|---------------|---------------------|
| Database queries | Business logic |
| Query building | HTTP handling |
| Data mapping | Validation |
| Cache management | Side effects |

```typescript
// repositories/userRepository.ts
export const userRepository = {
  async findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },
  
  async create(data: CreateUserData) {
    return prisma.user.create({ data });
  },
};
```

---

## 5. Dependency Flow Rules

```text
✅ ALLOWED                    ❌ NOT ALLOWED
──────────────────────────────────────────────
API → Service                 Service → API
Service → Repository          Repository → Service
Repository → Database         API → Repository (direct)
Service → Service             Repository → Repository
```

---

## 6. Module Communication

### Within the Same Domain
```typescript
// Direct function calls
import { userService } from '@/services/userService';
const user = await userService.findById(id);
```

### Between Domains (Events)
```typescript
// For loose coupling between domains
eventBus.emit('user:created', { userId: user.id });

// In another service
eventBus.on('user:created', async (data) => {
  await notificationService.sendWelcomeMessage(data.userId);
});
```

---

## 7. Configuration Management

```typescript
// config/index.ts
export const config = {
  app: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: '7d',
  },
  // Never put secrets directly, always use env vars
} as const;
```

---

## 8. Key Principles Summary

| Principle | Implementation |
|-----------|---------------|
| **Validate at boundaries** | Zod schemas in API layer |
| **Fail fast** | Validate early, throw meaningful errors |
| **Log everything** | Structured logging with context |
| **No magic** | Explicit dependency injection |
| **Type everything** | Full TypeScript strict mode |

---

> 📚 **Next:** Learn API design patterns → [API_DESIGN_GUIDE.md](./02_API_DESIGN_GUIDE.md)

