from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class ModelInfo(BaseModel):
    id: str
    name: str
    display_name: str
    provider: str
    description: str
    type: str  # local or cloud
    languages: list[str]
    pricing: Optional[str] = None


class ModelsResponse(BaseModel):
    models: list[ModelInfo]


# Available models
AVAILABLE_MODELS = [
    # Local Whisper models
    ModelInfo(
        id="whisper-tiny",
        name="tiny",
        display_name="Whisper Tiny",
        provider="whisper",
        description="Fastest model, lower accuracy. Good for quick transcriptions.",
        type="local",
        languages=["multilingual"],
        pricing="Free (local)"
    ),
    ModelInfo(
        id="whisper-base",
        name="base",
        display_name="Whisper Base",
        provider="whisper",
        description="Good balance of speed and accuracy.",
        type="local",
        languages=["multilingual"],
        pricing="Free (local)"
    ),
    ModelInfo(
        id="whisper-small",
        name="small",
        display_name="Whisper Small",
        provider="whisper",
        description="Higher accuracy, moderate speed.",
        type="local",
        languages=["multilingual"],
        pricing="Free (local)"
    ),
    ModelInfo(
        id="whisper-medium",
        name="medium",
        display_name="Whisper Medium",
        provider="whisper",
        description="High accuracy, slower processing.",
        type="local",
        languages=["multilingual"],
        pricing="Free (local)"
    ),
    ModelInfo(
        id="whisper-large-v3",
        name="large-v3",
        display_name="Whisper Large V3",
        provider="whisper",
        description="Best accuracy, slowest processing. Requires more RAM.",
        type="local",
        languages=["multilingual"],
        pricing="Free (local)"
    ),
    ModelInfo(
        id="whisper-large-v3-turbo",
        name="large-v3-turbo",
        display_name="Whisper Large V3 Turbo",
        provider="whisper",
        description="Near-best accuracy with faster processing than Large V3.",
        type="local",
        languages=["multilingual"],
        pricing="Free (local)"
    ),
    # Groq cloud models
    ModelInfo(
        id="groq-whisper-large-v3",
        name="whisper-large-v3",
        display_name="Groq Whisper Large V3",
        provider="groq",
        description="Cloud-hosted Whisper Large V3 with very fast inference.",
        type="cloud",
        languages=["multilingual"],
        pricing="Pay per minute"
    ),
    ModelInfo(
        id="groq-whisper-large-v3-turbo",
        name="whisper-large-v3-turbo",
        display_name="Groq Whisper Large V3 Turbo",
        provider="groq",
        description="Fastest cloud transcription with excellent accuracy.",
        type="cloud",
        languages=["multilingual"],
        pricing="Pay per minute"
    ),
    # Deepgram models
    ModelInfo(
        id="deepgram-nova-3",
        name="nova-3",
        display_name="Deepgram Nova 3",
        provider="deepgram",
        description="Latest Deepgram model with best accuracy for English.",
        type="cloud",
        languages=["en"],
        pricing="$0.0043/minute"
    ),
    ModelInfo(
        id="deepgram-nova-2",
        name="nova-2",
        display_name="Deepgram Nova 2",
        provider="deepgram",
        description="Great accuracy with multilingual support.",
        type="cloud",
        languages=["multilingual"],
        pricing="$0.0043/minute"
    ),
]


@router.get("", response_model=ModelsResponse)
async def list_models():
    """List all available transcription models."""
    return ModelsResponse(models=AVAILABLE_MODELS)


@router.get("/{model_id}", response_model=ModelInfo)
async def get_model(model_id: str):
    """Get details of a specific model."""
    for model in AVAILABLE_MODELS:
        if model.id == model_id:
            return model

    from fastapi import HTTPException, status
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Model not found"
    )
