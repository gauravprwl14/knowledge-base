from fastapi import APIRouter, HTTPException, status, Query
from fastapi.responses import PlainTextResponse
from typing import Optional
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.dependencies import APIKeyDep, DbSession
from app.schemas.transcription import (
    TranscriptionResponse,
    TranslationRequest,
    TranslationResponse,
    TranscriptionListResponse
)
from app.db.models import Job, Transcription, Translation

router = APIRouter()


@router.get("", response_model=TranscriptionListResponse)
async def list_transcriptions(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    api_key: APIKeyDep = None,
    db: DbSession = None
):
    """List all transcriptions for the authenticated user."""
    # Join with jobs to filter by api_key
    query = (
        select(Transcription)
        .join(Job)
        .where(Job.api_key_id == api_key.id)
    )

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    offset = (page - 1) * page_size
    query = query.order_by(Transcription.created_at.desc()).offset(offset).limit(page_size)

    result = await db.execute(query)
    transcriptions = result.scalars().all()

    return TranscriptionListResponse(
        transcriptions=[TranscriptionResponse.model_validate(t) for t in transcriptions],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/{transcription_id}", response_model=TranscriptionResponse)
async def get_transcription(
    transcription_id: UUID,
    api_key: APIKeyDep = None,
    db: DbSession = None
):
    """Get a specific transcription."""
    result = await db.execute(
        select(Transcription)
        .join(Job)
        .where(
            Transcription.id == transcription_id,
            Job.api_key_id == api_key.id
        )
    )
    transcription = result.scalar_one_or_none()

    if not transcription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcription not found"
        )

    return TranscriptionResponse.model_validate(transcription)


@router.post("/{transcription_id}/translate", response_model=TranslationResponse)
async def translate_transcription(
    transcription_id: UUID,
    request: TranslationRequest,
    api_key: APIKeyDep = None,
    db: DbSession = None
):
    """Translate a transcription to another language."""
    # Get transcription
    result = await db.execute(
        select(Transcription)
        .join(Job)
        .where(
            Transcription.id == transcription_id,
            Job.api_key_id == api_key.id
        )
    )
    transcription = result.scalar_one_or_none()

    if not transcription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcription not found"
        )

    # Check if translation already exists
    existing = await db.execute(
        select(Translation).where(
            Translation.transcription_id == transcription_id,
            Translation.target_language == request.target_language
        )
    )
    existing_translation = existing.scalar_one_or_none()

    if existing_translation:
        return TranslationResponse.model_validate(existing_translation)

    # Perform translation
    from app.services.translation.factory import TranslationFactory
    translator = TranslationFactory.get_translator(request.provider)

    translated_text = await translator.translate(
        text=transcription.text,
        source_language=transcription.language or "auto",
        target_language=request.target_language
    )

    # Save translation
    translation = Translation(
        transcription_id=transcription_id,
        source_language=transcription.language,
        target_language=request.target_language,
        translated_text=translated_text
    )
    db.add(translation)
    await db.commit()
    await db.refresh(translation)

    return TranslationResponse.model_validate(translation)


@router.get("/{transcription_id}/download")
async def download_transcription(
    transcription_id: UUID,
    format: str = Query(default="txt", regex="^(txt|json|srt)$"),
    api_key: APIKeyDep = None,
    db: DbSession = None
):
    """Download transcription as a file."""
    result = await db.execute(
        select(Transcription)
        .join(Job)
        .where(
            Transcription.id == transcription_id,
            Job.api_key_id == api_key.id
        )
        .options(selectinload(Transcription.job))
    )
    transcription = result.scalar_one_or_none()

    if not transcription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcription not found"
        )

    filename = transcription.job.original_filename or "transcription"
    filename = filename.rsplit(".", 1)[0]  # Remove extension

    if format == "txt":
        return PlainTextResponse(
            content=transcription.text,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}.txt"'
            }
        )
    elif format == "json":
        import json
        content = json.dumps({
            "id": str(transcription.id),
            "text": transcription.text,
            "language": transcription.language,
            "confidence": transcription.confidence,
            "word_count": transcription.word_count,
            "segments": transcription.segments
        }, indent=2)
        return PlainTextResponse(
            content=content,
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}.json"'
            }
        )
    elif format == "srt":
        # Generate SRT format if segments available
        if transcription.segments:
            srt_content = _generate_srt(transcription.segments)
        else:
            # Simple SRT with full text
            srt_content = f"1\n00:00:00,000 --> 99:59:59,999\n{transcription.text}\n"

        return PlainTextResponse(
            content=srt_content,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}.srt"'
            }
        )


def _generate_srt(segments: list) -> str:
    """Generate SRT subtitle format from segments."""
    srt_lines = []

    for i, segment in enumerate(segments, 1):
        start = segment.get("start", 0)
        end = segment.get("end", start + 5)
        text = segment.get("text", "")

        start_str = _format_srt_time(start)
        end_str = _format_srt_time(end)

        srt_lines.append(f"{i}")
        srt_lines.append(f"{start_str} --> {end_str}")
        srt_lines.append(text.strip())
        srt_lines.append("")

    return "\n".join(srt_lines)


def _format_srt_time(seconds: float) -> str:
    """Format seconds to SRT time format (HH:MM:SS,mmm)."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"
