"""Render the clean cut from edl.json, then audit every join (silence at cut, click size) and A/V length."""
import json, subprocess, sys, re, difflib, wave
import numpy as np
OUT = sys.argv[1]
e = json.load(open("edl.json"))["segments"]; F = 30; SR = 48000
fc = []
for k, s in enumerate(e):
    a, b = s["f_start"], s["f_end"]; d = (b - a) / F
    fc.append(f"[0:v]trim=start_frame={a}:end_frame={b},setpts=PTS-STARTPTS[v{k}]")
    fc.append(f"[0:a]atrim=start_sample={a*SR//F}:end_sample={b*SR//F},asetpts=PTS-STARTPTS,afade=t=in:d=0.012,afade=t=out:st={d-0.015:.4f}:d=0.015[a{k}]")
fc.append("".join(f"[v{k}][a{k}]" for k in range(len(e))) + f"concat=n={len(e)}:v=1:a=1[v][a]")
open("cut.filter", "w").write(";\n".join(fc))
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "master.mov", "-filter_complex_script", "cut.filter", "-map", "[v]", "-map", "[a]",
                "-c:v", "libx264", "-crf", "15", "-preset", "slow", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709",
                "-colorspace", "bt709", "-c:a", "pcm_s16le", OUT], check=True)
t = 0; m = []
for s in e:
    d = (s["f_end"] - s["f_start"]) / F
    m.append({"i": s["i"], "edit_start": round(t, 3), "edit_end": round(t + d, 3), "raw_start": s["start"], "text": s["text"]}); t += d
json.dump(m, open("edit-map.json", "w"), indent=1)
pr = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,duration", "-of", "csv=p=0", OUT], capture_output=True, text=True).stdout.split()
print("A/V stream durations:", pr, "expected", round(t, 3))
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", OUT, "-ac", "1", "-ar", "16000", "verify16k.wav"], check=True)
# word-level checks live in scribe-gate.py (Scribe v2) and align_captions_scribe.py; this script audits joins only.
w = wave.open("verify16k.wav"); sr = w.getframerate()
xs = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float) / 32768
print("\nJOIN  edit_t  silence  click")
for j in m[1:]:
    i = int(j["edit_start"] * sr); lo = max(0, i - 9600); seg = xs[lo:i + 9600]; hop = 160
    db = 20 * np.log10(np.sqrt((seg[: len(seg) // hop * hop].reshape(-1, hop) ** 2).mean(1)) + 1e-9); c = (i - lo) // hop
    l = c
    while l > 0 and db[l] < -44: l -= 1
    r_ = c
    while r_ < len(db) - 1 and db[r_] < -44: r_ += 1
    jump = np.abs(np.diff(xs[max(0, i - 160):i + 160])).max()
    print(f"{j['i']:2d}  {j['edit_start']:6.2f}  {(r_-l)/100:5.2f}s{'  <-- speech at cut' if db[c] > -44 else ''}  {jump:.3f}")

