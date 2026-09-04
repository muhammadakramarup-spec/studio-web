// Wave 4 accessibility QA — live regions, contrast, reduced motion, 200% zoom reflow, touch targets.
//
// Five independent checks against http://localhost:4174, each in its own fresh browser context.
// Writes one JSON file per section to status/evidence/wave4-a11y/, plus the two zoom screenshots.
//
// Usage: node status/tools/qa-checks.mjs [section...]
//   sections: live-regions contrast reduced-motion zoom touch-targets   (default: all)

import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const EVIDENCE_DIR = path.join(REPO_ROOT, "status", "evidence", "wave4-a11y");
const BASE_URL = "http://localhost:4174";

if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });

const LAUNCH_ARGS = ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"];

async function loadFirstTile(page) {
  await page.waitForSelector(".library-panel__tile", { timeout: 15000 });
  await page.locator(".library-panel__tile").first().click();
  await page.waitForSelector('#viewport-hint[data-state="loaded"]', { state: "attached", timeout: 15000 });
}

async function pollUntil(fn, { timeoutMs, intervalMs }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await fn();
    if (result !== undefined && result !== null && result !== false) return result;
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ==================================================================== 3) live regions

async function checkLiveRegions(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  const page = await context.newPage();
  const out = { attributes: {}, observedText: {} };
  try {
    await page.goto(BASE_URL, { waitUntil: "load", timeout: 45000 });
    await page.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 20000 });

    out.attributes = await page.evaluate(() => {
      function attrs(sel) {
        const el = document.querySelector(sel);
        if (!el) return { present: false };
        return {
          present: true,
          role: el.getAttribute("role"),
          ariaLive: el.getAttribute("aria-live"),
        };
      }
      return {
        "#app-status": attrs("#app-status"),
        "#export-status": attrs("#export-status"),
        "#viewport-hint": attrs("#viewport-hint"),
        "#viewport-error": attrs("#viewport-error"),
      };
    });

    // idle
    out.observedText.idle = await page.locator("#viewport-hint").innerText();

    // loading / loaded — race the "loading" text (it can resolve in well under 100ms for a small
    // library GLB, so this may legitimately be null; recorded either way).
    const loadingTextPromise = pollUntil(
      async () => {
        const state = await page.getAttribute("#viewport-hint", "data-state");
        return state === "loading" ? await page.locator("#viewport-hint").innerText() : null;
      },
      { timeoutMs: 3000, intervalMs: 10 },
    );
    await page.waitForSelector(".library-panel__tile", { timeout: 15000 });
    await page.locator(".library-panel__tile").first().click();
    out.observedText.loading = await loadingTextPromise;
    await page.waitForSelector('#viewport-hint[data-state="loaded"]', { state: "attached", timeout: 15000 });
    out.observedText.loaded_appStatus = await page.locator("#app-status").innerText();

    // saving
    await page.getByRole("button", { name: "+ Light", exact: true }).click();
    const [savingSnapshotP] = [
      pollUntil(
        async () => {
          const t = await page.locator("#app-status").innerText();
          return t.startsWith("Packing") ? t : null;
        },
        { timeoutMs: 3000, intervalMs: 10 },
      ),
    ];
    await page.click("#save-project-btn");
    out.observedText.saving_appStatus = await savingSnapshotP;
    await pollUntil(
      async () => {
        const t = await page.locator("#app-status").innerText();
        return t.startsWith("Project saved") ? t : null;
      },
      { timeoutMs: 20000, intervalMs: 100 },
    );
    out.observedText.saved_appStatus = await page.locator("#app-status").innerText();

    // exporting progress (both regions — double-announcement check) + completion
    const exportingP = pollUntil(
      async () => {
        const t = await page.locator("#export-status").innerText();
        return /Exporting \d+%/.test(t) ? { exportStatus: t, appStatus: await page.locator("#app-status").innerText() } : null;
      },
      { timeoutMs: 10000, intervalMs: 20 },
    );
    await page.getByRole("button", { name: "Turntable", exact: true }).click();
    out.observedText.exporting = await exportingP;
    await pollUntil(
      async () => {
        const t = await page.locator("#export-status").innerText();
        return /^Turntable ready/.test(t) ? t : null;
      },
      { timeoutMs: 30000, intervalMs: 100 },
    );
    out.observedText.completion_exportStatus = await page.locator("#export-status").innerText();
    out.observedText.completion_appStatus = await page.locator("#app-status").innerText();

    // error (recoverable)
    const { mkdtempSync, writeFileSync: wf } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const badFile = path.join(mkdtempSync(path.join(tmpdir(), "qa-badfile-")), "not-a-model.txt");
    wf(badFile, "hello");
    await page.setInputFiles("#model-file-input", badFile);
    await page.locator("#viewport-error").waitFor({ state: "visible", timeout: 10000 });
    out.observedText.error_viewportError = await page.locator("#viewport-error").innerText();
    out.observedText.error_appStatus = await page.locator("#app-status").innerText();

    // restore prompt
    await page.waitForTimeout(2500); // autosave debounce settle
    await page.reload({ waitUntil: "load", timeout: 45000 });
    await page.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 20000 });
    const restoreVisible = await page
      .waitForSelector(".restore-prompt", { state: "visible", timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    if (restoreVisible) {
      out.observedText.restorePrompt_hint = await page.locator("#viewport-hint").innerText();
      out.observedText.restorePrompt_appStatus = await page.locator("#app-status").innerText();
    } else {
      out.observedText.restorePrompt_hint = "NOT OBSERVED (no autosave record found after reload)";
    }

    // context-lost (reload fresh, load a model, lose the context)
    await page.reload({ waitUntil: "load", timeout: 45000 });
    await page.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 20000 });
    await loadFirstTile(page);
    await page.evaluate(() => {
      const studio = window.__studio;
      const gl = studio.renderer.getContext();
      gl.getExtension("WEBGL_lose_context").loseContext();
    });
    await page.locator("#viewport-error").waitFor({ state: "visible", timeout: 10000 });
    out.observedText.contextLost_viewportError = await page.locator("#viewport-error").innerText();
    out.observedText.contextLost_appStatus = await page.locator("#app-status").innerText();
  } finally {
    await context.close();
  }
  return out;
}

