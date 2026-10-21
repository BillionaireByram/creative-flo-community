"""AI B-roll for a Genius Cut edit (Kie, 9:16, 1080p, no audio). Promoted from IMG_3795.

    python3 broll_gen.py shots.json                 # every shot in the file
    python3 broll_gen.py shots.json lead_in shift   # just these
    python3 broll_gen.py shots.json --estimate      # credits needed vs balance, nothing generated

shots.json: {"style": " Vertical 9:16 cinematic ... no on-screen text, no logos ...",
             "shots": {"<name>": "prompt", "<name2>": {"prompt": "...", "duration": 6}}}
Clips land next to shots.json as <name>.mp4 (+ results.json). Mount them with scenekit.Kit.broll(sid, name, ...).

Rules (B, 2026-10-03): newest model by default (Seedance 2.5); never fall back to a cheaper model silently. If the
balance can't cover the batch, stop and say how much to top up (kie.ai/billing). A scene longer than its clip
freezes on the last frame, so give long scenes "duration": 6+. QA every clip on a frame sheet (1 s and 4 s):
no gibberish text, no logos, real motion, blue/teal grade; regenerate a bad clip once with a tightened prompt.
"""
import argparse, concurrent.futures as cf, json, os, re, sys
from pathlib import Path

OM = Path(os.environ.get("OPENMONTAGE", Path(__file__).resolve().parents[2] / "openmontage"))
sys.path.insert(0, str(OM))
MODEL = os.environ.get("BROLL_MODEL", "bytedance/seedance-2-5")
CR_PER_S = {"bytedance/seedance-2-5": 198}   # measured 2026-10-03: 790-990 credits per 5 s 1080p (~16 min each)


def credits():
    from tools.kie_client import KieClient
    return float(KieClient().request("GET", "/api/v1/chat/credit")["data"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("shots"); ap.add_argument("only", nargs="*")
    ap.add_argument("--estimate", action="store_true"); ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()
    cfg = json.loads(Path(a.shots).read_text())
    out = Path(a.shots).resolve().parent
    shots = {k: (v if isinstance(v, dict) else {"prompt": v}) for k, v in cfg["shots"].items()}
    if any(not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", name) for name in shots):
        sys.exit("Unsafe B-roll shot name")
    names = a.only or list(shots)
    secs = {n: int(shots[n].get("duration", 5 if "seedance" in MODEL else 8)) for n in names}
    need = sum(secs.values()) * CR_PER_S.get(MODEL, 0)
    have = credits()
    print(f"{len(names)} shots, {sum(secs.values())} s on {MODEL}: ~{need:,.0f} credits needed (upper estimate), balance {have:,.0f}")
    if a.estimate:
        return
    if need and have < need:
        sys.exit(f"Short by ~{need - have:,.0f} credits. Top up at kie.ai/billing, or pick fewer shots. Nothing generated.")
    from tools.video.kie_video import KieVideo

    def run(name):
        r = KieVideo().execute({"prompt": shots[name]["prompt"] + cfg.get("style", ""), "model": MODEL, "quality_mode": "lite",
                                "duration": secs[name], "aspect_ratio": "9:16", "resolution": "1080p", "generate_audio": False,
                                "wait_for_completion": True, "poll_timeout_seconds": 1800, "output_path": str(out / f"{name}.mp4")})
        return name, r.success, (r.data or {}).get("output") or r.error

    res = {}
    with cf.ThreadPoolExecutor(max_workers=a.workers) as ex:
        for name, ok, info in ex.map(run, names):
            res[name] = {"ok": ok, "info": str(info), "model": MODEL, "duration": secs[name]}
            print(name, "OK" if ok else "FAIL", info, flush=True)
    prev = json.loads((out / "results.json").read_text()) if (out / "results.json").exists() else {}
    prev.update(res)
    (out / "results.json").write_text(json.dumps(prev, indent=1))
    print(f"credits left: {credits():,.0f}")


if __name__ == "__main__":
    main()
