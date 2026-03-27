"""Initial schema — api_keys, jobs, transcriptions, translations, batch tables

Revision ID: 001
Revises:
Create Date: 2026-03-17 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Enums ────────────────────────────────────────────────────────────────
    job_status = postgresql.ENUM(
        "pending", "queued", "processing", "completed", "failed", "cancelled",
        name="job_status",
    )
    job_type = postgresql.ENUM(
        "transcription", "translation", "batch",
        name="job_type",
    )
    job_status.create(op.get_bind(), checkfirst=True)
    job_type.create(op.get_bind(), checkfirst=True)

    # ── api_keys ─────────────────────────────────────────────────────────────
    op.create_table(
        "api_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("key_hash", sa.String(256), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_api_keys_key_hash", "api_keys", ["key_hash"])

    # ── jobs ─────────────────────────────────────────────────────────────────
    op.create_table(
        "jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "api_key_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("api_keys.id"),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.Enum("pending", "queued", "processing", "completed", "failed", "cancelled",
                    name="job_status", create_type=False),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "job_type",
            sa.Enum("transcription", "translation", "batch",
                    name="job_type", create_type=False),
            nullable=False,
        ),
        sa.Column("provider", sa.String(50), nullable=True),
        sa.Column("model_name", sa.String(100), nullable=True),
        sa.Column("language", sa.String(10), nullable=True),
        sa.Column("target_language", sa.String(10), nullable=True),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=True),
        sa.Column("file_size_bytes", sa.Integer(), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("webhook_url", sa.Text(), nullable=True),
        sa.Column("job_metadata", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_jobs_status", "jobs", ["status"])
    op.create_index("ix_jobs_created_at", "jobs", ["created_at"])

    # ── transcriptions ───────────────────────────────────────────────────────
    op.create_table(
        "transcriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "job_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("language", sa.String(10), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("word_count", sa.Integer(), nullable=True),
        sa.Column("processing_time_ms", sa.Integer(), nullable=True),
        sa.Column("provider", sa.String(50), nullable=True),
        sa.Column("model_name", sa.String(100), nullable=True),
        sa.Column("segments", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_transcriptions_job_id", "transcriptions", ["job_id"])

    # ── translations ─────────────────────────────────────────────────────────
    op.create_table(
        "translations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "transcription_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("transcriptions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_language", sa.String(10), nullable=True),
        sa.Column("target_language", sa.String(10), nullable=False),
        sa.Column("translated_text", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_translations_transcription_id", "translations", ["transcription_id"])

    # ── batch_jobs ───────────────────────────────────────────────────────────
    op.create_table(
        "batch_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "api_key_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("api_keys.id"),
            nullable=True,
        ),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column(
            "status",
            sa.Enum("pending", "queued", "processing", "completed", "failed", "cancelled",
                    name="job_status", create_type=False),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("total_files", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed_files", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_files", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── batch_job_items ──────────────────────────────────────────────────────
    op.create_table(
        "batch_job_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "batch_job_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("batch_jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "job_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    op.create_index("ix_batch_job_items_batch_job_id", "batch_job_items", ["batch_job_id"])
    op.create_index("ix_batch_job_items_job_id", "batch_job_items", ["job_id"])


def downgrade() -> None:
    op.drop_table("batch_job_items")
    op.drop_table("batch_jobs")
    op.drop_table("translations")
    op.drop_table("transcriptions")
    op.drop_table("jobs")
    op.drop_table("api_keys")

    op.execute("DROP TYPE IF EXISTS job_type")
    op.execute("DROP TYPE IF EXISTS job_status")
