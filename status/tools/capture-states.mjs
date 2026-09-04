// Wave 0 completion — state captures and downloaded-export evidence.
//
// Ownership: status/tools/ (new) + status/before/ only. Read-only against the app under test.
// Drives the real production build (dist/, served via `vite preview --port 4173`) and the live
// site (https://studio-web-6ms.pages.dev/) with Playwright + real Chromium, and validates real
// downloaded export bytes with a hand-written STORE-only ZIP central-directory parser (no import
// from src/ — see the parseZipEntries()/extractStoredEntry() pair below).
//
// Usage:
//   node status/tools/capture-states.mjs
//
// Writes screenshots to status/before/<live|local>-<w>x<h>-<state>.png, appends failures to
// status/before/CAPTURE-NOTES.md, and downloads real export bytes + a results.json summary into
// an OS temp directory (path printed at the end) that the caller deletes after reading it.

import { chromium } from "@playwright/test";
import { mkdtempSync, writeFileSync, statSync, readFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BEFORE_DIR = path.join(REPO_ROOT, "status", "before");
const NOTES_PATH = path.join(BEFORE_DIR, "CAPTURE-NOTES.md");

const BASES = [
  { key: "local", url: "http://localhost:4173" },
  { key: "live", url: "https://studio-web-6ms.pages.dev" },
];
const VIEWPORTS = [
  [1536, 864],
  [1280, 720],
  [1024, 768],
  [768, 1024],
  [390, 844],
];

const tmpRoot = mkdtempSync(path.join(tmpdir(), "studio-web-wave0-"));
console.log(`Temp dir: ${tmpRoot}`);

function ensureNotesHeader() {
  if (!existsSync(NOTES_PATH)) {
    writeFileSync(
      NOTES_PATH,
      "# Capture failures — Wave 0 completion (2026-09-04)\n\n" +
        "Each line records a base/viewport/state that could not be captured and why. Absence of a " +
        "line for a given base/viewport/state means it captured successfully.\n\n",
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

async function shot(page, base, w, h, state) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const filePath = path.join(BEFORE_DIR, `${base}-${w}x${h}-${state}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`CAPTURED ${filePath}`);
  return filePath;
}

async function waitButtonEnabled(page, name, timeoutMs = 20000) {
  await pollUntil(
    async () => {
      const disabled = await page.getByRole("button", { name, exact: true }).isDisabled();
      return disabled ? null : true;
    },
    { timeoutMs, intervalMs: 100 },
  );
}

// ---------------------------------------------------------------- state capture

async function captureEditing(page, base, w, h) {
  await page.waitForSelector(".library-panel__tile", { timeout: 15000 });
  await page.locator(".library-panel__tile").first().click();
  // The hint is intentionally hidden (not visible) once data-state="loaded" — see main.ts
  // setHint(): state "loaded" sets viewportHint.hidden = true. Wait for the attribute, not
  // visibility, or this never resolves even though the model loaded correctly.
  await page.waitForSelector('#viewport-hint[data-state="loaded"]', { state: "attached", timeout: 15000 });
  await page.getByRole("button", { name: "+ Light", exact: true }).click();
  await page.waitForTimeout(500);
  await shot(page, base, w, h, "editing");
}

async function captureSaving(page, base, w, h) {
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
  await shot(page, base, w, h, "saving");
  const savedPath = path.join(tmpRoot, `${base}-${w}x${h}-project.studio.json`);
  await download.saveAs(savedPath);
  const size = statSync(savedPath).size;
  console.log(`DOWNLOAD ${base} ${w}x${h} project.studio.json -> ${savedPath} (${size} bytes)`);
  return { path: savedPath, size };
}

async function captureExportingAndCompletion(page, base, w, h) {
  const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("button", { name: "Turntable", exact: true }).click();
  const exportingText = await pollUntil(
    async () => {
      const text = (await page.locator("#export-status").textContent()) ?? "";
      return /Exporting \d+%/.test(text) ? text : null;
    },
    { timeoutMs: 10000, intervalMs: 50 },
  );
  await shot(page, base, w, h, "exporting");

  const download = await downloadPromise;
  await pollUntil(
    async () => {
      const text = (await page.locator("#export-status").textContent()) ?? "";
      return text === "Turntable ready" ? text : null;
    },
    { timeoutMs: 30000, intervalMs: 100 },
  );
  await shot(page, base, w, h, "completion");
  const savedPath = path.join(tmpRoot, `${base}-${w}x${h}-turntable-state.zip`);
  await download.saveAs(savedPath);
  const size = statSync(savedPath).size;
  console.log(`DOWNLOAD ${base} ${w}x${h} turntable.zip -> ${savedPath} (${size} bytes)`);
  return { path: savedPath, size, exportingText };
}

async function captureRecoverable(page, base, w, h, badFilePath) {
  await page.setInputFiles("#model-file-input", badFilePath);
  await page.locator("#viewport-error").waitFor({ state: "visible", timeout: 10000 });
  await shot(page, base, w, h, "recoverable");
}

async function runStateMatrix(browser, badFilePath) {
  const results = [];
  for (const base of BASES) {
    for (const [w, h] of VIEWPORTS) {
      const label = `${base.key} ${w}x${h}`;
      console.log(`\n=== state matrix: ${label} ===`);
      const context = await browser.newContext({
        viewport: { width: w, height: h },
        acceptDownloads: true,
      });
      const page = await context.newPage();
      try {
        await page.goto(base.url, { waitUntil: "load", timeout: 45000 });
        await page.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 20000 });
      } catch (err) {
        note(`${label} STATE=all FAILED to load base: ${err.message}`);
        await context.close();
        continue;
      }

      try {
        await captureEditing(page, base.key, w, h);
      } catch (err) {
        note(`${label} STATE=editing FAILED: ${err.message}`);
      }

      try {
        const saved = await captureSaving(page, base.key, w, h);
        results.push({ base: base.key, w, h, kind: "project-save", ...saved });
      } catch (err) {
        note(`${label} STATE=saving FAILED: ${err.message}`);
      }

      try {
        const zip = await captureExportingAndCompletion(page, base.key, w, h);
        results.push({ base: base.key, w, h, kind: "turntable-state", ...zip });
      } catch (err) {
        note(`${label} STATE=exporting/completion FAILED: ${err.message}`);
      }

      try {
        await captureRecoverable(page, base.key, w, h, badFilePath);
      } catch (err) {
        note(`${label} STATE=recoverable FAILED: ${err.message}`);
      }

      await context.close();
    }
  }
  return results;
}

// ---------------------------------------------------------------- export evidence validators

function validatePNG(buf) {
  const expectedSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const sigOk = buf.subarray(0, 8).equals(expectedSig);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const dimsOk = width === 2048 && height === 2048;
  return { pass: sigOk && dimsOk, sigOk, width, height };
}

function validateGLB(buf) {
  const magic = buf.subarray(0, 4).toString("ascii");
  const version = buf.readUInt32LE(4);
  return { pass: magic === "glTF" && version === 2, magic, version };
}

function validateGLTF(buf) {
  try {
    const json = JSON.parse(buf.toString("utf8"));
    return { pass: json?.asset?.version === "2.0", version: json?.asset?.version };
  } catch (err) {
    return { pass: false, error: err.message };
  }
}

// Tiny STORE-only ZIP central-directory parser. Deliberately hand-written, not imported from
// src/viewer/zip.ts, so the evidence check does not trust the code it is meant to verify.
function parseZipEntries(buf) {
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("EOCD signature (PK\\x05\\x06 / 0x06054b50) not found");
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const centralOffset = buf.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let p = centralOffset;
  for (let i = 0; i < totalEntries; i++) {
    const sig = buf.readUInt32LE(p);
    if (sig !== 0x02014b50) throw new Error(`Bad central directory signature at offset ${p}`);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    entries.push({ name, method, compSize, uncompSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, eocdOffset, totalEntries };
}

function extractStoredEntry(buf, entry) {
  const nameLen = buf.readUInt16LE(entry.localOffset + 26);
  const extraLen = buf.readUInt16LE(entry.localOffset + 28);
  const dataStart = entry.localOffset + 30 + nameLen + extraLen;
  return buf.subarray(dataStart, dataStart + entry.compSize); // STORE: compressed === uncompressed
}

function validateBlenderZip(buf) {
  const { entries } = parseZipEntries(buf);
  const names = entries.map((e) => e.name);
  const expected = ["studio-scene.glb", "studio-scene.gltf", "README-Blender.txt"];
  const hasAll = expected.every((n) => names.includes(n));
  const exactCount = names.length === expected.length;
  return { pass: hasAll && exactCount, names };
}

function validateTurntableZip(buf) {
  const { entries } = parseZipEntries(buf);
  const names = entries.map((e) => e.name).sort();
  const expectedNames = Array.from({ length: 24 }, (_, i) => `frame_${String(i + 1).padStart(4, "0")}.png`);
  const namesOk = names.length === 24 && expectedNames.every((n, i) => names[i] === n);
  let dimsOk = true;
  const badFrames = [];
  for (const entry of entries) {
    const data = extractStoredEntry(buf, entry);
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    if (width !== 1024 || height !== 1024) {
      dimsOk = false;
      badFrames.push({ name: entry.name, width, height });
    }
  }
  return { pass: namesOk && dimsOk, names, badFrames };
}

// ---------------------------------------------------------------- export evidence capture

async function exportAndValidate(page, buttonName, filename, validate) {
  await waitButtonEnabled(page, buttonName);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.getByRole("button", { name: buttonName, exact: true }).click(),
  ]);
  const savedPath = path.join(tmpRoot, filename);
  await download.saveAs(savedPath);
  const buf = readFileSync(savedPath);
  const validation = validate(buf);
  console.log(`EXPORT ${filename} size=${buf.length} pass=${validation.pass}`);
  return { path: savedPath, size: buf.length, validation };
}

async function runExportEvidence(browser) {
  const evidence = [];
  for (const base of BASES) {
    const label = `${base.key} 1536x864`;
    console.log(`\n=== export evidence: ${label} ===`);
    const context = await browser.newContext({
      viewport: { width: 1536, height: 864 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    try {
      await page.goto(base.url, { waitUntil: "load", timeout: 45000 });
      await page.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 20000 });
      await page.waitForSelector(".library-panel__tile", { timeout: 15000 });
      await page.locator(".library-panel__tile").first().click();
      await page.waitForSelector('#viewport-hint[data-state="loaded"]', { state: "attached", timeout: 15000 });

      const formats = [
        { name: "PNG", filename: `${base.key}-export.png`, validate: validatePNG },
        { name: "GLB", filename: `${base.key}-export.glb`, validate: validateGLB },
        { name: "GLTF", filename: `${base.key}-export.gltf`, validate: validateGLTF },
        { name: "Blender ZIP", filename: `${base.key}-blender-package.zip`, validate: validateBlenderZip },
        { name: "Turntable", filename: `${base.key}-turntable.zip`, validate: validateTurntableZip },
      ];

      for (const fmt of formats) {
        try {
          const result = await exportAndValidate(page, fmt.name, fmt.filename, fmt.validate);
          evidence.push({ base: base.key, format: fmt.name, ...result });
        } catch (err) {
          note(`${label} EXPORT-EVIDENCE=${fmt.name} FAILED: ${err.message}`);
          evidence.push({ base: base.key, format: fmt.name, error: err.message });
        }
      }
    } catch (err) {
      note(`${label} EXPORT-EVIDENCE setup FAILED: ${err.message}`);
    } finally {
      await context.close();
    }
  }
  return evidence;
}

// ---------------------------------------------------------------- main

async function main() {
  if (!existsSync(BEFORE_DIR)) mkdirSync(BEFORE_DIR, { recursive: true });
  ensureNotesHeader();

  const badFilePath = path.join(tmpRoot, "not-a-model.txt");
  writeFileSync(badFilePath, "hello");

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });

  let stateResults = [];
  let evidence = [];
  try {
    stateResults = await runStateMatrix(browser, badFilePath);
    evidence = await runExportEvidence(browser);
  } finally {
    await browser.close();
  }

  const summaryPath = path.join(tmpRoot, "results.json");
  writeFileSync(summaryPath, JSON.stringify({ stateResults, evidence }, null, 2));
  console.log(`\nResults JSON: ${summaryPath}`);
  console.log(`\nAll done. Temp dir (delete after reading): ${tmpRoot}`);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exitCode = 1;
});
