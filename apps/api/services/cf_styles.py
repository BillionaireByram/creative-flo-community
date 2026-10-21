"""Transactional Style Studio operations with project membership on every brand path."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import logging
from pathlib import Path
import re
import unicodedata
import uuid

from fastapi import HTTPException
from sqlalchemy import func, or_

from ..config import settings
from ..models.asset import Asset, AssetVersion, MediaFile
from ..models.cf_style import CfStyle, CfStyleVersion, CfStyleInterview, CfStyleTemplate, CfStyleRecommendation
from ..models.project import Project, ProjectMember, ProjectRole
from ..schemas import cf_styles as wire
from . import cf_data, cf_style_templates, event_service, s3_service

log = logging.getLogger(__name__)
LEASE = timedelta(minutes=45)
NO_STYLE = "This brand has no approved style yet"
BUILD_FAILED = "I need you on this one. Please try again or adjust your style choices."
MAX_TEMPLATE_SAMPLE_BYTES = 60 * 1024 * 1024


def now():
    return datetime.now(timezone.utc)


def is_agent(user):
    return (user.email or "").strip().lower() in {
        value.strip().lower() for value in settings.cf_agent_emails.split(",") if value.strip()}


def agent_only(user):
    if not is_agent(user):
        raise HTTPException(403, "Only your editing agent can do this")


def authorize(db, user, brand, owner=False):
    project = cf_data.require_brand(db, user, brand, ProjectRole.owner if owner else ProjectRole.editor)
    if owner and is_agent(user):
        raise HTTPException(403, "An owner must make this change")
    return project


def lock_project(db, project):
    return db.query(Project).filter(Project.id == project.id, Project.deleted_at.is_(None)).with_for_update().populate_existing().one()


def load_style(db, user, id, owner=False, lock=False):
    row = db.query(CfStyle).filter(CfStyle.id == id, CfStyle.archived_at.is_(None)).first()
    if row is None:
        raise HTTPException(404, "Style not found")
    project = authorize(db, user, row.brand, owner)
    if project.id != row.project_id:
        raise HTTPException(404, "Style not found")
    if lock:
        lock_project(db, project)
        row = db.query(CfStyle).filter(CfStyle.id == id, CfStyle.archived_at.is_(None)).with_for_update().populate_existing().first()
        if row is None:
            raise HTTPException(404, "Style not found")
    return row


def load_version(db, user, id, owner=False, lock=False):
    row = db.query(CfStyleVersion).filter(CfStyleVersion.id == id).first()
    if row is None:
        raise HTTPException(404, "Style version not found")
    style = load_style(db, user, row.style_id, owner, lock)
    if lock:
        row = db.query(CfStyleVersion).filter(CfStyleVersion.id == id).with_for_update().populate_existing().one()
    return style, row


def publish(project_id, brand, style_id=None):
    try:
        event_service.publish_sync(str(project_id), "cf_style_updated", {
            "brand": brand, "style_id": str(style_id) if style_id else None})
    except Exception:
        log.warning("Style update could not be delivered")


def publish_library(db):
    for project in db.query(Project).filter(Project.deleted_at.is_(None), Project.cf_brand.isnot(None)).all():
        publish(project.id, project.cf_brand)


def notify(payload):
    """Style work is polled by the local editing agent; no outbound webhook is sent."""
    return False


def payload(style, version, event, mode=None):
    data = {"event": "creative_flo." + event, "brand": style.brand,
            "style_id": str(style.id), "version_id": str(version.id),
            "app_url": settings.frontend_url.rstrip("/") + f"/{style.brand}/style/{style.id}"}
    if event == "style_build_requested":
        data["mode"] = mode
    else:
        data.update(name=style.name, changelog=version.changelog)
    return data


def save(db, style, notification=None, changed=()):
    style.updated_at = now()
    db.commit()
    for row in (*changed, style):
        publish(row.project_id, row.brand, row.id)
    if notification:
        notify(notification)


def sample_url(db, row):
    if row.sample_asset_id is None:
        return None
    file = (db.query(MediaFile).join(AssetVersion, MediaFile.version_id == AssetVersion.id)
            .join(Asset, AssetVersion.asset_id == Asset.id)
            .filter(Asset.id == row.sample_asset_id, Asset.deleted_at.is_(None),
                    AssetVersion.deleted_at.is_(None), AssetVersion.processing_status == "ready", MediaFile.file_type == "video")
            .order_by(AssetVersion.version_number.desc()).first())
    if file is None:
        return None
    from .s3_service import generate_presigned_get_url
    try:
        # MP4 is directly playable. A processed HLS playlist requires the stream proxy.
        return generate_presigned_get_url(file.s3_key_download or file.s3_key_raw)
    except Exception:
        log.warning("Style sample preview is temporarily unavailable")
        return None


def version_wire(db, row):
    # Keep diagnostic details in storage, away from owner-facing responses.
    error = None if row.status == "building" else BUILD_FAILED if row.status == "failed" else row.error
    return wire.Version.model_validate(row).model_copy(update={"sample_url": sample_url(db, row), "error": error})


def approved(db, style):
    if not style.current_version_id:
        return None
    return db.query(CfStyleVersion).filter(CfStyleVersion.id == style.current_version_id,
        CfStyleVersion.style_id == style.id, CfStyleVersion.status == "approved").first()


def style_wire(db, style, detail=False):
    versions = db.query(CfStyleVersion).filter(CfStyleVersion.style_id == style.id).order_by(CfStyleVersion.version.desc()).all()
    current = next((row for row in versions if row.id == style.current_version_id and row.status == "approved"), None)
    data = wire.Style.model_validate(style).model_dump()
    data.update(current_version=version_wire(db, current) if current else None,
                # A proposal older than the approved version can no longer replace it, so it is not waiting on the owner.
                open_proposals=sum(row.status == "proposed" and row.version > (current.version if current else 0) for row in versions),
                building_count=sum(row.status == "building" for row in versions))
    if detail:
        return wire.StyleDetail(**data, versions=[version_wire(db, row) for row in versions])
    return wire.Style(**data)


def list_styles(db, user, brand):
    project = authorize(db, user, brand)
    rows = db.query(CfStyle).filter(CfStyle.project_id == project.id, CfStyle.brand == brand,
        CfStyle.archived_at.is_(None)).order_by(CfStyle.is_default.desc(), CfStyle.created_at).all()
    return [style_wire(db, row) for row in rows]


def slugify(name):
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")[:80] or "my-style"


def create_row(db, user, project, name, origin="interview", template_key=None):
    # All callers hold the project lock, including interview submission and import.
    base = slugify(name)
    slug, suffix = base, 2
    while db.query(CfStyle.id).filter(CfStyle.brand == project.cf_brand, CfStyle.slug == slug).first():
        slug, suffix = f"{base}-{suffix}", suffix + 1
    first = db.query(CfStyle.id).filter(CfStyle.brand == project.cf_brand, CfStyle.is_default.is_(True),
                                      CfStyle.archived_at.is_(None)).first() is None
    row = CfStyle(project_id=project.id, brand=project.cf_brand, name=name, slug=slug,
                  origin=origin, template_key=template_key, created_by=user.id, is_default=first)
    db.add(row)
    db.flush()
    return row


def new_version(db, user, style, **fields):
    # The parent lock serializes allocation, including rejected and failed versions.
    number = db.query(func.max(CfStyleVersion.version)).filter(CfStyleVersion.style_id == style.id).scalar() or 0
    row = CfStyleVersion(style_id=style.id, version=number + 1, created_by=user.id, **fields)
    db.add(row)
    db.flush()
    return row


def template_row(db, key):
    row = db.query(CfStyleTemplate).filter(CfStyleTemplate.key == key, CfStyleTemplate.active.is_(True)).first()
    if row is None:
        raise HTTPException(404, "Template not found")
    return row


def snapshot(row):
    return {key: deepcopy(getattr(row, key)) for key in ("design_md", "style_json", "skin_css", "answers", "preview", "sample_asset_id")}


def create(db, user, body):
    project = lock_project(db, authorize(db, user, body.brand, owner=True))
    template = template_row(db, body.from_template) if body.from_template else None
    source = None
    if body.copy_of:
        parent = load_style(db, user, body.copy_of)
        if parent.project_id != project.id:
            raise HTTPException(422, "Choose a style from this brand")
        source = approved(db, parent)
        if source is None:
            source = db.query(CfStyleVersion).filter(CfStyleVersion.style_id == parent.id,
                CfStyleVersion.status == "proposed").order_by(CfStyleVersion.version.desc()).first()
        if source is None:
            raise HTTPException(409, "This style has no version to copy yet")
    style = create_row(db, user, project, body.name,
                       "template" if template else "copy" if source else "interview", template.key if template else None)
    if template:
        new_version(db, user, style, status="proposed", design_md=template.design_md, style_json=deepcopy(template.style_json),
                    preview=deepcopy(template.preview), answers=merge_answers({}, {"ratings": {f"tmpl-{template.key}": "love"}}),
                    changelog="Started from " + template.name)
    elif source:
        new_version(db, user, style, status="proposed", **snapshot(source), changelog="Copied from another style")
    save(db, style)
    return style_wire(db, style)


def patch(db, user, id, body):
    style = load_style(db, user, id, owner=True, lock=True)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(style, key, value)
    save(db, style)
    return style_wire(db, style)


def flip_default(db, style):
    others = db.query(CfStyle).filter(CfStyle.brand == style.brand, CfStyle.id != style.id,
        CfStyle.is_default.is_(True), CfStyle.archived_at.is_(None)).all()
    for row in others:
        row.is_default = False
        row.updated_at = now()
    # Release the unique slot before assigning it to the next style.
    db.flush()
    style.is_default = True
    return others


def set_default(db, user, id):
    style = load_style(db, user, id, owner=True, lock=True)
    if approved(db, style) is None:
        raise HTTPException(409, "Approve a version before making this your default")
    changed = flip_default(db, style)
    save(db, style, changed=changed)
    return style_wire(db, style)


def archive(db, user, id):
    style = load_style(db, user, id, owner=True, lock=True)
    if style.is_default:
        raise HTTPException(409, "Choose another default before archiving this style")
    style.archived_at = now()
    save(db, style)
    return style_wire(db, style)


def improve(db, user, id, body):
    # The owner's agent may ask for a change on their behalf (texted "bigger captions"); the new version is only
    # a proposal and still needs the owner's approval before any edit uses it.
    style = load_style(db, user, id, owner=not is_agent(user), lock=True)
    base = approved(db, style)
    if base is None:
        raise HTTPException(409, "Approve this style before requesting an improvement")
    row = new_version(db, user, style, status="building", answers=deepcopy(base.answers), request=body.request)
    save(db, style, payload(style, row, "style_build_requested", "improve"))
    return version_wire(db, row)


def expect_status(row, *allowed):
    if row.status not in allowed:
        raise HTTPException(409, "This style version cannot be changed right now")


def approve(db, user, id):
    style, row = load_version(db, user, id, owner=True, lock=True)
    current = approved(db, style)
    if current and current.version > row.version:
        raise HTTPException(409, "Restore this older version to propose it again")
    if row.status == "approved" and style.current_version_id == row.id:
        return version_wire(db, row)
    expect_status(row, "proposed")
    row.status, row.approved_by, row.approved_at = "approved", user.id, now()
    style.current_version_id = row.id
    save(db, style)
    return version_wire(db, row)


def reject(db, user, id, body):
    style, row = load_version(db, user, id, owner=True, lock=True)
    expect_status(row, "proposed")
    row.status = "rejected"
    if body.note:
        row.error = body.note
    save(db, style)
    return version_wire(db, row)


def restore(db, user, id):
    style, old = load_version(db, user, id, owner=True, lock=True)
    expect_status(old, "approved")
    row = new_version(db, user, style, status="proposed", **snapshot(old), changelog=f"Restored version {old.version}")
    save(db, style, payload(style, row, "style_proposed"))
    return version_wire(db, row)


def build_item(db, style, row):
    base = db.query(CfStyleVersion).filter(CfStyleVersion.style_id == style.id,
        CfStyleVersion.status == "approved").order_by(CfStyleVersion.version.desc()).first()
    template = db.query(CfStyleTemplate).filter(CfStyleTemplate.key == style.template_key).first() if style.template_key else None
    return wire.BuildItem(version_id=row.id, style_id=style.id, project_id=style.project_id, brand=style.brand,
        style_name=style.name, style_slug=style.slug, version=row.version, mode="improve" if base else "new",
        answers=row.answers, request=row.request, attempt=row.attempt,
        base_version=version_wire(db, base) if base else None, template=template_wire(template) if template else None)


def due(db, user, brand=None, limit=20):
    agent_only(user)
    if brand:
        project_ids = [authorize(db, user, brand).id]
    else:
        project_ids = [row[0] for row in db.query(Project.id).join(ProjectMember, ProjectMember.project_id == Project.id)
            .filter(ProjectMember.user_id == user.id, ProjectMember.deleted_at.is_(None),
                    ProjectMember.role.in_([ProjectRole.owner, ProjectRole.editor]), Project.deleted_at.is_(None),
                    Project.cf_brand.isnot(None)).all()]
    instant = now()
    rows = db.query(CfStyleVersion, CfStyle).join(CfStyle, CfStyleVersion.style_id == CfStyle.id).join(
        Project, Project.id == CfStyle.project_id).filter(Project.cf_brand == CfStyle.brand,
        CfStyle.project_id.in_(project_ids), CfStyle.archived_at.is_(None), CfStyleVersion.status == "building",
        or_(CfStyleVersion.claimed_at.is_(None), CfStyleVersion.claimed_at <= instant - LEASE),
        or_(CfStyleVersion.next_try_at.is_(None), CfStyleVersion.next_try_at <= instant),
    ).order_by(CfStyleVersion.created_at, CfStyleVersion.id).limit(limit).all()
    return [build_item(db, style, row) for row, style in rows]


def claim(db, user, id):
    agent_only(user)
    style, row = load_version(db, user, id, lock=True)
    expect_status(row, "building")
    instant = now()
    if (row.claimed_at and row.claimed_at > instant - LEASE) or (row.next_try_at and row.next_try_at > instant):
        raise HTTPException(409, "This style build is already claimed or waiting to retry")
    row.claimed_at, row.next_try_at = instant, None
    save(db, style)
    return build_item(db, style, row)


def proposed(db, user, id, body):
    agent_only(user)
    style, row = load_version(db, user, id, lock=True)
    expect_status(row, "building")
    if row.next_try_at and row.next_try_at > now():
        raise HTTPException(409, "This style build is waiting to retry")
    if body.sample_asset_id:
        sample = db.query(Asset).filter(Asset.id == body.sample_asset_id, Asset.project_id == style.project_id,
                                       Asset.deleted_at.is_(None), Asset.asset_type == "video").first()
        if sample is None:
            raise HTTPException(422, "Choose a sample video from this brand")
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    row.status, row.error, row.claimed_at, row.next_try_at = "proposed", None, None, None
    # Only the latest submission's matching answers can finish its interview.
    for interview in db.query(CfStyleInterview).filter(CfStyleInterview.style_id == style.id,
            CfStyleInterview.status == "submitted").all():
        if without_progress(interview.answers) == row.answers:
            interview.status = "built"
    save(db, style, payload(style, row, "style_proposed"))
    return version_wire(db, row)


def fail(db, user, id, body):
    agent_only(user)
    style, row = load_version(db, user, id, lock=True)
    expect_status(row, "building")
    if row.next_try_at and row.next_try_at > now():
        raise HTTPException(409, "This style build is waiting to retry")
    row.attempt += 1
    row.claimed_at = None
    row.error = body.error
    if row.attempt < 3:
        row.next_try_at = now() + timedelta(minutes=10)
    else:
        row.status, row.next_try_at = "failed", None
    save(db, style)
    return version_wire(db, row)


def retry(db, user, id):
    style, row = load_version(db, user, id, owner=True, lock=True)
    expect_status(row, "failed")
    row.status, row.attempt, row.claimed_at, row.next_try_at, row.error = "building", 0, None, None, None
    mode = "improve" if approved(db, style) else "new"
    save(db, style, payload(style, row, "style_build_requested", mode))
    return version_wire(db, row)


def without_progress(answers):
    """Where the person stopped is for the web app only; the builder never needs it."""
    return {key: deepcopy(value) for key, value in (answers or {}).items() if key != "progress"}


def merge_answers(previous, patch):
    result = deepcopy(previous or {})
    for section, value in patch.items():
        if section == "version":
            continue
        if section in ("ratings", "notes", "answers"):
            merged = deepcopy(result.get(section) or {})
            for key, answer in value.items():
                if answer is None:
                    merged.pop(key, None)
                else:
                    merged[key] = deepcopy(answer)
            result[section] = merged
        elif value is None:
            result.pop(section, None)
        else:
            result[section] = deepcopy(value)
    for section in ("ratings", "notes", "answers"):
        result.setdefault(section, {})
    result["version"] = "style-lab-v3"
    return result


def interview_create(db, user, body):
    project = authorize(db, user, body.brand, owner=True)
    answers = {}
    if body.style_id:
        style = load_style(db, user, body.style_id)
        if style.project_id != project.id:
            raise HTTPException(422, "Choose a style from this brand")
        last = db.query(CfStyleVersion).filter(CfStyleVersion.style_id == style.id,
            CfStyleVersion.answers.isnot(None)).order_by(CfStyleVersion.version.desc()).first()
        if last:
            answers = last.answers
    row = CfStyleInterview(project_id=project.id, brand=body.brand, style_id=body.style_id,
        mode=body.mode, answers=merge_answers(answers, {}), created_by=user.id)
    db.add(row)
    db.commit()
    publish(row.project_id, row.brand, row.style_id)
    return row


def interview_load(db, user, id, owner=False, lock=False):
    row = db.query(CfStyleInterview).filter(CfStyleInterview.id == id).first()
    if row is None:
        raise HTTPException(404, "Interview not found")
    project = authorize(db, user, row.brand, owner)
    if project.id != row.project_id:
        raise HTTPException(404, "Interview not found")
    if lock:
        lock_project(db, project)
        row = db.query(CfStyleInterview).filter(CfStyleInterview.id == id).with_for_update().populate_existing().one()
    return row


def interview_patch(db, user, id, body):
    row = interview_load(db, user, id, owner=True, lock=True)
    expect_status(row, "in_progress")
    row.answers = merge_answers(row.answers, body.answers.model_dump(exclude_unset=True))
    row.updated_at = now()
    db.commit()
    publish(row.project_id, row.brand, row.style_id)
    return row


def interview_submit(db, user, id):
    interview = interview_load(db, user, id, owner=True, lock=True)
    expect_status(interview, "in_progress")
    if interview.style_id:
        style = load_style(db, user, interview.style_id, owner=True, lock=True)
    else:
        answers = interview.answers.get("answers", {})
        name = answers.get("style_name") or answers.get("brand") or "My style"
        name = name.strip()[:80] if isinstance(name, str) and name.strip() else "My style"
        project = db.query(Project).filter(Project.id == interview.project_id).one()
        style = create_row(db, user, project, name)
        interview.style_id = style.id
    row = new_version(db, user, style, status="building", answers=without_progress(interview.answers))
    interview.status = "submitted"
    save(db, style, payload(style, row, "style_build_requested", interview.mode))
    return {"style_id": style.id, "version_id": row.id}


def active(db, user, brand, asset_id=None):
    project = authorize(db, user, brand)
    if asset_id:
        asset = db.query(Asset).filter(Asset.id == asset_id, Asset.project_id == project.id, Asset.deleted_at.is_(None)).first()
        if asset is None:
            raise HTTPException(404, "Asset not found")
        if asset.cf_style_id:
            style = db.query(CfStyle).filter(CfStyle.id == asset.cf_style_id, CfStyle.project_id == project.id,
                CfStyle.brand == brand, CfStyle.archived_at.is_(None)).first()
            version = approved(db, style) if style else None
            if version:
                return active_wire(style, version, "asset")
    style = db.query(CfStyle).filter(CfStyle.project_id == project.id, CfStyle.brand == brand,
        CfStyle.is_default.is_(True), CfStyle.archived_at.is_(None)).first()
    version = approved(db, style) if style else None
    if version is None:
        raise HTTPException(404, NO_STYLE)
    return active_wire(style, version, "default")


def active_wire(style, version, source):
    return wire.Active(style_id=style.id, name=style.name, slug=style.slug, version_id=version.id,
        version=version.version, design_md=version.design_md, style_json=version.style_json, skin_css=version.skin_css, source=source)


def set_asset_style(db, user, id, body):
    asset = db.query(Asset).filter(Asset.id == id, Asset.deleted_at.is_(None)).first()
    if asset is None:
        raise HTTPException(404, "Asset not found")
    project = db.query(Project).filter(Project.id == asset.project_id, Project.deleted_at.is_(None)).first()
    if not project or not project.cf_brand:
        raise HTTPException(404, "Brand not found")
    authorize(db, user, project.cf_brand, owner=True)
    lock_project(db, project)
    if body.style_id:
        style = load_style(db, user, body.style_id)
        if style.project_id != asset.project_id:
            raise HTTPException(422, "Choose a style from this brand")
        if approved(db, style) is None:
            raise HTTPException(409, "Approve this style before using it for a video")
    previous = asset.cf_style_id
    asset.cf_style_id = body.style_id
    db.commit()
    for style_id in dict.fromkeys((previous, body.style_id)):
        publish(project.id, project.cf_brand, style_id)
    return {"asset_id": asset.id, "style_id": asset.cf_style_id}


def library_access(db, user, brand=None):
    if brand:
        authorize(db, user, brand)
        return
    member = db.query(ProjectMember).join(Project, ProjectMember.project_id == Project.id).filter(
        ProjectMember.user_id == user.id, ProjectMember.deleted_at.is_(None),
        ProjectMember.role.in_([ProjectRole.owner, ProjectRole.editor]), Project.deleted_at.is_(None),
        Project.cf_brand.isnot(None)).first()
    if not member:
        raise HTTPException(403, "Join a brand project to view editing styles")


def template_wire(row):
    urls = {"sample_url": row.sample_url, "poster_url": None}
    for field, key in (("sample_url", row.sample_s3_key), ("poster_url", row.poster_s3_key)):
        if key:
            try:
                urls[field] = s3_service.generate_presigned_get_url(key)
            except Exception:
                urls[field] = None
                log.warning("Template preview is temporarily unavailable")
    return wire.Template.model_validate(row).model_copy(update=urls)


def templates(db, user, brand=None):
    library_access(db, user, brand)
    keys = set()
    if brand:
        recommendations = db.query(CfStyleRecommendation).filter(CfStyleRecommendation.brand == brand,
            CfStyleRecommendation.kind == "template", CfStyleRecommendation.status == "open").all()
        keys = {row.payload.get("template_key") for row in recommendations}
    rows = db.query(CfStyleTemplate).filter(CfStyleTemplate.active.is_(True)).order_by(CfStyleTemplate.sort, CfStyleTemplate.key).all()
    return [template_wire(row).model_copy(update={"recommended_for_brand": row.key in keys} if brand else {}) for row in rows]


def template_get(db, user, key):
    library_access(db, user)
    return template_wire(template_row(db, key))


def template_seed(db, user, body):
    agent_only(user)
    library_access(db, user)
    result = cf_style_templates.upsert_templates(db, body)
    db.commit()
    if result["upserted"]:
        publish_library(db)
    return result


def template_trend(db, user, key, body):
    agent_only(user)
    library_access(db, user)
    row = db.query(CfStyleTemplate).filter(CfStyleTemplate.key == key).with_for_update().first()
    if row is None:
        raise HTTPException(404, "Template not found")
    row.trend_note, row.trend_updated_at = body.trend_note, now()
    db.commit()
    publish_library(db)
    return template_wire(row)


def template_media(file, types, label):
    extension = Path(file.filename or "").suffix.lower()
    if extension not in types or file.content_type != types[extension]:
        raise HTTPException(422, f"Use {label}")
    if file.size is not None and file.size > MAX_TEMPLATE_SAMPLE_BYTES:
        raise HTTPException(413, "Preview files must be 60 MB or smaller")
    data = file.file.read(MAX_TEMPLATE_SAMPLE_BYTES + 1)
    if len(data) > MAX_TEMPLATE_SAMPLE_BYTES:
        raise HTTPException(413, "Preview files must be 60 MB or smaller")
    if not data:
        raise HTTPException(422, "Preview files must not be empty")
    return data, ".jpg" if extension == ".jpeg" else extension


def delete_template_media(keys):
    for key in keys:
        if key:
            try:
                s3_service.delete_object(key)
            except Exception:
                log.warning("An unused template preview could not be removed")


def template_sample(db, user, key, file, poster=None):
    agent_only(user)
    library_access(db, user)
    row = db.query(CfStyleTemplate).filter(CfStyleTemplate.key == key).with_for_update().populate_existing().first()
    if row is None:
        raise HTTPException(404, "Template not found")
    video, _ = template_media(file, {".mp4": "video/mp4"}, "an MP4 video")
    image, extension = template_media(poster, {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"},
                                     "a PNG or JPG poster") if poster else (None, None)
    old_keys = (row.sample_s3_key, row.poster_s3_key)
    prefix = f"style-templates/{row.key}/{uuid.uuid4()}"
    sample_key, poster_key = prefix + ".mp4", prefix + extension if image is not None else None
    new_keys = []
    try:
        new_keys.append(sample_key)
        s3_service.put_object(sample_key, video, content_type="video/mp4")
        if poster_key:
            new_keys.append(poster_key)
            s3_service.put_object(poster_key, image, content_type=poster.content_type)
        row.sample_s3_key, row.poster_s3_key = sample_key, poster_key
        db.commit()
    except Exception:
        db.rollback()
        delete_template_media(new_keys)
        log.warning("Template preview could not be saved")
        raise HTTPException(503, "Could not save this preview. Please try again.") from None
    delete_template_media(old_keys)
    publish_library(db)
    return template_wire(row)


def seed(db, user, body):
    agent_only(user)
    project = lock_project(db, authorize(db, user, body.brand))
    existing = db.query(CfStyle).filter(CfStyle.brand == body.brand, CfStyle.slug == slugify(body.name)).first()
    if existing:
        return style_wire(db, existing)
    style = create_row(db, user, project, body.name, "import")
    row = new_version(db, user, style, status="approved", design_md=body.design_md, style_json=body.style_json,
        skin_css=body.skin_css, preview=body.preview, answers=merge_answers({}, body.answers.model_dump()),
        approved_by=user.id, approved_at=now(), changelog="Imported your editing style")
    style.current_version_id = row.id
    changed = flip_default(db, style) if body.make_default else []
    save(db, style, changed=changed)
    return style_wire(db, style)


def recommendations(db, user, brand):
    authorize(db, user, brand)
    return db.query(CfStyleRecommendation).filter(CfStyleRecommendation.brand == brand).order_by(CfStyleRecommendation.created_at.desc()).all()


def recommend(db, user, body):
    agent_only(user)
    project = authorize(db, user, body.brand)
    style_id = None
    if body.interview_id:
        interview = interview_load(db, user, body.interview_id)
        if interview.project_id != project.id:
            raise HTTPException(422, "Choose an interview from this brand")
        style_id = interview.style_id
    if body.kind == "template":
        template_row(db, body.payload["template_key"])
    if body.kind == "improvement":
        style = load_style(db, user, uuid.UUID(body.payload["style_id"]))
        if style.project_id != project.id:
            raise HTTPException(422, "Choose a style from this brand")
        style_id = style.id
    row = CfStyleRecommendation(**body.model_dump(), created_by=user.id)
    db.add(row)
    db.commit()
    publish(project.id, project.cf_brand, style_id)
    return row


def recommendation_action(db, user, id, status):
    row = db.query(CfStyleRecommendation).filter(CfStyleRecommendation.id == id).first()
    if row is None:
        raise HTTPException(404, "Recommendation not found")
    project = authorize(db, user, row.brand, owner=True)
    row = db.query(CfStyleRecommendation).filter(CfStyleRecommendation.id == id).with_for_update().populate_existing().one()
    expect_status(row, "open", status)
    row.status = status
    db.commit()
    publish(project.id, row.brand, row.payload.get("style_id"))
    return row


def validate_snapshot_version(db, project_id, version_id):
    """Allow historical approved versions, including a style since archived by its owner."""
    if version_id is None:
        return None
    row = db.query(CfStyleVersion).join(CfStyle, CfStyleVersion.style_id == CfStyle.id).filter(
        CfStyleVersion.id == version_id, CfStyle.project_id == project_id,
        CfStyleVersion.status == "approved").first()
    if row is None:
        raise HTTPException(422, "Choose an approved style version from this brand")
    return row.id
