"""Creative Flo feedback requests.

Revision ID: cf09c0d1e2f3
Revises: cf08b9c0d1e2
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "cf09c0d1e2f3"
down_revision = "cf08b9c0d1e2"
branch_labels = None
depends_on = None

source_enum = postgresql.ENUM("app", "flo", "cli", name="cffeedbackrequestsource", create_type=False)
status_enum = postgresql.ENUM("pending", "picked", "cleared", name="cffeedbackrequeststatus", create_type=False)


def upgrade() -> None:
    source_enum.create(op.get_bind(), checkfirst=True)
    status_enum.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "cf_feedback_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("brand", sa.String(64), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("source", source_enum, nullable=False),
        sa.Column("status", status_enum, nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("picked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("cf_feedback_runs.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_cf_feedback_requests_project_id", "cf_feedback_requests", ["project_id"])
    op.create_index("ix_cf_feedback_requests_asset_id", "cf_feedback_requests", ["asset_id"])
    op.create_index("uq_cf_feedback_requests_pending_asset", "cf_feedback_requests", ["asset_id"],
                    unique=True, postgresql_where=sa.text("status = 'pending'"))


def downgrade() -> None:
    op.drop_table("cf_feedback_requests")
    status_enum.drop(op.get_bind(), checkfirst=True)
    source_enum.drop(op.get_bind(), checkfirst=True)
