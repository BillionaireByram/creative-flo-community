"""Feedback eligibility and transitions; asset locks serialize claims and completion."""
import logging
import re
import uuid
from collections import defaultdict
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import aliased

from ..config import settings
from ..models.activity import ActivityAction, ActivityLog, Notification, NotificationType
from ..models.asset import Asset, AssetType, AssetVersion, FileType, MediaFile
from ..models.cf_feedback import CfFeedbackRequest, CfFeedbackRun
from ..models.comment import Annotation, Comment
from ..models.folder import Folder
from ..models.project import Project, ProjectMember, ProjectRole
from ..models.user import User
from ..schemas.cf_feedback import FeedbackRunInfo, QueuedRequest, Run, WorkingRequest
from ..schemas.comment import AnnotationResponse
from . import cf_data, event_service
from .permissions import get_project_member, require_project_role
from .versions import next_version_number


RETRY_MINUTES = 10  # transient failures go back in the queue quietly after this long
MAX_ATTEMPTS = 3    # the third failure is the first one B hears about
STATUS_PREFIXES = ("Got it. Working on v", "Got it. Recutting now.", "I couldn't finish this one yet", "I need you on this one")


def _agents():
    return {email.strip().casefold() for email in settings.cf_agent_emails.split(",") if email.strip()}


def _now(db):
    # Unlike transaction_timestamp, this advances even in a long-lived transaction.
    return db.scalar(select(func.clock_timestamp()))


def _projects(db, user, brand, role):
    if brand is not None:
        return [cf_data.require_brand(db, user, brand, role).id]
    visible = cf_data.visible_brands(db, user)
    if role == ProjectRole.editor:
        projects = [uuid.UUID(p["project_id"]) for p in visible if p["role"] in ("owner", "editor")]
        if visible and not projects:
            raise HTTPException(403, "Requires editor role or higher")
        return projects
    return [uuid.UUID(p["project_id"]) for p in visible]


def _asset(db, user, asset_id, role=ProjectRole.editor, lock=False, allow_agent=False):
    query = db.query(Asset).join(Project, Project.id == Asset.project_id).filter(
        Asset.id == asset_id, Asset.deleted_at.is_(None), Project.deleted_at.is_(None))
    asset = (query.with_for_update(of=Asset).populate_existing() if lock else query).first()
    if asset is None:
        raise HTTPException(404, "Asset not found")
    if not (allow_agent and user.email.strip().casefold() in _agents()):
        require_project_role(db, asset.project_id, user, role)
    return asset


def _history(db, asset_ids):
    rows = db.query(CfFeedbackRun).filter(CfFeedbackRun.asset_id.in_(asset_ids)).all()
    history = defaultdict(list)
    for run in rows:
        for cid in run.comment_ids:
            history[cid].append(run)
    return history


def _blocked(runs, now, ignore_retry_delay=False):
    return any(run.status in ("working", "done") or (
        run.status == "failed" and (
            run.attempt >= MAX_ATTEMPTS or (not ignore_retry_delay and (
                run.completed_at is None or now < run.completed_at + timedelta(minutes=RETRY_MINUTES)))
        )) for run in runs)


