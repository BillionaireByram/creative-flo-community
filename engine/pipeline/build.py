"""Builds index.html (Genius Cut, red skin) for IMG_3798 from word timings + edit map.

Every scene, caption line and status tick is anchored to a real spoken word in
assets/caption-words.json (edit timeline of clean-cut-v4).
"""
import json, re, html

W = json.load(open("assets/caption-words.json"))
M = json.load(open("assets/edit-map.json"))
CUT_END = M[-1]["edit_end"]          # 62.533
TOTAL = round(CUT_END + 1.8, 3)      # end tag


def t(word, n=0):
    hits = [w for w in W if w["w"] == word]
    return hits[n]["s"]


def tk(word, k):
    """start of `word` inside keep k"""
    return [w for w in W if w["w"] == word and w["k"] == k][0]["s"]


def te(word, n=0):
    hits = [w for w in W if w["w"] == word]
    return hits[n]["e"]


# ---------------------------------------------------------------- captions
HL = {"done.", "flo", "flo.", "mistake", "two-person", "team.", "editor,", "business.", "script", "edits",
      "behind", "operator", "quality.", "manually", "comment", "take.", "hook,", "social"}


def groups():
    """Hand-authored caption breaks (build/captions.txt) mapped onto word timings in order."""
    key = lambda x: re.sub(r"[^a-z0-9]", "", x.lower())
    out, wi = [], 0
    for raw in open("build/captions.txt").read().strip().splitlines():
        lines = []
        for part in raw.split(" / "):
            line = []
            for tok in part.split():
                hl = tok.startswith("*")
                clean = tok.strip("*")
                w = dict(W[wi]); wi += 1
                assert key(w["w"]) == key(clean), f"caption word mismatch at {wi}: script {w['w']!r} vs caption {clean!r}"
                w["hl"] = hl
                line.append(w)
            lines.append(line)
        out.append(lines)
    assert wi == len(W), f"captions cover {wi} of {len(W)} words"
    return out


G = groups()
cap_html, cap_js = [], []
for gi, lines in enumerate(G):
    start = lines[0][0]["s"] - 0.04
    nxt = G[gi + 1][0][0]["s"] - 0.06 if gi + 1 < len(G) else CUT_END
    end = min(nxt, lines[-1][-1]["e"] + 0.45, CUT_END)
    lh = []
    for li, line in enumerate(lines):
        ws = "".join(
            f'<span class="w{" hl" if x["hl"] else ""}">{html.escape(x["w"])}</span> '
            for x in line)
        lh.append(f'<div class="ln" id="g{gi}l{li}">{ws.strip()}</div>')
        cap_js.append(f'tl.fromTo("#g{gi}l{li}",{{opacity:0,y:50,scale:1.22}},{{opacity:1,y:0,scale:1,duration:0.2,ease:"back.out(2.2)"}},{max(0, line[0]["s"] - 0.04):.3f});')
    cap_html.append(f'<div class="grp" id="g{gi}">{"".join(lh)}</div>')
    cap_js.append(f'tl.set("#g{gi}",{{opacity:1}},{start:.3f});')
    cap_js.append(f'tl.to("#g{gi} .ln",{{opacity:0,y:-24,duration:0.12,ease:"power2.in"}},{max(start + 0.2, end - 0.12):.3f});')
    cap_js.append(f'tl.set("#g{gi} .ln",{{opacity:0}},{end:.3f});')
    cap_js.append(f'tl.set("#g{gi}",{{opacity:0}},{end:.3f});')

# ---------------------------------------------------------------- speaker punch-ins at joins
PR_FULL = M[9]["edit_start"] + (t("cut") - M[9]["edit_start"]) + 0.43   # proof takeover just after "cut"
OP_IN, OP_OUT = t("operator") - 0.18, tk("with", 20) + 0.32   # covers the eyes-down start of "to actually get things done"
FULL = [(PR_FULL, M[12]["edit_start"]), (OP_IN, OP_OUT)]   # speaker hidden under full-frame scenes
joins = [x["edit_start"] for x in M[1:]]
punch_js, sc = [], 1.0
for j in joins:
    if any(a <= j < b for a, b in FULL):
        continue
    sc = 1.08 if sc == 1.0 else 1.0
    punch_js.append(f'tl.set("#plate",{{scale:{sc}}},{j:.3f});')
