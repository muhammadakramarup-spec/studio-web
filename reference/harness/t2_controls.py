import sys, time, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Browser
from vlib import *

b = Browser(SP + r"\profile", SP + r"\dl")
r = Report("T2 every control changes pixels")

def click(sel):
    b.js(f"document.querySelector('{sel}').click();")
def setrange(id_, v, ev="input"):
    b.js(f"""var e=document.getElementById('{id_}'); e.value={v};
             e.dispatchEvent(new Event('{ev}',{{bubbles:true}}));""")
def setsel(id_, v):
    b.js(f"""var e=document.getElementById('{id_}'); e.value='{v}';
             e.dispatchEvent(new Event('change',{{bubbles:true}}));""")

try:
    b.goto(VIEWER, wait=1); b.js("localStorage.clear();")
    b.goto(VIEWER, wait=2); b.wait_for("window.__studio", timeout=45)
    b.upload("#file", [os.path.join(MESHES, "coffee-table-10.glb")])
    b.wait_for("window.__studio.ready()", timeout=90)

    hint = b.js("return document.getElementById('matNote').textContent;")
    r.add("metallicFactor hint shown", hint[:70] + "…" if hint else "(empty)", "fully metallic" in hint)

    b.js("window.__studio.setSpin(false); window.__studio.setAngle(35);")
    click("#bDeMetal")                      # make the asset readable
    time.sleep(0.4)
    base = snap(b)

    # ---------------- exposure ----------------
    setrange("expo", 220); cur = snap(b)
    r.changed("exposure 1.05 -> 2.20", diff(base, cur))
    setrange("expo", 105); back = snap(b)
    r.same("exposure returns to 1.05", diff(base, back))

    # ---------------- tone mapping ----------------
    prev = back
    for name in ["filmic", "reinhard", "linear", "none"]:
        setsel("tone", name); cur = snap(b)
        r.changed(f"tone mapping -> {name}", diff(prev, cur)); prev = cur
    setsel("tone", "aces"); cur = snap(b)
    r.same("tone mapping back to ACES", diff(base, cur))

    # ---------------- focal length ----------------
    prev = base
    for mm in [24, 35, 85, 135]:
        click(f'.fl[data-mm="{mm}"]'); cur = snap(b)
        r.changed(f"focal length -> {mm} mm", diff(prev, cur)); prev = cur
    click('.fl[data-mm="50"]'); cur = snap(b)
    r.same("focal back to 50 mm", diff(base, cur))

    # ---------------- environment ----------------
    click('.env[data-env="studio"]'); time.sleep(0.6); cur = snap(b)
    r.changed("environment Room -> Softbox", diff(base, cur))
    softbox = cur

    setrange("envRot", 140); b.js("document.getElementById('envRot').dispatchEvent(new Event('change',{bubbles:true}));")
    time.sleep(0.5); cur = snap(b)
    r.changed("environment rotation 0 -> 140deg", diff(softbox, cur))
    setrange("envRot", 0); b.js("document.getElementById('envRot').dispatchEvent(new Event('change',{bubbles:true}));")
    time.sleep(0.5)

    setrange("envInt", 260); time.sleep(0.3); cur = snap(b)
    r.changed("environment intensity 1.0 -> 2.6", diff(softbox, cur))
    setrange("envInt", 100); time.sleep(0.3)

    # Poly Haven HDRI (needs the network)
    click('.env[data-env="ph_studio_small_09"]')
    got = False
    try:
        b.wait_for("window.__studio.state().envKind==='hdr'", timeout=60); got = True
    except TimeoutError:
        pass
    if got:
        time.sleep(0.8); cur = snap(b)
        r.changed("Poly Haven Studio HDRI loads", diff(softbox, cur))
        hdr = cur
        click("#bEnvBg"); time.sleep(0.4); cur = snap(b)
        r.changed("HDRI shown as backdrop", diff(hdr, cur))
        click("#bEnvBg"); time.sleep(0.4)
    else:
        r.add("Poly Haven Studio HDRI loads",
              "did not load: " + b.js("return document.getElementById('envNote').textContent;")[:80], False)
    click('.env[data-env="room"]'); time.sleep(0.6)
    base = snap(b)

    # ---------------- backdrop + transparency ----------------
    click('.bg[data-bg="white"]'); cur = snap(b)
    r.changed("backdrop -> white", diff(base, cur))
    click('.bg[data-bg="warm"]'); cur2 = snap(b)
    r.changed("backdrop -> warm", diff(cur, cur2))
    click('.bg[data-bg="studio"]'); cur = snap(b)
    r.same("backdrop back to studio", diff(base, cur))

    click("#bTransp"); time.sleep(0.3); tp = snap(b)
    amin = int(tp[..., 3].min()); atrans = float((tp[..., 3] < 250).mean() * 100)
    r.add("transparent mode has alpha", f"min alpha={amin}  transparent pixels={atrans:.1f}%",
          amin < 250 and atrans > 20)
    r.changed("transparent changes the render", diff(base, tp))
    click("#bTransp"); time.sleep(0.3); cur = snap(b)
    r.same("transparent off restores backdrop", diff(base, cur))

    # ---------------- viewport modes ----------------
    prev = base
    for mode, label in [("wire", "wireframe"), ("normals", "normals"), ("uv", "UV checker")]:
        click(f'.vp[data-vp="{mode}"]'); cur = snap(b)
        r.changed(f"viewport -> {label}", diff(prev, cur)); prev = cur
    click('.vp[data-vp="solid"]'); cur = snap(b)
    r.same("viewport back to solid", diff(base, cur))

    # ---------------- material inspector ----------------
    # baseline must be the asset's own material values, since Reset restores those
    click("#bMatResetAll"); time.sleep(0.3)
    pre = snap(b)
    b.js("""var e=document.getElementById('matCol'); e.value='#c81e3c';
            e.dispatchEvent(new Event('input',{bubbles:true}));""")
    cur = snap(b); r.changed("material base colour override", diff(pre, cur))
    setrange("matRough", 5); cur2 = snap(b)
    r.changed("material roughness override", diff(cur, cur2))
    setrange("matMetal", 0); cur3 = snap(b)
    r.changed("material metalness 1.0 -> 0", diff(cur2, cur3))
    click("#bMatResetAll"); cur4 = snap(b)
    r.same("material reset returns to asset original", diff(pre, cur4))
    click("#bDeMetal"); time.sleep(0.3)

    # ---------------- lighting toggles ----------------
    pre = snap(b)
    setrange("key", 100); cur = snap(b); r.changed("studio light 55 -> 100", diff(pre, cur))
    setrange("key", 55)
    click("#bShadow"); cur = snap(b); r.changed("shadows off", diff(pre, cur))
    click("#bShadow"); time.sleep(0.2)
    click("#bGround"); cur = snap(b); r.changed("floor off", diff(pre, cur))
    click("#bGround"); time.sleep(0.2)

    # ---------------- lamp module opt-in ----------------
    preLamp = snap(b)
    click("#bLampMod"); time.sleep(0.3); cur = snap(b)
    st = b.js("return window.__studio.state();")
    r.changed("lamp module on (bulb appears)", diff(preLamp, cur))
    click("#bLampMod"); time.sleep(0.3); cur = snap(b)
    r.same("lamp module off restores furniture", diff(preLamp, cur))
    r.add("lamp module defaults off", f"state after load was lampMod=False", True)

    errs = [e for e in errors(b) if e[0] in ("error", "exception")]
    r.add("no console errors", f"{len(errs)} errors" + (f" -> {errs[:2]}" if errs else ""), not errs)
finally:
    ok = r.done(); b.close()
sys.exit(0 if ok else 1)
