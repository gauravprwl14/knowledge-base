"""Test configuration for rag-service.

Sets required environment variables before any module-level Settings
instantiation occurs (settings.database_url is a required Field).
"""
import os

# Set required env vars before any app module is imported.
# These are test-only values and never touch a real database.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/test_kms")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SEARCH_API_URL", "http://search-api:8001/api/v1")
