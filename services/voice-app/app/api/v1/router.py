"""API v1 router — aggregates all v1 endpoint routers."""
from fastapi import APIRouter

from app.api.v1.endpoints.jobs import router as jobs_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(jobs_router)
