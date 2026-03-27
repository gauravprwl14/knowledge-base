# 🔐 Authentication & Authorization Guide

> **Goal:** Implement secure authentication and role-based access control.

---

## 1. Authentication vs Authorization

| Concept | Question | Example |
|---------|----------|---------|
| **Authentication** | "Who are you?" | Login with email/password |
| **Authorization** | "What can you do?" | Can user delete this post? |

---

## 2. JWT-Based Authentication

### Token Structure
```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.  ← Header
eyJ1c2VySWQiOiIxMjMiLCJyb2xlIjoiYWRtaW4ifQ.  ← Payload
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c  ← Signature
```

### Token Utilities
```typescript
// lib/utils/jwt.ts
import jwt from 'jsonwebtoken';
import { config } from '@/config';

interface TokenPayload {
  userId: string;
  role: string;
}

/**
 * Generate access token
 * @param payload - User data to encode
 * @returns Signed JWT token
 */
export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn, // '15m'
  });
}

/**
 * Generate refresh token
 * @param payload - User data to encode
 * @returns Signed refresh token
 */
export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn, // '7d'
  });
}

/**
 * Verify access token
 * @param token - JWT token
 * @returns Decoded payload
 * @throws Error if token is invalid
 */
export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwt.accessSecret) as TokenPayload;
}

/**
 * Verify refresh token
 * @param token - Refresh token
 * @returns Decoded payload
 * @throws Error if token is invalid
 */
export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwt.refreshSecret) as TokenPayload;
}
```

### Password Hashing
```typescript
// lib/utils/hash.ts
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/**
 * Hash password
 * @param password - Plain text password
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare password with hash
 * @param password - Plain text password
 * @param hash - Stored hash
 * @returns True if match
 */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

---

## 3. Authentication Service

```typescript
// services/authService.ts
import { userRepository } from '@/repositories/userRepository';
import { hashPassword, comparePassword } from '@/lib/utils/hash';
import { generateAccessToken, generateRefreshToken } from '@/lib/utils/jwt';
import { Errors } from '@/lib/errors';

interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Register new user
 */
export async function register(data: RegisterInput): Promise<AuthTokens> {
  // Check if user exists
  const existingUser = await userRepository.findByEmail(data.email);
  if (existingUser) {
    throw Errors.auth.emailAlreadyExists();
  }

  // Hash password
  const hashedPassword = await hashPassword(data.password);

  // Create user
  const user = await userRepository.create({
    ...data,
    password: hashedPassword,
  });

  // Generate tokens
  const payload = { userId: user.id, role: user.role };
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
}

/**
 * Login user
 */
export async function login(data: LoginInput): Promise<AuthTokens> {
  // Find user
  const user = await userRepository.findByEmail(data.email);
  if (!user) {
    throw Errors.auth.invalidCredentials();
  }

  // Verify password
  const isValid = await comparePassword(data.password, user.password);
  if (!isValid) {
    throw Errors.auth.invalidCredentials();
  }

  // Generate tokens
  const payload = { userId: user.id, role: user.role };
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
}

/**
 * Refresh access token
 */
export async function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  try {
    const payload = verifyRefreshToken(refreshToken);
    
    // Verify user still exists and is active
    const user = await userRepository.findById(payload.userId);
    if (!user) {
      throw Errors.auth.userNotFound();
    }

    const newPayload = { userId: user.id, role: user.role };
    return {
      accessToken: generateAccessToken(newPayload),
      refreshToken: generateRefreshToken(newPayload),
    };
  } catch (error) {
    throw Errors.auth.invalidToken();
  }
}
```

---

## 4. Authentication Middleware

```typescript
// api/middleware/authenticate.ts
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '@/lib/utils/jwt';
import { Errors } from '@/lib/errors';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: string;
      };
    }
  }
}

