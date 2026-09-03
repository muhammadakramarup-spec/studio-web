// tests/s1.spec.ts — S1 Viewer core acceptance suite.
// Ownership: S1 owns this file only (SCOPE.md / DECISIONS.md #20).
// Numbers here feed src/viewer/qa/latest.md verbatim — every assertion below
// prints or returns the measured number it checks, per the lock-rule-2
// "a row with no measured number is a FAIL" requirement.
//
// Test models: C:\3D-Studio\02_projects\furnishow-360\meshes — a private
// client's files, test input only, never copied into this repo (CONTEXT.lock.md).
// Loaded the safe way: read bytes in this Node process, hand them to the page
// as a Blob (base64 round trip), per the S1-dev prompt's own template.

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Headless Chromium falls back to the SwiftShader software rasterizer by
// default, which cannot sustain 30fps for this scene (2048x2048 PCF soft
// shadows + MSAA + preserveDrawingBuffer). The GTX 1650 target hardware has
// a real GPU, so route this file's browser through ANGLE's D3D11 backend
// (Windows) instead of accepting a software-rendering fps ceiling as reality.
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
const PRIMARY_MODEL = "coffee-table-10.glb";

// Ten real (non-underscore-prefixed, non-.part) furniture files spanning the
// five product categories, used for both the framing check (Target 2) and the
// metallicFactor hint check (Target 6).
const SAMPLE_10 = [
  "coffee-table-10.glb",
  "coffee-table-15.glb",
  "console-11.glb",
  "console-6.glb",
  "credenza-10.glb",
  "credenza-9.glb",
  "dining-table-10.glb",
  "foyer-table-11.glb",
  "tv-console-14.glb",
  "end-tables-11.glb",
];

function readModelB64(fileName: string): string {
  return fs.readFileSync(path.join(MESHES_DIR, fileName)).toString("base64");
}

// Vite's dev server discovers three/addons/... as new dependencies to
// pre-bundle the first time studio.ts is imported in a fresh page, and pushes
// a full-reload over its HMR socket once that finishes — which destroys the
// execution context mid-test if it lands after real setup has run. Force the
// discovery+reload to happen here, on a throwaway import, before any test
// creates state on window that a reload would wipe out.
async function warmVite(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  try {
    await page.evaluate(async () => {
      await import("/src/viewer/studio.ts");
    });
  } catch {
    /* a reload here is exactly what this warm-up is for */
  }
  await page.waitForTimeout(800);
  await page.goto("/"); // land on a guaranteed-settled page before the real test
}

// ---------------------------------------------------------------- GLB parsing
// Independent oracle for Target 6 (metallicFactor hint): reads the GLB binary
// container directly and pulls pbrMetallicRoughness straight out of the JSON
// chunk. Deliberately does not import or reuse any src/viewer code, so this
// cannot become circular the way the S4 scrub check the review flagged was.
function parseGlbMaterials(buf: Buffer): { metallicFactor: number; hasMRTexture: boolean; name: string }[] {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a glb (bad magic)");
  const totalLength = buf.readUInt32LE(8);
  let offset = 12;
  let jsonChunk: Buffer | null = null;
  while (offset < totalLength) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const chunkData = buf.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) {
      jsonChunk = chunkData;
      break;
    }
    offset += 8 + chunkLength;
  }
  if (!jsonChunk) throw new Error("no JSON chunk in GLB");
  const json = JSON.parse(jsonChunk.toString("utf8"));
  const materials = json.materials ?? [];
  return materials.map((m: any, i: number) => {
    const pbr = m.pbrMetallicRoughness ?? {};
    const metallicFactor = pbr.metallicFactor === undefined ? 1.0 : pbr.metallicFactor;
    const hasMRTexture = !!pbr.metallicRoughnessTexture;
    return { metallicFactor, hasMRTexture, name: m.name ?? `material_${i}` };
  });
}

function handCountFlagged(materials: { metallicFactor: number; hasMRTexture: boolean }[]): number {
  return materials.filter((m) => m.metallicFactor > 0.9 && !m.hasMRTexture).length;
}

