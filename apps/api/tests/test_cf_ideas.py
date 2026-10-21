"""Ideas contract tests against transactional Postgres, plus isolated migration QA."""
import copy
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, inspect, select

from apps.api.models.asset import Asset, AssetType
from apps.api.models.cf_idea import CfIdea
from apps.api.models.project import Project, ProjectMember, ProjectRole
from apps.api.models.user import User
from apps.api.services.cf_ideas import normalize_script, teleprompter_text


@pytest.fixture
def prep(real_db):
    users = {role: User(email=f"ideas-{uuid4().hex}@test.local", name=role)
             for role in ("owner", "editor", "reviewer", "viewer", "outsider")}
    real_db.add_all(users.values())
    real_db.flush()
    project = Project(name="Ideas test", cf_brand=f"t{uuid4().hex[:10]}", created_by=users["owner"].id)
    other = Project(name="Other", cf_brand=f"t{uuid4().hex[:10]}", created_by=users["owner"].id)
    real_db.add_all([project, other])
    real_db.flush()
    real_db.add_all([
        ProjectMember(project_id=project.id, user_id=users[role.value].id, role=role)
        for role in ProjectRole
    ])
    asset = Asset(project_id=project.id, name="Clip", asset_type=AssetType.video, created_by=users["owner"].id)
    foreign_asset = Asset(project_id=other.id, name="Other clip", asset_type=AssetType.video, created_by=users["owner"].id)
    real_db.add_all([asset, foreign_asset])
    real_db.flush()
    actor = {"user": users["editor"]}
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
                                  users=users, actor=actor, asset=asset, foreign_asset=foreign_asset)
        finally:
            client.close()
            app.dependency_overrides.clear()


def create(prep, title="A story", **fields):
    response = prep.client.post("/cf/ideas", json={"brand": prep.project.cf_brand, "title": title, **fields})
    assert response.status_code == 200, response.text
    return response.json()


def test_crud_and_commits_stay_inside_fixture_transaction(prep):
    connection = prep.db.get_bind()
    outer = connection.get_transaction()
    idea = create(prep, "  My story  ", hook="Start here", angle="An experience", pillar="Sales")
    assert idea["title"] == "My story"
    assert idea["brand"] == prep.project.cf_brand
    assert idea["project_id"] == str(prep.project.id)
    assert idea["script"] == {"beats": [], "cta": ""}
    assert idea["status"] == "idea" and idea["position"] == 0
    assert prep.client.get(f"/cf/ideas/{idea['id']}").json() == idea
    # The route committed its Session; the fixture's connection still owns the
    # outer transaction, and a fresh SELECT sees the committed ORM changes.
    assert connection.get_transaction() is outer
    assert outer.is_active
    assert prep.db.execute(select(CfIdea.title).where(CfIdea.id == UUID(idea["id"]))).scalar_one() == "My story"
    changed = prep.client.patch(f"/cf/ideas/{idea['id']}", json={"title": "  Revised  ", "hook": None, "notes": "Practice"})
    assert changed.status_code == 200
    assert changed.json()["title"] == "Revised"
    assert changed.json()["hook"] is None
    assert changed.json()["angle"] == "An experience"
    assert changed.json()["updated_at"] >= idea["updated_at"]


def test_list_status_order_positions_created_at_and_filter(prep):
    statuses = ["archived", "shot", "ready", "scripting", "idea"]
    rows = [create(prep, status, status=status) for status in statuses]
    later = create(prep, "Later idea")
    assert later["position"] == 1
    url = f"/cf/ideas?brand={prep.project.cf_brand}"
    listing = prep.client.get(url).json()
    assert [row["title"] for row in listing] == ["idea", "Later idea", "scripting", "ready", "shot", "archived"]
    assert [row["status"] for row in prep.client.get(url + "&status=ready").json()] == ["ready"]
    assert prep.client.get(url + "&status=unknown").status_code == 422
    early_row = prep.db.get(CfIdea, UUID(rows[-1]["id"]))
    late_row = prep.db.get(CfIdea, UUID(later["id"]))
    early_row.position = late_row.position = 5
    early_row.created_at = datetime.now(timezone.utc) - timedelta(days=1)
    late_row.created_at = datetime.now(timezone.utc)
    prep.db.flush()
    assert [row["title"] for row in prep.client.get(url + "&status=idea").json()] == ["idea", "Later idea"]


