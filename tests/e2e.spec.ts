// tests/e2e.spec.ts — the day's definition of done (SCOPE.md §6).
// Ownership: Assembly (Wave 3) owns this file (DECISIONS.md #20's src/app/**+tests/e2e.spec.ts
// grant). Six frozen interfaces are wired directly here, in the same "dynamic-import the real
// module in the browser" pattern every silo's own tests/s{1..6}.spec.ts uses — this proves the
// six silos work as ONE application, not that main.ts's particular UI markup works.
//
// Test model: C:\3D-Studio\02_projects\furnishow-360\meshes — a private client's files, test
// input only, never copied into this repo, never into public/ (CONTEXT.lock.md; DECISIONS.md #1).
// Read as bytes in this Node process and handed to the page as a Blob (base64 round trip),
// exactly like tests/s1.spec.ts.
//
// GPU launch flags per DECISIONS.md #21: "the flags stay in the suites that need a real GPU (S1
// and the end-to-end run)" — headless Chromium's default SwiftShader path cannot be trusted for
// a load-time budget check, so this file routes Chromium through ANGLE/D3D11 same as tests/s1.spec.ts.

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.use({
  launchOptions: {
    args: [
      "--use-gl=angle",
      "--use-angle=d3d11",
      "--ignore-gpu-blocklist",
      "--enable-gpu-rasterization",
      "--disable-gpu-sandbox",
    ],
  },
});

const MESHES_DIR = String.raw`C:\3D-Studio\02_projects\furnishow-360\meshes`;
const PRIMARY_MODEL = "coffee-table-10.glb"; // same fixture S1's own suite verified (Draco-compressed)

function readModelB64(fileName: string): string {
  return fs.readFileSync(path.join(MESHES_DIR, fileName)).toString("base64");
}

// ---------------------------------------------------------------- ZIP + PNG oracles
// Independent of src/viewer/zip.ts — reads the ZIP's local/central-directory records directly,
// exactly like tests/s1.spec.ts's own parseZipStore/pngSize (duplicated here rather than
// imported, since this file owns nothing inside src/viewer/** or tests/s1.spec.ts).

