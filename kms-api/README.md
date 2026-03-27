# KMS API

> Knowledge Management System API - NestJS Microservice Boilerplate

A production-ready NestJS API boilerplate with OpenTelemetry observability, comprehensive authentication, and enterprise-grade error handling.

## Features

- **NestJS 10** - Progressive Node.js framework
- **TypeScript** - Strict type safety
- **Prisma ORM** - Type-safe database access with PostgreSQL
- **Authentication**
  - JWT (Access + Refresh tokens)
  - API Key authentication
  - Passport strategies
- **OpenTelemetry Integration**
  - Distributed tracing
  - Metrics collection
  - Automatic instrumentation
  - Decorators for custom spans
- **Error Handling**
  - Structured error codes (GEN, VAL, AUT, AUZ, DAT, SRV, EXT)
  - Prisma error mapping
  - Global exception filters
- **Logging**
  - Pino structured logging
  - Trace context injection
  - Environment-based log levels
- **Validation**
  - Zod schemas for config and DTOs
  - Request/response validation
  - Custom validation pipes
- **Security**
  - Helmet security headers
  - CORS configuration
  - Rate limiting (Throttler)
  - API versioning
- **Docker Support**
  - Multi-stage Dockerfile
  - Development with hot reload
  - Testing environment
  - Production-optimized builds
- **Testing**
  - Jest for unit/integration tests
  - E2E test infrastructure
  - Test database helpers
  - Coverage thresholds (80% lines, 70% branches)
- **Documentation**
  - Swagger/OpenAPI auto-generation
  - JSDoc comments
  - API endpoint decorators
- **Developer Experience**
  - ESLint + Prettier
  - Husky git hooks
  - Conventional commits
  - Path aliases

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16 (or use Docker)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd kms-api

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev
```

### Development

```bash
# Start with Docker (recommended)
docker-compose up -d

# Or run locally
npm run start:dev

# View logs
docker-compose logs -f api
```

The API will be available at:
- API: http://localhost:8000/api/v1
- Swagger: http://localhost:8000/docs
- Health: http://localhost:8000/api/v1/health

### Testing

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov

# Run all tests with Docker
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
```

### Building

```bash
# Build for production
npm run build

# Build Docker image
docker build -t kms-api:latest .

# Production deployment
docker-compose -f docker-compose.prod.yml up -d
```

## Project Structure

```
kms-api/
├── prisma/                 # Database schema and migrations
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── bootstrap/          # Application bootstrap utilities
│   ├── config/             # Configuration with Zod validation
│   │   ├── schemas/        # Config schemas
│   │   └── constants/      # App constants
│   ├── database/           # Database layer
│   │   ├── prisma/         # Prisma service
│   │   └── repositories/   # Repository pattern
│   ├── errors/             # Error handling
│   │   ├── error-codes/    # Structured error codes
│   │   ├── types/          # AppError, ErrorFactory
│   │   └── handlers/       # Error handlers (Prisma, etc.)
│   ├── logger/             # Pino logger
│   ├── telemetry/          # OpenTelemetry
│   │   ├── sdk/            # OTel SDK initialization
│   │   └── decorators/     # Trace & metric decorators
│   ├── common/             # Common utilities
│   │   ├── decorators/     # Custom decorators
│   │   ├── filters/        # Exception filters
│   │   ├── guards/         # Authorization guards
│   │   ├── interceptors/   # Request/response interceptors
│   │   ├── middleware/     # Custom middleware
│   │   ├── pipes/          # Validation pipes
│   │   └── dto/            # Common DTOs
│   ├── modules/            # Feature modules
│   │   ├── auth/           # Authentication
│   │   └── health/         # Health checks
│   ├── app.module.ts       # Root module
│   └── main.ts             # Application entry point
├── test/                   # Test files
│   ├── unit/
│   ├── integration/
│   └── helpers/
├── docker/                 # Docker configurations
├── docs/                   # Documentation
├── Dockerfile              # Multi-stage Docker build
├── docker-compose.yml      # Development environment
├── docker-compose.test.yml # Testing environment
├── docker-compose.prod.yml # Production environment
└── package.json
```

## Environment Variables

See `.env.example` for all available configuration options.

Key variables:

```bash
# Application
NODE_ENV=development
APP_PORT=8000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://...

# JWT
JWT_ACCESS_SECRET=<min-32-chars>
JWT_REFRESH_SECRET=<min-32-chars>

# OpenTelemetry
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

## API Endpoints

### Authentication

- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login with credentials
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/change-password` - Change password

### Health

- `GET /api/v1/health` - Comprehensive health check
- `GET /api/v1/health/ready` - Readiness probe
- `GET /api/v1/health/live` - Liveness probe

## Authentication

The API supports two authentication methods:

### JWT Bearer Token

```bash
# Login to get tokens
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Password123!"}'

# Use access token
curl http://localhost:8000/api/v1/protected \
  -H "Authorization: Bearer <access-token>"
```

### API Key

```bash
# Use API key in header
curl http://localhost:8000/api/v1/data \
  -H "x-api-key: kms_your_api_key_here"
```

## Error Handling

All errors follow a structured format with error codes:

```json
{
  "success": false,
  "error": {
    "code": "VAL0001",
    "message": "Invalid email address",
    "details": [
      {"field": "email", "message": "Invalid format"}
    ],
    "requestId": "req-123",
    "traceId": "trace-456"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

Error code prefixes:
- `GEN` - General errors
- `VAL` - Validation errors
- `AUT` - Authentication errors
- `AUZ` - Authorization errors
- `DAT` - Data/Database errors
- `SRV` - Server/Internal errors
- `EXT` - External service errors

## OpenTelemetry

### Using Decorators

```typescript
import { Trace, RecordDuration, IncrementCounter } from '@telemetry';

@Injectable()
export class MyService {
  @Trace({ name: 'my-service.process' })
  @RecordDuration()
  @IncrementCounter({ name: 'operations.count' })
  async processData(data: any) {
    // Automatically traced, timed, and counted
    return result;
  }
}
```

### Manual Instrumentation

```typescript
import { withSpan, addSpanAttribute } from '@telemetry';

await withSpan('custom-operation', async (span) => {
  span.setAttribute('user.id', userId);
  // Do work
});
```

## Scripts

```bash
# Development
npm run start:dev          # Start with hot reload
npm run build              # Build for production
npm run start:prod         # Start production build

# Database
npm run prisma:generate    # Generate Prisma client
npm run prisma:migrate     # Run migrations
npm run prisma:studio      # Open Prisma Studio

# Testing
npm run test               # Unit tests
npm run test:watch         # Watch mode
npm run test:cov           # With coverage
npm run test:e2e           # E2E tests

# Code quality
npm run lint               # Run ESLint
npm run format             # Format with Prettier
npm run type-check         # TypeScript check

# Husky
npm run prepare            # Setup git hooks
```

## Docker Commands

```bash
# Development
docker-compose up -d              # Start all services
docker-compose logs -f api        # View logs
docker-compose restart api        # Restart API
docker-compose down               # Stop all services

# Testing
docker-compose -f docker-compose.test.yml up --abort-on-container-exit

# Production
docker-compose -f docker-compose.prod.yml up -d
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests: `npm test`
4. Ensure lint passes: `npm run lint`
5. Commit with conventional commits
6. Submit a pull request

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
