"""Transactional comment-to-version feedback runs."""
import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

try:
    from ..database import Base
except ImportError:
    from database import Base


class CfFeedbackStatus(str, PyEnum):
    queued = "queued"
    working = "working"
    done = "done"
    failed = "failed"
    cancelled = "cancelled"


class CfFeedbackRequestSource(str, PyEnum):
    app = "app"
    flo = "flo"
    cli = "cli"


class CfFeedbackRequestStatus(str, PyEnum):
    pending = "pending"
    picked = "picked"
    cleared = "cleared"


class CfFeedbackRequest(Base):
    __tablename__ = "cf_feedback_requests"
    __table_args__ = (
        Index("uq_cf_feedback_requests_pending_asset", "asset_id", unique=True,
              postgresql_where=text("status = 'pending'")),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), index=True)
    brand: Mapped[str] = mapped_column(String(64), nullable=False)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), index=True)
    requested_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    source: Mapped[CfFeedbackRequestSource] = mapped_column(Enum(CfFeedbackRequestSource, name="cffeedbackrequestsource"))
    status: Mapped[CfFeedbackRequestStatus] = mapped_column(Enum(CfFeedbackRequestStatus, name="cffeedbackrequeststatus"), default=CfFeedbackRequestStatus.pending, server_default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    picked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("cf_feedback_runs.id", ondelete="SET NULL"), nullable=True)


class CfFeedbackRun(Base):
    __tablename__ = "cf_feedback_runs"
    __table_args__ = (
        Index("ix_cf_feedback_runs_status_created_at", "status", "created_at"),
        CheckConstraint("length(progress) <= 500", name="ck_cf_feedback_runs_progress_length"),
        CheckConstraint("length(summary) <= 2000", name="ck_cf_feedback_runs_summary_length"),
        CheckConstraint("length(error) <= 1000", name="ck_cf_feedback_runs_error_length"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), index=True)
    brand: Mapped[str] = mapped_column(String(64), nullable=False)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), index=True)
    version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("asset_versions.id"))
    style_version_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("cf_style_versions.id", ondelete="SET NULL"), nullable=True)
    comment_ids: Mapped[list] = mapped_column(JSONB, nullable=False)
    status: Mapped[CfFeedbackStatus] = mapped_column(Enum(CfFeedbackStatus, name="cffeedbackstatus"), default=CfFeedbackStatus.queued, server_default="queued")
    attempt: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    progress: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_version_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("asset_versions.id"), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    claimed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