@pytest.mark.parametrize("role", ["viewer", "reviewer"])
def test_read_only_roles(prep, role):
    idea = create(prep)
    prep.actor["user"] = prep.users[role]
    assert prep.client.get(f"/cf/ideas?brand={prep.project.cf_brand}").status_code == 200
    assert prep.client.get(f"/cf/ideas/{idea['id']}").status_code == 200
    assert prep.client.post("/cf/ideas", json={"brand": prep.project.cf_brand, "title": "Denied"}).status_code == 403
    assert prep.client.patch(f"/cf/ideas/{idea['id']}", json={"notes": "Denied"}).status_code == 403
    assert prep.client.delete(f"/cf/ideas/{idea['id']}").status_code == 403


def test_nonmember_unknown_brand_and_missing_id(prep):
    idea = create(prep)
    prep.actor["user"] = prep.users["outsider"]
    assert prep.client.get(f"/cf/ideas?brand={prep.project.cf_brand}").status_code == 403
    assert prep.client.get(f"/cf/ideas/{idea['id']}").status_code == 403
    assert prep.client.get(f"/cf/ideas?brand=t{uuid4().hex[:10]}").status_code == 404
    assert prep.client.get("/cf/ideas?brand=../bad").status_code == 400
    for method in ("get", "patch", "delete"):
        kwargs = {"json": {"title": "Missing"}} if method == "patch" else {}
        response = getattr(prep.client, method)(f"/cf/ideas/{uuid4()}", **kwargs)
        assert response.status_code == 404
        assert response.json()["detail"] == "Idea not found"


def test_owner_can_write(prep):
    prep.actor["user"] = prep.users["owner"]
    idea = create(prep)
    assert prep.client.patch(f"/cf/ideas/{idea['id']}", json={"status": "ready"}).status_code == 200
    assert prep.client.delete(f"/cf/ideas/{idea['id']}").status_code == 204


def test_teleprompter_api_and_canonical_storage(prep):
    idea = create(prep, hook="  Hook \n", script={
        "beats": [{"text": "  Story  ", "broll": " \t", "ignored": True}, {"text": "\n"}, {}],
        "cta": "  Follow  ", "ignored": True,
    })
    assert idea["teleprompter_text"] == "Hook\n\nStory\n\nFollow"
    assert all(beat["id"] and len(beat["id"]) == 12 for beat in idea["script"]["beats"])
    assert idea["script"]["beats"][0]["broll"] is None
    row = prep.db.get(CfIdea, UUID(idea["id"]))
    assert row.script == idea["script"]
    path = f"/cf/ideas/{idea['id']}"
    assert prep.client.patch(path, json={"script_text": "  Exact script\n"}).json()["teleprompter_text"] == "  Exact script\n"
    assert prep.client.patch(path, json={"script_text": " \n\t"}).json()["teleprompter_text"] == "Hook\n\nStory\n\nFollow"
    assert prep.client.patch(path, json={"script": None}).json()["script"] == {"beats": [], "cta": ""}
    assert prep.client.patch(path, json={"script": {"beats": [{"text": "New beat"}]}}).json()["script"]["beats"][0]["id"]
    row.script = {"beats": [{"text": None, "broll": 123}], "cta": None}
    prep.db.flush()
    read = prep.client.get(path).json()
    assert read["script"]["beats"][0]["text"] == ""
    assert read["script"]["beats"][0]["broll"] is None
    assert read["script"]["cta"] == ""


@pytest.mark.parametrize("override,expected", [(None, "Hook\n\nStory\n\nGo"), (" \n", "Hook\n\nStory\n\nGo"), ("  Manual\n", "  Manual\n")])
def test_teleprompter_pure(override, expected):
    assert teleprompter_text(" Hook ", {"beats": [{"text": "\n"}, {"text": " Story "}], "cta": " Go "}, override) == expected
    assert teleprompter_text(None, None, None) == ""


