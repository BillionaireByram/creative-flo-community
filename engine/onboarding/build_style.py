#!/usr/bin/env python3
"""Turn a client's Style Lab answers into their own Creative Flo style package.

    python3 onboarding/build_style.py <client-slug>

Reads   styles/clients/<slug>/style-answers.json   (Style Lab v2)
Writes  styles/clients/<slug>/style.json            machine-readable decisions
        styles/clients/<slug>/DESIGN.draft.md       loves / maybes / nos + interview, for the agent to finish
        styles/clients/<slug>/index.html            10 s sample composition in THEIR style (HyperFrames)
        styles/clients/<slug>/assets/               fonts (downloaded, offline), gsap, logo

The agent then writes DESIGN.md (style-interview skill), renders the sample and shows the client.
Every decision is derived from what the client rated, so no two clients get the same edit.
"""

from __future__ import annotations

import argparse
import html as html_text
import json
import re
import shutil
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "styles" / "clients" / "example-ember-coffee"  # fictional public example composition

TYPE = {  # pairing id -> display face, body face, css for the display role
    "type-archivo":    ("Archivo", "Manrope", "font-weight:900;font-stretch:125%;text-transform:uppercase"),
    "type-michroma":   ("Michroma", "Manrope", "font-weight:400;text-transform:uppercase;letter-spacing:.04em"),
    "type-orbitron":   ("Orbitron", "Orbitron", "font-weight:800;text-transform:uppercase"),
    "type-cormorant":  ("Cormorant Garamond", "Manrope", "font-weight:500;text-transform:uppercase;letter-spacing:.12em"),
    "type-instrument": ("Instrument Serif", "Archivo", "font-weight:400;font-style:italic"),
    "type-anton":      ("Anton", "Manrope", "font-weight:400;text-transform:uppercase"),
    "type-unbounded":  ("Unbounded", "Sora", "font-weight:700"),
    "type-chakra":     ("Chakra Petch", "JetBrains Mono", "font-weight:600;text-transform:uppercase"),
    "type-syne":       ("Syne", "Manrope", "font-weight:800;text-transform:uppercase"),
    "type-shoulders":  ("Big Shoulders Display", "Cormorant Garamond", "font-weight:800;text-transform:uppercase"),
    "type-playfair":   ("Playfair Display", "Montserrat", "font-weight:800"),
    "type-bebas":      ("Bebas Neue", "Montserrat", "font-weight:400;text-transform:uppercase"),
    "type-fraunces":   ("Fraunces", "Manrope", "font-weight:800"),
    "type-montserrat": ("Montserrat", "Montserrat", "font-weight:800;text-transform:uppercase"),
    "type-caveat":     ("Caveat", "Manrope", "font-weight:700"),
    "type-mono":       ("Space Mono", "Manrope", "font-weight:700;text-transform:uppercase"),
    "type-rounded":    ("Nunito", "Manrope", "font-weight:800"),
}
LOOK_PALETTE = {  # look -> (accent, highlight, base, card style)
    "look-noir": ("#2bb5c8", "#ffb347", "#050708", "glass"), "look-keynote": ("#4c8dff", "#ffffff", "#000000", "solid"),
    "look-hud": ("#5ff0e0", "#e9fffb", "#02090c", "hud"), "look-kinetic": ("#ffd23f", "#ffd23f", "#0b0b0b", "solid"),
    "look-glass": ("#6d8bff", "#ff8fd1", "#05060a", "glass"), "look-doc": ("#d7b98c", "#f4e7d2", "#120d08", "paper"),
    "look-editorial": ("#e05a2a", "#e05a2a", "#16130f", "paper"), "look-ugc": ("#ffffff", "#ffe14d", "#111111", "minimal"),
    "look-whiteboard": ("#e05a2a", "#1f2a44", "#1f2a44", "paper"), "look-brutal": ("#e8341c", "#e8341c", "#0b0b0b", "brutal"),
}
GRADE_CSS = {
    "grade-teal": "linear-gradient(180deg,rgba(0,110,130,.30),rgba(255,130,50,.18));mix-blend-mode:soft-light",
    "grade-bleach": "rgba(80,110,130,.22);mix-blend-mode:color",
    "grade-mono": "rgba(128,128,128,1);mix-blend-mode:saturation",
    "grade-neon": "linear-gradient(120deg,rgba(255,0,170,.30),rgba(0,220,255,.28));mix-blend-mode:soft-light",
    "grade-kodak": "linear-gradient(180deg,rgba(255,200,120,.22),rgba(120,60,20,.25));mix-blend-mode:soft-light",
    "grade-natural": "transparent",
}
CAPTION_CSS = {  # caption id -> css applied to .ln / .ln.hl in the sample
    "cap-stack": ("", ""), "cap-pop": ("-webkit-text-stroke:3px #000;paint-order:stroke fill", ""),
    "cap-kara": ("color:rgba(255,255,255,.55)", "text-shadow:0 0 24px var(--hl)"),
    "cap-cine": ("font-family:var(--f-body)!important;font-weight:500!important;text-transform:none!important;font-size:46px!important;font-stretch:100%!important", ""),
    "cap-hud": ("font-family:var(--f-mono)!important;font-weight:400!important;font-size:48px!important;color:#5ff0e0;font-stretch:100%!important", ""),
    "cap-key": ("opacity:.0001", "opacity:1!important"),
    "cap-boxed": ("", "background:var(--hl);color:#111!important;padding:0 .18em;border-radius:12px"),
    "cap-lower": ("font-family:var(--f-body)!important;font-weight:600!important;text-transform:lowercase!important;font-size:54px!important;font-stretch:100%!important", ""),
    "cap-color": ("", "color:var(--accent)!important"),
    "cap-emoji": ("", ""),   # emoji accents are placed by the finishing editor from the owner's notes
    "cap-none": ("display:none!important", ""),
    "cap-kinetic": ("font-family:var(--f-body)!important;font-weight:700!important;text-transform:none!important;font-size:42px!important;font-stretch:100%!important",
                    "font-weight:900!important;text-transform:uppercase!important;font-size:84px!important;color:var(--hl)!important"),
}
TRANSITION = {"tr-glitch": "glitch", "tr-punch": "flash", "tr-leak": "leak", "tr-whip": "whip", "tr-zoomblur": "flash",
              "tr-hardcut": "hard", "tr-match": "flash", "tr-mask": "flash"}