// ------------------------------------------------------------------ ZIP/PNG parsing
// Independent, dependency-free readers for verifying exportSequence()'s output
// (STORE-only ZIP per src/viewer/zip.ts's own format) without importing that
// module — this Node-side check must not just re-run the code under test.
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

// --------------------------------------------------------------------- HDR fixture
// S3's HDRI fetch (DECISIONS.md #7/#15) is a parallel silo's deliverable and
// nothing is on disk from it yet at the time this suite runs. To measure S1's
// own HDR code path (Target 3: fromEquirectangular, not fromScene) honestly,
// this fetches one CC0 Poly Haven HDRI — the same file the reference names,
// reference/lamp360viewer.html:381 (ph_studio_small_09) — to an OS temp
// cache, never into this repo. Test input only, exactly like the GLB files.
const HDR_URL = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr";
const HDR_CACHE = path.join(os.tmpdir(), "studio-web-s1-fixtures", "studio_small_09_1k.hdr");

async function ensureHDR(): Promise<Buffer | null> {
  try {
    if (fs.existsSync(HDR_CACHE)) return fs.readFileSync(HDR_CACHE);
    const res = await fetch(HDR_URL);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(HDR_CACHE), { recursive: true });
    fs.writeFileSync(HDR_CACHE, buf);
    return buf;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------- Target 1

test("Target 1 — load + ready + fps", async ({ page }) => {
  test.setTimeout(30_000);
  page.on("console", (msg) => console.log("[console]", msg.type(), msg.text()));
  page.on("pageerror", (err) => console.log("[pageerror]", err.message));
  page.on("crash", () => console.log("[crash]"));
  await warmVite(page);
  const b64 = readModelB64(PRIMARY_MODEL);

  const result = await page.evaluate(async (modelB64) => {
    const m = await import("/src/viewer/studio.ts");
    const canvas = document.getElementById("viewport") as HTMLCanvasElement;
    const studio = m.createStudio({ canvas });
    (window as any).__studio = studio;

    const bytes = Uint8Array.from(atob(modelB64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "model/gltf-binary" });

    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    let renderer = "unknown";
    if (gl) {
      const dbg = (gl as WebGL2RenderingContext).getExtension("WEBGL_debug_renderer_info");
      if (dbg) renderer = (gl as any).getParameter(dbg.UNMASKED_RENDERER_WEBGL);
    }
    const canvasSize = { w: canvas.clientWidth, h: canvas.clientHeight, cw: canvas.width, ch: canvas.height };

    const t0 = performance.now();
    await studio.loadModel(blob, "coffee-table-10.glb");
    const loadMs = performance.now() - t0;
    const readyAfterLoad = studio.debug.ready();

    // 5s fps sample, matching reference/lamp360viewer.html:1268-1274's window.
    await new Promise((r) => setTimeout(r, 5000));
    const fps = (studio.debug.state() as any).fps as number;

    return { loadMs, readyAfterLoad, fps, renderer, canvasSize };
  }, b64);

  console.log(`[S1 T1] loadMs=${result.loadMs.toFixed(1)} readyAfterLoad=${result.readyAfterLoad} fps=${result.fps} renderer=${result.renderer} canvasSize=${JSON.stringify(result.canvasSize)}`);
  expect(result.readyAfterLoad).toBe(true);
  expect(result.loadMs).toBeLessThan(3000);
  expect(result.fps).toBeGreaterThanOrEqual(30);
});

// --------------------------------------------------------------- Target 2 & 6
// Combined: both use the same 10-file sample and both need an active model
// loaded, so they share one page/studio instance across the 10 files rather
// than reloading the page 10 times.

test("Target 2 & 6 — framing (10 files x5 views) + metallicFactor hint + de-metal", async ({ page }) => {
  test.setTimeout(240_000);
  page.on("console", (msg) => console.log("[console]", msg.type(), msg.text()));
  page.on("pageerror", (err) => console.log("[pageerror]", err.message));
  page.on("crash", () => console.log("[crash]"));
  await warmVite(page);
  await page.evaluate(async () => {
    const m = await import("/src/viewer/studio.ts");
    const canvas = document.getElementById("viewport") as HTMLCanvasElement;
    canvas.style.width = "800px";
    canvas.style.height = "600px";
    const studio = m.createStudio({ canvas });
    studio.resize();
    (window as any).__studio = studio;
  });

  const framingRows: { file: string; view: string; frac: number; pass: boolean }[] = [];
  const metallicRows: { file: string; handCount: number; flaggedCount: number; pass: boolean }[] = [];
  const deMetalRows: { file: string; movedPct: number; pass: boolean }[] = [];

  for (const file of SAMPLE_10) {
    const buf = fs.readFileSync(path.join(MESHES_DIR, file));
    const handMaterials = parseGlbMaterials(buf);
    const handCount = handCountFlagged(handMaterials);
    const b64 = buf.toString("base64");

    const perFile = await page.evaluate(
      async ({ b64, name }) => {
        const studio = (window as any).__studio;
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes]);
        await studio.loadModel(blob, name);
        studio.setFocalLength(50);

        function capture(px: number): Uint8ClampedArray {
          const c = document.createElement("canvas");
          c.width = px;
          c.height = px;
          const g = c.getContext("2d")!;
          g.clearRect(0, 0, px, px);
          g.drawImage(studio.renderer.domElement, 0, 0, px, px);
          return g.getImageData(0, 0, px, px).data;
        }
        function movedPct(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
          let moved = 0;
          const n = a.length / 4;
          for (let i = 0; i < n; i++) {
            const o = i * 4;
            const d = Math.max(Math.abs(a[o] - b[o]), Math.abs(a[o + 1] - b[o + 1]), Math.abs(a[o + 2] - b[o + 2]));
            if (d > 2) moved++;
          }
          return (moved / n) * 100;
        }

        // Target 2: framing, isolated via transparent + shadows-off so only
        // the model silhouette contributes non-zero alpha.
        studio.setTransparent(true);
        studio.setShadows(false);
        const views: (number | "top")[] = [0, 90, 180, 270, "top"];
        const fractions: Record<string, number> = {};
        const px = 300;
        for (const v of views) {
          studio.setView(v);
          studio.debug.renderOnce();
          const data = capture(px);
          let minY = -1;
          let maxY = -1;
          for (let y = 0; y < px; y++) {
            let rowHas = false;
            for (let x = 0; x < px; x++) {
              if (data[(y * px + x) * 4 + 3] > 10) {
                rowHas = true;
                break;
              }
            }
            if (rowHas) {
              if (minY < 0) minY = y;
              maxY = y;
            }
          }
          fractions[String(v)] = minY < 0 ? 0 : (maxY - minY + 1) / px;
        }
        studio.setShadows(true);
        studio.setTransparent(false);

        // Target 6: metallicFactor hint + de-metal.
        const matInfo = studio.debug.matInfo();
        const flaggedCount = matInfo.filter((m: any) => m.metallicFactorFlagged).length;

        let deMetalMovedPct: number | null = null;
        if (flaggedCount > 0) {
          studio.setView(0);
          studio.debug.renderOnce();
          const before = capture(200);
          studio.demetalizeActive();
          studio.debug.renderOnce();
          const after = capture(200);
          deMetalMovedPct = movedPct(before, after);
        }

        return { fractions, flaggedCount, deMetalMovedPct };
      },
      { b64, name: file },
    );

    for (const v of [0, 90, 180, 270, "top"]) {
      const frac = perFile.fractions[String(v)];
      const pass = frac >= 0.55 && frac <= 0.8;
      framingRows.push({ file, view: String(v), frac, pass });
    }
    const metalPass = perFile.flaggedCount >= handCount; // 0 false negatives
    metallicRows.push({ file, handCount, flaggedCount: perFile.flaggedCount, pass: metalPass });
    if (perFile.deMetalMovedPct !== null) {
      deMetalRows.push({ file, movedPct: perFile.deMetalMovedPct, pass: perFile.deMetalMovedPct >= 0.5 });
    }
  }

  const framingFails = new Set(framingRows.filter((r) => !r.pass).map((r) => r.file));
  console.log(
    `[S1 T2] files=${SAMPLE_10.length} views=5 each; frame fractions:\n` +
      framingRows.map((r) => `  ${r.file} view=${r.view} frac=${(r.frac * 100).toFixed(1)}% ${r.pass ? "PASS" : "FAIL"}`).join("\n"),
  );
  console.log(`[S1 T2] files with >=1 failing view: ${framingFails.size}/${SAMPLE_10.length}`);

  console.log(
    `[S1 T6] metallic hint:\n` +
      metallicRows
        .map((r) => `  ${r.file} hand=${r.handCount} flagged=${r.flaggedCount} ${r.pass ? "PASS" : "FAIL"}`)
        .join("\n"),
  );
  const metalFails = metallicRows.filter((r) => !r.pass);
  console.log(`[S1 T6] false negatives: ${metalFails.length}/${SAMPLE_10.length}`);

  console.log(
    `[S1 T6] de-metal pixel diff (files where flag fired):\n` +
      deMetalRows.map((r) => `  ${r.file} moved=${r.movedPct.toFixed(2)}% ${r.pass ? "PASS" : "FAIL"}`).join("\n"),
  );

  expect(framingFails.size).toBe(0);
  expect(metalFails.length).toBe(0);
  expect(deMetalRows.length).toBeGreaterThan(0); // at least one file exercised the action
  for (const r of deMetalRows) expect(r.movedPct).toBeGreaterThanOrEqual(0.5);
});

