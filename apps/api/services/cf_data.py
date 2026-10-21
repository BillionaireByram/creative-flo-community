"""Resolve project-linked editing brands and enforce their membership boundary."""
import re
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..models.project import Project, ProjectMember, ProjectRole
from ..models.user import User
from .permissions import require_project_role

BRAND_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def brand_dir(brand: str) -> Path:
    """Validate a brand slug; retained as the common validation boundary."""
    if not BRAND_RE.fullmatch(brand or ""):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid brand")
    return Path(brand)


def visible_brands(db: Session, user: User) -> list[dict]:
    """Brand-linked projects the user is a member of: [{brand, project_id, project_name, role}]."""
    rows = (
        db.query(Project, ProjectMember)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .filter(ProjectMember.user_id == user.id, ProjectMember.deleted_at.is_(None),
                Project.deleted_at.is_(None), Project.cf_brand.isnot(None))
        .order_by(Project.name)
        .all()
    )
    from ..models.cf_style import CfStyle, CfStyleVersion
    ready = {(row[0], row[1]) for row in db.query(CfStyle.project_id, CfStyle.brand).join(
        CfStyleVersion, CfStyle.current_version_id == CfStyleVersion.id,
    ).filter(CfStyle.project_id.in_([p.id for p, _ in rows]), CfStyle.is_default.is_(True),
             CfStyle.archived_at.is_(None), CfStyleVersion.status == "approved",
             CfStyleVersion.style_id == CfStyle.id).all()} if rows else set()
    return [{"brand": p.cf_brand, "project_id": str(p.id), "project_name": p.name, "role": m.role.value,
             "style_ready": (p.id, p.cf_brand) in ready}
            for p, m in rows]


def require_brand(db: Session, user: User, brand: str, minimum_role: ProjectRole = ProjectRole.viewer) -> Project:
    """The project linked to `brand`, after checking the user's role on it."""
    brand_dir(brand)
    project = db.query(Project).filter(Project.cf_brand == brand, Project.deleted_at.is_(None)).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown brand")
    require_project_role(db, project.id, user, minimum_role)
    return project
