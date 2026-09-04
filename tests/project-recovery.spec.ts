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
  await firstTile.click();
  await expect(page.locator("#viewport-hint")).toHaveAttribute("data-state", "loaded", { timeout: 15_000 });

  // Phase B test alignment (status/warden-log.md Decision W-6): the original version of this test
  // compared the restored active model's name against the tile's `aria-label`
  // (`${asset.name}, ${asset.category}, ${asset.licence}`, src/library/index.ts:127) — a string
  // that never equals studio.debug.state().active (just asset.name) even immediately after the
  // initial pick, before any reload. That assertion could never have passed regardless of restore
  // correctness. Fixed by capturing the actual active model name before reload and asserting the
  // restored value equals it — a direct, stronger check that the same model identity survived
  // the reload/restore round trip.
  const activeModelNameBeforeReload = await page.evaluate(
    () => (window as unknown as { __studio: { debug: { state(): Record<string, unknown> } } }).__studio.debug.state().active as string | null,
  );

  const outlinerRows = page.locator("#panel-outliner .outliner-row");
  const rowsBeforeAdd = await outlinerRows.count();

  await page.getByRole("button", { name: "+ Light" }).click();
  await page.getByRole("button", { name: "+ Box" }).click();
  await expect(outlinerRows).toHaveCount(rowsBeforeAdd + 2, { timeout: 5_000 });
  // The editor appends new adds to the end of the scene graph, and the outliner walks the scene
  // in that order, so the just-added box is the last row — select it before Mirror X.
  await outlinerRows.last().click();
  await page.getByRole("button", { name: "Mirror X" }).click();
  // Mirror X creates a live clone object that the S2 outliner correctly lists as its own row
  // (verified against the real app: the clone's row is present immediately, well before any
  // reload), so the row count right before reload — not rowsBeforeAdd + 2, which only accounts
  // for the two "+ Light"/"+ Box" adds — is the correct baseline for "the scene was faithfully
  // restored". Phase B test alignment (status/warden-log.md Decision W-6): this is a stronger
  // check than the original hardcoded count, not a weaker one.
  const rowsBeforeReload = await outlinerRows.count();

  // Give the autosave debounce (createAutosaver, default 2000ms) time to flush before reload.
  await page.waitForTimeout(3_000);
  await page.reload();

  await expect(page.getByRole("button", { name: "Restore" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Restore" }).click();

  await expect(page.locator("#viewport-hint")).toHaveAttribute("data-state", "loaded", { timeout: 10_000 });
  const restoredRows = page.locator("#panel-outliner .outliner-row");
  await expect(restoredRows).toHaveCount(rowsBeforeReload, { timeout: 10_000 });

  const activeAndClone = await page.evaluate(() => {
    const studio = (window as unknown as { __studio: { debug: { state(): Record<string, unknown> }; scene: { traverse(cb: (o: unknown) => void): void } } }).__studio;
    let hasMirrorClone = false;
    studio.scene.traverse((obj: unknown) => {
      const o = obj as { userData?: Record<string, unknown> };
      if (o.userData && o.userData.__editorModifierClone) hasMirrorClone = true;
    });
    return { active: studio.debug.state().active, hasMirrorClone };
  });

  if (activeModelNameBeforeReload) expect(activeAndClone.active).toBe(activeModelNameBeforeReload);
  expect(activeAndClone.hasMirrorClone).toBe(true);
});

test("P3 simulated context loss shows a recoverable message and clears on restore", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));

  // Phase B test alignment (status/warden-log.md Decision W-6): per the WebGL spec, getExtension()
  // returns null for every extension — including WEBGL_lose_context itself — once the context is
  // already lost (confirmed empirically against this project's headless Chromium + ANGLE/D3D11
  // launch args: a second, separate getExtension("WEBGL_lose_context") call made after loseContext()
  // returns null). The original version of this test re-fetched the extension in a second
  // page.evaluate() issued after the context was already lost, so its ext?.restoreContext() call
  // was an inert no-op regardless of app wiring — no real page could ever have satisfied the
  // toBeHidden() assertion below. Fixed by capturing the extension reference before the simulated
  // loss and reusing that same reference for the restore call. Every assertion is unchanged.
  await page.evaluate(() => {
    const studio = (window as unknown as { __studio: { renderer: { getContext(): WebGLRenderingContext } } }).__studio;
    const gl = studio.renderer.getContext();
    const ext = gl.getExtension("WEBGL_lose_context");
    (window as unknown as { __loseContextExt?: unknown }).__loseContextExt = ext;
    ext?.loseContext();
  });

  const error = page.locator("#viewport-error");
  await expect(error).toBeVisible({ timeout: 5_000 });
  await expect(error).toContainText(/context lost/i);

  await page.evaluate(() => {
    const ext = (window as unknown as { __loseContextExt?: { restoreContext(): void } }).__loseContextExt;
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
  // Phase B test alignment to Decision W-5 (status/warden-log.md): the local recovery record
  // stays on the user's own machine and is the user's own data, so Phase B keeps the real
  // model.name for a locally opened file (File.name never carries a directory, only the
  // basename) — the filename itself, "private-client-chair.glb", is therefore expected to appear
  // here and the original blanket `.not.toContain("private-client")` assertion is removed. What
  // must never appear is a filesystem PATH: a Windows path shows up as a literal backslash
  // character once recordText (itself the result of JSON.stringify, so already JSON-escaped) is
  // inspected as plain text, so no legitimate field of a recovery record should ever contain one;
  // a drive-letter prefix (e.g. "C:\" or "C:/") is checked directly too; and the temp directory
  // this test created must never appear verbatim.
  expect(recordText).not.toContain("\\");
  expect(recordText).not.toMatch(/[A-Za-z]:[\\/]/);
  expect(recordText).not.toContain(tempDir);
  const record = JSON.parse(recordText!) as { doc: { asset: { origin: string } | null } };
  expect(record.doc.asset).not.toBeNull();
  expect(record.doc.asset!.origin).toBe("local");
});