function parseZipStore(buf: Buffer): { name: string; data: Buffer }[] {
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
  const entries: { name: string; data: Buffer }[] = [];
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

function pngSize(buf: Buffer): { width: number; height: number } {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG (bad signature)");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Vite discovers three/addons/... as new dependencies to pre-bundle the first time any of these
// modules is imported in a fresh page, and pushes a full-reload over HMR once that finishes —
// which would destroy window state if it lands mid-test. Force discovery+reload here first,
// exactly like tests/s1.spec.ts's warmVite().
async function warmVite(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  try {
    await page.evaluate(async () => {
      await Promise.all([
        import("/src/viewer/studio.ts"),
        import("/src/editor/index.ts"),
        import("/src/library/index.ts"),
        import("/src/timeline/index.ts"),
        import("/src/account/index.ts"),
        import("/src/ai/index.ts"),
      ]);
    });
  } catch {
    /* a reload here is exactly what this warm-up is for */
  }
  await page.waitForTimeout(800);
  await page.goto("/"); // land on a guaranteed-settled page before the real run
}

test("E2E — six silos, one studio (SCOPE.md §6 definition of done)", async ({ page }) => {
  test.setTimeout(120_000);
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("[e2e console.error]", msg.text());
  });
  page.on("pageerror", (err) => console.log("[e2e pageerror]", err.message));

  await warmVite(page);

  // -------------------------------------------------------------- Step 1 — Load (S1)
  const modelB64 = readModelB64(PRIMARY_MODEL);
  const step1 = await page.evaluate(async (modelB64) => {
    const { createStudio } = await import("/src/viewer/studio.ts");
    const canvas = document.getElementById("viewport") as HTMLCanvasElement;
    canvas.style.width = "800px";
    canvas.style.height = "600px";
    const studio = createStudio({ canvas });
    studio.resize();
    (window as any).__e2e_studio = studio;

    const bytes = Uint8Array.from(atob(modelB64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "model/gltf-binary" });

    const t0 = performance.now();
    await studio.loadModel(blob, "coffee-table-10.glb");
    const loadMs = performance.now() - t0;
    const ready = studio.debug.ready();

    return { loadMs, ready };
  }, modelB64);

  console.log(`[E2E] step1 load: loadMs=${step1.loadMs.toFixed(1)} ready=${step1.ready}`);
  expect(step1.ready).toBe(true);
  expect(step1.loadMs).toBeLessThan(3000);

  // -------------------------------------------------------------- Step 2 — Pick (S3 -> S1)
  const step2 = await page.evaluate(async () => {
    const { mountLibraryPanel } = await import("/src/library/index.ts");
    const studio = (window as any).__e2e_studio;

    const res = await fetch("/assets/manifest.json");
    const manifest = await res.json();

    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.left = "-9999px"; // off-screen, not part of the layout under test
    document.body.appendChild(container);

    let pickedAsset: any = null;
    let loadError: string | null = null;
    let loadResolved = false;

    const handle = mountLibraryPanel(container, {
      manifest,
      onAssetPicked: async (asset: any) => {
        pickedAsset = asset;
        try {
          await studio.loadModel(asset.fileUrl, asset.name);
          loadResolved = true;
        } catch (e) {
          loadError = String(e);
        }
      },
    });

    const tile = container.querySelector(".library-panel__tile") as HTMLButtonElement | null;
    const tileFound = !!tile;
    tile?.click();
    // onAssetPicked's async body runs after the synchronous click dispatch; wait for it.
    await new Promise((r) => setTimeout(r, 50));
    // Poll briefly in case loadModel takes a little longer than one macrotask.
    for (let i = 0; i < 40 && !loadResolved && !loadError; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }

    const manifestAssetCount = manifest.assets.length;
    handle.dispose();
    container.remove();

    return {
      manifestAssetCount,
      tileFound,
      pickedAssetId: pickedAsset?.id ?? null,
      loadResolved,
      loadError,
    };
  });

  console.log(
    `[E2E] step2 pick: manifestAssets=${step2.manifestAssetCount} tileFound=${step2.tileFound} ` +
      `pickedAssetId=${step2.pickedAssetId} loadResolved=${step2.loadResolved} loadError=${step2.loadError}`,
  );
  expect(step2.manifestAssetCount).toBeGreaterThan(0);
  expect(step2.tileFound).toBe(true);
  expect(step2.pickedAssetId).toBeTruthy();
  expect(step2.loadError).toBeNull();
  expect(step2.loadResolved).toBe(true);

  // -------------------------------------------------------------- Step 3 — Light (S2 -> S1)
  const step3 = await page.evaluate(async () => {
    const { attachEditor } = await import("/src/editor/index.ts");
    const studio = (window as any).__e2e_studio;
    const editor = (window as any).__e2e_editor ?? attachEditor(studio);
    (window as any).__e2e_editor = editor;

    function countLights(): number {
      return editor.outliner.list().filter((r: any) => r.type === "Light").length;
    }
    function snap(): Uint8ClampedArray {
      studio.debug.renderOnce();
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      const g = c.getContext("2d")!;
      g.drawImage(studio.renderer.domElement, 0, 0, 256, 256);
      return g.getImageData(0, 0, 256, 256).data;
    }
    function diffMoved(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
      const n = a.length / 4;
      let moved = 0;
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        let pmax = 0;
        for (let c = 0; c < 3; c++) pmax = Math.max(pmax, Math.abs(a[o + c] - b[o + c]));
        if (pmax > 2) moved++;
      }
      return (moved / n) * 100;
    }

    const beforeCount = countLights();
    const beforeSnap = snap();
    const obj = editor.ops.add({ kind: "light-point", at: [1.5, 2.2, 1.5] });
    editor.select(obj);
    const afterCount = countLights();
    const afterSnap = snap();

    return {
      lightCountDelta: afterCount - beforeCount,
      movedPct: diffMoved(beforeSnap, afterSnap),
    };
  });

  console.log(`[E2E] step3 light: lightCountDelta=${step3.lightCountDelta} movedPct=${step3.movedPct.toFixed(2)}%`);
  expect(step3.lightCountDelta).toBe(1);
  expect(step3.movedPct).toBeGreaterThanOrEqual(0.5);

  // -------------------------------------------------------------- Step 4 — Keyframe a turn (S4 -> S1)
  const duration = 6;
  const step4 = await page.evaluate(async (duration) => {
    const { attachTimeline } = await import("/src/timeline/index.ts");
    const studio = (window as any).__e2e_studio;

    let renderCalls = 0;
    const adapter = {
      applySampledFrame(frame: any) {
        const xf = frame.transforms["pivot"];
        if (!xf) return;
        studio.pivot.quaternion.set(xf.quaternion[0], xf.quaternion[1], xf.quaternion[2], xf.quaternion[3]);
      },
      renderNow() {
        renderCalls++;
        studio.debug.renderOnce();
      },
    };
    const timeline = attachTimeline(adapter);
    (window as any).__e2e_timeline = timeline;

    timeline.addTurntableClip(duration, "pivot");
    const state = timeline.getState();
    const track = state.tracks.find((t: any) => t.targetId === "pivot");
    const channel = track?.channels.find((c: any) => c.id === "quaternion");
    const keyTs = channel?.keys.map((k: any) => k.t) ?? [];

    const frame = timeline.sampleAt(duration / 2);
    const q = frame.transforms["pivot"].quaternion;
    const w = Math.max(-1, Math.min(1, q[3])); // clamp for float safety, same formula as tests/s4.spec.ts
    const angle = 2 * Math.acos(w);

    // Exercise the adapter/pivot integration too (scrubTo applies + renders through the real S1 pivot).
    timeline.scrubTo(duration / 2);
    const pivotAngleAfterScrub = 2 * Math.acos(Math.max(-1, Math.min(1, studio.pivot.quaternion.w)));

    return { keyCount: channel?.keys.length ?? 0, keyTs, angle, renderCallsAfterScrub: renderCalls, pivotAngleAfterScrub };
  }, duration);

  console.log(
    `[E2E] step4 turntable: keyCount=${step4.keyCount} keyTs=${JSON.stringify(step4.keyTs)} ` +
      `angle=${step4.angle} diffFromPi=${Math.abs(step4.angle - Math.PI)} ` +
      `pivotAngleAfterScrub=${step4.pivotAngleAfterScrub}`,
  );
  expect(step4.keyCount).toBe(3);
  expect(step4.keyTs).toEqual([0, duration / 2, duration]);
  expect(Math.abs(step4.angle - Math.PI)).toBeLessThanOrEqual(1e-6);
  expect(step4.renderCallsAfterScrub).toBeGreaterThanOrEqual(1);
  expect(Math.abs(step4.pivotAngleAfterScrub - Math.PI)).toBeLessThanOrEqual(1e-6);

  // -------------------------------------------------------------- Step 5 — Export (S4 -> S1)
  const step5 = await page.evaluate(async (duration) => {
    const studio = (window as any).__e2e_studio;
    const timeline = (window as any).__e2e_timeline;

    const frames = timeline.exportRange(duration, 24);
    const tMismatches = frames.filter((f: any, i: number) => f.t !== (i * duration) / 24).length;

    studio.setView(0);
    let progressCalls = 0;
    const zipBlob = await studio.exportSequence("1024x1024", 24, () => {
      progressCalls++;
    });
    const zipArrayBuffer = await zipBlob.arrayBuffer();

    function bufferToBase64(buf: ArrayBuffer): string {
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      return btoa(binary);
    }

    return {
      framesLength: frames.length,
      tMismatches,
      zipByteLength: zipArrayBuffer.byteLength,
      zipB64: bufferToBase64(zipArrayBuffer),
      progressCalls,
    };
  }, duration);

  console.log(
    `[E2E] step5 export: framesLength=${step5.framesLength} tMismatches=${step5.tMismatches} ` +
      `zipBytes=${step5.zipByteLength} progressCalls=${step5.progressCalls}`,
  );
  expect(step5.framesLength).toBe(24);
  expect(step5.tMismatches).toBe(0);
  expect(step5.zipByteLength).toBeGreaterThan(0);

  // -------------------------------------------------------------- Step 6 — Assert (Node-side ZIP oracle)
  const zipBuf = Buffer.from(step5.zipB64, "base64");
  const entries = parseZipStore(zipBuf);
  const expectedNames = Array.from({ length: 24 }, (_, i) => `frame_${String(i + 1).padStart(4, "0")}.png`);
  const actualNames = entries.map((e) => e.name);

  let allCorrectSize = true;
  const dims: string[] = [];
  for (const entry of entries) {
    const { width, height } = pngSize(entry.data);
    dims.push(`${width}x${height}`);
    if (width !== 1024 || height !== 1024) allCorrectSize = false;
  }

  console.log(
    `[E2E] step6 assert: entries=${entries.length} namesMatch=${JSON.stringify(actualNames) === JSON.stringify(expectedNames)} ` +
      `firstDim=${dims[0]} lastDim=${dims[dims.length - 1]} allCorrectSize=${allCorrectSize}`,
  );
  expect(entries.length).toBe(24);
  expect(actualNames).toEqual(expectedNames);
  expect(allCorrectSize).toBe(true);

  // -------------------------------------------------------------- summary
  console.log(
    `[E2E] SUMMARY loadMs=${step1.loadMs.toFixed(1)} pickedAssetId=${step2.pickedAssetId} ` +
      `lightDelta=${step3.lightCountDelta} turntableAngle=${step4.angle} ` +
      `exportFrames=${step5.framesLength} zipEntries=${entries.length} allFrames1024=${allCorrectSize}`,
  );
});

