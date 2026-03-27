# Design Principles

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Core Principles

### 1. Domain-Driven Design

The system is organized around business domains with clear boundaries:

```
┌─────────────────────────────────────────────────────────────────┐
│                        KMS SYSTEM                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │ Authentication │  │  Knowledge     │  │ Transcription  │    │
│  │    Domain      │  │   Domain       │  │    Domain      │    │
│  │   (auth_*)     │  │   (kms_*)      │  │   (voice_*)    │    │
│  │                │  │                │  │                │    │
│  │  • Users       │  │  • Sources     │  │  • Jobs        │    │
│  │  • API Keys    │  │  • Files       │  │  • Transcripts │    │
│  │  • Teams       │  │  • Duplicates  │  │  • Translations│    │
│  │  • Permissions │  │  • Embeddings  │  │                │    │
│  │                │  │  • Junk        │  │                │    │
│  └────────────────┘  └────────────────┘  └────────────────┘    │
│          ▲                   │                   │              │
│          │                   │                   │              │
│          └───────────────────┴───────────────────┘              │
│                    (can reference auth)                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Rules**:
- Each domain has its own table prefix
- Cross-domain foreign keys only allowed to `auth_*`
- Integration between domains via API calls or integration tables

---

### 2. Event-Driven Architecture

Services communicate primarily through message queues:

```
┌─────────────┐     Event      ┌─────────────┐
│  Producer   │ ──────────────►│    Queue    │
│  Service    │   (async)      │  (RabbitMQ) │
└─────────────┘                └──────┬──────┘
                                      │
                               ┌──────┴──────┐
                               │             │
                               ▼             ▼
                        ┌───────────┐ ┌───────────┐
                        │ Consumer 1│ │ Consumer 2│
                        └───────────┘ └───────────┘
```

**Benefits**:
- Loose coupling between services
- Natural load balancing
- Retry handling with DLX
- Scalable worker pools

**Message Contract**:
```json
{
  "event_type": "FILE_INDEXED",
  "timestamp": "2026-01-07T10:00:00Z",
  "correlation_id": "uuid",
  "payload": {
    "file_id": "uuid",
    "source_id": "uuid",
    "user_id": "uuid"
  }
}
```

---

### 3. Single Responsibility

Each service has one primary responsibility:

| Service | Single Responsibility |
|---------|----------------------|
| kms-api | User-facing API operations |
| search-api | Search query processing |
| scan-worker | File discovery from sources |
| embedding-worker | Content extraction and vectorization |
| dedup-worker | Duplicate detection |
| junk-detector | Junk file identification |

**Anti-patterns to avoid**:
- ❌ scan-worker doing embedding generation
- ❌ kms-api doing direct search queries
- ❌ embedding-worker writing to Neo4j directly

---

### 4. Idempotency

All operations should be safely retryable:

```
IDEMPOTENT OPERATION:
┌─────────────────────────────────────────┐
│                                         │
│  Request 1: Create file (id: abc123)    │───► File created
│                                         │
│  Request 2: Create file (id: abc123)    │───► No change (upsert)
│                                         │
│  Result: Same state regardless of       │
│          number of identical requests   │
│                                         │
└─────────────────────────────────────────┘
```

**Implementation patterns**:
- Use unique constraints (source_id + source_file_id)
- Upsert operations instead of insert
- Idempotency keys for critical operations
- Check-then-act with optimistic locking

---

### 5. Fail Fast, Recover Gracefully

**Fail Fast** - Validate early:
```python
# Good: Fail fast
def process_file(file_id: str):
    if not file_id:
        raise ValueError("file_id required")

    file = db.get(file_id)
    if not file:
        raise NotFoundError(f"File {file_id} not found")

    # Process only if all validations pass
    ...
```

**Recover Gracefully** - Handle failures:
```python
# Good: Graceful recovery
async def scan_files(source_id: str):
    files = await fetch_files(source_id)

    success_count = 0
    failed_files = []

    for file in files:
        try:
            await process_file(file)
            success_count += 1
        except Exception as e:
            failed_files.append({
                "file": file,
                "error": str(e)
            })
            # Continue with next file

    return {
        "success_count": success_count,
        "failed_files": failed_files
    }
