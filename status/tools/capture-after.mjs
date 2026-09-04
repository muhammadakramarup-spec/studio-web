// Wave 4 accessibility/responsive QA — after-capture matrix.
//
// Adapted from status/tools/capture-states.mjs (Wave 0), which this file does NOT edit. Ownership
// (Wave 4 a11y agent): status/after/ (new), status/tools/ (new files only). Drives ONLY the local
// production preview on http://localhost:4174 (never port 5173 — that belongs to another agent's
// clean-clone Playwright run). Uses the real Chromium install with
// --use-gl=angle --use-angle=d3d11 --ignore-gpu-blocklist so WebGL actually renders.
//
// Captures the SAME 7-state matrix as status/before/ (empty, loaded, editing, saving, exporting,
// completion, recoverable) at all 5 target viewports, plus two NEW states this session adds:
//   - restore-prompt: load a library model, click "+ Light", wait for autosave (debounce 2000ms
//     per src/app/persist.ts createAutosaver's default), reload, capture the idle hint showing the
//     Restore/Discard buttons.
//   - context-lost: after a load, force-lose the WebGL context via the WEBGL_lose_context
//     extension and capture #viewport-error.
//
// Usage: node status/tools/capture-after.mjs
// Writes status/after/local-<w>x<h>-<state>.png (35 + 10 = 45 files) and appends failures to
// status/after/CAPTURE-NOTES.md.

import { chromium } from "@playwright/test";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const AFTER_DIR = path.join(REPO_ROOT, "status", "after");
const NOTES_PATH = path.join(AFTER_DIR, "CAPTURE-NOTES.md");

const BASE_URL = "http://localhost:4174";
const VIEWPORTS = [
  [1536, 864],
  [1280, 720],
  [1024, 768],
  [768, 1024],
  [390, 844],
];

const tmpRoot = mkdtempSync(path.join(tmpdir(), "studio-web-wave4-a11y-"));
console.log(`Temp dir (bad-file fixture): ${tmpRoot}`);

function ensureNotesHeader() {
  if (!existsSync(NOTES_PATH)) {
    writeFileSync(
      NOTES_PATH,
      "# Capture failures — Wave 4 accessibility/responsive QA after-capture\n\n" +
        "Each line records a viewport/state that could not be captured and why. Absence of a line " +
        "for a given viewport/state means it captured successfully.\n\n",
    );
  }
}

function note(line) {
  const stamp = new Date().toISOString();
  appendFileSync(NOTES_PATH, `- ${stamp} ${line}\n`);
  console.error(`NOTE: ${line}`);
}

async function pollUntil(fn, { timeoutMs, intervalMs }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() >= deadline) throw new Error(`pollUntil timed out after ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function shot(page, w, h, state) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const filePath = path.join(AFTER_DIR, `local-${w}x${h}-${state}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`CAPTURED ${filePath}`);
  return filePath;
}

async function newPage(browser, w, h) {
  const context = await browser.newContext({
    viewport: { width: w, height: h },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: "load", timeout: 45000 });
  await page.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 20000 });
  return { context, page };
}

async function loadFirstTile(page) {
  await page.waitForSelector(".library-panel__tile", { timeout: 15000 });
  await page.locator(".library-panel__tile").first().click();
  // The hint is intentionally hidden (not visible) once data-state="loaded" — see main.ts
  // setHint(). Wait for the attribute, not visibility.
  await page.waitForSelector('#viewport-hint[data-state="loaded"]', { state: "attached", timeout: 15000 });
}

// ---------------------------------------------------------------- 1) empty + loaded

async function captureEmptyAndLoaded(browser, w, h) {
  const label = `${w}x${h}`;
  const { context, page } = await newPage(browser, w, h);
  try {
    await shot(page, w, h, "empty");
  } catch (err) {
    note(`${label} STATE=empty FAILED: ${err.message}`);
  }
  try {
    await loadFirstTile(page);
    await shot(page, w, h, "loaded");
  } catch (err) {
    note(`${label} STATE=loaded FAILED: ${err.message}`);
  }
  await context.close();
}

// ------------------------------------------- 2) editing, saving, exporting, completion, recoverable