// ==================================================================== 4) contrast

function relLuminance({ r, g, b }) {
  const chan = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrastRatio(a, b) {
  const la = relLuminance(a) + 0.05;
  const lb = relLuminance(b) + 0.05;
  return la > lb ? la / lb : lb / la;
}

async function checkContrast(browser) {
  const context = await browser.newContext({ viewport: { width: 1536, height: 864 }, acceptDownloads: true });
  const page = await context.newPage();
  const out = [];
  try {
    await page.goto(BASE_URL, { waitUntil: "load", timeout: 45000 });
    await page.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 20000 });
    await loadFirstTile(page);
    await page.getByRole("button", { name: "+ Light", exact: true }).click();
    // Select a mesh so the material panel populates (for "material labels").
    await page.locator(".outliner-row").filter({ hasText: "Mesh" }).first().click().catch(() => {});
    // Trigger the error region so it has real text to sample.
    const { mkdtempSync, writeFileSync: wf } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    // Do the error probe in a SEPARATE tab so it doesn't disturb the loaded/edited state used by
    // the other 11 samples in this same page.
    const errPage = await context.newPage();
    await errPage.goto(BASE_URL, { waitUntil: "load", timeout: 45000 });
    await errPage.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 20000 });
    const badFile = path.join(mkdtempSync(path.join(tmpdir(), "qa-contrast-badfile-")), "not-a-model.txt");
    wf(badFile, "hello");
    await errPage.setInputFiles("#model-file-input", badFile);
    await errPage.locator("#viewport-error").waitFor({ state: "visible", timeout: 10000 });

    const errorSample = await errPage.evaluate(() => window.__contrastSampleErrorRegion?.() ?? null);
    void errorSample;

    const samples = await page.evaluate(async () => {
      function parseColor(str) {
        if (!str || str === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
        const m = str.match(/rgba?\(([^)]+)\)/);
        if (!m) return { r: 0, g: 0, b: 0, a: 0 };
        const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
        return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
      }
      function compositeOver(fg, bg) {
        const a = fg.a;
        return {
          r: fg.r * a + bg.r * (1 - a),
          g: fg.g * a + bg.g * (1 - a),
          b: fg.b * a + bg.b * (1 - a),
          a: 1,
        };
      }
      function effectiveBackground(el) {
        const chain = [];
        let node = el;
        while (node) {
          const cs = getComputedStyle(node);
          const c = parseColor(cs.backgroundColor);
          if (c.a > 0) chain.push(c);
          node = node.parentElement;
        }
        // chain[0] is the element's own bg (closest), last is furthest ancestor. Composite from
        // furthest to closest so the closest (topmost) layer wins where opaque.
        let result = { r: 255, g: 255, b: 255, a: 1 }; // fallback: white canvas
        for (let i = chain.length - 1; i >= 0; i--) {
          result = compositeOver(chain[i], result);
        }
        return result;
      }
      function sample(label, selector, opts = {}) {
        const el = opts.pick ? opts.pick(document.querySelectorAll(selector)) : document.querySelector(selector);
        if (!el) return { label, selector, present: false };
        const cs = getComputedStyle(el);
        const fg = parseColor(cs.color);
        const bg = effectiveBackground(el.parentElement ?? el);
        const fontSizePx = parseFloat(cs.fontSize);
        const fontWeight = parseInt(cs.fontWeight, 10) || 400;
        return {
          label,
          selector,
          present: true,
          text: (el.innerText || el.textContent || "").trim().slice(0, 60),
          color: cs.color,
          effectiveBackground: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
          fontSizePx,
          fontWeight,
          fg,
          bg,
        };
      }
      const results = [];
      results.push(sample("App status", "#app-status"));
      results.push(sample("Toolbar button (Undo)", "#toolbar .tb-group button", { pick: (l) => l[0] }));
      results.push(sample("Export note", ".export-note"));
      results.push(sample("Library tile label", ".library-panel__label", { pick: (l) => l[0] }));
      results.push(sample("Library licence badge", ".library-panel__licence-badge", { pick: (l) => l[0] }));
      results.push(sample("Panel title", "#outliner-title"));
      results.push(sample("Timeline control label", "#panel-timeline .field-btn", { pick: (l) => l[1] }));
      results.push(sample("Material row label", ".row label", { pick: (l) => l[0] }));
      results.push(sample("Outliner row text", ".outliner-row span", { pick: (l) => l[0] }));
      return results;
    });
    out.push(...samples);

    // "Viewport hint text" and "Restore prompt text" need their own tabs: once a model is loaded
    // (the state every other sample above needs), setHint("loaded") hides #viewport-hint WITHOUT
    // restoring its idle-state <span> markup (it was overwritten with plain "Loading model…" text
    // by the intermediate "loading" state — see src/app/main.ts setHint()), so neither selector
    // exists in the loaded page's DOM.
    const hintPage = await context.newPage();
    await hintPage.goto(BASE_URL, { waitUntil: "load", timeout: 45000 });
    await hintPage.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 20000 });
    const hintRow = await hintPage.evaluate(() => {
      function parseColor(str) {
        const m = str.match(/rgba?\(([^)]+)\)/);
        const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
        return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
      }
      function compositeOver(fg, bg) {
        const a = fg.a;
        return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
      }
      function effectiveBackground(el) {
        const chain = [];
        let node = el;
        while (node) {
          const cs = getComputedStyle(node);
          const c = parseColor(cs.backgroundColor === "" ? "rgba(0,0,0,0)" : cs.backgroundColor);
          if (c.a > 0) chain.push(c);
          node = node.parentElement;
        }
        let result = { r: 255, g: 255, b: 255, a: 1 };
        for (let i = chain.length - 1; i >= 0; i--) result = compositeOver(chain[i], result);
        return result;
      }
      const el = document.querySelector(".viewport-hint span");
      const cs = getComputedStyle(el);
      const fg = parseColor(cs.color);
      const bg = effectiveBackground(el.parentElement);
      return {
        label: "Viewport hint text",
        selector: ".viewport-hint span",
        present: true,
        text: (el.innerText || "").trim().slice(0, 60),
        color: cs.color,
        effectiveBackground: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
        fontSizePx: parseFloat(cs.fontSize),
        fontWeight: parseInt(cs.fontWeight, 10) || 400,
        fg,
        bg,
      };
    });
    out.push(hintRow);
    await hintPage.close();

    const restorePage = await context.newPage();
    await restorePage.goto(BASE_URL, { waitUntil: "load", timeout: 45000 });
    await restorePage.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 20000 });
    await loadFirstTile(restorePage);
    await restorePage.getByRole("button", { name: "+ Light", exact: true }).click();
    await restorePage.waitForTimeout(2500);
    await restorePage.reload({ waitUntil: "load", timeout: 45000 });
    await restorePage.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 20000 });
    const restoreVisible = await restorePage
      .waitForSelector(".restore-prompt", { state: "visible", timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    if (restoreVisible) {
      const restoreRow = await restorePage.evaluate(() => {
        function parseColor(str) {
          const m = str.match(/rgba?\(([^)]+)\)/);
          const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
          return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
        }
        function compositeOver(fg, bg) {
          const a = fg.a;
          return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
        }
        function effectiveBackground(el) {
          const chain = [];
          let node = el;
          while (node) {
            const cs = getComputedStyle(node);
            const c = parseColor(cs.backgroundColor === "" ? "rgba(0,0,0,0)" : cs.backgroundColor);
            if (c.a > 0) chain.push(c);
            node = node.parentElement;
          }
          let result = { r: 255, g: 255, b: 255, a: 1 };
          for (let i = chain.length - 1; i >= 0; i--) result = compositeOver(chain[i], result);
          return result;
        }
        const el = document.querySelector(".restore-prompt span");
        const cs = getComputedStyle(el);
        const fg = parseColor(cs.color);
        const bg = effectiveBackground(el.parentElement);
        return {
          label: "Restore prompt text",
          selector: ".restore-prompt span",
          present: true,
          text: (el.innerText || "").trim().slice(0, 60),
          color: cs.color,
          effectiveBackground: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
          fontSizePx: parseFloat(cs.fontSize),
          fontWeight: parseInt(cs.fontWeight, 10) || 400,
          fg,
          bg,
        };
      });
      out.push(restoreRow);
    } else {
      out.push({ label: "Restore prompt text", selector: ".restore-prompt span", present: false, note: "no autosave record found after reload" });
    }
    await restorePage.close();

    // #viewport-error is sampled from the separate error tab (opaque colours defined directly in
    // CSS: color #ffd5d2 on background #3d2022 — both hard-coded, no compositing needed).
    const errorRow = await errPage.evaluate(() => {
      function parseColor(str) {
        const m = str.match(/rgba?\(([^)]+)\)/);
        const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
        return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
      }
      const el = document.querySelector("#viewport-error");
      const cs = getComputedStyle(el);
      const fg = parseColor(cs.color);
      const bg = parseColor(cs.backgroundColor);
      return {
        label: "Error text",
        selector: "#viewport-error",
        present: true,
        text: (el.innerText || "").trim().slice(0, 60),
        color: cs.color,
        effectiveBackground: cs.backgroundColor,
        fontSizePx: parseFloat(cs.fontSize),
        fontWeight: parseInt(cs.fontWeight, 10) || 400,
        fg,
        bg,
      };
    });
    out.push(errorRow);
    await errPage.close();

    for (const row of out) {
      if (!row.present) continue;
      const ratio = contrastRatio(row.fg, row.bg);
      const largeText = row.fontSizePx >= 24 || (row.fontWeight >= 700 && row.fontSizePx >= 19);
      const threshold = largeText ? 3.0 : 4.5;
      row.contrastRatio = Math.round(ratio * 100) / 100;
      row.threshold = threshold;
      row.largeText = largeText;
      row.passAA = ratio >= threshold;
      delete row.fg;
      delete row.bg;
    }
  } finally {
    await context.close();
  }
  return out;
}

