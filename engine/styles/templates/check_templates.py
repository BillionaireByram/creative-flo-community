#!/usr/bin/env python3
"""Validate the starter editing-style templates before they are seeded into cf_style_templates.

    python3 styles/templates/check_templates.py        (from engine/; exits 1 on any problem)

Checks every styles/templates/<key>/ folder: template.json fields and length limits, style.json matches the
schema and vocabulary that onboarding/build_style.py produces, DESIGN.md has the house-shape sections, no em
or en dashes, and no real creator, company or AI tool names in client-facing text.
"""

from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENGINE = HERE.parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ENGINE / "onboarding"))
import build_style as bs  # noqa: E402  (module-level tables only; main() is guarded)

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
LIMITS = {"summary": 300, "best_for": 300, "why_it_works": 600}
TEMPLATE_KEYS = {"key", "name", "summary", "best_for", "why_it_works", "tags", "sort", "preview"}
PREVIEW_KEYS = {"palette", "fonts", "caption_sample", "caption_style", "transitions", "music_beds", "pace", "motion_sample"}
DESIGN_SECTIONS = ["idea in one line", "who it's for", "format defaults", "signature pieces",
                   "allowed with restraint", "never", "rhythm", "sound", "end tag"]
BANNED = ["vox", "kallaway", "hormozi", "gadzhi", "herk", "haynes", "zimmer", "apple", "netflix", "kodak",
          "tesla", "nike", "whisper", "elevenlabs", "scribe", "openai", "claude", "anthropic", "gpt", "gemini",
          "chatgpt", "midjourney", "veo", "seedance", "kie", "heygen", "runway", "capcut", "motion mcp"]
LAB_TRANSITIONS = {"Data glitch", "Punch-in + flash", "Light leak", "Whip pan", "Zoom blur", "Hard cuts only",
                   "Match cut", "Iris / mask reveal"}
LAB_MUSIC = {"Cinematic score", "Dark trap / drill", "Synthwave / electronic", "Orchestral hybrid", "Minimal lo-fi",
             "Soulful / boom bap", "Upbeat pop / indie", "Acoustic / warm", "Afrobeats", "House", "Piano emotional",
             "No music"}
LAB_ONCAM = {"Face the whole time", "Face + heavy B-roll", "Mostly visuals, my voice", "No face, voiceover only",
             "Depends on the format"}
LAB_FORMATS = {"Vertical 9:16 (Reels, TikTok, Shorts)", "Horizontal 16:9 (YouTube)", "Square / 4:5 (feed)"}
GOOGLE_FONTS = {f for pair in bs.TYPE.values() for f in pair[:2]} | {"Roboto Mono", "JetBrains Mono", "Space Mono"}


