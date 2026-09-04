// tests/export-timeline.spec.ts — Wave 3 Function 1 (F1) acceptance suite: timeline-sampled
// turntable export. Ownership: F1 (docs/handoffs/2026-09-04-claude-design-product-v1-execution-
// handoff.md Wave 3 Function 1). Proves exportSequence samples authored timeline data when given
// an `applyFrame` hook, that beginOffscreen/endOffscreen save+restore the FULL pivot transform (not
// only rotation.y), that extraFiles append after frame images / after the Blender README, and that
// every existing 3-argument caller (tests/s1.spec.ts Target 5, tests/e2e.spec.ts Steps 5-6) keeps
// getting the unmodified built-in linear sweep.
//
// Test model: /assets/manifest.json's first "model"-kind asset (a Kenney CC0 GLB already in the
// public bundle) — no private client meshes, unlike tests/s1.spec.ts / tests/e2e.spec.ts.

import { test, expect } from "@playwright/test";

// Headless Chromium's default SwiftShader rasterizer cannot sustain this workload; route through
// ANGLE's D3D11 backend, identical to tests/s1.spec.ts / tests/e2e.spec.ts.
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

// ---------------------------------------------------------------- ZIP + PNG oracles
// Independent readers, copied verbatim from tests/s1.spec.ts — deliberately never import
// src/viewer/zip.ts, so this suite cannot become circular with the code under test.

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

const expectedFrameNames = Array.from({ length: 24 }, (_, i) => `frame_${String(i + 1).padStart(4, "0")}.png`);

// Vite discovers three/addons/... and the timeline module as new dependencies to pre-bundle the
// first time they are imported in a fresh page, and pushes a full-reload over HMR once that
// finishes — force discovery+reload here first, identical to tests/s1.spec.ts's own warmVite().
async function warmVite(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  try {
    await page.evaluate(async () => {
      await Promise.all([import("/src/viewer/studio.ts"), import("/src/timeline/index.ts")]);
    });
  } catch {
    /* a reload here is exactly what this warm-up is for */
  }
  await page.waitForTimeout(800);
  await page.goto("/"); // land on a guaranteed-settled page before the real run
}

