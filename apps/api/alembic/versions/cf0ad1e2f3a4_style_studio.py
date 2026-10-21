"""Style Studio, interviews, templates and editing provenance.

Revision ID: cf0ad1e2f3a4
Revises: cf09c0d1e2f3
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

revision = "cf0ad1e2f3a4"
down_revision = "cf09c0d1e2f3"
branch_labels = None
depends_on = None


def identifier():
    return sa.Column("id", pg.UUID(as_uuid=True), primary_key=True)


def reference(name, target, nullable=False, ondelete=None):
    return sa.Column(name, pg.UUID(as_uuid=True), sa.ForeignKey(target, ondelete=ondelete), nullable=nullable)


def created():
    return sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def updated():
    return sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def obj(name):
    return sa.Column(name, pg.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb"))


def upgrade():
    op.create_table("cf_style_templates",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("summary", sa.String(300), nullable=False),
        sa.Column("best_for", sa.String(300), nullable=False),
        sa.Column("why_it_works", sa.String(600), nullable=False),
        sa.Column("tags", pg.JSONB(), nullable=False),
        sa.Column("design_md", sa.Text(), nullable=False),
        sa.Column("style_json", pg.JSONB(), nullable=False),
        sa.Column("preview", pg.JSONB(), nullable=False),
        sa.Column("sample_url", sa.Text()),
        sa.Column("trend_note", sa.String(600)),
        sa.Column("trend_updated_at", sa.DateTime(timezone=True)),
        sa.Column("sort", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.CheckConstraint("key ~ '^[a-z0-9-]+$'", name="ck_cf_style_templates_key"))
    op.create_table("cf_styles", identifier(), reference("project_id", "projects.id"),
        sa.Column("brand", sa.String(64), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("description", sa.String(500), nullable=False, server_default=""),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("origin", sa.String(16), nullable=False, server_default="interview"),
        sa.Column("template_key", sa.String(100), sa.ForeignKey("cf_style_templates.key", ondelete="SET NULL")),
        sa.Column("current_version_id", pg.UUID(as_uuid=True)),
        sa.Column("archived_at", sa.DateTime(timezone=True)), reference("created_by", "users.id"), created(), updated(),
        sa.UniqueConstraint("brand", "slug", name="uq_cf_styles_brand_slug"),
        sa.CheckConstraint("origin IN ('interview', 'template', 'copy', 'import')", name="ck_cf_styles_origin"))
    op.create_index("ix_cf_styles_project_id", "cf_styles", ["project_id"])
    op.create_index("uq_cf_styles_default", "cf_styles", ["brand"], unique=True,
                    postgresql_where=sa.text("is_default AND archived_at IS NULL"))
    op.create_table("cf_style_versions", identifier(), reference("style_id", "cf_styles.id", ondelete="CASCADE"),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="building"),
        sa.Column("design_md", sa.Text(), nullable=False, server_default=""), obj("style_json"),
        sa.Column("skin_css", sa.Text(), nullable=False, server_default=""),
        sa.Column("answers", pg.JSONB(), nullable=True), sa.Column("request", sa.String(4000)),
        sa.Column("changelog", sa.String(2000), nullable=False, server_default=""),
        reference("sample_asset_id", "assets.id", nullable=True, ondelete="SET NULL"), obj("preview"),
        sa.Column("error", sa.Text()), sa.Column("attempt", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("claimed_at", sa.DateTime(timezone=True)), sa.Column("next_try_at", sa.DateTime(timezone=True)),
        reference("created_by", "users.id"), reference("approved_by", "users.id", nullable=True, ondelete="SET NULL"),
        sa.Column("approved_at", sa.DateTime(timezone=True)), created(),
        sa.UniqueConstraint("style_id", "version", name="uq_cf_style_versions_number"),
        sa.CheckConstraint("status IN ('building', 'proposed', 'approved', 'rejected', 'failed')", name="ck_cf_style_versions_status"),
        sa.CheckConstraint("version > 0 AND attempt >= 0", name="ck_cf_style_versions_counters"))
    op.create_index("ix_cf_style_versions_style_id", "cf_style_versions", ["style_id"])
    op.create_index("ix_cf_style_versions_due", "cf_style_versions", ["status", "created_at"])
    op.create_foreign_key("fk_cf_styles_current_version", "cf_styles", "cf_style_versions", ["current_version_id"], ["id"], ondelete="SET NULL")
    op.create_table("cf_style_interviews", identifier(), reference("project_id", "projects.id"),
        sa.Column("brand", sa.String(64), nullable=False), reference("style_id", "cf_styles.id", nullable=True, ondelete="SET NULL"),
        sa.Column("mode", sa.String(16), nullable=False), obj("answers"),
        sa.Column("status", sa.String(16), nullable=False, server_default="in_progress"),
        reference("created_by", "users.id"), created(), updated(),
        sa.CheckConstraint("mode IN ('new', 'improve')", name="ck_cf_style_interviews_mode"),
        sa.CheckConstraint("status IN ('in_progress', 'submitted', 'built', 'abandoned')", name="ck_cf_style_interviews_status"))
    op.create_index("ix_cf_style_interviews_project_id", "cf_style_interviews", ["project_id"])
    op.create_table("cf_style_recommendations", identifier(), sa.Column("brand", sa.String(64), nullable=False),
        reference("interview_id", "cf_style_interviews.id", nullable=True, ondelete="SET NULL"),
        sa.Column("kind", sa.String(16), nullable=False), sa.Column("payload", pg.JSONB(), nullable=False),
        sa.Column("reason", sa.String(400), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="open"), reference("created_by", "users.id"), created(),
        sa.CheckConstraint("kind IN ('template', 'choice', 'improvement')", name="ck_cf_style_recommendations_kind"),
        sa.CheckConstraint("status IN ('open', 'used', 'dismissed')", name="ck_cf_style_recommendations_status"))
    op.create_index("ix_cf_style_recommendations_brand_status", "cf_style_recommendations", ["brand", "status"])
    for table, column, target in (("assets", "cf_style_id", "cf_styles"),
                                   ("cf_feedback_runs", "style_version_id", "cf_style_versions"),
                                   ("cf_post_packages", "style_version_id", "cf_style_versions")):
        op.add_column(table, sa.Column(column, pg.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(f"fk_{table}_{column}", table, target, [column], ["id"], ondelete="SET NULL")


def downgrade():
    for table, column in (("cf_post_packages", "style_version_id"), ("cf_feedback_runs", "style_version_id"), ("assets", "cf_style_id")):
        op.drop_constraint(f"fk_{table}_{column}", table, type_="foreignkey")
        op.drop_column(table, column)
    op.drop_table("cf_style_recommendations")
    op.drop_table("cf_style_interviews")
    op.drop_constraint("fk_cf_styles_current_version", "cf_styles", type_="foreignkey")
    op.drop_table("cf_style_versions")
    op.drop_table("cf_styles")
    op.drop_table("cf_style_templates")
