# Authentication Endpoints

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The KMS API supports two authentication methods:
1. **API Keys** - For server-to-server and CLI access
2. **JWT Tokens** - For web application users

---

## Authentication Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Authentication Flow                              │
└──────────────────────────────────────────────────────────────────────────┘

                    API Key Authentication
                    ─────────────────────────
┌──────────┐         X-API-Key header         ┌──────────┐
│  Client  │ ────────────────────────────────►│   API    │
└──────────┘                                  └──────────┘


                    JWT Authentication
                    ──────────────────
┌──────────┐    POST /auth/login    ┌──────────┐
│  Client  │ ──────────────────────►│   API    │
└──────────┘                        └────┬─────┘
      │                                  │
      │◄─────────────────────────────────┘
      │         JWT Token Response
      │
      │    GET /files (Bearer token)    ┌──────────┐
      └────────────────────────────────►│   API    │
                                        └──────────┘
```

---

## Endpoints

### Register User

Create a new user account.

```http
POST /api/v1/auth/register
Content-Type: application/json
```

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe"
}
```

**Response:** `201 Created`

```json
{
  "id": "usr_abc123",
  "email": "user@example.com",
  "name": "John Doe",
  "created_at": "2026-01-07T10:00:00Z"
}
```

**Errors:**

| Code | Reason |
|------|--------|
| 400 | Invalid email format or weak password |
| 409 | Email already registered |

---

### Login

Authenticate and receive JWT tokens.

```http
POST /api/v1/auth/login
Content-Type: application/json
```

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response:** `200 OK`

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": "usr_abc123",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

**Errors:**

| Code | Reason |
|------|--------|
| 401 | Invalid credentials |
| 423 | Account locked (too many attempts) |

---

### Refresh Token

Get a new access token using refresh token.

```http
POST /api/v1/auth/refresh
Content-Type: application/json
```

**Request Body:**

```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:** `200 OK`

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600
}
```

**Errors:**

| Code | Reason |
|------|--------|
| 401 | Invalid or expired refresh token |

---

### Logout

Invalidate current tokens.

```http
POST /api/v1/auth/logout
Authorization: Bearer <access_token>
```

**Response:** `204 No Content`

---

### Get Current User

Get authenticated user's profile.

```http
GET /api/v1/auth/me
Authorization: Bearer <access_token>
```

**Response:** `200 OK`

```json
{
  "id": "usr_abc123",
  "email": "user@example.com",
  "name": "John Doe",
  "created_at": "2026-01-07T10:00:00Z",
  "updated_at": "2026-01-07T10:00:00Z",
  "quota": {
    "storage_used_bytes": 1073741824,
    "storage_limit_bytes": 10737418240,
    "files_indexed": 1500,
    "files_limit": 10000
  }
}
```

---

## API Key Management

### List API Keys

Get all API keys for the current user.

```http
GET /api/v1/auth/api-keys
Authorization: Bearer <access_token>
```

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "key_abc123",
      "name": "CLI Access",
      "prefix": "kms_live_abc1",
      "created_at": "2026-01-07T10:00:00Z",
      "last_used_at": "2026-01-07T15:30:00Z",
      "expires_at": null,
      "is_active": true,
      "scopes": ["files:read", "files:write", "search:read"]
    }
  ],
  "pagination": {
    "total": 1
  }
}
```

---

### Create API Key

Create a new API key.

```http
POST /api/v1/auth/api-keys
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "Production Server",
  "scopes": ["files:read", "search:read"],
  "expires_at": "2027-01-07T00:00:00Z"
}
```

**Response:** `201 Created`

```json
{
  "id": "key_xyz789",
  "name": "Production Server",
  "key": "kms_live_abc123def456ghi789jkl012mno345",
  "prefix": "kms_live_abc1",
  "created_at": "2026-01-07T10:00:00Z",
  "expires_at": "2027-01-07T00:00:00Z",
  "scopes": ["files:read", "search:read"]
}
```

**Note:** The full `key` is only returned once. Store it securely.

---

### Revoke API Key

Revoke an API key.

```http
DELETE /api/v1/auth/api-keys/{key_id}
Authorization: Bearer <access_token>
```

**Response:** `204 No Content`

---

## Scopes

| Scope | Description |
|-------|-------------|
| `files:read` | Read file metadata and content |
| `files:write` | Upload, update, delete files |
| `search:read` | Execute search queries |
| `sources:read` | View connected sources |
| `sources:write` | Connect/disconnect sources |
| `duplicates:read` | View duplicate groups |
| `duplicates:write` | Manage duplicates |
| `admin` | Full access (admin only) |

---

## Schemas

### User

```typescript
interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;      // ISO 8601
  updated_at: string;      // ISO 8601
  quota?: UserQuota;
}

interface UserQuota {
  storage_used_bytes: number;
  storage_limit_bytes: number;
  files_indexed: number;
  files_limit: number;
}
```

### API Key

```typescript
interface APIKey {
  id: string;
  name: string;
  key?: string;            // Only on creation
  prefix: string;          // First 12 chars for identification
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  scopes: string[];
}
```

### Token Response

```typescript
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;      // Seconds until expiration
  user: User;
}
```

---

## Security

### Password Requirements

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

### Token Expiration

| Token | Expiration |
|-------|------------|
| Access Token | 1 hour |
| Refresh Token | 7 days |
| API Key | Configurable (or never) |

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| POST /auth/login | 5/minute per IP |
| POST /auth/register | 3/minute per IP |
| POST /auth/refresh | 30/minute per user |

