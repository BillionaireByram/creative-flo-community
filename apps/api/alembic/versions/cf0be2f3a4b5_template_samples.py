"""Store rendered template samples and posters.

Revision ID: cf0be2f3a4b5
Revises: cf0ad1e2f3a4
"""
from alembic import op
import sqlalchemy as sa

revision = "cf0be2f3a4b5"
down_revision = "cf0ad1e2f3a4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("cf_style_templates", sa.Column("sample_s3_key", sa.Text(), nullable=True))
    op.add_column("cf_style_templates", sa.Column("poster_s3_key", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("cf_style_templates", "poster_s3_key")
    op.drop_column("cf_style_templates", "sample_s3_key")