def style_schema() -> list[str]:
    """The exact keys build_style.py writes into style.json, read from its source."""
    tree = ast.parse((ENGINE / "onboarding" / "build_style.py").read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(getattr(t, "id", "") == "style" for t in node.targets) \
                and isinstance(node.value, ast.Dict):
            return [k.value for k in node.value.keys]
    raise SystemExit("could not find the style dict in build_style.py")


def check(folder: Path, schema: list[str]) -> list[str]:
    errs: list[str] = []
    key = folder.name
    files = {n: folder / n for n in ("template.json", "style.json", "DESIGN.md")}
    for n, p in files.items():
        if not p.exists():
            errs.append(f"missing {n}")
    if errs:
        return errs
    try:
        t = json.loads(files["template.json"].read_text())
        s = json.loads(files["style.json"].read_text())
    except json.JSONDecodeError as e:
        return [f"invalid JSON: {e}"]
    design = files["DESIGN.md"].read_text()

    # template.json
    if missing := TEMPLATE_KEYS - t.keys():
        errs.append(f"template.json missing {sorted(missing)}")
    if t.get("key") != key:
        errs.append(f"template key {t.get('key')!r} != folder {key!r}")
    for f, lim in LIMITS.items():
        if not isinstance(t.get(f), str) or not t[f].strip():
            errs.append(f"{f} empty")
        elif len(t[f]) > lim:
            errs.append(f"{f} is {len(t[f])} chars (limit {lim})")
    if not isinstance(t.get("tags"), list) or not t["tags"]:
        errs.append("tags must be a non-empty list")
    if not isinstance(t.get("sort"), int):
        errs.append("sort must be an int")
    p = t.get("preview") or {}
    if missing := PREVIEW_KEYS - p.keys():
        errs.append(f"preview missing {sorted(missing)}")
    if not p.get("palette") or not all(HEX.match(c) for c in p.get("palette", [])):
        errs.append("preview.palette must be a list of #rrggbb")
    fonts = p.get("fonts")
    if not isinstance(fonts, list) or not fonts or not set(fonts) <= GOOGLE_FONTS:
        errs.append(f"preview.fonts must be a list of Google font names, got {fonts}")
    if not isinstance(p.get("caption_sample"), str) or not p["caption_sample"].strip():
        errs.append("preview.caption_sample must be text")
    if not isinstance(p.get("caption_style"), str) or not p["caption_style"].strip():
        errs.append("preview.caption_style must be text")
    if not p.get("transitions") or not set(p["transitions"]) <= LAB_TRANSITIONS:
        errs.append(f"preview.transitions must use Style Lab names: {p.get('transitions')}")
    if not isinstance(p.get("music_beds"), list) or not set(p["music_beds"]) <= LAB_MUSIC:
        errs.append(f"preview.music_beds must use Style Lab chips: {p.get('music_beds')}")
    if not (isinstance(p.get("pace"), int) and 1 <= p["pace"] <= 5):
        errs.append("preview.pace must be an int 1-5")
    if not p.get("motion_sample"):
        errs.append("preview.motion_sample empty")

    # style.json (engine schema)
    if list(s.keys()) != schema:
        errs.append(f"style.json keys differ from build_style.py: extra {sorted(set(s) - set(schema))}, "
                    f"missing {sorted(set(schema) - set(s))}")
    if s.get("type") not in bs.TYPE:
        errs.append(f"unknown type {s.get('type')}")
    elif (s.get("display"), s.get("body")) != bs.TYPE[s["type"]][:2]:
        errs.append(f"display/body do not match {s['type']}")
    if s.get("look") not in bs.LOOK_PALETTE:
        errs.append(f"unknown look {s.get('look')}")
    if s.get("caption") not in bs.CAPTION_CSS:
        errs.append(f"unknown caption {s.get('caption')}")
    if s.get("transition_id") not in bs.TRANSITION or s.get("transition") != bs.TRANSITION.get(s.get("transition_id")):
        errs.append(f"transition {s.get('transition')} does not match {s.get('transition_id')}")
    if s.get("grade") not in bs.GRADE_CSS:
        errs.append(f"unknown grade {s.get('grade')}")
    if s.get("density") not in ("density-minimal", "density-balanced", "density-heavy"):
        errs.append(f"unknown density {s.get('density')}")
    if s.get("card") not in set(bs.CARD_CSS) | {"glass"}:
        errs.append(f"unknown card {s.get('card')}")
    for c in ("accent", "highlight", "base"):
        if not HEX.match(str(s.get(c))):
            errs.append(f"{c} must be #rrggbb")
    if not (isinstance(s.get("pace"), int) and 1 <= s["pace"] <= 10):
        errs.append("style pace must be an int 1-10")
    if not set(s.get("formats") or []) <= LAB_FORMATS or not s.get("formats"):
        errs.append(f"formats must use Style Lab values: {s.get('formats')}")
    if not set(s.get("music") or []) <= LAB_MUSIC:
        errs.append(f"music must use Style Lab chips: {s.get('music')}")
    if s.get("oncam") not in LAB_ONCAM:
        errs.append(f"oncam must be a Style Lab value: {s.get('oncam')}")
    if fonts != list(dict.fromkeys([s.get("display"), s.get("body")])):
        errs.append("preview fonts disagree with style.json")

    # DESIGN.md shape
    heads = [h.lower() for h in re.findall(r"^##\s+(.+)$", design, re.M)]
    for sec in DESIGN_SECTIONS:
        if not any(sec in h for h in heads):
            errs.append(f"DESIGN.md missing section '{sec}'")

    # writing rules
    for name, text in (("DESIGN.md", design), ("template.json", json.dumps(t, ensure_ascii=False))):
        if re.search("[—–]", text):
            errs.append(f"{name} contains an em or en dash")
        for w in BANNED:
            if re.search(rf"\b{re.escape(w)}\b", text, re.I):
                errs.append(f"{name} mentions '{w}'")
    return errs


def main() -> int:
    schema = style_schema()
    folders = sorted(d for d in HERE.iterdir() if d.is_dir() and not d.name.startswith(("_", ".")))
    failed = 0
    sorts = {}
    for d in folders:
        errs = check(d, schema)
        try:
            sorts.setdefault(json.loads((d / "template.json").read_text()).get("sort"), []).append(d.name)
        except Exception:
            pass
        print(f"{'FAIL' if errs else 'ok  '} {d.name}")
        for e in errs:
            print(f"     - {e}")
        failed += bool(errs)
    for s, keys in sorts.items():
        if len(keys) > 1:
            print(f"FAIL duplicate sort {s}: {keys}")
            failed += 1
    if len(folders) < 8:
        print(f"FAIL only {len(folders)} templates (contract wants at least 8)")
        failed += 1
    print(f"{len(folders)} templates, {failed} problem(s)")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
