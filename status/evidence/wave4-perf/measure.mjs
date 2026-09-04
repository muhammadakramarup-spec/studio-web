// status/evidence/wave4-perf/measure.mjs
// Wave 4 Performance/Reliability QA — runtime measurements against the clean
// production build served at http://localhost:4175 (npx vite preview --port 4175 --strictPort,
// started from the clean clone at <scratchpad>/studio-web-clean).
//
// Uses `chromium` from @playwright/test directly (no Playwright test runner) so it can drive
// arbitrary sequences (fresh contexts per run, IndexedDB reads, real download timing) outside
// the spec-file/webServer harness. Never imports src/viewer/zip.ts — the turntable ZIP is
// re-parsed with an independent STORE-only reader, exactly as tests/exports.spec.ts and
// tests/e2e.spec.ts already do for the same reason (do not trust the code under test to verify
// itself).
//
// Run from the clean clone root: node ../../.worktrees/.../status/evidence/wave4-perf/measure.mjs
// (invoked with an absolute path from the QA agent; see status/evidence/wave4-perf/13-runtime.log).

import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "http://localhost:4175";
const CLONE_ROOT = process.env.STUDIO_CLONE_ROOT;
if (!CLONE_ROOT) throw new Error("STUDIO_CLONE_ROOT env var required (path to the clean clone)");

const LAUNCH_ARGS = [
  "--use-gl=angle",
  "--use-angle=d3d11",
  "--ignore-gpu-blocklist",
  "--enable-precise-memory-info",
];
const VIEWPORT = { width: 1280, height: 720 };

const OUT_JSON = path.join(path.dirname(fileURLToPath(import.meta.url)), "measure-results.json");

// ---------------------------------------------------------------- stats helpers

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function spread(nums) {
  return Math.max(...nums) - Math.min(...nums);
}
function summarize(nums) {
  return { runs: nums, median: median(nums), min: Math.min(...nums), max: Math.max(...nums), spread: spread(nums) };
}

// ---------------------------------------------------------------- ZIP + PNG oracles
// Independent hand-rolled STORE-only reader — deliberately not imported from src/viewer/zip.ts.
// Copied in spirit from tests/exports.spec.ts's own parseZipStore/pngSize.

function parseZipStore(buf) {
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("EOCD signature not found");
  const entryCount = buf.readUInt16LE(eocdOffset + 10);
  const centralOffset = buf.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let p = centralOffset;
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`bad central directory entry at ${p}`);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    entries.push({ name, data: buf.subarray(dataStart, dataStart + compSize) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
function pngSize(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG (bad signature)");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// ---------------------------------------------------------------- manifest / representative assets

const manifest = JSON.parse(fs.readFileSync(path.join(CLONE_ROOT, "public/assets/manifest.json"), "utf8"));
const models = manifest.assets.filter((a) => a.kind === "model").sort((a, b) => a.triangles - b.triangles);
const REP = {
  smallest: models.find((a) => a.triangles > 0),
  median: models[Math.floor(models.length / 2)],
  largest: models[models.length - 1],
};
console.log("[measure] representative assets:", JSON.stringify(REP, null, 2));

// ---------------------------------------------------------------- app helpers

async function gotoIdle(page) {
  await page.goto(BASE_URL, { waitUntil: "commit" });
  await page.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 30_000 });
}

async function pickAsset(page, asset) {
  const search = page.locator(".library-panel__search");
  await search.fill(asset.id);
  const tile = page.locator(`.library-panel__tile[data-asset-id="${asset.id}"]`);
  await tile.waitFor({ state: "visible", timeout: 10_000 });
  await tile.click();
  // "loaded" hides #viewport-hint (viewportHint.hidden = true in setHint), so it must be waited
  // for via "attached", not the default "visible" — matches the fix status/baseline.md's own
  // capture-states.mjs already documented needing for this exact selector.
  await page.waitForSelector('#viewport-hint[data-state="loaded"]', { state: "attached", timeout: 30_000 });
}

async function readStudioStats(page) {
  return page.evaluate(() => {
    const s = window.__studio;
    const st = s.debug.state();
    return {
      tris: st.tris,
      fps: st.fps,
      rendererCalls: s.renderer.info.render.calls,
      rendererTriangles: s.renderer.info.render.triangles,
    };
  });
}

// ---------------------------------------------------------------- 1) cold load

async function measureColdLoad(browser) {
  const results = [];
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    const t0 = Date.now();
    await gotoIdle(page);
    const t1 = Date.now();
    const navTiming = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      return nav
        ? {
            domContentLoaded: nav.domContentLoadedEventEnd,
            loadEvent: nav.loadEventEnd,
            duration: nav.duration,
          }
        : null;
    });
    results.push({ wallMs: t1 - t0, navTiming });
    await context.close();
  }
  return {
    wallMs: summarize(results.map((r) => r.wallMs)),
    navDurationMs: summarize(results.map((r) => r.navTiming?.duration ?? NaN)),
    raw: results,
  };
}

