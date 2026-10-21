"""Style Studio contract tests on the existing transactional Postgres fixture."""
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from apps.api.models.cf_style import CfStyle, CfStyleVersion, CfStyleTemplate
from apps.api.models.project import ProjectMember
from apps.api.services import cf_styles, cf_style_templates
from apps.api.tests.test_cf_feedback import prep, asset, version

VERSION_FIELDS = set("id style_id version status design_md style_json skin_css answers request changelog sample_asset_id sample_url preview error attempt created_by approved_by approved_at created_at".split())
STYLE_FIELDS = set("id project_id brand name slug description is_default origin template_key current_version_id archived_at created_at updated_at current_version open_proposals building_count".split())
BUILD_FIELDS = set("version_id style_id project_id brand style_name style_slug version mode answers request attempt base_version template".split())


@pytest.fixture(autouse=True)
def no_webhooks(monkeypatch):
    monkeypatch.setattr(cf_styles, "notify", lambda payload: True)


def request(prep, method, path, body=None, role="owner", code=200, **kwargs):
    prep.actor["user"] = prep.users[role]
    response = getattr(prep.client, method)("/cf" + path, **({"json": body} if body is not None else {}), **kwargs)
    assert response.status_code == code, response.text
    return response.json()


def create(prep, name="Story mode", **fields):
    return request(prep, "post", "/styles", {"brand": prep.project.cf_brand, "name": name, **fields})


def interview(prep, **fields):
    return request(prep, "post", "/style-interviews", {"brand": prep.project.cf_brand, "mode": "new", **fields})


def build(prep, **answers):
    row = interview(prep)
    request(prep, "patch", f"/style-interviews/{row['id']}", {"answers": {"answers": answers}})
    return request(prep, "post", f"/style-interviews/{row['id']}/submit")


def proposal(prep, version_id):
    return request(prep, "post", f"/style-versions/{version_id}/proposed", {
        "design_md": "Keep the story clear.", "style_json": {"pace": 3}, "skin_css": "body { color: white; }",
        "preview": {"palette": ["#ffffff"]}, "changelog": "Clearer captions"}, role="agent")


def approved(prep, name="Story mode"):
    row = build(prep, style_name=name)
    proposal(prep, row["version_id"])
    request(prep, "post", f"/style-versions/{row['version_id']}/approve")
    return row


def template(key=None):
    return {"key": key or "test-" + uuid4().hex, "name": "Clear story", "summary": "A clean start",
            "best_for": "Stories", "why_it_works": "The story stays visible", "tags": ["clean"],
            "design_md": "Use clear captions.", "style_json": {"pace": 3}, "preview": {"palette": ["#ffffff"]}}


@pytest.mark.parametrize("role,expected", [("agent", 200), ("owner", 403), ("editor", 403), ("outsider", 403)])
def test_template_sample_upload_auth(prep, monkeypatch, role, expected):
    from unittest.mock import MagicMock
    from apps.api.services import s3_service
    item = template()
    request(prep, "post", "/style-templates/seed", [item], role="agent")
    put = MagicMock()
    monkeypatch.setattr(s3_service, "put_object", put)
    monkeypatch.setattr(s3_service, "generate_presigned_get_url", lambda key: "https://media.test/" + key)
    request(prep, "put", f"/style-templates/{item['key']}/sample", role=role, code=expected,
            files={"file": ("sample.mp4", b"\x00\x00\x00\x18ftypisom", "video/mp4")})
    assert put.call_count == (1 if expected == 200 else 0)


