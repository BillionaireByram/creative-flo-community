"""Feedback contract on the transactional Postgres fixture (migrate through cf09 first)."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from apps.api.config import settings
from apps.api.models.activity import ActivityLog, Notification
from apps.api.models.asset import Asset, AssetVersion, MediaFile
from apps.api.models.cf_feedback import CfFeedbackRequest, CfFeedbackRun
from apps.api.models.comment import Annotation, Comment
from apps.api.models.folder import Folder
from apps.api.models.project import Project, ProjectMember, ProjectRole
from apps.api.models.user import GuestUser, User
from apps.api.schemas.cf_feedback import RunNow
from apps.api.services import cf_feedback, event_service

ROOT = "/cf/feedback"
RUN_FIELDS = set("id project_id brand asset_id version_id comment_ids status attempt progress summary "
                 "new_version_id error claimed_by created_at claimed_at completed_at".split())


@pytest.fixture
def prep(real_db, monkeypatch):
    monkeypatch.setattr("apps.api.middleware.global_rate_limit.GlobalRateLimitMiddleware._check",
                        lambda self, identity, action, limit: (True, 0))
    users = {role: User(email=f"feedback-{uuid4().hex}@test.local", name=role)
             for role in ("owner", "editor", "reviewer", "viewer", "outsider", "agent")}
    real_db.add_all(users.values())
    real_db.flush()
    project = Project(name="Feedback", cf_brand=f"t{uuid4().hex[:10]}", created_by=users["owner"].id)
    other = Project(name="Other", cf_brand=f"t{uuid4().hex[:10]}", created_by=users["owner"].id)
    real_db.add_all([project, other])
    real_db.flush()
    for p in (project, other):
        real_db.add_all([ProjectMember(project_id=p.id, user_id=users[role.value].id, role=role) for role in ProjectRole])
        real_db.add(ProjectMember(project_id=p.id, user_id=users["agent"].id, role=ProjectRole.editor))
    real_db.flush()
    monkeypatch.setattr(settings, "cf_agent_emails", "  " + users["agent"].email.upper() + ", other-agent@test.local ")
    events, actor = [], {"user": users["agent"]}
    monkeypatch.setattr(event_service, "publish_sync", lambda *args: events.append(args))
    with patch("apps.api.services.s3_service.ensure_bucket_exists"), patch(
        "apps.api.services.s3_service.get_s3_client", return_value=MagicMock(),
    ):
        from fastapi.testclient import TestClient
        from apps.api.main import app
        from apps.api.database import get_db
        from apps.api.middleware.auth import get_current_user

        app.dependency_overrides[get_db] = lambda: real_db
        app.dependency_overrides[get_current_user] = lambda: actor["user"]
        client = TestClient(app)
        try:
            yield SimpleNamespace(client=client, db=real_db, project=project, other=other,
                                  users=users, actor=actor, events=events)
        finally:
            client.close()
            app.dependency_overrides.clear()


def asset(prep, **fields):
    row = Asset(**{"project_id": prep.project.id, "name": "CF-12ab Final.mp4", "asset_type": "video",
                   "created_by": prep.users["owner"].id, **fields})
    prep.db.add(row)
    prep.db.flush()
    return row


def version(prep, clip, number=1, **fields):
    row = AssetVersion(**{"asset_id": clip.id, "version_number": number, "processing_status": "ready",
                          "created_by": prep.users["agent"].id, **fields})
    prep.db.add(row)
    prep.db.flush()
    return row


def comment(prep, clip, v, **fields):
    row = Comment(**{"asset_id": clip.id, "version_id": v.id, "author_id": prep.users["owner"].id,
                     "body": "Tighten the hook", "created_at": datetime.now(timezone.utc) - timedelta(minutes=20),
                     **fields})
    prep.db.add(row)
    prep.db.flush()
    return row


def setup_note(prep):
    clip = asset(prep)
    v = version(prep, clip)
    return clip, v, comment(prep, clip, v)


def due(prep, **params):
    response = prep.client.get(ROOT + "/due", params={"brand": prep.project.cf_brand, **params})
    assert response.status_code == 200, response.text
    return response.json()


def claim_response(prep, clip, *comments):
    return prep.client.post(ROOT + "/runs", json={"asset_id": str(clip.id), "comment_ids": [str(c.id) for c in comments]})


def claim(prep, clip, *comments):
    response = claim_response(prep, clip, *comments)
    assert response.status_code == 200, response.text
    assert set(response.json()) == RUN_FIELDS
    return response.json()


def action(prep, run, name, body=None):
    return prep.client.post(f"{ROOT}/runs/{run['id']}/{name}", **({"json": body} if body is not None else {}))


def replies(prep, clip):
    return prep.db.query(Comment).filter(Comment.asset_id == clip.id, Comment.author_id == prep.users["agent"].id).all()


def test_due_exact_shape_and_eligibility(prep):
    clip, v, note = setup_note(prep)
    note.timecode_start, note.timecode_end = 1.25, 2.5
    human_reply = comment(prep, clip, v, parent_id=note.id, body="And fix the title", author_id=prep.users["viewer"].id)
    prep.db.add(Annotation(comment_id=note.id, drawing_data={"objects": []}, frame_number=30))
    comment(prep, clip, v, author_id=prep.users["agent"].id)
    comment(prep, clip, v, author_id=prep.users["agent"].id, parent_id=note.id)
    comment(prep, clip, v, author_id=prep.users["outsider"].id)
    guest = GuestUser(name="Guest", email=f"{uuid4().hex}@test.local")
    prep.db.add(guest)
    prep.db.flush()
    comment(prep, clip, v, author_id=None, guest_author_id=guest.id)
    comment(prep, clip, v, resolved=True)
    comment(prep, clip, v, deleted_at=datetime.now(timezone.utc))
    # Removed memberships and deleted versions cannot leak into the queue.
    membership = prep.db.query(ProjectMember).filter_by(project_id=prep.project.id, user_id=prep.users["reviewer"].id).one()
    membership.deleted_at = datetime.now(timezone.utc)
    comment(prep, clip, v, author_id=prep.users["reviewer"].id)
    deleted_v = version(prep, clip, 2, deleted_at=datetime.now(timezone.utc))
    comment(prep, clip, deleted_v)
    rows = due(prep)
    assert len(rows) == 1
    row = rows[0]
    assert set(row) == set("asset_id asset_name cf_id project_id project_name folder_name latest_version comments requested".split())
    assert row["requested"] is False
    assert row["cf_id"] == "CF-12ab" and row["latest_version"] == {"id": str(v.id), "number": 1}
    assert row["folder_name"] is None and row["project_id"] == str(prep.project.id)
    notes = {c["id"]: c for c in row["comments"]}
    assert set(notes) == {str(note.id), str(human_reply.id)}
    assert set(notes[str(note.id)]) == set("id parent_id parent_body body timecode_start timecode_end version_id version_number annotation author_name created_at".split())
    assert notes[str(note.id)]["timecode_start"] == 1.25 and notes[str(note.id)]["timecode_end"] == 2.5
    assert notes[str(note.id)]["annotation"]["drawing_data"] == {"objects": []}
    assert notes[str(human_reply.id)]["parent_body"] == note.body
    assert notes[str(human_reply.id)]["parent_id"] == str(note.id)


def test_quiet_window_brand_and_video_versions(prep):
    clip, v, old = setup_note(prep)
    recent = comment(prep, clip, v, created_at=datetime.now(timezone.utc) - timedelta(minutes=2))
    assert due(prep) == []
    assert len(due(prep, quiet_min=0)) == 1
    recent.resolved = True
    other = asset(prep, project_id=prep.other.id, name="Other video")
    comment(prep, other, version(prep, other))
    still = asset(prep, asset_type="image")
    image_v = version(prep, still)
    comment(prep, still, image_v)
    assert [row["asset_id"] for row in due(prep)] == [str(clip.id)]
    assert due(prep, brand=prep.other.cf_brand)[0]["cf_id"] is None
    # A video media version also qualifies even if the asset's original type differs.
    prep.db.add(MediaFile(version_id=image_v.id, file_type="video", original_filename="video.mp4",
                          mime_type="video/mp4", file_size_bytes=10, s3_key_raw="raw/test.mp4"))
    assert {r["asset_id"] for r in due(prep)} == {str(clip.id), str(still.id)}
    no_version = asset(prep)
    assert str(no_version.id) not in {r["asset_id"] for r in due(prep)}
    for quiet in (-1, 241, "no", "1.5"):
        assert prep.client.get(ROOT + "/due", params={"quiet_min": quiet}).status_code == 422


def test_claim_overlap_and_reply_to_thread_root_as_caller(prep):
    clip, v, note = setup_note(prep)
    v2 = version(prep, clip, 2)
    human = comment(prep, clip, v2, parent_id=note.id)
    run = claim(prep, clip, note, human)
    assert run["status"] == "working" and run["attempt"] == 1
    assert run["claimed_by"] == str(prep.users["agent"].id) and run["claimed_at"]
    assert run["version_id"] == str(v2.id) and run["brand"] == prep.project.cf_brand
    messages = replies(prep, clip)
    assert len(messages) == 2
    assert all(c.parent_id == note.id and c.body == "Got it. Working on v3 now." for c in messages)
    assert all(c.version_id == v.id for c in messages)
    assert prep.db.query(ActivityLog).filter_by(asset_id=clip.id).count() == 2
    assert prep.db.query(Notification).filter_by(asset_id=clip.id, user_id=prep.users["owner"].id).count() == 2
    assert claim_response(prep, clip, note).status_code == 409
    assert claim_response(prep, clip, human).status_code == 409
    assert len(replies(prep, clip)) == 2 and due(prep) == []


@pytest.mark.parametrize("kind", ["resolved", "deleted", "agent", "other_asset", "nonmember", "missing", "guest", "not_video"])
def test_ineligible_claim_is_atomic(prep, kind):
    clip, v, valid = setup_note(prep)
    bad = comment(prep, clip, v)
    if kind == "resolved":
        bad.resolved = True
    elif kind == "deleted":
        bad.deleted_at = datetime.now(timezone.utc)
    elif kind == "agent":
        bad.author_id = prep.users["agent"].id
    elif kind == "nonmember":
        bad.author_id = prep.users["outsider"].id
    elif kind == "other_asset":
        other = asset(prep)
        bad = comment(prep, other, version(prep, other))
    elif kind == "guest":
        guest = GuestUser(name="Guest", email=f"{uuid4().hex}@test.local")
        prep.db.add(guest)
        prep.db.flush()
        bad.author_id, bad.guest_author_id = None, guest.id
    elif kind == "not_video":
        clip.asset_type = "image"
    else:
        bad = SimpleNamespace(id=uuid4())
    prep.db.flush()
    assert claim_response(prep, clip, valid, bad).status_code == 409
    assert prep.db.query(CfFeedbackRun).filter_by(asset_id=clip.id).count() == 0
    assert not prep.db.query(Comment).filter(Comment.asset_id == clip.id, Comment.parent_id.isnot(None)).all()


def fail_and_age(prep, run, error, minutes):
    response = action(prep, run, "fail", {"error": error})
    assert response.status_code == 200, response.text
    prep.db.get(CfFeedbackRun, UUID(run["id"])).completed_at = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    return response


def test_failures_are_quiet_until_the_third_attempt(prep):
    clip, v, note = setup_note(prep)
    run = claim(prep, clip, note)
    failed = action(prep, run, "fail", {"error": "Render stopped."})
    assert failed.status_code == 200 and failed.json()["completed_at"]
    assert failed.json()["status"] == "failed" and failed.json()["error"] == "Render stopped."
    assert [c.body for c in replies(prep, clip)] == ["Got it. Working on v2 now."]
    count, event_count = len(replies(prep, clip)), len(prep.events)
    assert action(prep, run, "fail", {"error": "Different"}).json() == failed.json()
    assert len(replies(prep, clip)) == count and len(prep.events) == event_count
    stored = prep.db.get(CfFeedbackRun, UUID(run["id"]))
    stored.completed_at = datetime.now(timezone.utc) - timedelta(minutes=9)
    assert due(prep) == [] and claim_response(prep, clip, note).status_code == 409
    stored.completed_at = datetime.now(timezone.utc) - timedelta(minutes=11)
    assert due(prep)[0]["comments"][0]["id"] == str(note.id)
    second = claim(prep, clip, note)
    assert second["attempt"] == 2
    fail_and_age(prep, second, "Still blocked.", 11)
    assert not any("couldn't finish" in c.body or "need you" in c.body for c in replies(prep, clip))
    third = claim(prep, clip, note)
    assert third["attempt"] == 3
    assert action(prep, third, "fail", {"error": "Gave up."}).status_code == 200
    assert "I need you on this one: Gave up." in [c.body for c in replies(prep, clip)]
    assert sum(c.body.startswith("I need you") for c in replies(prep, clip)) == 1
    prep.db.get(CfFeedbackRun, UUID(third["id"])).completed_at = datetime.now(timezone.utc) - timedelta(days=2)
    assert due(prep) == [] and claim_response(prep, clip, note).status_code == 409


def test_terminal_failure_tells_the_owner_at_once_and_is_not_retried(prep):
    clip, v, note = setup_note(prep)
    run = claim(prep, clip, note)
    text = "Set up your editing style first so I edit in your look"
    failed = action(prep, run, "fail", {"error": text, "terminal": True})
    assert failed.status_code == 200 and failed.json()["status"] == "failed"
    assert sum(c.body == f"I need you on this one: {text}" for c in replies(prep, clip)) == 1
    prep.db.get(CfFeedbackRun, UUID(run["id"])).completed_at = datetime.now(timezone.utc) - timedelta(days=2)
    assert due(prep) == [] and claim_response(prep, clip, note).status_code == 409


def test_retry_now_requeues_failed_runs_immediately(prep):
    clip, v, note = setup_note(prep)
    run = claim(prep, clip, note)
    assert action(prep, run, "retry-now").status_code == 409  # still working
    assert action(prep, run, "fail", {"error": "Render stopped."}).status_code == 200
    assert due(prep) == []
    response = action(prep, run, "retry-now")
    assert response.status_code == 200 and response.json()["status"] == "failed"
    assert due(prep)[0]["comments"][0]["id"] == str(note.id)
    assert claim(prep, clip, note)["attempt"] == 2  # the failure count survives a quick retry


def test_retry_now_releases_a_capped_run_and_checks_permissions(prep):
    clip, v, note = setup_note(prep)
    for _ in range(3):
        run = claim(prep, clip, note)
        fail_and_age(prep, run, "Nope", 11)
    assert due(prep) == []
    for role in ("editor", "viewer", "outsider"):
        prep.actor["user"] = prep.users[role]
        assert action(prep, run, "retry-now").status_code == 403
    prep.actor["user"] = prep.users["owner"]
    response = action(prep, run, "retry-now")
    assert response.status_code == 200 and response.json()["status"] == "cancelled"
    assert due(prep)[0]["comments"][0]["id"] == str(note.id)
    assert claim(prep, clip, note)["attempt"] == 1
    prep.actor["user"] = prep.users["agent"]
    assert action(prep, run, "retry-now").status_code == 409


def test_done_prunes_old_status_replies_and_stuck_uploads(prep):
    clip, v, note = setup_note(prep)
    first = claim(prep, clip, note)
    fail_and_age(prep, first, "x", 11)
    second = claim(prep, clip, note)
    fail_and_age(prep, second, "y", 11)
    third = claim(prep, clip, note)
    assert action(prep, third, "fail", {"error": "z"}).status_code == 200
    prep.db.get(CfFeedbackRun, UUID(third["id"])).status = "cancelled"
    # Real runs happen in separate transactions; give the earlier replies an earlier timestamp.
    for old in replies(prep, clip):
        old.created_at = datetime.now(timezone.utc) - timedelta(hours=1)
    prep.db.flush()
    run = claim(prep, clip, note)
    stuck = version(prep, clip, 2, processing_status="uploading")
    human_stuck = version(prep, clip, 3, processing_status="uploading", created_by=prep.users["owner"].id)
    new = version(prep, clip, 4)
    human = comment(prep, clip, v, parent_id=note.id, body="Got it. Working on v9 by a human", author_id=prep.users["owner"].id)
    assert len(replies(prep, clip)) == 5  # 4 acks + the third attempt's failure reply
    response = action(prep, run, "done", {"version_id": str(new.id), "summary": "Done."})
    assert response.status_code == 200, response.text
    live = [c.body for c in replies(prep, clip) if c.deleted_at is None]
    assert sorted(live) == ["Fixed in v4: Done.", "Got it. Working on v2 now."]
    prep.db.refresh(human)
    assert human.deleted_at is None
    for row in (stuck, human_stuck, new):
        prep.db.refresh(row)
    assert stuck.deleted_at is not None and human_stuck.deleted_at is None and new.deleted_at is None


def test_attempt_uses_max_failed_attempt_across_comments(prep):
    clip, v, note = setup_note(prep)
    second = comment(prep, clip, v)
    for c in (note, second):
        run = claim(prep, clip, c)
        assert action(prep, run, "fail", {"error": "Try later"}).status_code == 200
        prep.db.get(CfFeedbackRun, UUID(run["id"])).completed_at = datetime.now(timezone.utc) - timedelta(hours=2)
    assert claim(prep, clip, note, second)["attempt"] == 2


def test_done_replies_resolves_moves_sse_and_is_idempotent(prep, monkeypatch):
    clip, v, note = setup_note(prep)
    second = comment(prep, clip, v)
    deleted_review = Folder(project_id=prep.project.id, name="Review", created_by=prep.users["owner"].id,
                            deleted_at=datetime.now(timezone.utc))
    review = Folder(project_id=prep.project.id, name="rEvIeW", created_by=prep.users["owner"].id)
    prep.db.add_all([deleted_review, review])
    run = claim(prep, clip, note, second)
    new = version(prep, clip, 4)
    prep.events.clear()
    commit = prep.db.commit
    def commit_before_events():
        assert prep.events == []
        commit()
    monkeypatch.setattr(prep.db, "commit", commit_before_events)
    body = {"version_id": str(new.id), "summary": "Tighter hook.", "replies": {str(note.id): "Fixed the title."}}
    response = action(prep, run, "done", body)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "done" and result["new_version_id"] == str(new.id) and result["completed_at"]
    assert result["summary"] == "Tighter hook."
    prep.db.refresh(note)
    prep.db.refresh(second)
    prep.db.refresh(clip)
    assert note.resolved and second.resolved and clip.folder_id == review.id
    assert {c.body for c in replies(prep, clip)} == {"Got it. Working on v2 now.", "Fixed the title.", "Fixed in v4: Tighter hook."}
    assert (str(prep.project.id), "cf_feedback_updated", {"run_id": run["id"], "asset_id": str(clip.id), "status": "done"}) in prep.events
    assert sum(e[1] == "comment_resolved" for e in prep.events) == 2
    assert sum(e[1] == "new_comment" for e in prep.events) == 2
    count, event_count = len(replies(prep, clip)), len(prep.events)
    assert action(prep, run, "done", body).json() == result
    assert len(replies(prep, clip)) == count and len(prep.events) == event_count
    assert action(prep, run, "done", {**body, "version_id": str(v.id)}).status_code == 409
    # Even reopening a completed comment must not enqueue it again.
    note.resolved = False
    assert due(prep) == [] and claim_response(prep, clip, note).status_code == 409
    metadata = prep.client.get(f"/assets/{clip.id}").json()["feedback_run"]
    assert metadata == {"id": run["id"], "status": "done", "progress": None, "attempt": 1,
                        "new_version_number": 4, "requested_at": None}


def test_done_rejects_old_foreign_missing_and_deleted_versions(prep):
    clip, v, note = setup_note(prep)
    v2 = version(prep, clip, 2)
    comment_on_v2 = comment(prep, clip, v2)
    run = claim(prep, clip, note, comment_on_v2)
    other = asset(prep)
    foreign = version(prep, other, 9)
    deleted = version(prep, clip, 3, deleted_at=datetime.now(timezone.utc))
    for vid, status in ((v.id, 409), (v2.id, 409), (foreign.id, 422), (uuid4(), 422), (deleted.id, 422)):
        assert action(prep, run, "done", {"version_id": str(vid), "summary": "Done"}).status_code == status
    assert len(replies(prep, clip)) == 2 and not note.resolved
    new = version(prep, clip, 4)
    assert action(prep, run, "done", {"version_id": str(new.id), "summary": "Done", "replies": {str(uuid4()): "Bad"}}).status_code == 422
    assert action(prep, run, "done", {"version_id": str(new.id), "summary": "Done"}).status_code == 200
    prep.db.refresh(clip)
    assert clip.folder_id is None


def test_progress_and_lengths(prep):
    clip, v, note = setup_note(prep)
    run = claim(prep, clip, note)
    assert action(prep, run, "progress", {"note": "Rendering"}).json()["progress"] == "Rendering"
    assert prep.events[-1][1:] == ("cf_feedback_updated", {"run_id": run["id"], "asset_id": str(clip.id), "status": "working"})
    for name, body in (("progress", {"note": "n" * 501}), ("fail", {"error": "e" * 1001}),
                       ("done", {"version_id": str(v.id), "summary": "s" * 2001})):
        assert action(prep, run, name, body).status_code == 422
    assert action(prep, run, "fail", {"error": "Failed"}).status_code == 200
    assert action(prep, run, "progress", {"note": "Too late"}).status_code == 409
    assert action(prep, run, "done", {"version_id": str(v.id), "summary": "No"}).status_code == 409


@pytest.mark.parametrize("status", ["queued", "done", "failed", "cancelled"])
def test_progress_rejects_every_nonworking_state(prep, status):
    clip, v, note = setup_note(prep)
    run = claim(prep, clip, note)
    prep.db.get(CfFeedbackRun, UUID(run["id"])).status = status
    prep.db.flush()
    assert action(prep, run, "progress", {"note": "No"}).status_code == 409


def test_claim_uses_monotonic_version_numbering(prep):
    clip, v, note = setup_note(prep)
    version(prep, clip, 3, deleted_at=datetime.now(timezone.utc))
    claim(prep, clip, note)
    assert replies(prep, clip)[0].body == "Got it. Working on v4 now."


@pytest.mark.parametrize("role,expected", [("owner", 200), ("agent", 200), ("editor", 403), ("viewer", 403), ("outsider", 403)])
def test_cancel_permissions_and_requeue(prep, role, expected):
    clip, v, note = setup_note(prep)
    run = claim(prep, clip, note)
    prep.actor["user"] = prep.users[role]
    response = action(prep, run, "cancel")
    assert response.status_code == expected
    if expected == 200:
        assert response.json()["status"] == "cancelled" and response.json()["completed_at"]
        assert prep.events[-1][2]["status"] == "cancelled"
        assert action(prep, run, "cancel").status_code == 409
        prep.actor["user"] = prep.users["agent"]
        assert len(due(prep)) == 1
        assert action(prep, run, "progress", {"note": "No"}).status_code == 409
        assert action(prep, run, "fail", {"error": "No"}).status_code == 409
        assert claim(prep, clip, note)["attempt"] == 1


@pytest.mark.parametrize("role", ["viewer", "reviewer", "outsider"])
def test_project_editor_permissions(prep, role):
    clip, v, note = setup_note(prep)
    run = claim(prep, clip, note)
    prep.actor["user"] = prep.users[role]
    assert prep.client.get(ROOT + "/due", params={"brand": prep.project.cf_brand}).status_code == 403
    assert claim_response(prep, clip, note).status_code == 403
    for name, body in (("progress", {"note": "x"}), ("fail", {"error": "x"}),
                       ("done", {"version_id": str(v.id), "summary": "x"})):
        assert action(prep, run, name, body).status_code == 403
    response = prep.client.get(ROOT + "/runs", params={"brand": prep.project.cf_brand})
    assert response.status_code == (403 if role == "outsider" else 200)
    if role == "viewer":
        assert prep.client.get(ROOT + "/due").status_code == 403


def test_asset_metadata_latest_and_list_filters(prep):
    clip, v, note = setup_note(prep)
    assert prep.client.get(f"/assets/{clip.id}").json()["feedback_run"] is None
    first = claim(prep, clip, note)
    assert action(prep, first, "cancel").status_code == 200
    second = claim(prep, clip, note)
    assert prep.client.get(f"/assets/{clip.id}").json()["feedback_run"]["id"] == second["id"]
    other = asset(prep, project_id=prep.other.id)
    elsewhere = claim(prep, other, comment(prep, other, version(prep, other)))
    params = {"brand": prep.project.cf_brand, "asset_id": str(clip.id), "limit": 1}
    response = prep.client.get(ROOT + "/runs", params=params)
    assert [r["id"] for r in response.json()] == [second["id"]]
    response = prep.client.get(ROOT + "/runs", params={**params, "status": "cancelled"})
    assert [r["id"] for r in response.json()] == [first["id"]]
    response = prep.client.get(ROOT + "/runs", params={"brand": prep.other.cf_brand})
    assert [r["id"] for r in response.json()] == [elsewhere["id"]]
    assert len(prep.client.get(ROOT + "/runs").json()) == 3


def test_internal_thread_and_human_caller_status_replies_never_queue(prep):
    clip, v, note = setup_note(prep)
    note.visibility = "internal"
    child = comment(prep, clip, v, parent_id=note.id)
    prep.actor["user"] = prep.users["editor"]
    run = claim(prep, clip, child)
    generated = prep.db.query(Comment).filter_by(asset_id=clip.id, author_id=prep.users["editor"].id).one()
    assert generated.parent_id == note.id and generated.visibility == "internal" and generated.resolved
    assert action(prep, run, "cancel").status_code == 200
    ids = {c["id"] for c in due(prep)[0]["comments"]}
    assert ids == {str(note.id), str(child.id)}


def request_now(prep, clip, body=None):
    return prep.client.post(f"{ROOT}/assets/{clip.id}/run-now", **({"json": body} if body is not None else {}))


def test_run_now_queues_recent_comments_once_and_publishes_after_commit(prep, monkeypatch):
    clip, v, note = setup_note(prep)
    note.created_at = datetime.now(timezone.utc)
    prep.actor["user"] = prep.users["owner"]
    assert due(prep) == []
    commit = prep.db.commit
    def commit_before_events():
        assert prep.events == []
        commit()
    monkeypatch.setattr(prep.db, "commit", commit_before_events)
    response = request_now(prep, clip)
    assert response.status_code == 200, response.text
    result = response.json()
    request = prep.db.get(CfFeedbackRequest, UUID(result["request_id"]))
    assert result == {"state": "queued", "request_id": str(request.id)}
    assert request.status == "pending" and request.source == "app"
    assert request.requested_by == prep.users["owner"].id and request.project_id == prep.project.id
    assert request.asset_id == clip.id and request.brand == prep.project.cf_brand
    assert request.run_id is None and request.picked_at is None
    assert prep.db.query(CfFeedbackRun).filter_by(asset_id=clip.id).count() == 0
    assert prep.events == [(str(prep.project.id), "cf_feedback_updated", {
        "asset_id": str(clip.id), "request_id": str(request.id), "status": "queued"})]
    metadata = prep.client.get(f"/assets/{clip.id}").json()["feedback_run"]
    assert metadata["id"] is None and metadata["status"] == "queued" and metadata["attempt"] == 0
    assert datetime.fromisoformat(metadata["requested_at"].replace("Z", "+00:00")) == request.created_at
    created_at = request.created_at
    prep.events.clear()
    assert request_now(prep, clip).json() == result
    prep.db.refresh(request)
    assert request.created_at == created_at
    assert prep.db.query(CfFeedbackRequest).filter_by(asset_id=clip.id).count() == 1
    assert due(prep, quiet_min=240)[0]["requested"] is True


def test_requested_due_first_and_requested_only_preserves_normal_queue(prep):
    ordinary, v, note = setup_note(prep)
    ordinary.created_at = datetime.now(timezone.utc) - timedelta(days=1)
    requested, rv, recent = setup_note(prep)
    recent.created_at = datetime.now(timezone.utc)
    assert request_now(prep, requested).status_code == 200
    rows = due(prep)
    assert [row["asset_id"] for row in rows] == [str(requested.id), str(ordinary.id)]
    assert [row["requested"] for row in rows] == [True, False]
    only = due(prep, requested_only=True)
    assert [row["asset_id"] for row in only] == [str(requested.id)]
    assert due(prep, brand=prep.other.cf_brand, requested_only=True) == []
    run = claim(prep, requested, recent)
    request = prep.db.query(CfFeedbackRequest).filter_by(asset_id=requested.id).one()
    assert request.status == "picked" and request.run_id == UUID(run["id"]) and request.picked_at
    assert due(prep, requested_only=True) == []
    assert [row["asset_id"] for row in due(prep)] == [str(ordinary.id)]
    metadata = prep.client.get(f"/assets/{requested.id}").json()["feedback_run"]
    assert metadata["id"] == run["id"] and metadata["requested_at"] is None


@pytest.mark.parametrize("change", ["resolved", "deleted"])
@pytest.mark.parametrize("requested_only", [False, True])
def test_due_clears_requests_when_comments_vanish(prep, change, requested_only):
    clip, v, note = setup_note(prep)
    request_id = request_now(prep, clip).json()["request_id"]
    if change == "resolved":
        note.resolved = True
    else:
        note.deleted_at = datetime.now(timezone.utc)
    prep.events.clear()
    assert due(prep, requested_only=requested_only) == []
    request = prep.db.get(CfFeedbackRequest, UUID(request_id))
    assert request.status == "cleared" and request.run_id is None and request.picked_at is None
    assert prep.events == [(str(prep.project.id), "cf_feedback_updated", {
        "asset_id": str(clip.id), "request_id": request_id, "status": "cleared"})]
    assert prep.client.get(f"/assets/{clip.id}").json()["feedback_run"] is None
    prep.events.clear()
    assert due(prep, requested_only=requested_only) == [] and prep.events == []
    comment(prep, clip, v)
    assert request_now(prep, clip).json()["request_id"] != request_id


def test_due_keeps_request_while_any_eligible_comment_remains(prep):
    clip, v, note = setup_note(prep)
    remaining = comment(prep, clip, v)
    request_now(prep, clip)
    note.resolved = True
    rows = due(prep, requested_only=True)
    assert [c["id"] for c in rows[0]["comments"]] == [str(remaining.id)]
    assert prep.db.query(CfFeedbackRequest).filter_by(asset_id=clip.id).one().status == "pending"


@pytest.mark.parametrize("kind", ["missing", "resolved", "deleted", "agent", "nonmember", "not_video", "done", "capped"])
def test_run_now_requires_eligible_comments(prep, kind):
    clip, v, note = setup_note(prep)
    if kind == "missing":
        prep.db.delete(note)
    elif kind == "deleted":
        note.deleted_at = datetime.now(timezone.utc)
    elif kind == "resolved":
        note.resolved = True
    elif kind == "agent":
        note.author_id = prep.users["agent"].id
    elif kind == "nonmember":
        note.author_id = prep.users["outsider"].id
    elif kind == "not_video":
        clip.asset_type = "image"
    else:
        run = claim(prep, clip, note)
        stored = prep.db.get(CfFeedbackRun, UUID(run["id"]))
        stored.status = "done" if kind == "done" else "failed"
        stored.attempt = 3
    response = request_now(prep, clip)
    assert response.status_code == 409
    assert response.json() == {"detail": "Leave a comment first, then Flo can check it."}
    assert prep.db.query(CfFeedbackRequest).filter_by(asset_id=clip.id).count() == 0


def test_run_now_returns_working_before_checking_claimed_comments(prep):
    clip, v, note = setup_note(prep)
    run = claim(prep, clip, note)
    response = request_now(prep, clip)
    assert response.status_code == 200 and response.json() == {"state": "working", "run_id": run["id"]}
    assert prep.db.query(CfFeedbackRequest).filter_by(asset_id=clip.id).count() == 0
    assert prep.events[-1][2] == {"asset_id": str(clip.id), "run_id": run["id"], "status": "working"}


@pytest.mark.parametrize("attempt", [1, 2])
def test_run_now_retries_failed_notes_without_resetting_attempts(prep, attempt):
    clip, v, note = setup_note(prep)
    run = claim(prep, clip, note)
    stored = prep.db.get(CfFeedbackRun, UUID(run["id"]))
    stored.attempt = attempt
    assert action(prep, run, "fail", {"error": "Render stopped."}).status_code == 200
    assert due(prep) == []
    prep.actor["user"] = prep.users["editor"]
    response = request_now(prep, clip)
    assert response.status_code == 200 and response.json()["state"] == "queued"
    assert due(prep, quiet_min=240, requested_only=True)[0]["comments"][0]["id"] == str(note.id)
    metadata = prep.client.get(f"/assets/{clip.id}").json()["feedback_run"]
    assert metadata["id"] == run["id"] and metadata["requested_at"]
    assert stored.status == "failed" and stored.attempt == attempt
    prep.actor["user"] = prep.users["agent"]
    assert claim(prep, clip, note)["attempt"] == attempt + 1


@pytest.mark.parametrize("role,expected", [("owner", 200), ("editor", 200), ("agent", 200),
                                          ("reviewer", 403), ("viewer", 403), ("outsider", 403)])
def test_run_now_authorization(prep, role, expected):
    clip, v, note = setup_note(prep)
    # An allowlisted account may request a check even without project membership.
    member = prep.db.query(ProjectMember).filter_by(project_id=prep.project.id, user_id=prep.users["agent"].id).one()
    member.deleted_at = datetime.now(timezone.utc)
    prep.actor["user"] = prep.users[role]
    assert request_now(prep, clip).status_code == expected


@pytest.mark.parametrize("role,source,stored", [("owner", None, "app"), ("editor", "flo", "app"),
                                              ("agent", None, "cli"), ("agent", "flo", "flo"), ("agent", "cli", "cli")])
def test_run_now_records_caller_and_source(prep, role, source, stored):
    clip, v, note = setup_note(prep)
    prep.actor["user"] = prep.users[role]
    response = request_now(prep, clip, {"source": source})
    assert response.status_code == 200, response.text
    request = prep.db.get(CfFeedbackRequest, UUID(response.json()["request_id"]))
    assert request.source == stored and request.requested_by == prep.users[role].id


def test_run_now_rejects_bad_source_and_unavailable_assets(prep):
    clip, v, note = setup_note(prep)
    for source in ("invalid", "app"):
        assert request_now(prep, clip, {"source": source}).status_code == 422
    clip.deleted_at = datetime.now(timezone.utc)
    assert request_now(prep, clip).status_code == 404
    assert request_now(prep, SimpleNamespace(id=uuid4())).status_code == 404
    clip.deleted_at = None
    prep.project.deleted_at = datetime.now(timezone.utc)
    assert request_now(prep, clip).status_code == 404


def test_brand_run_now_scopes_queue_and_counts_live_assets(prep):
    queued, qv, qnote = setup_note(prep)
    qnote.created_at = datetime.now(timezone.utc)
    working, wv, wnote = setup_note(prep)
    claim(prep, working, wnote)
    empty = asset(prep)
    still = asset(prep, asset_type="image")
    comment(prep, still, version(prep, still))
    deleted, dv, dnote = setup_note(prep)
    deleted.deleted_at = datetime.now(timezone.utc)
    foreign = asset(prep, project_id=prep.other.id)
    comment(prep, foreign, version(prep, foreign))
    prep.actor["user"] = prep.users["owner"]
    response = prep.client.post(ROOT + "/run-now", params={"brand": prep.project.cf_brand})
    assert response.status_code == 200, response.text
    assert response.json() == {"queued": [str(queued.id)], "working": [str(working.id)], "nothing": 2}
    requests = prep.db.query(CfFeedbackRequest).all()
    assert len(requests) == 1 and requests[0].asset_id == queued.id
    assert requests[0].source == "app"
    assert [r["asset_id"] for r in due(prep, requested_only=True)] == [str(queued.id)]
    assert prep.client.post(ROOT + "/run-now", params={"brand": prep.project.cf_brand}).json() == response.json()


@pytest.mark.parametrize("role,expected", [("owner", 200), ("agent", 200), ("editor", 403),
                                          ("reviewer", 403), ("viewer", 403), ("outsider", 403)])
def test_brand_run_now_authorization(prep, role, expected):
    clip, v, note = setup_note(prep)
    member = prep.db.query(ProjectMember).filter_by(project_id=prep.project.id, user_id=prep.users["agent"].id).one()
    member.deleted_at = datetime.now(timezone.utc)
    prep.actor["user"] = prep.users[role]
    response = prep.client.post(ROOT + "/run-now", params={"brand": prep.project.cf_brand}, json={"source": "flo"})
    assert response.status_code == expected
    if expected == 200:
        assert response.json()["queued"] == [str(clip.id)]
        request = prep.db.query(CfFeedbackRequest).filter_by(asset_id=clip.id).one()
        assert request.source == ("flo" if role == "agent" else "app")
    else:
        assert prep.db.query(CfFeedbackRequest).count() == 0


def test_brand_run_now_requires_a_live_valid_brand(prep):
    for params, expected in (({}, 422), ({"brand": "../bad"}, 400), ({"brand": "missing"}, 404)):
        assert prep.client.post(ROOT + "/run-now", params=params).status_code == expected
    assert prep.client.post(ROOT + "/run-now", params={"brand": prep.project.cf_brand}).json() == {
        "queued": [], "working": [], "nothing": 0}
    prep.project.deleted_at = datetime.now(timezone.utc)
    assert prep.client.post(ROOT + "/run-now", params={"brand": prep.project.cf_brand}).status_code == 404


def test_pending_request_unique_index_allows_history_but_not_duplicates(prep):
    clip, v, note = setup_note(prep)
    request_now(prep, clip)
    fields = dict(project_id=prep.project.id, brand=prep.project.cf_brand, asset_id=clip.id,
                  requested_by=prep.users["owner"].id, source="app")
    with pytest.raises(IntegrityError):
        with prep.db.begin_nested():
            prep.db.add(CfFeedbackRequest(**fields, status="pending"))
            prep.db.flush()
    prep.db.add_all([CfFeedbackRequest(**fields, status="picked"), CfFeedbackRequest(**fields, status="cleared")])
    prep.db.flush()
    assert prep.db.query(CfFeedbackRequest).filter_by(asset_id=clip.id).count() == 3


def test_requests_follow_asset_cleanup_without_blocking_run_cleanup(prep, monkeypatch):
    from apps.api.tasks import cleanup_tasks

    monkeypatch.setattr(cleanup_tasks, "delete_object", lambda key: None)
    monkeypatch.setattr(cleanup_tasks, "delete_prefix", lambda prefix: None)
    clip, v, note = setup_note(prep)
    request_id = request_now(prep, clip).json()["request_id"]
    claim(prep, clip, note)
    cleanup_tasks._purge_version(prep.db, v.id, cleanup_tasks.PurgeCounts())
    request = prep.db.get(CfFeedbackRequest, UUID(request_id))
    prep.db.refresh(request)
    assert request.status == "picked" and request.run_id is None
    cleanup_tasks._purge_asset(prep.db, clip.id, cleanup_tasks.PurgeCounts())
    assert prep.db.query(CfFeedbackRequest).filter_by(asset_id=clip.id).count() == 0


@pytest.mark.parametrize("status,attempt,blocked", [("working", 1, True), ("done", 1, True),
                                                  ("failed", 1, False), ("failed", 2, False),
                                                  ("failed", 3, True), ("cancelled", 3, False)])
def test_run_now_retry_delay_bypass_keeps_run_exclusions(status, attempt, blocked):
    now = datetime.now(timezone.utc)
    run = SimpleNamespace(status=status, attempt=attempt, completed_at=now)
    assert cf_feedback._blocked([run], now, ignore_retry_delay=True) is blocked
    if status == "failed":
        assert cf_feedback._blocked([run], now) is True


def test_request_source_uses_authenticated_account(monkeypatch):
    monkeypatch.setattr(settings, "cf_agent_emails", "  FLO@example.com ")
    agent = SimpleNamespace(email="flo@example.com")
    human = SimpleNamespace(email="owner@example.com")
    assert cf_feedback._request_source(agent, RunNow()) == "cli"
    assert cf_feedback._request_source(agent, RunNow(source="flo")) == "flo"
    assert cf_feedback._request_source(human, RunNow(source="cli")) == "app"


@pytest.mark.parametrize("state", ["queued", "working"])
def test_run_now_http_response_and_optional_body(client, auth_headers, mock_db, test_user, monkeypatch, state):
    monkeypatch.setattr("apps.api.middleware.global_rate_limit.GlobalRateLimitMiddleware._check",
                        lambda self, identity, action, limit: (True, 0))
    asset_id, result_id = uuid4(), uuid4()
    result = {"state": state, "request_id" if state == "queued" else "run_id": str(result_id)}
    with patch.object(cf_feedback, "run_now", return_value=result) as service:
        response = client.post(f"{ROOT}/assets/{asset_id}/run-now", headers=auth_headers)
        assert response.status_code == 200 and response.json() == result
        service.assert_called_once_with(mock_db, test_user, asset_id, RunNow())
        service.reset_mock()
        response = client.post(f"{ROOT}/assets/{asset_id}/run-now", headers=auth_headers, json={"source": "flo"})
        assert response.status_code == 200
        service.assert_called_once_with(mock_db, test_user, asset_id, RunNow(source="flo"))


def test_brand_run_now_http_contract(client, auth_headers, mock_db, test_user, monkeypatch):
    monkeypatch.setattr("apps.api.middleware.global_rate_limit.GlobalRateLimitMiddleware._check",
                        lambda self, identity, action, limit: (True, 0))
    result = {"queued": [str(uuid4())], "working": [str(uuid4())], "nothing": 2}
    with patch.object(cf_feedback, "run_brand_now", return_value=result) as service:
        response = client.post(ROOT + "/run-now", params={"brand": "demo"}, headers=auth_headers)
        assert response.status_code == 200 and response.json() == result
        service.assert_called_once_with(mock_db, test_user, "demo", RunNow())
        assert client.post(ROOT + "/run-now", headers=auth_headers).status_code == 422


def test_due_http_requested_only_parameter(client, auth_headers, mock_db, test_user, monkeypatch):
    monkeypatch.setattr("apps.api.middleware.global_rate_limit.GlobalRateLimitMiddleware._check",
                        lambda self, identity, action, limit: (True, 0))
    with patch.object(cf_feedback, "due", return_value=[]) as service:
        response = client.get(ROOT + "/due", params={"brand": "demo", "requested_only": "true"}, headers=auth_headers)
        assert response.status_code == 200 and response.json() == []
        service.assert_called_once_with(mock_db, test_user, "demo", 10, True)
        service.reset_mock()
        assert client.get(ROOT + "/due", headers=auth_headers).status_code == 200
        service.assert_called_once_with(mock_db, test_user, None, 10, False)