/**
 * Verify JWT token from Authorization header
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      throw Errors.auth.noToken();
    }

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);
    
    req.user = payload;
    next();
  } catch (error) {
    next(Errors.auth.invalidToken());
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
export function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      req.user = verifyAccessToken(token);
    } catch {
      // Token invalid, but continue without user
    }
  }
  
  next();
}
```

---

## 5. Authorization Middleware

```typescript
// api/middleware/authorize.ts
import { Request, Response, NextFunction } from 'express';
import { Errors } from '@/lib/errors';

type Role = 'USER' | 'ADMIN' | 'MODERATOR';

/**
 * Role-based access control
 * @param allowedRoles - Roles that can access the route
 */
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(Errors.auth.unauthorized());
    }

    if (!allowedRoles.includes(req.user.role as Role)) {
      return next(Errors.auth.forbidden());
    }

    next();
  };
}

/**
 * Check if user owns the resource
 * @param getResourceOwnerId - Function to get owner ID from request
 */
export function authorizeOwner(
  getResourceOwnerId: (req: Request) => Promise<string | null>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(Errors.auth.unauthorized());
    }

    // Admins can access any resource
    if (req.user.role === 'ADMIN') {
      return next();
    }

    const ownerId = await getResourceOwnerId(req);
    
    if (!ownerId || ownerId !== req.user.userId) {
      return next(Errors.auth.forbidden());
    }

    next();
  };
}
```

### Usage
```typescript
// Only admins
router.delete('/users/:id', authenticate, authorize('ADMIN'), deleteUser);

// Admins and moderators
router.patch('/posts/:id', authenticate, authorize('ADMIN', 'MODERATOR'), updatePost);

// Owner only
router.patch(
  '/profiles/:id',
  authenticate,
  authorizeOwner(async (req) => {
    const profile = await profileRepository.findById(req.params.id);
    return profile?.userId ?? null;
  }),
  updateProfile
);
```

---

## 6. Auth Routes

```typescript
// api/v1/auth/auth.routes.ts
import { Router } from 'express';
import * as controller from './auth.controller';
import * as schemas from './auth.schemas';
import { validate } from '@/api/middleware/validate';
import { authenticate } from '@/api/middleware/authenticate';

const router = Router();

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register new user
 * @access  Public
 */
router.post(
  '/register',
  validate(schemas.registerSchema),
  controller.register
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post(
  '/login',
  validate(schemas.loginSchema),
  controller.login
);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post(
  '/refresh',
  validate(schemas.refreshSchema),
  controller.refreshToken
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user (invalidate refresh token)
 * @access  Private
 */
router.post('/logout', authenticate, controller.logout);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current user
 * @access  Private
 */
router.get('/me', authenticate, controller.getCurrentUser);

export default router;
```

---

## 7. Secure Practices

### Token Storage (Frontend)
| Storage | Security | Use Case |
|---------|----------|----------|
| **httpOnly Cookie** | Most secure | Web apps |
| **Secure Storage** | Secure | Mobile apps |
| **Memory** | Secure, lost on refresh | SPAs |
| ~~LocalStorage~~ | Vulnerable to XSS | ❌ Avoid |

### Cookie Configuration
```typescript
// Set tokens as httpOnly cookies
res.cookie('accessToken', accessToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 15 * 60 * 1000, // 15 minutes
});

res.cookie('refreshToken', refreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/v1/auth/refresh', // Only sent to refresh endpoint
});
```

---

## 8. Security Checklist

- [ ] Hash passwords with bcrypt (12+ rounds)
- [ ] Use httpOnly cookies for tokens
- [ ] Set secure flag in production
- [ ] Implement token refresh mechanism
- [ ] Add rate limiting on auth routes
- [ ] Log authentication attempts
- [ ] Implement account lockout after failed attempts
- [ ] Use HTTPS in production
- [ ] Validate token on each request
- [ ] Implement proper CORS

---

> 📚 **Next:** Learn error handling → [ERROR_HANDLING.md](./05_ERROR_HANDLING.md)

