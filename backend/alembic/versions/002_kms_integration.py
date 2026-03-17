"""Add KMS integration fields — kms_file_id on jobs, pushed_to_kms on transcriptions

Revision ID: 002
Revises: 001
Create Date: 2026-03-17 00:01:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Link voice jobs to KMS files for cross-service traceability
    op.add_column(
        "jobs",
        sa.Column("kms_file_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index("ix_jobs_kms_file_id", "jobs", ["kms_file_id"])

    # Track whether transcription text has been pushed back to KMS for embedding
    op.add_column(
        "transcriptions",
        sa.Column("pushed_to_kms", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "transcriptions",
        sa.Column("pushed_to_kms_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("transcriptions", "pushed_to_kms_at")
    op.drop_column("transcriptions", "pushed_to_kms")
    op.drop_index("ix_jobs_kms_file_id", table_name="jobs")
    op.drop_column("jobs", "kms_file_id")
