# Creative Flo. Created by Byram Smith Jr., a DigitalFlo product. MIT licensed, see LICENSE and NOTICE.
"""Genius Cut ingest: run-order steps 1-3 plus a draft paper edit, in one command.

Usage (repo root):  npm run ingest -- <slug> <camera-file> [--redraft] [--retranscribe] [--remaster]
  Reruns reuse master.mov and the Scribe transcript; keeps.json is never overwritten without --redraft.
  1. creates video-projects/<slug> and copies the pipeline scripts + build/ in
  2. SDR master.mov (iPhone HLG -> BT.709; VideoToolbox on macOS, zscale tonemap elsewhere)
  3. audio16k.wav + env10ms.npy (16 kHz RMS per 10 ms, dBFS, floor -120)
  4. Scribe v2 transcript of the whole take -> scribe-v2-source.json (no Scribe key = stop, never Whisper)
  5. paper-edit.md (every phrase, dropped words in [brackets] with the reason) and keeps.json (draft KEEPS for edl.py)

keeps.json is a DRAFT. Review every DROP and every flag against the audio before running edl.py.
"""
import json, os, platform, re, shutil, subprocess, sys, wave
# Trusted import also works when invoked with python -I.
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from stages.provider import media_run
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
PIPE = ROOT / "pipeline"
SCRIPTS = ["edl.py", "render_cut.py", "mix.py", "align_captions_scribe.py", "scribe-gate.py", "review_cut.py"]
PHRASE_GAP = 0.35      # silence that ends a phrase in the paper edit
SPLIT_GAP = 0.40       # any word gap this long becomes a cut, so edl.py re-times every pause (raw gaps never ride along)


def sh(*cmd, **kw):
    return (media_run if cmd[0] in ("ffmpeg", "ffprobe") else subprocess.run)(list(cmd), check=True, **kw)


def probe(src):
    out = media_run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream=width,height,color_transfer:stream_side_data=rotation",
                          "-of", "json", str(src)], capture_output=True, text=True, check=True).stdout
    s = json.loads(out)["streams"][0]
    rot = next((abs(int(d.get("rotation", 0))) for d in s.get("side_data_list", [])), 0)
    w, h = s["width"], s["height"]
    if rot in (90, 270):
        w, h = h, w
    return w, h, s.get("color_transfer", "")


def load_key():
    if os.environ.get("ELEVENLABS_API_KEY"):
        return os.environ["ELEVENLABS_API_KEY"]
    for env in [ROOT / ".env", ROOT.parent / "openmontage" / ".env", Path(os.environ.get("CREATIVE_FLO_ENV", "/nonexistent"))]:
        if env.is_file():
            for line in env.read_text().splitlines():
                m = re.match(r"\s*(?:export\s+)?ELEVENLABS_API_KEY\s*=\s*['\"]?([^'\"\s]+)", line)
                if m:
                    return m.group(1)
    sys.exit("STOP: no ELEVENLABS_API_KEY (repo .env, ../openmontage/.env or CREATIVE_FLO_ENV). "
             "Scribe v2 is required for cuts; Whisper is not a fallback.")


def master(src, dst):
    w, h, trc = probe(src)
    tw, th = (1080, 1920) if h >= w else (1920, 1080)
    hlg = trc in ("arib-std-b67", "smpte2084")
    common = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "14", "-g", "30", "-r", "30",
              "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
              "-c:a", "pcm_s16le", "-ar", "48000", str(dst)]
    if hlg and platform.system() == "Darwin":
        vf = (f"scale_vt=w={tw}:h={th}:color_matrix=bt709:color_primaries=bt709:color_transfer=bt709,"
              "hwdownload,format=p010le")
        sh("ffmpeg", "-v", "error", "-y", "-hwaccel", "videotoolbox", "-hwaccel_output_format", "videotoolbox_vld",
           "-i", str(src), "-vf", vf, *common)
    elif hlg:
        vf = (f"zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,"
              f"zscale=t=bt709:m=bt709:r=tv,format=yuv420p,scale={tw}:{th}")
        sh("ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", vf, *common)
    else:
        sh("ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", f"scale={tw}:{th}", *common)
    return tw, th, trc


