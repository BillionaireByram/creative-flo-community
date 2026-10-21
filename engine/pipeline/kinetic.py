"""Kinetic captions (cap-kinetic): words land one at a time on the spoken word, mostly bold with one script accent.

Approved by B 2026-10-08 ("Yes!! thats the one!") after three rounds on CF-0027, matched to the MotionText Pro look:
- a compact block on the speaker's chest (about half the frame wide) so the video stays the main thing;
- two fonts only: Inter Bold for small words, Inter Black for the hero word, Mr Dafoe script for the accent word;
- the hero word wipes in left to right with a gold gradient fill, small words fade up out of a soft blur,
  script words write on with a slight tilt, some phrases sit faded and light up word by word (ghost);
- a soft dark halo behind each block keeps white text readable on light clothing;
- no full-screen text cards: the speaker stays on screen.

A project's build.py does:

    from kinetic import Kinetic
    KC = Kinetic("assets/caption-words.json")
    spec = KC.auto()                         # or read your own build/kinetic.txt (format below)
    cap_html, cap_js, cap_css = KC.build(spec, hide=K.FULL)   # hide: full-frame scenes that carry their own words

Spec, one phrase per line, every spoken word in order (the build fails on a mismatch):

    build C | and|s this|s / ONE|b QUOTE|a
    ghost C | Outta|s everything|s in|s the|s book,|s / it's|s very|s / VALUABLE,|a
    single C | So|s the|s book|s is|s called|s

mode: build (words appear and stay), ghost (whole phrase faint, each word lights up), single (one word at a time).
Lines are split with " / ". Roles: s small bold, b hero white, a hero gold gradient, c script accent, t tiny.
Write the spec by hand: auto() is only a rough draft (B 2026-10-08: the auto version "doesn't have the same kinetic
style"). The approved reference is pipeline/stages/examples/kinetic-cf0027.txt (theme="italic", as posted 2026-10-08):
one clear meaning word as the hero, blocks alternating L / R / C, a few ghost lines, one-word beats for fast runs.
Use at most one hero line and one script word per phrase. Token text is what shows (fix case or punctuation there;
"*" may mask letters, e.g. sh*t).
"""
import html as _html
import json
import re

FONTS = {"s": "Inter-Bold.otf", "t": "Inter-Bold.otf", "b": "Inter-Black.otf", "a": "Inter-Black.otf",
         "c": "MrDafoe-Regular.ttf"}
FAMILY = {"Inter-Bold.otf": "KC-Bold", "Inter-Black.otf": "KC-Black", "MrDafoe-Regular.ttf": "KC-Script",
          "Inter-Italic.otf": "KC-Italic", "Inter-BoldItalic.otf": "KC-BItalic", "Inter-ExtraBoldItalic.otf": "KC-XBItalic"}
SIZE = {"s": 46, "b": 96, "a": 96, "c": 112, "t": 34}
SINGLE_SIZE = {"s": 54, "t": 54, "b": 110, "a": 110, "c": 124}
# theme "italic" = the "Kinetic Captions (Matched to Reference)" cut, exactly (B 2026-10-08: "fonts to look like this",
# "still not using the correct caption kinetic style"): Inter Italic small words, Inter ExtraBold Italic hero words in
# solid gold or white, Inter Bold Italic one-word beats, soft shadowed edges, no dark oval, blocks placed L / R / C
# beside the speaker, no script font.
FONTS_I = {"s": "Inter-Italic.otf", "t": "Inter-Italic.otf", "b": "Inter-ExtraBoldItalic.otf", "a": "Inter-ExtraBoldItalic.otf",
           "c": "MrDafoe-Regular.ttf"}
SIZE_I = {"s": 68, "t": 40, "b": 150, "a": 150, "c": 150}
SINGLE_SIZE_I = {"s": 84, "t": 84, "b": 170, "a": 170, "c": 170}
CHAR_EM = {"s": 0.58, "t": 0.58, "b": 0.72, "a": 0.72, "c": 0.42}   # width estimate when Pillow is missing
STOP = set("""a an and are as at be because but by can could did do does for from had has have he her him his how i i'm
if in into is it it's its just me my no not of on or our out so than that that's the their them then there they this to
up was we were what when where which who will with would you you're your yo really very actually just gonna got""".split())

