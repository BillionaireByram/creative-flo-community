"""Scribe v2 stutter gate: fails on any immediate 1-4-word repeat or cut-off word.
Usage (from a project assets dir with a probe/ folder): set -a; source <creative-flo>/openmontage/.env; set +a; python3 scripts/scribe-gate.py <media>"""
import json, re, subprocess, sys, os
src = sys.argv[1]; out = os.path.splitext(os.path.basename(src))[0]
key = os.environ["ELEVENLABS_API_KEY"]  # run with Creative Flo openmontage/.env sourced (set -a; source ...)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "flac", f"probe/{out}.flac"], check=True)
r = subprocess.run(["curl", "-s", "-H", f"xi-api-key: {key}", "-F", "model_id=scribe_v2", "-F", f"file=@probe/{out}.flac",
                    "-F", "timestamps_granularity=word", "-F", "tag_audio_events=false", "https://api.elevenlabs.io/v1/speech-to-text"],
                   capture_output=True, text=True)
d = json.loads(r.stdout); json.dump(d, open(f"scribe-v2-{out}.json", "w"), indent=0)
ws = [w for w in d["words"] if w["type"] == "word"]
k = lambda s: re.sub(r"[^a-z']", "", s.lower()); toks = [k(w["text"]) for w in ws]
rep = [(round(ws[i]["start"], 2), " ".join(toks[i:i + 2 * n])) for n in (1, 2, 3, 4) for i in range(len(toks) - 2 * n + 1)
       if toks[i:i + n] == toks[i + n:i + 2 * n] and any(len(t) > 1 for t in toks[i:i + n])]
cut = [w["text"] for w in ws if w["text"].rstrip(",.").endswith("-")]
print(" ".join(w["text"] for w in ws))
print(f"\nSCRIBE v2 GATE: {len(ws)} words · repeats {rep or 0} · cut-off words {cut or 0} -> {'PASS' if not rep and not cut else 'FAIL'}")
sys.exit(1 if rep or cut else 0)