def _candidates(db, project_ids, asset_id=None, asset_ids=None):
    """Load human notes and their context together; exclude deleted memberships and media."""
    parent = aliased(Comment)
    video_version = aliased(AssetVersion)
    video = db.query(video_version.id).filter(
        video_version.asset_id == Asset.id, video_version.deleted_at.is_(None),
        or_(Asset.asset_type == AssetType.video, db.query(MediaFile.id).filter(
            MediaFile.version_id == video_version.id, MediaFile.file_type == FileType.video).exists()),
    ).exists()
    query = (db.query(Comment, AssetVersion, User, parent.body.label("parent_body"), Annotation)
             .join(Asset, Asset.id == Comment.asset_id)
             .join(AssetVersion, and_(AssetVersion.id == Comment.version_id, AssetVersion.asset_id == Asset.id))
             .join(User, User.id == Comment.author_id)
             .join(ProjectMember, and_(ProjectMember.project_id == Asset.project_id, ProjectMember.user_id == User.id))
             .outerjoin(parent, and_(parent.id == Comment.parent_id, parent.asset_id == Comment.asset_id))
             .outerjoin(Annotation, Annotation.comment_id == Comment.id)
             .filter(Asset.project_id.in_(project_ids), Asset.deleted_at.is_(None), video,
                     AssetVersion.deleted_at.is_(None), Comment.deleted_at.is_(None), Comment.resolved.is_(False),
                     Comment.guest_author_id.is_(None), ProjectMember.deleted_at.is_(None), User.deleted_at.is_(None)))
    agents = _agents()
    if agents:
        query = query.filter(func.lower(func.trim(User.email)).notin_(agents))
    if asset_id is not None:
        query = query.filter(Asset.id == asset_id)
    if asset_ids is not None:
        query = query.filter(Asset.id.in_(asset_ids))
    return query.order_by(Comment.created_at, Comment.id).all()


def _pending(db, asset_id):
    return db.query(CfFeedbackRequest).filter_by(asset_id=asset_id, status="pending").populate_existing().first()


def _lock_comments(db, asset_ids):
    db.query(Comment).filter(Comment.asset_id.in_(asset_ids)).order_by(
        Comment.asset_id, Comment.id).with_for_update().populate_existing().all()


def due(db, user, brand, quiet_min, requested_only=False):
    projects = _projects(db, user, brand, ProjectRole.editor)
    requests = db.query(CfFeedbackRequest).filter(
        CfFeedbackRequest.project_id.in_(projects), CfFeedbackRequest.status == "pending")
    pending_ids = [row[0] for row in requests.with_entities(CfFeedbackRequest.asset_id).all()]
    if requested_only and not pending_ids:
        return []
    if pending_ids:
        # Recheck requests after locking assets so a concurrent claim cannot be cleared.
        db.query(Asset).filter(Asset.id.in_(pending_ids)).order_by(Asset.id).with_for_update().all()
        _lock_comments(db, pending_ids)
    pending = {row.asset_id: row for row in requests.filter(
        CfFeedbackRequest.asset_id.in_(pending_ids)).populate_existing().all()}
    candidates = _candidates(db, projects, asset_ids=list(pending) if requested_only else None)
    history = _history(db, {row[0].asset_id for row in candidates})
    now = _now(db)
    grouped = defaultdict(list)
    for row in candidates:
        if not _blocked(history[str(row[0].id)], now):
            grouped[row[0].asset_id].append(row)
    cleared = []
    for aid in list(pending):
        if aid not in grouped:
            request = pending.pop(aid)
            request.status = "cleared"
            cleared.append(request)
    due_ids = [aid for aid, rows in grouped.items() if aid in pending or (
        not requested_only and max(row[0].created_at for row in rows) <= now - timedelta(minutes=quiet_min))]
    if not due_ids:
        _save_cleared_requests(db, cleared)
        return []
    # Batch the asset metadata and newest versions instead of querying once per note.
    metadata = (db.query(Asset, Project, Folder.name).join(Project, Project.id == Asset.project_id)
                .outerjoin(Folder, and_(Folder.id == Asset.folder_id, Folder.deleted_at.is_(None)))
                .filter(Asset.id.in_(due_ids)).order_by(Asset.created_at, Asset.id).all())
    versions = (db.query(AssetVersion).filter(AssetVersion.asset_id.in_(due_ids), AssetVersion.deleted_at.is_(None))
                .order_by(AssetVersion.version_number.desc()).all())
    latest = {}
    for version in versions:
        latest.setdefault(version.asset_id, version)
    results = []
    for asset, project, folder_name in sorted(metadata, key=lambda row: row[0].id not in pending):
        match = re.match(r"^(CF-[A-Za-z0-9]+)\b", asset.name)
        results.append({
            "asset_id": asset.id, "asset_name": asset.name, "cf_id": match[1] if match else None,
            "project_id": project.id, "project_name": project.name, "folder_name": folder_name,
            "latest_version": {"id": latest[asset.id].id, "number": latest[asset.id].version_number},
            "requested": asset.id in pending,
            "comments": [{
                "id": comment.id, "parent_id": comment.parent_id, "parent_body": parent_body,
                "body": comment.body, "timecode_start": comment.timecode_start, "timecode_end": comment.timecode_end,
                "version_id": version.id, "version_number": version.version_number,
                "annotation": AnnotationResponse.model_validate(annotation) if annotation else None,
                "author_name": author.name, "created_at": comment.created_at,
            } for comment, version, author, parent_body, annotation in grouped[asset.id]],
        })
    _save_cleared_requests(db, cleared)
    return results