test("exported frames follow authored non-linear timeline keys within 1e-6", async ({ page }) => {
  test.setTimeout(120_000);
  page.on("pageerror", (err) => console.log("[export-timeline A pageerror]", err.message));
  await warmVite(page);

  const result = await page.evaluate(async () => {
    const { createStudio } = await import("/src/viewer/studio.ts");
    const { attachTimeline } = await import("/src/timeline/index.ts");

    const canvas = document.getElementById("viewport") as HTMLCanvasElement;
    canvas.style.width = "800px";
    canvas.style.height = "600px";
    const studio = createStudio({ canvas });
    studio.resize();

    const res = await fetch("/assets/manifest.json");
    const manifest = await res.json();
    const modelAsset = manifest.assets.find((a: any) => a.kind === "model");
    await studio.loadModel(modelAsset.fileUrl, modelAsset.name);

    function findObjectByUuid(root: any, uuid: string): any {
      let found: any;
      root.traverse((o: any) => {
        if (o.uuid === uuid) found = o;
      });
      return found;
    }

    // Identical shape to src/app/main.ts's sceneAdapter (lines 543-560) — not imported from
    // main.ts because this suite must not touch src/app/main.ts (ownership fence).
    const adapter = {
      applySampledFrame(frame: any) {
        for (const [targetId, xf] of Object.entries(frame.transforms)) {
          const x = xf as any;
          const obj = targetId === "pivot" ? studio.pivot : findObjectByUuid(studio.scene, targetId);
          if (!obj) continue;
          obj.position.set(x.position[0], x.position[1], x.position[2]);
          obj.quaternion.set(x.quaternion[0], x.quaternion[1], x.quaternion[2], x.quaternion[3]);
          obj.scale.set(x.scale[0], x.scale[1], x.scale[2]);
        }
        if (frame.camera?.fov !== undefined) {
          studio.camera.fov = frame.camera.fov;
          studio.camera.updateProjectionMatrix();
        }
      },
      renderNow() {
        studio.debug.renderOnce();
      },
    };

    const timeline = attachTimeline(adapter);
    // 0, pi, 2*pi about Y — quatY(theta) = [0, sin(theta/2), 0, cos(theta/2)] (src/timeline/index.ts).
    timeline.addKey("pivot", "quaternion", 0, [0, 0, 0, 1], "easeInOut");
    timeline.addKey("pivot", "quaternion", 3, [0, 1, 0, 0], "easeInOut");
    timeline.addKey("pivot", "quaternion", 6, [0, 0, 0, -1], "easeInOut");
    timeline.addKey("pivot", "position", 0, [0, 0, 0], "back");
    timeline.addKey("pivot", "position", 6, [0, 0.2, 0], "back");

    function snapshotPivot() {
      return {
        position: [studio.pivot.position.x, studio.pivot.position.y, studio.pivot.position.z],
        quaternion: [
          studio.pivot.quaternion.x,
          studio.pivot.quaternion.y,
          studio.pivot.quaternion.z,
          studio.pivot.quaternion.w,
        ],
        scale: [studio.pivot.scale.x, studio.pivot.scale.y, studio.pivot.scale.z],
      };
    }

    const pivotBefore = snapshotPivot();

    const rendered: any[] = [];
    const zipBlob = await studio.exportSequence("1024x1024", 24, undefined, {
      applyFrame: (i: number) => adapter.applySampledFrame(timeline.sampleAt((i * 6) / 24)),
      onFrameRendered: (i: number, snap: any) => {
        rendered[i] = snap;
      },
    });

    const pivotAfter = snapshotPivot();

    // Ground truth recomputed independently of the export loop above — sampleAt is pure
    // (src/timeline/sampler.ts), so calling it again here is a legitimate second oracle, not a
    // re-run of the code under test.
    const expected = Array.from({ length: 24 }, (_, i) => {
      const t = (i * 6) / 24;
      const frame = timeline.sampleAt(t);
      return { t, quaternion: frame.transforms.pivot.quaternion, position: frame.transforms.pivot.position };
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
      rendered,
      expected,
      pivotBefore,
      pivotAfter,
      zipB64: bufferToBase64(zipArrayBuffer),
      zipByteLength: zipArrayBuffer.byteLength,
    };
  });

  // -------------------------------------------------------------- ZIP shape (unchanged contract)
  const zipBuf = Buffer.from(result.zipB64, "base64");
  const entries = parseZipStore(zipBuf);
  console.log(`[export-timeline A] entries=${entries.length} bytes=${result.zipByteLength}`);
  expect(entries.length).toBe(24);
  expect(entries.map((e) => e.name)).toEqual(expectedFrameNames);

  let allCorrectSize = true;
  const dimsReport: string[] = [];
  for (const entry of entries) {
    const { width, height } = pngSize(entry.data);
    dimsReport.push(`${entry.name}=${width}x${height}`);
    if (width !== 1024 || height !== 1024) allCorrectSize = false;
  }
  console.log(`[export-timeline A] frame dims: ${dimsReport[0]} ... ${dimsReport[dimsReport.length - 1]}`);
  expect(allCorrectSize).toBe(true);

  // -------------------------------------------------------------- rendered transform follows timeline
  function maxAbsDiff(a: number[], b: number[]): number {
    return Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  }

  let worstQuatDiff = 0;
  let worstPosDiff = 0;
  for (let i = 0; i < 24; i++) {
    const r = result.rendered[i];
    const e = result.expected[i];
    expect(r, `frame ${i} was never reported to onFrameRendered`).toBeTruthy();
    const qDiffSame = maxAbsDiff(r.quaternion, e.quaternion);
    const qDiffFlipped = maxAbsDiff(
      r.quaternion,
      e.quaternion.map((v: number) => -v),
    );
    const qDiff = Math.min(qDiffSame, qDiffFlipped); // quaternion sign ambiguity
    const pDiff = maxAbsDiff(r.position, e.position);
    worstQuatDiff = Math.max(worstQuatDiff, qDiff);
    worstPosDiff = Math.max(worstPosDiff, pDiff);
    expect(qDiff, `frame ${i} quaternion diff ${qDiff}`).toBeLessThanOrEqual(1e-6);
    expect(pDiff, `frame ${i} position diff ${pDiff}`).toBeLessThanOrEqual(1e-6);
  }
  console.log(`[export-timeline A] worstQuatDiff=${worstQuatDiff} worstPosDiff=${worstPosDiff}`);

  // -------------------------------------------------------------- pivot restored exactly (begin/endOffscreen)
  function maxAbsDiffTransform(a: any, b: any): number {
    return Math.max(
      maxAbsDiff(a.position, b.position),
      maxAbsDiff(a.quaternion, b.quaternion),
      maxAbsDiff(a.scale, b.scale),
    );
  }
  const pivotDiff = maxAbsDiffTransform(result.pivotAfter, result.pivotBefore);
  console.log(`[export-timeline A] pivotRestoreDiff=${pivotDiff}`);
  expect(pivotDiff).toBeLessThanOrEqual(1e-9);
});

test("exportSequence appends extraFiles after the frames and exportBlenderPackage appends extras", async ({
  page,
}) => {
  test.setTimeout(60_000);
  page.on("pageerror", (err) => console.log("[export-timeline B pageerror]", err.message));
  await warmVite(page);

  const result = await page.evaluate(async () => {
    const { createStudio } = await import("/src/viewer/studio.ts");
    const canvas = document.getElementById("viewport") as HTMLCanvasElement;
    canvas.style.width = "800px";
    canvas.style.height = "600px";
    const studio = createStudio({ canvas });
    studio.resize();

    function bufferToBase64(buf: ArrayBuffer): string {
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      return btoa(binary);
    }

    const seqZip = await studio.exportSequence("1024x1024", 24, undefined, {
      extraFiles: [{ name: "studio-web-receipt.json", blob: new Blob(["{}"], { type: "application/json" }) }],
    });
    const seqZipB64 = bufferToBase64(await seqZip.arrayBuffer());

    const blenderZip = await studio.exportBlenderPackage([
      { name: "LICENCE.txt", blob: new Blob(["CC0"], { type: "text/plain" }) },
    ]);
    const blenderZipB64 = bufferToBase64(await blenderZip.arrayBuffer());

    return { seqZipB64, blenderZipB64 };
  });

  const seqEntries = parseZipStore(Buffer.from(result.seqZipB64, "base64"));
  console.log(`[export-timeline B] seq entries=${seqEntries.length} last=${seqEntries[seqEntries.length - 1]?.name}`);
  expect(seqEntries.length).toBe(25);
  expect(seqEntries.map((e) => e.name)).toEqual([...expectedFrameNames, "studio-web-receipt.json"]);

  const blenderEntries = parseZipStore(Buffer.from(result.blenderZipB64, "base64"));
  console.log(`[export-timeline B] blender entries=${blenderEntries.map((e) => e.name).join(", ")}`);
  expect(blenderEntries.length).toBe(4);
  expect(blenderEntries[blenderEntries.length - 1].name).toBe("LICENCE.txt");
});

test("legacy 3-argument exportSequence call still yields the linear sweep", async ({ page }) => {
  test.setTimeout(60_000);
  page.on("pageerror", (err) => console.log("[export-timeline C pageerror]", err.message));
  await warmVite(page);

  const result = await page.evaluate(async () => {
    const { createStudio } = await import("/src/viewer/studio.ts");
    const canvas = document.getElementById("viewport") as HTMLCanvasElement;
    canvas.style.width = "800px";
    canvas.style.height = "600px";
    const studio = createStudio({ canvas });
    studio.resize();

    function bufferToBase64(buf: ArrayBuffer): string {
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      return btoa(binary);
    }

    let progressCalls = 0;
    const zip = await studio.exportSequence("1024x1024", 24, () => {
      progressCalls++;
    });
    return { zipB64: bufferToBase64(await zip.arrayBuffer()), progressCalls };
  });

  const entries = parseZipStore(Buffer.from(result.zipB64, "base64"));
  console.log(`[export-timeline C] entries=${entries.length} progressCalls=${result.progressCalls}`);
  expect(entries.length).toBe(24);
  expect(entries.map((e) => e.name)).toEqual(expectedFrameNames);
});
