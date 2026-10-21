"""Review pass on a rendered cut: what an editor checks by watching it.

Usage (in assets/):  python3 review_cut.py <clean-cut.mov> [--fps 2] [--crop x,y,w,h|full] [--pause 0.40]
  Cut review: default head crop at 2 fps. Edit/graphics review: --crop full --fps 1 on the render (whole 9:16 frame:
  cards over the face, text collisions, captions under scenes, glitch frames, end tag).
Writes review/<cut>/:
  sheet-NN.jpg  contact sheets of the head crop at --fps (edit-time stamp on every tile) -> look at every one:
                eyes off the lens, blinks held, face leaving frame, hands covering, awkward expression
  pauses.md     every silence >= --pause s in the cut (edit time, keep, raw time, inside a keep or at a join)
Each finding goes back into keeps.json (split a keep, tighten a join, force_in/force_out, or flag the moment for
a full-frame visual), then render again and review again. The cut moves on to graphics only after a clean pass.
"""
import json, os, subprocess, sys, wave
import numpy as np

args = sys.argv[1:]
src = args[0]
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
FPS = float(opt("--fps", "2"))
CROP = opt("--crop", "120,380,840,900")          # head + shoulders on a 1080x1920 talking head
PAUSE = float(opt("--pause", "0.40"))
COLS, ROWS = 10, 6
name = os.path.splitext(os.path.basename(src))[0]
out = os.path.join("review", name)
os.makedirs(out, exist_ok=True)
for f in os.listdir(out):
    if f.startswith("sheet-"):
        os.remove(os.path.join(out, f))

# ---- contact sheets (head crop, edit-time + keep stamp per tile)
from PIL import Image, ImageDraw, ImageFont
m = json.load(open("edit-map.json")) if os.path.exists("edit-map.json") else []
def keep_at(t):
    return next((k for k in m if k["edit_start"] <= t < k["edit_end"]), None)
x, y, w, h = CROP.split(",") if CROP != "full" else (0, 0, 0, 0)
tmp = os.path.join(out, "_frames")
os.makedirs(tmp, exist_ok=True)
for f in os.listdir(tmp):
    os.remove(os.path.join(tmp, f))
crop = "" if CROP == "full" else f"crop={w}:{h}:{x}:{y},"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vf", f"fps={FPS},{crop}scale=216:-2",
                "-q:v", "4", os.path.join(tmp, "f%05d.jpg")], check=True)
frames = sorted(os.listdir(tmp))
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 22)
except OSError:
    font = ImageFont.load_default()
tw, th = Image.open(os.path.join(tmp, frames[0])).size
per = COLS * ROWS
for s0 in range(0, len(frames), per):
    sheet = Image.new("RGB", (COLS * (tw + 4) + 4, ROWS * (th + 4) + 4), "white")
    d = ImageDraw.Draw(sheet)
    for k, f in enumerate(frames[s0:s0 + per]):
        t = (s0 + k) / FPS          # fps filter samples at t = n / FPS
        kp = keep_at(t)
        px, py = 4 + (k % COLS) * (tw + 4), 4 + (k // COLS) * (th + 4)
        sheet.paste(Image.open(os.path.join(tmp, f)), (px, py))
        label = f"{t:6.1f}s" + (f" k{kp['i']}" if kp else "")
        d.rectangle([px, py, px + 112, py + 26], fill="black")
        d.text((px + 4, py + 2), label, fill="yellow", font=font)
    sheet.save(os.path.join(out, f"sheet-{s0 // per + 1:02d}.jpg"), quality=82)
for f in frames:
    os.remove(os.path.join(tmp, f))
os.rmdir(tmp)
sheets = sorted(f for f in os.listdir(out) if f.startswith("sheet-"))

# ---- pauses (10 ms RMS of the cut's own audio)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", os.path.join(out, "a16k.wav")], check=True)
wv = wave.open(os.path.join(out, "a16k.wav"))
xs = np.frombuffer(wv.readframes(wv.getnframes()), dtype=np.int16).astype(float) / 32768
hop = 160
db = 20 * np.log10(np.sqrt((xs[: len(xs) // hop * hop].reshape(-1, hop) ** 2).mean(1)) + 1e-9)
quiet = db < -44
rows, i = [], 0
while i < len(quiet):
    if quiet[i]:
        j = i
        while j < len(quiet) and quiet[j]:
            j += 1
        a, b = i / 100, j / 100
        if b - a >= PAUSE and a > 0.2 and j < len(quiet) - 5:
            ka, kb = keep_at(a), keep_at(b - 0.01)
            where = "join" if ka and kb and ka["i"] != kb["i"] else "INSIDE keep"
            raw = f"{ka['raw_start'] + (a - ka['edit_start']):.2f}" if ka else "-"
            rows.append((a, b - a, where, ka["i"] if ka else "-", raw, (ka or {}).get("text", "")[:70]))
        i = j
    else:
        i += 1
with open(os.path.join(out, "pauses.md"), "w") as f:
    f.write(f"# Pauses >= {PAUSE:.2f}s in {src}\n\n| edit t | length | where | keep | raw t | keep text |\n|---|---|---|---|---|---|\n")
    for r in rows:
        f.write(f"| {r[0]:.2f} | {r[1]:.2f} | {r[2]} | {r[3]} | {r[4]} | {r[5]} |\n")
inside = sum(r[2] == "INSIDE keep" for r in rows)
print(f"{len(sheets)} sheets ({COLS * ROWS} tiles each, {1 / FPS:.1f}s apart) + {len(rows)} pauses >= {PAUSE}s "
      f"({inside} inside keeps) -> {out}/")