```

---

### 6. Defense in Depth

Security at multiple layers:

```
Layer 1: Network
├── Firewall rules
├── Internal network isolation
└── HTTPS/TLS

Layer 2: API Gateway
├── Rate limiting
├── Request validation
└── CORS

Layer 3: Application
├── API key authentication
├── Scope validation
└── Input sanitization

Layer 4: Data
├── Token encryption (AES-256)
├── Password hashing (bcrypt)
└── Audit logging
```

---

### 7. Observability First

Every service must be observable:

**The Three Pillars**:

```
┌─────────────────────────────────────────────────────────────┐
│                      OBSERVABILITY                           │
├──────────────────┬──────────────────┬──────────────────────┤
│      LOGS        │     METRICS      │      TRACES          │
├──────────────────┼──────────────────┼──────────────────────┤
│                  │                  │                       │
│  • Structured    │  • Request rate  │  • Request flow      │
│    JSON format   │  • Latency       │  • Cross-service     │
│  • Correlation   │    (p50, p95)    │    correlation       │
│    IDs           │  • Error rate    │  • Bottleneck        │
│  • Log levels    │  • Queue depth   │    identification    │
│  • Contextual    │  • Resource      │                       │
│    data          │    usage         │                       │
│                  │                  │                       │
└──────────────────┴──────────────────┴──────────────────────┘
```

**Logging Standard**:
```json
{
  "timestamp": "2026-01-07T10:00:00.000Z",
  "level": "INFO",
  "service": "scan-worker",
  "correlation_id": "req-abc123",
  "message": "File processed",
  "data": {
    "file_id": "uuid",
    "duration_ms": 150
  }
}
```

---

### 8. Configuration as Code

All configuration should be:
- Version controlled
- Environment-aware
- Validated at startup

```yaml
# config/production.yaml
database:
  host: ${DB_HOST}
  port: 5432
  pool_size: 20

rabbitmq:
  url: ${RABBITMQ_URL}
  prefetch_count: 1

features:
  semantic_dedup: true
  cloud_embeddings: false
```

---

## Architectural Patterns

### Pattern 1: Provider Pattern

Extensible processing through interfaces:

```python
# Base interface
class TranscriptionProvider(ABC):
    @abstractmethod
    async def transcribe(self, audio_path: str) -> TranscriptionResult:
        pass

    @abstractmethod
    async def is_available(self) -> bool:
        pass

# Implementations
class WhisperProvider(TranscriptionProvider):
    async def transcribe(self, audio_path: str) -> TranscriptionResult:
        # Whisper-specific implementation
        ...

class GroqProvider(TranscriptionProvider):
    async def transcribe(self, audio_path: str) -> TranscriptionResult:
        # Groq-specific implementation
        ...

# Factory
class ProviderFactory:
    _providers = {
        "whisper": WhisperProvider,
        "groq": GroqProvider,
    }

    @classmethod
    def get_provider(cls, name: str) -> TranscriptionProvider:
        return cls._providers[name]()
```

---

### Pattern 2: Repository Pattern

Data access abstraction:

```python
# Repository interface
class FileRepository(ABC):
    @abstractmethod
    async def get_by_id(self, file_id: str) -> Optional[File]:
        pass

    @abstractmethod
    async def save(self, file: File) -> File:
        pass

    @abstractmethod
    async def find_by_hash(self, hash: str) -> List[File]:
        pass

# PostgreSQL implementation
class PostgresFileRepository(FileRepository):
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, file_id: str) -> Optional[File]:
        return await self.session.get(FileModel, file_id)

    async def save(self, file: File) -> File:
        # Upsert logic
        ...
```

---

### Pattern 3: Circuit Breaker

Prevent cascade failures:

```python
class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, timeout: int = 60):
        self.failure_count = 0
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.state = "CLOSED"
        self.last_failure_time = None

    async def execute(self, func, *args, **kwargs):
        if self.state == "OPEN":
            if self._should_attempt_reset():
                self.state = "HALF_OPEN"
            else:
                raise CircuitOpenError()

        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise

    def _on_success(self):
        self.failure_count = 0
        self.state = "CLOSED"

    def _on_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold:
            self.state = "OPEN"
