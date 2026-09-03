import sys, time, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Browser
from vlib import *
LAMP = r"C:\Users\muazz\Downloads\Meshy_AI_Tripod_Table_Lamp_0902152557_texture.glb"
b = Browser(SP + r"\profile", SP + r"\dl")
r = Report("T6 lamp module on a real lamp")
try:
    b.goto(VIEWER, wait=1); b.js("localStorage.clear();")
    b.goto(VIEWER, wait=2); b.wait_for("window.__studio", timeout=45)
    t0 = time.time(); b.upload("#file", [LAMP])
    b.wait_for("window.__studio.ready()", timeout=400, desc="108 MB lamp")
    st = b.js("return window.__studio.state();")
    r.add("108 MB Meshy lamp loads", f"{time.time()-t0:.1f}s tris={st['tris']} mats={st['mats']} raw={st['raw']}",
          st["tris"] > 0)
    b.js("window.__studio.setSpin(false); window.__studio.setAngle(30);"); time.sleep(0.6)
    off = snap(b); b.shot(SP + r"\out\lamp_off.png")
    r.add("lamp module off by default", f"lampMod={st['lampMod']}", st["lampMod"] is False)
    b.js("document.getElementById('bLampMod').click();"); time.sleep(0.6)
    on = snap(b); b.shot(SP + r"\out\lamp_on.png")
    r.changed("lamp module lights the lamp", diff(off, on), 2)
    b.js("""var e=document.getElementById('glow'); e.value=100;
            e.dispatchEvent(new Event('input',{bubbles:true}));""")
    time.sleep(0.4); hot = snap(b)
    r.changed("bulb strength slider", diff(on, hot))
    b.js("""var e=document.getElementById('warm'); e.value=0;
            e.dispatchEvent(new Event('input',{bubbles:true}));""")
    time.sleep(0.4); cool = snap(b)
    b.js("""var e=document.getElementById('warm'); e.value=100;
            e.dispatchEvent(new Event('input',{bubbles:true}));""")
    time.sleep(0.4); hotc = snap(b)
    r.changed("bulb warmth slider, full range", diff(cool, hotc))
    b.js("""var w=document.getElementById('warm'); w.value=62; w.dispatchEvent(new Event('input',{bubbles:true}));
            var g=document.getElementById('glow'); g.value=55; g.dispatchEvent(new Event('input',{bubbles:true}));""")
    b.js("document.getElementById('bLampMod').click();"); time.sleep(0.6)
    back = snap(b)
    r.same("disabling the module fully reverts it", diff(off, back))
    errs = [e for e in errors(b) if e[0] in ("error", "exception")]
    r.add("no console errors", f"{len(errs)} errors" + (f" -> {errs[:2]}" if errs else ""), not errs)
finally:
    ok = r.done(); b.close()
sys.exit(0 if ok else 1)