// ---------------------------------------------------------------- 2) first useful render

async function measureFirstUsefulRender(browser) {
  const out = {};
  for (const [label, asset] of Object.entries(REP)) {
    const timings = [];
    const stats = [];
    for (let i = 0; i < 3; i++) {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      await gotoIdle(page);
      const search = page.locator(".library-panel__search");
      await search.fill(asset.id);
      const tile = page.locator(`.library-panel__tile[data-asset-id="${asset.id}"]`);
      await tile.waitFor({ state: "visible", timeout: 10_000 });
      const t0 = Date.now();
      await tile.click();
      await page.waitForSelector('#viewport-hint[data-state="loaded"]', { state: "attached", timeout: 30_000 });
      const t1 = Date.now();
      await page.waitForTimeout(100); // let the rAF loop render at least one frame of the new model
      const s = await readStudioStats(page);
      timings.push(t1 - t0);
      stats.push(s);
      await context.close();
    }
    out[label] = {
      asset: { id: asset.id, name: asset.name, triangles: asset.triangles, fileBytes: asset.fileBytes },
      clickToLoadedMs: summarize(timings),
      stats,
    };
  }
  return out;
}

// ---------------------------------------------------------------- 3) orbit responsiveness

async function measureOrbitFps(browser) {
  const results = [];
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await gotoIdle(page);
    await pickAsset(page, REP.largest);
    const box = await page.locator("#viewport").boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    for (let d = 0; d < 5; d++) {
      const dx = d % 2 === 0 ? 120 : -120;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + dx, cy + (d % 2 === 0 ? 40 : -40), { steps: 12 });
      await page.mouse.up();
    }
    await page.waitForTimeout(1000);
    const st = await page.evaluate(() => window.__studio.debug.state());
    results.push(st.fps);
    await context.close();
  }
  return summarize(results);
}

// ---------------------------------------------------------------- 4) memory before/after largest load

async function measureMemory(browser) {
  const results = [];
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await gotoIdle(page);
    const before = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
    await pickAsset(page, REP.largest);
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
    results.push({ before, after, deltaBytes: after != null && before != null ? after - before : null });
    await context.close();
  }
  return {
    beforeBytes: summarize(results.map((r) => r.before).filter((v) => v != null)),
    afterBytes: summarize(results.map((r) => r.after).filter((v) => v != null)),
    deltaBytes: summarize(results.map((r) => r.deltaBytes).filter((v) => v != null)),
    raw: results,
  };
}

// ---------------------------------------------------------------- 5) export durations (+ D-1 runtime check)

async function downloadVia(page, buttonName, downloadDir, index) {
  const t0 = Date.now();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.getByRole("button", { name: buttonName, exact: true }).click(),
  ]);
  const savedPath = path.join(downloadDir, `${index}-${buttonName.replace(/\s+/g, "_")}.bin`);
  await download.saveAs(savedPath);
  const t1 = Date.now();
  const buf = fs.readFileSync(savedPath);
  return { ms: t1 - t0, bytes: buf.length, buf };
}

