from fastapi import APIRouter

from app.api.v1.endpoints import upload, jobs, transcriptions, models

api_router = APIRouter()

api_router.include_router(upload.router, prefix="/upload", tags=["upload"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
api_router.include_router(transcriptions.router, prefix="/transcriptions", tags=["transcriptions"])
api_router.include_router(models.router, prefix="/models", tags=["models"])