# emphasis punch on "Flo did." and "I didn't edit this video."
punch_js.append(f'tl.set("#plate",{{scale:1.16}},{t("Flo"):.3f});')
punch_js.append(f'tl.set("#plate",{{scale:1.0}},{M[8]["edit_start"]:.3f});')
punch_js.append(f'tl.set("#plate",{{scale:1.14}},{M[16]["edit_start"]:.3f});')
punch_js.append(f'tl.set("#plate",{{scale:1.0}},{M[17]["edit_start"]:.3f});')


def glitch(idx, at):
    js = [f'gsap.set("#gl{idx} .slice",{{opacity:0}});']
    for i, d in enumerate([0, .05, .1, .15, .2, .25]):
        js.append(f'tl.set("#gl{idx} .slice",{{opacity:function(j){{return (j+{i})%2?0.6:0;}},x:function(j){{return (({i}*37+j*53)%120)-60;}}}},{at + d:.3f});')
        js.append(f'tl.set("#shake",{{x:{-14 if i % 2 else 14}}},{at + d:.3f});')
    js.append(f'tl.set("#gl{idx} .slice",{{opacity:0}},{at + .3:.3f});')
    js.append(f'tl.set("#shake",{{x:0}},{at + .3:.3f});')
    return js


GL1, GL2, GL3 = M[12]["edit_start"] - 0.08, M[17]["edit_start"] - 0.06, CUT_END - 0.03
T = dict(
    chk_in=M[4]["edit_start"] - 0.1, clips=t("clips,"), captions=t("captions,"), edit=t("edit,"), flo=t("Flo"),
    chk_out=M[8]["edit_start"],
    pr_full=PR_FULL, pr_strike=t("mistake"), pr_kept=t("know", 1), pr_out=M[10]["edit_start"],
    ow_in=M[10]["edit_start"], two=t("two-person"), team=t("team."), shoot=t("shoot,"), editor=t("editor,"),
    back=t("back"), likeit=t("like", 1), ow_out=M[12]["edit_start"],
    fc_in=M[13]["edit_start"] - 0.1, social=t("social"), content=t("content"), script=t("script"), edits=t("edits"),
    fc_out=M[16]["edit_start"],
    op_in=OP_IN, operator=t("operator"), business=t("business"), actually=tk("actually", 20), op_out=OP_OUT,
    cta_in=t("comment") - 0.12, cut_end=CUT_END, comment=t("comment"),
    gl1=GL1, gl2=GL2, gl3=GL3, gl1_clip=GL1 - 0.1, gl2_clip=GL2 - 0.1, gl3_clip=GL3 - 0.1,
)
T.update(chk_dur=T["chk_out"] - T["chk_in"] + 0.05, pr_dur=T["pr_out"] - T["pr_full"], ow_dur=T["ow_out"] - T["ow_in"],
         fc_dur=T["fc_out"] - T["fc_in"] + 0.05, op_dur=T["op_out"] - T["op_in"], cta_dur=CUT_END - T["cta_in"])
json.dump({k: round(v, 3) for k, v in T.items()} | {"total": TOTAL}, open("assets/anchors.json", "w"), indent=1)

INDEX = open("build/index.tpl").read()
for k, v in T.items():
    INDEX = INDEX.replace("{{" + k + "}}", f"{v:.3f}")
INDEX = (INDEX.replace("{{TOTAL}}", f"{TOTAL:.3f}").replace("{{CAPTIONS}}", "\n".join(cap_html))
         .replace("{{CAPTION_JS}}", "\n  ".join(cap_js)).replace("{{PUNCH_JS}}", "\n  ".join(punch_js))
         .replace("{{GLITCH_JS}}", "\n  ".join(glitch(1, GL1) + glitch(2, GL2) + glitch(3, GL3))))
open("index.html", "w").write(INDEX)
print(f"groups {len(G)}, joins punched {len(punch_js)}, total {TOTAL}s")
print({k: round(v, 2) for k, v in T.items()})
