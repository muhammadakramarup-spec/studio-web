"""Fold status/events.jsonl into progress.json and render PROGRESS.html. Run every 10 min by the progress clerk.
Agents append one JSON object per line to events.jsonl; nobody edits the HTML by hand."""
import json, os, html, datetime
D = os.path.dirname(os.path.abspath(__file__))
SILOS = ["S1", "S2", "S3", "S4", "S5", "S6"]
NAMES = {"S1": "Viewer core", "S2": "Editor", "S3": "Library", "S4": "Timeline & motion",
         "S5": "Accounts / Pro / ads", "S6": "AI & avatars (stubs)"}

def load():
    p = os.path.join(D, "progress.json")
    if os.path.exists(p):
        return json.load(open(p, encoding="utf-8"))
    return {"wave": "0", "started": "", "silos": {s: {"state": "pending", "last": "", "msg": "", "n": {}} for s in SILOS},
            "decisions": [], "blockers": [], "signups": [], "events": 0}

def fold(pr):
    ev = os.path.join(D, "events.jsonl")
    if not os.path.exists(ev): return pr
    lines = [l for l in open(ev, encoding="utf-8") if l.strip()]
    for l in lines[pr.get("events", 0):]:
        try: e = json.loads(l)
        except Exception: continue
        if e.get("wave"): pr["wave"] = str(e["wave"])
        if e.get("decision"): pr["decisions"].append(f'#{len(pr["decisions"])+1} {e["t"]} {e["decision"]}')
        if e.get("signup"): pr["signups"].append(e["signup"])
        s = e.get("silo")
        if s in pr["silos"]:
            c = pr["silos"][s]; c["state"] = e.get("state", c["state"]); c["last"] = e.get("t", "")
            c["msg"] = e.get("msg", c["msg"]); c["n"].update(e.get("n", {}))
            if e.get("state") == "blocked": pr["blockers"].append(f'{e["t"]} {s} {e.get("msg","")}')
            if e.get("state") in ("building", "qa-pass", "done"):
                pr["blockers"] = [b for b in pr["blockers"] if f" {s} " not in b]
    pr["events"] = len(lines)
    return pr

COLORS = {"pending": "#3a4149", "building": "#c9a227", "qa-fail": "#c94f3d", "qa-pass": "#4caf7d",
          "done": "#4caf7d", "blocked": "#c94f3d", "cut": "#5d646c"}

def render(pr):
    now = datetime.datetime.now().strftime("%H:%M")
    cards = ""
    for s in SILOS:
        c = pr["silos"][s]; col = COLORS.get(c["state"], "#3a4149")
        nums = " · ".join(f"{k} {v}" for k, v in c["n"].items()) or "no numbers yet"
        cards += f"""<div class="card"><div class="hd"><b>{s} {html.escape(NAMES[s])}</b>
        <span class="pill" style="background:{col}">{html.escape(c['state'])}</span></div>
        <div class="msg">{html.escape(c['msg'] or '—')}</div><div class="n">{html.escape(nums)}</div>
        <div class="t">last heartbeat {html.escape(c['last'] or '—')}</div></div>"""
    li = lambda xs, empty: "".join(f"<li>{html.escape(x)}</li>" for x in xs) or f"<li class='dim'>{empty}</li>"
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="60">
<title>Studio build — progress</title><style>
body{{margin:0;background:#0d0f11;color:#e8e6e1;font:14px/1.45 -apple-system,"Segoe UI",Arial,sans-serif;padding:24px}}
h1{{font-size:18px;margin:0 0 4px}} .sub{{color:#8d949c;font-size:12px;margin-bottom:18px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-bottom:22px}}
.card{{background:#16191d;border:1px solid #262b31;border-radius:12px;padding:14px}}
.hd{{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}}
.pill{{color:#0d0f11;font-weight:600;font-size:11px;padding:3px 8px;border-radius:6px}}
.msg{{font-size:13px;margin-bottom:6px}} .n{{color:#c9a227;font-size:12px}} .t{{color:#5d646c;font-size:11px;margin-top:6px}}
h2{{font-size:12px;color:#8d949c;text-transform:uppercase;letter-spacing:.06em;margin:18px 0 6px}}
ul{{margin:0;padding-left:18px}} li{{margin:3px 0;font-size:13px}} .dim{{color:#5d646c}}
</style></head><body>
<h1>Studio build — wave {html.escape(pr['wave'])}</h1>
<div class="sub">rendered {now} · {pr['events']} events folded · page refreshes itself every minute</div>
<div class="grid">{cards}</div>
<h2>Decisions</h2><ul>{li(pr['decisions'], 'none yet')}</ul>
<h2>Blockers</h2><ul>{li(pr['blockers'], 'none')}</ul>
<h2>Sign-ups waiting on Akram</h2><ul>{li(pr['signups'], 'none')}</ul>
</body></html>"""
    open(os.path.join(D, "PROGRESS.html"), "w", encoding="utf-8").write(page)

if __name__ == "__main__":
    pr = fold(load())
    json.dump(pr, open(os.path.join(D, "progress.json"), "w", encoding="utf-8"), indent=1)
    render(pr)
    print("rendered PROGRESS.html:", {s: pr["silos"][s]["state"] for s in SILOS})
