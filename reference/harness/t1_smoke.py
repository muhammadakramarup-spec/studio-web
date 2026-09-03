import sys, time, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Browser
from vlib import *

b = Browser(SP + r"\profile", SP + r"\dl")
r = Report("T1 smoke + Draco")
try:
    b.goto(VIEWER, wait=2)
    b.wait_for("window.__studio", timeout=45, desc="studio boot")
    st = b.js("return window.__studio.state();")
    print("boot state:", st, flush=True)
    r.add("alpha + preserveDrawingBuffer",
          f"alpha={st['alpha']} preserveDrawingBuffer={st['preserve']}",
          st["alpha"] is True and st["preserve"] is True)

    empty = snap(b)

    # --- Draco GLB via the real file input -------------------------------
    glb = os.path.join(MESHES, "coffee-table-10.glb")
    t0 = time.time()
    b.upload("#file", [glb])
    ok = False
    try:
        b.wait_for("window.__studio.ready()", timeout=90, desc="draco model")
        ok = True
    except TimeoutError:
        pass
    dt = time.time() - t0
    st = b.js("return window.__studio.state();")
    r.add("Draco GLB loads (coffee-table-10)",
          f"{dt:.1f}s  tris={st['tris']}  mats={st['mats']}  raw={st['raw']}",
          ok and st["tris"] > 0)

    b.js("window.__studio.setSpin(false); window.__studio.setAngle(0);")
    time.sleep(0.5)
    loaded = snap(b)
    r.changed("model actually renders", diff(empty, loaded), 5)

    errs = errors(b)
    r.add("no console errors", f"{len(errs)} error/warning lines" + (f" -> {errs[:3]}" if errs else ""),
          len([e for e in errs if e[0] in ("error", "exception")]) == 0)
    b.shot(SP + r"\out\t1_draco.png")
finally:
    ok = r.done()
    b.close()
sys.exit(0 if ok else 1)
