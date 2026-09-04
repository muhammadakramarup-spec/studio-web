// Wave 4 accessibility QA — keyboard-only journey.
//
// Drives http://localhost:4174 with ONLY page.keyboard (Tab / Shift+Tab / Enter / Arrow keys) —
// no page.click(), no element.click() — from a fresh page at 1280x720, through the primary
// open -> choose asset -> edit -> save -> export -> reload -> restore journey. At each named
// checkpoint ("stop") this records document.activeElement's accessible name, whether a visible
// focus ring exists (computed outline/box-shadow while focused vs the same element blurred), and a
// zoomed screenshot of the focused control.
//
// DOM-order note (read before changing step order): index.html puts #file-actions (Open GLB, Open
// project, Save project) BEFORE #toolbar (Undo..Turntable) BEFORE the library panel (search box,
// tiles) BEFORE the viewport hint (Restore/Discard) BEFORE the right sidebar/timeline. Native Tab
// order follows DOM order and does not wrap within the page, so reaching "Save project" from
// "+ Light" (later in the DOM) requires Shift+Tab (backward), while reaching "Turntable" from
// "Save project" requires Tab (forward). Each step below states its direction and why.
//
// Usage: node status/tools/keyboard-journey.mjs
// Writes status/evidence/wave4-a11y/keyboard-journey.json and
// status/evidence/wave4-a11y/focus-<step>.png (one per checkpoint).

import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const EVIDENCE_DIR = path.join(REPO_ROOT, "status", "evidence", "wave4-a11y");
const OUT_JSON = path.join(EVIDENCE_DIR, "keyboard-journey.json");
const BASE_URL = "http://localhost:4174";

if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });

async function describeActive(page) {
  return await page.evaluate(() => {
    function accessibleName(el) {
      if (!el) return null;
      const aria = el.getAttribute && el.getAttribute("aria-label");
      if (aria) return aria.trim();
      const labelledby = el.getAttribute && el.getAttribute("aria-labelledby");
      if (labelledby) {
        const txt = labelledby
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent || "")
          .join(" ")
          .trim();
        if (txt) return txt;
      }
      if (el.labels && el.labels.length) return Array.from(el.labels).map((l) => l.textContent).join(" ").trim();
      const text = (el.innerText || el.textContent || "").trim();
      if (text) return text;
      if (el.placeholder) return el.placeholder;
      if (el.value) return el.value;
      return "";
    }
    const el = document.activeElement;
    if (!el || el === document.body) return { tag: "BODY", id: "", className: "", name: "", isBody: true };
    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      id: el.id || "",
      className: typeof el.className === "string" ? el.className : "",
      role: el.getAttribute("role") || "",
      type: el.getAttribute("type") || "",
      disabled: !!el.disabled,
      name: accessibleName(el),
      assetId: (el.dataset && el.dataset.assetId) || "",
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      isBody: false,
    };
  });
}

async function focusRingCheck(page) {
  return await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    function snap(e) {
      const cs = getComputedStyle(e);
      return { outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor, boxShadow: cs.boxShadow };
    }
    const focused = snap(el);
    el.blur();
    const unfocused = snap(el);
    el.focus(); // restore focus (programmatic; does not affect the NEXT real keyboard step's :focus-visible)
    return { focused, unfocused };
  });
}

function ringIsVisible(check) {
  if (!check) return false;
  const f = check.focused;
  const hasOutline = f.outlineStyle !== "none" && f.outlineWidth !== "0px";
  const hasShadow = f.boxShadow !== "none";
  const differsFromUnfocused = JSON.stringify(check.focused) !== JSON.stringify(check.unfocused);
  return (hasOutline || hasShadow) && differsFromUnfocused;
}

async function zoomShot(page, rect, filePath, margin = 24) {
  const clip = {
    x: Math.max(0, rect.x - margin),
    y: Math.max(0, rect.y - margin),
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
  await page.screenshot({ path: filePath, clip });
}

// autosave (src/app/persist.ts createAutosaver) debounces 2000ms and, if its capture fires while
// an export has set the viewer "busy" (or before any model is loaded), buildProjectDocument()
// returns null and the debounce is silently consumed with nothing scheduled to replace it until
// the NEXT scene-mutating action calls markDirty() again. To make this journey's "reload -> Restore"
// step deterministic, confirm a real recovery record exists in IndexedDB (written by the "+ Light"
// edit's autosave) BEFORE starting the Save/Turntable steps that could otherwise race it.
async function pollAutosaveRecord(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open("studio-web", 1);
          req.onsuccess = () => {
            const db = req.result;
            try {
              const tx = db.transaction("recovery", "readonly");
              const getReq = tx.objectStore("recovery").get("current");
              getReq.onsuccess = () => resolve(!!getReq.result);
              getReq.onerror = () => resolve(false);
            } catch {
              resolve(false);
            }
          };
          req.onerror = () => resolve(false);
        }),
    );
    if (result) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function tabUntil(page, direction, matchFn, maxSteps, label) {
  const key = direction === "forward" ? "Tab" : "Shift+Tab";
  for (let i = 0; i < maxSteps; i++) {
    await page.keyboard.press(key);
    const info = await describeActive(page);
    if (!info.isBody && matchFn(info)) return info;
  }
  throw new Error(`tabUntil(${label}): no match within ${maxSteps} ${key} presses`);
}