def test_normalize_script_is_defensive_and_does_not_mutate():
    source = {"beats": [{"id": " ", "text": "Hello", "broll": " "}, {"id": "keep", "broll": "Hands"}, {"text": 42}], "cta": "Go", "extra": 1}
    before = copy.deepcopy(source)
    normalized = normalize_script(source)
    assert source == before
    assert len(normalized["beats"][0]["id"]) == 12
    assert normalized["beats"][0]["broll"] is None
    assert normalized["beats"][1] == {"id": "keep", "text": "", "broll": "Hands"}
    assert normalized["beats"][2]["text"] == ""
    assert "extra" not in normalized
    assert normalize_script(normalized) == normalized
    for invalid in (None, [], "bad", {"beats": "bad", "cta": 0}):
        assert normalize_script(invalid) == {"beats": [], "cta": ""}


def test_asset_membership_and_clear(prep):
    idea = create(prep)
    path = f"/cf/ideas/{idea['id']}"
    foreign = prep.client.patch(path, json={"asset_id": str(prep.foreign_asset.id)})
    assert foreign.status_code == 400 and foreign.json()["detail"] == "Asset belongs to another project"
    missing = prep.client.patch(path, json={"asset_id": str(uuid4())})
    assert missing.status_code == 400 and missing.json()["detail"] == "Asset not found"
    good = prep.client.patch(path, json={"asset_id": str(prep.asset.id)})
    assert good.status_code == 200 and good.json()["asset_id"] == str(prep.asset.id)
    assert prep.client.patch(path, json={"asset_id": None}).json()["asset_id"] is None
    prep.asset.deleted_at = datetime.now(timezone.utc)
    prep.db.flush()
    assert prep.client.patch(path, json={"asset_id": str(prep.asset.id)}).json()["detail"] == "Asset not found"


def test_soft_delete(prep):
    idea = create(prep)
    path = f"/cf/ideas/{idea['id']}"
    response = prep.client.delete(path)
    assert response.status_code == 204 and response.content == b""
    assert prep.client.get(path).status_code == 404
    assert prep.client.patch(path, json={"notes": "gone"}).status_code == 404
    assert prep.client.delete(path).status_code == 404
    assert prep.client.get(f"/cf/ideas?brand={prep.project.cf_brand}").json() == []
    assert prep.db.get(CfIdea, UUID(idea["id"])).deleted_at is not None
    assert create(prep)["position"] == 0


def test_status_moves_append_and_explicit_position_wins(prep):
    first = create(prep, "First", status="ready")
    second = create(prep, "Second", status="ready")
    assert [first["position"], second["position"]] == [0, 1]
    moving = create(prep, "Move me")
    path = f"/cf/ideas/{moving['id']}"
    moved = prep.client.patch(path, json={"status": "ready"}).json()
    assert moved["position"] == 2
    assert prep.client.patch(path, json={"status": "ready"}).json()["position"] == 2
    assert prep.client.patch(path, json={"status": "shot", "position": 9}).json()["position"] == 9
    assert create(prep, "Next", status="shot")["position"] == 10
    prep.db.add(ProjectMember(project_id=prep.other.id, user_id=prep.users["editor"].id, role=ProjectRole.editor))
    prep.db.flush()
    assert create(prep, "Separate", brand=prep.other.cf_brand, status="shot")["position"] == 0


@pytest.mark.parametrize("body", [
    {"title": None}, {"title": " \n"}, {"title": "a" * 201}, {"status": None}, {"status": "bad"},
    {"hook": "a" * 501}, {"pillar": "a" * 65}, {"format": "a" * 65},
    {"angle": "a" * 20001}, {"notes": "a" * 20001}, {"script_text": "a" * 100001},
    {"tracker_cf_id": "bad_id"}, {"tracker_cf_id": ""}, {"tracker_cf_id": "a" * 17},
    {"position": -1}, {"position": None}, {"position": 1.5},
    {"script": {"beats": [{}] * 201}}, {"script": {"beats": [{"text": "a" * 5001}]}},
    {"script": {"beats": [{"broll": "a" * 1001}]}}, {"script": {"cta": "a" * 2001}},
])
def test_patch_limits(prep, body):
    idea = create(prep)
    assert prep.client.patch(f"/cf/ideas/{idea['id']}", json=body).status_code == 422


