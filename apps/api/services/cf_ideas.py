"""Permissions, ordering, and canonical script handling for Creative Flo ideas."""
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from ..models.asset import Asset
from ..models.cf_idea import CfIdea, CfIdeaStatus
from ..models.project import Project, ProjectRole
from ..models.user import User
from ..schemas.cf_ideas import Idea, IdeaCreate, IdeaUpdate
from .cf_data import require_brand
from .permissions import require_project_role


def normalize_script(script) -> dict:
    """Return fresh, canonical JSON even for malformed legacy stored values."""
    source = script if isinstance(script, dict) else {}
    raw_beats = source.get("beats")
    beats = []
    seen = set()
    for raw in raw_beats if isinstance(raw_beats, list) else []:
        beat = raw if isinstance(raw, dict) else {}
        beat_id = beat.get("id")
        beat_id = beat_id.strip() if isinstance(beat_id, str) else ""
        if not beat_id or beat_id in seen:
            beat_id = uuid.uuid4().hex[:12]
        seen.add(beat_id)
        broll = beat.get("broll")
        beats.append({
            "id": beat_id,
            "text": beat.get("text") if isinstance(beat.get("text"), str) else "",
            "broll": broll if isinstance(broll, str) and broll.strip() else None,
        })
    return {"beats": beats, "cta": source.get("cta") if isinstance(source.get("cta"), str) else ""}


def teleprompter_text(hook, script, script_text) -> str:
    if isinstance(script_text, str) and script_text.strip():
        return script_text
    normalized = normalize_script(script)
    parts = [hook, *(beat["text"] for beat in normalized["beats"]), normalized["cta"]]
    return "\n\n".join(part.strip() for part in parts if isinstance(part, str) and part.strip())


def _response(idea: CfIdea, brand: str | None) -> Idea:
    script = normalize_script(idea.script)
    fields = {name: getattr(idea, name) for name in Idea.model_fields
              if name not in {"brand", "script", "teleprompter_text"}}
    return Idea(**fields, brand=brand, script=script,
                teleprompter_text=teleprompter_text(idea.hook, script, idea.script_text))


def _load(db: Session, user: User, idea_id: uuid.UUID, role: ProjectRole, *, lock=False) -> CfIdea:
    query = (db.query(CfIdea).join(Project, Project.id == CfIdea.project_id)
             .filter(CfIdea.id == idea_id, CfIdea.deleted_at.is_(None), Project.deleted_at.is_(None)))
    if lock:
        query = query.with_for_update()
    idea = query.first()
    if idea is None:
        raise HTTPException(status_code=404, detail="Idea not found")
    require_project_role(db, idea.project_id, user, role)
    return idea


def _project(db: Session, project_id: uuid.UUID, *, lock=False) -> Project:
    query = db.query(Project).filter(Project.id == project_id, Project.deleted_at.is_(None))
    # Serialize column appends within a project, including simultaneous creates.
    return (query.with_for_update() if lock else query).one()


def _next_position(db: Session, project_id: uuid.UUID, status: CfIdeaStatus) -> int:
    maximum = db.query(func.max(CfIdea.position)).filter(
        CfIdea.project_id == project_id, CfIdea.status == status, CfIdea.deleted_at.is_(None),
    ).scalar()
    return 0 if maximum is None else maximum + 1


def list_ideas(db: Session, user: User, brand: str, status: CfIdeaStatus | None = None) -> list[Idea]:
    project = require_brand(db, user, brand, ProjectRole.viewer)
    query = db.query(CfIdea).filter(CfIdea.project_id == project.id, CfIdea.deleted_at.is_(None))
    if status is not None:
        query = query.filter(CfIdea.status == status)
    status_order = case(
        *((CfIdea.status == value, index) for index, value in enumerate(CfIdeaStatus)),
        else_=len(CfIdeaStatus),
    )
    return [_response(idea, project.cf_brand) for idea in query.order_by(
        status_order, CfIdea.position, CfIdea.created_at, CfIdea.id,
    ).all()]


def create_idea(db: Session, user: User, body: IdeaCreate) -> Idea:
    project = require_brand(db, user, body.brand, ProjectRole.editor)
    project = _project(db, project.id, lock=True)
    fields = body.model_dump(exclude={"brand"})
    fields["script"] = normalize_script(fields.get("script"))
    idea = CfIdea(**fields, project_id=project.id, created_by=user.id,
                  position=_next_position(db, project.id, body.status))
    db.add(idea)
    db.commit()
    db.refresh(idea)
    return _response(idea, project.cf_brand)


def get_idea(db: Session, user: User, idea_id: uuid.UUID) -> Idea:
    idea = _load(db, user, idea_id, ProjectRole.viewer)
    return _response(idea, _project(db, idea.project_id).cf_brand)


def update_idea(db: Session, user: User, idea_id: uuid.UUID, body: IdeaUpdate) -> Idea:
    idea = _load(db, user, idea_id, ProjectRole.editor, lock=True)
    fields = body.model_dump(exclude_unset=True)
    moving = "status" in fields and fields["status"] != idea.status and "position" not in fields
    # Only a column move appends (and so needs the project lock); autosave edits stay lock-light.
    project = _project(db, idea.project_id, lock=moving)
    if fields.get("asset_id") is not None:
        asset = db.query(Asset).filter(Asset.id == fields["asset_id"], Asset.deleted_at.is_(None)).first()
        if asset is None:
            raise HTTPException(status_code=400, detail="Asset not found")
        if asset.project_id != idea.project_id:
            raise HTTPException(status_code=400, detail="Asset belongs to another project")
    if "script" in fields:
        fields["script"] = normalize_script(fields["script"])
    if moving:
        fields["position"] = _next_position(db, idea.project_id, fields["status"])
    for key, value in fields.items():
        setattr(idea, key, value)
    idea.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(idea)
    return _response(idea, project.cf_brand)


def delete_idea(db: Session, user: User, idea_id: uuid.UUID) -> None:
    idea = _load(db, user, idea_id, ProjectRole.editor, lock=True)
    idea.deleted_at = idea.updated_at = datetime.now(timezone.utc)
    db.commit()
