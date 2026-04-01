"""
Shared pytest fixtures for content-worker tests.

Sets required environment variables before any test module imports Settings,
preventing pydantic-settings ValidationError during collection.

All values are test-only stubs — no real services are contacted.
"""
import os

# Set required env vars BEFORE any module that imports Settings is loaded.
# pydantic-settings validates at import time when settings = Settings() is called
# at module level in app/config.py, so these must be set before any app import.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/test")
os.environ.setdefault("RABBITMQ_URL", "amqp://guest:guest@localhost/")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")
os.environ.setdefault("FIRECRAWL_API_KEY", "fc-test-key")
os.environ.setdefault("FIRECRAWL_API_URL", "http://localhost:3002")
os.environ.setdefault("ENCRYPTION_KEY", "a" * 64)  # 32 bytes hex
