import sys, time, os, base64, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Browser
from vlib import *
from PIL import Image
import numpy as np

MODEL = r"C:\Users\muazz\Downloads\chair.glb"
b = Browser(SP + r"\profile", SP + r"\dl")
r = Report("T5 alpha:true does not change the opaque render")
shots = {}
try:
    for tag, f in [("alpha:false", "probe_alpha_false.html"), ("alpha:true", "probe_alpha_true.html")]:
        b.goto("file:///" + (SP + "\orig\\" + f).replace("\\", "/"), wait=2)
        b.wait_for("window.__orig", timeout=45)
        b.upload("#file", [MODEL])
        b.wait_for("window.__orig.ready()", timeout=120)
        time.sleep(1.0)
        b.js("window.__orig.freeze();")
        d = b.js("return window.__orig.snap(200);")
        shots[tag] = np.asarray(Image.open(io.BytesIO(base64.b64decode(d))).convert("RGBA")).astype(np.int16)
        print(f"  captured {tag}", flush=True)
    d = diff(shots["alpha:false"], shots["alpha:true"])
    r.same("original file, alpha flag flipped only", d)
    r.add("opaque render is bit-identical",
          f"max channel delta={d['max']}, alpha delta={d['alpha_mean']}",
          d["max"] == 0 and d["alpha_mean"] == 0)
finally:
    ok = r.done(); b.close()
sys.exit(0 if ok else 1)
