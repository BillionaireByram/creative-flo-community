"""Style Studio from first answer to the next edit, using the payloads the web app sends.

fixtures/style_studio_web_flow.json is written by the web tests (apps/web/components/cf-style/__tests__/
shared-shapes.test.ts): the exact autosave bodies the interview sends, in order, and the answers the app
expects to find saved afterwards. Every call below uses the same paths and bodies as apps/web/components/cf-style/api.ts.
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

import pytest

from apps.api.config import settings
from apps.api.models.cf_style import CfStyleInterview, CfStyleVersion
from apps.api.services import cf_style_templates, cf_styles
from apps.api.tests.test_cf_feedback import asset, prep  # noqa: F401  (the shared fixture)
from apps.api.tests.test_cf_styles import request

FLOW = json.loads((Path(__file__).parent / "fixtures" / "style_studio_web_flow.json").read_text())
PREVIEW_KEYS = {"palette", "fonts", "caption_sample", "caption_style", "transitions", "music_beds", "pace"}


@pytest.fixture
def webhooks(monkeypatch):
    sent = []
    monkeypatch.setattr(cf_styles, "notify", sent.append)
    return sent


def builder_payload(name):
    """What the builder on the render server submits for a finished style."""
    return {"design_md": f"# {name}\nKeep the story clear.", "style_json": {"pace": 6}, "skin_css": ":root{--accent:#d9b26a}",
            "preview": {"palette": ["#101010", "#d9b26a"], "fonts": ["Archivo", "Manrope"], "caption_sample": "Make your\nnext move",
                        "caption_style": "Karaoke glow", "transitions": ["Hard cuts only"], "music_beds": ["Minimal lo-fi"], "pace": 3},
            "changelog": f"Built {name}"}


def build_and_approve(prep, version_id, name, sample=None):
    due = request(prep, "get", "/style-builds/due", role="agent", params={"brand": prep.project.cf_brand})
    item = next(row for row in due if row["version_id"] == version_id)
    claimed = request(prep, "post", f"/style-versions/{version_id}/claim", role="agent")
    assert claimed["answers"] == item["answers"]
    body = builder_payload(name)
    if sample:
        body["sample_asset_id"] = str(sample.id)
    proposed = request(prep, "post", f"/style-versions/{version_id}/proposed", body, role="agent")
    assert proposed["status"] == "proposed"
    return item, request(prep, "post", f"/style-versions/{version_id}/approve")


def test_whole_style_studio_flow_with_the_web_payloads(prep, webhooks):
    brand = prep.project.cf_brand
    ready = lambda: next(row for row in request(prep, "get", "/brands") if row["brand"] == brand)["style_ready"]

    # The shared library is seeded from the repo files, and every card gets one preview shape.
    templates = cf_style_templates.load_templates_from_dir(settings.cf_style_templates_dir)
    assert len(templates) >= 9
    seeded = request(prep, "post", "/style-templates/seed", [item.model_dump() for item in templates], role="agent")
    assert seeded["skipped"] == [] and len(seeded["upserted"]) == len(templates)
    library = request(prep, "get", "/style-templates", params={"brand": brand})
    assert {"genius-cut", "fast-cut"} <= {row["key"] for row in library}
    for row in library:
        assert PREVIEW_KEYS <= set(row["preview"]), row["key"]
        assert isinstance(row["preview"]["fonts"], list) and isinstance(row["preview"]["music_beds"], list)
        assert row["recommended_for_brand"] is False
    assert not ready()
    request(prep, "get", "/styles/active", params={"brand": brand}, code=404)

    # Interview: start, autosave exactly as the web sends it, and read it back.
    row = request(prep, "post", "/style-interviews", {"brand": brand, "mode": "new"})
    assert row["status"] == "in_progress" and row["answers"] == {"version": "style-lab-v3", "ratings": {}, "notes": {}, "answers": {}}
    for patch in FLOW["patches"]:
        request(prep, "patch", f"/style-interviews/{row['id']}", patch)
    saved = request(prep, "get", f"/style-interviews/{row['id']}")
    assert saved["answers"] == FLOW["final"]
    assert saved["answers"]["progress"]["section"] == 13
    assert "words" in saved["answers"]["answers"] and saved["answers"]["answers"]["done"] is True

    # Submit builds a style named from the answers, with the interview as its answers (minus where the person stopped).
    submitted = request(prep, "post", f"/style-interviews/{row['id']}/submit")
    assert [event["event"] for event in webhooks] == ["creative_flo.style_build_requested"]
    assert webhooks[0]["mode"] == "new" and webhooks[0]["app_url"].endswith(f"/{brand}/style/{submitted['style_id']}")
    detail = request(prep, "get", f"/styles/{submitted['style_id']}")
    assert detail["name"] == FLOW["final"]["answers"]["style_name"] and detail["is_default"] is True
    assert detail["building_count"] == 1 and detail["current_version"] is None and not ready()
    first = detail["versions"][0]
    assert first["status"] == "building" and "progress" not in first["answers"]
    assert first["answers"] == {key: value for key, value in FLOW["final"].items() if key != "progress"}
    listing = request(prep, "get", "/styles", params={"brand": brand})
    assert isinstance(listing, list) and listing[0]["building_count"] == 1 and listing[0]["open_proposals"] == 0
    assert request(prep, "get", f"/style-interviews/{row['id']}")["status"] == "submitted"

    # The agent claims the build, proposes, and the owner approves. The interview is finished once its answers are built.
    sample = asset(prep, name="Style sample.mp4")
    item, approved = build_and_approve(prep, submitted["version_id"], detail["name"], sample)
    assert item["mode"] == "new" and item["base_version"] is None and item["answers"] == first["answers"]
    assert [event["event"] for event in webhooks] == ["creative_flo.style_build_requested", "creative_flo.style_proposed"]
    assert webhooks[1]["name"] == detail["name"] and webhooks[1]["version_id"] == submitted["version_id"]
    assert approved["status"] == "approved" and approved["sample_asset_id"] == str(sample.id) and approved["sample_url"] is None
    assert request(prep, "get", f"/style-interviews/{row['id']}")["status"] == "built"
    assert ready()
    active = request(prep, "get", "/styles/active", params={"brand": brand})
    assert (active["source"], active["version"], active["style_id"]) == ("default", 1, submitted["style_id"])

    # A second style starts from a template, is customized in an improve interview, built, approved and made the default.
    copy = request(prep, "post", "/styles", {"brand": brand, "name": "Fast and bold", "from_template": "fast-cut"})
    assert copy["origin"] == "template" and copy["template_key"] == "fast-cut" and copy["is_default"] is False
    custom = request(prep, "post", "/style-interviews", {"brand": brand, "style_id": copy["id"], "mode": "improve"})
    assert custom["answers"]["ratings"] == {"tmpl-fast-cut": "love"}
    request(prep, "patch", f"/style-interviews/{custom['id']}", {"answers": {"answers": {"brand": "Studio", "pace": 9}, "progress": {"section": 3, "updated": "2026-10-06T12:00:00.000Z"}}})
    second = request(prep, "post", f"/style-interviews/{custom['id']}/submit")
    assert second["style_id"] == copy["id"]
    item, approved_copy = build_and_approve(prep, second["version_id"], "Fast and bold")
    assert item["template"]["key"] == "fast-cut" and item["answers"]["answers"] == {"brand": "Studio", "pace": 9}
    # The template's own starting proposal (v1) is older than the approved build (v2), so nothing waits on the owner.
    after_template = request(prep, "get", f"/styles/{copy['id']}")
    assert [(v["version"], v["status"]) for v in after_template["versions"]] == [(2, "approved"), (1, "proposed")]
    assert after_template["open_proposals"] == 0
    made_default = request(prep, "post", f"/styles/{copy['id']}/default")
    assert made_default["is_default"] is True
    assert [row["id"] for row in request(prep, "get", "/styles", params={"brand": brand}) if row["is_default"]] == [copy["id"]]
    assert request(prep, "get", "/styles/active", params={"brand": brand})["style_id"] == copy["id"]

    # One video keeps the first style. The setting is read back from the asset and removed again.
    clip = asset(prep)
    chosen = request(prep, "put", f"/assets/{clip.id}/style", {"style_id": submitted["style_id"]})
    assert chosen == {"asset_id": str(clip.id), "style_id": submitted["style_id"]}
    prep.actor["user"] = prep.users["owner"]
    read_back = prep.client.get(f"/assets/{clip.id}")
    assert read_back.status_code == 200 and read_back.json()["cf_style_id"] == submitted["style_id"]
    pinned = request(prep, "get", "/styles/active", params={"brand": brand, "asset_id": str(clip.id)})
    assert (pinned["source"], pinned["style_id"], pinned["version_id"]) == ("asset", submitted["style_id"], submitted["version_id"])
    assert request(prep, "put", f"/assets/{clip.id}/style", {"style_id": None}) == {"asset_id": str(clip.id), "style_id": None}
    assert request(prep, "get", "/styles/active", params={"brand": brand, "asset_id": str(clip.id)})["source"] == "default"
    request(prep, "put", f"/assets/{clip.id}/style", {"style_id": submitted["style_id"]}, role="editor", code=403)

    # An improvement request builds a version 2 from the approved one and replaces it once approved.
    improved = request(prep, "post", f"/styles/{copy['id']}/improve", {"request": "Make my captions bigger from now on"})
    assert improved["status"] == "building" and improved["version"] == 3 and improved["request"] == "Make my captions bigger from now on"
    item, approved_two = build_and_approve(prep, improved["id"], "Fast and bold")
    assert item["mode"] == "improve" and item["base_version"]["id"] == second["version_id"]
    assert request(prep, "get", "/styles/active", params={"brand": brand})["version"] == 3
    assert webhooks[-1]["event"] == "creative_flo.style_proposed"

    # A build that keeps failing becomes a failed version the owner can restart with the retry endpoint.
    again = request(prep, "post", f"/styles/{copy['id']}/improve", {"request": "Calmer motion"})
    clock = {"now": datetime.now(timezone.utc)}
    for attempt in (1, 2, 3):
        request(prep, "post", f"/style-versions/{again['id']}/claim", role="agent")
        failed = request(prep, "post", f"/style-versions/{again['id']}/fail", {"error": "Render stopped"}, role="agent")
        assert failed["attempt"] == attempt and failed["status"] == ("failed" if attempt == 3 else "building")
        if attempt < 3:
            prep.db.get(CfStyleVersion, UUID(again["id"])).next_try_at = clock["now"] - timedelta(seconds=1)
            prep.db.flush()
    assert failed["error"].startswith("I need you on this one")
    assert "Render stopped" not in json.dumps(failed)
    assert request(prep, "get", f"/styles/{copy['id']}")["building_count"] == 0
    before = len(webhooks)
    retried = request(prep, "post", f"/style-versions/{again['id']}/retry")
    assert retried["status"] == "building" and retried["attempt"] == 0 and retried["error"] is None
    assert webhooks[before]["event"] == "creative_flo.style_build_requested" and webhooks[before]["mode"] == "improve"
    request(prep, "post", f"/style-versions/{again['id']}/retry", code=409)
    assert request(prep, "get", f"/styles/{copy['id']}")["building_count"] == 1

    # Suggestions use the shapes the interview form applies, and the owner can use or dismiss them.
    ok = {"brand": brand, "kind": "choice", "payload": {"section": "music", "choice": {"field": "music_energy", "value": 2}}, "reason": "Leaves room for your voice."}
    sample_choice = {**ok, "payload": {"section": "type", "choice": {"sample_id": "type-archivo", "rating": "love"}}}
    for body in (ok, sample_choice):
        request(prep, "post", "/style-recommendations", body, role="agent")
    for bad in ({"section": "music", "choice": "Piano"}, {"section": "nowhere", "choice": {"field": "x", "value": 1}},
                {"section": "type", "choice": {"sample_id": "type-archivo", "rating": "adore"}}):
        request(prep, "post", "/style-recommendations", {**ok, "payload": bad}, role="agent", code=422)
    recommendations = request(prep, "get", "/style-recommendations", params={"brand": brand})
    assert [row["status"] for row in recommendations] == ["open", "open"]
    request(prep, "post", f"/style-recommendations/{recommendations[0]['id']}/use")
    request(prep, "post", f"/style-recommendations/{recommendations[1]['id']}/dismiss")
    assert {row["status"] for row in request(prep, "get", "/style-recommendations", params={"brand": brand})} == {"used", "dismissed"}
    assert prep.db.query(CfStyleInterview).filter_by(project_id=prep.project.id, status="in_progress").count() == 0


def test_web_autosave_sends_only_keys_the_api_merges_by_key(prep, webhooks):
    """Replaying the stream twice, or out of date, never loses a later edit: each key is replaced on its own."""
    row = request(prep, "post", "/style-interviews", {"brand": prep.project.cf_brand, "mode": "new"})
    for patch in FLOW["patches"][:4]:
        request(prep, "patch", f"/style-interviews/{row['id']}", patch)
    request(prep, "patch", f"/style-interviews/{row['id']}", {"answers": {"answers": {"handle": None}, "notes": {"section:brand": None}, "ratings": {"look-noir": None}}})
    answers = request(prep, "get", f"/style-interviews/{row['id']}")["answers"]
    assert "handle" not in answers["answers"] and "section:brand" not in answers["notes"] and "look-noir" not in answers["ratings"]
    assert answers["answers"]["brand"] == FLOW["final"]["answers"]["brand"]
