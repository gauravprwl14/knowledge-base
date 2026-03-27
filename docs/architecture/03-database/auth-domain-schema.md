# Auth Domain Schema

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The Auth domain manages user authentication, authorization, and API access. These tables are shared across all services and form the foundation for multi-tenant data isolation.

---

## Domain Boundaries

| Aspect | Value |
|--------|-------|
| **Prefix** | `auth_` |
| **Owner Service** | kms-api |
| **Access** | All services (read-only for most) |
| **Future Database** | auth-db (standalone) |

---

## Tables

### auth_users

Core user account table supporting both email/password and OAuth authentication.

```sql
CREATE TABLE auth_users (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Email authentication
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),         -- NULL for OAuth-only users

    -- Profile
    name VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500),

    -- OAuth providers
    google_id VARCHAR(255) UNIQUE,      -- Google OAuth subject ID
    google_email VARCHAR(255),          -- May differ from primary email

    -- Account status
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMP WITH TIME ZONE,

    -- Preferences
    preferences JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT chk_auth_method CHECK (
        password_hash IS NOT NULL OR google_id IS NOT NULL
    )
);

-- Indexes
CREATE INDEX idx_auth_users_email ON auth_users(email);
CREATE INDEX idx_auth_users_google_id ON auth_users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX idx_auth_users_created_at ON auth_users(created_at);

-- Full-text search on name
CREATE INDEX idx_auth_users_name_search ON auth_users USING GIN (to_tsvector('english', name));

-- Trigger for updated_at
CREATE TRIGGER trigger_auth_users_updated_at
    BEFORE UPDATE ON auth_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

#### Column Details

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | NO | Primary key |
| `email` | VARCHAR(255) | NO | Primary email (unique) |
| `password_hash` | VARCHAR(255) | YES | bcrypt hash (NULL for OAuth) |
| `name` | VARCHAR(255) | NO | Display name |
| `avatar_url` | VARCHAR(500) | YES | Profile picture URL |
| `google_id` | VARCHAR(255) | YES | Google OAuth ID (unique) |
| `google_email` | VARCHAR(255) | YES | Google email |
| `is_active` | BOOLEAN | NO | Account enabled |
| `is_verified` | BOOLEAN | NO | Email verified |
| `verified_at` | TIMESTAMP | YES | Verification timestamp |
| `preferences` | JSONB | YES | User preferences |
| `created_at` | TIMESTAMP | NO | Registration time |
| `updated_at` | TIMESTAMP | NO | Last modification |
| `last_login_at` | TIMESTAMP | YES | Last login time |

#### Preferences JSON Schema

```json
{
  "theme": "dark",
  "language": "en",
  "timezone": "America/New_York",
  "notifications": {
    "email": true,
    "scanComplete": true,
    "duplicatesFound": true
  },
  "defaultSearchMode": "hybrid"
}
```

---

### auth_api_keys

API keys for programmatic access. Keys are hashed for security.

```sql
CREATE TABLE auth_api_keys (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Ownership
    user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,

    -- Key data (hashed)
    key_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 hash
    key_prefix VARCHAR(8) NOT NULL,         -- First 8 chars for identification

    -- Metadata
    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Permissions
    scopes JSONB NOT NULL DEFAULT '["read", "write"]',

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,    -- NULL = never expires
    revoked_at TIMESTAMP WITH TIME ZONE,

    -- Usage tracking
    last_used_at TIMESTAMP WITH TIME ZONE,
    use_count INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_api_key_scopes CHECK (jsonb_typeof(scopes) = 'array')
);

