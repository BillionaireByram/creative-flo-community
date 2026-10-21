"""Template preview uploads exercise the real routes with mocked database and storage."""
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, call
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from apps.api.models.cf_style import CfStyleTemplate, CfStyleVersion
from apps.api.models.project import ProjectMember, ProjectRole
from apps.api.schemas import cf_styles as wire
from apps.api.services import cf_styles as service, cf_style_templates as library

MP4 = b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isomiso2"
PNG = b"\x89PNG\r\n\x1a\nposter"
JPG = b"\xff\xd8\xffposter"
PATH = "/cf/style-templates/clear-story/sample"


@pytest.fixture
def sample_env(client, mock_db, test_user, auth_headers, monkeypatch):
    monkeypatch.setattr("apps.api.middleware.global_rate_limit.GlobalRateLimitMiddleware._check",
                        lambda self, identity, action, limit: (True, 0))
    row = CfStyleTemplate(key="clear-story", name="Clear story", summary="A clean start", best_for="Stories",
        why_it_works="Clear captions", tags=["clean"], design_md="Keep the speaker visible", style_json={},
        preview={}, sort=0, active=True)
    actor = SimpleNamespace(role=ProjectRole.editor)
    member_query, template_query = MagicMock(), MagicMock()
    for query in (member_query, template_query):
        for method in ("filter", "join", "order_by", "with_for_update", "populate_existing"):
            getattr(query, method).return_value = query
    member_query.first.side_effect = lambda: actor if actor.role else None
    template_query.first.return_value = row
    template_query.all.return_value = [row]
    other_query = MagicMock()
    other_query.filter.return_value = other_query
    other_query.all.return_value = []
    mock_db.query.side_effect = lambda model: {ProjectMember: member_query, CfStyleTemplate: template_query}.get(model, other_query)
    test_user.email = "agent@test.local"
    monkeypatch.setattr(service.settings, "cf_agent_emails", "agent@test.local")
    put, delete = MagicMock(), MagicMock()
    monkeypatch.setattr(service.s3_service, "put_object", put)
    monkeypatch.setattr(service.s3_service, "delete_object", delete)
    monkeypatch.setattr(service.s3_service, "generate_presigned_get_url", lambda key: "https://media.test/" + key + "?signed=1")
    return SimpleNamespace(client=client, db=mock_db, user=test_user, actor=actor, row=row, query=template_query,
                           put=put, delete=delete, headers=auth_headers)


def upload(env, poster=None, video=("sample.mp4", MP4, "video/mp4"), code=200, path=PATH):
    files = {"file": video}
    if poster is not None:
        files["poster"] = poster
    response = env.client.put(path, files=files, headers=env.headers)
    assert response.status_code == code, response.text
    return response.json()


@pytest.mark.parametrize("role,expected", [("agent", 200), ("owner", 403), ("editor", 403), ("outsider", 403)])
def test_sample_auth(sample_env, role, expected):
    env = sample_env
    env.user.email = f"{role}@test.local"
    env.actor.role = {"owner": ProjectRole.owner, "editor": ProjectRole.editor,
                      "agent": ProjectRole.editor, "outsider": None}[role]
    upload(env, code=expected)
    assert env.put.call_count == (1 if expected == 200 else 0)


def test_sample_agent_needs_brand_membership(sample_env):
    sample_env.actor.role = None
    upload(sample_env, code=403)
    sample_env.put.assert_not_called()


@pytest.mark.parametrize("poster,extension", [(None, None), (("poster.png", PNG, "image/png"), ".png"),
    (("poster.jpg", JPG, "image/jpeg"), ".jpg"), (("poster.jpeg", JPG, "image/jpeg"), ".jpg")])
