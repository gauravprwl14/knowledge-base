"""
Pytest configuration and fixtures for testing
"""
import asyncio
import os
from typing import AsyncGenerator, Generator
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.main import app
from app.db.session import Base, get_db
from app.dependencies import verify_api_key
from app.db.models import APIKey
import hashlib


# Test database URL
TEST_DATABASE_URL = "postgresql+asyncpg://voiceapp:voiceapp@localhost:5432/voiceapp_test"

# Create test engine
test_engine = create_async_engine(
    TEST_DATABASE_URL,
    poolclass=NullPool,
    echo=False,
)

TestSessionLocal = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Create a fresh database session for each test."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with TestSessionLocal() as session:
        yield session
        await session.rollback()


@pytest.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create a test client with overridden dependencies."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
async def test_api_key(db_session: AsyncSession) -> str:
    """Create a test API key."""
    key = "test_api_key_12345"
    key_hash = hashlib.sha256(key.encode()).hexdigest()

    api_key = APIKey(
        key_hash=key_hash,
        name="Test Key",
        is_active=True
    )
    db_session.add(api_key)
    await db_session.commit()

    return key


@pytest.fixture(scope="function")
async def authenticated_client(
    client: AsyncClient,
    test_api_key: str
) -> AsyncClient:
    """Create an authenticated test client."""
    client.headers["X-API-Key"] = test_api_key
    return client


@pytest.fixture(scope="function")
def test_audio_file(tmp_path):
    """Create a test audio file."""
    import wave
    import struct

    file_path = tmp_path / "test_audio.wav"

    # Create a 1-second audio file
    sample_rate = 16000
    duration = 1
    frequency = 440  # A4 note

    with wave.open(str(file_path), 'w') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)

        for i in range(sample_rate * duration):
            value = int(32767 * 0.3 * (i % 100) / 100)  # Simple sawtooth wave
            data = struct.pack('<h', value)
            wav_file.writeframes(data)

    return file_path


@pytest.fixture(scope="function")
def test_video_file(tmp_path):
    """Create a test video file path (placeholder)."""
    # For actual tests, you would use a real video file
    # This is just for reference
    return "/Users/gauravporwal/Sites/projects/rnd/voice-app/test-files/mp4-file/zpjl-hhlath-xuqf_final_step_511033.mp4"
