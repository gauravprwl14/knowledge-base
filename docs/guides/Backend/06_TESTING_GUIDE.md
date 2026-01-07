# 🧪 Backend Testing Guide

> **Goal:** Write reliable, maintainable tests for Node.js backend applications.

---

## 1. Testing Pyramid

```text
          ┌───────────┐
          │    E2E    │  ← Few (slow, expensive)
          ├───────────┤
          │Integration│  ← Some
          ├───────────┤
          │   Unit    │  ← Many (fast, cheap)
          └───────────┘
```

| Level | Tests | Speed | What to Test |
|-------|-------|-------|--------------|
| **Unit** | Many | Fast | Services, utilities, pure functions |
| **Integration** | Some | Medium | API routes, database queries |
| **E2E** | Few | Slow | Critical user flows |

---

## 2. Testing Tools

| Tool | Purpose |
|------|---------|
| **Vitest/Jest** | Test runner, assertions |
| **Supertest** | HTTP request testing |
| **Testcontainers** | Database containers for tests |
| **MSW** | Mock external APIs |
| **Faker** | Generate test data |

### Installation
```bash
npm install --save-dev vitest @vitest/coverage-v8 supertest @types/supertest @faker-js/faker
```

---

## 3. Test File Structure

```text
src/
├── services/
│   ├── userService.ts
│   └── __tests__/
│       └── userService.test.ts
├── api/
│   └── v1/
│       └── users/
│           ├── users.controller.ts
│           └── __tests__/
│               └── users.integration.test.ts
└── lib/
    └── utils/
        ├── hash.ts
        └── __tests__/
            └── hash.test.ts
```

---

## 4. Unit Testing

### Testing Pure Functions
```typescript
// lib/utils/__tests__/hash.test.ts
import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword } from '../hash';

describe('Hash Utilities', () => {
  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'testPassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('comparePassword', () => {
    it('should return true for matching password', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);
      
      const result = await comparePassword(password, hash);
      
      expect(result).toBe(true);
    });

    it('should return false for non-matching password', async () => {
      const hash = await hashPassword('correctPassword');
      
      const result = await comparePassword('wrongPassword', hash);
      
      expect(result).toBe(false);
    });
  });
});
```

### Testing Services
```typescript
// services/__tests__/userService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as userService from '../userService';
import { userRepository } from '@/repositories/userRepository';
import { Errors } from '@/lib/errors';

// Mock the repository
vi.mock('@/repositories/userRepository');

describe('UserService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      const mockUser = { id: '1', email: 'test@example.com', name: 'Test' };
      vi.mocked(userRepository.findById).mockResolvedValue(mockUser);

      const result = await userService.getUserById('1');

      expect(result).toEqual(mockUser);
      expect(userRepository.findById).toHaveBeenCalledWith('1');
    });

    it('should throw not found error when user does not exist', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(null);

      await expect(userService.getUserById('999'))
        .rejects
        .toThrow(Errors.resource.notFound('User'));
    });
  });

  describe('createUser', () => {
    const validInput = {
      email: 'new@example.com',
      password: 'password123',
      name: 'New User',
    };

    it('should create user when email is unique', async () => {
      vi.mocked(userRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(userRepository.create).mockResolvedValue({
        id: '1',
        ...validInput,
        password: 'hashed',
      });

      const result = await userService.createUser(validInput);

      expect(result.email).toBe(validInput.email);
      expect(userRepository.create).toHaveBeenCalled();
    });

    it('should throw error when email already exists', async () => {
      vi.mocked(userRepository.findByEmail).mockResolvedValue({
        id: '1',
        email: validInput.email,
      });

      await expect(userService.createUser(validInput))
        .rejects
        .toThrow();
    });
  });
});
```

---

## 5. Integration Testing

