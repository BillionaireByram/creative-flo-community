"""Brand briefs and agent ideation requests."""
import uuid
from datetime import datetime
from enum import Enum as PyEnum
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

try:
    from ..database import Base
except ImportError:
    from database import Base


class CfAgentRequestStatus(str, PyEnum):
    queued = "queued"
    working = "working"
    done = "done"
    failed = "failed"
    cancelled = "cancelled"


class CfBrandProfile(Base):
    __tablename__ = "cf_brand_profiles"

    brand: Mapped[str] = mapped_column(String(64), primary_key=True)
    series: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    business: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    offer: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    audience: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    voice: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    pillars: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    competitors: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    keywords: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CfAgentRequest(Base):
    __tablename__ = "cf_agent_requests"
    __table_args__ = (
        CheckConstraint("count BETWEEN 1 AND 12", name="ck_cf_agent_requests_count"),
        Index("ix_cf_agent_requests_project_status", "project_id", "status"),
        Index("ix_cf_agent_requests_project_created_at", "project_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    brand: Mapped[str] = mapped_column(String(64), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="ideas", server_default="ideas")
    prompt: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    formats: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=6, server_default="6")
    status: Mapped[CfAgentRequestStatus] = mapped_column(Enum(CfAgentRequestStatus, name="cfagentrequeststatus"), nullable=False, default=CfAgentRequestStatus.queued, server_default="queued")
    progress: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    proposals: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    claimed_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
