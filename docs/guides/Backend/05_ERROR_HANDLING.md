# 🚨 Backend Error Handling Guide

> **Goal:** Implement consistent, informative, and secure error handling across the API.

---

## 1. Error Code System

### Code Format
```text
XXX0000
│││└──┴── 4-digit number
└┴┴────── 3-letter category prefix
```

### Categories
| Prefix | Category | Code Range |
|--------|----------|------------|
| `GEN` | General | GEN1001-1999 |
| `VAL` | Validation | VAL1001-1999 |
| `AUT` | Authentication | AUT1001-1999 |
| `AUZ` | Authorization | AUZ1001-1999 |
| `DAT` | Database | DAT1001-1999 |
| `SRV` | Server | SRV1001-1999 |
| `EXT` | External Service | EXT1001-1999 |

---

## 2. Error Class

```typescript
// lib/errors/AppError.ts

export type ErrorCategory = 
  | 'VALIDATION'
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'DATABASE'
  | 'SERVER'
  | 'EXTERNAL'
  | 'NOT_FOUND'
  | 'CONFLICT';

/**
 * @description Custom application error class
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly category: ErrorCategory;
  public readonly isOperational: boolean;
  public readonly data?: Record<string, unknown>;

  constructor(options: {
    code: string;
    message: string;
    statusCode: number;
    category: ErrorCategory;
    isOperational?: boolean;
    data?: Record<string, unknown>;
  }) {
    super(options.message);
    
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.category = options.category;
    this.isOperational = options.isOperational ?? true;
    this.data = options.data;

    // Maintains proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Serialize for logging
   */
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      category: this.category,
      data: this.data,
      stack: this.stack,
    };
  }

  /**
   * Safe serialization for client response (no stack trace)
   */
  toClientJSON() {
    return {
      code: this.code,
      message: this.message,
      data: this.data,
    };
  }
}
```

---

## 3. Error Factory

```typescript
// lib/errors/ErrorFactory.ts
import { AppError, ErrorCategory } from './AppError';

interface ErrorDefinition {
  code: string;
  message: string;
  statusCode: number;
  category: ErrorCategory;
}

/**
 * @description Creates standardized application errors
 */
export class ErrorFactory {
  private static create(
    definition: ErrorDefinition,
    data?: Record<string, unknown>
  ): AppError {
    return new AppError({ ...definition, data });
  }

  // Validation Errors
  static validation = {
    invalidInput: (field?: string) =>
      this.create({
        code: 'VAL1001',
        message: field ? `Invalid ${field}` : 'Invalid input',
        statusCode: 400,
        category: 'VALIDATION',
      }),

    required: (field: string) =>
      this.create({
        code: 'VAL1002',
        message: `${field} is required`,
        statusCode: 400,
        category: 'VALIDATION',
      }),

    invalidEmail: () =>
      this.create({
        code: 'VAL1003',
        message: 'Invalid email format',
        statusCode: 400,
        category: 'VALIDATION',
      }),
  };

  // Authentication Errors
  static auth = {
    invalidCredentials: () =>
      this.create({
        code: 'AUT1001',
        message: 'Invalid email or password',
        statusCode: 401,
        category: 'AUTHENTICATION',
      }),

    tokenExpired: () =>
      this.create({
        code: 'AUT1002',
        message: 'Token has expired',
        statusCode: 401,
        category: 'AUTHENTICATION',
      }),

    invalidToken: () =>
      this.create({
        code: 'AUT1003',
        message: 'Invalid authentication token',
        statusCode: 401,
        category: 'AUTHENTICATION',
      }),

    noToken: () =>
      this.create({
        code: 'AUT1004',
        message: 'Authentication required',
        statusCode: 401,
        category: 'AUTHENTICATION',
      }),
  };

  // Authorization Errors
  static authorization = {
    forbidden: () =>
      this.create({
        code: 'AUZ1001',
        message: 'You do not have permission to perform this action',
        statusCode: 403,
        category: 'AUTHORIZATION',
      }),

    insufficientRole: (requiredRole: string) =>
      this.create({
        code: 'AUZ1002',
        message: `${requiredRole} role required`,
        statusCode: 403,
        category: 'AUTHORIZATION',
      }),
  };

  // Resource Errors
  static resource = {
    notFound: (resource: string) =>
      this.create({
        code: 'GEN1001',
        message: `${resource} not found`,
        statusCode: 404,
        category: 'NOT_FOUND',
      }),

    alreadyExists: (resource: string) =>
      this.create({
        code: 'GEN1002',
        message: `${resource} already exists`,
        statusCode: 409,
        category: 'CONFLICT',
      }),
  };

  // Database Errors
  static database = {
    queryFailed: () =>
      this.create({
        code: 'DAT1001',
        message: 'Database query failed',
        statusCode: 500,
        category: 'DATABASE',
      }),

    connectionFailed: () =>
      this.create({
        code: 'DAT1002',
        message: 'Database connection failed',
        statusCode: 503,
        category: 'DATABASE',
      }),
  };

  // Server Errors
  static server = {
    internal: () =>
      this.create({
        code: 'SRV1001',
        message: 'Internal server error',
        statusCode: 500,
        category: 'SERVER',
      }),

    serviceUnavailable: () =>
      this.create({
        code: 'SRV1002',
        message: 'Service temporarily unavailable',
        statusCode: 503,
        category: 'SERVER',
      }),
  };
}

// Export convenience alias
export const Errors = ErrorFactory;
```

