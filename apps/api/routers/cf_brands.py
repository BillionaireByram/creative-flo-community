"""Creative Flo: the brands (brand-linked projects) the current user can see, and linking a project to one."""
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.auth import get_current_user
from ..models.project import Project, ProjectRole
from ..models.user import User
from ..services.cf_data import BRAND_RE, visible_brands
from ..services.permissions import require_project_role

router = APIRouter(prefix="/cf", tags=["creative-flo"])


class BrandLink(BaseModel):
    brand: str | None


@router.get("/brands")
def list_brands(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return visible_brands(db, current_user)


@router.put("/projects/{project_id}/brand")
def set_project_brand(project_id: uuid.UUID, body: BrandLink, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    """Instance-admin only: link a project to an editing brand (or unlink with null)."""
    from fastapi import HTTPException
    if not current_user.is_superadmin:
        raise HTTPException(status_code=403, detail="Only an instance admin can link a project to a brand")
    require_project_role(db, project_id, current_user, ProjectRole.owner)
    if body.brand is not None and not BRAND_RE.fullmatch(body.brand):
        raise HTTPException(status_code=400, detail="Invalid brand")
    project = db.query(Project).filter(Project.id == project_id, Project.deleted_at.is_(None)).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    taken = body.brand and db.query(Project).filter(Project.cf_brand == body.brand, Project.id != project_id).first()
    if taken:
        raise HTTPException(status_code=409, detail="Another project already uses that brand")
    project.cf_brand = body.brand
    db.commit()
    return {"project_id": str(project.id), "brand": project.cf_brand}
