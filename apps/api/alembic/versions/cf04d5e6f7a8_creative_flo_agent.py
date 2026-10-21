"""Creative Flo brand briefs and agent requests.

Revision ID: cf04d5e6f7a8
Revises: cf03c4d5e6f7
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "cf04d5e6f7a8"
down_revision = "cf03c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    request_status = postgresql.ENUM(
        "queued", "working", "done", "failed", "cancelled",
        name="cfagentrequeststatus", create_type=False,
    )
    request_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "cf_brand_profiles",
        sa.Column("brand", sa.String(64), primary_key=True),
        sa.Column("business", sa.Text(), nullable=False, server_default=""),
        sa.Column("offer", sa.Text(), nullable=False, server_default=""),
        sa.Column("audience", sa.Text(), nullable=False, server_default=""),
        sa.Column("voice", sa.Text(), nullable=False, server_default=""),
        sa.Column("pillars", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("competitors", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("keywords", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "cf_agent_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("brand", sa.String(64), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False, server_default="ideas"),
        sa.Column("prompt", sa.Text(), nullable=False, server_default=""),
        sa.Column("formats", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("count", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("status", request_status, nullable=False, server_default="queued"),
        sa.Column("progress", sa.Text(), nullable=True),
        sa.Column("proposals", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("notified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("claimed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("count BETWEEN 1 AND 12", name="ck_cf_agent_requests_count"),
    )
    op.create_index("ix_cf_agent_requests_project_id", "cf_agent_requests", ["project_id"])
    op.create_index("ix_cf_agent_requests_project_status", "cf_agent_requests", ["project_id", "status"])
    op.create_index("ix_cf_agent_requests_project_created_at", "cf_agent_requests", ["project_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_cf_agent_requests_project_created_at", table_name="cf_agent_requests")
    op.drop_index("ix_cf_agent_requests_project_status", table_name="cf_agent_requests")
    op.drop_index("ix_cf_agent_requests_project_id", table_name="cf_agent_requests")
    op.drop_table("cf_agent_requests")
    op.drop_table("cf_brand_profiles")
    sa.Enum(name="cfagentrequeststatus").drop(op.get_bind(), checkfirst=True)