def test_template_sample_persists_replaces_and_survives_reseeding(prep, monkeypatch):
    from unittest.mock import MagicMock, call
    from apps.api.services import s3_service
    item = template()
    request(prep, "post", "/style-templates/seed", [item], role="agent")
    put, delete = MagicMock(), MagicMock()
    monkeypatch.setattr(s3_service, "put_object", put)
    monkeypatch.setattr(s3_service, "delete_object", delete)
    monkeypatch.setattr(s3_service, "generate_presigned_get_url", lambda key: "https://media.test/" + key)
    path = f"/style-templates/{item['key']}"
    video = ("sample.mp4", b"\x00\x00\x00\x18ftypisom", "video/mp4")
    first = request(prep, "put", path + "/sample", role="agent",
                    files={"file": video, "poster": ("poster.png", b"\x89PNG\r\n\x1a\n", "image/png")})
    prep.db.expire_all()
    row = prep.db.get(CfStyleTemplate, item["key"])
    old_sample, old_poster = row.sample_s3_key, row.poster_s3_key
    assert first["sample_url"] == "https://media.test/" + old_sample
    assert first["poster_url"] == "https://media.test/" + old_poster
    request(prep, "post", "/style-templates/seed", [{**item, "name": "Updated"}], role="agent")
    read = request(prep, "get", path)
    assert (read["sample_url"], read["poster_url"]) == (first["sample_url"], first["poster_url"])
    replacement = request(prep, "put", path + "/sample", role="agent", files={"file": video})
    prep.db.expire_all()
    row = prep.db.get(CfStyleTemplate, item["key"])
    assert row.sample_s3_key != old_sample and row.poster_s3_key is None
    assert replacement["sample_url"] == "https://media.test/" + row.sample_s3_key
    assert replacement["poster_url"] is None
    assert delete.call_args_list == [call(old_sample), call(old_poster)]
    assert any(event[1:] == ("cf_style_updated", {"brand": prep.project.cf_brand, "style_id": None}) for event in prep.events)


@pytest.mark.parametrize("role,read,write", [("owner", 200, 200), ("editor", 200, 403),
    ("agent", 200, 403), ("outsider", 403, 403), ("viewer", 403, 403), ("reviewer", 403, 403)])
def test_style_auth_matrix(prep, role, read, write):
    style = create(prep)
    request(prep, "get", f"/styles/{style['id']}", role=role, code=read)
    request(prep, "get", "/styles", role=role, code=read, params={"brand": prep.project.cf_brand})
    request(prep, "patch", f"/styles/{style['id']}", {"name": "Changed"}, role=role, code=write)


@pytest.mark.parametrize("role,expected", [("owner", 403), ("editor", 403), ("agent", 200), ("outsider", 403)])
def test_agent_build_auth_and_lease(prep, role, expected):
    row = build(prep)
    request(prep, "get", "/style-builds/due", role=role, code=expected)
    request(prep, "post", f"/style-versions/{row['version_id']}/claim", role=role, code=expected)


def test_removed_agent_membership_blocks_builds(prep):
    row = build(prep)
    prep.db.query(ProjectMember).filter_by(project_id=prep.project.id, user_id=prep.users["agent"].id).one().deleted_at = datetime.now(timezone.utc)
    request(prep, "post", f"/style-versions/{row['version_id']}/claim", role="agent", code=403)
    assert request(prep, "get", "/style-builds/due", role="agent") == []


def test_interview_merge_submit_and_exact_shapes(prep, monkeypatch):
    messages = []
    monkeypatch.setattr(cf_styles, "notify", messages.append)
    row = interview(prep)
    path = f"/style-interviews/{row['id']}"
    first = {"version": "old", "ratings": {"look-1": "love", "look-2": "no"}, "notes": {"section:type": "Big"},
             "answers": {"style_name": "Story", "words": {"is": ["warm"], "never": ["loud"]}, "platforms": ["ig", "yt"]},
             "future": {"keep": True}}
    request(prep, "patch", path, {"answers": first})
    saved = request(prep, "patch", path, {"answers": {"ratings": {"look-2": None}, "notes": {"section:type": None},
        "answers": {"words": {"is": ["clear"]}, "platforms": ["yt"]}}})
    assert saved["answers"] == {"version": "style-lab-v3", "ratings": {"look-1": "love"}, "notes": {},
        "answers": {"style_name": "Story", "words": {"is": ["clear"]}, "platforms": ["yt"]}, "future": {"keep": True}}
    submitted = request(prep, "post", path + "/submit")
    assert set(submitted) == {"style_id", "version_id"}
    detail = request(prep, "get", f"/styles/{submitted['style_id']}")
    assert set(detail) == STYLE_FIELDS | {"versions"}
    assert set(detail["versions"][0]) == VERSION_FIELDS
    assert detail["versions"][0]["answers"] == saved["answers"]
    assert detail["name"] == "Story" and detail["is_default"]
    assert request(prep, "get", path)["status"] == "submitted"
    request(prep, "patch", path, {"answers": {}}, code=409)
    request(prep, "post", path + "/submit", code=409)
    assert messages[0] == cf_styles.payload(prep.db.get(CfStyle, UUID(submitted["style_id"])),
        prep.db.get(CfStyleVersion, UUID(submitted["version_id"])), "style_build_requested", "new")
    assert any(event[1] == "cf_style_updated" and event[2]["style_id"] == submitted["style_id"] for event in prep.events)


