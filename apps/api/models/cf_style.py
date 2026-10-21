"""Brand editing styles and immutable approval snapshots."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

try:
    from ..database import Base
except ImportError:
    from database import Base


class CfStyle(Base):
    __tablename__ = "cf_styles"
    __table_args__ = (
        UniqueConstraint("brand", "slug", name="uq_cf_styles_brand_slug"),
        Index("uq_cf_styles_default", "brand", unique=True,
              postgresql_where=text("is_default AND archived_at IS NULL")),
        CheckConstraint("origin IN ('interview', 'template', 'copy', 'import')", name="ck_cf_styles_origin"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), index=True)
    brand: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(80))
    slug: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(500), default="", server_default="")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    origin: Mapped[str] = mapped_column(String(16), default="interview", server_default="interview")
    template_key: Mapped[str | None] = mapped_column(ForeignKey("cf_style_templates.key", ondelete="SET NULL"))
    current_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("cf_style_versions.id", ondelete="SET NULL", use_alter=True, name="fk_cf_styles_current_version"))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CfStyleVersion(Base):
    __tablename__ = "cf_style_versions"
    __table_args__ = (
        UniqueConstraint("style_id", "version", name="uq_cf_style_versions_number"),
        CheckConstraint("status IN ('building', 'proposed', 'approved', 'rejected', 'failed')", name="ck_cf_style_versions_status"),
        CheckConstraint("version > 0 AND attempt >= 0", name="ck_cf_style_versions_counters"),
        Index("ix_cf_style_versions_due", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    style_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cf_styles.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="building", server_default="building")
    design_md: Mapped[str] = mapped_column(Text, default="", server_default="")
    style_json: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    skin_css: Mapped[str] = mapped_column(Text, default="", server_default="")
    answers: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    request: Mapped[str | None] = mapped_column(String(4000))
    changelog: Mapped[str] = mapped_column(String(2000), default="", server_default="")
    sample_asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id", ondelete="SET NULL"))
    preview: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    error: Mapped[str | None] = mapped_column(Text)
    attempt: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_try_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CfStyleInterview(Base):
    __tablename__ = "cf_style_interviews"
    __table_args__ = (
        CheckConstraint("mode IN ('new', 'improve')", name="ck_cf_style_interviews_mode"),
        CheckConstraint("status IN ('in_progress', 'submitted', 'built', 'abandoned')", name="ck_cf_style_interviews_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), index=True)
    brand: Mapped[str] = mapped_column(String(64))
    style_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("cf_styles.id", ondelete="SET NULL"))
    mode: Mapped[str] = mapped_column(String(16))
    answers: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    status: Mapped[str] = mapped_column(String(16), default="in_progress", server_default="in_progress")
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CfStyleTemplate(Base):
    __tablename__ = "cf_style_templates"
    __table_args__ = (CheckConstraint("key ~ '^[a-z0-9-]+$'", name="ck_cf_style_templates_key"),)

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    summary: Mapped[str] = mapped_column(String(300))
    best_for: Mapped[str] = mapped_column(String(300))
    why_it_works: Mapped[str] = mapped_column(String(600))
    tags: Mapped[list] = mapped_column(JSONB)
    design_md: Mapped[str] = mapped_column(Text)
    style_json: Mapped[dict] = mapped_column(JSONB)
    preview: Mapped[dict] = mapped_column(JSONB)
    sample_url: Mapped[str | None] = mapped_column(Text)
    sample_s3_key: Mapped[str | None] = mapped_column(Text)
    poster_s3_key: Mapped[str | None] = mapped_column(Text)
    trend_note: Mapped[str | None] = mapped_column(String(600))
    trend_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sort: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))


class CfStyleRecommendation(Base):
    __tablename__ = "cf_style_recommendations"
    __table_args__ = (
        CheckConstraint("kind IN ('template', 'choice', 'improvement')", name="ck_cf_style_recommendations_kind"),
        CheckConstraint("status IN ('open', 'used', 'dismissed')", name="ck_cf_style_recommendations_status"),
        Index("ix_cf_style_recommendations_brand_status", "brand", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    brand: Mapped[str] = mapped_column(String(64))
    interview_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("cf_style_interviews.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(16))
    payload: Mapped[dict] = mapped_column(JSONB)
    reason: Mapped[str] = mapped_column(String(400))
    status: Mapped[str] = mapped_column(String(16), default="open", server_default="open")
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