def test_upload_and_all_template_wire_paths(sample_env, poster, extension):
    env = sample_env
    env.row.sample_url = "https://legacy.test/sample.mp4"
    result = upload(env, poster)
    prefix, filename = env.row.sample_s3_key.rsplit("/", 1)
    assert prefix == "style-templates/clear-story"
    UUID(filename.removesuffix(".mp4"))
    assert result["sample_url"] == "https://media.test/" + env.row.sample_s3_key + "?signed=1"
    if poster:
        assert env.row.poster_s3_key == env.row.sample_s3_key.removesuffix(".mp4") + extension
        assert result["poster_url"] == "https://media.test/" + env.row.poster_s3_key + "?signed=1"
        assert env.put.call_args_list[1] == call(env.row.poster_s3_key, poster[1], content_type=poster[2])
    else:
        assert env.row.poster_s3_key is None and result["poster_url"] is None
    assert env.put.call_args_list[0] == call(env.row.sample_s3_key, MP4, content_type="video/mp4")
    env.db.commit.assert_called_once()
    assert "sample_s3_key" not in result and "poster_s3_key" not in result
    for path in ("/cf/style-templates", "/cf/style-templates/clear-story"):
        response = env.client.get(path, headers=env.headers)
        assert response.status_code == 200, response.text
        data = response.json()[0] if isinstance(response.json(), list) else response.json()
        assert (data["sample_url"], data["poster_url"]) == (result["sample_url"], result["poster_url"])
    trend = env.client.put("/cf/style-templates/clear-story/trend", json={"trend_note": "Clear hooks"}, headers=env.headers)
    assert trend.status_code == 200 and trend.json()["sample_url"] == result["sample_url"]


def test_build_response_resolves_template_media(sample_env):
    env = sample_env
    result = upload(env, ("poster.png", PNG, "image/png"))
    style = SimpleNamespace(id=uuid4(), project_id=uuid4(), brand="test", name="Story", slug="story",
                            template_key=env.row.key)
    version = CfStyleVersion(id=uuid4(), version=1, answers=None, request=None, attempt=0)
    version_query = MagicMock()
    version_query.filter.return_value.order_by.return_value.first.return_value = None
    query = env.db.query.side_effect
    env.db.query.side_effect = lambda model: version_query if model is CfStyleVersion else query(model)
    item = service.build_item(env.db, style, version)
    assert item.template.sample_url == result["sample_url"]
    assert item.template.poster_url == result["poster_url"]


@pytest.mark.parametrize("video", [("sample.mov", MP4, "video/quicktime"), ("sample.mp4", MP4, "text/plain"),
                                   ("sample.txt", MP4, "video/mp4"), ("sample.mp4", b"", "video/mp4")])
def test_invalid_sample_type_and_empty_file(sample_env, video):
    upload(sample_env, video=video, code=422)
    sample_env.put.assert_not_called()
    sample_env.db.commit.assert_not_called()


@pytest.mark.parametrize("poster", [("poster.gif", b"GIF89a", "image/gif"), ("poster.png", PNG, "text/plain"),
                                    ("poster.png", b"", "image/png")])
def test_invalid_poster_rejected_before_upload(sample_env, poster):
    upload(sample_env, poster, code=422)
    sample_env.put.assert_not_called()


def test_missing_file_and_unknown_template(sample_env):
    response = sample_env.client.put(PATH, files={"poster": ("poster.png", PNG, "image/png")}, headers=sample_env.headers)
    assert response.status_code == 422
    sample_env.query.first.return_value = None
    upload(sample_env, path="/cf/style-templates/missing/sample", code=404)
    sample_env.put.assert_not_called()


def test_sixty_mb_boundary_and_json_guard(sample_env):
    data = MP4 + b"\x00" * (service.MAX_TEMPLATE_SAMPLE_BYTES - len(MP4))
    upload(sample_env, video=("sample.mp4", data, "video/mp4"))
    sample_env.put.reset_mock()
    upload(sample_env, video=("sample.mp4", data + b"x", "video/mp4"), code=413)
    sample_env.put.assert_not_called()
    response = sample_env.client.put("/cf/style-templates/clear-story/trend", content=b"x" * (512 * 1024 + 1),
        headers={**sample_env.headers, "Content-Type": "application/json"})
    assert response.status_code == 413


def test_actual_read_is_bounded_when_size_missing_or_wrong(monkeypatch):
    monkeypatch.setattr(service, "MAX_TEMPLATE_SAMPLE_BYTES", 8)
    for reported in (None, 2):
        file = UploadFile(BytesIO(b"x" * 9), size=reported, filename="sample.mp4", headers=Headers({"content-type": "video/mp4"}))
        with pytest.raises(HTTPException) as error:
            service.template_media(file, {".mp4": "video/mp4"}, "an MP4 video")
        assert error.value.status_code == 413


