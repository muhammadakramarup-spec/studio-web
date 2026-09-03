"""Shared verification helpers: pixel diffing against the live canvas."""
import base64, io, os, sys
import numpy as np
from PIL import Image

SP = os.path.dirname(os.path.abspath(__file__))
VIEWER = "file:///" + os.path.join(os.path.dirname(SP), "lamp360viewer.html").replace("\\", "/")
MESHES = r"C:\3D-Studio\02_projects\furnishow-360\meshes"
NOISE = "Tracking Prevention"          # Edge-only warning about CDN storage access

def snap(b, px=160):
    """Grab the live canvas as an RGBA numpy array."""
    b.js("window.__studio.renderOnce();")
    d = b.js(f"return window.__studio.snap({px});")
    im = Image.open(io.BytesIO(base64.b64decode(d))).convert("RGBA")
    return np.asarray(im).astype(np.int16)

def diff(a, c):
    """Mean absolute per-channel delta and the share of pixels that moved."""
    d = np.abs(a.astype(np.int32) - c.astype(np.int32))
    return dict(mean=round(float(d[..., :3].mean()), 3),
                max=int(d[..., :3].max()),
                moved=round(float((d[..., :3].max(axis=2) > 2).mean() * 100), 2),
                alpha_mean=round(float(np.abs(a[..., 3] - c[..., 3]).mean()), 3))

def errors(b, since=0):
    return [(l, t) for l, t in b.console(since) if NOISE not in t]

class Report:
    def __init__(self, title):
        self.title = title; self.rows = []; self.fails = 0
    def add(self, name, detail, ok):
        self.rows.append((name, detail, ok))
        if not ok: self.fails += 1
        print(("  PASS  " if ok else "  FAIL  ") + name.ljust(34) + detail, flush=True)
    def changed(self, name, d, floor_pct=0.5):
        ok = d["moved"] >= floor_pct
        self.add(name, f"mean dE={d['mean']:<7} max={d['max']:<4} pixels moved={d['moved']}%", ok)
        return ok
    def same(self, name, d, ceil_mean=0.6):
        ok = d["mean"] <= ceil_mean
        self.add(name, f"mean dE={d['mean']:<7} max={d['max']:<4} pixels moved={d['moved']}%", ok)
        return ok
    def done(self):
        print(f"\n=== {self.title}: {len(self.rows)-self.fails}/{len(self.rows)} passed ===", flush=True)
        return self.fails == 0
