"""Message models for url-agent queue publishing."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class IngestUrlRequest(BaseModel):
    """API request to ingest a URL.

    Attributes:
        url: The URL to extract content from (YouTube or web page).
        user_id: ID of the user submitting the request (for ownership tracking).
        source_id: Optional KMS source ID to associate the extracted file with.
    """

    url: str
    user_id: str
    source_id: str | None = None


class IngestUrlResponse(BaseModel):
    """API response after accepting a URL ingest request.

    Attributes:
        job_id: UUID for polling extraction status.
        url: The original URL that was submitted.
        url_type: Classified type — "youtube" or "web".
        status: Current processing status.
        message: Human-readable status description.
    """

    # Generate a fresh UUID for each response at serialisation time
    job_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str
    url_type: str          # "youtube" or "web"
    status: str = "queued"
    message: str = "URL accepted for processing"