key = lambda s: re.sub(r"[^a-z0-9']", "", s.lower().replace("’", "'"))


def same(spoken, shown):
    """The shown token must be the spoken word; "*" may stand in for letters (sh*t)."""
    b = re.sub(r"[^a-z0-9'*]", "", shown.lower().replace("’", "'"))
    return re.fullmatch(re.escape(b).replace(r"\*", "[a-z0-9']*"), key(spoken)) is not None


def _mix(hex_color, other, t):
    a = [int(hex_color[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(other[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02X}" for x, y in zip(a, b))


class Kinetic:
    def __init__(self, words="assets/caption-words.json", fonts="assets/fonts", accent="#F5C542", script=None,
                 top=1060, height=420, max_width=680, first_track=40, theme="bold"):
        self.W = [w for w in json.load(open(words)) if str(w.get("w", "")).strip()]
        self.fonts, self.accent = fonts, accent
        self.script = script or _mix(accent, "#FFFFFF", 0.3)
        self.top, self.height, self.maxw, self.track = top, height, max_width, first_track
        self._pil = {}
        if theme not in ("bold", "italic"):
            raise ValueError("theme must be bold or italic")
        self.theme = theme
        self.F, self.S, self.SS = (FONTS_I, SIZE_I, SINGLE_SIZE_I) if theme == "italic" else (FONTS, SIZE, SINGLE_SIZE)
        if theme == "italic" and max_width == 680 and height == 420:   # the reference cut's block: wider and taller
            self.maxw, self.height = 900, 600

    # ---------------------------------------------------------------- measuring
    def width(self, role, text, px):
        try:
            from PIL import ImageFont
            f = (self.F[role], px)
            if f not in self._pil:
                self._pil[f] = ImageFont.truetype(f"{self.fonts}/{self.F[role]}", px)
            return self._pil[f].getlength(text)
        except Exception:
            return len(text) * px * CHAR_EM[role]

    # ---------------------------------------------------------------- automatic phrasing
    def auto(self):
        """A first-pass spec from the word timings. Editors refine it; the rules match B's approved v3."""
        phrases, cur = [], []
        for i, w in enumerate(self.W):
            cur.append(w)
            txt = w["w"].strip()
            gap = self.W[i + 1]["s"] - w["e"] if i + 1 < len(self.W) else 9
            nxt = key(self.W[i + 1]["w"]) if i + 1 < len(self.W) else ""
            if (txt[-1:] in ".?!" or (txt[-1:] in ",;:" and len(cur) >= 2) or (gap > 0.3 and len(cur) >= 2)
                    or (len(cur) >= 6 and (nxt in STOP or gap > 0.12)) or len(cur) >= 9 or i + 1 == len(self.W)):
                phrases.append(cur)
                cur = []
        lines = []
        for n, ph in enumerate(phrases):
            content = [j for j, w in enumerate(ph) if key(w["w"]) not in STOP and len(key(w["w"])) >= 4]
            if not content:
                mode = "single" if len(ph) <= 5 else "build"
                lines.append(f"{mode} C | " + " ".join(f"{self._tok(w['w'])}|s" for w in ph))
                continue
            h = max(content, key=lambda j: (len(key(ph[j]["w"])) - (4 if key(ph[j]["w"]).endswith("ly") else 0), j))
            role = "c" if n % 3 == 2 else ("a" if n % 2 == 0 else "b")
            hero = ph[h]["w"].lower() if role == "c" else ph[h]["w"].upper()
            before, after = ph[:h], ph[h + 1:]
            parts = [" ".join(f"{self._tok(w['w'])}|s" for w in before[i:i + 4]) for i in range(0, len(before), 4)]
            parts.append(f"{self._tok(hero)}|{role}")
            if after:
                small = "s"
                parts.append(" ".join(f"{self._tok(w['w'])}|{small}" for w in after))
            mode = "ghost" if n % 8 == 7 and len(ph) >= 5 else "build"
            lines.append(f"{mode} C | " + " / ".join(parts))
        return "\n".join(lines) + "\n"

    @staticmethod
    def _tok(text):
        return text.strip().replace("|", "").replace(" ", "") or "-"

    # ---------------------------------------------------------------- spec -> timed phrases
    def parse(self, spec):
        out, wi = [], 0
        for n, raw in enumerate(spec.splitlines(), 1):
            raw = raw.strip()
            if not raw or raw.startswith("#"):
                continue
            if " | " in raw:
                head, body = raw.split(" | ", 1)
                head = head.split()
                mode, pos = (head[0] if head else "build"), (head[1] if len(head) > 1 else "C")
            else:
                mode, pos, body = "build", "C", raw
            if mode not in ("build", "ghost", "single") or pos not in ("L", "C", "R"):
                raise ValueError(f"kinetic spec line {n}: mode must be build/ghost/single and position L/C/R")
            lines = []
            for part in body.split(" / "):
                toks = []
                for tok in part.split():
                    txt, _, role = tok.rpartition("|")
                    if role not in FONTS or not txt:
                        raise ValueError(f"kinetic spec line {n}: token {tok!r} needs word|role (s, b, a, c or t)")
                    if wi >= len(self.W):
                        raise ValueError(f"kinetic spec line {n}: more words than were spoken ({txt!r})")
                    w = self.W[wi]
                    if not same(w["w"], txt):
                        raise ValueError(f"kinetic spec line {n}: {txt!r} should be the spoken word {w['w']!r} ({w['s']:.2f}s)")
                    toks.append((txt, role, float(w["s"]), float(w["e"])))
                    wi += 1
                lines.append(toks)
            out.append((mode, pos, lines))
        if wi != len(self.W):
            raise ValueError(f"kinetic spec covers {wi} of {len(self.W)} spoken words; next is {self.W[wi]['w']!r}")
        return out

    # ---------------------------------------------------------------- render
    def build(self, spec=None, hide=(), end=None):
        """Returns (html, js, css). hide = [(t0, t1), ...] full-frame scenes; phrases starting there are skipped."""
        P = self.parse(spec if spec is not None else self.auto())
        end_all = end if end is not None else self.W[-1]["e"] + 0.6
        H, J = [], []
        for pi, (mode, pos, lines) in enumerate(P):
            flat = [t for line in lines for t in line]
            start = flat[0][2] - 0.05
            if any(a <= flat[0][2] < b for a, b in hide):
                continue
            nxt = P[pi + 1][2][0][0][2] - 0.05 if pi + 1 < len(P) else end_all
            stop = min(nxt, flat[-1][3] + 1.2, end_all)
            for a, b in hide:              # never run under a full-frame scene that starts mid-phrase
                if start < a < stop:
                    stop = a
            pid = f"kc{pi}"
            if mode == "single":
                for j, (txt, role, ws, we) in enumerate(flat):
                    t0 = ws - 0.03
                    t1 = min(flat[j + 1][2] - 0.03, stop) if j + 1 < len(flat) else stop
                    if t1 - t0 < 0.05:
                        continue
                    wid = f"{pid}s{j}"
                    H.append(f'<div class="clip kc-blk kc-{pos}" data-start="{t0:.3f}" data-duration="{t1 - t0:.3f}" '
                             f'data-track-index="{self.track + 2 + j % 2}"><span id="{wid}" class="kc-w kc-{role} kc-one" '
                             f'style="font-size:{self.SS[role]}px">{_html.escape(self._show(txt, role))}</span></div>')
                    J.append(f'tl.fromTo("#{wid}",{{opacity:0,y:16,filter:"blur(7px)"}},{{opacity:1,y:0,filter:"blur(0px)",'
                             f'duration:.16,ease:"power2.out",clearProps:"filter"}},{t0:.3f});')
                continue
            rows = []
            for li, toks in enumerate(lines):
                shown = [(self._show(t, r), r) for t, r, *_ in toks]
                nat = sum(self.width(r, t, self.S[r]) for t, r in shown) + 0.26 * self.S[toks[0][1]] * (len(toks) - 1)
                k = min(1.0, self.maxw / max(nat, 1))
                spans = []
                for j, ((txt, role), (_, _, ws, we)) in enumerate(zip(shown, toks)):
                    wid = f"{pid}l{li}w{j}"
                    spans.append(f'<span id="{wid}" class="kc-w kc-{role}" style="font-size:{round(self.S[role] * k)}px">'
                                 f'{_html.escape(txt)}</span>')
                    J.append(self._move(mode, role, wid, ws))
                big = any(r in "abc" for _, r in shown)
                rows.append(f'<div class="kc-ln{" kc-big" if big else ""}">{"".join(spans)}</div>')
            H.append(f'<div class="clip kc-blk kc-{pos}" id="{pid}" data-start="{start:.3f}" data-duration="{stop - start:.3f}" '
                     f'data-track-index="{self.track + pi % 2}"><div class="kc-in">{"".join(rows)}</div></div>')
            if mode == "ghost":
                J.append(f'tl.fromTo("#{pid} .kc-in",{{opacity:0,y:14,filter:"blur(8px)"}},{{opacity:1,y:0,filter:"blur(0px)",'
                         f'duration:.22,ease:"power2.out",clearProps:"filter"}},{start:.3f});')
            J.append(f'tl.fromTo("#{pid} .kc-in",{{scale:1}},{{scale:1.025,duration:{stop - start:.3f},ease:"none"}},{start:.3f});')
            J.append(f'tl.to("#{pid}",{{opacity:0,filter:"blur(10px)",duration:.2,ease:"power1.in"}},{max(start + 0.2, stop - 0.2):.3f});')
        return "\n".join(H), "\n".join(J), self.css()

    @staticmethod
    def _show(txt, role):
        return txt.upper() if role in "ab" else (txt.lower() if role == "c" else txt)

    @staticmethod
    def _move(mode, role, wid, ws):
        t = ws - 0.04
        if mode == "ghost":
            return f'tl.fromTo("#{wid}",{{opacity:.3}},{{opacity:1,duration:.16,ease:"power1.out"}},{t:.3f});'
        if role in "ab":
            return (f'tl.fromTo("#{wid}",{{"--m":"100%",x:-18,filter:"blur(10px)",opacity:1}},{{"--m":"0%",x:0,filter:"blur(0px)",'
                    f'duration:.42,ease:"power2.out",clearProps:"filter"}},{t:.3f});')
        if role == "c":
            return (f'tl.fromTo("#{wid}",{{clipPath:"inset(-40% 100% -60% -10%)",rotation:-4}},'
                    f'{{clipPath:"inset(-40% -30% -60% -10%)",rotation:-4,duration:.5,ease:"power2.inOut"}},{t:.3f});')
        return (f'tl.fromTo("#{wid}",{{opacity:0,y:20,filter:"blur(8px)"}},{{opacity:1,y:0,filter:"blur(0px)",duration:.32,'
                f'ease:"power2.out",clearProps:"filter"}},{t:.3f});')

    def css(self):
        f, hi, lo = self.fonts, _mix(self.accent, "#FFFFFF", 0.55), _mix(self.accent, "#000000", 0.14)
        faces = "".join(f'@font-face{{font-family:"{fam}";src:url({f}/{file})}}\n' for file, fam in FAMILY.items())
        return faces + f"""
.kc-blk{{position:absolute;left:40px;right:40px;top:{self.top}px;height:{self.height}px;display:flex;align-items:center;isolation:isolate;pointer-events:none}}
.kc-blk::before{{content:"";position:absolute;left:50%;top:50%;width:900px;height:520px;transform:translate(-50%,-50%);
  background:radial-gradient(closest-side,rgba(8,6,4,.30),rgba(8,6,4,.14) 50%,rgba(8,6,4,.05) 75%,transparent);z-index:-1}}
.kc-C{{justify-content:center;text-align:center}} .kc-L{{justify-content:flex-start;text-align:left}} .kc-R{{justify-content:flex-end;text-align:right}}
.kc-in{{display:flex;flex-direction:column;align-items:center}}
.kc-L .kc-in{{align-items:flex-start;transform-origin:0 50%}} .kc-R .kc-in{{align-items:flex-end;transform-origin:100% 50%}}
.kc-ln{{display:flex;align-items:baseline;line-height:1;white-space:nowrap}}
.kc-ln.kc-big{{margin-top:-.14em;margin-bottom:-.04em}}
.kc-w{{display:inline-block;margin-right:.26em;filter:blur(.3px)}} .kc-ln .kc-w:last-child{{margin-right:0}}
.kc-s,.kc-t{{font-family:"KC-Bold";letter-spacing:-.005em;color:#FFFDF8;text-shadow:0 0 1px rgba(0,0,0,.6),0 2px 4px rgba(0,0,0,.55),0 4px 18px rgba(0,0,0,.6)}}
.kc-t{{color:rgba(255,253,248,.9)}}
.kc-b,.kc-a{{font-family:"KC-Black";letter-spacing:-.03em;padding-right:.08em;
  -webkit-mask-image:linear-gradient(90deg,#000 0%,#000 42%,transparent 58%,transparent 100%);mask-image:linear-gradient(90deg,#000 0%,#000 42%,transparent 58%,transparent 100%);
  -webkit-mask-size:260% 100%;mask-size:260% 100%;-webkit-mask-position:var(--m,0%) 0;mask-position:var(--m,0%) 0}}
.kc-b{{color:#FFFDF8;text-shadow:0 0 1px rgba(0,0,0,.6),0 2px 4px rgba(0,0,0,.55),0 4px 18px rgba(0,0,0,.6)}}
.kc-a{{background:linear-gradient(180deg,{hi} 0%,{self.accent} 48%,{lo} 100%);-webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 2px 3px rgba(0,0,0,.6)) drop-shadow(0 0 14px {self.accent}59)}}
.kc-c{{font-family:"KC-Script";color:{self.script};padding:0 .12em;line-height:.8;transform-origin:0 60%;
  text-shadow:0 2px 4px rgba(0,0,0,.6),0 0 16px {self.accent}73}}
""" + (self._italic_css() if self.theme == "italic" else "")

    def _italic_css(self):
        return f"""
.kc-blk::before{{display:none}}
.kc-L,.kc-R{{left:70px;right:70px}} .kc-C{{left:40px;right:40px}}
.kc-ln.kc-big{{margin-top:-.16em;margin-bottom:-.06em}}
.kc-w{{letter-spacing:-.01em;filter:blur(.3px)}}
.kc-s,.kc-t,.kc-c{{font-family:"KC-Italic";letter-spacing:-.01em;color:#F7F3EA;text-transform:none;padding:0;line-height:1;
  text-shadow:0 0 14px rgba(255,244,225,.18),0 3px 18px rgba(0,0,0,.55)}}
.kc-t{{color:rgba(247,243,234,.82);text-shadow:0 2px 12px rgba(0,0,0,.6)}}
.kc-b,.kc-a{{font-family:"KC-XBItalic";letter-spacing:-.025em;padding-right:.08em}}
.kc-b{{color:#F7F3EA;text-shadow:0 0 14px rgba(255,244,225,.18),0 3px 18px rgba(0,0,0,.55)}}
.kc-a{{background:none;-webkit-background-clip:border-box;background-clip:border-box;color:{self.accent};filter:none;
  text-shadow:0 0 22px {self.accent}4D,0 3px 18px rgba(0,0,0,.5)}}
.kc-one.kc-s,.kc-one.kc-t,.kc-one.kc-c{{font-family:"KC-BItalic"}}
"""