CARD_CSS = {
    "solid": '#root[data-skin="client"] .card-in{background:#0c0c0e;backdrop-filter:none;border-color:transparent;border-radius:14px}\n',
    "paper": ('#root[data-skin="client"] .card-in{background:#efe9df;color:#16130f;backdrop-filter:none;border-color:transparent;'
              'border-radius:6px;box-shadow:10px 12px 0 rgba(0,0,0,.25)}\n'
              '#root[data-skin="client"] .row{background:rgba(0,0,0,.05);border-color:rgba(0,0,0,.08)}\n'
              '#root[data-skin="client"] .eyebrow{color:#16130f}\n#root[data-skin="client"] .card-h em{color:var(--accent)}\n'),
    "brutal": ('#root[data-skin="client"] .card-in{background:var(--accent);color:#0b0b0b;backdrop-filter:none;border:0;border-radius:0;box-shadow:none}\n'
               '#root[data-skin="client"] .eyebrow{color:#0b0b0b}\n'
               '#root[data-skin="client"] .row{background:rgba(0,0,0,.12);border:0;border-radius:0}\n#root[data-skin="client"] .card-h em{color:#0b0b0b}\n'),
    "hud": '#root[data-skin="client"] .card-in{background:rgba(2,20,24,.7);border:1.5px solid var(--accent);border-radius:4px}\n',
    "minimal": ('#root[data-skin="client"] .card-in{background:#fff;color:#111;backdrop-filter:none;border:0;border-radius:18px}\n'
                '#root[data-skin="client"] .eyebrow{color:#111}\n#root[data-skin="client"] .card-h em{color:var(--accent)}\n'),
}


def pick(ratings: dict, prefix: str, default: str, known=None):
    ids = [k for k in ratings if k.startswith(prefix)]
    love = [k for k in ids if ratings[k] == "love"]
    maybe = [k for k in ids if ratings[k] == "maybe"]
    no = [k for k in ids if ratings[k] == "no"]
    choices = [k for k in love + maybe if known is None or k in known]
    fallback = [default] if default not in no else [k for k in (known or []) if k not in no]
    return (choices or fallback or [None])[0], love, maybe, no


