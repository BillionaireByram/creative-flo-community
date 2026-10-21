"""Caption word timings from ElevenLabs Scribe v2 on the rendered clean cut, aligned onto the intended script.
Usage (in assets/, key sourced): python3 align_captions_scribe.py <clean-cut.mov>  -> caption-words.json"""
import json, re, difflib, subprocess, sys, os
# Trusted import also works when invoked with python -I.
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from stages.provider import media_run
src = sys.argv[1]
media_run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "flac", "probe/_align.flac"], check=True)
r = subprocess.run(["curl", "-s", "-H", f"xi-api-key: {os.environ['ELEVENLABS_API_KEY']}", "-F", "model_id=scribe_v2",
                    "-F", "file=@probe/_align.flac", "-F", "timestamps_granularity=word", "-F", "tag_audio_events=false",
                    "https://api.elevenlabs.io/v1/speech-to-text"], capture_output=True, text=True, check=True)
heard = [w for w in json.loads(r.stdout)["words"] if w["type"] == "word"]
m = json.load(open("edit-map.json"))
tok = lambda s: re.findall(r"[A-Za-z0-9'\-]+[.,?!]*", s)
key = lambda w: re.sub(r"[^a-z0-9']", "", w.lower())
alias = {"flow": "flo", "float": "flo", "pushes": "puts", "pushed": "puts", "push": "puts", "talk": "talked"}
want = [(w, x["i"]) for x in m for w in tok(x["text"])]
wk = [key(w) for w, _ in want]; hk = [alias.get(key(w["text"]), key(w["text"])) for w in heard]
sm = difflib.SequenceMatcher(a=wk, b=hk, autojunk=False)
times = [None] * len(want); exact = 0
for op, a1, a2, b1, b2 in sm.get_opcodes():
    if op == "equal": exact += a2 - a1
    if op in ("equal", "replace") and b2 > b1:
        for j in range(a2 - a1):
            b = b1 + min(j, b2 - b1 - 1); times[a1 + j] = (heard[b]["start"], heard[b]["end"])
for j in range(len(want)):
    if times[j] is None:
        prev = next((times[k][1] for k in range(j - 1, -1, -1) if times[k]), 0.0)
        nxt = next((times[k][0] for k in range(j + 1, len(want)) if times[k]), prev + 0.3)
        times[j] = (prev, min(nxt, prev + 0.25))
out = [{"w": w, "s": round(s, 3), "e": round(e, 3), "k": k} for (w, k), (s, e) in zip(want, times)]
json.dump(out, open("caption-words.json", "w"), indent=0)
print(f"{len(out)} script words, {exact} matched exactly by Scribe v2, {len(out) - exact} aligned by neighbour/alias")