-- Indexes
CREATE INDEX idx_auth_api_keys_user_id ON auth_api_keys(user_id);
CREATE INDEX idx_auth_api_keys_key_hash ON auth_api_keys(key_hash);
CREATE INDEX idx_auth_api_keys_active ON auth_api_keys(user_id) WHERE is_active = true;
```

#### Column Details

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | NO | Primary key |
| `user_id` | UUID | NO | Owner user |
| `key_hash` | VARCHAR(64) | NO | SHA-256 hash of key |
| `key_prefix` | VARCHAR(8) | NO | Key prefix for display |
| `name` | VARCHAR(100) | NO | Human-readable name |
| `description` | TEXT | YES | Optional description |
| `scopes` | JSONB | NO | Permission scopes |
| `is_active` | BOOLEAN | NO | Key enabled |
| `expires_at` | TIMESTAMP | YES | Expiration time |
| `revoked_at` | TIMESTAMP | YES | Revocation time |
| `last_used_at` | TIMESTAMP | YES | Last usage |
| `use_count` | INTEGER | NO | Total uses |
| `created_at` | TIMESTAMP | NO | Creation time |

#### Available Scopes

```json
[
  "read",           // Read files, search, view stats
  "write",          // Modify files, trigger scans
  "delete",         // Delete files, cleanup
  "admin"           // Full access including settings
]
```

---

### auth_teams

Team/organization records for future multi-tenant support.

```sql
CREATE TABLE auth_teams (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Team info
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,

    -- Ownership
    owner_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,

    -- Settings
    settings JSONB DEFAULT '{}',

    -- Limits
    max_members INTEGER NOT NULL DEFAULT 10,
    max_storage_bytes BIGINT NOT NULL DEFAULT 10737418240,  -- 10GB

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_auth_teams_owner_id ON auth_teams(owner_id);
CREATE UNIQUE INDEX idx_auth_teams_slug ON auth_teams(slug);
```

#### Column Details

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | NO | Primary key |
| `name` | VARCHAR(255) | NO | Team name |
| `slug` | VARCHAR(100) | NO | URL-safe identifier |
| `description` | TEXT | YES | Team description |
| `owner_id` | UUID | NO | Team owner |
| `settings` | JSONB | YES | Team settings |
| `max_members` | INTEGER | NO | Member limit |
| `max_storage_bytes` | BIGINT | NO | Storage quota |
| `is_active` | BOOLEAN | NO | Team enabled |
| `created_at` | TIMESTAMP | NO | Creation time |
| `updated_at` | TIMESTAMP | NO | Modification time |

---

### auth_team_members

Team membership with role-based access.

```sql
CREATE TABLE auth_team_members (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relationships
    team_id UUID NOT NULL REFERENCES auth_teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,

    -- Role
    role VARCHAR(50) NOT NULL DEFAULT 'member',

    -- Status
    invited_by UUID REFERENCES auth_users(id) ON DELETE SET NULL,
    invited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uq_team_member UNIQUE (team_id, user_id),
    CONSTRAINT chk_role CHECK (role IN ('owner', 'admin', 'member', 'viewer'))
);

-- Indexes
CREATE INDEX idx_auth_team_members_team_id ON auth_team_members(team_id);
CREATE INDEX idx_auth_team_members_user_id ON auth_team_members(user_id);
```

#### Column Details

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | NO | Primary key |
| `team_id` | UUID | NO | Team reference |
| `user_id` | UUID | NO | User reference |
| `role` | VARCHAR(50) | NO | Member role |
| `invited_by` | UUID | YES | Inviting user |
| `invited_at` | TIMESTAMP | NO | Invitation time |
| `accepted_at` | TIMESTAMP | YES | Acceptance time |
| `created_at` | TIMESTAMP | NO | Creation time |

#### Role Hierarchy

| Role | Permissions |
|------|-------------|
| `owner` | Full access, can delete team |
| `admin` | Manage members, settings |
| `member` | Read/write files |
| `viewer` | Read-only access |

---

## Common Functions

### Password Hashing (Application Layer)

```python
# Python example using bcrypt
import bcrypt

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), hash.encode())
```

### API Key Generation

```python
import secrets
import hashlib

def generate_api_key():
    # Generate random key
    key = secrets.token_urlsafe(32)

    # Hash for storage
    key_hash = hashlib.sha256(key.encode()).hexdigest()

    # Prefix for display
    key_prefix = key[:8]

    return key, key_hash, key_prefix
```

---

## Queries

### Find User by Email

```sql
SELECT id, email, name, password_hash, is_active
FROM auth_users
WHERE email = $1 AND is_active = true;
```

### Validate API Key

```sql
SELECT ak.id, ak.user_id, ak.scopes, ak.expires_at, u.is_active AS user_active
FROM auth_api_keys ak
JOIN auth_users u ON ak.user_id = u.id
WHERE ak.key_hash = $1
  AND ak.is_active = true
  AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
  AND u.is_active = true;
```

### Get User's Teams

```sql
SELECT t.id, t.name, t.slug, tm.role
FROM auth_teams t
JOIN auth_team_members tm ON t.id = tm.team_id
WHERE tm.user_id = $1 AND t.is_active = true
ORDER BY tm.role = 'owner' DESC, t.name;
```

---

## Migration Notes

When splitting to separate auth database:

1. **No foreign key changes needed** - Other tables reference auth by user_id UUID
2. **Maintain user_id consistency** - Use same UUID generation
3. **Add API gateway validation** - Validate tokens at gateway
4. **Cache user data** - Cache frequently accessed user info in Redis