def font_files(family: str, dest: Path) -> list[tuple[str, str]]:
    """Download a Google Font family from github.com/google/fonts. Returns [(file, css font-weight)]."""
    slug = re.sub(r"[^a-z0-9]", "", family.lower())
    files = []
    for lic in ("ofl", "apache", "ufl"):
        try:
            req = urllib.request.Request(f"https://api.github.com/repos/google/fonts/contents/{lic}/{slug}",
                                         headers={"User-Agent": "creative-flo"})
            with urllib.request.urlopen(req, timeout=30) as r:
                files = [f for f in json.loads(r.read()) if f["name"].endswith(".ttf")]
            if files:
                break
        except Exception:
            continue
    if not files:
        raise SystemExit(f"could not find font {family} in google/fonts")
    upright = [f for f in files if "Italic" not in f["name"]] or files
    var = [f for f in upright if "[" in f["name"]]
    chosen = var[:1] or [f for f in upright if re.search(r"-(Regular|Medium|SemiBold|Bold|ExtraBold|Black)\.ttf$", f["name"])][:4] or upright[:1]
    if family == "Instrument Serif":
        chosen = [f for f in files if "Italic" in f["name"]][:1] or chosen
    weights = {"Regular": "400", "Medium": "500", "SemiBold": "600", "Bold": "700", "ExtraBold": "800", "Black": "900"}
    dest.mkdir(parents=True, exist_ok=True)
    out = []
    for f in chosen:
        target = dest / re.sub(r"\[.*?\]", "-var", f["name"])
        if not target.exists():
            urllib.request.urlretrieve(f["download_url"], target)
        m = re.search(r"-(\w+)\.ttf$", f["name"])
        out.append((target.name, "100 900" if "[" in f["name"] else weights.get(m.group(1) if m else "", "400")))
    (dest / f"{slug}.SOURCE.txt").write_text(f"{family}: https://github.com/google/fonts (SIL OFL / Apache, license in that repo)\n")
    return out