async function captureStateMatrix(browser, w, h, badFilePath) {
  const label = `${w}x${h}`;
  const { context, page } = await newPage(browser, w, h);

  try {
    await loadFirstTile(page);
    await page.getByRole("button", { name: "+ Light", exact: true }).click();
    await page.waitForTimeout(500);
    await shot(page, w, h, "editing");
  } catch (err) {
    note(`${label} STATE=editing FAILED: ${err.message}`);
  }

  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20000 }),
      page.click("#save-project-btn"),
    ]);
    await pollUntil(
      async () => {
        const text = (await page.locator("#app-status").textContent()) ?? "";
        return text.startsWith("Project saved") ? text : null;
      },
      { timeoutMs: 20000, intervalMs: 100 },
    );
    await shot(page, w, h, "saving");
    void download;
  } catch (err) {
    note(`${label} STATE=saving FAILED: ${err.message}`);
  }

  try {
    const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
    await page.getByRole("button", { name: "Turntable", exact: true }).click();
    await pollUntil(
      async () => {
        const text = (await page.locator("#export-status").textContent()) ?? "";
        return /Exporting \d+%/.test(text) ? text : null;
      },
      { timeoutMs: 10000, intervalMs: 50 },
    );
    await shot(page, w, h, "exporting");

    const download = await downloadPromise;
    await pollUntil(
      async () => {
        const text = (await page.locator("#export-status").textContent()) ?? "";
        return /^Turntable ready/.test(text) ? text : null;
      },
      { timeoutMs: 30000, intervalMs: 100 },
    );
    await shot(page, w, h, "completion");
    void download;
  } catch (err) {
    note(`${label} STATE=exporting/completion FAILED: ${err.message}`);
  }

  try {
    await page.setInputFiles("#model-file-input", badFilePath);
    await page.locator("#viewport-error").waitFor({ state: "visible", timeout: 10000 });
    await shot(page, w, h, "recoverable");
  } catch (err) {
    note(`${label} STATE=recoverable FAILED: ${err.message}`);
  }

  await context.close();
}

// ---------------------------------------------------------------- 3) restore-prompt (NEW)

async function captureRestorePrompt(browser, w, h) {
  const label = `${w}x${h}`;
  const { context, page } = await newPage(browser, w, h);
  try {
    await loadFirstTile(page);
    await page.getByRole("button", { name: "+ Light", exact: true }).click();
    // Autosave debounce is 2000ms (src/app/persist.ts createAutosaver default). Wait 3s per task.
    await page.waitForTimeout(3000);
    await page.reload({ waitUntil: "load", timeout: 45000 });
    await page.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 20000 });
    // Restore prompt is appended as a .restore-prompt line inside #viewport-hint (main.ts setHint()).
    await page.waitForSelector(".restore-prompt", { state: "visible", timeout: 10000 });
    await page.getByRole("button", { name: "Restore", exact: true }).waitFor({ state: "visible", timeout: 5000 });
    await shot(page, w, h, "restore-prompt");
  } catch (err) {
    note(`${label} STATE=restore-prompt FAILED: ${err.message}`);
  }
  await context.close();
}

// ---------------------------------------------------------------- 4) context-lost (NEW)

async function captureContextLost(browser, w, h) {
  const label = `${w}x${h}`;
  const { context, page } = await newPage(browser, w, h);
  try {
    await loadFirstTile(page);
    await page.evaluate(() => {
      const studio = window.__studio;
      const gl = studio.renderer.getContext();
      const ext = gl.getExtension("WEBGL_lose_context");
      if (!ext) throw new Error("WEBGL_lose_context extension not available");
      ext.loseContext();
    });
    await page.locator("#viewport-error").waitFor({ state: "visible", timeout: 10000 });
    await shot(page, w, h, "context-lost");
  } catch (err) {
    note(`${label} STATE=context-lost FAILED: ${err.message}`);
  }
  await context.close();
}

// ---------------------------------------------------------------- main

async function main() {
  if (!existsSync(AFTER_DIR)) mkdirSync(AFTER_DIR, { recursive: true });
  ensureNotesHeader();

  const badFilePath = path.join(tmpRoot, "not-a-model.txt");
  writeFileSync(badFilePath, "hello");

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });

  try {
    for (const [w, h] of VIEWPORTS) {
      console.log(`\n=== ${w}x${h}: empty/loaded ===`);
      await captureEmptyAndLoaded(browser, w, h);
      console.log(`\n=== ${w}x${h}: editing/saving/exporting/completion/recoverable ===`);
      await captureStateMatrix(browser, w, h, badFilePath);
      console.log(`\n=== ${w}x${h}: restore-prompt ===`);
      await captureRestorePrompt(browser, w, h);
      console.log(`\n=== ${w}x${h}: context-lost ===`);
      await captureContextLost(browser, w, h);
    }
  } finally {
    await browser.close();
  }

  console.log(`\nAll done. Bad-file temp dir (safe to delete): ${tmpRoot}`);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exitCode = 1;
});
