"""Story Explainer scene kit: full-frame scenes that show the idea while the speaker says it.

Approved by B 2026-10-08 on CF-0027 ("yes thats it !"). Two looks, one gold accent:
- Vox paper (books, quotes, anything read aloud): a cream desk with faint grid and grain; a book cover drops in and its
  title gets highlighted; a quote page whose words get highlighter-swept as they are spoken.
- Creative Flo dark glass (concepts): gold line drawings that draw on, glass node cards that pop in on their word,
  checklists that tick on, a stuck loop that breaks out to the next step. Labels in Inter Black; one script label
  per scene at most.

Every time passed in is a spoken-word time (scenekit `Kit.A(keep, word)` on the cut), never a hand-typed number.
A project's build.py does:

    from explainkit import Explain, PERSON, HANDS, STAR
    X = Explain()
    X.book("bk", t0, t1, "The book", "Happy Pocket", "Full of Money", hl_at=K.A(2, "money"))
    X.quote("q1", t0, t1, "It says", [(w["w"], w["s"], w["e"]) for w in quote_words])
    X.flow("answer", t0, t1, nodes=[...], paths=[...], labels=[...])
    X.checklist("skills", t0, t1, "If you have a skill set", [("Teach people", t_teach), ...])
    X.loop("stuck", t0, t1, "Analysis paralysis", "ANALYSIS", "paralysis", t_an, t_pa, t_next, "NEXT STEP", t_step)
    ... K.FULL += X.FULL  (speaker hidden there; kinetic captions skip these spans: KC.build(spec, hide=K.FULL))
    page: X.css() in <style>, X.html() in the root, X.js() inside the timeline after `var tl = ...`.

Keep explainer scenes to about a third of the runtime; the real camera carries the rest.
"""
import html as _html

PERSON = '<svg viewBox="0 0 64 64" class="xk-ic"><circle cx="32" cy="22" r="11"/><path d="M12 56c2-12 10-18 20-18s18 6 20 18"/></svg>'
HANDS = ('<svg viewBox="0 0 64 64" class="xk-ic"><path d="M30 58V30c0-6-3-12-7-16l-3 6 2 12-8 10v16"/>'
         '<path d="M34 58V30c0-6 3-12 7-16l3 6-2 12 8 10v16"/></svg>')
STAR = '<svg viewBox="0 0 64 64" class="xk-ic"><path d="M32 6l7 17 18 1-14 11 5 18-16-10-16 10 5-18L7 24l18-1z"/></svg>'
BOLT = '<svg viewBox="0 0 64 64" class="xk-ic"><path d="M36 4L12 36h18l-4 24 26-34H34z"/></svg>'
TARGET = '<svg viewBox="0 0 64 64" class="xk-ic"><circle cx="32" cy="32" r="24"/><circle cx="32" cy="32" r="13"/><circle cx="32" cy="32" r="3"/></svg>'

esc = _html.escape


