"""Genius Cut scene kit: word-anchored scenes, full-frame AI B-roll, Motion MCP plates, masked titles, leaks, 3D cards.

Promoted from IMG_3795 (v2-v4, approved by B 2026-10-03). A project's build.py does:

    import sys; sys.path.insert(0, "../../pipeline")
    from scenekit import Kit
    K = Kit("assets/caption-words.json", "assets/edit-map.json")
    K.broll("stop", "laptop_close", K.KS(3), K.KE(5), K.mtitle(["Work stops", "<em>when you do.</em>"]), js=K.reveal("stop", K.A(4, "stop") - .1))
    K.scene("l4full", K.KS(27), K.KE(28), f'<div class="{K.motion_bg("l4full", K.KS(27), K.KE(28))}"><div class="grid"></div></div>...', ..., full=True)
    ... then template.replace("{{SCENES}}", K.scenes_html()).replace("{{BROLL}}", K.broll_html()) ...

Rules baked in for generic vertical compositions:
- every scene starts on a spoken word: A(keep, word) = start of that word in Scribe v2 timings on the cut;
- every <video> gets a unique id (HyperFrames freezes duplicates) and lives in an untimed wrapper the timeline animates;
- full-frame scenes are recorded in FULL so captions/gaze checks know the speaker is hidden;
- living panels never sit still (slow push + drifting grid); Motion plates replace the flat panel, text stays HTML.
Provide CSS for every emitted class in the active client composition.
"""
import json, os, re

nk = lambda s: re.sub(r"[^a-z0-9']", "", s.lower())


