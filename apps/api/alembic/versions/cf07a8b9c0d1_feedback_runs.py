"""Creative Flo feedback runs.

Revision ID: cf07a8b9c0d1
Revises: cf06f7a8b9c0
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "cf07a8b9c0d1"
down_revision = "cf06f7a8b9c0"
branch_labels = None
depends_on = None

status_enum = postgresql.ENUM("queued", "working", "done", "failed", "cancelled",
                              name="cffeedbackstatus", create_type=False)


def upgrade() -> None:
    status_enum.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "cf_feedback_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("brand", sa.String(64), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("asset_versions.id"), nullable=False),
        sa.Column("comment_ids", postgresql.JSONB(), nullable=False),
        sa.Column("status", status_enum, nullable=False, server_default="queued"),
        sa.Column("attempt", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("progress", sa.Text(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("new_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("asset_versions.id"), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("claimed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("length(progress) <= 500", name="ck_cf_feedback_runs_progress_length"),
        sa.CheckConstraint("length(summary) <= 2000", name="ck_cf_feedback_runs_summary_length"),
        sa.CheckConstraint("length(error) <= 1000", name="ck_cf_feedback_runs_error_length"),
    )
    op.create_index("ix_cf_feedback_runs_asset_id", "cf_feedback_runs", ["asset_id"])
    op.create_index("ix_cf_feedback_runs_project_id", "cf_feedback_runs", ["project_id"])
    op.create_index("ix_cf_feedback_runs_status_created_at", "cf_feedback_runs", ["status", "created_at"])


def downgrade() -> None:
    op.drop_table("cf_feedback_runs")
    status_enum.drop(op.get_bind(), checkfirst=True)