def test_unique_slugs_default_and_versions(prep):
    first = create(prep, "Same name")
    second = create(prep, "Same name")
    assert first["slug"] == "same-name" and second["slug"] == "same-name-2"
    assert first["is_default"] and not second["is_default"]
    request(prep, "post", f"/styles/{first['id']}/archive", code=409)
    request(prep, "post", f"/styles/{second['id']}/default", code=409)
    with pytest.raises(IntegrityError), prep.db.begin_nested():
        prep.db.get(CfStyle, UUID(second["id"])).is_default = True
        prep.db.flush()


def test_approve_restore_reject_and_monotonic_versions(prep):
    first = approved(prep)
    current = first["version_id"]
    row = request(prep, "post", f"/styles/{first['style_id']}/improve", {"request": "Bigger captions"})
    assert row["version"] == 2 and row["status"] == "building"
    proposal(prep, row["id"])
    request(prep, "post", f"/style-versions/{row['id']}/approve")
    request(prep, "post", f"/style-versions/{current}/approve", code=409)
    restored = request(prep, "post", f"/style-versions/{current}/restore")
    assert restored["status"] == "proposed" and restored["version"] == 3
    assert restored["approved_by"] is None and restored["approved_at"] is None
    request(prep, "post", f"/style-versions/{restored['id']}/reject", {"note": "Keep the new one"})
    next_row = request(prep, "post", f"/styles/{first['style_id']}/improve", {"request": "Calmer motion"})
    assert next_row["version"] == 4
    detail = request(prep, "get", f"/styles/{first['style_id']}")
    assert [v["version"] for v in detail["versions"]] == [4, 3, 2, 1]
    assert detail["current_version_id"] == row["id"]


def test_default_flip_archive_and_active_override(prep):
    first, second = approved(prep, "First"), approved(prep, "Second")
    clip = asset(prep)
    params = {"brand": prep.project.cf_brand, "asset_id": str(clip.id)}
    assert request(prep, "get", "/styles/active", params=params)["style_id"] == first["style_id"]
    request(prep, "put", f"/assets/{clip.id}/style", {"style_id": second["style_id"]})
    chosen = request(prep, "get", "/styles/active", params=params)
    assert chosen["source"] == "asset" and chosen["version_id"] == second["version_id"]
    request(prep, "put", f"/assets/{clip.id}/style", {"style_id": None})
    assert request(prep, "get", "/styles/active", params=params)["source"] == "default"
    request(prep, "post", f"/styles/{second['style_id']}/default")
    rows = request(prep, "get", "/styles", params={"brand": prep.project.cf_brand})
    assert [row["id"] for row in rows if row["is_default"]] == [second["style_id"]]
    request(prep, "post", f"/styles/{first['style_id']}/archive")
    request(prep, "get", f"/styles/{first['style_id']}", code=404)


def test_active_empty_and_brand_readiness(prep):
    assert request(prep, "get", "/styles/active", params={"brand": prep.project.cf_brand}, code=404) == {"detail": cf_styles.NO_STYLE}
    def ready():
        return next(row for row in request(prep, "get", "/brands") if row["brand"] == prep.project.cf_brand)["style_ready"]
    assert not ready()
    row = build(prep)
    proposal(prep, row["version_id"])
    assert not ready()
    request(prep, "post", f"/style-versions/{row['version_id']}/approve")
    assert ready()


