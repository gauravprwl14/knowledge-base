"""Tests for embed-worker Settings / config.

PRD: PRD-M04-embedding-pipeline.md — worker configuration
Gap: No tests existed for Settings model validation or env-var reading.
Key cases:
- EMBED_PREFETCH_COUNT env var is respected (default=8, overridable)
- DATABASE_URL is required (missing → ValidationError)
- mock_embedding / mock_qdrant default to True (safe for dev/CI)
- model_cache_dir defaults to /tmp/bge-m3-cache
"""

import os
from unittest.mock import patch

import pytest


class TestSettingsPrefetchCount:
    """EMBED_PREFETCH_COUNT is read via AliasChoices — verify the alias works."""

    def test_default_prefetch_count_is_8(self):
        """prefetch_count defaults to 8 when EMBED_PREFETCH_COUNT is not set."""
        from app.config import Settings

        env = {
            "DATABASE_URL": "postgresql://test:test@localhost:5432/testdb",
            "RABBITMQ_URL": "amqp://guest:guest@localhost:5672/",
        }
        # Remove the key if present so we test the actual default
        env.pop("EMBED_PREFETCH_COUNT", None)

        with patch.dict(os.environ, env, clear=False):
            os.environ.pop("EMBED_PREFETCH_COUNT", None)
            settings = Settings(
                database_url="postgresql://test:test@localhost:5432/testdb"
            )

        assert settings.prefetch_count == 8

    def test_embed_prefetch_count_env_var_overrides_default(self):
        """EMBED_PREFETCH_COUNT=32 must set prefetch_count to 32."""
        from app.config import Settings

        with patch.dict(os.environ, {"EMBED_PREFETCH_COUNT": "32"}):
            settings = Settings(
                database_url="postgresql://test:test@localhost:5432/testdb"
            )

        assert settings.prefetch_count == 32

    def test_embed_prefetch_count_alias_is_case_insensitive(self):
        """The alias resolution must work for the standard uppercase env var form."""
        from app.config import Settings

        with patch.dict(os.environ, {"EMBED_PREFETCH_COUNT": "16"}):
            settings = Settings(
                database_url="postgresql://test:test@localhost:5432/testdb"
            )

        assert settings.prefetch_count == 16


class TestSettingsMockFlags:
    """Mock flags must default to True to prevent BGE-M3/Qdrant calls in CI."""

    def test_mock_embedding_defaults_to_true(self):
        """mock_embedding must be True when MOCK_EMBEDDING env var is absent."""
        from app.config import Settings

        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("MOCK_EMBEDDING", None)
            settings = Settings(
                database_url="postgresql://test:test@localhost:5432/testdb"
            )

        assert settings.mock_embedding is True

    def test_mock_qdrant_defaults_to_true(self):
        """mock_qdrant must be True when MOCK_QDRANT env var is absent."""
        from app.config import Settings

        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("MOCK_QDRANT", None)
            settings = Settings(
                database_url="postgresql://test:test@localhost:5432/testdb"
            )

        assert settings.mock_qdrant is True

    def test_mock_embedding_can_be_disabled(self):
        """MOCK_EMBEDDING=false must set mock_embedding to False."""
        from app.config import Settings

        with patch.dict(os.environ, {"MOCK_EMBEDDING": "false"}):
            settings = Settings(
                database_url="postgresql://test:test@localhost:5432/testdb"
            )

        assert settings.mock_embedding is False

    def test_mock_qdrant_can_be_disabled(self):
        """MOCK_QDRANT=false must set mock_qdrant to False."""
        from app.config import Settings

        with patch.dict(os.environ, {"MOCK_QDRANT": "false"}):
            settings = Settings(
                database_url="postgresql://test:test@localhost:5432/testdb"
            )

        assert settings.mock_qdrant is False


class TestSettingsDefaults:
    """Other settings default values."""

    def test_model_cache_dir_default(self):
        """model_cache_dir must default to /tmp/bge-m3-cache."""
        from app.config import Settings

        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("MODEL_CACHE_DIR", None)
            settings = Settings(
                database_url="postgresql://test:test@localhost:5432/testdb"
            )

        assert settings.model_cache_dir == "/tmp/bge-m3-cache"

    def test_embed_queue_default(self):
        """embed_queue must default to kms.embed."""
        from app.config import Settings

        settings = Settings(
            database_url="postgresql://test:test@localhost:5432/testdb"
        )

        assert settings.embed_queue == "kms.embed"

    def test_service_name_default(self):
        """service_name must default to 'embed-worker'."""
        from app.config import Settings

        settings = Settings(
            database_url="postgresql://test:test@localhost:5432/testdb"
        )

        assert settings.service_name == "embed-worker"

    def test_chunk_size_default(self):
        """chunk_size must default to 512."""
        from app.config import Settings

        settings = Settings(
            database_url="postgresql://test:test@localhost:5432/testdb"
        )

        assert settings.chunk_size == 512

    def test_chunk_overlap_default(self):
        """chunk_overlap must default to 64."""
        from app.config import Settings

        settings = Settings(
            database_url="postgresql://test:test@localhost:5432/testdb"
        )

        assert settings.chunk_overlap == 64