class Explain:
    def __init__(self, fonts="assets/fonts", accent="#F5C542", first_track=20):
        self.fonts, self.accent, self.track = fonts, accent, first_track
        self.H, self.J, self.FULL = [], [], []

    # ---------------------------------------------------------------- building blocks
    def _scene(self, sid, t0, t1, inner, kind):
        self.track += 1
        self.H.append(f'<div class="clip xk xk-{kind}" id="{sid}" data-start="{t0:.3f}" data-duration="{t1 - t0:.3f}" '
                      f'data-track-index="{self.track}"><div class="xk-cam">{inner}</div></div>')
        self.J.append(f'tl.fromTo("#{sid} .xk-cam",{{scale:1}},{{scale:1.045,duration:{t1 - t0:.3f},ease:"none"}},{t0:.3f});')
        self.FULL.append((t0, t1))

    def _draw(self, sel, t, d=0.6):
        self.J.append(f'tl.fromTo("{sel}",{{strokeDashoffset:1}},{{strokeDashoffset:0,duration:{d},ease:"power2.inOut"}},{t:.3f});')

    def _pop(self, sel, t, y=30):
        self.J.append(f'tl.fromTo("{sel}",{{opacity:0,y:{y},scale:.94,filter:"blur(8px)"}},{{opacity:1,y:0,scale:1,'
                      f'filter:"blur(0px)",duration:.42,ease:"power3.out",clearProps:"filter"}},{t:.3f});')

    def _write(self, sel, t, d=0.55):
        self.J.append(f'tl.fromTo("{sel}",{{clipPath:"inset(-40% 100% -60% -10%)"}},{{clipPath:"inset(-40% -30% -60% -10%)",'
                      f'duration:{d},ease:"power2.inOut"}},{t:.3f});')

    def _glow(self, sel, t, on=True):
        a = self.accent
        shadow = f"0 0 0 2px {a}CC, 0 0 50px {a}80" if on else f"0 0 0 1px {a}47, 0 20px 50px rgba(0,0,0,.45)"
        self.J.append(f'tl.to("{sel}",{{boxShadow:"{shadow}",duration:.28}},{t:.3f});')

    @staticmethod
    def _at(left, top):
        return f'top:{top}px;' + (f'left:{left}px;right:auto;margin:0;' if left is not None else '')

    # ---------------------------------------------------------------- Vox paper
    def book(self, sid, t0, t1, eyebrow, line1, line2, hl_at, color="#1F3B2D"):
        """A book cover drops onto the desk; line2 gets a highlighter stroke at hl_at."""
        self._scene(sid, t0, t1, f'''<div class="xk-paper"></div><div class="xk-note">{esc(eyebrow)}</div>
          <div class="xk-cover" style="--cv:{color}"><div class="xk-spine"></div><div class="xk-ct1">{esc(line1)}</div>
          <div class="xk-ct2"><span class="xk-hl">{esc(line2)}</span></div><div class="xk-by">book</div></div>''', "paper")
        self.J.append(f'tl.fromTo("#{sid} .xk-cover",{{y:-900,rotation:-14}},{{y:0,rotation:-4,duration:.55,ease:"back.out(1.4)"}},{t0 + 0.08:.3f});')
        self._pop(f"#{sid} .xk-note", t0 + 0.35, y=-20)
        self.J.append(f'tl.fromTo("#{sid} .xk-hl",{{"--hx":0}},{{"--hx":1,duration:.45,ease:"power2.out"}},{hl_at:.3f});')

    def quote(self, sid, t0, t1, label, words):
        """words = [(text, start, end), ...] as spoken; each word is highlighter-swept on its own timing."""
        spans = " ".join(f'<span class="xk-qw" id="{sid}w{j}">{esc(t.strip(chr(34) + chr(8220) + chr(8221)))}</span>'
                         for j, (t, s, e) in enumerate(words))
        self._scene(sid, t0, t1, f'''<div class="xk-paper"></div><div class="xk-sheet"><div class="xk-lb">{esc(label)}</div>
          <div class="xk-qt">&ldquo;{spans}&rdquo;</div><div class="xk-mark">&#9998;</div></div>''', "paper")
        self.J.append(f'tl.fromTo("#{sid} .xk-sheet",{{y:60,rotation:2,opacity:0}},{{y:0,rotation:-1.2,opacity:1,duration:.45,ease:"power3.out"}},{t0:.3f});')
        for j, (t, s, e) in enumerate(words):
            self.J.append(f'tl.fromTo("#{sid}w{j}",{{"--hx":0}},{{"--hx":1,duration:{max(0.12, min(0.32, e - s)):.2f},ease:"none"}},'
                          f'{max(s, t0 + .2):.3f});')

    # ---------------------------------------------------------------- Creative Flo glass
    def flow(self, sid, t0, t1, nodes=(), paths=(), labels=(), eyebrow=None, rays=False, spark=None):
        """A diagram on dark glass. Coordinates are in the 1080x1920 frame.
        nodes:  dict(id, label, icon="", top, left=None (centred), at, glow_at=None)
        paths:  dict(d (SVG path), at, dur=.6, kind="" | "muted" | "cross", fade_at=None)
        labels: dict(text, top, left=None, at, script=False, cls="")
        spark:  (at, [(dx, dy), ...]) a light that travels from the first point of the first path."""
        svg = "".join(f'<path class="xk-ln {p.get("kind", "")} p{i}" d="{p["d"]}" pathLength="1"/>' for i, p in enumerate(paths))
        inner = f'<div class="xk-glass"><div class="xk-grid"></div>{"<div class=xk-rays></div>" if rays else ""}</div>'
        inner += f'<div class="xk-eb">{esc(eyebrow)}</div>' if eyebrow else ""
        inner += f'<svg class="xk-dg" viewBox="0 0 1080 1920">{svg}</svg>'
        for n in nodes:
            inner += (f'<div class="xk-card n-{n["id"]}" style="{self._at(n.get("left"), n["top"])}">{n.get("icon", "")}'
                      f'<b>{esc(n["label"])}</b></div>')
        for i, lb in enumerate(labels):
            cls = "xk-lab xk-scr" if lb.get("script") else "xk-lab"
            inner += f'<div class="{cls} {lb.get("cls", "")} l{i}" style="{self._at(lb.get("left"), lb["top"])}">{esc(lb["text"])}</div>'
        if spark:
            inner += '<i class="xk-spark"></i>'
        self._scene(sid, t0, t1, inner, "glass")
        if eyebrow:
            self._pop(f"#{sid} .xk-eb", t0 + 0.05, y=-16)
        for n in nodes:
            self._pop(f"#{sid} .n-{n['id']}", n["at"] - 0.05)
            if n.get("glow_at"):
                self._glow(f"#{sid} .n-{n['id']}", n["glow_at"])
        for i, p in enumerate(paths):
            self._draw(f"#{sid} .p{i}", p["at"], p.get("dur", 0.6))
            if p.get("fade_at"):
                self.J.append(f'tl.to("#{sid} .p{i}",{{opacity:.25,duration:.3}},{p["fade_at"]:.3f});')
        for i, lb in enumerate(labels):
            (self._write if lb.get("script") else self._pop)(f"#{sid} .l{i}", lb["at"] - 0.04)
        if spark and paths:
            at, steps = spark
            x0, y0 = (float(v) for v in paths[0]["d"].split()[0].lstrip("M").split(",")) if "," in paths[0]["d"].split()[0] \
                else (float(paths[0]["d"].split()[0].lstrip("M")), float(paths[0]["d"].split()[1]))
            kf = ",".join(f'{{x:{dx},y:{dy},duration:{1 / len(steps):.3f}}}' for dx, dy in steps)
            self.J.append(f'gsap.set("#{sid} .xk-spark",{{left:{x0 - 14:.0f},top:{y0 - 14:.0f}}});')
            self.J.append(f'tl.fromTo("#{sid} .xk-spark",{{opacity:0,x:0,y:0}},{{opacity:1,duration:.1}},{at - 0.05:.3f});')
            self.J.append(f'tl.to("#{sid} .xk-spark",{{keyframes:[{kf}],ease:"none"}},{at:.3f});')
            self.J.append(f'tl.to("#{sid} .xk-spark",{{opacity:0,duration:.15}},{at + 1.0:.3f});')

    def checklist(self, sid, t0, t1, eyebrow, rows, footer=None):
        """rows = [(label, at), ...] glass rows that pop and tick on their word; the active row glows."""
        inner = (f'<div class="xk-glass"><div class="xk-grid"></div></div><div class="xk-eb" style="top:380px">{esc(eyebrow)}</div>'
                 '<div class="xk-rows">')
        for i, (label, at) in enumerate(rows):
            inner += (f'<div class="xk-card xk-row r{i}"><span class="xk-num">0{i + 1}</span><b>{esc(label)}</b>'
                      f'<svg viewBox="0 0 40 40" class="xk-tick"><path class="xk-ln tk{i}" d="M8 21 L17 30 L33 11" pathLength="1"/></svg></div>')
        inner += "</div>"
        if footer:
            inner += f'<div class="xk-lab xk-scr xk-foot" style="top:1220px">{esc(footer[0])}</div>'
        self._scene(sid, t0, t1, inner, "glass")
        self._pop(f"#{sid} .xk-eb", t0 + 0.02, y=-16)
        for i, (label, at) in enumerate(rows):
            self._pop(f"#{sid} .r{i}", at - 0.06)
            self._draw(f"#{sid} .tk{i}", at + 0.15, 0.3)
            self._glow(f"#{sid} .r{i}", at)
            if i:
                self._glow(f"#{sid} .r{i - 1}", at, on=False)
        if footer:
            self._write(f"#{sid} .xk-foot", footer[1])

    def loop(self, sid, t0, t1, eyebrow, label, script_label, label_at, script_at, exit_at, step_label, step_at):
        """Stuck in a loop: a light circles a drawn ring, then an arrow breaks out to the next step."""
        inner = f'''<div class="xk-glass"><div class="xk-grid"></div></div><div class="xk-eb">{esc(eyebrow)}</div>
          <svg class="xk-dg" viewBox="0 0 1080 1920"><circle class="xk-ln ring" cx="540" cy="760" r="230" pathLength="1"/>
          <path class="xk-ln out" d="M700 930 C 800 1080, 720 1220, 560 1300" pathLength="1"/>
          <path class="xk-ln head" d="M600 1262 L556 1302 L612 1318" pathLength="1"/></svg>
          <div class="xk-orbit"><i></i></div>
          <div class="xk-lab la" style="top:700px">{esc(label)}</div><div class="xk-lab xk-scr lb" style="top:770px">{esc(script_label)}</div>
          <div class="xk-card xk-step" style="top:1330px"><b>{esc(step_label)}</b></div>'''
        self._scene(sid, t0, t1, inner, "glass")
        self._pop(f"#{sid} .xk-eb", t0 + 0.05, y=-16)
        self._draw(f"#{sid} .ring", t0 + 0.1, 0.7)
        self.J.append(f'tl.fromTo("#{sid} .xk-orbit",{{rotation:0,opacity:0}},{{rotation:720,opacity:1,duration:{t1 - t0 - 0.3:.2f},ease:"none"}},{t0 + 0.4:.3f});')
        self._pop(f"#{sid} .la", label_at - 0.04)
        self._write(f"#{sid} .lb", script_at - 0.04)
        self._draw(f"#{sid} .out", exit_at - 0.35, 0.45)
        self._draw(f"#{sid} .head", exit_at + 0.05, 0.2)
        self._pop(f"#{sid} .xk-step", step_at - 0.06)

    # ---------------------------------------------------------------- output
    def html(self):
        return "\n".join(self.H)

    def js(self):
        return 'gsap.set(".xk-ln",{strokeDasharray:1,strokeDashoffset:1});\n' + "\n".join(self.J)

    def css(self):
        f, a = self.fonts, self.accent
        return f"""@font-face{{font-family:"XK-Bold";src:url({f}/Inter-Bold.otf)}}
@font-face{{font-family:"XK-Black";src:url({f}/Inter-Black.otf)}}
@font-face{{font-family:"XK-Script";src:url({f}/MrDafoe-Regular.ttf)}}
.xk{{position:absolute;inset:0;overflow:hidden;--xa:{a}}}
.xk-cam{{position:absolute;inset:0;transform-origin:50% 45%}}
.xk-paper{{position:absolute;inset:0;background:radial-gradient(90% 70% at 50% 42%,#F4EDDF 0%,#E7DCC8 70%,#D9CBB2 100%)}}
.xk-paper::before{{content:"";position:absolute;inset:0;opacity:.5;background-image:linear-gradient(rgba(20,17,12,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(20,17,12,.06) 1px,transparent 1px);background-size:60px 60px}}
.xk-paper::after{{content:"";position:absolute;inset:0;opacity:.35;mix-blend-mode:multiply;background-image:repeating-radial-gradient(circle at 23% 31%,rgba(60,40,10,.25) 0 1px,transparent 1px 4px),repeating-radial-gradient(circle at 71% 64%,rgba(60,40,10,.2) 0 1px,transparent 1px 5px)}}
.xk-note{{position:absolute;left:150px;top:420px;padding:22px 30px;background:#F7D873;color:#14110C;font:700 30px "XK-Bold";letter-spacing:.2em;text-transform:uppercase;transform:rotate(-6deg);box-shadow:0 14px 26px rgba(60,40,10,.3);z-index:3}}
.xk-cover{{position:absolute;left:210px;top:560px;width:660px;height:840px;background:var(--cv);border-radius:6px 14px 14px 6px;
  box-shadow:0 40px 70px rgba(40,25,5,.45),0 6px 14px rgba(40,25,5,.3),inset 0 0 0 1px rgba(255,255,255,.06);padding:150px 50px 0 84px;transform:rotate(-4deg)}}
.xk-spine{{position:absolute;left:0;top:0;bottom:0;width:36px;background:rgba(0,0,0,.28);border-radius:6px 0 0 6px}}
.xk-ct1{{font:900 56px/1.05 "XK-Black";color:#F2EADB;letter-spacing:-.02em}}
.xk-ct2{{margin-top:12px;font:900 72px/1.05 "XK-Black";color:#F2EADB;letter-spacing:-.02em}}
.xk-hl{{--hx:0;background:linear-gradient(var(--xa),var(--xa)) no-repeat 0 92%/calc(var(--hx) * 100%) 22%;padding:0 4px}}
.xk-by{{position:absolute;left:84px;bottom:56px;font:400 22px "XK-Bold";letter-spacing:.3em;text-transform:uppercase;color:rgba(242,234,219,.55)}}
.xk-sheet{{position:absolute;left:80px;right:80px;top:470px;padding:64px 60px 80px;background:#FBF7EE;box-shadow:0 40px 80px rgba(60,40,10,.35),0 4px 10px rgba(60,40,10,.2);transform:rotate(-1.2deg)}}
.xk-lb{{font:700 26px "XK-Bold";letter-spacing:.24em;text-transform:uppercase;color:#8A7A60}}
.xk-qt{{margin-top:28px;font:800 66px/1.22 "XK-Bold";color:#14110C;letter-spacing:-.015em}}
.xk-qw{{--hx:0;background:linear-gradient({a}CC,{a}CC) no-repeat 0 62%/calc(var(--hx) * 100%) 62%;padding:0 2px;margin:0 -2px}}
.xk-mark{{position:absolute;right:40px;bottom:22px;font-size:46px;color:#B98A20;transform:rotate(-20deg)}}
.xk-glass{{position:absolute;inset:0;background:radial-gradient(75% 55% at 50% 40%,#231A0E 0%,#0F0C08 60%,#060505 100%)}}
.xk-grid{{position:absolute;inset:0;opacity:.5;background-image:linear-gradient({a}1A 1px,transparent 1px),linear-gradient(90deg,{a}1A 1px,transparent 1px);background-size:90px 90px;
  -webkit-mask-image:radial-gradient(60% 50% at 50% 45%,#000,transparent);mask-image:radial-gradient(60% 50% at 50% 45%,#000,transparent)}}
.xk-rays{{position:absolute;left:0;right:0;top:300px;height:700px;background:radial-gradient(40% 50% at 50% 30%,rgba(255,230,160,.30),transparent 70%)}}
.xk-eb{{position:absolute;left:0;right:0;top:320px;text-align:center;font:700 30px "XK-Bold";letter-spacing:.28em;text-transform:uppercase;color:var(--xa)}}
.xk-dg{{position:absolute;inset:0;width:1080px;height:1920px;overflow:visible}}
.xk-ln{{fill:none;stroke:var(--xa);stroke-width:6;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 10px {a}73)}}
.xk-ln.muted{{stroke:rgba(247,243,234,.85);stroke-width:5;filter:none}}
.xk-ln.cross{{stroke:#E8604C;stroke-width:9;filter:drop-shadow(0 0 10px rgba(232,96,76,.5))}}
.xk-card{{position:absolute;left:0;right:0;margin:0 auto;width:fit-content;display:flex;align-items:center;gap:20px;padding:26px 38px;border-radius:28px;
  background:linear-gradient(180deg,rgba(40,31,18,.78),rgba(18,14,9,.78));box-shadow:0 0 0 1px {a}47,0 20px 50px rgba(0,0,0,.45)}}
.xk-card b{{font:900 54px/1 "XK-Black";color:#F7F3EA;letter-spacing:-.02em}}
.xk-ic{{width:64px;height:64px;fill:none;stroke:var(--xa);stroke-width:4;stroke-linecap:round;stroke-linejoin:round}}
.xk-lab{{position:absolute;left:0;right:0;text-align:center;font:900 60px/1 "XK-Black";color:#F7F3EA;letter-spacing:-.02em;text-shadow:0 4px 18px rgba(0,0,0,.6)}}
.xk-lab.warn{{font-size:40px;color:#F08C78}}
.xk-scr{{font:400 104px/1 "XK-Script";color:#FFD873;letter-spacing:0;text-shadow:0 0 18px {a}73,0 3px 10px rgba(0,0,0,.6)}}
.xk-rows{{position:absolute;left:110px;right:110px;top:520px;display:flex;flex-direction:column;gap:36px}}
.xk-rows .xk-card{{position:relative;left:auto;right:auto;margin:0;width:auto;padding:34px 40px}}
.xk-num{{font:700 30px "XK-Bold";letter-spacing:.12em;color:var(--xa)}}
.xk-rows .xk-card b{{font-size:52px}}
.xk-tick{{width:56px;height:56px;margin-left:auto;overflow:visible}}
.xk-tick .xk-ln{{stroke-width:5}}
.xk-orbit{{position:absolute;left:310px;top:530px;width:460px;height:460px}}
.xk-orbit i{{position:absolute;left:216px;top:-14px;width:28px;height:28px;border-radius:50%;background:#FFE7A0;box-shadow:0 0 24px 6px {a}CC}}
.xk-step b{{color:var(--xa)}}
.xk-spark{{position:absolute;width:28px;height:28px;border-radius:50%;background:#FFE7A0;box-shadow:0 0 26px 8px {a}D9;opacity:0}}
"""