```

---

### Pattern 4: Saga Pattern

Distributed transactions:

```
FILE PROCESSING SAGA:

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ 1. Create   │────►│ 2. Extract  │────►│ 3. Embed    │
│    File     │     │    Content  │     │    Vector   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │ Compensate        │ Compensate        │ Compensate
       ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Delete File │     │ Clear Text  │     │ Delete      │
│   Record    │     │   Content   │     │  Vector     │
└─────────────┘     └─────────────┘     └─────────────┘
```

**Implementation via Events**:
```python
# Each step publishes success/failure event
# Saga orchestrator tracks state and triggers compensation
```

---

### Pattern 5: CQRS (Command Query Responsibility Segregation)

Separate read and write paths:

```
WRITE PATH (Commands):
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────►│   kms-api   │────►│ PostgreSQL  │
│             │     │             │     │  (Primary)  │
└─────────────┘     └─────────────┘     └─────────────┘

READ PATH (Queries):
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────►│ search-api  │────►│ PostgreSQL  │
│             │     │             │     │  (Replica)  │
└─────────────┘     │             │     ├─────────────┤
                    │             │────►│   Qdrant    │
                    │             │     ├─────────────┤
                    │             │────►│   Redis     │
                    └─────────────┘     └─────────────┘
```

---

## Anti-Patterns to Avoid

### 1. Distributed Monolith

❌ **Bad**: Services tightly coupled via synchronous calls

```
Service A ──sync──► Service B ──sync──► Service C
    │                   │                   │
    └───────────────────┴───────────────────┘
         If any fails, all fail
```

✅ **Good**: Services communicate via events

```
Service A ──event──► Queue ──event──► Service B
                                         │
                              (async, retryable)
```

### 2. Shared Database Anti-Pattern

❌ **Bad**: Multiple services writing to same tables

```
Service A ──────┬──► Table X
                │
Service B ──────┘
```

✅ **Good**: Each service owns its data

```
Service A ──────► Table A (owned)
Service B ──────► Table B (owned)
                     │
    Integration via API calls
```

### 3. Big Ball of Mud

❌ **Bad**: No clear boundaries, everything depends on everything

✅ **Good**: Clear domain boundaries, explicit contracts

---

## Performance Principles

### 1. Cache Strategically

```
Cache Hit Rate Target: > 80%

CACHE LAYERS:
├── L1: In-memory (process-local)
├── L2: Redis (distributed)
└── L3: Database (indexed)

CACHE INVALIDATION:
├── TTL-based: Search results (5 min)
├── Event-based: File updates → invalidate
└── Manual: Admin operations
```

### 2. Batch Operations

```python
# Bad: N+1 queries
for file_id in file_ids:
    file = await db.get(file_id)

# Good: Single batch query
files = await db.get_many(file_ids)
```

### 3. Async Everything

```python
# Good: Parallel execution
results = await asyncio.gather(
    keyword_search(query),
    semantic_search(query),
    fetch_metadata(file_ids)
)
```

---

## Testing Principles

### Test Pyramid

```
          ┌───────┐
         /   E2E   \          10% - Critical flows
        /───────────\
       /  Integration \       20% - API + DB
      /─────────────────\
     /       Unit        \    70% - Business logic
    /─────────────────────\
```

### Test Characteristics

| Type | Speed | Isolation | Coverage |
|------|-------|-----------|----------|
| Unit | Fast | Complete | High |
| Integration | Medium | Partial | Medium |
| E2E | Slow | None | Low |

---

## Documentation Principles

### 1. Document Decisions

Every architectural decision should have:
- **Context**: Why was this needed?
- **Decision**: What was chosen?
- **Consequences**: What are the trade-offs?

### 2. Keep Docs Close to Code

```
service/
├── src/
├── tests/
├── README.md          # Service-specific docs
└── docs/
    └── api.md         # API documentation
```

### 3. Living Documentation

- Auto-generate API docs from code (OpenAPI)
- Update docs in same PR as code changes
- Review docs in code reviews
