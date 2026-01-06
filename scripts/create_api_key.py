#!/usr/bin/env python3
"""
Script to create an API key for Voice App.

Usage:
    python scripts/create_api_key.py [--name "Key Name"]
"""

import asyncio
import argparse
import sys
import os
import hashlib
import secrets

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.db.session import AsyncSessionLocal
from app.db.models import APIKey


async def create_api_key(name: str = None):
    """Create a new API key."""
    # Generate random key
    key = secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(key.encode()).hexdigest()

    # Save to database
    async with AsyncSessionLocal() as db:
        api_key = APIKey(
            key_hash=key_hash,
            name=name or "API Key",
            is_active=True
        )
        db.add(api_key)
        await db.commit()
        await db.refresh(api_key)

        print("\n" + "="*60)
        print("API Key Created Successfully!")
        print("="*60)
        print(f"\nID: {api_key.id}")
        print(f"Name: {api_key.name}")
        print(f"Created: {api_key.created_at}")
        print(f"\nAPI Key: {key}")
        print("\n" + "="*60)
        print("IMPORTANT: Save this key - it won't be shown again!")
        print("="*60 + "\n")

        return api_key.id, key


async def list_api_keys():
    """List all API keys."""
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(APIKey).order_by(APIKey.created_at.desc())
        )
        keys = result.scalars().all()

        if not keys:
            print("\nNo API keys found.")
            return

        print("\n" + "="*60)
        print("API Keys")
        print("="*60)
        for key in keys:
            status = "✓ Active" if key.is_active else "✗ Inactive"
            print(f"\nID: {key.id}")
            print(f"Name: {key.name}")
            print(f"Status: {status}")
            print(f"Created: {key.created_at}")
            if key.last_used_at:
                print(f"Last Used: {key.last_used_at}")
        print("\n" + "="*60 + "\n")


async def deactivate_key(key_id: str):
    """Deactivate an API key."""
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(APIKey).where(APIKey.id == key_id)
        )
        key = result.scalar_one_or_none()

        if not key:
            print(f"\nError: API key {key_id} not found.")
            return

        key.is_active = False
        await db.commit()
        print(f"\nAPI key {key_id} has been deactivated.")


def main():
    parser = argparse.ArgumentParser(description="Manage Voice App API keys")
    parser.add_argument(
        "--name",
        type=str,
        help="Name for the API key"
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List all API keys"
    )
    parser.add_argument(
        "--deactivate",
        type=str,
        help="Deactivate an API key by ID"
    )

    args = parser.parse_args()

    if args.list:
        asyncio.run(list_api_keys())
    elif args.deactivate:
        asyncio.run(deactivate_key(args.deactivate))
    else:
        asyncio.run(create_api_key(args.name))


if __name__ == "__main__":
    main()
