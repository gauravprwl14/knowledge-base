"""API v1 router — aggregates all v1 endpoint routers."""
from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints.ingest import router as ingest_router

router = APIRouter()

# Mount the ingest endpoints under /urls so the full path is /api/v1/urls/ingest
router.include_router(ingest_router, prefix="/urls", tags=["URL Ingest"])