@pytest.mark.parametrize("poster", [None, ("poster.png", PNG, "image/png")])
def test_replacement_deletes_old_objects_after_commit(sample_env, poster):
    env = sample_env
    env.row.sample_s3_key, env.row.poster_s3_key = "old.mp4", "old.jpg"
    env.delete.side_effect = lambda key: env.db.commit.assert_called_once()
    upload(env, poster)
    assert env.delete.call_args_list == [call("old.mp4"), call("old.jpg")]
    assert env.row.sample_s3_key != "old.mp4"
    assert env.row.poster_s3_key != "old.jpg"


def test_delete_failure_does_not_fail_replacement(sample_env):
    env = sample_env
    env.row.sample_s3_key, env.row.poster_s3_key = "old.mp4", "old.jpg"
    env.delete.side_effect = RuntimeError("storage offline")
    result = upload(env)
    assert result["sample_url"] and result["poster_url"] is None
    assert env.delete.call_count == 2


def test_poster_upload_failure_preserves_old_keys_and_cleans_new_files(sample_env):
    env = sample_env
    env.row.sample_s3_key, env.row.poster_s3_key = "old.mp4", "old.jpg"
    env.put.side_effect = [None, RuntimeError("storage offline")]
    upload(env, ("poster.png", PNG, "image/png"), code=503)
    assert (env.row.sample_s3_key, env.row.poster_s3_key) == ("old.mp4", "old.jpg")
    env.db.commit.assert_not_called()
    env.db.rollback.assert_called_once()
    assert env.delete.call_args_list == [call(args.args[0]) for args in env.put.call_args_list]


def test_database_failure_cleans_new_files_without_deleting_old(sample_env):
    env = sample_env
    env.row.sample_s3_key, env.row.poster_s3_key = "old.mp4", "old.jpg"
    env.db.commit.side_effect = RuntimeError("database offline")
    upload(env, code=503)
    env.db.rollback.assert_called_once()
    env.delete.assert_called_once_with(env.put.call_args.args[0])


def test_legacy_and_missing_urls(sample_env):
    env = sample_env
    for legacy in (None, "https://legacy.test/sample.mp4"):
        env.row.sample_url = legacy
        result = env.client.get("/cf/style-templates/clear-story", headers=env.headers).json()
        assert result["sample_url"] == legacy and result["poster_url"] is None


def test_signing_failure_is_quiet(sample_env, monkeypatch):
    sample_env.row.sample_s3_key, sample_env.row.poster_s3_key = "sample.mp4", "poster.png"
    monkeypatch.setattr(service.s3_service, "generate_presigned_get_url", MagicMock(side_effect=RuntimeError("offline")))
    result = service.template_wire(sample_env.row)
    assert result.sample_url is None and result.poster_url is None


def test_reseed_does_not_update_storage_keys(sample_env):
    from sqlalchemy.dialects import postgresql
    library.upsert_templates(sample_env.db, [wire.TemplateSeed.model_validate(sample_env.row, from_attributes=True)])
    sql = str(sample_env.db.execute.call_args.args[0].compile(dialect=postgresql.dialect()))
    assert "sample_s3_key =" not in sql and "poster_s3_key =" not in sql


def test_template_sample_migration_is_single_head_and_generates_reversible_sql():
    from io import StringIO
    from pathlib import Path
    from alembic.config import Config
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from alembic.script import ScriptDirectory

    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    scripts = ScriptDirectory.from_config(config)
    assert len(scripts.get_heads()) == 1
    assert "cf0be2f3a4b5" in {revision.revision for revision in scripts.walk_revisions()}
    revision = scripts.get_revision("cf0be2f3a4b5")
    assert revision.down_revision == "cf0ad1e2f3a4"
    output = StringIO()
    context = MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})
    with Operations.context(context):
        revision.module.upgrade()
        revision.module.downgrade()
    assert output.getvalue().splitlines() == [
        "ALTER TABLE cf_style_templates ADD COLUMN sample_s3_key TEXT;", "",
        "ALTER TABLE cf_style_templates ADD COLUMN poster_s3_key TEXT;", "",
        "ALTER TABLE cf_style_templates DROP COLUMN poster_s3_key;", "",
        "ALTER TABLE cf_style_templates DROP COLUMN sample_s3_key;", "",
    ]
