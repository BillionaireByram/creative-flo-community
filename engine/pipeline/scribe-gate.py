"""Scribe v2 stutter gate: fails on any immediate 1-4-word repeat or cut-off word.
Usage (from a project assets dir with a probe/ folder): set -a; source <creative-flo>/openmontage/.env; set +a; python3 scribe-gate.py <media>

Full-file passes sometimes invent words at joins (a "just" or a doubled "an" that isn't in the audio). Every
flagged repeat is therefore re-transcribed on its own 4.5 s window; it only fails the gate if the window
confirms it. Cut-off words always fail."""
import json, re, subprocess, sys, os
# Trusted import also works when invoked with python -I.
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from stages.provider import media_run
src = sys.argv[1]; out = os.path.splitext(os.path.basename(src))[0]
key = os.environ["ELEVENLABS_API_KEY"]  # run with Creative Flo openmontage/.env sourced (set -a; source ...)
os.makedirs("probe", exist_ok=True)


def scribe(path, tag):
    media_run(["ffmpeg", "-v", "error", "-y", *path, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "flac", f"probe/{tag}.flac"], check=True)
    r = subprocess.run(["curl", "-s", "-H", f"xi-api-key: {key}", "-F", "model_id=scribe_v2", "-F", f"file=@probe/{tag}.flac",
                        "-F", "timestamps_granularity=word", "-F", "tag_audio_events=false", "https://api.elevenlabs.io/v1/speech-to-text"],
                       capture_output=True, text=True)
    return json.loads(r.stdout)


k = lambda s: re.sub(r"[^a-z']", "", s.lower())


def repeats(ws):
    toks = [k(w["text"]) for w in ws]
    return [(round(ws[i]["start"], 2), " ".join(toks[i:i + 2 * n])) for n in (1, 2, 3, 4) for i in range(len(toks) - 2 * n + 1)
            if toks[i:i + n] == toks[i + n:i + 2 * n] and any(len(t) > 1 for t in toks[i:i + n])]


d = scribe(["-i", src], out); json.dump(d, open(f"scribe-v2-{out}.json", "w"), indent=0)
ws = [w for w in d["words"] if w["type"] == "word"]
rep = repeats(ws)
cut = [w["text"] for w in ws if w["text"].rstrip(",.").endswith("-")]
real, artifacts = [], []
for t, txt in rep:
    a = max(0.0, t - 2.0)
    wd = scribe(["-ss", f"{a:.2f}", "-t", "4.5", "-i", src], f"{out}-win")
    wws = [w for w in wd["words"] if w["type"] == "word"]
    (real if repeats(wws) else artifacts).append((t, txt))
print(" ".join(w["text"] for w in ws))
print(f"\nSCRIBE v2 GATE: {len(ws)} words · repeats {real or 0} · cut-off words {cut or 0}"
      + (f" · full-pass artifacts cleared by window check {artifacts}" if artifacts else "")
      + f" -> {'PASS' if not real and not cut else 'FAIL'}")
sys.exit(1 if real or cut else 0)
