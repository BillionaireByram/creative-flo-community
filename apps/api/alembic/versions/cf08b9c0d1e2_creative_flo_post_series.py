"""Creative Flo video series.

Revision ID: cf08b9c0d1e2
Revises: cf07a8b9c0d1
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "cf08b9c0d1e2"
down_revision = "cf07a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cf_brand_profiles", sa.Column("series", postgresql.JSONB(), nullable=True))
    for column in (
        sa.Column("series_parent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("series_slot", sa.String(16), nullable=True),
        sa.Column("series_at", sa.String(16), nullable=True),
        sa.Column("series_owner_edited", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("cta", sa.String(120), nullable=True),
        sa.Column("approval_source", sa.String(16), nullable=True),
    ):
        op.add_column("cf_post_packages", column)
    op.create_foreign_key("fk_cf_post_packages_series_parent", "cf_post_packages", "cf_post_packages",
                          ["series_parent_id"], ["id"], ondelete="SET NULL")
    op.create_check_constraint("ck_cf_post_packages_series_slot", "cf_post_packages", "series_slot IN ('carousel', 'x_post', 'thread')")
    op.create_check_constraint("ck_cf_post_packages_approval_source", "cf_post_packages", "approval_source IN ('owner', 'series')")
    op.create_index("ix_cf_post_packages_series_parent_id", "cf_post_packages", ["series_parent_id"])
    op.create_index("uq_cf_post_packages_series_slot", "cf_post_packages", ["series_parent_id", "series_slot"],
                    unique=True, postgresql_where=sa.text("series_parent_id IS NOT NULL AND status NOT IN ('cancelled', 'cancelling', 'blocked')"))
    # All approvals predating series came from the existing human-owner lane.
    op.execute("UPDATE cf_post_packages SET approval_source = 'owner' WHERE approved_by IS NOT NULL")


def downgrade() -> None:
    op.drop_index("uq_cf_post_packages_series_slot", table_name="cf_post_packages")
    op.drop_index("ix_cf_post_packages_series_parent_id", table_name="cf_post_packages")
    for name, kind in (("ck_cf_post_packages_series_slot", "check"), ("ck_cf_post_packages_approval_source", "check"),
                       ("fk_cf_post_packages_series_parent", "foreignkey")):
        op.drop_constraint(name, "cf_post_packages", type_=kind)
    for name in ("approval_source", "cta", "series_owner_edited", "series_at", "series_slot", "series_parent_id"):
        op.drop_column("cf_post_packages", name)
    op.drop_column("cf_brand_profiles", "series")