### API Integration Tests
```typescript
// api/v1/users/__tests__/users.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '@/app';
import { prisma } from '@/repositories/baseRepository';
import { generateAccessToken } from '@/lib/utils/jwt';

describe('Users API', () => {
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    // Create test users
    const admin = await prisma.user.create({
      data: {
        email: 'admin@test.com',
        password: 'hashed',
        name: 'Admin',
        role: 'ADMIN',
      },
    });
    
    const user = await prisma.user.create({
      data: {
        email: 'user@test.com',
        password: 'hashed',
        name: 'User',
        role: 'USER',
      },
    });

    adminToken = generateAccessToken({ userId: admin.id, role: 'ADMIN' });
    userToken = generateAccessToken({ userId: user.id, role: 'USER' });
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  describe('GET /api/v1/users', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/users');

      expect(response.status).toBe(401);
    });

    it('should return 403 for non-admin users', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });

    it('should return users list for admin', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/v1/users?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.meta.pagination).toBeDefined();
      expect(response.body.meta.pagination.page).toBe(1);
    });
  });

  describe('POST /api/v1/users', () => {
    it('should create user with valid data', async () => {
      const userData = {
        email: 'newuser@test.com',
        password: 'password123',
        name: 'New User',
      };

      const response = await request(app)
        .post('/api/v1/users')
        .send(userData);

      expect(response.status).toBe(201);
      expect(response.body.data.email).toBe(userData.email);
    });

    it('should return 422 for invalid email', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .send({
          email: 'invalid-email',
          password: 'password123',
          name: 'Test',
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VAL1000');
    });

    it('should return 409 for duplicate email', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .send({
          email: 'admin@test.com', // Already exists
          password: 'password123',
          name: 'Test',
        });

      expect(response.status).toBe(409);
    });
  });
});
```

---

## 6. Test Database Setup

### Using Testcontainers
```typescript
// tests/setup.ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { prisma } from '@/repositories/baseRepository';

let container: StartedPostgreSqlContainer;

export async function setupTestDatabase() {
  container = await new PostgreSqlContainer()
    .withDatabase('test')
    .start();

  process.env.DATABASE_URL = container.getConnectionUri();
  
  // Run migrations
  await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
  // ... or use prisma migrate
}

export async function teardownTestDatabase() {
  await prisma.$disconnect();
  await container.stop();
}
```

### Using SQLite for Speed
```typescript
// For faster tests with SQLite
// prisma/schema.test.prisma
datasource db {
  provider = "sqlite"
  url      = "file:./test.db"
}
```

---

## 7. Test Factories

```typescript
// tests/factories/userFactory.ts
import { faker } from '@faker-js/faker';
import { prisma } from '@/repositories/baseRepository';
import { hashPassword } from '@/lib/utils/hash';

interface UserOverrides {
  email?: string;
  name?: string;
  role?: 'USER' | 'ADMIN';
}

/**
 * Create a test user
 */
export async function createUser(overrides: UserOverrides = {}) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? faker.internet.email(),
      password: await hashPassword('password123'),
      name: overrides.name ?? faker.person.fullName(),
      role: overrides.role ?? 'USER',
    },
  });
}

/**
 * Create multiple test users
 */
export async function createUsers(count: number, overrides: UserOverrides = {}) {
  return Promise.all(
    Array.from({ length: count }).map(() => createUser(overrides))
  );
}
```

---

## 8. Mocking External Services

```typescript
// tests/mocks/emailService.ts
import { vi } from 'vitest';

export const mockEmailService = {
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordReset: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@/services/emailService', () => mockEmailService);
```

### MSW for HTTP Mocking
```typescript
// tests/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('https://api.stripe.com/v1/charges', () => {
    return HttpResponse.json({
      id: 'ch_test123',
      status: 'succeeded',
    });
  }),
  
  http.post('https://api.stripe.com/v1/charges', () => {
    return HttpResponse.json(
      { error: { message: 'Card declined' } },
      { status: 402 }
    );
  }),
];
```

---

## 9. Test Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/'],
    },
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
```

---

## 10. Test Scripts

```json
// package.json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:unit": "vitest run --dir src",
    "test:integration": "vitest run --dir src --testNamePattern=integration",
    "test:e2e": "vitest run --dir e2e"
  }
}
```

---

## 11. Testing Best Practices

### ✅ Do's
| Practice | Reason |
|----------|--------|
| Isolate tests | Tests shouldn't depend on each other |
| Clean up data | Reset database between tests |
| Use factories | Consistent test data creation |
| Test edge cases | Catch bugs before production |
| Mock external services | Faster, reliable tests |

### ❌ Don'ts
| Anti-Pattern | Why |
|--------------|-----|
| Share state between tests | Flaky tests |
| Test implementation details | Brittle tests |
| Skip error cases | Miss real bugs |
| Use production database | Dangerous! |

---

## 12. CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
      
      - run: npm test
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
```

---

> 📚 **Next:** Learn security practices → [SECURITY_GUIDE.md](./07_SECURITY_GUIDE.md)