def test_create_validation_and_nullable_patch(prep):
    for fields in ({}, {"title": ""}, {"title": None}, {"title": "ok", "status": None}, {"title": "ok", "hook": "a" * 501}):
        assert prep.client.post("/cf/ideas", json={"brand": prep.project.cf_brand, **fields}).status_code == 422
    idea = create(prep, notes="Notes", script_text="Text")
    path = f"/cf/ideas/{idea['id']}"
    assert prep.client.patch(path, json={"tracker_cf_id": "CF-123"}).json()["tracker_cf_id"] == "CF-123"
    result = prep.client.patch(path, json={"tracker_cf_id": None, "notes": None, "script_text": None}).json()
    assert all(result[key] is None for key in ("tracker_cf_id", "notes", "script_text"))


def test_ideas_migration_round_trip():
    """Run serially on the test database; intentionally does not use real_db."""
    from apps.api.config import settings

    api_dir = Path(__file__).resolve().parents[1]
    env = {**os.environ, "DATABASE_URL": settings.database_url}
    # Alembic's env imports database/models at top level. A separate interpreter
    # prevents their metadata from colliding with apps.api.* already in pytest.
    runner = (
        "from alembic import command; from alembic.config import Config; import sys; "
        "cfg = Config(sys.argv[1]); cfg.set_main_option('script_location', sys.argv[2]); "
        "getattr(command, sys.argv[3])(cfg, sys.argv[4])"
    )

    def migrate(action, target):
        subprocess.run([sys.executable, "-c", runner, str(api_dir / "alembic.ini"),
                        str(api_dir / "alembic"), action, target],
                       cwd=api_dir, env=env, check=True, timeout=120)

    def tables():
        engine = create_engine(settings.database_url)
        try:
            return inspect(engine).get_table_names()
        finally:
            engine.dispose()

    try:
        migrate("downgrade", "cf02b3c4d5e6")
        assert "cf_ideas" not in tables()
        migrate("upgrade", "head")
        assert "cf_ideas" in tables()
    finally:
        migrate("upgrade", "head")


def test_retention_gc_unlinks_purged_asset_and_purges_project_ideas(prep):
    """The nightly GC hard-deletes soft-deleted assets/projects; cf_ideas must not block it."""
    from apps.api.tasks.cleanup_tasks import PurgeCounts, _purge_asset, _purge_project

    shot = create(prep, "Shot one")
    assert prep.client.patch(f"/cf/ideas/{shot['id']}", json={"asset_id": str(prep.asset.id)}).status_code == 200
    _purge_asset(prep.db, prep.asset.id, PurgeCounts())
    prep.db.expire_all()
    row = prep.db.get(CfIdea, UUID(shot["id"]))
    assert row is not None and row.asset_id is None

    _purge_project(prep.db, prep.project.id, PurgeCounts())
    prep.db.expire_all()
    assert prep.db.get(CfIdea, UUID(shot["id"])) is None


def test_ideas_in_a_deleted_project_are_gone(prep):
    idea = create(prep, "Before the project went away")
    prep.project.deleted_at = datetime.now(timezone.utc)
    prep.db.flush()
    assert prep.client.get(f"/cf/ideas/{idea['id']}").status_code == 404
    assert prep.client.patch(f"/cf/ideas/{idea['id']}", json={"title": "x"}).status_code == 404
    assert prep.client.delete(f"/cf/ideas/{idea['id']}").status_code == 404


def test_retention_gc_hard_deletes_expired_soft_deleted_ideas(prep):
    from apps.api.tasks import cleanup_tasks

    kept = create(prep, "Recently deleted")
    expired = create(prep, "Deleted long ago")
    live = create(prep, "Still here")
    prep.db.query(CfIdea).filter(CfIdea.id == UUID(kept["id"])).update(
        {CfIdea.deleted_at: datetime.now(timezone.utc)})
    prep.db.query(CfIdea).filter(CfIdea.id == UUID(expired["id"])).update(
        {CfIdea.deleted_at: datetime.now(timezone.utc) - timedelta(days=365)})
    prep.db.flush()
    with patch.object(cleanup_tasks, "_retention_days", return_value=30), \
            patch.object(cleanup_tasks, "_safe", lambda *a, **k: None):
        cleanup_tasks._purge_soft_deleted(prep.db, cleanup_tasks.PurgeCounts())
    remaining = {row.title for row in prep.db.query(CfIdea).filter(CfIdea.project_id == prep.project.id)}
    assert remaining == {"Recently deleted", "Still here"}
    assert live["title"] in remaining
