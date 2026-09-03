import sys, time, os, zipfile, io, subprocess, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Browser
from vlib import *
from PIL import Image
import numpy as np

b = Browser(SP + r"\profile", SP + r"\dl")
def setsel(i,v): b.js(f"var e=document.getElementById('{i}');e.value='{v}';e.dispatchEvent(new Event('change',{{bubbles:true}}));")
try:
    b.goto(VIEWER, wait=1); b.js("localStorage.clear();")
    b.goto(VIEWER, wait=2); b.wait_for("window.__studio", timeout=45)
    b.upload("#file", [os.path.join(MESHES, "coffee-table-10.glb")])
    b.wait_for("window.__studio.ready()", timeout=90)
    b.js("window.__studio.setSpin(false);window.__studio.setAngle(0);document.getElementById('bDeMetal').click();")
    time.sleep(0.4)
    setsel("expRes","512x512") if False else None
    setsel("expRes","1024x1024"); setsel("expFrames","24"); setsel("expFps","24")

    b.clear_downloads(); b.js("document.getElementById('bZip').click();")
    zf = b.wait_download(300, ".zip")
    z = zipfile.ZipFile(zf)
    ref = [np.asarray(Image.open(io.BytesIO(z.read(f"frame_{i+1:04d}.png"))).convert("RGB")
                      ).astype(np.float32) for i in range(24)]

    b.clear_downloads(); b.js("document.getElementById('bWebm').click();")
    wf = b.wait_download(300, ".webm")
    for f in glob.glob("out/wm_*.png"): os.remove(f)
    subprocess.run(["ffmpeg","-v","error","-i",wf,"-fps_mode","passthrough","out/wm_%03d.png","-y"],
                   capture_output=True)
    got = [np.asarray(Image.open(f).convert("RGB")).astype(np.float32) for f in sorted(glob.glob("out/wm_*.png"))]

    matched = []
    for g in got:
        errs = [float(np.abs(g-r).mean()) for r in ref]
        matched.append(int(np.argmin(errs)))
    present = sorted(set(matched))
    print("webm frames decoded :", len(got))
    print("nearest ref frame per webm frame:", matched)
    print("distinct ref angles present:", len(present), "of 24 ->", present)
    print("MISSING angles:", [i for i in range(24) if i not in present])
finally:
    b.close()