async function measureExports(browser, downloadRoot) {
  const order = ["PNG", "GLB", "GLTF", "Blender ZIP", "Turntable"];
  const perFormat = Object.fromEntries(order.map((k) => [k, []]));
  const turntableChecks = [];

  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({ viewport: VIEWPORT, acceptDownloads: true });
    const page = await context.newPage();
    await gotoIdle(page);
    await pickAsset(page, REP.largest);
    const dlDir = path.join(downloadRoot, `run${i}`);
    fs.mkdirSync(dlDir, { recursive: true });

    for (const label of order) {
      const r = await downloadVia(page, label, dlDir, i);
      perFormat[label].push({ ms: r.ms, bytes: r.bytes });

      if (label === "Turntable") {
        const entries = parseZipStore(r.buf);
        const frames = entries.filter((e) => /^frame_\d{4}\.png$/.test(e.name));
        const dims = frames.map((f) => pngSize(f.data));
        const all1024 = dims.every((d) => d.width === 1024 && d.height === 1024);
        turntableChecks.push({
          runIndex: i,
          entryCount: entries.length,
          frameCount: frames.length,
          allEntryNames: entries.map((e) => e.name),
          all1024,
          dims: dims.slice(0, 3), // sample of first 3 for the report
        });
      }
      if (label === "PNG") {
        const dims = pngSize(r.buf);
        perFormat[label][perFormat[label].length - 1].dims = dims;
      }
    }
    await context.close();
  }

  const summary = {};
  for (const label of order) {
    summary[label] = {
      ms: summarize(perFormat[label].map((r) => r.ms)),
      bytes: summarize(perFormat[label].map((r) => r.bytes)),
      raw: perFormat[label],
    };
  }
  return { summary, turntableChecks };
}

// ---------------------------------------------------------------- 6) autosave cost

async function measureAutosave(browser) {
  const results = [];
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await gotoIdle(page);
    await pickAsset(page, REP.median);
    await page.getByRole("button", { name: "+ Light", exact: true }).click();
    await page.waitForTimeout(3000);
    const record = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open("studio-web", 1);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("recovery", "readonly");
            const getReq = tx.objectStore("recovery").get("current");
            getReq.onsuccess = () =>
              resolve(getReq.result ? { present: true, length: JSON.stringify(getReq.result).length, savedAt: getReq.result.savedAt } : { present: false });
            getReq.onerror = () => reject(getReq.error);
          };
          req.onerror = () => reject(req.error);
        }),
    );
    results.push(record);
    await context.close();
  }
  const present = results.filter((r) => r.present);
  return {
    raw: results,
    recordBytes: present.length ? summarize(present.map((r) => r.length)) : null,
  };
}

// ---------------------------------------------------------------- main

async function main() {
  const downloadRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "downloads");
  fs.mkdirSync(downloadRoot, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
  try {
    console.log("\n=== 1) cold load ===");
    const coldLoad = await measureColdLoad(browser);
    console.log(JSON.stringify(coldLoad, null, 2));

    console.log("\n=== 2) first useful render (per representative asset) ===");
    const firstUsefulRender = await measureFirstUsefulRender(browser);
    console.log(JSON.stringify(firstUsefulRender, null, 2));

    console.log("\n=== 3) orbit responsiveness (fps 1s after 5 drags) ===");
    const orbitFps = await measureOrbitFps(browser);
    console.log(JSON.stringify(orbitFps, null, 2));

    console.log("\n=== 4) memory before/after loading largest asset ===");
    const memory = await measureMemory(browser);
    console.log(JSON.stringify(memory, null, 2));

    console.log("\n=== 5) export durations + D-1 runtime check ===");
    const exports_ = await measureExports(browser, downloadRoot);
    console.log(JSON.stringify(exports_, null, 2));

    console.log("\n=== 6) autosave cost (IndexedDB recovery record) ===");
    const autosave = await measureAutosave(browser);
    console.log(JSON.stringify(autosave, null, 2));

    const results = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      viewport: VIEWPORT,
      representativeAssets: REP,
      coldLoad,
      firstUsefulRender,
      orbitFps,
      memory,
      exports: exports_,
      autosave,
    };
    fs.writeFileSync(OUT_JSON, JSON.stringify(results, null, 2));
    console.log(`\n[measure] wrote ${OUT_JSON}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[measure] FAILED:", err);
  process.exitCode = 1;
});
