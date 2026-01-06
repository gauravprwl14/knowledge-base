import asyncio
import hashlib
import secrets
import sys
sys.path.insert(0, '/app')

from app.db.session import AsyncSessionLocal
from app.db.models import APIKey

async def create_key():
    key = secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(key.encode()).hexdigest()

    async with AsyncSessionLocal() as db:
        api_key = APIKey(
            key_hash=key_hash,
            name="Test Key - E2E Testing",
            is_active=True
        )
        db.add(api_key)
        await db.commit()

    print(f"\nTest API Key created successfully!")
    print(f"API Key: {key}")
    print(f"\nUse this key for testing.")

if __name__ == "__main__":
    asyncio.run(create_key())