def _request_source(user, body):
    if user.email.strip().casefold() in _agents():
        if body.source == "app":
            raise HTTPException(422, "Agent requests must use flo or cli as the source")
        return body.source or "cli"
    return "app"


def _queue_request(db, user, asset, source):
    project = db.get(Project, asset.project_id)
    if not project.cf_brand:
        raise HTTPException(422, "Project has no brand")
    runs = (db.query(CfFeedbackRun).filter(CfFeedbackRun.asset_id == asset.id)
            .order_by(CfFeedbackRun.id).with_for_update().populate_existing().all())
    working = next((run for run in runs if run.status == "working"), None)
    if working:
        return WorkingRequest(run_id=working.id)
    _lock_comments(db, [asset.id])
    now = _now(db)
    eligible = {str(row[0].id) for row in _candidates(db, [asset.project_id], asset.id)
                if not _blocked([run for run in runs if str(row[0].id) in run.comment_ids], now, ignore_retry_delay=True)}
    if not eligible:
        return None
    # Keep failure counts, but release the notes from their retry delay in this transaction.
    for run in runs:
        if run.status == "failed" and run.attempt < MAX_ATTEMPTS and eligible.intersection(run.comment_ids):
            run.completed_at = now - timedelta(minutes=RETRY_MINUTES)
    request = _pending(db, asset.id)
    if request is None:
        request = CfFeedbackRequest(project_id=asset.project_id, brand=project.cf_brand, asset_id=asset.id,
                                    requested_by=user.id, source=source, status="pending", created_at=now)
        db.add(request)
        db.flush()
    return QueuedRequest(request_id=request.id)


def _publish(project_id, events):
    for name, data in events:
        try:
            event_service.publish_sync(str(project_id), name, data)
        except Exception:
            logging.getLogger(__name__).warning("Could not publish feedback update")


def _save_cleared_requests(db, requests):
    if not requests:
        return
    db.commit()
    for request in requests:
        _publish(request.project_id, [("cf_feedback_updated", {
            "asset_id": str(request.asset_id), "request_id": str(request.id), "status": "cleared",
        })])


def _save_requests(db, results):
    db.commit()
    for asset, result in results:
        data = {"asset_id": str(asset.id), "status": result.state}
        if isinstance(result, WorkingRequest):
            data["run_id"] = str(result.run_id)
        else:
            data["request_id"] = str(result.request_id)
        _publish(asset.project_id, [("cf_feedback_updated", data)])


def run_now(db, user, asset_id, body):
    asset = _asset(db, user, asset_id, lock=True, allow_agent=True)
    result = _queue_request(db, user, asset, _request_source(user, body))
    if result is None:
        raise HTTPException(409, "Leave a comment first, then Flo can check it.")
    _save_requests(db, [(asset, result)])
    return result


def run_brand_now(db, user, brand, body):
    if user.email.strip().casefold() in _agents():
        cf_data.brand_dir(brand)
        project = db.query(Project).filter(Project.cf_brand == brand, Project.deleted_at.is_(None)).first()
        if project is None:
            raise HTTPException(404, "Unknown brand")
    else:
        project = cf_data.require_brand(db, user, brand, ProjectRole.owner)
    source = _request_source(user, body)
    assets = (db.query(Asset).filter(Asset.project_id == project.id, Asset.deleted_at.is_(None))
              .order_by(Asset.id).with_for_update().populate_existing().all())
    results, response = [], {"queued": [], "working": [], "nothing": 0}
    for asset in assets:
        result = _queue_request(db, user, asset, source)
        if result is None:
            response["nothing"] += 1
        else:
            results.append((asset, result))
            response[result.state].append(asset.id)
    _save_requests(db, results)
    return response


