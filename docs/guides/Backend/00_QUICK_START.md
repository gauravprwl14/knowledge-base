# ⚡ Backend Quick Start Checklist

> **Goal:** Get your Node.js backend API running and understand the essential patterns.

---

## 🛑 Before You Code

- [ ] **Define API Contract:** Write OpenAPI/Swagger spec or at minimum, document endpoints
- [ ] **Schema First:** Define Zod schemas before implementing routes
- [ ] **Database Design:** Plan your data models before writing code

---

## 📁 Project Structure at a Glance

```text
src/
├── api/                    # Route handlers/controllers
│   ├── v1/                 # API versioning
│   └── middleware/         # Express/Fastify middleware
├── services/               # Business logic layer
├── repositories/           # Data access layer
├── models/                 # Database models/schemas
├── lib/                    # Shared utilities
│   ├── errors/             # Error handling system
│   ├── validation/         # Zod schemas
│   └── logger/             # Logging setup
├── config/                 # Configuration management
└── types/                  # TypeScript definitions
```

---

## 🏗️ Essential First Steps

### 1. Environment Setup
```bash
# Create .env from example
cp .env.example .env

# Install dependencies
npm install

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

### 2. Core Packages
```bash
# API Framework (choose one)
npm install express    # or fastify

# Validation
npm install zod

# Database ORM
npm install prisma @prisma/client  # or drizzle-orm

# Authentication
npm install jsonwebtoken bcryptjs

# Logging
npm install pino  # or winston
```

---

## ✅ Creating Your First Endpoint

### Step 1: Define Schema
```typescript
// lib/validation/users.ts
import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});
```

### Step 2: Create Service
```typescript
// services/userService.ts
export async function createUser(data: CreateUserInput) {
  // Business logic here
}
```

### Step 3: Create Route Handler
```typescript
// api/v1/users.ts
router.post('/', validate(createUserSchema), async (req, res) => {
  const user = await userService.createUser(req.body);
  res.status(201).json({ data: user });
});
```

---

## 🎯 Next Steps

| Task | Guide |
|------|-------|
| Understand architecture | [ARCHITECTURE_OVERVIEW.md](./01_ARCHITECTURE_OVERVIEW.md) |
| Design APIs | [API_DESIGN_GUIDE.md](./02_API_DESIGN_GUIDE.md) |
| Database patterns | [DATABASE_GUIDE.md](./03_DATABASE_GUIDE.md) |
| Authentication | [AUTH_GUIDE.md](./04_AUTH_GUIDE.md) |

---

> 💡 **Tip:** Always validate input at the API boundary and sanitize output before sending responses.

