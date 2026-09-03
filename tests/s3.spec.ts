// S3 — Library + pipeline acceptance tests.
// Run: npx playwright test tests/s3.spec.ts --reporter=line
// Dev server is assumed already running at http://localhost:5173 (--strictPort).
import { test, expect } from "@playwright/test";
import type { LibraryAsset, LibraryManifest } from "../src/library/manifest";

test.describe("S3 Library manifest", () => {
  test("manifest.assets root shape, counts, and licence coverage", async ({ request }) => {
    const res = await request.get("/assets/manifest.json");
    expect(res.ok()).toBeTruthy();
    const manifest = (await res.json()) as LibraryManifest;

    expect(Array.isArray(manifest.assets)).toBe(true);

    const kenneyAssets = manifest.assets.filter((a) => a.source === "kenney");
    expect(kenneyAssets.length).toBe(2268);

    for (const a of kenneyAssets) {
      expect(a.licence).toBe("CC0");
      expect(a.sourceUrl.length).toBeGreaterThan(0);
    }

    // Licence + source coverage gate over the WHOLE manifest (SCOPE.md §1 / src/library/SPEC.md:30-33).
    const allCovered = manifest.assets.every(
      (a) => a.licence === "CC0" && /^https?:\/\//.test(a.sourceUrl)
    );
    expect(allCovered).toBe(true);
  });

  test("both S6-contractual asset ids are present (decision #16)", async ({ request }) => {
    const res = await request.get("/assets/manifest.json");
    const manifest = (await res.json()) as LibraryManifest;
    const byId = new Map(manifest.assets.map((a) => [a.id, a]));

    const human = byId.get("kenney/mini-dungeon/character-human");
    expect(human).toBeTruthy();
    expect(human!.fileBytes).toBe(218072);
    expect(human!.triangles).toBe(465);
    expect(human!.animationClipNames?.length).toBe(32);
    expect(human!.licence).toBe("CC0");
    expect(human!.sourceUrl.length).toBeGreaterThan(0);

    const oobi = byId.get("kenney/platformer-kit/character-oobi");
    expect(oobi).toBeTruthy();
    expect(oobi!.fileBytes).toBe(236392);
    expect(oobi!.triangles).toBe(1096);
    expect(oobi!.animationClipNames?.length).toBe(25);
    expect(oobi!.licence).toBe("CC0");
    expect(oobi!.sourceUrl.length).toBeGreaterThan(0);
  });

  test("20 kit-level thumbnails: 256x256, <=50KB each", async ({ page, request }) => {
    const res = await request.get("/assets/manifest.json");
    const manifest = (await res.json()) as LibraryManifest;
    const kenneyAssets = manifest.assets.filter((a) => a.source === "kenney");
    const thumbUrls = Array.from(new Set(kenneyAssets.map((a) => a.thumbnailUrl))).sort();
    expect(thumbUrls.length).toBe(20);

    await page.goto("/");
    for (const url of thumbUrls) {
      const headRes = await request.get(url);
      expect(headRes.ok()).toBeTruthy();
      const bytes = (await headRes.body()).length;
      expect(bytes).toBeLessThanOrEqual(50 * 1024);

      const dims = await page.evaluate(
        (u) =>
          new Promise<{ w: number; h: number }>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => reject(new Error("image failed to load: " + u));
            img.src = u;
          }),
        url
      );
      expect(dims.w).toBe(256);
      expect(dims.h).toBe(256);
    }
  });
});

test.describe("S3 Library GLB spot-check", () => {
  test("≥20 GLBs across ≥10 kits open in GLTFLoader with 0 console errors", async ({ page, request }) => {
    const res = await request.get("/assets/manifest.json");
    const manifest = (await res.json()) as LibraryManifest;
    const modelAssets = manifest.assets.filter((a) => a.kind === "model");

    const byKit = new Map<string, LibraryAsset[]>();
    for (const a of modelAssets) {
      if (!byKit.has(a.category)) byKit.set(a.category, []);
      byKit.get(a.category)!.push(a);
    }
    const kits = Array.from(byKit.keys()).sort().slice(0, 10);
    expect(kits.length).toBeGreaterThanOrEqual(10);

    const sample: LibraryAsset[] = [];
    for (const kit of kits) sample.push(...byKit.get(kit)!.slice(0, 2));
    expect(sample.length).toBeGreaterThanOrEqual(20);

    await page.goto("/");

    const { results, errors } = await page.evaluate(async (urls: string[]) => {
      const errors: string[] = [];
      const originalError = console.error;
      console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
      };
      const mod = await import("/node_modules/three/examples/jsm/loaders/GLTFLoader.js");
      const loader = new mod.GLTFLoader();
      const results: { url: string; ok: boolean; error?: string }[] = [];
      for (const url of urls) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const gltf: any = await new Promise((resolve, reject) => {
            loader.load(url, resolve, undefined, reject);
          });
          results.push({ url, ok: !!gltf && !!gltf.scene });
        } catch (e) {
          results.push({ url, ok: false, error: String(e) });
        }
      }
      console.error = originalError;
      return { results, errors };
    }, sample.map((a) => a.fileUrl));

    const failed = results.filter((r) => !r.ok);
    expect(failed, JSON.stringify(failed)).toEqual([]);
    expect(results.length).toBeGreaterThanOrEqual(20);
    expect(errors, JSON.stringify(errors)).toEqual([]);
  });
});

test.describe("S3 LibraryPanel", () => {
  test("renders manifest grid and emits onAssetPicked on tile click", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const host = document.createElement("div");
      host.id = "s3-test-panel";
      document.body.appendChild(host);
    });

    const pickedId = await page.evaluate(async () => {
      const mod = await import("/src/library/index.ts");
      const host = document.getElementById("s3-test-panel")!;
      return new Promise<string>((resolve) => {
        mod.mountLibraryPanel(host, {
          onAssetPicked: (asset: { id: string }) => resolve(asset.id),
        });
        // Poll for the first tile to render, then click it.
        const tryClick = () => {
          const tile = host.querySelector<HTMLButtonElement>(".library-panel__tile");
          if (tile) {
            tile.click();
          } else {
            requestAnimationFrame(tryClick);
          }
        };
        tryClick();
      });
    });

    expect(typeof pickedId).toBe("string");
    expect(pickedId.startsWith("kenney/")).toBe(true);
  });
});