def _root(db, asset, comment):
    root, visited = comment, {comment.id}
    visibility = comment.visibility
    while root.parent_id and root.parent_id not in visited:
        parent = db.query(Comment).filter(Comment.id == root.parent_id, Comment.asset_id == asset.id).first()
        if parent is None:
            break
        visited.add(parent.id)
        if parent.visibility == "internal":
            visibility = "internal"
        root = parent
    return root, visibility


def _reply(db, asset, comment, user, text, events):
    # Attach to the root so replying to a human reply stays visible in a single thread.
    root, visibility = _root(db, asset, comment)
    reply = Comment(asset_id=asset.id, version_id=root.version_id, parent_id=root.id,
                    author_id=user.id, body=text, visibility=visibility,
                    # Status messages are not actionable feedback, including when an editor calls the API.
                    resolved=True)
    db.add(reply)
    db.flush()
    db.add(ActivityLog(user_id=user.id, asset_id=asset.id, action=ActivityAction.commented))
    # Same access boundary as comment replies: notify the addressed author only while still a member.
    if comment.author_id and comment.author_id != user.id and get_project_member(db, asset.project_id, comment.author_id):
        db.add(Notification(user_id=comment.author_id, type=NotificationType.comment, asset_id=asset.id, comment_id=reply.id))
    events.append(("new_comment", {"asset_id": str(asset.id), "comment_id": str(reply.id), "author": user.name}))


def _save(db, run, events=()):
    db.commit()
    db.refresh(run)
    events = [*events, ("cf_feedback_updated", {"run_id": str(run.id), "asset_id": str(run.asset_id),
                                              "status": getattr(run.status, "value", run.status)})]
    _publish(run.project_id, events)
    return Run.model_validate(run)


def claim(db, user, body):
    asset = _asset(db, user, body.asset_id, lock=True)
    project = db.get(Project, asset.project_id)
    if not project.cf_brand:
        raise HTTPException(422, "Project has no brand")
    # Also lock the notes: resolution/deletion cannot race eligibility validation.
    db.query(Comment).filter(Comment.asset_id == asset.id, Comment.id.in_(body.comment_ids)).order_by(
        Comment.id).with_for_update().populate_existing().all()
    rows = {row[0].id: row for row in _candidates(db, [asset.project_id], asset.id)}
    history, now = _history(db, [asset.id]), _now(db)
    if any(cid not in rows or _blocked(history[str(cid)], now) for cid in body.comment_ids):
        raise HTTPException(409, "One or more comments are not eligible for feedback")
    attempt = 1 + max((run.attempt for cid in body.comment_ids for run in history[str(cid)] if run.status == "failed"), default=0)
    version = max((rows[cid][1] for cid in body.comment_ids), key=lambda v: v.version_number)
    from .cf_styles import validate_snapshot_version
    style_version_id = validate_snapshot_version(db, asset.project_id, body.style_version_id)
    run = CfFeedbackRun(project_id=asset.project_id, brand=project.cf_brand, asset_id=asset.id,
                        version_id=version.id, comment_ids=[str(cid) for cid in body.comment_ids], status="working",
                        attempt=attempt, claimed_by=user.id, claimed_at=now, created_at=now,
                        style_version_id=style_version_id)
    if body.route == "cut":
        run.progress = "Recutting now."
    db.add(run)
    db.flush()
    request = _pending(db, asset.id)
    if request:
        request.status, request.picked_at, request.run_id = "picked", now, run.id
    events = []
    number = next_version_number(db, asset.id)
    for cid in body.comment_ids:
        text = "Got it. Recutting now." if body.route == "cut" else f"Got it. Working on v{number} now."
        _reply(db, asset, rows[cid][0], user, text, events)
    return _save(db, run, events)


