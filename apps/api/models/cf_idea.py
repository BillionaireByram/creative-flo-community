"""Brand-scoped content ideas and shooting scripts."""
import uuid
from datetime import datetime
from enum import Enum as PyEnum
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

try:
    from ..database import Base
except ImportError:
    from database import Base


class CfIdeaStatus(str, PyEnum):
    idea = "idea"
    scripting = "scripting"
    ready = "ready"
    shot = "shot"
    archived = "archived"


class CfIdea(Base):
    __tablename__ = "cf_ideas"
    __table_args__ = (
        Index("ix_cf_ideas_project_status_position", "project_id", "status", "position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    hook: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    angle: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pillar: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    format: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[CfIdeaStatus] = mapped_column(Enum(CfIdeaStatus, name="cfideastatus"), nullable=False, default=CfIdeaStatus.idea, server_default="idea")
    script: Mapped[dict] = mapped_column(JSONB, nullable=False, default=lambda: {"beats": [], "cta": ""}, server_default=text("'{\"beats\": [], \"cta\": \"\"}'::jsonb"))
    script_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tracker_cf_id: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    asset_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