// ---------------------------------------------------------------------------------------------
// Regression test — the Warden's Wave-3 finding: the real app shell (src/app/main.ts, driven by
// index.html, NOT the isolated dynamic-imported modules the test above builds its own studio
// from) left #viewport-hint reading a static "Loading studio…" forever, even after the studio had
// finished booting and was actively rendering. None of the 40 silo tests nor the SCOPE.md §6 test
// above could have caught this — every one of them drives the frozen module interfaces directly
// in an isolated page.evaluate studio instance (matching tests/s1..s6.spec.ts's own pattern), and
// none of them ever loads the real page through <script src="/src/app/main.ts"> and inspects what
// it actually renders. This test does exactly that: real navigation, real DOM, real click.
test("E2E regression — real app shell: #viewport-hint reflects actual ready/loaded state", async ({
  page,
}) => {
  test.setTimeout(30_000);
  page.on("pageerror", (err) => console.log("[e2e pageerror]", err.message));

  await page.goto("/");
  // main.ts runs synchronously on load; give Vite's dependency pre-bundle (already warmed by the
  // test above, if it ran first) a brief settle window before reading DOM state.
  await page.waitForTimeout(500);

  const hint = page.locator("#viewport-hint");

  async function readHint() {
    return hint.evaluate((el: HTMLElement) => ({
      hidden: el.hidden,
      state: el.dataset.state ?? null,
      text: el.textContent ?? "",
    }));
  }

  const beforeLoad = await readHint();
  console.log(
    `[E2E] hint before any model load: hidden=${beforeLoad.hidden} state=${beforeLoad.state} text="${beforeLoad.text}"`,
  );
  // The bug: this stayed hidden=false, text="Loading studio…" forever, regardless of the studio
  // being ready. The fix: once ready with nothing loaded, it must NOT be the stale "loading" copy.
  expect(beforeLoad.hidden).toBe(false);
  expect(beforeLoad.text.toLowerCase()).not.toContain("loading studio");
  expect(beforeLoad.state).toBe("idle");

  // Drive a real library tile click through the real rendered DOM (not a synthetic studio).
  await page.waitForSelector("#panel-library .library-panel__tile", { timeout: 15_000 });
  await page.locator("#panel-library .library-panel__tile").first().click();

  // Wait for the real onAssetPicked -> studio.loadModel(...) round trip to resolve and the hint
  // to reflect "loaded" (hidden), polling rather than a fixed sleep.
  await expect(hint).toBeHidden({ timeout: 10_000 });
  const afterLoad = await readHint();
  console.log(
    `[E2E] hint after a real library pick loads a model: hidden=${afterLoad.hidden} state=${afterLoad.state}`,
  );
  expect(afterLoad.hidden).toBe(true);
  expect(afterLoad.state).toBe("loaded");
});
