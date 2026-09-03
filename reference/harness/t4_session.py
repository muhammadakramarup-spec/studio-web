import sys, time, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Browser
from vlib import *

EXR = r"C:\3D-Studio\sketchfab\Blender addon\MESH OBJECTS\11.environments\braustuble_alley_4k.exr"
LAMP = r"C:\Users\muazz\Downloads\Meshy_AI_Tripod_Table_Lamp_0902152557_texture.glb"
BIG  = os.path.join(MESHES, "coffee-table-17.glb")

b = Browser(SP + r"\profile", SP + r"\dl")
r = Report("T4 session: models, HDRI, shortcuts, persistence")
def click(s_): b.js(f"document.querySelector('{s_}').click();")
try:
    b.goto(VIEWER, wait=1); b.js("localStorage.clear();")
    b.goto(VIEWER, wait=2); b.wait_for("window.__studio", timeout=45)

    r.add("running from file://", b.js("return location.protocol;"),
          b.js("return location.protocol;") == "file:")
    net = b.js("""return performance.getEntriesByType('resource')
                   .filter(function(e){return /lamp\.glb/.test(e.name)}).length;""")
    r.add("no lamp.glb fetch on file://", f"{net} requests for lamp.glb", net == 0)

    # ---- multi-model: two Draco GLBs at once ----
    b.upload("#file", [os.path.join(MESHES, "coffee-table-10.glb"), os.path.join(MESHES, "credenza-1.glb")
                       if os.path.exists(os.path.join(MESHES, "credenza-1.glb"))
                       else os.path.join(MESHES, "coffee-table-11.glb")])
    b.wait_for("window.__studio.state().models.length>=2", timeout=180, desc="two models")
    st = b.js("return window.__studio.state();")
    r.add("two models loaded at once", f"{st['models']}  active={st['active']}", len(st["models"]) == 2)
    b.js("window.__studio.setSpin(false);")
    a_stats = (st["tris"], st["mats"], st["raw"]["x"])
    snapA = snap(b)
    b.js("""var c=document.querySelectorAll('#chips .chip'); c[0].click();""")
    time.sleep(0.6)
    st2 = b.js("return window.__studio.state();")
    b_stats = (st2["tris"], st2["mats"], st2["raw"]["x"])
    snapB = snap(b)
    r.add("switching models changes stats",
          f"{st['active']} tris={a_stats[0]} -> {st2['active']} tris={b_stats[0]}", a_stats != b_stats)
    r.changed("switching models changes render", diff(snapA, snapB), 3)

    # ---- big Draco GLB ----
    t0 = time.time(); b.upload("#file", [BIG])
    okbig = False
    try:
        b.wait_for("window.__studio.state().models.length>=3", timeout=240); okbig = True
    except TimeoutError: pass
    st3 = b.js("return window.__studio.state();")
    r.add("27 MB Draco GLB loads", f"{time.time()-t0:.1f}s  tris={st3['tris']}  mats={st3['mats']}",
          okbig and st3["tris"] > 0)

    # ---- local EXR environment ----
    b.js("window.__studio.setSpin(false); window.__studio.setAngle(20);")
    click("#bDeMetal"); time.sleep(0.4)
    pre = snap(b)
    t0 = time.time(); b.upload("#file", [EXR])
    okexr = False
    try:
        b.wait_for("window.__studio.state().envKind==='hdr'", timeout=180); okexr = True
    except TimeoutError: pass
    time.sleep(1.0)
    if okexr:
        cur = snap(b)
        r.add("4k EXR from disk loads", f"{time.time()-t0:.1f}s  env={b.js('return window.__studio.state().env;')}", True)
        r.changed("EXR changes the lighting", diff(pre, cur))
    else:
        r.add("4k EXR from disk loads",
              b.js("return document.getElementById('envNote').textContent;")[:90], False)

    # ---- keyboard shortcuts ----
    b.js("document.body.focus();")
    before = b.js("return window.__studio.state().spin;")
    b.send("Input.dispatchKeyEvent", {"type": "keyDown", "key": " ", "code": "Space", "windowsVirtualKeyCode": 32})
    b.send("Input.dispatchKeyEvent", {"type": "keyUp", "key": " ", "code": "Space", "windowsVirtualKeyCode": 32})
    time.sleep(0.2)
    r.add("Space toggles spin", f"{before} -> {b.js('return window.__studio.state().spin;')}",
          b.js("return window.__studio.state().spin;") != before)
    for key, code, vk, field, want in [("z", "KeyZ", 90, "vp", "wire"), ("t", "KeyT", 84, "transp", True)]:
        b.send("Input.dispatchKeyEvent", {"type": "keyDown", "key": key, "code": code, "windowsVirtualKeyCode": vk})
        b.send("Input.dispatchKeyEvent", {"type": "keyUp", "key": key, "code": code, "windowsVirtualKeyCode": vk})
        time.sleep(0.25)
        got = b.js("return window.__studio.state();")[field]
        r.add(f"'{key}' shortcut -> {field}={want}", f"got {field}={got}", got == want)
    # put it back
    b.send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "t", "code": "KeyT", "windowsVirtualKeyCode": 84})
    b.send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "t", "code": "KeyT", "windowsVirtualKeyCode": 84})

    # ---- persistence across reload ----
    b.js("""var e=document.getElementById('expo'); e.value=175; e.dispatchEvent(new Event('input',{bubbles:true}));
            document.querySelector('.fl[data-mm="85"]').click();
            var t=document.getElementById('tone'); t.value='reinhard'; t.dispatchEvent(new Event('change',{bubbles:true}));
            document.querySelector('.env[data-env="studio"]').click();""")
    time.sleep(1.2)
    saved = b.js("return localStorage.getItem('pstudio.v1');")
    b.goto(VIEWER, wait=2); b.wait_for("window.__studio", timeout=45)
    st = b.js("return window.__studio.state();")
    r.add("settings persist across reload",
          f"expo={st['expo']:.2f} focal={st['focal']} tone={st['tone']} env={st['envKind']}",
          abs(st["expo"] - 1.75) < 0.01 and st["focal"] == 85 and st["tone"] == "reinhard"
          and st["envKind"] == "studio")
    r.add("localStorage key written", (saved or "")[:60] + "…", bool(saved))
    b.js("document.getElementById('bReset').click();"); time.sleep(1.5)
    b.wait_for("window.__studio", timeout=45)
    st = b.js("return window.__studio.state();")
    r.add("Reset settings restores defaults",
          f"expo={st['expo']:.2f} focal={st['focal']} tone={st['tone']}",
          abs(st["expo"] - 1.05) < 0.01 and st["focal"] == 50 and st["tone"] == "aces")

    errs = [e for e in errors(b) if e[0] in ("error", "exception")]
    r.add("no console errors", f"{len(errs)} errors" + (f" -> {errs[:2]}" if errs else ""), not errs)
finally:
    ok = r.done(); b.close()
sys.exit(0 if ok else 1)
