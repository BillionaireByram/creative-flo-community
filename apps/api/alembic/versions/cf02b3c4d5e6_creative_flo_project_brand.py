"""Creative Flo: projects.cf_brand links a project to its tracker brand

Revision ID: cf02b3c4d5e6
Revises: cf01a2b3c4d5
"""
import sqlalchemy as sa
from alembic import op

revision = "cf02b3c4d5e6"
down_revision = "cf01a2b3c4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("cf_brand", sa.String(length=64), nullable=True))
    op.create_unique_constraint("uq_projects_cf_brand", "projects", ["cf_brand"])


def downgrade() -> None:
    op.drop_constraint("uq_projects_cf_brand", "projects", type_="unique")
    op.drop_column("projects", "cf_brand")
