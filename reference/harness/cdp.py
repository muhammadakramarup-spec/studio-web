"""Minimal Chrome DevTools Protocol harness for driving Edge/Chrome on file:// URLs."""
import json, os, subprocess, time, shutil, glob, threading
import requests, websocket

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PORT = 9333

class Browser:
    def __init__(self, profile, downloads, headless=False, port=PORT):
        self.port = port
        self.profile = profile
        self.downloads = downloads
        os.makedirs(downloads, exist_ok=True)
        subprocess.run(["taskkill", "/F", "/IM", "msedge.exe"],
                       capture_output=True)  # clear stale instances of this profile
        time.sleep(3.0)  # let the profile lock and the debug port actually release
        args = [EDGE,
                f"--remote-debugging-port={port}",
                "--remote-allow-origins=*",
                f"--user-data-dir={profile}",
                "--no-first-run", "--no-default-browser-check",
                "--disable-features=Translate,MediaRouter,msEdgeIdentity,EdgeSyncPromo,ImplicitSignin",
                "--disable-sync", "--no-service-autorun", "--disable-background-networking",
                "--disable-popup-blocking",
                "--allow-file-access-from-files",
                "--autoplay-policy=no-user-gesture-required",
                "--window-size=1280,860",
                "about:blank"]
        if headless:
            args.insert(1, "--headless=new")
            args.insert(2, "--enable-unsafe-swiftshader")
        self.proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.ws = None
        self._id = 0
        self._events = []
        self._connect()

    def _connect(self, timeout=30):
        t0 = time.time()
        while time.time() - t0 < timeout:
            try:
                tabs = requests.get(f"http://127.0.0.1:{self.port}/json/list", timeout=2).json()
                pages = [t for t in tabs if t["type"] == "page"
                         and not t["url"].startswith(("edge://", "chrome://", "devtools://"))]
                if pages:
                    # prefer about:blank / our own page over anything Edge opened
                    pages.sort(key=lambda t: 0 if t["url"] in ("about:blank", "") else 1)
                    self.ws = websocket.create_connection(
                        pages[0]["webSocketDebuggerUrl"], timeout=300,
                        enable_multithread=True, skip_utf8_validation=True)
                    self.target = pages[0]["id"]
                    break
            except Exception as e:
                self._last_connect_err = e
            time.sleep(0.4)
        if not self.ws:
            raise RuntimeError(
                "could not attach to browser (port %d): %r"
                % (self.port, getattr(self, "_last_connect_err", None)))
        self.send("Runtime.enable"); self.send("Page.enable"); self.send("Log.enable")
        self.send("Browser.setDownloadBehavior",
                  {"behavior": "allow", "downloadPath": self.downloads})

    def send(self, method, params=None, timeout=180):
        self._id += 1
        mid = self._id
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        t0 = time.time()
        while time.time() - t0 < timeout:
            raw = self.ws.recv()
            msg = json.loads(raw)
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})
            else:
                self._events.append(msg)
        raise TimeoutError(method)

    def goto(self, url, wait=1.0):
        self.send("Page.navigate", {"url": url})
        try: self.send("Page.bringToFront")   # keep rAF unthrottled during tests
        except Exception: pass
        time.sleep(wait)

    def js(self, expr, timeout=180):
        r = self.send("Runtime.evaluate",
                      {"expression": f"(async()=>{{ {expr} }})()",
                       "awaitPromise": True, "returnByValue": True,
                       "userGesture": True}, timeout=timeout)
        if r.get("exceptionDetails"):
            d = r["exceptionDetails"]
            raise RuntimeError("JS: " + json.dumps(d.get("exception", {}).get("description", d))[:2000])
        return r["result"].get("value")

    def wait_for(self, expr, timeout=180, poll=0.4, desc=""):
        t0 = time.time()
        while time.time() - t0 < timeout:
            if self.js(f"return !!({expr});"):
                return True
            time.sleep(poll)
        raise TimeoutError(f"wait_for {desc or expr}")

    def upload(self, selector, paths):
        """Set files on an <input type=file> via DOM.setFileInputFiles."""
        doc = self.send("DOM.getDocument", {"depth": 1})
        node = self.send("DOM.querySelector",
                         {"nodeId": doc["root"]["nodeId"], "selector": selector})
        self.send("DOM.setFileInputFiles", {"files": paths, "nodeId": node["nodeId"]})

    def console(self, since=0):
        # drain pending socket messages without blocking
        self.ws.settimeout(0.2)
        try:
            while True:
                self._events.append(json.loads(self.ws.recv()))
        except Exception:
            pass
        self.ws.settimeout(180)
        out = []
        for e in self._events[since:]:
            m = e.get("method")
            if m == "Runtime.consoleAPICalled" and e["params"]["type"] in ("error", "warning"):
                out.append((e["params"]["type"],
                            " ".join(str(a.get("value", a.get("description", "")))
                                     for a in e["params"]["args"])[:400]))
            elif m == "Runtime.exceptionThrown":
                d = e["params"]["exceptionDetails"]
                out.append(("exception", str(d.get("exception", {}).get("description", d.get("text")))[:400]))
            elif m == "Log.entryAdded" and e["params"]["entry"]["level"] in ("error", "warning"):
                out.append((e["params"]["entry"]["level"], e["params"]["entry"]["text"][:400]))
        return out

    def event_mark(self):
        return len(self._events)

    def clear_downloads(self):
        for f in glob.glob(os.path.join(self.downloads, "*")):
            try: os.remove(f)
            except Exception: pass

    def wait_download(self, timeout=180, ext=None):
        t0 = time.time()
        while time.time() - t0 < timeout:
            files = [f for f in glob.glob(os.path.join(self.downloads, "*"))
                     if not f.endswith(".crdownload")]
            if ext: files = [f for f in files if f.lower().endswith(ext)]
            if files:
                time.sleep(0.4)
                return sorted(files, key=os.path.getmtime)[-1]
            time.sleep(0.4)
        raise TimeoutError("download")

    def shot(self, path):
        r = self.send("Page.captureScreenshot", {"format": "png"})
        import base64
        open(path, "wb").write(base64.b64decode(r["data"]))
        return path

    def close(self):
        try: self.ws.close()
        except Exception: pass
        try: self.proc.terminate(); self.proc.wait(timeout=10)
        except Exception:
            try: self.proc.kill()
            except Exception: pass
