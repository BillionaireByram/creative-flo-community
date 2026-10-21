"""Creative Flo posting packages and engine bridge queue.

Revision ID: cf05e6f7a8b9
Revises: cf04d5e6f7a8
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "cf05e6f7a8b9"
down_revision = "cf04d5e6f7a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    source = postgresql.ENUM("asset", "idea", name="cfpostsource", create_type=False)
    kind = postgresql.ENUM("video", "text", name="cfpostkind", create_type=False)
    status = postgresql.ENUM("draft", "preparing", "awaiting_code", "approving", "scheduled", "posted",
                             "failed", "cancelling", "cancelled", "blocked", name="cfpoststatus", create_type=False)
    op_kind = postgresql.ENUM("prepare", "approve", "reissue", "cancel", "refresh", name="cfbridgeopkind", create_type=False)
    op_status = postgresql.ENUM("queued", "claimed", "done", "failed", name="cfbridgeopstatus", create_type=False)
    for enum in (source, kind, status, op_kind, op_status):
        enum.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "cf_post_packages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("brand", sa.String(64), nullable=False),
        sa.Column("source", source, nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=True),
        sa.Column("version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("asset_versions.id"), nullable=True),
        sa.Column("idea_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("cf_ideas.id"), nullable=True),
        sa.Column("kind", kind, nullable=False),
        sa.Column("title", sa.String(200), nullable=False, server_default=""),
        sa.Column("caption", sa.Text(), nullable=False, server_default=""),
        sa.Column("thread", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("x_post", sa.Text(), nullable=False, server_default=""),
        sa.Column("carousel", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("platforms", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("at", sa.String(16), nullable=True),
        sa.Column("now", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="UTC"),
        sa.Column("status", status, nullable=False, server_default="draft"),
        sa.Column("job_id", sa.String(16), nullable=True),
        sa.Column("cancel_from", sa.String(16), nullable=True),
        sa.Column("bundle_rev", sa.String(64), nullable=True),
        sa.Column("plan", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("code_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("code_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_cf_post_packages_project_id", "cf_post_packages", ["project_id"])
    op.create_index("ix_cf_post_packages_project_status", "cf_post_packages", ["project_id", "status"])
    op.create_index("ix_cf_post_packages_project_created_at", "cf_post_packages", ["project_id", "created_at"])
    op.create_index("uq_cf_post_packages_live_asset", "cf_post_packages", ["asset_id"], unique=True,
                    postgresql_where=sa.text("asset_id IS NOT NULL AND status NOT IN ('posted', 'cancelled')"))
    op.create_table(
        "cf_bridge_ops",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("package_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("cf_post_packages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("op", op_kind, nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", op_status, nullable=False, server_default="queued"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_cf_bridge_ops_package_id", "cf_bridge_ops", ["package_id"])
    op.create_index("ix_cf_bridge_ops_status_created_at", "cf_bridge_ops", ["status", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_cf_bridge_ops_status_created_at", table_name="cf_bridge_ops")
    op.drop_index("ix_cf_bridge_ops_package_id", table_name="cf_bridge_ops")
    op.drop_table("cf_bridge_ops")
    for name in ("uq_cf_post_packages_live_asset", "ix_cf_post_packages_project_created_at",
                 "ix_cf_post_packages_project_status", "ix_cf_post_packages_project_id"):
        op.drop_index(name, table_name="cf_post_packages")
    op.drop_table("cf_post_packages")
    for name in ("cfbridgeopstatus", "cfbridgeopkind", "cfpoststatus", "cfpostkind", "cfpostsource"):
        sa.Enum(name=name).drop(op.get_bind(), checkfirst=True)
