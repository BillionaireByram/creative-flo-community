"""Final audio: voice + ducked music bed + SFX from anchors.json (every hit sits on its visual's word), -14 LUFS.

Run from the project's assets/ dir:  python3 mix.py <music.mp3 | none> [out.wav] [--voice clean-cut.mov] [--delay 0.0]
Music options: render 2-3 beds into audio/ (music-<name>.mp3) and let B pick by ear; "none" = voice + SFX only.
anchors.json (written by build.py) carries "total" and "sfx": [[name, time, gain], ...] -> audio/sfx-<name>.mp3.
House rules (B, 2026-10-03): no glitch/static SFX ever (visual glitch slices may stay); the soft swoosh plays only on
section changes. Two-pass loudnorm: one pass lands ~2-3 LU low on speech-heavy mixes.
"""
import argparse, glob, json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from stages.sfx import validate_anchors, number

ap = argparse.ArgumentParser()
ap.add_argument("music", nargs="?", default="none")
ap.add_argument("out", nargs="?", default="final-mix.wav")
ap.add_argument("--voice", default=(sorted(glob.glob("clean-cut*.mov")) or ["clean-cut.mov"])[-1])
ap.add_argument("--delay", type=float, default=0.0, help="seconds to delay the bed (line a drop up with a beat)")
ap.add_argument("--bed", type=float, default=0.28, help="music gain before ducking")
a = ap.parse_args()

A = json.load(open("anchors.json"))
TOTAL, sfx = validate_anchors(A, Path("audio"))
a.bed = number(a.bed, 0, 2, "bed gain")
a.delay = number(a.delay, 0, TOTAL, "bed delay")
inp = ["-i", a.voice, "-i", a.music if a.music != "none" else a.voice]
d = int(a.delay * 1000)
fc = ["[0:a]aresample=48000,apad=whole_dur=%.3f,asplit=2[voice][key]" % TOTAL,
      f"[1:a]aresample=48000,adelay={d}|{d},atrim=0:{TOTAL:.3f},afade=t=out:st={TOTAL - 1.2:.3f}:d=1.2,"
      f"volume={0 if a.music == 'none' else a.bed}[mus]",
      "[mus][key]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350:makeup=1[duck]"]
labels = ["[voice]", "[duck]"]
for n, (f, t, g) in enumerate(sfx):
    inp += ["-i", f"audio/sfx-{f}.mp3"]
    ms = max(0, int(t * 1000))
    fc.append(f"[{n + 2}:a]aresample=48000,volume={g},adelay={ms}|{ms}[s{n}]")
    labels.append(f"[s{n}]")
fc.append("".join(labels) + f"amix=inputs={len(labels)}:normalize=0:duration=first,atrim=0:{TOTAL:.3f}[pre]")
fc1 = fc + ["[pre]loudnorm=I=-14:TP=-2.0:LRA=11:print_format=json[out]"]
r = subprocess.run(["ffmpeg", "-hide_banner", "-y", *inp, "-filter_complex", ";".join(fc1), "-map", "[out]", "-f", "null", "-"],
                   capture_output=True, text=True, check=True)
m = json.loads(r.stderr[r.stderr.rindex("{"):r.stderr.rindex("}") + 1])
fc.append("[pre]loudnorm=I=-14:TP=-2.0:LRA=11:measured_I={input_i}:measured_TP={input_tp}:measured_LRA={input_lra}:"
          "measured_thresh={input_thresh}:offset={target_offset}:linear=true[out]".format(**m))
subprocess.run(["ffmpeg", "-v", "error", "-y", *inp, "-filter_complex", ";".join(fc), "-map", "[out]", "-ar", "48000",
                "-c:a", "pcm_s16le", a.out], check=True)
print(f"ok: {a.out} · voice {a.voice} · music {a.music} · {len(sfx)} sfx")