def envelope(wav16, out):
    w = wave.open(str(wav16))
    x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
    hop = w.getframerate() // 100
    n = len(x) // hop
    db = 20 * np.log10(np.sqrt((x[: n * hop].reshape(n, hop) ** 2).mean(1)) + 1e-9)
    np.save(out, np.maximum(db, -120).astype(np.float32))


def scribe(flac, key, out):
    r = subprocess.run(["curl", "-s", "-f", "-H", f"xi-api-key: {key}", "-F", "model_id=scribe_v2",
                        "-F", f"file=@{flac}", "-F", "timestamps_granularity=word", "-F", "tag_audio_events=false",
                        "https://api.elevenlabs.io/v1/speech-to-text"], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"STOP: Scribe v2 request failed (curl {r.returncode}). {r.stderr.strip()[:200]}")
    d = json.loads(r.stdout)
    json.dump(d, open(out, "w"), indent=0)
    return [w for w in d["words"] if w["type"] == "word"]


norm = lambda s: re.sub(r"[^a-z0-9']", "", s.lower())
BRAND = {"Flow": "Flo", "Flow.": "Flo.", "Flow,": "Flo,", "Flow?": "Flo?"}   # Scribe hears B's brand as "Flow"
STUTTER_SPAN = 1.6     # a repeat counts as a stutter only if both copies fall inside this many seconds


def phrases(words):
    out, cur = [], []
    for i, w in enumerate(words):
        if cur and w["start"] - words[cur[-1]]["end"] >= PHRASE_GAP:
            out.append(cur); cur = []
        cur.append(i)
    return out + [cur] if cur else out


def clean(words, ps, alts):
    """Word-level drop mask: cut-off words, stutters / immediate repeats, then earlier takes of a restarted line."""
    drop, why = set(), {}
    for i, w in enumerate(words):
        if w["text"].rstrip(",.?!").endswith("-"):
            drop.add(i); why[i] = "cut-off"
    repeats(words, drop, why, bridged=False)
    units = []                                              # phrases split at sentence ends
    for p in ps:
        cur = []
        for i in p:
            cur.append(i)
            if words[i]["text"].rstrip()[-1:] in ".?!":
                units.append(cur); cur = []
        if cur:
            units.append(cur)
    for pi, p in enumerate(units):                          # restarts: a later unit re-says this one
        a = [i for i in p if i not in drop]
        ta = [norm(words[i]["text"]) for i in a]
        if len(ta) < 2:
            continue
        for q in units[pi + 1:pi + 4]:
            tb = [norm(words[i]["text"]) for i in q if i not in drop]
            best, at = 0, 0
            for x in range(len(ta)):
                for y in range(len(tb)):
                    k = 0
                    while x + k < len(ta) and y + k < len(tb) and ta[x + k] == tb[y + k]:
                        k += 1
                    if k > best:
                        best, at = k, x
            if best >= 2 and best >= 0.6 * (len(ta) - at):
                at = at if at >= 3 else 0                   # a 1-2 word lead-in can't stand alone
                for i in a[at:]:
                    drop.add(i); why[i] = f"earlier take of '{' '.join(tb[:6])}...'"
                alt = [norm(words[i]["text"]) for i in a[at:]]
                if alt[-best:] != tb[:best] and alt[best:] and tb[best:] and alt[best:] != tb[best:len(alt)]:
                    alts[q[0]] = " ".join(words[i]["text"] for i in a[at:])   # different wording, not a pure retake
                break
    repeats(words, drop, why, bridged=True)                 # repeats that only touch once a retake is gone
    return drop, why