// ------------------------------------------------------------------- Target 3

test("Target 3 — environment switch + rotation + PMREM timing + HDR path", async ({ page }) => {
  test.setTimeout(60_000);
  page.on("pageerror", (err) => console.log("[pageerror]", err.message));

  // Static check: the HDR branch must call pmrem.fromEquirectangular, never
  // pmrem.fromScene (reviews/codex_review_S1.md:25). Read the source directly
  // rather than trusting behaviour alone, since a scene-based HDR render could
  // coincidentally look "different enough" to pass the pixel checks below.
  const src = fs.readFileSync(path.join(process.cwd(), "src", "viewer", "studio.ts"), "utf8");
  const hdrBranchMatch = src.match(/if \(envKind === "hdr"\) \{([\s\S]*?)\} else \{/);
  const hdrBranch = hdrBranchMatch ? hdrBranchMatch[1] : "";
  const usesFromEquirectangular = /pmrem\.fromEquirectangular/.test(hdrBranch);
  const hdrBranchUsesFromScene = /pmrem\.fromScene/.test(hdrBranch);
  console.log(`[S1 T3] source check: hdr branch uses fromEquirectangular=${usesFromEquirectangular} uses fromScene=${hdrBranchUsesFromScene}`);
  expect(usesFromEquirectangular).toBe(true);
  expect(hdrBranchUsesFromScene).toBe(false);

  await warmVite(page);
  const modelB64 = readModelB64(PRIMARY_MODEL);
  const hdrBuf = await ensureHDR();
  const hdrB64 = hdrBuf ? hdrBuf.toString("base64") : null;
  console.log(`[S1 T3] HDR fixture available: ${!!hdrBuf}${hdrBuf ? ` (${hdrBuf.length} bytes)` : " — network fetch failed, HDR sub-checks will be skipped"}`);

  const result = await page.evaluate(
    async ({ modelB64, hdrB64 }) => {
      const m = await import("/src/viewer/studio.ts");
      const canvas = document.getElementById("viewport") as HTMLCanvasElement;
      canvas.style.width = "800px";
      canvas.style.height = "600px";
      const studio = m.createStudio({ canvas });
      studio.resize();
      const bytes = Uint8Array.from(atob(modelB64), (c) => c.charCodeAt(0));
      await studio.loadModel(new Blob([bytes]), "coffee-table-10.glb");
      studio.setView(0);

      function capture(px = 200): Uint8ClampedArray {
        const c = document.createElement("canvas");
        c.width = px;
        c.height = px;
        const g = c.getContext("2d")!;
        g.drawImage(studio.renderer.domElement, 0, 0, px, px);
        return g.getImageData(0, 0, px, px).data;
      }
      function movedPct(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
        let moved = 0;
        const n = a.length / 4;
        for (let i = 0; i < n; i++) {
          const o = i * 4;
          const d = Math.max(Math.abs(a[o] - b[o]), Math.abs(a[o + 1] - b[o + 1]), Math.abs(a[o + 2] - b[o + 2]));
          if (d > 2) moved++;
        }
        return (moved / n) * 100;
      }

      studio.setEnvironment("room");
      studio.debug.renderOnce();
      const room = capture();

      studio.setEnvironment("studio");
      studio.debug.renderOnce();
      const studioImg = capture();
      const roomToStudioMoved = movedPct(room, studioImg);

      studio.setEnvRotation(0);
      studio.debug.renderOnce();
      const rot0 = capture();
      studio.setEnvRotation(140);
      studio.debug.renderOnce();
      const rot140 = capture();
      const rotationMoved = movedPct(rot0, rot140);

      // isolate a single fromScene rebuild's timing (procedural studio env)
      studio.setEnvironment("room");
      const t0 = performance.now();
      studio.setEnvironment("studio");
      const pmremSceneMs = performance.now() - t0;

      let hdrLoadedOk = false;
      let pmremHdrMs: number | null = null;
      let hdrVsStudioMoved: number | null = null;
      if (hdrB64) {
        const hdrBytes = Uint8Array.from(atob(hdrB64), (c) => c.charCodeAt(0));
        await studio.loadEnvironment(new Blob([hdrBytes]), "studio_small_09_1k");
        hdrLoadedOk = true;
        studio.debug.renderOnce();
        const hdrImg = capture();
        hdrVsStudioMoved = movedPct(studioImg, hdrImg);

        // isolate a single fromEquirectangular rebuild's timing (texture already cached)
        studio.setEnvironment("room");
        const t1 = performance.now();
        studio.setEnvironment("hdr");
        pmremHdrMs = performance.now() - t1;
      }

      return { roomToStudioMoved, rotationMoved, pmremSceneMs, hdrLoadedOk, pmremHdrMs, hdrVsStudioMoved };
    },
    { modelB64, hdrB64 },
  );

  console.log(
    `[S1 T3] room->studio moved=${result.roomToStudioMoved.toFixed(2)}% rotation0->140 moved=${result.rotationMoved.toFixed(2)}% ` +
      `pmremSceneMs=${result.pmremSceneMs.toFixed(2)} hdrLoaded=${result.hdrLoadedOk} pmremHdrMs=${result.pmremHdrMs?.toFixed(2) ?? "n/a"} ` +
      `hdrVsStudioMoved=${result.hdrVsStudioMoved?.toFixed(2) ?? "n/a"}%`,
  );

  expect(result.roomToStudioMoved).toBeGreaterThanOrEqual(0.5);
  expect(result.rotationMoved).toBeGreaterThanOrEqual(0.5);
  expect(result.pmremSceneMs).toBeLessThan(250);
  if (hdrBuf) {
    expect(result.hdrLoadedOk).toBe(true);
    expect(result.pmremHdrMs).not.toBeNull();
    expect(result.pmremHdrMs!).toBeLessThan(250);
    expect(result.hdrVsStudioMoved).toBeGreaterThanOrEqual(0.5);
  }
});

// ------------------------------------------------------------------- Target 4

test("Target 4 — shadow catcher / transparent export", async ({ page }) => {
  test.setTimeout(60_000);
  page.on("pageerror", (err) => console.log("[pageerror]", err.message));
  await warmVite(page);
  const modelB64 = readModelB64(PRIMARY_MODEL);

  const result = await page.evaluate(async (modelB64) => {
    const m = await import("/src/viewer/studio.ts");
    const canvas = document.getElementById("viewport") as HTMLCanvasElement;
    canvas.style.width = "800px";
    canvas.style.height = "600px";
    const studio = m.createStudio({ canvas });
    studio.resize();
    const bytes = Uint8Array.from(atob(modelB64), (c) => c.charCodeAt(0));
    await studio.loadModel(new Blob([bytes]), "coffee-table-10.glb");
    studio.setView(0);
    studio.setTransparent(true);

    async function exportAlpha(): Promise<Uint8ClampedArray> {
      const blob = await studio.exportPNG("1024x1024");
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const g = c.getContext("2d")!;
      g.drawImage(bmp, 0, 0);
      return g.getImageData(0, 0, c.width, c.height).data;
    }

    studio.setShadows(true);
    const onData = await exportAlpha();
    studio.setShadows(false);
    const offData = await exportAlpha();
    studio.setShadows(true);

    const n = onData.length / 4;
    let alphaZero = 0;
    let alpha255 = 0;
    for (let i = 0; i < n; i++) {
      const a = onData[i * 4 + 3];
      if (a === 0) alphaZero++;
      if (a === 255) alpha255++;
    }

    // opaque-model mask: pixels opaque in BOTH shadows-on and shadows-off
    // renders are the model itself (shadows don't change the model's own
    // coverage, only the floor's). Everything outside that mask is where the
    // shadow catcher should be doing its work.
    let outsideMaskChanged = 0;
    let outsideMaskTotal = 0;
    for (let i = 0; i < n; i++) {
      const aOn = onData[i * 4 + 3];
      const aOff = offData[i * 4 + 3];
      const isModelMask = aOn === 255 && aOff === 255;
      if (isModelMask) continue;
      outsideMaskTotal++;
      if (Math.abs(aOn - aOff) > 2) outsideMaskChanged++;
    }

    return {
      alphaZeroPct: (alphaZero / n) * 100,
      alpha255Pct: (alpha255 / n) * 100,
      outsideMaskChangedPct: (outsideMaskChanged / n) * 100,
      outsideMaskTotal,
      totalPixels: n,
    };
  }, modelB64);

  console.log(
    `[S1 T4] alpha==0: ${result.alphaZeroPct.toFixed(2)}% alpha==255: ${result.alpha255Pct.toFixed(2)}% ` +
      `shadow-toggle change outside opaque mask: ${result.outsideMaskChangedPct.toFixed(2)}% (of ${result.totalPixels} px, ${result.outsideMaskTotal} outside mask)`,
  );

  expect(result.alphaZeroPct).toBeGreaterThanOrEqual(20);
  expect(result.alpha255Pct).toBeGreaterThanOrEqual(1);
  expect(result.outsideMaskChangedPct).toBeGreaterThanOrEqual(0.5);
});

// ------------------------------------------------------------------- Target 5

test("Target 5 — PNG export dims + 24-frame 1024x1024 ZIP turntable + exportWebM contract", async ({ page }) => {
  test.setTimeout(60_000);
  page.on("pageerror", (err) => console.log("[pageerror]", err.message));
  await warmVite(page);
  const modelB64 = readModelB64(PRIMARY_MODEL);

  const result = await page.evaluate(async (modelB64) => {
    const m = await import("/src/viewer/studio.ts");
    const canvas = document.getElementById("viewport") as HTMLCanvasElement;
    canvas.style.width = "800px";
    canvas.style.height = "600px";
    const studio = m.createStudio({ canvas });
    studio.resize();
    const bytes = Uint8Array.from(atob(modelB64), (c) => c.charCodeAt(0));
    await studio.loadModel(new Blob([bytes]), "coffee-table-10.glb");
    studio.setView(0);

    const pngBlob = await studio.exportPNG("2048x2048");
    const pngBmp = await createImageBitmap(pngBlob);
    const pngDims = { w: pngBmp.width, h: pngBmp.height };

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
    const zipB64 = bufferToBase64(zipArrayBuffer);

    let webmThrew = false;
    let webmIsNull = true;
    let webmBytes = 0;
    let webmResult: string = "n/a";
    try {
      const webm = await studio.exportWebM("1024x1024", 24, 24);
      webmIsNull = webm === null;
      webmBytes = webm === null ? 0 : webm.size;
      webmResult = webm === null ? "null" : `Blob(${webm.size}B)`;
    } catch (e) {
      webmThrew = true;
      webmResult = String(e);
    }

    return { pngDims, zipB64, zipByteLength: zipArrayBuffer.byteLength, progressCalls, webmThrew, webmIsNull, webmBytes, webmResult };
  }, modelB64);

  console.log(`[S1 T5] PNG dims: ${result.pngDims.w}x${result.pngDims.h}`);
  expect(result.pngDims).toEqual({ w: 2048, h: 2048 });

  const zipBuf = Buffer.from(result.zipB64, "base64");
  const entries = parseZipStore(zipBuf);
  console.log(`[S1 T5] ZIP entries: ${entries.length} (${result.zipByteLength} bytes, progress callbacks: ${result.progressCalls})`);
  expect(entries.length).toBe(24);

  const expectedNames = Array.from({ length: 24 }, (_, i) => `frame_${String(i + 1).padStart(4, "0")}.png`);
  const actualNames = entries.map((e) => e.name);
  expect(actualNames).toEqual(expectedNames);

  const dimsReport: string[] = [];
  let allCorrectSize = true;
  for (const entry of entries) {
    const { width, height } = pngSize(entry.data);
    dimsReport.push(`${entry.name}=${width}x${height}`);
    if (width !== 1024 || height !== 1024) allCorrectSize = false;
  }
  console.log(`[S1 T5] ZIP frame dims: ${dimsReport[0]} ... ${dimsReport[dimsReport.length - 1]} (all24 correct=${allCorrectSize})`);
  expect(allCorrectSize).toBe(true);

  // exportWebM: stretch target (DECISIONS.md #12 / SCOPE.md §1). The honest
  // contract per the Warden's review: resolves, never throws, and returns
  // EITHER null (nothing produced) OR a Blob that has actually passed
  // studio.ts's own frame-completeness gate (>=3 timeslice chunks, size >=
  // max(20000, frames*3000) bytes for a 24-frame request = 72000 bytes) — an
  // unverified small Blob (the 110-byte clip seen before this fix) must
  // never come back as a "successful" export.
  const WEBM_MIN_BYTES = Math.max(20_000, 24 * 3_000); // mirrors studio.ts's own gate for a 24-frame request
  console.log(
    `[S1 T5] exportWebM: threw=${result.webmThrew} result=${result.webmResult} ` +
      `gate=${result.webmIsNull ? "null (nothing produced)" : `Blob ${result.webmBytes}B vs floor ${WEBM_MIN_BYTES}B`}`,
  );
  expect(result.webmThrew).toBe(false);
  expect(result.webmIsNull || result.webmBytes >= WEBM_MIN_BYTES).toBe(true);
});

// --------------------------------------------------------------- setRenderHook
// Not itself a row in SCOPE.md's numeric commitment table, but named as the
// single interface every other silo blocks on (DECISIONS.md #12, "S1 gains a
// render-loop seam"), so it gets its own measured check rather than trust.

test("setRenderHook — render-loop seam", async ({ page }) => {
  test.setTimeout(30_000);
  page.on("pageerror", (err) => console.log("[pageerror]", err.message));
  await warmVite(page);

  const result = await page.evaluate(async () => {
    const m = await import("/src/viewer/studio.ts");
    const canvas = document.getElementById("viewport") as HTMLCanvasElement;
    const studio = m.createStudio({ canvas });

    let hookCalls = 0;
    let defaultRendersObserved = 0;
    const origRender = studio.renderer.render.bind(studio.renderer);
    (studio.renderer as unknown as { render: typeof origRender }).render = (scene, camera) => {
      defaultRendersObserved++;
      return origRender(scene, camera);
    };

    studio.setRenderHook((dt: number) => {
      hookCalls++;
      void dt;
      // deliberately does NOT call renderer.render — proves the default path is bypassed
    });
    await new Promise((r) => setTimeout(r, 300));
    const rendersWhileHooked = defaultRendersObserved;

    studio.setRenderHook(null);
    defaultRendersObserved = 0;
    await new Promise((r) => setTimeout(r, 300));
    const rendersAfterNull = defaultRendersObserved;

    return { hookCalls, rendersWhileHooked, rendersAfterNull };
  });

  console.log(
    `[S1 renderHook] hookCalls(300ms)=${result.hookCalls} defaultRenders-while-hooked=${result.rendersWhileHooked} ` +
      `defaultRenders-after-null(300ms)=${result.rendersAfterNull}`,
  );
  expect(result.hookCalls).toBeGreaterThanOrEqual(5);
  expect(result.rendersWhileHooked).toBe(0);
  expect(result.rendersAfterNull).toBeGreaterThanOrEqual(5);
});
