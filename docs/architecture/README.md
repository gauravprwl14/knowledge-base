# KMS Architecture Documentation

**Version**: 2.0
**Last Updated**: 2026-01-07
**Status**: Architecture Design Phase

---

## Overview

This documentation provides a comprehensive architectural reference for the Knowledge Management System (KMS). The KMS is designed to help users organize, search, and manage their digital files across multiple sources including Google Drive, local file systems, and external drives.

### Key Capabilities

- **Multi-source file scanning** - Google Drive, local FS, external drives
- **Intelligent search** - Hybrid keyword + semantic search
- **Automatic deduplication** - Hash-based and semantic duplicate detection
- **Junk file cleanup** - Rule-based identification and bulk cleanup
- **Audio/Video transcription** - Integration with voice-app for searchable transcripts
- **Content extraction** - PDF, Office documents, images, media metadata

---

## Documentation Index

### [01. System Overview](./01-system-overview/)

High-level architecture and foundational decisions.

| Document | Description |
|----------|-------------|
| [High-Level Architecture](./01-system-overview/high-level-architecture.md) | System diagram, component overview, integration points |
| [Tech Stack](./01-system-overview/tech-stack.md) | Complete technology decisions per service |
| [Design Principles](./01-system-overview/design-principles.md) | Architectural principles and patterns |

### [02. Microservices](./02-microservices/)

Detailed documentation for each service.

| Document | Description |
|----------|-------------|
| [Overview](./02-microservices/README.md) | Services summary and responsibilities |
| [kms-api Service](./02-microservices/kms-api-service.md) | Main API gateway (NestJS) |
| [search-api Service](./02-microservices/search-api-service.md) | Search engine (NestJS) |
| [scan-worker Service](./02-microservices/scan-worker-service.md) | File scanner (Python) |
| [embedding-worker Service](./02-microservices/embedding-worker-service.md) | Content processor (Python) |
| [dedup-worker Service](./02-microservices/dedup-worker-service.md) | Deduplication (Python) |
| [junk-detector Service](./02-microservices/junk-detector-service.md) | Junk detection (Python) |
| [Service Communication](./02-microservices/service-communication.md) | Inter-service patterns |

### [03. Database](./03-database/)

Database architecture with logical domain separation.

| Document | Description |
|----------|-------------|
| [Overview](./03-database/README.md) | Database strategy and separation rules |
| [Schema Overview](./03-database/schema-overview.md) | Logical separation strategy |
| [Auth Domain](./03-database/auth-domain-schema.md) | `auth_*` tables (shared) |
| [KMS Domain](./03-database/kms-domain-schema.md) | `kms_*` tables |
| [Voice Domain](./03-database/voice-domain-schema.md) | `voice_*` tables (integration) |
| [Indexes & Optimization](./03-database/indexes-and-optimization.md) | Index strategy |
| [Migration Strategy](./03-database/migration-strategy.md) | Future database split plan |

### [04. Data Flows](./04-data-flows/)

End-to-end data flow documentation with diagrams.

| Document | Description |
|----------|-------------|
| [Overview](./04-data-flows/README.md) | Flow summary |
| [File Scanning Flow](./04-data-flows/file-scanning-flow.md) | Google Drive to Index |
| [Embedding Generation Flow](./04-data-flows/embedding-generation-flow.md) | Content to Vectors |
| [Search Query Flow](./04-data-flows/search-query-flow.md) | Query to Results |
| [Deduplication Flow](./04-data-flows/deduplication-flow.md) | Detection to Grouping |
| [Transcription Flow](./04-data-flows/transcription-integration-flow.md) | Audio to Text |

### [05. Algorithms](./05-algorithms/)

Complex algorithms with pseudo code and high-level implementations.

| Document | Description |
|----------|-------------|
| [Overview](./05-algorithms/README.md) | Algorithm summary |
| [Text Chunking](./05-algorithms/text-chunking-algorithm.md) | Semantic chunking for embeddings |
| [Embedding Generation](./05-algorithms/embedding-generation.md) | Vector generation pipeline |
| [Hybrid Search](./05-algorithms/hybrid-search-algorithm.md) | Keyword + Semantic merge |
| [Exact Duplicate Detection](./05-algorithms/exact-duplicate-detection.md) | Hash-based detection |
| [Semantic Duplicate Detection](./05-algorithms/semantic-duplicate-detection.md) | Embedding similarity |
| [Version Duplicate Detection](./05-algorithms/version-duplicate-detection.md) | Filename patterns |
| [Junk Classification](./05-algorithms/junk-classification.md) | Rule-based + ML |

### [06. API Contracts](./06-api-contracts/)

Complete API documentation with OpenAPI specification.

