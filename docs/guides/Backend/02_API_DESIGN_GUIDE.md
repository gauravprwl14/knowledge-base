# 🔌 API Design Guide

> **Goal:** Design consistent, intuitive, and maintainable REST APIs.

---

## 1. RESTful Conventions

### HTTP Methods

| Method | Action | Example |
|--------|--------|---------|
| `GET` | Retrieve resource(s) | `GET /users` |
| `POST` | Create resource | `POST /users` |
| `PUT` | Full update | `PUT /users/:id` |
| `PATCH` | Partial update | `PATCH /users/:id` |
| `DELETE` | Remove resource | `DELETE /users/:id` |

### URL Structure

```text
✅ Good                          ❌ Bad
────────────────────────────────────────────────
GET /users                        GET /getUsers
GET /users/:id                    GET /user/:id
POST /users                       POST /createUser
GET /users/:id/orders             GET /getUserOrders/:id
DELETE /users/:id                 POST /deleteUser/:id
```

---

## 2. Response Format

### Success Response
```json
{
  "success": true,
  "data": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "meta": {
    "requestId": "req_abc123"
  }
}
```

### List Response (with Pagination)
```json
{
  "success": true,
  "data": [
    { "id": "user_1", "name": "Alice" },
    { "id": "user_2", "name": "Bob" }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VAL1001",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  },
  "meta": {
    "requestId": "req_abc123"
  }
}
```

---

## 3. HTTP Status Codes

### Success Codes
| Code | When to Use |
|------|-------------|
| `200 OK` | Successful GET, PUT, PATCH |
| `201 Created` | Successful POST (resource created) |
| `204 No Content` | Successful DELETE |

### Client Error Codes
| Code | When to Use |
|------|-------------|
| `400 Bad Request` | Invalid request body/params |
| `401 Unauthorized` | Missing/invalid authentication |
| `403 Forbidden` | Authenticated but not authorized |
| `404 Not Found` | Resource doesn't exist |
| `409 Conflict` | Resource conflict (duplicate) |
| `422 Unprocessable` | Validation failed |
| `429 Too Many Requests` | Rate limit exceeded |

### Server Error Codes
| Code | When to Use |
|------|-------------|
| `500 Internal Server Error` | Unexpected server error |
| `502 Bad Gateway` | Upstream service failure |
| `503 Service Unavailable` | Maintenance/overload |

---

## 4. Request Validation

### Zod Schema Definition
```typescript
// api/v1/users/users.schemas.ts
import { z } from 'zod';

/**
 * @description Schema for creating a new user
 */
export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(2, 'Name must be at least 2 characters'),
  }),
});

/**
 * @description Schema for updating user
 */
export const updateUserSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user ID'),
  }),
  body: z.object({
    name: z.string().min(2).optional(),
    avatar: z.string().url().optional(),
  }),
});

/**
 * @description Schema for listing users
 */
export const listUsersSchema = z.object({
  query: z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    search: z.string().optional(),
    sortBy: z.enum(['name', 'createdAt']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>['body'];
export type UpdateUserInput = z.infer<typeof updateUserSchema>['body'];
export type ListUsersQuery = z.infer<typeof listUsersSchema>['query'];
```

### Validation Middleware
```typescript
// api/middleware/validate.ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      
      req.body = parsed.body;
      req.query = parsed.query;
      req.params = parsed.params;
      
      next();
    } catch (error) {
      next(error);
    }
  };
}
```

---

## 5. Route Organization

