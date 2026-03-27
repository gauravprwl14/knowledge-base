"""Schema for bulk job operations"""
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from uuid import UUID


class BulkDeleteRequest(BaseModel):
    """Request body for bulk delete operation"""
    job_ids: List[UUID] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="List of job UUIDs to delete (1-100 jobs)",
        examples=[
            [
                "550e8400-e29b-41d4-a716-446655440000",
                "550e8400-e29b-41d4-a716-446655440001",
                "550e8400-e29b-41d4-a716-446655440002"
            ]
        ]
    )

    @field_validator('job_ids')
    @classmethod
    def validate_unique_ids(cls, v):
        """Ensure job IDs are unique"""
        if len(v) != len(set(v)):
            raise ValueError("Duplicate job IDs are not allowed")
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "job_ids": [
                    "123e4567-e89b-12d3-a456-426614174000",
                    "123e4567-e89b-12d3-a456-426614174001",
                    "123e4567-e89b-12d3-a456-426614174002"
                ]
            }
        }


class JobDeleteDetail(BaseModel):
    """Details of a successfully deleted job"""
    job_id: str = Field(..., description="UUID of the deleted job")
    original_filename: str = Field(..., description="Original filename of the job")
    status: str = Field(..., description="Deletion status", examples=["deleted"])

    class Config:
        json_schema_extra = {
            "example": {
                "job_id": "550e8400-e29b-41d4-a716-446655440000",
                "original_filename": "audio.mp3",
                "status": "deleted"
            }
        }


class JobDeleteFailure(BaseModel):
    """
    Standard error object for failed job deletion.
    Follows the application-wide error format.
    """
    errorCode: str = Field(..., description="Standard error code (e.g., JOB1001)", examples=["JOB1001"])
    message: str = Field(..., description="Human-readable error message", examples=["Job not found or access denied"])
    type: str = Field(..., description="Error type", examples=["not_found", "database_error", "validation_error"])
    category: str = Field(..., description="Error category", examples=["resource", "system", "input_validation"])
    data: dict = Field(default_factory=dict, description="Additional error metadata (job_id, etc.)")

    class Config:
        json_schema_extra = {
            "example": {
                "errorCode": "JOB1001",
                "message": "Job not found or access denied",
                "type": "not_found",
                "category": "resource",
                "data": {
                    "job_id": "550e8400-e29b-41d4-a716-446655440000",
                    "original_filename": "audio.mp3"
                }
            }
        }


class BulkDeleteResponse(BaseModel):
    """
    Response for bulk delete operation.
    
    Returns detailed breakdown of success/failure even in partial success scenarios.
    HTTP 200 is returned even if some jobs fail - check failed_count for partial failures.
    """
    deleted_count: int = Field(
        ...,
        description="Number of jobs successfully deleted",
        examples=[8]
    )
    failed_count: int = Field(
        ...,
        description="Number of jobs that failed to delete",
        examples=[2]
    )
    total_requested: int = Field(
        ...,
        description="Total number of jobs requested for deletion",
        examples=[10]
    )
    deleted_jobs: List[dict] = Field(
        ...,
        description="List of successfully deleted jobs with details"
    )
    failed_jobs: List[dict] = Field(
        ...,
        description="List of jobs that failed to delete with error messages"
    )
    files_deleted_count: int = Field(
        ...,
        description="Total number of files deleted (audio, transcription, translation)",
        examples=[24]
    )
    files_failed_count: int = Field(
        ...,
        description="Number of files that failed to delete",
        examples=[2]
    )

    class Config:
        json_schema_extra = {
            "examples": [
                {
                    "summary": "All Success",
                    "value": {
                        "deleted_count": 10,
                        "failed_count": 0,
                        "total_requested": 10,
                        "deleted_jobs": [
                            {
                                "job_id": "550e8400-e29b-41d4-a716-446655440000",
                                "original_filename": "audio1.mp3",
                                "status": "deleted"
                            }
                        ],
                        "failed_jobs": [],
                        "files_deleted_count": 30,
                        "files_failed_count": 0
                    }
                },
                {
                    "summary": "Partial Success - 8 deleted, 2 failed",
                    "value": {
                        "deleted_count": 8,
                        "failed_count": 2,
                        "total_requested": 10,
                        "deleted_jobs": [
                            {
                                "job_id": "550e8400-e29b-41d4-a716-446655440000",
                                "original_filename": "audio1.mp3",
                                "status": "deleted"
                            }
                        ],
                        "failed_jobs": [
                            {
                                "job_id": "550e8400-e29b-41d4-a716-446655440008",
                                "original_filename": "audio9.mp3",
                                "error": "Job not found or access denied"
                            },
                            {
                                "job_id": "550e8400-e29b-41d4-a716-446655440009",
                                "original_filename": "audio10.mp3",
                                "error": "Database constraint violation"
                            }
                        ],
                        "files_deleted_count": 24,
                        "files_failed_count": 2
                    }
                }
            ]
        }