def _load(db, user, id, role=ProjectRole.editor):
    run = db.query(CfFeedbackRun).filter(CfFeedbackRun.id == id).first()
    if run is None:
        raise HTTPException(404, "Feedback run not found")
    # Lock order is always asset -> run -> comments, including retries and cancellation.
    asset = _asset(db, user, run.asset_id, role, lock=True)
    run = db.query(CfFeedbackRun).filter(CfFeedbackRun.id == id).with_for_update().populate_existing().one()
    return run, asset


def _working(run):
    if run.status != "working":
        raise HTTPException(409, "Feedback run must be working")


def _comments(db, run):
    return (db.query(Comment).filter(Comment.asset_id == run.asset_id,
                                    Comment.id.in_([uuid.UUID(cid) for cid in run.comment_ids]))
            .order_by(Comment.id).with_for_update().populate_existing().all())


def progress(db, user, id, body):
    run, _ = _load(db, user, id)
    _working(run)
    if body.style_version_id is not None:
        from .cf_styles import validate_snapshot_version
        run.style_version_id = validate_snapshot_version(db, run.project_id, body.style_version_id)
    run.progress = body.note
    return _save(db, run)


def _prune_status_replies(db, asset, comments):
    """Soft-delete earlier agent status replies in these threads, keeping only the current acknowledgement."""
    roots = {_root(db, asset, comment)[0].id for comment in comments}
    agents = _agents()
    if not roots or not agents:
        return
    rows = (db.query(Comment).join(User, User.id == Comment.author_id)
            .filter(Comment.asset_id == asset.id, Comment.parent_id.in_(roots), Comment.deleted_at.is_(None),
                    func.lower(func.trim(User.email)).in_(agents),
                    or_(*[Comment.body.like(prefix + "%") for prefix in STATUS_PREFIXES]))
            .with_for_update(of=Comment).populate_existing().all())
    newest = {}
    for row in rows:
        if row.body.startswith(STATUS_PREFIXES[0]):
            newest[row.parent_id] = max(newest.get(row.parent_id, row.created_at), row.created_at)
    now = _now(db)
    for row in rows:
        if not row.body.startswith(STATUS_PREFIXES[0]) or row.created_at < newest[row.parent_id]:
            row.deleted_at = now


def done(db, user, id, body):
    run, asset = _load(db, user, id)
    if run.status == "done":
        if run.new_version_id != body.version_id:
            raise HTTPException(409, "Feedback run already completed with a different version")
        if body.style_version_id is not None and run.style_version_id != body.style_version_id:
            raise HTTPException(409, "Feedback run already completed with a different style version")
        return Run.model_validate(run)
    _working(run)
    style_version_id = run.style_version_id
    if body.style_version_id is not None:
        from .cf_styles import validate_snapshot_version
        style_version_id = validate_snapshot_version(db, run.project_id, body.style_version_id)
    version = db.query(AssetVersion).filter(AssetVersion.id == body.version_id, AssetVersion.asset_id == asset.id,
                                           AssetVersion.deleted_at.is_(None)).first()
    if version is None:
        raise HTTPException(422, "version_id must belong to the same asset")
    original = db.get(AssetVersion, run.version_id)
    if version.version_number <= original.version_number:
        raise HTTPException(409, "The completed version must be newer than the feedback version")
    replies = body.replies or {}
    if any(str(cid) not in run.comment_ids for cid in replies):
        raise HTTPException(422, "Replies must address comments in this run")
    run.style_version_id = style_version_id
    events = []
    comments = _comments(db, run)
    _prune_status_replies(db, asset, comments)
    for comment in comments:
        _reply(db, asset, comment, user, replies.get(comment.id, f"Fixed in v{version.version_number}: {body.summary}"), events)
        comment.resolved = True
        events.append(("comment_resolved", {"comment_id": str(comment.id), "resolved": True}))
    review = (db.query(Folder).filter(Folder.project_id == asset.project_id, func.lower(Folder.name) == "review",
                                    Folder.deleted_at.is_(None)).order_by(Folder.created_at, Folder.id).first())
    if review:
        asset.folder_id = review.id
    run.new_version_id, run.summary, run.completed_at, run.status = version.id, body.summary, _now(db), "done"
    # Half-finished uploads from the loop's earlier tries must not linger as phantom versions.
    for stuck in db.query(AssetVersion).filter(
            AssetVersion.asset_id == asset.id, AssetVersion.processing_status == "uploading",
            AssetVersion.created_by == run.claimed_by, AssetVersion.version_number > original.version_number,
            AssetVersion.id != version.id, AssetVersion.deleted_at.is_(None)).all():
        stuck.deleted_at = run.completed_at
    return _save(db, run, events)