def repeats(words, drop, why, bridged):
    """Drop the first copy of an immediate 1-4 word repeat. bridged=True also catches repeats that only meet
    across already-dropped words ("but now, [retake] now I ..."), at any distance."""
    for n in (4, 3, 2, 1):                                  # longest repeat first
        live = [i for i in range(len(words)) if i not in drop]
        toks = [norm(words[i]["text"]) for i in live]
        for j in range(len(live) - 2 * n + 1):
            a, b = live[j:j + n], live[j + n:j + 2 * n]
            if any(i in drop for i in a + b) or toks[j:j + n] != toks[j + n:j + 2 * n]:
                continue
            if not any(len(t) > 1 for t in toks[j:j + n]) and toks[j] not in ("i", "a"):
                continue
            close = words[b[-1]]["end"] - words[a[0]]["start"] <= STUTTER_SPAN
            if close or (bridged and b[0] - a[-1] > 1):
                for i in a:
                    drop.add(i); why[i] = f"repeat '{' '.join(toks[j:j + n])}'"


def draft(words):
    ps = phrases(words)
    alts = {}
    drop, why = clean(words, ps, alts)
    fix = lambda t: BRAND.get(t, t)
    runs, cur = [], []                                      # kept words -> keeps
    for pi, p in enumerate(ps):
        for i in p:
            if i in drop:
                if cur: runs.append(cur); cur = []
                continue
            if cur and (words[i]["start"] - words[cur[-1]]["end"] >= SPLIT_GAP or (i - cur[-1]) != 1):
                runs.append(cur); cur = []
            cur.append(i)
    if cur:
        runs.append(cur)
    keeps = []
    for r, run in enumerate(runs):
        f, l = run[0], run[-1]
        lo = words[f - 1]["end"] + 0.03 if f > 0 else 0.0
        hi = words[l + 1]["start"] - 0.03 if l + 1 < len(words) else words[l]["end"] + 0.6
        text = " ".join(fix(words[i]["text"]) for i in run)
        if not keeps or keeps[-1][2].rstrip()[-1:] in ".?!":
            text = text[:1].upper() + text[1:]
        notes = [f"tight join to dropped '{words[f - 1]['text']}'" for _ in [0] if f > 0 and f - 1 in drop
                 and words[f]["start"] - words[f - 1]["end"] < 0.12]
        notes += [f"tight join to dropped '{words[l + 1]['text']}'" for _ in [0] if l + 1 < len(words) and l + 1 in drop
                  and words[l + 1]["start"] - words[l]["end"] < 0.12]
        notes += [f"alt take dropped: '{alts[i]}'" for i in run if i in alts]
        if r + 1 == len(runs):
            join = "end"
        else:
            join = "phrase" if text.rstrip()[-1:] in ".?!" else "word"   # "beat" is an editorial call, never auto
        keeps.append([round(max(lo, words[f]["start"] - 0.15), 2), round(min(hi, words[l]["end"] + 0.15), 2), text, join,
                      *(["CHECK: " + "; ".join(notes)] if notes else [])])
    lines = []
    for pi, p in enumerate(ps):
        t = " ".join(f"[{words[i]['text']}]" if i in drop else words[i]["text"] for i in p)
        lines.append(f"{pi:3d}  {words[p[0]]['start']:7.2f}-{words[p[-1]]['end']:7.2f}  {t}")
        reasons = sorted({why[i] for i in p if i in drop})
        lines += [f"{'':22}- {x}" for x in reasons]
    return ps, drop, keeps, lines


