// tests/project-recovery.spec.ts — F2 (project v2 + local recovery) acceptance suite.
// Ownership: F2 (status/warden-log.md Decision W-2). P1 is a module-level IndexedDB round-trip
// and must be green in this phase. P2-P4 drive the real app shell and stay red until the Shell
// agent (Phase B) wires src/app/main.ts and index.html per status/evidence/f2/requests.md.

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Copied from tests/s1.spec.ts: headless Chromium's default SwiftShader path cannot be trusted
// for the real WebGL/model-load flows P2-P4 drive.
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

test("P1 persist round-trips a v2 document through IndexedDB across a reload", async ({ page }) => {
  await page.goto("/");

  const doc = await page.evaluate(async () => {
    const format = await import("/src/project/format.ts");
    return format.createProjectDocument({
      name: "Recovery smoke test",
      savedAt: "2026-09-04T12:00:00.000Z",
      model: { name: "fixture.glb", mime: "model/gltf-binary", base64: "Z2xURgECAwQ=" },
      viewer: {
        focal: 50,
        exposure: 1.05,
        environment: "room",
        environmentRotation: 0,
        environmentIntensity: 1,
        transparent: false,
        spin: false,
        shadows: true,
        floor: true,
      },
      timeline: { duration: 6, fps: 30, tracks: [] },
    });
  });

  await page.evaluate(async (docArg) => {
    const persist = await import("/src/app/persist.ts");
    const store = await persist.openRecoveryStore();
    if (!store) throw new Error("recovery store unavailable");
    await store.save(docArg);
  }, doc);

  await page.reload();

  const reloaded = await page.evaluate(async () => {
    const persist = await import("/src/app/persist.ts");
    const store = await persist.openRecoveryStore();
    if (!store) throw new Error("recovery store unavailable");
    return store.load();
  });

  expect(reloaded).not.toBeNull();
  expect(reloaded!.doc).toEqual(doc);
  expect(typeof reloaded!.savedAt).toBe("string");

  const afterClear = await page.evaluate(async () => {
    const persist = await import("/src/app/persist.ts");
    const store = await persist.openRecoveryStore();
    if (!store) throw new Error("recovery store unavailable");
    await store.clear();
    return store.load();
  });

  expect(afterClear).toBeNull();
});

test("P2 editing then reload offers Restore and rebuilds the scene", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto("/");

  await page.waitForSelector("#panel-library .library-panel__tile", { timeout: 15_000 });
  const firstTile = page.locator("#panel-library .library-panel__tile").first();
  const tileName = await firstTile.getAttribute("aria-label").catch(() => null);
  await firstTile.click();
  await expect(page.locator("#viewport-hint")).toHaveAttribute("data-state", "loaded", { timeout: 15_000 });

  const outlinerRows = page.locator("#panel-outliner .outliner-row");
  const rowsBeforeAdd = await outlinerRows.count();

  await page.getByRole("button", { name: "+ Light" }).click();
  await page.getByRole("button", { name: "+ Box" }).click();
  await expect(outlinerRows).toHaveCount(rowsBeforeAdd + 2, { timeout: 5_000 });
  // The editor appends new adds to the end of the scene graph, and the outliner walks the scene
  // in that order, so the just-added box is the last row — select it before Mirror X.
  await outlinerRows.last().click();
  await page.getByRole("button", { name: "Mirror X" }).click();

  // Give the autosave debounce (createAutosaver, default 2000ms) time to flush before reload.
  await page.waitForTimeout(3_000);
  await page.reload();

  await expect(page.getByRole("button", { name: "Restore" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Restore" }).click();

  await expect(page.locator("#viewport-hint")).toHaveAttribute("data-state", "loaded", { timeout: 10_000 });
  const restoredRows = page.locator("#panel-outliner .outliner-row");
  await expect(restoredRows).toHaveCount(rowsBeforeAdd + 2, { timeout: 10_000 });

  const activeAndClone = await page.evaluate(() => {
    const studio = (window as unknown as { __studio: { debug: { state(): Record<string, unknown> }; scene: { traverse(cb: (o: unknown) => void): void } } }).__studio;
    let hasMirrorClone = false;
    studio.scene.traverse((obj: unknown) => {
      const o = obj as { userData?: Record<string, unknown> };
      if (o.userData && o.userData.__editorModifierClone) hasMirrorClone = true;
    });
    return { active: studio.debug.state().active, hasMirrorClone };
  });

  if (tileName) expect(activeAndClone.active).toBe(tileName);
  expect(activeAndClone.hasMirrorClone).toBe(true);
});

test("P3 simulated context loss shows a recoverable message and clears on restore", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));

  await page.evaluate(() => {
    const studio = (window as unknown as { __studio: { renderer: { getContext(): WebGLRenderingContext } } }).__studio;
    const gl = studio.renderer.getContext();
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  });

  const error = page.locator("#viewport-error");
  await expect(error).toBeVisible({ timeout: 5_000 });
  await expect(error).toContainText(/context lost/i);

  await page.evaluate(() => {
    const studio = (window as unknown as { __studio: { renderer: { getContext(): WebGLRenderingContext } } }).__studio;
    const gl = studio.renderer.getContext();
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.restoreContext();
  });

  await expect(error).toBeHidden({ timeout: 5_000 });
});

test("P4 a locally opened GLB never leaks its filename or path into the recovery record", async ({ page }) => {
  test.setTimeout(30_000);
  const sourceGlb = path.join(process.cwd(), "public", "assets", "kenney", "car-kit", "ambulance.glb");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-web-privacy-"));
  const privatePath = path.join(tempDir, "private-client-chair.glb");
  fs.copyFileSync(sourceGlb, privatePath);

  await page.goto("/");
  const fileInput = page.locator("#model-file-input");
  await fileInput.setInputFiles(privatePath);
  await expect(page.locator("#viewport-hint")).toHaveAttribute("data-state", "loaded", { timeout: 15_000 });

  // Give the autosave debounce time to flush.
  await page.waitForTimeout(3_000);

  const recordText = await page.evaluate(async () => {
    const persist = await import("/src/app/persist.ts");
    const store = await persist.openRecoveryStore();
    if (!store) return null;
    const record = await store.load();
    return record ? JSON.stringify(record) : null;
  });

  fs.rmSync(tempDir, { recursive: true, force: true });

  expect(recordText).not.toBeNull();
  expect(recordText).not.toContain("private-client");
  // A Windows path shows up as a literal backslash character once recordText (itself the result
  // of JSON.stringify, so already JSON-escaped) is inspected as plain text; no legitimate field of
  // a recovery record should ever contain one.
  expect(recordText).not.toContain("\\");
  const record = JSON.parse(recordText!) as { doc: { asset: { origin: string } | null } };
  expect(record.doc.asset).not.toBeNull();
  expect(record.doc.asset!.origin).toBe("local");
});
