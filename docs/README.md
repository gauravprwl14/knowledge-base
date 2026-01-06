# Voice App Documentation

Welcome to the Voice App documentation. This comprehensive guide will help you understand, deploy, and maintain the Voice App transcription service.

## 📚 Documentation Structure

### 🏗️ Architecture
- [System Architecture](./architecture/SYSTEM_ARCHITECTURE.md) - High-level system design
- [Database Schema](./architecture/DATABASE_SCHEMA.md) - Database structure and relationships
- [API Design](./architecture/API_DESIGN.md) - API architecture and patterns
- [Queue Architecture](./architecture/QUEUE_ARCHITECTURE.md) - Message queue and worker design
- [Security Model](./architecture/SECURITY_MODEL.md) - Authentication and authorization

### 📖 Guides
- [Getting Started](./guides/GETTING_STARTED.md) - Quick start guide
- [Development Setup](./guides/DEVELOPMENT_SETUP.md) - Local development environment
- [Configuration Guide](./guides/CONFIGURATION.md) - Environment variables and settings
- [Deployment Guide](./guides/DEPLOYMENT.md) - Production deployment
- [Testing Guide](./guides/TESTING_GUIDE.md) - Running and writing tests

### 🔌 API Documentation
- [API Overview](./api/API_OVERVIEW.md) - REST API introduction
- [Authentication](./api/AUTHENTICATION.md) - API key management
- [Upload Endpoints](./api/UPLOAD.md) - File upload API
- [Jobs Endpoints](./api/JOBS.md) - Job management API
- [Transcriptions Endpoints](./api/TRANSCRIPTIONS.md) - Transcription retrieval
- [Error Handling](./api/ERROR_HANDLING.md) - Error codes and responses

### 🚀 Deployment
- [Docker Deployment](./deployment/DOCKER.md) - Docker and Docker Compose
- [Production Checklist](./deployment/PRODUCTION_CHECKLIST.md) - Pre-deployment steps
- [Monitoring](./deployment/MONITORING.md) - Logging and metrics
- [Troubleshooting](./deployment/TROUBLESHOOTING.md) - Common issues

### 🎓 Knowledge Transfer
- [Codebase Overview](./knowledge-transfer/CODEBASE_OVERVIEW.md) - Code structure
- [Backend Deep Dive](./knowledge-transfer/BACKEND_DEEP_DIVE.md) - Backend architecture
- [Frontend Deep Dive](./knowledge-transfer/FRONTEND_DEEP_DIVE.md) - Frontend architecture
- [Common Tasks](./knowledge-transfer/COMMON_TASKS.md) - Frequent operations
- [FAQ](./knowledge-transfer/FAQ.md) - Frequently asked questions

## 🎯 Quick Links

### For New Developers
1. Start with [Getting Started](./guides/GETTING_STARTED.md)
2. Read [Codebase Overview](./knowledge-transfer/CODEBASE_OVERVIEW.md)
3. Set up [Development Environment](./guides/DEVELOPMENT_SETUP.md)

### For DevOps/SRE
1. Review [System Architecture](./architecture/SYSTEM_ARCHITECTURE.md)
2. Follow [Deployment Guide](./guides/DEPLOYMENT.md)
3. Check [Production Checklist](./deployment/PRODUCTION_CHECKLIST.md)

### For API Consumers
1. Read [API Overview](./api/API_OVERVIEW.md)
2. Review [Authentication](./api/AUTHENTICATION.md)
3. Check specific endpoint docs in [API Documentation](./api/)

## 🔧 Tech Stack

- **Backend**: Python 3.11, FastAPI, SQLAlchemy
- **Frontend**: Next.js 14, React 18, TypeScript
- **Database**: PostgreSQL 15
- **Queue**: RabbitMQ
- **Transcription**: Faster-Whisper, Groq API, Deepgram API
- **Translation**: OpenAI GPT, Google Gemini

## 📊 System Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│  PostgreSQL │
│  (Next.js)  │     │  (FastAPI)  │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           │
                    ┌──────▼──────┐
                    │  RabbitMQ   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Worker    │
                    │  (Python)   │
                    └─────────────┘
```

## 🎯 Key Features

- **Multi-format Support**: Audio (WAV, MP3, M4A, OGG, FLAC) and Video (MP4, MOV, AVI, MKV, WebM)
- **Multiple Providers**: Local Whisper, Groq Cloud, Deepgram Cloud
- **Bulk Processing**: Queue-based async job processing
- **Translation**: Multi-language translation support
- **Multiple Export Formats**: TXT, JSON, SRT (subtitles)
- **RESTful API**: Well-documented REST API with OpenAPI/Swagger

## 📈 Performance Characteristics

- **Whisper Tiny**: ~5 seconds for 2-minute audio
- **Whisper Base**: ~10 seconds for 2-minute audio
- **Groq Cloud**: ~2-3 seconds for 2-minute audio
- **Max File Size**: 500 MB (configurable)
- **Concurrent Workers**: 4 (configurable)

## 🔐 Security Features

- API key authentication
- HTTPS support
- Input validation
- SQL injection prevention
- XSS protection
- Rate limiting (configurable)

## 📞 Support

- **Issues**: GitHub Issues
- **Documentation**: This repository
- **Email**: [Configure in deployment]

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Contributing

See CONTRIBUTING.md for guidelines

---

**Last Updated**: January 6, 2026
**Version**: 1.0.0
