"""Shared pytest fixtures and environment setup for the embed-worker test suite."""

import os

# Set required environment variables before any app modules are imported.
# These are not real credentials — they only satisfy Settings model validation.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/testdb")
os.environ.setdefault("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
os.environ.setdefault("QDRANT_URL", "http://localhost:6333")
# Default mock flags so tests never try to load the BGE-M3 model or hit Qdrant.
os.environ.setdefault("MOCK_EMBEDDING", "true")
os.environ.setdefault("MOCK_QDRANT", "true")
