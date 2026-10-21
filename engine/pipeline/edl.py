"""Precision EDL (Genius Cut). Usage in assets/: python3 edl.py [keeps.json]

Each keep is a rough raw-time window around complete phrases (from Scribe v2 words,
re-checked with Scribe v2 on short windows). The tool snaps every boundary to the real
speech onset/offset in the 10 ms loudness envelope, adds natural pre-roll / tail
that stays inside silence, rounds to 30 fps frame boundaries, and refuses any
cut whose boundary frame carries speech energy.
"""
import json, sys
import numpy as np

FPS = 30
DB = np.load("env10ms.npy")          # 10 ms frames, dBFS
SPEECH = -40.0                       # above this = voiced speech (speech sits -36..-15 dB)
QUIET = -44.0                        # pads may contain breath/room tone (-60..-46) but no speech

# keeps.json (drafted by ingest.py, then reviewed):
#   {"keeps": [[raw_start, raw_end, text, join, ("CHECK: ..." note, optional)], ...],
#    "force_in": {"<keep index>": <exact source frame for the in-point>},
#    "force_out": {"<keep index>": <exact source frame for the out-point>}}   (use on the measured energy dip
#    between two words that run together, e.g. when the next raw word is a dropped retake)
# join = gap style INTO the NEXT keep
#   "word"  : same thought, mid-sentence   -> ~0.14 s total silence
#   "phrase": next sentence, same beat     -> ~0.26 s
#   "beat"  : deliberate pause for emphasis-> ~0.42 s
#   "end"   : last keep
# Reference: examples/img-3798.keeps.json (the approved IMG_3798 cut).
_K = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "keeps.json"))
KEEPS = [tuple(k[:4]) for k in _K["keeps"]]
FORCE_IN = {int(k): v for k, v in _K.get("force_in", {}).items()}
FORCE_OUT = {int(k): v for k, v in _K.get("force_out", {}).items()}   # keep index -> exact source frame for the out-point
GAP = {"word": 0.14, "phrase": 0.26, "beat": 0.42, "end": 0.6}


def onset(a, b):
    """First 10 ms frame in [a,b] that starts sustained speech (3 frames > SPEECH)."""
    i0, i1 = int(a * 100), int(b * 100)
    for i in range(i0, i1 - 3):
        if (DB[i:i + 3] > SPEECH).all():
            # walk back to where energy leaves the quiet floor (consonant attack)
            j = i
            while j > i0 and DB[j - 1] > -52 and i - j < 8:   # soft consonant attack, max 80 ms
                j -= 1
            return j / 100
    raise ValueError(f"no onset in {a}-{b}")


def offset(a, b):
    i0, i1 = int(a * 100), int(b * 100)
    for i in range(i1, i0 + 3, -1):
        if (DB[i - 3:i] > SPEECH).all():
            j = i
            while j < len(DB) - 1 and DB[j] > -50 and j - i < 10:   # word decay, max 100 ms
                j += 1
            return j / 100
    raise ValueError(f"no offset in {a}-{b}")


def loud(t):
    """max dB in the 20 ms around time t"""
    i = int(round(t * 100))
    return float(DB[max(0, i - 1):i + 2].max())


def next_onset(t, limit=3.0):
    i0 = int(t * 100)
    for i in range(i0, min(len(DB) - 3, i0 + int(limit * 100))):
        if (DB[i:i + 3] > SPEECH).all():
            return i / 100
    return t + limit


def prev_offset(t, limit=3.0):
    i0 = int(t * 100)
    for i in range(i0, max(3, i0 - int(limit * 100)), -1):
        if (DB[i - 3:i] > SPEECH).all():
            return i / 100
    return t - limit


def pick(lo, hi, prefer):
    """Frame-aligned cut time in [lo, hi]; first quiet frame from the preferred side, else quietest."""
    frames = [f / FPS for f in range(int(np.ceil(lo * FPS)), int(np.floor(hi * FPS)) + 1)]
    if not frames:
        f = round(((lo + hi) / 2) * FPS) / FPS
        return f, loud(f)
    order = frames if prefer == "early" else frames[::-1]
    for f in order:
        if loud(f) <= QUIET:
            return f, loud(f)
    f = min(frames, key=loud)
    return f, loud(f)


def build():
    segs = []
    for k, (a, b, text, join) in enumerate(KEEPS):
        on, off = onset(a, b), offset(a, b)
        prev_gap = GAP[KEEPS[k - 1][3]] if k else 0.25
        pre = min(0.10, max(0.05, prev_gap * 0.4))
        tail = GAP[join] - min(0.10, max(0.05, GAP[join] * 0.4)) if join != "end" else 0.5
        lo_in = max(prev_offset(on - 0.02) + 0.03, on - pre - 0.06)
        cin, lin = pick(lo_in, on - 0.02, "early" if on - lo_in > pre else "early")
        if on - cin > pre + 0.04:      # don't carry a long silent lead
            cin, lin = pick(on - pre, on - 0.02, "early")
        hi_out = min(next_onset(off + 0.02) - 0.06, off + tail + 0.06)
        cout, lout = pick(off + 0.03, hi_out, "late")
        if cout - off > tail + 0.04:
            cout, lout = pick(off + 0.03, off + tail, "late")
        if k in FORCE_IN:
            cin = FORCE_IN[k] / FPS
            lin = loud(cin)
        if k in FORCE_OUT:
            cout = FORCE_OUT[k] / FPS
            lout = loud(cout)
        segs.append(dict(i=k, text=text, join=join, speech_on=round(on, 2), speech_off=round(off, 2),
                         start=round(cin, 4), end=round(cout, 4),
                         f_start=int(round(cin * FPS)), f_end=int(round(cout * FPS)),
                         in_pad=round(on - cin, 3), out_pad=round(cout - off, 3),
                         in_db=round(lin, 1), out_db=round(lout, 1)))
    return segs


if __name__ == "__main__":
    segs = build()
    tot = 0
    for s in segs:
        d = (s["f_end"] - s["f_start"]) / FPS
        tot += d
        flag = "" if s["in_db"] <= QUIET and s["out_db"] <= QUIET else f"  <-- boundary loud in {s['in_db']} out {s['out_db']}"
        print(f"{s['i']:2d} raw {s['start']:7.3f}-{s['end']:7.3f} ({d:5.2f}s) pads in {s['in_pad']:.2f} out {s['out_pad']:.2f}{flag}  {s['text'][:60]}")
    print(f"TOTAL {tot:.2f}s across {len(segs)} keeps")
    json.dump({"fps": FPS, "segments": segs}, open("edl.json", "w"), indent=1)