// ==================================================================== 5) reduced motion

async function checkReducedMotion(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.route("**/*", (route) => route.continue()); // no-op, keeps context "active"
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const out = {};
  try {
    await page.goto(BASE_URL, { waitUntil: "load", timeout: 45000 });
    await page.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 20000 });
    await loadFirstTile(page);

    out.matchMediaReducedMotion = await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    // Spin
    await page.getByRole("button", { name: "Spin", exact: true }).click();
    const y0 = await page.evaluate(() => window.__studio.pivot.rotation.y);
    await page.waitForTimeout(500);
    const y1 = await page.evaluate(() => window.__studio.pivot.rotation.y);
    out.spin = { y0, y1, stillSpinningUnderReducedMotion: Math.abs(y1 - y0) > 1e-4 };
    await page.getByRole("button", { name: "Spin", exact: true }).click(); // turn off

    // Timeline Play under reduced motion. NOTE: TimelineHandle.play()'s requestAnimationFrame loop
    // (src/timeline/index.ts scrubTo()) drives the scene directly via
    // adapter.applySampledFrame()/renderNow() — it never touches the #timeline-scrubber <input>'s
    // DOM value (that only updates from the input's own "input" event, i.e. a user drag) and never
    // calls the onChange listeners either. So the scrubber's value is not a valid playing/not
    // playing signal; sample the pivot quaternion driven by the authored turntable clip instead
    // (same signal used for the Spin check above — addTurntableClip's target defaults to "pivot").
    await page.getByRole("button", { name: "Turn 360°", exact: true }).click();
    const q0 = await page.evaluate(() => window.__studio.pivot.quaternion.y);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForTimeout(500);
    const q1 = await page.evaluate(() => window.__studio.pivot.quaternion.y);
    out.timelinePlay = { pivotQuaternionY_beforePlay: q0, pivotQuaternionY_afterPlay500ms: q1, stillPlayingUnderReducedMotion: Math.abs(q1 - q0) > 1e-4 };
    await page.getByRole("button", { name: "Pause", exact: true }).click();
  } finally {
    await context.close();
  }
  return out;
}

