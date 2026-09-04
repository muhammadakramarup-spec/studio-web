// tests/exports.spec.ts — Wave 3 Function 3 (export receipt + provenance) artifact tests.
// Ownership: silo F3 (status/warden-log.md Decision W-2 table — "tests/exports.spec.ts (new)").
// Drives the REAL shell at "/" the same way tests/e2e.spec.ts and tests/s1.spec.ts do — this
// proves the finished artifact, not a unit-mocked stand-in for it.
//
// X1 is a guard: every format the app already claims to export must produce valid bytes today,
// independent of anything F3 adds. X2 proves the receipt/licence Phase-B integration (main.ts
// wiring owned by the Shell agent per status/evidence/f3/requests.md) — it is expected to stay
// red until that shell wiring lands. X3 proves the privacy guard holds end-to-end: a locally
// opened file's name must never appear inside a downloaded package.

import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

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
// Independent of src/viewer/zip.ts (never imported — F3 does not own that module unless a
// non-ASCII name needs the UTF-8 flag, status/warden-log.md Decision W-2). Copied verbatim from
// tests/e2e.spec.ts's own parseZipStore/pngSize, which itself duplicates tests/s1.spec.ts's,
// exactly per that file's header comment on why this must not just re-run the code under test.

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

// Same warm-up as tests/e2e.spec.ts / tests/s1.spec.ts: force Vite's dependency pre-bundling to
// happen before the timed/interactive part of the test, not mid-test.
async function warmVite(page: Page): Promise<void> {
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
  await page.goto("/");
}

async function downloadVia(page: Page, buttonName: string): Promise<Buffer> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: buttonName, exact: true }).click(),
  ]);
  const filePath = await download.path();
  if (!filePath) throw new Error(`download for "${buttonName}" produced no local file path`);
  return fs.readFileSync(filePath);
}

test.beforeEach(async ({ page }) => {
  await warmVite(page);
});

test("X1 — all five exports download as valid artifacts", async ({ page }) => {
  test.setTimeout(60_000);

  await page.locator(".library-panel__tile").first().click();
  await expect(page.locator("#viewport-hint")).toHaveAttribute("data-state", "loaded", { timeout: 20_000 });

  const pngBuf = await downloadVia(page, "PNG");
  expect(pngBuf.readUInt32BE(0), "PNG signature").toBe(0x89504e47);
  const png = pngSize(pngBuf);
  expect(png.width).toBe(2048);
  expect(png.height).toBe(2048);

  const glbBuf = await downloadVia(page, "GLB");
  expect(glbBuf.toString("ascii", 0, 4), "GLB magic").toBe("glTF");
  expect(glbBuf.readUInt32LE(4), "GLB version").toBe(2);
  const jsonChunkLength = glbBuf.readUInt32LE(12);
  const jsonChunkType = glbBuf.toString("ascii", 16, 20);
  expect(jsonChunkType, "first chunk type").toBe("JSON");
  const glbJson = JSON.parse(glbBuf.toString("utf8", 20, 20 + jsonChunkLength));
  expect(glbJson.asset.version).toBe("2.0");

  const gltfBuf = await downloadVia(page, "GLTF");
  const gltfJson = JSON.parse(gltfBuf.toString("utf8"));
  expect(gltfJson.asset.version).toBe("2.0");

  const blenderBuf = await downloadVia(page, "Blender ZIP");
  const blenderEntries = parseZipStore(blenderBuf);
  const blenderNames = blenderEntries.map((e) => e.name);
  expect(blenderNames).toContain("studio-scene.glb");
  expect(blenderNames).toContain("studio-scene.gltf");
  expect(blenderNames).toContain("README-Blender.txt");
  const glbEntry = blenderEntries.find((e) => e.name === "studio-scene.glb")!;
  expect(glbEntry.data.toString("ascii", 0, 4)).toBe("glTF");

  const turntableBuf = await downloadVia(page, "Turntable");
  const turntableEntries = parseZipStore(turntableBuf);
  // Phase B test alignment (status/warden-log.md Decision W-6): this test loads the ambulance via
  // a real library-panel tile click above, which — same as X2's identical scenario a few lines
  // down — legitimately seeds provenance for that model. A package export made after a library
  // pick now correctly carries a receipt (24 frames + studio-web-receipt.json + LICENCE.txt = 26),
  // per src/viewer/receipt.ts's buildReceipt/receiptFiles wired in src/app/main.ts. The original
  // 24 assumed no receipt ever attached, which was only true before this Phase-B wiring landed;
  // every per-frame name/size assertion below is unchanged and still exact.
  expect(turntableEntries.length).toBe(26);
  for (let i = 1; i <= 24; i++) {
    const name = `frame_${String(i).padStart(4, "0")}.png`;
    const entry = turntableEntries.find((e) => e.name === name);
    expect(entry, `missing ${name}`).toBeTruthy();
    const size = pngSize(entry!.data);
    expect(size.width).toBe(1024);
    expect(size.height).toBe(1024);
  }
});

