import sys, time, os, zipfile, io, subprocess, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Browser
from vlib import *
from PIL import Image
import numpy as np

b = Browser(SP + r"\profile", SP + r"\dl")
r = Report("T3 exports")

def setsel(i, v):
    b.js(f"var e=document.getElementById('{i}');e.value='{v}';e.dispatchEvent(new Event('change',{{bubbles:true}}));")

try:
    b.goto(VIEWER, wait=1)
    b.js("localStorage.clear();")
    b.goto(VIEWER, wait=2); b.wait_for("window.__studio", timeout=45)
    b.upload("#file", [os.path.join(MESHES, "coffee-table-10.glb")])
    b.wait_for("window.__studio.ready()", timeout=90)
    b.js("window.__studio.setSpin(false); window.__studio.setAngle(35);")
    b.js("document.getElementById('bDeMetal').click();"); time.sleep(0.4)

    # ---------- 1. opaque PNG at 2048 ----------
    b.clear_downloads(); setsel("expRes", "2048x2048")
    b.js("document.getElementById('bShot').click();")
    f = b.wait_download(90, ".png")
    im = Image.open(f); a = np.asarray(im.convert("RGBA"))
    r.add("Save PNG 2048x2048", f"{os.path.basename(f)}  {im.size[0]}x{im.size[1]}  mode={im.mode}  "
          f"{os.path.getsize(f)//1024} KB", im.size == (2048, 2048))
    r.add("opaque PNG is fully opaque", f"min alpha={a[...,3].min()}", a[..., 3].min() == 255)

    # ---------- 2. transparent PNG ----------
    b.clear_downloads(); setsel("expRes", "1024x1024")
    b.js("document.getElementById('bTransp').click();"); time.sleep(0.4)
    b.js("document.getElementById('bShot').click();")
    f = b.wait_download(90, ".png")
    im = Image.open(f); a = np.asarray(im.convert("RGBA"))
    clear = float((a[..., 3] == 0).mean() * 100); soft = float(((a[..., 3] > 0) & (a[..., 3] < 255)).mean() * 100)
    r.add("transparent PNG 1024x1024", f"{os.path.basename(f)}  {im.size[0]}x{im.size[1]}  mode={im.mode}",
          im.size == (1024, 1024) and im.mode == "RGBA")
    r.add("alpha channel is real",
          f"fully clear={clear:.1f}%  soft (shadow)={soft:.1f}%  min={a[...,3].min()} max={a[...,3].max()}",
          clear > 20 and soft > 0.5 and a[..., 3].max() == 255)
    im.save(SP + r"\out\alpha_1024.png")
    b.js("document.getElementById('bTransp').click();"); time.sleep(0.4)

    # ---------- 3. PNG sequence zip ----------
    b.clear_downloads(); setsel("expRes", "1024x1024"); setsel("expFrames", "24")
    t0 = time.time()
    b.js("document.getElementById('bZip').click();")
    f = b.wait_download(300, ".zip")
    dt = time.time() - t0
    z = zipfile.ZipFile(f); names = sorted(z.namelist())
    sizes = set()
    for n in names:
        sizes.add(Image.open(io.BytesIO(z.read(n))).size)
    r.add("turntable zip: 24 frames",
          f"{os.path.basename(f)}  {len(names)} entries  {os.path.getsize(f)//1024} KB  {dt:.0f}s",
          len(names) == 24)
    r.add("frame naming", f"{names[0]} … {names[-1]}",
          names[0] == "frame_0001.png" and names[-1] == "frame_0024.png")
    r.add("all frames 1024x1024", f"distinct sizes={sizes}", sizes == {(1024, 1024)})
    f1 = np.asarray(Image.open(io.BytesIO(z.read("frame_0001.png"))).convert("RGB")).astype(np.int32)
    f13 = np.asarray(Image.open(io.BytesIO(z.read("frame_0013.png"))).convert("RGB")).astype(np.int32)
    f2 = np.asarray(Image.open(io.BytesIO(z.read("frame_0002.png"))).convert("RGB")).astype(np.int32)
    d13 = float(np.abs(f1 - f13).mean()); d2 = float(np.abs(f1 - f2).mean())
    r.add("frames really rotate", f"frame1 vs frame13 mean dE={d13:.2f}; frame1 vs frame2 mean dE={d2:.2f}",
          d13 > 2 and d2 > 0.2)
    open(SP + r"\out\frame_0001.png", "wb").write(z.read("frame_0001.png"))
    open(SP + r"\out\frame_0013.png", "wb").write(z.read("frame_0013.png"))

    # ---------- 4. WebM ----------
    b.clear_downloads(); setsel("expRes", "1024x1024"); setsel("expFrames", "24"); setsel("expFps", "24")
    t0 = time.time()
    b.js("document.getElementById('bWebm').click();")
    try:
        f = b.wait_download(300, ".webm")
        dt = time.time() - t0
        p = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames",
                            "-show_entries", "stream=nb_read_frames,width,height,duration,codec_name",
                            "-of", "json", f], capture_output=True, text=True)
        info = json.loads(p.stdout)["streams"][0]
        nf = int(info.get("nb_read_frames", 0))
        r.add("WebM export", f"{os.path.basename(f)}  {info['width']}x{info['height']}  "
              f"{info['codec_name']}  {nf} frames  {float(info.get('duration',0)):.2f}s  "
              f"{os.path.getsize(f)//1024} KB  ({dt:.0f}s wall)",
              nf >= 20 and int(info["width"]) == 1024)
    except TimeoutError:
        r.add("WebM export", "no file produced within 300 s", False)

    st = b.js("return window.__studio.state();")
    r.add("viewport restored after export", f"busy={st['busy']} focal={st['focal']}", st["busy"] is False)
    errs = [e for e in errors(b) if e[0] in ("error", "exception")]
    r.add("no console errors", f"{len(errs)} errors" + (f" -> {errs[:2]}" if errs else ""), not errs)
finally:
    ok = r.done(); b.close()
sys.exit(0 if ok else 1)