def main():
    args = [x for x in sys.argv[1:] if not x.startswith("--")]
    if len(args) != 2:
        sys.exit("Usage: npm run ingest -- <slug> <camera-file> [--redraft] [--retranscribe] [--remaster]")
    slug, src = args[0], Path(args[1]).expanduser().resolve()
    if not src.is_file():
        sys.exit(f"No such file: {src}")
    key = load_key()
    proj = Path(os.environ["CREATIVE_FLO_PROJECT_DIR"]) if os.environ.get("CREATIVE_FLO_PROJECT_DIR") else ROOT / "video-projects" / slug
    if os.environ.get("CREATIVE_FLO_PROJECT_DIR"):
        shutil.copytree(ROOT / "examples/starter", proj, dirs_exist_ok=True)
        for folder in ("assets", "compositions", "renders"):
            (proj / folder).mkdir(exist_ok=True)
        shutil.copy2(ROOT / "node_modules/gsap/dist/gsap.min.js", proj / "assets/gsap.min.js")
    elif not proj.exists():
        sh("node", str(ROOT / "scripts/new-video.mjs"), slug)
    a = proj / "assets"
    for f in SCRIPTS:
        shutil.copy2(PIPE / f, a / f)
    # Standalone copied helpers share the same validation and media boundary.
    shutil.copytree(PIPE / "stages", a / "stages", dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns("__pycache__", "prompts", "examples", "stubs.py"))
    shutil.copy2(PIPE / "build.py", proj / "build.py")
    shutil.copytree(PIPE / "build", proj / "build", dirs_exist_ok=True)
    (a / "probe").mkdir(exist_ok=True)

    srcdst = a / ("source" + src.suffix)
    if not srcdst.exists():
        try:
            os.link(src, srcdst)          # no second copy of a 700 MB camera file
        except OSError:
            shutil.copy2(src, srcdst)
    print(f"[1/4] project video-projects/{slug} ready")

    if (a / "master.mov").exists() and "--remaster" not in sys.argv:
        print("[2/4] master.mov exists, kept (--remaster to rebuild)")
    else:
        tw, th, trc = master(srcdst, a / "master.mov")
        print(f"[2/4] master.mov {tw}x{th} from transfer '{trc or 'unknown'}'")

    sh("ffmpeg", "-v", "error", "-y", "-i", str(a / "master.mov"), "-vn", "-ac", "1", "-ar", "16000", str(a / "audio16k.wav"))
    envelope(a / "audio16k.wav", a / "env10ms.npy")
    sh("ffmpeg", "-v", "error", "-y", "-i", str(a / "audio16k.wav"), "-c:a", "flac", str(a / "probe/source.flac"))
    print("[3/4] audio16k.wav + env10ms.npy")

    sj = a / "scribe-v2-source.json"
    if sj.exists() and "--retranscribe" not in sys.argv:
        words = [w for w in json.load(open(sj))["words"] if w["type"] == "word"]
    else:
        words = scribe(a / "probe/source.flac", key, sj)
    ps, drop, keeps, body = draft(words)
    head = [f"# Paper edit draft: {slug}", "",
            f"Scribe v2: {len(words)} words, {len(ps)} phrases, {len(drop)} words dropped ([bracketed]). "
            "Drops = cut-off words, stutters (repeat inside 1.6 s), earlier takes of a restarted line. "
            "Review every drop and every CHECK in keeps.json against the audio; editorial trims (lines that "
            "don't earn their place) are still your call. Then run `python3 edl.py`.", ""]
    (a / "paper-edit.md").write_text("\n".join(head + body) + "\n")
    if (a / "keeps.json").exists() and "--redraft" not in sys.argv:
        print("[4/4] keeps.json exists (reviewed?); wrote paper-edit.md only. Pass --redraft to overwrite keeps.json.")
    else:
        json.dump({"keeps": keeps, "force_in": {}}, open(a / "keeps.json", "w"), indent=1)
        print(f"[4/4] paper-edit.md + keeps.json: {len(keeps)} keeps, {len(drop)} words dropped, "
              f"{sum(len(k) > 4 for k in keeps)} keeps marked CHECK")
    print(f"\nNext: review assets/paper-edit.md, fix keeps.json, then in assets/: python3 edl.py && "
          f"python3 render_cut.py clean-cut-v1.mov && python3 scribe-gate.py clean-cut-v1.mov")


if __name__ == "__main__":
    main()