---

## 4. Global Error Handler

```typescript
// api/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '@/lib/errors/AppError';
import { Errors } from '@/lib/errors/ErrorFactory';
import { logger } from '@/lib/logger';

/**
 * Global error handling middleware
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Generate request ID for tracing
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();

  // Handle known error types
  let appError: AppError;

  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof ZodError) {
    // Validation errors from Zod
    appError = new AppError({
      code: 'VAL1000',
      message: 'Validation failed',
      statusCode: 422,
      category: 'VALIDATION',
      data: {
        errors: error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      },
    });
  } else {
    // Unknown errors
    appError = Errors.server.internal();
    appError.stack = error.stack;
  }

  // Log error
  logger.error({
    requestId,
    error: appError.toJSON(),
    path: req.path,
    method: req.method,
    userId: req.user?.userId,
  });

  // Send response
  res.status(appError.statusCode).json({
    success: false,
    error: appError.toClientJSON(),
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: {
      code: 'GEN1000',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}
```

---

## 5. Error Handling in Services

```typescript
// services/userService.ts
import { Errors } from '@/lib/errors';
import { userRepository } from '@/repositories/userRepository';

export async function getUserById(id: string) {
  const user = await userRepository.findById(id);
  
  if (!user) {
    throw Errors.resource.notFound('User');
  }
  
  return user;
}

export async function createUser(data: CreateUserInput) {
  // Check for existing user
  const existingUser = await userRepository.findByEmail(data.email);
  if (existingUser) {
    throw Errors.resource.alreadyExists('User with this email');
  }
  
  try {
    return await userRepository.create(data);
  } catch (error) {
    // Log and rethrow as database error
    logger.error('Failed to create user', { error, data });
    throw Errors.database.queryFailed();
  }
}
```

---

## 6. Error Handling in Controllers

```typescript
// api/v1/users/users.controller.ts
export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await userService.getUserById(req.params.id);
    
    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    // Pass to global error handler
    next(error);
  }
}

// With async wrapper utility
import { asyncHandler } from '@/lib/utils/asyncHandler';

export const getUserV2 = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.getUserById(req.params.id);
  res.json({ success: true, data: user });
});
```

### Async Handler Utility
```typescript
// lib/utils/asyncHandler.ts
import { Request, Response, NextFunction } from 'express';

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

/**
 * Wraps async route handlers to catch errors
 */
export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

---

## 7. Logging Setup

```typescript
// lib/logger/index.ts
import pino from 'pino';
import { config } from '@/config';

export const logger = pino({
  level: config.app.logLevel || 'info',
  transport:
    config.app.env === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
          },
        }
      : undefined,
  base: {
    service: 'api',
    env: config.app.env,
  },
});

// Request logging middleware
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  
  res.on('finish', () => {
    logger.info({
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

## 8. Error Response Examples

### Validation Error
```json
{
  "success": false,
  "error": {
    "code": "VAL1000",
    "message": "Validation failed",
    "data": {
      "errors": [
        { "field": "email", "message": "Invalid email format" },
        { "field": "password", "message": "Must be at least 8 characters" }
      ]
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### Authentication Error
```json
{
  "success": false,
  "error": {
    "code": "AUT1001",
    "message": "Invalid email or password"
  },
  "meta": {
    "requestId": "req_def456",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### Not Found Error
```json
{
  "success": false,
  "error": {
    "code": "GEN1001",
    "message": "User not found"
  },
  "meta": {
    "requestId": "req_ghi789",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

---

## 9. Error Handling Best Practices

| ✅ Do | ❌ Don't |
|-------|----------|
| Use typed error codes | Use random strings |
| Log errors with context | Log just the message |
| Return safe messages to client | Expose stack traces |
| Handle all error types | Let errors crash the app |
| Use consistent response format | Return different formats |
| Include request IDs | Miss traceability |

---

> 📚 **Next:** Learn testing strategies → [TESTING_GUIDE.md](./06_TESTING_GUIDE.md)