def build(data, cdir, slug, base_design=None):
    """Build a portable starter. Preserve every interview field for the finishing editor."""
    if not isinstance(data, dict) or any(not isinstance(data.get(k) or {}, dict) for k in ("ratings", "answers", "notes")):
        raise ValueError("The interview must contain answer, rating and note objects.")
    cdir = Path(cdir)
    cdir.mkdir(parents=True, exist_ok=True)
    R = {k: v for k, v in (data.get("ratings") or {}).items() if v}
    A, N = data.get("answers") or {}, data.get("notes") or {}

    look, look_love, look_maybe, look_no = pick(R, "look-", "look-glass", LOOK_PALETTE)
    typ, type_love, type_maybe, type_no = pick(R, "type-", "type-archivo", TYPE)
    cap, cap_love, cap_maybe, cap_no = pick(R, "cap-", "cap-stack", CAPTION_CSS)
    tr, tr_love, tr_maybe, tr_no = pick(R, "tr-", "tr-hardcut", TRANSITION)
    grade, grade_love, grade_maybe, grade_no = pick(R, "grade-", "grade-natural", GRADE_CSS)
    dens = pick(R, "density-", "density-balanced")[0]

    accent, hl, base, card = LOOK_PALETTE.get(look, LOOK_PALETTE["look-glass"])
    colors = A.get("colors") if isinstance(A.get("colors"), list) else []
    colors = [x for x in colors if isinstance(x, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", x)]
    if colors:
        accent, hl = colors[0], colors[min(1, len(colors) - 1)]
    if A.get("colorsMode") == "Use these colors":
        accent = A.get("color1") if re.fullmatch(r"#[0-9a-fA-F]{6}", str(A.get("color1"))) else accent
        hl = A.get("color2") if re.fullmatch(r"#[0-9a-fA-F]{6}", str(A.get("color2"))) else hl
    display, body, display_css = TYPE.get(typ, ("Arial", "Arial", "font-weight:700"))
    brand = str(A.get("brand") or slug.replace("-", " ").title()).strip()
    handle = str(A.get("handle") or "").strip()
    handle = ("@" + handle.lstrip("@")).upper() if handle else ""
    cta = A.get("cta") if isinstance(A.get("cta"), list) else []
    tagline = {"Comment a keyword": "Comment below.", "Link in bio": "Link in bio.", "DM me": "DM me.",
               "Follow for more": "Follow for more.", "Book a call": "Book your call."}.get(cta[0] if cta else "", "")

    assets = cdir / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    fonts = assets / "fonts"
    faces = []
    for fam in dict.fromkeys([display, body, "Roboto Mono"]):
        if fam == "Arial":
            continue
        for fname, weight in font_files(fam, fonts):
            stretch = ";font-stretch:62% 125%" if fam == "Archivo" else ""
            faces.append(f'@font-face{{font-family:"{fam}";src:url(assets/fonts/{fname}) format("truetype");font-weight:{weight}{stretch}}}')
    shutil.copy(BASE / "assets" / "gsap.min.js", assets / "gsap.min.js")
    logo = next((p.name for p in sorted(assets.glob("logo.*"))), "")

    style = {"client": slug, "brand": brand, "handle": handle, "look": look, "type": typ, "display": display, "body": body,
             "caption": cap, "transition": TRANSITION.get(tr, "flash"), "transition_id": tr, "grade": grade,
             "density": dens, "accent": accent, "highlight": hl, "base": base, "card": card, "logo": logo,
             "formats": A.get("formats") or ["Vertical 9:16 (Reels, TikTok, Shorts)"], "tagline": tagline,
             "music": A.get("music") or [], "pace": A.get("pace") or 6, "oncam": A.get("oncam") or ""}
    if base_design and (Path(base_design).parent / "style.json").is_file():
        baseline = json.loads((Path(base_design).parent / "style.json").read_text())
        if isinstance(baseline, dict):
            # The editor reconciles the sample with this approved/template baseline.
            style = {**style, **baseline}
    (cdir / "style.json").write_text(json.dumps(style, indent=2))
    (cdir / "style-answers.json").write_text(json.dumps(data, indent=2))

    # ---------- sample composition (fictional example base, re-skinned) ----------
    html = (BASE / "index.html").read_text()
    html = re.sub(r"(@font-face\{[^\n]+\n)+", "\n".join(faces) + "\n", html, count=1)
    ln_css, hl_css = CAPTION_CSS.get(cap, ("", ""))
    extra = (f'#root[data-skin="client"]{{--base:{base};--accent:{accent};--accent-hot:{accent};--hl:{hl};--ice:#ffffff;'
             f'--glass:rgba(10,12,16,.56);--rim:rgba(255,255,255,.28);'
             f'--f-cap:"{display}",Arial,sans-serif;--f-card:"{display}",Arial,sans-serif;--f-body:"{body}",Arial,sans-serif;'
             f'--f-mono:"Roboto Mono",Menlo,monospace}}\n'
             f'#root[data-skin="client"] .ln{{{display_css};{ln_css}}}\n'
             f'#root[data-skin="client"] .ln.hl{{{hl_css}}}\n'
             f'#root[data-skin="client"] .card-h{{{display_css}}}\n'
             f'#root[data-skin="client"] .grade{{background:{GRADE_CSS.get(grade, "transparent")}}}\n'
             f'#root[data-skin="client"] .broll-art{{background:radial-gradient(60% 40% at 50% 55%,{accent}66,#050505 70%)}}\n'
             f'#root[data-skin="client"] .logo-wrap{{height:600px;width:900px}}\n'
             + CARD_CSS.get(card, ""))
    if style["transition"] == "leak":
        extra += '#root[data-skin="client"] .slice{background:radial-gradient(60% 120% at 20% 50%,rgba(255,140,40,.95),transparent 70%)!important;top:0!important;height:100%!important}\n'
    elif style["transition"] in ("flash", "whip"):
        extra += '#root[data-skin="client"] .slice{background:#fff!important;top:0!important;height:100%!important}\n'
    elif style["transition"] == "hard":
        extra += '#root[data-skin="client"] .slice{display:none}\n'
    html = html.replace("#root{position:relative;width:1080px", extra + "#root{position:relative;width:1080px", 1)
    html = html.replace('data-skin="red" data-composition-id="genius-cut"', 'data-skin="client" data-composition-id="client-style"')
    html = html.replace('window.__timelines["genius-cut"]', 'window.__timelines["client-style"]')
    brand_html, handle_html = html_text.escape(brand), html_text.escape(handle)
    html = re.sub(r"<title>.*?</title>", f"<title>{brand_html} style sample</title>", html, count=1)
    html = html.replace("<span>SYSTEM ONLINE</span>", f"<span>{brand_html.upper()}</span>")
    html = html.replace("One operator.<br><em>Three departments.</em>", "Built for<br><em>what you do.</em>")
    for old, new in zip(["Marketing</span><b>RUNNING", "Sales</span><b>RUNNING", "Operations</span><b>RUNNING"],
                        ["Step one", "Step two", "Step three"]):
        html = html.replace(old, f"{new}</span><b>DONE")
    for a, b in {
        '<div class="ln">Most people</div><div class="ln">use AI</div><div class="ln hl">like a toy.</div>':
            '<div class="ln">Most people</div><div class="ln">do it</div><div class="ln hl">the hard way.</div>',
        '<div class="ln">I built</div><div class="ln hl">a workforce.</div>': '<div class="ln">We built</div><div class="ln hl">a better way.</div>',
        '<div class="ln">Marketing.</div><div class="ln">Sales.</div><div class="ln hl">Operations.</div>':
            '<div class="ln">Faster.</div><div class="ln">Simpler.</div><div class="ln hl">Better.</div>',
        '<div class="ln">The system</div><div class="ln hl">does the work.</div>': '<div class="ln">Here\'s how</div><div class="ln hl">it works.</div>',
    }.items():
        html = html.replace(a, b)
    if logo:
        html = html.replace("assets/pg-logo-white.png", f"assets/{logo}")
    else:  # no logo yet: wordmark end tag
        html = re.sub(r'<div class="logo-wrap">.*?</div>\n',
                      lambda _: f'<div class="logo-wrap" style="height:auto;width:auto"><div style="font:900 120px var(--f-cap);text-align:center">{brand_html}</div></div>\n',
                      html, count=1, flags=re.S)
    for placeholder in ("Welcome to the standard.", "Your tagline.", "Link in bio."):
        html = html.replace(placeholder, html_text.escape(tagline) or brand_html)
    for placeholder in ("@SAMPLECREATOR", "@HANDLE", "@EMBERCOFFEE"):
        html = html.replace(placeholder, handle_html)
    (cdir / "index.html").write_text(html)
    (cdir / "skin.css").write_text(extra)
    shutil.copy(BASE / "hyperframes.json", cdir / "hyperframes.json")
    (cdir / "meta.json").write_text(json.dumps({"id": f"{slug}-style", "name": f"{brand} style", "width": 1080, "height": 1920, "fps": 30}, indent=2))

    # ---------- design draft ----------
    def names(ids):
        return ", ".join(i.split("-", 1)[1] for i in ids) or "none"
    notes = "\n".join(f"- `{k}`: {v}" for k, v in N.items() if v) or "- none"
    answers = "\n".join(f"- **{k}:** {json.dumps(v, ensure_ascii=False)}" for k, v in A.items())
    all_ratings = "\n".join(f"- `{k}`: {v}" for k, v in R.items()) or "- none"
    baseline_text = Path(base_design).read_text() if base_design else "No starting design supplied."
    (cdir / "DESIGN.draft.md").write_text(f"""# {brand} - Creative Flo style draft

Built from the Style Lab answers in `style-answers.json`. Machine-readable picks: `style.json`.

## Picks
| | Love | Maybe | No | Chosen for the sample |
|---|---|---|---|---|
| Look | {names(look_love)} | {names(look_maybe)} | {names(look_no)} | **{look}** (card style `{card}`) |
| Type | {names(type_love)} | {names(type_maybe)} | {names(type_no)} | **{display} + {body}** |
| Captions | {names(cap_love)} | {names(cap_maybe)} | {names(cap_no)} | **{cap}** |
| Transitions | {names(tr_love)} | {names(tr_maybe)} | {names(tr_no)} | **{tr}** |
| Grade | {names(grade_love)} | {names(grade_maybe)} | {names(grade_no)} | **{grade}** |
| Editing density | | | | **{dens}** |

Colors: accent `{accent}`, highlight `{hl}`, base `{base}` ({'brand colors' if A.get('colorsMode') == 'Use these colors' else 'derived from the chosen look'}).
End tag: {'logo ' + logo if logo else 'wordmark (no logo uploaded yet)'} · tagline "{tagline or brand}" · {handle or 'no handle'}.

## Their notes (these outrank ratings)
{notes}

## Interview
{answers}

## All ratings (including new or unknown samples)
{all_ratings}

## Starting design
{baseline_text}

## To finish (agent)
Write `DESIGN.md` with: the idea in one line, who it's for, format
defaults, signature pieces (their Loves), allowed with restraint (Maybes), never (Nos), rhythm (pace {A.get('pace') or 6}/10,
density {dens}), sound (music: {json.dumps(A.get('music') or [])}). Then render the sample and show the client.
Their notes outrank ratings. Nos are hard rules. Unknown facts go in an Open list. Never invent facts or name real creators in the finished design.
""")
    print(f"✓ style package for {brand}: {cdir}")
    print(f"  look {look} · type {display}+{body} · captions {cap} · transition {tr} · grade {grade} · density {dens}")
    return style


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("slug", nargs="?")
    parser.add_argument("--answers", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--brand-slug")
    parser.add_argument("--base-design", type=Path)
    args = parser.parse_args(argv)
    if bool(args.answers) != bool(args.out):
        parser.error("--answers and --out are required together")
    slug = args.brand_slug or args.slug or "brand"
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,80}", slug):
        parser.error("Use a brand slug made of letters, numbers, underscores or hyphens")
    if not args.answers and not args.slug:
        parser.error("Supply a client slug or --answers FILE --out DIR")
    cdir = args.out or ROOT / "styles" / "clients" / slug
    ans_path = args.answers or cdir / "style-answers.json"
    build(json.loads(ans_path.read_text()), cdir, slug, args.base_design)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
