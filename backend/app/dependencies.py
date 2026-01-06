from typing import Annotated, Optional
from fastapi import Depends, HTTPException, Header, status
from sqlalchemy.ext.asyncio import AsyncSession
import hashlib

from app.db.session import get_db
from app.db.models.api_key import APIKey
from app.config import get_settings

settings = get_settings()


async def verify_api_key(
    x_api_key: Annotated[Optional[str], Header()] = None,
    db: AsyncSession = Depends(get_db)
) -> APIKey:
    """Verify API key from header and return the API key record."""
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required"
        )

    # Hash the provided key
    key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()

    # Look up the key
    from sqlalchemy import select
    result = await db.execute(
        select(APIKey).where(
            APIKey.key_hash == key_hash,
            APIKey.is_active == True
        )
    )
    api_key = result.scalar_one_or_none()

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key"
        )

    # Update last used timestamp
    from datetime import datetime
    api_key.last_used_at = datetime.utcnow()
    await db.commit()

    return api_key


# Type alias for dependency injection
APIKeyDep = Annotated[APIKey, Depends(verify_api_key)]
DbSession = Annotated[AsyncSession, Depends(get_db)]