def test_due_claim_expiry_quiet_retries_and_owner_retry(prep, monkeypatch):
    instant = datetime.now(timezone.utc)
    monkeypatch.setattr(cf_styles, "now", lambda: instant)
    row = build(prep)
    id = row["version_id"]
    def due():
        return request(prep, "get", "/style-builds/due", role="agent", params={"brand": prep.project.cf_brand})
    assert set(due()[0]) == BUILD_FIELDS
    claim = request(prep, "post", f"/style-versions/{id}/claim", role="agent")
    assert claim["base_version"] is None and claim["mode"] == "new"
    assert not due()
    request(prep, "post", f"/style-versions/{id}/claim", role="agent", code=409)
    instant += timedelta(minutes=45)
    assert len(due()) == 1
    for attempt in (1, 2, 3):
        request(prep, "post", f"/style-versions/{id}/claim", role="agent")
        result = request(prep, "post", f"/style-versions/{id}/fail", {"error": "Render stopped"}, role="agent")
        assert result["attempt"] == attempt
        assert result["status"] == ("failed" if attempt == 3 else "building")
        assert result["error"] is None if attempt < 3 else "I need you on this one" in result["error"]
        assert not due()
        if attempt < 3:
            instant += timedelta(minutes=10)
            assert len(due()) == 1
    request(prep, "post", f"/style-versions/{id}/retry", role="agent", code=403)
    result = request(prep, "post", f"/style-versions/{id}/retry")
    assert result["attempt"] == 0 and result["status"] == "building" and result["error"] is None
    assert len(due()) == 1


def test_template_seed_idempotency_trends_and_recommendations(prep):
    item = template()
    result = request(prep, "post", "/style-templates/seed", [item, {"key": "bad"}], role="agent")
    assert result["upserted"] == [item["key"]] and result["skipped"][0]["key"] == "bad"
    request(prep, "put", f"/style-templates/{item['key']}/trend", {"trend_note": "Clear hooks"}, role="agent")
    saved = prep.db.get(CfStyleTemplate, item["key"])
    saved.sample_url = "https://example.test/real.mp4"
    stamp = saved.trend_updated_at
    cf_style_templates.upsert_templates(prep.db, [{**item, "name": "Updated", "trend_note": "Old trend", "sample_url": "https://example.test/old.mp4"}])
    prep.db.flush()
    prep.db.refresh(saved)
    assert saved.name == "Updated" and saved.trend_note == "Clear hooks"
    assert saved.trend_updated_at == stamp and saved.sample_url == "https://example.test/real.mp4"
    assert prep.db.query(CfStyleTemplate).filter_by(key=item["key"]).count() == 1
    rec = request(prep, "post", "/style-recommendations", {"brand": prep.project.cf_brand, "kind": "template",
        "payload": {"template_key": item["key"]}, "reason": "Matches your pace"}, role="agent")
    rows = request(prep, "get", "/style-templates", params={"brand": prep.project.cf_brand})
    assert next(row for row in rows if row["key"] == item["key"])["recommended_for_brand"] is True
    request(prep, "post", f"/style-recommendations/{rec['id']}/use")
    rows = request(prep, "get", "/style-templates", params={"brand": prep.project.cf_brand})
    assert next(row for row in rows if row["key"] == item["key"])["recommended_for_brand"] is False
    assert "recommended_for_brand" not in request(prep, "get", f"/style-templates/{item['key']}")


def test_template_create_copy_and_prefill(prep):
    item = template()
    request(prep, "post", "/style-templates/seed", [item], role="agent")
    row = create(prep, from_template=item["key"])
    assert row["origin"] == "template" and row["current_version"] is None
    prefill = interview(prep, style_id=row["id"])
    assert prefill["answers"]["ratings"] == {"tmpl-" + item["key"]: "love"}
    copied = create(prep, "Copy", copy_of=row["id"])
    detail = request(prep, "get", f"/styles/{copied['id']}")
    assert detail["versions"][0]["design_md"] == item["design_md"]
    assert detail["versions"][0]["status"] == "proposed"


def test_import_idempotent_no_approval_overwrite(prep):
    data = {"brand": prep.project.cf_brand, "name": "Genius Cut", "design_md": "Original", "style_json": {},
            "skin_css": "", "preview": {}, "answers": {}, "make_default": True}
    first = request(prep, "post", "/styles/seed", data, role="agent")
    second = request(prep, "post", "/styles/seed", {**data, "design_md": "Changed"}, role="agent")
    assert first == second and first["current_version"]["design_md"] == "Original"
    assert first["current_version"]["status"] == "approved" and first["is_default"]
    assert prep.db.query(CfStyleVersion).filter_by(style_id=UUID(first["id"])).count() == 1


def test_improve_prefills_latest_answers_and_base_version(prep):
    first = approved(prep)
    interview_row = interview(prep, mode="improve", style_id=first["style_id"])
    assert interview_row["answers"]["answers"]["style_name"] == "Story mode"
    request(prep, "post", f"/style-interviews/{interview_row['id']}/submit")
    due = request(prep, "get", "/style-builds/due", role="agent")[0]
    assert due["mode"] == "improve" and due["base_version"]["id"] == first["version_id"]


