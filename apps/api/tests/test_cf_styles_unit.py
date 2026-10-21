"""Database-free checks for autosave, leases, validation, events and signed delivery."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError
import pytest
from sqlalchemy.dialects import postgresql

from apps.api.models.cf_style import CfStyle, CfStyleVersion
from apps.api.models.project import ProjectRole
from apps.api.schemas import cf_styles as wire
from apps.api.services import cf_styles as service, cf_style_templates as library


@pytest.fixture
def env(monkeypatch):
    instant = datetime(2026, 10, 6, 12, tzinfo=timezone.utc)
    user = SimpleNamespace(id=uuid4(), email="agent@test.local")
    style = CfStyle(id=uuid4(), project_id=uuid4(), brand="test", name="Story", slug="story", description="",
                    is_default=True, origin="interview", created_by=user.id, created_at=instant, updated_at=instant)
    row = CfStyleVersion(id=uuid4(), style_id=style.id, version=1, status="building", design_md="", style_json={},
        skin_css="", answers={"answers": {"brand": "Test"}}, request=None, changelog="", sample_asset_id=None,
        preview={}, error=None, attempt=0, created_by=user.id, created_at=instant)
    db = MagicMock()
    query = db.query.return_value
    for method in ("filter", "filter_by", "join", "order_by", "with_for_update", "populate_existing", "limit"):
        getattr(query, method).return_value = query
    query.all.return_value = []
    query.first.return_value = None
    monkeypatch.setattr(service.settings, "cf_agent_emails", " AGENT@test.local ")
    monkeypatch.setattr(service, "load_version", lambda *args, **kwargs: (style, row))
    monkeypatch.setattr(service, "now", lambda: instant)
    events, notifications = [], []
    monkeypatch.setattr(service.event_service, "publish_sync", lambda *args: events.append(args))
    monkeypatch.setattr(service, "notify", lambda data: notifications.append(data))
    return SimpleNamespace(db=db, query=query, user=user, style=style, row=row, now=instant,
                           events=events, notifications=notifications)


def test_merge_replaces_nested_values_deletes_null_and_preserves_unknown():
    before = {"version": "old", "ratings": {"look-1": "love"}, "notes": {"section:brand": "Note"},
              "answers": {"words": {"is": ["warm"], "never": ["cold"]}, "platforms": ["ig", "yt"], "future": 4},
              "extension": {"x": 1}}
    original = deepcopy(before)
    result = service.merge_answers(before, {"version": "ignored", "ratings": {"look-1": None, "new": "maybe"},
        "notes": {"section:brand": None}, "answers": {"words": {"is": ["clear"]}, "platforms": ["yt"], "future": None}})
    assert result == {"version": "style-lab-v3", "ratings": {"new": "maybe"}, "notes": {},
                      "answers": {"words": {"is": ["clear"]}, "platforms": ["yt"]}, "extension": {"x": 1}}
    assert before == original


@pytest.mark.parametrize("value", [{"ratings": {"x": "yes"}}, {"notes": {"x": []}}, {"answers": []}, {"ratings": None}])
def test_answers_reject_bad_sections(value):
    with pytest.raises(ValidationError):
        wire.InterviewPatch(answers=value)


@pytest.mark.parametrize("name,slug", [("My style!", "my-style"), ("Crème story", "creme-story"), ("🎥", "my-style")])
def test_slugs(name, slug):
    assert service.slugify(name) == slug


def test_claim_lease_and_sse(env, monkeypatch):
    monkeypatch.setattr(service, "build_item", lambda db, style, row: {"version_id": row.id})
    assert service.claim(env.db, env.user, env.row.id) == {"version_id": env.row.id}
    assert env.row.claimed_at == env.now
    assert env.events == [(str(env.style.project_id), "cf_style_updated", {"brand": "test", "style_id": str(env.style.id)})]
    with pytest.raises(HTTPException) as error:
        service.claim(env.db, env.user, env.row.id)
    assert error.value.status_code == 409
    monkeypatch.setattr(service, "now", lambda: env.now + timedelta(minutes=45))
    service.claim(env.db, env.user, env.row.id)
    assert env.row.claimed_at == env.now + timedelta(minutes=45)


def test_quiet_failures_and_retry(env, monkeypatch):
    for attempt in range(1, 4):
        if attempt > 1:
            monkeypatch.setattr(service, "now", lambda: env.now + timedelta(minutes=10 * attempt))
        result = service.fail(env.db, env.user, env.row.id, wire.Fail(error="Private worker detail"))
        assert result.attempt == attempt and result.status == ("failed" if attempt == 3 else "building")
        assert result.error is None if attempt < 3 else result.error.startswith("I need you on this one")
        assert not env.notifications
        if attempt < 3:
            with pytest.raises(HTTPException):
                service.fail(env.db, env.user, env.row.id, wire.Fail(error="Duplicate delivery"))
            assert env.row.attempt == attempt
    monkeypatch.setattr(service, "approved", lambda *args: None)
    result = service.retry(env.db, env.user, env.row.id)
    assert (result.status, result.attempt, result.error) == ("building", 0, None)
    assert env.notifications[0]["event"] == "creative_flo.style_build_requested"
    assert env.row.next_try_at is None and env.row.claimed_at is None


def test_proposal_clears_lease_and_emits_payload(env):
    body = wire.Proposed(design_md="Design", style_json={"pace": 4}, skin_css="", preview={}, changelog="Bigger type")
    env.row.claimed_at = env.now
    row = service.proposed(env.db, env.user, env.row.id, body)
    assert row.status == "proposed" and row.design_md == "Design" and row.sample_url is None
    assert env.row.claimed_at is None
    assert env.notifications == [{"event": "creative_flo.style_proposed", "brand": "test",
        "style_id": str(env.style.id), "version_id": str(env.row.id), "name": "Story", "changelog": "Bigger type",
        "app_url": service.settings.frontend_url.rstrip("/") + f"/test/style/{env.style.id}"}]
    with pytest.raises(HTTPException):
        service.proposed(env.db, env.user, env.row.id, body)


def test_approval_cannot_move_backwards(env, monkeypatch):
    env.row.status = "proposed"
    monkeypatch.setattr(service, "approved", lambda *args: SimpleNamespace(version=2))
    with pytest.raises(HTTPException) as error:
        service.approve(env.db, env.user, env.row.id)
    assert error.value.status_code == 409 and env.row.status == "proposed"
    monkeypatch.setattr(service, "approved", lambda *args: None)
    service.approve(env.db, env.user, env.row.id)
    assert env.style.current_version_id == env.row.id
    assert env.row.status == "approved" and env.row.approved_by == env.user.id


def test_reject_approved_version_is_refused(env):
    env.row.status = "approved"
    with pytest.raises(HTTPException):
        service.reject(env.db, env.user, env.row.id, wire.Reject(note="No"))
    assert env.row.status == "approved"


def test_restore_is_a_new_proposal_with_no_approval(env, monkeypatch):
    env.row.status = "approved"
    env.row.approved_by, env.row.approved_at = env.user.id, env.now
    env.query.scalar.return_value = 4
    def flush():
        new = env.db.add.call_args.args[0]
        new.id, new.created_at, new.attempt = uuid4(), env.now, 0
    env.db.flush.side_effect = flush
    row = service.restore(env.db, env.user, env.row.id)
    assert row.version == 5 and row.status == "proposed"
    assert row.approved_by is None and row.approved_at is None
    assert row.id != env.row.id and row.answers == env.row.answers


@pytest.mark.parametrize("role,agent,allowed", [(ProjectRole.owner, False, True), (ProjectRole.editor, False, False),
    (ProjectRole.viewer, False, False), (ProjectRole.owner, True, False), (None, False, False)])
def test_owner_auth_uses_real_permission_boundary(env, monkeypatch, role, agent, allowed):
    from apps.api.services import permissions
    monkeypatch.setattr(service.cf_data, "brand_dir", lambda brand: None)
    env.query.first.return_value = SimpleNamespace(id=env.style.project_id)
    monkeypatch.setattr(permissions, "get_project_member", lambda *args: SimpleNamespace(role=role) if role else None)
    user = env.user if agent else SimpleNamespace(id=uuid4(), email="owner@test.local")
    if allowed:
        assert service.authorize(env.db, user, "test", owner=True).id == env.style.project_id
    else:
        with pytest.raises(HTTPException) as error:
            service.authorize(env.db, user, "test", owner=True)
        assert error.value.status_code == 403


def test_style_notifications_are_disabled_for_self_hosting():
    assert service.notify({"brand": "test", "version_id": str(uuid4())}) is False


def template():
    return {"key": "clean", "name": "Clean", "summary": "Short", "best_for": "Stories", "why_it_works": "Clarity",
            "tags": ["calm"], "design_md": "Keep it clear", "style_json": {}, "preview": {}, "sort": 1}


def write_template(path, data):
    folder = path / data["key"]
    folder.mkdir()
    (folder / "template.json").write_text(json.dumps({k: v for k, v in data.items() if k not in {"key", "design_md", "style_json"}}))
    (folder / "DESIGN.md").write_text(data["design_md"])
    (folder / "style.json").write_text(json.dumps(data["style_json"]))
    return folder


def test_template_loader_valid_invalid_and_empty(tmp_path, caplog):
    assert library.load_templates_from_dir(tmp_path) == []
    assert library.load_templates_from_dir(tmp_path / "missing") == []
    write_template(tmp_path, template())
    write_template(tmp_path, {**template(), "key": "bad", "preview": []})
    write_template(tmp_path, {**template(), "key": "Bad-Key"})
    rows = library.load_templates_from_dir(tmp_path)
    assert [row.key for row in rows] == ["clean"]
    assert "Skipping style template bad" in caplog.text and "preview" in caplog.text
    assert "Skipping style template Bad-Key" in caplog.text


def test_template_loader_bad_json_keeps_other_templates(tmp_path):
    write_template(tmp_path, template())
    bad = write_template(tmp_path, {**template(), "key": "broken"})
    (bad / "style.json").write_text("{")
    assert [row.key for row in library.load_templates_from_dir(tmp_path)] == ["clean"]


@pytest.mark.parametrize("field,length", [("name", 80), ("summary", 300), ("best_for", 300), ("why_it_works", 600), ("trend_note", 600)])
def test_template_limits(field, length):
    with pytest.raises(ValidationError):
        wire.TemplateSeed.model_validate({**template(), field: "x" * (length + 1)})


def test_upsert_sql_preserves_live_trend_and_sample():
    db = MagicMock()
    assert library.upsert_templates(db, [template(), template(), {"key": "bad"}])["upserted"] == ["clean"]
    sql = str(db.execute.call_args.args[0].compile(dialect=postgresql.dialect()))
    assert "ON CONFLICT (key) DO UPDATE" in sql
    assert "trend_note = coalesce(cf_style_templates.trend_note, excluded.trend_note)" in sql
    assert "sample_url = coalesce(cf_style_templates.sample_url, excluded.sample_url)" in sql
    assert "trend_updated_at =" not in sql
    db.commit.assert_not_called()


def test_startup_is_quiet_when_directory_missing(monkeypatch, tmp_path):
    from apps.api import database
    monkeypatch.setattr(service.settings, "cf_style_templates_dir", str(tmp_path / "missing"))
    factory = MagicMock(side_effect=AssertionError("Must not open a database"))
    monkeypatch.setattr(database, "SessionLocal", factory)
    library.seed_on_startup()
    factory.assert_not_called()


def test_startup_database_failure_does_not_abort(monkeypatch, tmp_path, caplog):
    from apps.api import database
    write_template(tmp_path, template())
    monkeypatch.setattr(service.settings, "cf_style_templates_dir", str(tmp_path))
    monkeypatch.setattr(database, "SessionLocal", MagicMock(side_effect=RuntimeError("unavailable")))
    library.seed_on_startup()
    assert "Style templates could not be loaded" in caplog.text


def test_sse_failure_does_not_abort_saved_change(env, monkeypatch):
    monkeypatch.setattr(service.event_service, "publish_sync", MagicMock(side_effect=RuntimeError("offline")))
    service.save(env.db, env.style)
    env.db.commit.assert_called_once()


def test_active_override_beats_default_and_empty_404(env, monkeypatch):
    monkeypatch.setattr(service, "authorize", lambda *args: SimpleNamespace(id=env.style.project_id))
    clip = SimpleNamespace(cf_style_id=env.style.id)
    env.query.first.side_effect = [clip, env.style]
    env.row.status = "approved"
    monkeypatch.setattr(service, "approved", lambda *args: env.row)
    result = service.active(env.db, env.user, "test", uuid4())
    assert result.source == "asset" and result.version_id == env.row.id
    env.query.first.side_effect = [None]
    with pytest.raises(HTTPException) as error:
        service.active(env.db, env.user, "test")
    assert error.value.status_code == 404 and error.value.detail == service.NO_STYLE


def test_active_invalid_override_falls_back_to_default(env, monkeypatch):
    monkeypatch.setattr(service, "authorize", lambda *args: SimpleNamespace(id=env.style.project_id))
    env.query.first.side_effect = [SimpleNamespace(cf_style_id=uuid4()), None, env.style]
    monkeypatch.setattr(service, "approved", lambda *args: env.row)
    assert service.active(env.db, env.user, "test", uuid4()).source == "default"


def test_http_validation_and_agent_guard(client, auth_headers, test_user, monkeypatch):
    monkeypatch.setattr(service.settings, "cf_agent_emails", "agent@test.local")
    response = client.post("/cf/style-templates/seed", json=[template()], headers=auth_headers)
    assert response.status_code == 403 and set(response.json()) == {"detail"}
    response = client.post("/cf/styles", json={"brand": "test", "name": "x" * 81}, headers=auth_headers)
    assert response.status_code == 422
    response = client.patch(f"/cf/style-interviews/{uuid4()}", json={"answers": {"ratings": {"x": "invalid"}}}, headers=auth_headers)
    assert response.status_code == 422
