"""Creative Flo ideas and scripts.

Revision ID: cf03c4d5e6f7
Revises: cf02b3c4d5e6
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "cf03c4d5e6f7"
down_revision = "cf02b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    idea_status = postgresql.ENUM(
        "idea", "scripting", "ready", "shot", "archived",
        name="cfideastatus", create_type=False,
    )
    idea_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "cf_ideas",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("hook", sa.String(500), nullable=True),
        sa.Column("angle", sa.Text(), nullable=True),
        sa.Column("pillar", sa.String(64), nullable=True),
        sa.Column("format", sa.String(64), nullable=True),
        sa.Column("status", idea_status, nullable=False, server_default="idea"),
        sa.Column("script", postgresql.JSONB(), nullable=False, server_default=sa.text("'{\"beats\": [], \"cta\": \"\"}'::jsonb")),
        sa.Column("script_text", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("tracker_cf_id", sa.String(16), nullable=True),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_cf_ideas_project_id", "cf_ideas", ["project_id"])
    op.create_index("ix_cf_ideas_project_status_position", "cf_ideas", ["project_id", "status", "position"])


def downgrade() -> None:
    op.drop_index("ix_cf_ideas_project_status_position", table_name="cf_ideas")
    op.drop_index("ix_cf_ideas_project_id", table_name="cf_ideas")
    op.drop_table("cf_ideas")
    sa.Enum(name="cfideastatus").drop(op.get_bind(), checkfirst=True)
