"""Creative Flo: default workspace name

Revision ID: cf01a2b3c4d5
Revises: e3f5a7c9d1b2
"""
from alembic import op

revision = "cf01a2b3c4d5"
down_revision = "e3f5a7c9d1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("instance_branding", "org_name", server_default="Creative Flo")


def downgrade() -> None:
    op.alter_column("instance_branding", "org_name", server_default="FreeFrame")
