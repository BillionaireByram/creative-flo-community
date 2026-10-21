"""Posting packages and the engine bridge's transactional operation queue."""
import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

try:
    from ..database import Base
except ImportError:
    from database import Base


class CfPostSource(str, PyEnum):
    asset = "asset"
    idea = "idea"


class CfPostKind(str, PyEnum):
    video = "video"
    text = "text"


class CfPostStatus(str, PyEnum):
    draft = "draft"
    preparing = "preparing"
    ready = "ready"
    approving = "approving"
    scheduled = "scheduled"
    posted = "posted"
    failed = "failed"
    cancelling = "cancelling"
    cancelled = "cancelled"
    blocked = "blocked"


class CfBridgeOpKind(str, PyEnum):
    prepare = "prepare"
    approve = "approve"
    reissue = "reissue"
    cancel = "cancel"
    refresh = "refresh"


class CfBridgeOpStatus(str, PyEnum):
    queued = "queued"
    claimed = "claimed"
    done = "done"
    failed = "failed"


class CfPostPackage(Base):
    __tablename__ = "cf_post_packages"
    __table_args__ = (
        CheckConstraint("series_slot IN ('carousel', 'x_post', 'thread')", name="ck_cf_post_packages_series_slot"),
        CheckConstraint("approval_source IN ('owner', 'series')", name="ck_cf_post_packages_approval_source"),
        Index("uq_cf_post_packages_series_slot", "series_parent_id", "series_slot", unique=True,
              postgresql_where=text("series_parent_id IS NOT NULL AND status NOT IN ('cancelled', 'cancelling', 'blocked')")),
        Index("ix_cf_post_packages_project_status", "project_id", "status"),
        Index("ix_cf_post_packages_project_created_at", "project_id", "created_at"),
        Index("uq_cf_post_packages_live_asset", "asset_id", unique=True,
              postgresql_where=text("asset_id IS NOT NULL AND status NOT IN ('posted', 'cancelled')")),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    brand: Mapped[str] = mapped_column(String(64), nullable=False)
    source: Mapped[CfPostSource] = mapped_column(Enum(CfPostSource, name="cfpostsource"), nullable=False)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=True)
    version_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("asset_versions.id"), nullable=True)
    style_version_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("cf_style_versions.id", ondelete="SET NULL"), nullable=True)
    idea_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("cf_ideas.id"), nullable=True)
    kind: Mapped[CfPostKind] = mapped_column(Enum(CfPostKind, name="cfpostkind"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="", server_default="")
    caption: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    thread: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    x_post: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    carousel: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    platforms: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    at: Mapped[str | None] = mapped_column(String(16), nullable=True)
    now: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC", server_default="UTC")
    status: Mapped[CfPostStatus] = mapped_column(Enum(CfPostStatus, name="cfpoststatus"), nullable=False, default=CfPostStatus.draft, server_default="draft")
    job_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    cancel_from: Mapped[str | None] = mapped_column(String(16), nullable=True)
    bundle_rev: Mapped[str | None] = mapped_column(String(64), nullable=True)
    plan: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    code_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    code_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approval_source: Mapped[str | None] = mapped_column(String(16), nullable=True)
    series_parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("cf_post_packages.id", ondelete="SET NULL"), nullable=True, index=True)
    series_slot: Mapped[str | None] = mapped_column(String(16), nullable=True)
    series_at: Mapped[str | None] = mapped_column(String(16), nullable=True)
    series_owner_edited: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    cta: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CfBridgeOp(Base):
    __tablename__ = "cf_bridge_ops"
    __table_args__ = (Index("ix_cf_bridge_ops_status_created_at", "status", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    package_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cf_post_packages.id", ondelete="CASCADE"), nullable=False, index=True)
    op: Mapped[CfBridgeOpKind] = mapped_column(Enum(CfBridgeOpKind, name="cfbridgeopkind"), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    status: Mapped[CfBridgeOpStatus] = mapped_column(Enum(CfBridgeOpStatus, name="cfbridgeopstatus"), nullable=False, default=CfBridgeOpStatus.queued, server_default="queued")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