def fail(db, user, id, body):
    run, asset = _load(db, user, id)
    if run.status == "failed":
        return Run.model_validate(run)
    _working(run)
    events = []
    if body.terminal:
        run.attempt = MAX_ATTEMPTS
    # Transient failures are invisible; only the last attempt asks B for help.
    if run.attempt >= MAX_ATTEMPTS:
        for comment in _comments(db, run):
            _reply(db, asset, comment, user, f"I need you on this one: {body.error}", events)
    run.error, run.completed_at, run.status = body.error, _now(db), "failed"
    return _save(db, run, events)


def retry_now(db, user, id):
    run, _ = _load(db, user, id, ProjectRole.viewer)
    member = get_project_member(db, run.project_id, user.id)
    agent = user.email.strip().casefold() in _agents()
    if not agent and run.claimed_by != user.id and member.role != ProjectRole.owner:
        raise HTTPException(403, "Only the project owner or the agent can retry a feedback run")
    if run.status != "failed":
        raise HTTPException(409, "Only a failed feedback run can be retried now")
    if run.attempt >= MAX_ATTEMPTS:
        # A capped run would stay blocked forever; cancelling its failed history returns the notes to the queue
        # with a fresh attempt count.
        ids = set(run.comment_ids)
        for old in db.query(CfFeedbackRun).filter(CfFeedbackRun.asset_id == run.asset_id,
                                                  CfFeedbackRun.status == "failed").with_for_update().all():
            if ids & set(old.comment_ids):
                old.status = "cancelled"
    else:
        run.completed_at = _now(db) - timedelta(minutes=RETRY_MINUTES)
    return _save(db, run)


def cancel(db, user, id):
    run, _ = _load(db, user, id, ProjectRole.viewer)
    member = get_project_member(db, run.project_id, user.id)
    if member.role != ProjectRole.owner and run.claimed_by != user.id:
        raise HTTPException(403, "Only the project owner or claimer can cancel feedback")
    _working(run)
    run.status, run.completed_at = "cancelled", _now(db)
    return _save(db, run)


def list_runs(db, user, brand, asset_id, status, limit):
    projects = _projects(db, user, brand, ProjectRole.viewer)
    if asset_id is not None:
        _asset(db, user, asset_id, ProjectRole.viewer)
    query = db.query(CfFeedbackRun).filter(CfFeedbackRun.project_id.in_(projects))
    if asset_id is not None:
        query = query.filter(CfFeedbackRun.asset_id == asset_id)
    if status is not None:
        query = query.filter(CfFeedbackRun.status == status)
    return query.order_by(CfFeedbackRun.created_at.desc(), CfFeedbackRun.id.desc()).limit(limit).all()


def latest_info(db, asset_id):
    request = _pending(db, asset_id)
    requested_at = request.created_at if request else None
    row = (db.query(CfFeedbackRun, AssetVersion.version_number)
           .outerjoin(AssetVersion, and_(AssetVersion.id == CfFeedbackRun.new_version_id, AssetVersion.deleted_at.is_(None)))
           .filter(CfFeedbackRun.asset_id == asset_id)
           .order_by(CfFeedbackRun.created_at.desc(), CfFeedbackRun.id.desc()).first())
    if row is None:
        return (FeedbackRunInfo(id=None, status="queued", progress=None, attempt=0,
                                new_version_number=None, requested_at=requested_at) if request else None)
    run, number = row
    return FeedbackRunInfo(id=run.id, status=run.status, progress=run.progress, attempt=run.attempt,
                           new_version_number=number, requested_at=requested_at)