// ==================================================================== 6) 200% zoom reflow

async function checkZoomReflow(browser) {
  const cases = [
    { label: "640x360 @ dsf2 (≈200% of 1280x720)", width: 640, height: 360, deviceScaleFactor: 2 },
    { label: "768x432 @ dsf2 (≈200% of 1536x864)", width: 768, height: 432, deviceScaleFactor: 2 },
  ];
  const out = [];
  for (const c of cases) {
    const context = await browser.newContext({
      viewport: { width: c.width, height: c.height },
      deviceScaleFactor: c.deviceScaleFactor,
    });
    const page = await context.newPage();
    const row = { ...c };
    try {
      await page.goto(BASE_URL, { waitUntil: "load", timeout: 45000 });
      await page.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 20000 });
      await loadFirstTile(page);

      row.measurements = await page.evaluate(() => {
        const doc = document.documentElement;
        const noHorizontalScroll = doc.scrollWidth <= window.innerWidth + 1;
        function reachable(sel) {
          const el = document.querySelector(sel);
          if (!el) return { present: false };
          const rect = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return {
            present: true,
            visible: rect.width > 0 && rect.height > 0,
            withinViewportWidth: rect.right <= window.innerWidth + 1 && rect.left >= -1,
            overflowY: cs.overflowY,
          };
        }
        return {
          scrollWidth: doc.scrollWidth,
          innerWidth: window.innerWidth,
          noHorizontalScroll,
          exportGroup: reachable("#toolbar .tb-group:has(#export-status)") ,
          toolbar: reachable("#toolbar"),
          inspectorOutliner: reachable("#panel-outliner"),
          inspectorMaterial: reachable("#panel-material"),
          sidebarRightOverflowY: getComputedStyle(document.querySelector(".sidebar-right")).overflowY,
        };
      });

      const shotPath = path.join(EVIDENCE_DIR, `zoom-${c.width}x${c.height}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
      row.screenshot = path.relative(REPO_ROOT, shotPath);
    } catch (err) {
      row.error = err.message;
    } finally {
      await context.close();
    }
    out.push(row);
  }
  return out;
}

// ==================================================================== 7) touch targets @ 390x844

async function checkTouchTargets(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await context.newPage();
  const out = {};
  try {
    await page.goto(BASE_URL, { waitUntil: "load", timeout: 45000 });
    await page.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 20000 });
    await loadFirstTile(page);
    await page.getByRole("button", { name: "+ Light", exact: true }).click(); // enables Mirror X / Array x5

    const data = await page.evaluate(() => {
      const selectors = ["button", "input", "select", "[role=button]", "[role=gridcell]"];
      const seen = new Set();
      const rows = [];
      for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
          if (seen.has(el)) continue;
          seen.add(el);
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue; // hidden/detached, not a real target
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;
          const name =
            el.getAttribute("aria-label") ||
            (el.innerText || el.textContent || "").trim().slice(0, 40) ||
            el.id ||
            el.tagName;
          rows.push({
            tag: el.tagName,
            type: el.getAttribute("type") || "",
            id: el.id || "",
            name,
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100,
            fails44: rect.width < 44 || rect.height < 44,
          });
        }
      }
      return rows;
    });

    out.total = data.length;
    out.failures = data.filter((r) => r.fails44);
    out.failureCount = out.failures.length;
    out.allRows = data;
  } finally {
    await context.close();
  }
  return out;
}

// ==================================================================== main

async function main() {
  const requested = process.argv.slice(2);
  const all = ["live-regions", "contrast", "reduced-motion", "zoom", "touch-targets"];
  const sections = requested.length ? requested : all;

  const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
  try {
    if (sections.includes("live-regions")) {
      console.log("=== live-regions ===");
      const result = await checkLiveRegions(browser);
      writeFileSync(path.join(EVIDENCE_DIR, "live-regions.json"), JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
    }
    if (sections.includes("contrast")) {
      console.log("\n=== contrast ===");
      const result = await checkContrast(browser);
      writeFileSync(path.join(EVIDENCE_DIR, "contrast.json"), JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
    }
    if (sections.includes("reduced-motion")) {
      console.log("\n=== reduced-motion ===");
      const result = await checkReducedMotion(browser);
      writeFileSync(path.join(EVIDENCE_DIR, "reduced-motion.json"), JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
    }
    if (sections.includes("zoom")) {
      console.log("\n=== zoom ===");
      const result = await checkZoomReflow(browser);
      writeFileSync(path.join(EVIDENCE_DIR, "zoom-reflow.json"), JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
    }
    if (sections.includes("touch-targets")) {
      console.log("\n=== touch-targets ===");
      const result = await checkTouchTargets(browser);
      writeFileSync(path.join(EVIDENCE_DIR, "touch-targets.json"), JSON.stringify(result, null, 2));
      console.log(`total=${result.total} failures=${result.failureCount}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exitCode = 1;
});
