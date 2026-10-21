"""Creative Flo posting approval by human owner tap.

Revision ID: cf06f7a8b9c0
Revises: cf05e6f7a8b9
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "cf06f7a8b9c0"
down_revision = "cf05e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE cfpoststatus RENAME VALUE 'awaiting_code' TO 'ready'")
    op.execute("UPDATE cf_post_packages SET cancel_from = 'ready' WHERE cancel_from = 'awaiting_code'")
    op.add_column("cf_post_packages", sa.Column("approved_by", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("cf_post_packages", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key("fk_cf_post_packages_approved_by", "cf_post_packages", "users",
                          ["approved_by"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_cf_post_packages_approved_by", "cf_post_packages", type_="foreignkey")
    op.drop_column("cf_post_packages", "approved_at")
    op.drop_column("cf_post_packages", "approved_by")
    op.execute("UPDATE cf_post_packages SET cancel_from = 'awaiting_code' WHERE cancel_from = 'ready'")
    op.execute("ALTER TYPE cfpoststatus RENAME VALUE 'ready' TO 'awaiting_code'")