def test_cross_brand_asset_and_sample_rejected(prep):
    row = build(prep)
    other = asset(prep, project_id=prep.other.id)
    request(prep, "get", "/styles/active", params={"brand": prep.project.cf_brand, "asset_id": str(other.id)}, code=404)
    request(prep, "post", f"/style-versions/{row['version_id']}/proposed", {
        "design_md": "Style", "style_json": {}, "skin_css": "", "preview": {}, "changelog": "New", "sample_asset_id": str(other.id)}, role="agent", code=422)


def test_playable_sample_url(prep, monkeypatch):
    from apps.api.models.asset import MediaFile
    row = build(prep)
    clip = asset(prep)
    v = version(prep, clip)
    prep.db.add(MediaFile(version_id=v.id, file_type="video", original_filename="sample.mp4",
        mime_type="video/mp4", file_size_bytes=10, s3_key_raw="raw/sample.mp4", s3_key_download="ready/sample.mp4"))
    prep.db.flush()
    monkeypatch.setattr("apps.api.services.s3_service.generate_presigned_get_url", lambda key: "https://example.test/" + key)
    result = request(prep, "post", f"/style-versions/{row['version_id']}/proposed", {"design_md": "Style", "style_json": {},
        "skin_css": "", "preview": {}, "changelog": "New", "sample_asset_id": str(clip.id)}, role="agent")
    assert result["sample_url"] == "https://example.test/ready/sample.mp4"


def test_feedback_provenance_records_approved_snapshot(prep):
    from apps.api.models.cf_feedback import CfFeedbackRun
    from apps.api.tests.test_cf_feedback import setup_note
    style = approved(prep)
    clip, source, note = setup_note(prep)
    run = request(prep, "post", "/feedback/runs", {"asset_id": str(clip.id), "comment_ids": [str(note.id)],
        "style_version_id": style["version_id"]}, role="agent")
    assert run["style_version_id"] == style["version_id"]
    saved = prep.db.get(CfFeedbackRun, UUID(run["id"]))
    assert str(saved.style_version_id) == style["version_id"]
    unapproved = build(prep)
    request(prep, "post", f"/feedback/runs/{run['id']}/progress", {"note": "Editing", "style_version_id": unapproved["version_id"]}, role="agent", code=422)
    assert str(saved.style_version_id) == style["version_id"]


def test_cleanup_unlinks_sample_and_removes_project_styles(prep):
    from apps.api.tasks import cleanup_tasks
    from apps.api.models.cf_style import CfStyleInterview, CfStyleRecommendation
    row = approved(prep)
    clip = asset(prep)
    sample = prep.db.get(CfStyleVersion, UUID(row["version_id"]))
    sample.sample_asset_id = clip.id
    prep.db.flush()
    cleanup_tasks._purge_asset(prep.db, clip.id, cleanup_tasks.PurgeCounts())
    prep.db.refresh(sample)
    assert sample.sample_asset_id is None and sample.status == "approved"
    request(prep, "post", "/style-recommendations", {"brand": prep.project.cf_brand, "kind": "improvement",
        "payload": {"style_id": row["style_id"], "change": "Bigger type"}, "reason": "Easier to read"}, role="agent")
    cleanup_tasks._purge_project(prep.db, prep.project.id, cleanup_tasks.PurgeCounts())
    assert prep.db.query(CfStyle).filter_by(id=UUID(row["style_id"])).count() == 0
    assert prep.db.query(CfStyleVersion).filter_by(id=UUID(row["version_id"])).count() == 0
    assert prep.db.query(CfStyleInterview).filter_by(project_id=prep.project.id).count() == 0
    assert prep.db.query(CfStyleRecommendation).filter_by(brand=prep.project.cf_brand).count() == 0


@pytest.mark.parametrize("role,code", [("agent", 200), ("editor", 403), ("outsider", 403)])
def test_agent_can_request_improve_but_not_approve(prep, role, code):
    first = approved(prep)
    row = request(prep, "post", f"/styles/{first['style_id']}/improve", {"request": "Bigger captions"}, role=role, code=code)
    if code == 200:
        assert row["status"] == "building"
        proposal(prep, row["id"])
        request(prep, "post", f"/style-versions/{row['id']}/approve", role="agent", code=403)
