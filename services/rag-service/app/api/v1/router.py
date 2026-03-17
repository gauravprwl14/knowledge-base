from fastapi import APIRouter
from app.api.v1.endpoints.chat import router as chat_router
from app.api.v1.endpoints.runs import router as runs_router
from app.api.v1.endpoints.agents import router as agents_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(chat_router)
api_router.include_router(runs_router)
api_router.include_router(agents_router)