| Document | Description |
|----------|-------------|
| [Overview](./06-api-contracts/README.md) | API summary |
| [OpenAPI Spec](./06-api-contracts/openapi-spec.yaml) | Complete OpenAPI 3.0 specification |
| [Auth Endpoints](./06-api-contracts/auth-endpoints.md) | Authentication APIs |
| [Sources Endpoints](./06-api-contracts/sources-endpoints.md) | Source management APIs |
| [Files Endpoints](./06-api-contracts/files-endpoints.md) | File management APIs |
| [Search Endpoints](./06-api-contracts/search-endpoints.md) | Search APIs |
| [Duplicates Endpoints](./06-api-contracts/duplicates-endpoints.md) | Deduplication APIs |
| [Webhooks](./06-api-contracts/webhooks.md) | Webhook contracts |

### [07. Deployment](./07-deployment/)

Deployment and operations documentation.

| Document | Description |
|----------|-------------|
| [Overview](./07-deployment/README.md) | Deployment summary |
| [Docker Compose Structure](./07-deployment/docker-compose-structure.md) | Service orchestration |
| [Scaling Strategy](./07-deployment/scaling-strategy.md) | Horizontal scaling |
| [Monitoring & Observability](./07-deployment/monitoring-observability.md) | Metrics, logging, alerts |

---

## Quick Reference

### System Architecture (High-Level)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Web UI     │  │   CLI Tool   │  │  Mobile App  │  │  Third-Party │    │
│  │  (Next.js)   │  │   (Python)   │  │   (Future)   │  │     APIs     │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            API GATEWAY (Nginx)                               │
│                    Load Balancing, SSL Termination, Rate Limiting            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
┌───────────────────────────────┐       ┌───────────────────────────────┐
│         kms-api               │       │        search-api             │
│        (NestJS)               │       │        (NestJS)               │
│  • User management            │       │  • Keyword search             │
│  • Source management          │       │  • Semantic search            │
│  • File operations            │       │  • Hybrid ranking             │
│  • Job orchestration          │       │  • Filter processing          │
└───────────────────────────────┘       └───────────────────────────────┘
                    │                                   │
                    ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MESSAGE QUEUE (RabbitMQ)                             │
│   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│   │ scan.queue  │ │ embed.queue │ │ dedup.queue │ │ trans.queue │          │
│   └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┬───────────┬───────────┐
        ▼           ▼           ▼           ▼           ▼
┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│scan-worker │ │embed-worker│ │dedup-worker│ │junk-detect │ │ voice-app  │
│  (Python)  │ │  (Python)  │ │  (Python)  │ │  (Python)  │ │ (FastAPI)  │
│ • G.Drive  │ │ • Extract  │ │ • Hash     │ │ • Rules    │ │ • Whisper  │
│ • Local FS │ │ • Chunk    │ │ • Semantic │ │ • Cleanup  │ │ • Groq     │
│ • Ext.Drive│ │ • Embed    │ │ • Graph    │ │ • ML (P2)  │ │ • Deepgram │
└────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘
        │           │           │           │           │
        └───────────┴───────────┴───────────┴───────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DATA LAYER                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  PostgreSQL  │  │    Qdrant    │  │    Neo4j     │  │    MinIO     │    │
│  │  (Metadata)  │  │  (Vectors)   │  │   (Graph)    │  │   (Files)    │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tech Stack Summary

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14, TypeScript, TailwindCSS, shadcn/ui |
| **API Gateway** | Nginx |
| **Main API** | NestJS (TypeScript) |
| **Search API** | NestJS (TypeScript) |
| **Workers** | Python 3.11+, aio-pika |
| **Database** | PostgreSQL 15+ |
| **Vector Store** | Qdrant |
| **Graph DB** | Neo4j Community |
| **Message Queue** | RabbitMQ 3.12+ |
| **Object Storage** | MinIO |
| **Caching** | Redis 7+ |

### Database Domain Prefixes

| Prefix | Domain | Ownership |
|--------|--------|-----------|
| `auth_*` | Authentication | Shared (all services) |
| `kms_*` | Knowledge Management | kms-api |
| `voice_*` | Transcription | voice-app |

---

## Related Documentation

- [KMS Project Summary](../KMS_PROJECT_SUMMARY.md) - Executive overview
- [KMS Feature Breakdown](../KMS_FEATURE_BREAKDOWN.md) - Detailed feature specs
- [KMS Implementation Roadmap](../KMS_IMPLEMENTATION_ROADMAP.md) - Delivery timeline
- [CLAUDE.md](../../CLAUDE.md) - Development guidelines

---

## Document Conventions

### Diagrams

- ASCII diagrams for text-based visualization
- Mermaid syntax for complex flowcharts (when rendered)
- Sequence diagrams for API interactions

### Code Examples

- **Pseudo code**: Language-agnostic algorithm description
- **High-level implementation**: Python-like structure (not executable)
- **API examples**: JSON request/response samples

### Status Indicators

- ✅ Implemented and tested
- 🚧 In progress
- 📋 Planned (not started)
- ⏳ Deferred to future phase
