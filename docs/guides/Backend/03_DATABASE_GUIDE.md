# 🗃️ Database Guide

> **Goal:** Implement reliable, performant, and maintainable database patterns.

---

## 1. ORM Choice

| ORM | Pros | Best For |
|-----|------|----------|
| **Prisma** | Type-safe, migrations, studio | Most projects |
| **Drizzle** | Lightweight, SQL-like | Performance-critical |
| **TypeORM** | Active Record pattern | Enterprise |

**Recommendation:** Start with Prisma for developer experience.

---

## 2. Prisma Setup

### Installation
```bash
npm install prisma @prisma/client
npx prisma init
```

### Schema Definition
```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  name      String
  role      Role     @default(USER)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  
  orders    Order[]
  profile   Profile?
  
  @@map("users")
}

model Profile {
  id        String  @id @default(cuid())
  bio       String?
  avatar    String?
  userId    String  @unique @map("user_id")
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@map("profiles")
}

model Order {
  id        String      @id @default(cuid())
  total     Decimal     @db.Decimal(10, 2)
  status    OrderStatus @default(PENDING)
  userId    String      @map("user_id")
  user      User        @relation(fields: [userId], references: [id])
  items     OrderItem[]
  createdAt DateTime    @default(now()) @map("created_at")
  
  @@map("orders")
}

enum Role {
  USER
  ADMIN
}

enum OrderStatus {
  PENDING
  PROCESSING
  SHIPPED
  DELIVERED
  CANCELLED
}
```

---

## 3. Repository Pattern

### Base Repository
```typescript
// repositories/baseRepository.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
```

### Domain Repository
```typescript
// repositories/userRepository.ts
import { prisma } from './baseRepository';
import { Prisma, User } from '@prisma/client';

type CreateUserData = Prisma.UserCreateInput;
type UpdateUserData = Prisma.UserUpdateInput;

/**
 * User Repository
 * @description Data access layer for User entity
 */
export const userRepository = {
  /**
   * Find user by ID
   * @param id - User ID
   * @returns User or null
   */
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  },

  /**
   * Find user by email
   * @param email - User email
   * @returns User or null
   */
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  },

  /**
   * Find user by ID with relations
   * @param id - User ID
   * @returns User with profile and orders
   */
  async findByIdWithRelations(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
  },

  /**
   * Create new user
   * @param data - User creation data
   * @returns Created user
   */
  async create(data: CreateUserData): Promise<User> {
    return prisma.user.create({ data });
  },

  /**
   * Update user
   * @param id - User ID
   * @param data - Update data
   * @returns Updated user
   */
  async update(id: string, data: UpdateUserData): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  },

  /**
   * Delete user (soft delete recommended in production)
   * @param id - User ID
   */
  async delete(id: string): Promise<void> {
    await prisma.user.delete({ where: { id } });
  },

  /**
   * List users with pagination
   */
  async findMany(options: {
    skip?: number;
    take?: number;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }) {
    return prisma.user.findMany(options);
  },

  /**
   * Count users
   */
  async count(where?: Prisma.UserWhereInput): Promise<number> {
    return prisma.user.count({ where });
  },
};
```

---

## 4. Migrations

### Commands
```bash
# Create migration
npx prisma migrate dev --name add_users_table

# Apply migrations (production)
npx prisma migrate deploy

# Reset database (development)
npx prisma migrate reset

# Generate client
npx prisma generate

# Open Prisma Studio
npx prisma studio
```

### Migration Best Practices
| ✅ Do | ❌ Don't |
|-------|----------|
| Small, focused migrations | Giant schema changes |
| Test migrations on staging | Deploy directly to production |
| Backup before migration | Skip backups |
| Add columns as nullable first | Add required columns directly |

---

## 5. Transactions

### Simple Transaction
```typescript
// services/orderService.ts
export async function createOrder(userId: string, items: OrderItem[]) {
  return prisma.$transaction(async (tx) => {
    // 1. Create order
    const order = await tx.order.create({
      data: {
        userId,
        total: calculateTotal(items),
        status: 'PENDING',
      },
    });

    // 2. Create order items
    await tx.orderItem.createMany({
      data: items.map(item => ({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
      })),
    });

    // 3. Update inventory
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          stock: { decrement: item.quantity },
        },
      });
    }

    return order;
  });
}
```

### Transaction Options
```typescript
prisma.$transaction(callback, {
  maxWait: 5000,  // Max time to wait for a connection
  timeout: 10000, // Max transaction duration
  isolationLevel: 'Serializable', // Isolation level
});
```

---

## 6. Query Optimization

### N+1 Problem
```typescript
// ❌ Bad: N+1 queries
const users = await prisma.user.findMany();
for (const user of users) {
  const orders = await prisma.order.findMany({
    where: { userId: user.id },
  });
}

// ✅ Good: Single query with include
const users = await prisma.user.findMany({
  include: {
    orders: true,
  },
});
```

### Selective Fields
```typescript
// Only fetch needed fields
const users = await prisma.user.findMany({
  select: {
    id: true,
    name: true,
    email: true,
    // password excluded
  },
});
```

### Pagination
```typescript
// Offset-based (simple, but slow for large offsets)
const users = await prisma.user.findMany({
  skip: (page - 1) * limit,
  take: limit,
});

// Cursor-based (better for large datasets)
const users = await prisma.user.findMany({
  take: limit,
  cursor: lastId ? { id: lastId } : undefined,
  orderBy: { id: 'asc' },
});
```

---

## 7. Indexes

```prisma
model Product {
  id        String   @id @default(cuid())
  name      String
  sku       String   @unique
  category  String
  price     Decimal
  createdAt DateTime @default(now())
  
  // Single column indexes
  @@index([category])
  @@index([createdAt])
  
  // Composite index
  @@index([category, price])
}
```

### When to Add Indexes
- Columns in WHERE clauses
- Columns in ORDER BY
- Foreign key columns
- Columns in JOIN conditions

---

## 8. Soft Deletes

```prisma
model User {
  id        String    @id @default(cuid())
  email     String    @unique
  deletedAt DateTime? @map("deleted_at")
  
  @@map("users")
}
```

```typescript
// Repository with soft delete
export const userRepository = {
  async findById(id: string) {
    return prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
  },

  async delete(id: string) {
    return prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },

  async restore(id: string) {
    return prisma.user.update({
      where: { id },
      data: { deletedAt: null },
    });
  },
};
```

---

## 9. Database Seeding

```typescript
// prisma/seed.ts
import { prisma } from '../src/repositories/baseRepository';
import { hashPassword } from '../src/lib/utils/hash';

async function main() {
  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password: await hashPassword('admin123'),
      name: 'Admin User',
      role: 'ADMIN',
    },
  });

  console.log({ admin });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

```json
// package.json
{
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  }
}
```

```bash
npx prisma db seed
```

---

## 10. Database Best Practices

| Practice | Description |
|----------|-------------|
| **Connection Pooling** | Use PgBouncer for high traffic |
| **Read Replicas** | Route reads to replicas |
| **Query Logging** | Log slow queries (>100ms) |
| **Backups** | Automated daily backups |
| **Migrations Testing** | Test on staging first |

---

> 📚 **Next:** Learn authentication → [AUTH_GUIDE.md](./04_AUTH_GUIDE.md)