```typescript
// api/v1/users/users.routes.ts
import { Router } from 'express';
import * as controller from './users.controller';
import * as schemas from './users.schemas';
import { validate } from '@/api/middleware/validate';
import { authenticate } from '@/api/middleware/authenticate';
import { authorize } from '@/api/middleware/authorize';

const router = Router();

/**
 * @route   GET /api/v1/users
 * @desc    List all users with pagination
 * @access  Private (Admin)
 */
router.get(
  '/',
  authenticate,
  authorize('admin'),
  validate(schemas.listUsersSchema),
  controller.listUsers
);

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get user by ID
 * @access  Private
 */
router.get(
  '/:id',
  authenticate,
  validate(schemas.getUserSchema),
  controller.getUser
);

/**
 * @route   POST /api/v1/users
 * @desc    Create new user
 * @access  Public
 */
router.post(
  '/',
  validate(schemas.createUserSchema),
  controller.createUser
);

/**
 * @route   PATCH /api/v1/users/:id
 * @desc    Update user
 * @access  Private (Owner)
 */
router.patch(
  '/:id',
  authenticate,
  authorize('owner', 'admin'),
  validate(schemas.updateUserSchema),
  controller.updateUser
);

/**
 * @route   DELETE /api/v1/users/:id
 * @desc    Delete user
 * @access  Private (Admin)
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  validate(schemas.deleteUserSchema),
  controller.deleteUser
);

export default router;
```

---

## 6. Controller Pattern

```typescript
// api/v1/users/users.controller.ts
import { Request, Response, NextFunction } from 'express';
import * as userService from '@/services/userService';
import { CreateUserInput, UpdateUserInput } from './users.schemas';

/**
 * @description Create a new user
 * @route POST /api/v1/users
 */
export async function createUser(
  req: Request<{}, {}, CreateUserInput>,
  res: Response,
  next: NextFunction
) {
  try {
    const user = await userService.createUser(req.body);
    
    res.status(201).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * @description List users with pagination
 * @route GET /api/v1/users
 */
export async function listUsers(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { page, limit, search, sortBy, order } = req.query;
    
    const result = await userService.listUsers({
      page: Number(page),
      limit: Number(limit),
      search: search as string,
      sortBy: sortBy as string,
      order: order as 'asc' | 'desc',
    });
    
    res.json({
      success: true,
      data: result.users,
      meta: {
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}
```

---

## 7. Filtering, Sorting, Pagination

### Query Parameters
```text
GET /api/v1/products?
  page=2&
  limit=20&
  search=laptop&
  category=electronics&
  minPrice=100&
  maxPrice=1000&
  sortBy=price&
  order=asc
```

### Implementation
```typescript
// services/productService.ts
interface ListProductsOptions {
  page: number;
  limit: number;
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy: string;
  order: 'asc' | 'desc';
}

export async function listProducts(options: ListProductsOptions) {
  const { page, limit, ...filters } = options;
  const skip = (page - 1) * limit;
  
  const where = buildWhereClause(filters);
  const orderBy = { [options.sortBy]: options.order };
  
  const [products, total] = await Promise.all([
    productRepository.findMany({ where, skip, take: limit, orderBy }),
    productRepository.count({ where }),
  ]);
  
  return {
    products,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
```

---

## 8. API Versioning

### URL Path Versioning (Recommended)
```text
/api/v1/users
/api/v2/users
```

### Implementation
```typescript
// api/index.ts
import v1Routes from './v1';
import v2Routes from './v2';

app.use('/api/v1', v1Routes);
app.use('/api/v2', v2Routes);
```

---

## 9. HATEOAS (Optional Enhancement)

```json
{
  "data": {
    "id": "user_123",
    "name": "John"
  },
  "links": {
    "self": "/api/v1/users/user_123",
    "orders": "/api/v1/users/user_123/orders",
    "profile": "/api/v1/users/user_123/profile"
  }
}
```

---

## 10. API Checklist

### Before Creating an Endpoint
- [ ] Define request/response schemas with Zod
- [ ] Determine HTTP method and URL structure
- [ ] Identify authentication requirements
- [ ] Define authorization rules
- [ ] Document the endpoint

### After Creating an Endpoint
- [ ] Write integration tests
- [ ] Add to API documentation
- [ ] Test error scenarios
- [ ] Verify rate limiting works

---

> 📚 **Next:** Learn database patterns → [DATABASE_GUIDE.md](./03_DATABASE_GUIDE.md)