test("X2 — package exports after a library pick carry a receipt and licence", async ({ page }) => {
  test.setTimeout(60_000);

  const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));

  const firstTile = page.locator(".library-panel__tile").first();
  const assetId = await firstTile.getAttribute("data-asset-id");
  await firstTile.click();
  await expect(page.locator("#viewport-hint")).toHaveAttribute("data-state", "loaded", { timeout: 20_000 });

  const blenderBuf = await downloadVia(page, "Blender ZIP");
  const blenderEntries = parseZipStore(blenderBuf);
  const receiptEntry = blenderEntries.find((e) => e.name === "studio-web-receipt.json");
  expect(receiptEntry, "Blender ZIP is missing studio-web-receipt.json").toBeTruthy();
  const receipt = JSON.parse(receiptEntry!.data.toString("utf8"));
  expect(receipt.format).toBe("studio-web-export-receipt");
  expect(receipt.assets[0].id).toBe(assetId);
  expect(receipt.assets[0].licence).toBe("CC0");
  expect(String(receipt.assets[0].sourceUrl).startsWith("https://")).toBe(true);
  expect(receipt.export.kind).toBe("blender-package");
  expect(receipt.app.version).toBe(packageJson.version);
  expect(Number.isFinite(Date.parse(receipt.export.createdAt))).toBe(true);

  const licenceEntry = blenderEntries.find((e) => e.name === "LICENCE.txt");
  expect(licenceEntry, "Blender ZIP is missing LICENCE.txt").toBeTruthy();
  expect(licenceEntry!.data.toString("utf8")).toContain("CC0");

  const turntableBuf = await downloadVia(page, "Turntable");
  const turntableEntries = parseZipStore(turntableBuf);
  expect(turntableEntries.length).toBe(26);
  const turntableReceiptEntry = turntableEntries.find((e) => e.name === "studio-web-receipt.json");
  expect(turntableReceiptEntry, "Turntable ZIP is missing studio-web-receipt.json").toBeTruthy();
  const turntableReceipt = JSON.parse(turntableReceiptEntry!.data.toString("utf8"));
  expect(turntableReceipt.export.frames.count).toBe(24);
  expect(turntableReceipt.export.frames.width).toBe(1024);
  expect(turntableReceipt.export.frames.height).toBe(1024);
});

test("X3 — a locally opened GLB exports without a receipt and without its filename", async ({ page }) => {
  test.setTimeout(60_000);

  const sourceGlb = path.join(process.cwd(), "public", "assets", "kenney", "car-kit", "ambulance.glb");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-web-x3-"));
  const privatePath = path.join(tmpDir, "private-client-chair.glb");
  fs.copyFileSync(sourceGlb, privatePath);

  try {
    await page.setInputFiles("#model-file-input", privatePath);
    await expect(page.locator("#viewport-hint")).toHaveAttribute("data-state", "loaded", { timeout: 20_000 });

    const blenderBuf = await downloadVia(page, "Blender ZIP");
    const blenderEntries = parseZipStore(blenderBuf);
    expect(blenderEntries.length).toBe(3);
    expect(blenderBuf.toString("latin1")).not.toContain("private-client");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