const byName = (expected) => (info) => info.name === expected;
const byClass = (cls) => (info) => info.className.split(/\s+/).includes(cls);

async function runStep(page, results, { step, label, direction, match, maxSteps, activateKey, waitAfter, screenshotName }) {
  const record = { step, label };
  try {
    const info = direction
      ? await tabUntil(page, direction, match, maxSteps, label)
      : await describeActive(page);
    record.direction = direction ?? "n/a (already focused)";
    record.activeElement = { tag: info.tag, id: info.id, name: info.name, role: info.role, disabled: info.disabled };
    const ring = await focusRingCheck(page);
    record.focusRing = ring;
    record.focusRingVisible = ringIsVisible(ring);
    const shotPath = path.join(EVIDENCE_DIR, `focus-${screenshotName}.png`);
    await zoomShot(page, info.rect, shotPath);
    record.screenshot = path.relative(REPO_ROOT, shotPath);

    if (activateKey) {
      if (activateKey === "download") {
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 30000 }),
          page.keyboard.press("Enter"),
        ]);
        record.downloadCaught = { suggestedFilename: download.suggestedFilename() };
      } else {
        await page.keyboard.press(activateKey);
      }
    }
    if (waitAfter) {
      record.postActivateWait = await waitAfter(page);
    }
    record.pass = true;
    record.reason = "reached and verified";
  } catch (err) {
    record.pass = false;
    record.reason = err.message;
  }
  results.push(record);
  console.log(`[${record.pass ? "PASS" : "FAIL"}] ${step}: ${record.reason}`);
  return record;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  const page = await context.newPage();
  const results = [];

  try {
    await page.goto(BASE_URL, { waitUntil: "load", timeout: 45000 });
    await page.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 20000 });
    await page.waitForSelector(".library-panel__tile", { timeout: 15000 });

    // 1) Open GLB — first Tab from a fresh page. Not activated (Enter would open a native OS file
    // picker dialog, which page.keyboard cannot dismiss).
    await runStep(page, results, {
      step: "1-open-glb",
      label: 'Reach "Open GLB" (file-actions, first focusable element)',
      direction: "forward",
      match: (info) => info.id === "open-model-btn" || info.name === "Open GLB",
      maxSteps: 5,
      screenshotName: "1-open-glb",
    });

    // 2) Library search box — forward from Open GLB, through Open project (Save project is
    // disabled pre-load and is skipped by native Tab order) and every disabled toolbar
    // control (Mirror X / Array x5 / all Export buttons are disabled with no model loaded).
    await runStep(page, results, {
      step: "2-library-search",
      label: 'Reach the library search box (aria-label "Search assets")',
      direction: "forward",
      match: (info) => byClass("library-panel__search")(info) || info.name === "Search assets",
      maxSteps: 40,
      screenshotName: "2-library-search",
    });

    // 3) First library tile — forward past the kind/category selects.
    const tileStep = await runStep(page, results, {
      step: "3-first-tile",
      label: "Reach the first library tile (roving tabindex, tabIndex=0)",
      direction: "forward",
      match: (info) => byClass("library-panel__tile")(info),
      maxSteps: 5,
      screenshotName: "3-first-tile",
    });

    // 3b) Arrow-key navigation inside the grid: Right moves to tile 2, Left returns to tile 1.
    const arrowRecord = { step: "3b-arrow-nav" };
    try {
      const before = await describeActive(page);
      await page.keyboard.press("ArrowRight");
      const afterRight = await describeActive(page);
      await page.keyboard.press("ArrowLeft");
      const afterLeft = await describeActive(page);
      arrowRecord.before = before.name;
      arrowRecord.afterArrowRight = afterRight.name;
      arrowRecord.afterArrowLeft = afterLeft.name;
      // Library tiles carry no `id`; identify them by dataset.assetId (set in src/library/index.ts).
      arrowRecord.pass = afterRight.assetId !== before.assetId && afterLeft.assetId === before.assetId;
      arrowRecord.reason = arrowRecord.pass
        ? "ArrowRight moved focus to the next tile, ArrowLeft returned focus to the first tile"
        : `unexpected focus movement (before=${before.assetId || before.name}, right=${afterRight.assetId || afterRight.name}, left=${afterLeft.assetId || afterLeft.name})`;
    } catch (err) {
      arrowRecord.pass = false;
      arrowRecord.reason = err.message;
    }
    results.push(arrowRecord);
    console.log(`[${arrowRecord.pass ? "PASS" : "FAIL"}] 3b-arrow-nav: ${arrowRecord.reason}`);

    // 3c) Activate the first tile (Enter) to load the model.
    const activateTile = { step: "3c-activate-tile" };
    try {
      await page.keyboard.press("Enter");
      await page.waitForSelector('#viewport-hint[data-state="loaded"]', { state: "attached", timeout: 15000 });
      activateTile.pass = true;
      activateTile.reason = "Enter activated the focused tile; #viewport-hint reached data-state=loaded";
    } catch (err) {
      activateTile.pass = false;
      activateTile.reason = err.message;
    }
    results.push(activateTile);
    console.log(`[${activateTile.pass ? "PASS" : "FAIL"}] 3c-activate-tile: ${activateTile.reason}`);
    void tileStep;

    // 4) "+ Light" — BACKWARD (it is earlier in the DOM than the library panel).
    await runStep(page, results, {
      step: "4-plus-light",
      label: 'Reach "+ Light" and activate it (Shift+Tab: earlier in DOM than the library panel)',
      direction: "backward",
      match: byName("+ Light"),
      maxSteps: 40,
      activateKey: "Enter",
      screenshotName: "4-plus-light",
    });
    await page.waitForTimeout(300); // let refreshOutliner()/refreshMaterialPanel() settle

    // Confirm the "+ Light" edit's autosave has actually landed in IndexedDB before Save/Turntable
    // (both busy-gate buildProjectDocument()) can race the same debounce window. See
    // pollAutosaveRecord()'s comment above for why this is needed for a deterministic journey.
    const autosaveOk = await pollAutosaveRecord(page, 6000);
    results.push({
      step: "4b-autosave-confirmed",
      pass: autosaveOk,
      reason: autosaveOk
        ? "recovery record present in IndexedDB before proceeding"
        : "no recovery record found within 6000ms of the + Light edit — autosave may be delayed or blocked",
    });
    console.log(`[${autosaveOk ? "PASS" : "FAIL"}] 4b-autosave-confirmed`);

    // 5) "Save project" — BACKWARD from "+ Light" (file-actions is earlier in the DOM than
    // #toolbar). Catch the real download.
    await runStep(page, results, {
      step: "5-save-project",
      label: 'Reach "Save project" and activate it (Shift+Tab: file-actions is before #toolbar)',
      direction: "backward",
      match: (info) => info.id === "save-project-btn" || info.name === "Save project",
      maxSteps: 10,
      activateKey: "download",
      screenshotName: "5-save-project",
      waitAfter: async (p) => {
        const text = await p.locator("#app-status").textContent();
        const ok = (text ?? "").startsWith("Project saved");
        if (!ok) throw new Error(`#app-status did not confirm save: "${text}"`);
        return text;
      },
    });

    // 6) "Turntable" — FORWARD from "Save project" (Export group is later in #toolbar).
    await runStep(page, results, {
      step: "6-turntable",
      label: 'Reach "Turntable" and activate it (Tab: export group is later in #toolbar)',
      direction: "forward",
      match: byName("Turntable"),
      maxSteps: 30,
      activateKey: "download",
      screenshotName: "6-turntable",
      waitAfter: async (p) => {
        const text = await new Promise((resolve, reject) => {
          const deadline = Date.now() + 30000;
          const poll = async () => {
            const t = (await p.locator("#export-status").textContent()) ?? "";
            if (/^Turntable ready \(timeline\)$/.test(t) || /^Turntable ready \(default 360° sweep/.test(t)) {
              resolve(t);
              return;
            }
            if (Date.now() > deadline) {
              reject(new Error(`#export-status did not reach an accepted ready state; last value: "${t}"`));
              return;
            }
            setTimeout(poll, 100);
          };
          void poll();
        });
        return text;
      },
    });

    // 7) Reload and reach "Restore" by keyboard.
    // Wait for autosave (debounce 2000ms per src/app/persist.ts) to have written a recovery
    // record before reloading.
    await page.waitForTimeout(2500);
    await page.reload({ waitUntil: "load", timeout: 45000 });
    await page.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 20000 });
    await page.waitForSelector(".restore-prompt", { state: "visible", timeout: 10000 });

    await runStep(page, results, {
      step: "7-restore",
      label: 'Reload, then reach "Restore" and activate it (forward Tab from a fresh page)',
      direction: "forward",
      match: byName("Restore"),
      maxSteps: 80,
      activateKey: "Enter",
      screenshotName: "7-restore",
      waitAfter: async (p) => {
        const text = await new Promise((resolve, reject) => {
          const deadline = Date.now() + 15000;
          const poll = async () => {
            const t = (await p.locator("#app-status").textContent()) ?? "";
            if (t === "Unsaved work restored." || /error|could not/i.test(t)) {
              resolve(t);
              return;
            }
            if (Date.now() > deadline) {
              reject(new Error(`#app-status did not confirm restore; last value: "${t}"`));
              return;
            }
            setTimeout(poll, 100);
          };
          void poll();
        });
        return text;
      },
    });
  } finally {
    await context.close();
    await browser.close();
  }

  writeFileSync(OUT_JSON, JSON.stringify(results, null, 2));
  const passCount = results.filter((r) => r.pass).length;
  console.log(`\n${passCount} / ${results.length} steps passed. Full JSON: ${OUT_JSON}`);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exitCode = 1;
});