class Kit:
    def __init__(self, words="assets/caption-words.json", edit_map="assets/edit-map.json", first_track=3):
        self.W = json.load(open(words))
        self.M = json.load(open(edit_map))
        self.SC_HTML, self.SC_JS, self.FULL, self.BR_HTML, self.LEAKS = [], [], [], [], []
        self.track = first_track

    # ---------------------------------------------------------------- anchors
    def A(self, k, word, n=0):
        """start of the nth `word` inside keep k"""
        hits = [w for w in self.W if w["k"] == k and nk(w["w"]) == nk(word)]
        assert hits, f"no {word!r} in keep {k}"
        return hits[n]["s"]

    def E(self, k, word, n=0):
        return [w for w in self.W if w["k"] == k and nk(w["w"]) == nk(word)][n]["e"]

    def KS(self, k):
        return self.M[k]["edit_start"]

    def KE(self, k):
        return self.M[k]["edit_end"]

    # ---------------------------------------------------------------- scenes
    def scene(self, sid, t0, t1, body, js, full=False, cls=""):
        """A timed scene. full=True hides the speaker (opaque panel). js lines may use {T0},{T1}."""
        self.track += 1
        self.SC_HTML.append(f'<div id="{sid}" class="clip sc {cls}" data-start="{t0:.3f}" data-duration="{t1 - t0:.3f}" '
                            f'data-track-index="{self.track}"><div class="in">{body}</div></div>')
        self.SC_JS.append(f"/* {sid} */")
        self.SC_JS.extend([j.replace("{T0}", f"{t0:.3f}").replace("{T1}", f"{t1:.3f}") for j in js])
        self.SC_JS.append(f'tl.set("#{sid} .in",{{opacity:0}},{t1:.3f});')
        if full:
            self.FULL.append((t0, t1))
            if 'class="panel"' in body:   # living panels: slow push + drifting grid so no full frame sits still
                self.SC_JS.extend([f'tl.fromTo("#{sid} .panel",{{scale:1}},{{scale:1.07,duration:{t1 - t0:.3f},ease:"none"}},{t0:.3f});',
                                   f'tl.fromTo("#{sid} .panel .grid",{{y:0}},{{y:-90,duration:{t1 - t0:.3f},ease:"none"}},{t0:.3f});'])

    def broll(self, sid, clip, t0, t1, title="", eyebrow="", extra_html="", js=(), kb=(1.0, 1.14), src_dir="assets/broll",
              enter="zoom"):
        """Full-frame AI B-roll (muted video in an untimed wrapper) + kinetic overlay, slow push.
        enter="zoom" (zoom-blur in, IMG_3795) or "iris" (circle opens from the centre, IMG_3796).
        Clips are 5-8 s; a scene longer than the clip freezes on its last frame, so generate long enough."""
        if not os.path.exists(f"{src_dir}/{clip}.mp4"):
            return False
        vt = 100 + len(self.BR_HTML)
        self.BR_HTML.append(f'<div class="bw" id="bw-{sid}"><div class="kb"><video id="bv-{sid}" src="{src_dir}/{clip}.mp4" '
                            f'data-start="{t0:.3f}" data-duration="{min(t1 - t0, 7.9):.3f}" data-track-index="{vt}" muted playsinline>'
                            f'</video></div><div class="bgrade"></div><div class="grain"></div></div>')
        self.SC_JS.extend([f'gsap.set("#bw-{sid}",{{opacity:0}});',
                           self.iris_in(f"#bw-{sid}", t0) if enter == "iris" else
                           f'tl.fromTo("#bw-{sid}",{{opacity:0,scale:1.28,filter:"blur(22px)"}},{{opacity:1,scale:1,filter:"blur(0px)",duration:.32,ease:"power3.out"}},{t0:.3f});',
                           f'tl.fromTo("#bw-{sid} .kb",{{scale:{kb[0]}}},{{scale:{kb[1]},duration:{t1 - t0:.3f},ease:"none"}},{t0:.3f});',
                           f'tl.set("#bw-{sid}",{{opacity:0}},{t1:.3f});'])
        self.FULL.append((t0, t1))
        body = f'<div class="ovl">{f"<div class=eyebrow><i></i><span>{eyebrow}</span></div>" if eyebrow else ""}{title}{extra_html}</div>'
        self.scene(sid, t0, t1, body, list(js))
        return True

    def motion_bg(self, name, t0, t1, src_dir="assets/motion"):
        """Text-free Motion MCP plate (<src_dir>/<name>.mp4) under a living panel; returns the panel class to use.
        'panel mvp' (see-through grade so the plate shows) when the asset exists, else the plain 'panel'.
        Recipe for making plates: pipeline/MOTION-MCP.md."""
        if not os.path.exists(f"{src_dir}/{name}.mp4"):
            return "panel"
        vt = 100 + len(self.BR_HTML)
        self.BR_HTML.append(f'<div class="bw mw" id="mw-{name}"><div class="kb"><video id="mv-{name}" src="{src_dir}/{name}.mp4" '
                            f'data-start="{t0:.3f}" data-duration="{t1 - t0:.3f}" data-track-index="{vt}" muted playsinline></video></div>'
                            f'<div class="grain"></div></div>')
        self.SC_JS.extend([f'gsap.set("#mw-{name}",{{opacity:0}});',
                           f'tl.to("#mw-{name}",{{opacity:1,duration:.18}},{t0:.3f});',
                           f'tl.set("#mw-{name}",{{opacity:0}},{t1:.3f});'])
        return "panel mvp"

    # ---------------------------------------------------------------- titles + motion
    @staticmethod
    def mtitle(lines, cls=""):
        """Masked line reveal title: each line slides up out of its own mask."""
        return f'<div class="otitle {cls}">' + "".join(f'<span class="mask"><span>{l}</span></span>' for l in lines) + "</div>"

    @staticmethod
    def reveal(sid, at, stagger=.09):
        return [f'gsap.set("#{sid} .mask>span",{{yPercent:110}});',
                f'tl.to("#{sid} .mask>span",{{yPercent:0,duration:.42,ease:"expo.out",stagger:{stagger}}},{at:.3f});']

    def leak(self, at, dur=.7):
        i = len(self.LEAKS)
        self.LEAKS.append(f'<div class="leak clip" id="lk{i}" data-start="{at:.3f}" data-duration="{dur:.3f}" data-track-index="{80 + i}"></div>')
        self.SC_JS.extend([f'gsap.set("#lk{i}",{{opacity:0,x:-160}});',
                           f'tl.to("#lk{i}",{{opacity:.85,x:0,duration:{dur * .4:.3f},ease:"power2.out"}},{at:.3f});',
                           f'tl.to("#lk{i}",{{opacity:0,x:160,duration:{dur * .6:.3f},ease:"power2.in"}},{at + dur * .4:.3f});'])

    @staticmethod
    def topcard_in(sid, t0):
        """3D card entrance (tilts down from the top edge) + glass sheen. Top cards live in y 170-540, never on the face."""
        return [f'gsap.set("#{sid} .in",{{opacity:0,y:-30,rotationX:-28,transformPerspective:1200,transformOrigin:"50% 0%"}});',
                f'tl.to("#{sid} .in",{{opacity:1,y:0,rotationX:0,duration:.45,ease:"back.out(1.6)"}},{t0:.3f});',
                f'tl.fromTo("#{sid} .sheen",{{x:0}},{{x:1300,duration:.9,ease:"power2.out"}},{t0 + .1:.3f});']

    @staticmethod
    def topcard_out(sid, t1):
        return [f'tl.to("#{sid} .in",{{opacity:0,y:-30,duration:.22,ease:"power2.in"}},{t1 - .25:.3f});']

    @staticmethod
    def pop(sel, at, dur=.22, frm="y:18"):
        return [f'gsap.set("{sel}",{{opacity:0,{frm}}});',
                f'tl.to("{sel}",{{opacity:1,x:0,y:0,scale:1,duration:{dur},ease:"back.out(2)"}},{at:.3f});']

    @staticmethod
    def iris_in(sel, t0, dur=.4, at="50% 42%"):
        """Circle wipe: the layer opens from a point (default: just above centre, where the eye already is).
        immediateRender:false keeps the layer hidden until t0 (otherwise the 0% circle shows as a dot on the face)."""
        return (f'tl.fromTo("{sel}",{{opacity:1,clipPath:"circle(0% at {at})"}},'
                f'{{opacity:1,clipPath:"circle(150% at {at})",duration:{dur},ease:"power3.out",immediateRender:false}},{t0:.3f});')

    @staticmethod
    def slam(sel, at, dur=.26):
        """Outline-to-solid word slam: text lands big and hollow, then fills. The fill is a data-f attribute, not a
        class swap, so colour classes (.hot / .ice) survive. CSS: .slam / .slam[data-f] in skins/studio.css."""
        return [f'gsap.set("{sel}",{{opacity:0,scale:1.6}});',
                f'tl.to("{sel}",{{opacity:1,scale:1,duration:{dur},ease:"expo.out"}},{at:.3f});',
                f'tl.set("{sel}",{{attr:{{"data-f":"1"}}}},{at + dur:.3f});']

    @staticmethod
    def full_in(sid, t0):
        return [f'gsap.set("#{sid} .in",{{opacity:0}});', f'tl.to("#{sid} .in",{{opacity:1,duration:.18}},{t0:.3f});']

    # ---------------------------------------------------------------- output
    def scenes_html(self):
        return "\n  ".join(self.SC_HTML)

    def broll_html(self):
        return "\n  ".join(self.BR_HTML)

    def leaks_html(self):
        return "\n  ".join(self.LEAKS)

    def scene_js(self):
        return "\n  ".join(self.SC_JS)