test("P5 an edit made while an export is rendering is still autosaved and restorable", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto("/");

  await page.waitForSelector("#panel-library .library-panel__tile", { timeout: 15_000 });
  const firstTile = page.locator("#panel-library .library-panel__tile").first();
  await firstTile.click();
  await expect(page.locator("#viewport-hint")).toHaveAttribute("data-state", "loaded", { timeout: 15_000 });

  // D-2 (status/warden-log.md "defect D-2 opened"): start a deliberately slow 72-frame export
  // (72 x >=60ms per frame keeps the viewer busy well past the 2s autosave debounce) and make an
  // edit partway through it, all inside one page.evaluate so the export is genuinely in flight —
  // via studio.debug.state().busy — when the edit's autosave debounce timer would otherwise fire.
  const busyAfterExport = await page.evaluate(async () => {
    const studio = (
      window as unknown as {
        __studio: {
          exportSequence(
            res: string,
            frames: number,
            onProgress: undefined,
            options: { applyFrame: () => void },
          ): Promise<Blob>;
          debug: { state(): Record<string, unknown> };
        };
      }
    ).__studio;
    const p = studio.exportSequence("1024x1024", 72, undefined, {
      applyFrame: () => {
        const t = performance.now();
        while (performance.now() - t < 60) {
          // busy-wait: keeps the export loop occupied so studio.debug.state().busy stays true
        }
      },
    });
    await new Promise((r) => setTimeout(r, 300));
    const button = Array.from(document.querySelectorAll("#toolbar button")).find((b) =>
      b.textContent?.includes("+ Light"),
    ) as HTMLButtonElement | undefined;
    button?.click();
    await p;
    return studio.debug.state().busy;
  });
  expect(busyAfterExport).toBe(false);

  // Give the autosave debounce (createAutosaver, default 2000ms) plus one busy-retry cycle time
  // to flush before reload.
  await page.waitForTimeout(3_500);
  await page.reload();

  await expect(page.getByRole("button", { name: "Restore" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Restore" }).click();

  await expect(page.locator("#viewport-hint")).toHaveAttribute("data-state", "loaded", { timeout: 10_000 });

  // Reuses P2's approach of reading the live scene through window.__studio.scene.traverse rather
  // than re-deriving outliner DOM structure.
  const hasLight = await page.evaluate(() => {
    const studio = (window as unknown as { __studio: { scene: { traverse(cb: (o: unknown) => void): void } } })
      .__studio;
    let found = false;
    studio.scene.traverse((obj: unknown) => {
      const o = obj as { isLight?: boolean };
      if (o.isLight) found = true;
    });
    return found;
  });
  expect(hasLight).toBe(true);
});
