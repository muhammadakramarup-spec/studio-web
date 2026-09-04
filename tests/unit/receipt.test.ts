import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLicenceText,
  buildReceipt,
  createProvenanceRegistry,
  receiptFiles,
  type ProvenanceAsset,
} from "../../src/viewer/receipt.ts";

const MODEL_ASSET: ProvenanceAsset = {
  id: "kenney-chair-01",
  name: "Office Chair",
  kind: "model",
  source: "kenney",
  sourceUrl: "https://kenney.nl/assets/furniture-kit",
  licence: "CC0",
  category: "furniture",
  fileBytes: 40960,
  triangles: 1280,
};

const HDRI_ASSET: ProvenanceAsset = {
  id: "polyhaven-studio-01",
  name: "Studio Small 03",
  kind: "hdri",
  source: "polyhaven",
  sourceUrl: "https://polyhaven.com/a/studio_small_03",
  licence: "CC0",
};

test("receipt carries app version, kind, ISO timestamp, frames, and CC0 asset provenance", () => {
  const receipt = buildReceipt({
    appVersion: "0.1.0",
    kind: "turntable",
    files: ["frame_0001.png", "frame_0002.png", "studio-web-receipt.json", "LICENCE.txt"],
    frames: { count: 24, width: 1024, height: 1024, motion: "default-sweep" },
    assets: [MODEL_ASSET],
  });

  assert.equal(receipt.format, "studio-web-export-receipt");
  assert.equal(receipt.version, 1);
  assert.equal(receipt.app.name, "Studio Web");
  assert.equal(receipt.app.version, "0.1.0");
  assert.equal(receipt.export.kind, "turntable");
  assert.ok(Number.isFinite(Date.parse(receipt.export.createdAt)), "createdAt must be a valid ISO timestamp");
  assert.deepEqual(receipt.export.files, [
    "frame_0001.png",
    "frame_0002.png",
    "studio-web-receipt.json",
    "LICENCE.txt",
  ]);
  assert.deepEqual(receipt.export.frames, { count: 24, width: 1024, height: 1024, motion: "default-sweep" });
  assert.equal(receipt.assets.length, 1);
  assert.equal(receipt.assets[0].licence, "CC0");
  assert.equal(receipt.assets[0].sourceUrl, "https://kenney.nl/assets/furniture-kit");

  // a fixed createdAt round-trips exactly (no silent clock override)
  const fixed = buildReceipt({
    appVersion: "0.1.0",
    kind: "blender-package",
    createdAt: "2026-09-04T12:00:00.000Z",
    files: ["studio-scene.glb"],
    assets: [],
  });
  assert.equal(fixed.export.createdAt, "2026-09-04T12:00:00.000Z");
});

test("licence text names the asset, its source URL, CC0 1.0, and the app version", () => {
  const receipt = buildReceipt({
    appVersion: "0.1.0",
    kind: "blender-package",
    createdAt: "2026-09-04T12:00:00.000Z",
    files: ["studio-scene.glb", "studio-scene.gltf", "README-Blender.txt"],
    assets: [MODEL_ASSET],
  });

  const text = buildLicenceText(receipt);
  assert.match(text, /Office Chair/);
  assert.match(text, /https:\/\/kenney\.nl\/assets\/furniture-kit/);
  assert.match(text, /CC0 1\.0/);
  assert.match(text, /creativecommons\.org\/publicdomain\/zero\/1\.0/);
  assert.match(text, /0\.1\.0/);
});

test("receiptFiles yields studio-web-receipt.json and LICENCE.txt whose JSON parses back to the receipt", async () => {
  const receipt = buildReceipt({
    appVersion: "0.1.0",
    kind: "blender-package",
    createdAt: "2026-09-04T12:00:00.000Z",
    files: ["studio-scene.glb", "studio-scene.gltf", "README-Blender.txt"],
    assets: [MODEL_ASSET],
  });

  const files = receiptFiles(receipt);
  const names = files.map((f) => f.name).sort();
  assert.deepEqual(names, ["LICENCE.txt", "studio-web-receipt.json"]);

  const jsonFile = files.find((f) => f.name === "studio-web-receipt.json")!;
  const jsonText = await jsonFile.blob.text();
  assert.deepEqual(JSON.parse(jsonText), receipt);
  assert.equal(jsonText, JSON.stringify(receipt, null, 2));

  const licenceFile = files.find((f) => f.name === "LICENCE.txt")!;
  const licenceText = await licenceFile.blob.text();
  assert.match(licenceText, /CC0/);
});

test("privacy guard rejects local paths and non-https sources", () => {
  assert.throws(() =>
    buildReceipt({
      appVersion: "0.1.0",
      kind: "blender-package",
      files: ["studio-scene.glb"],
      assets: [
        {
          ...MODEL_ASSET,
          name: String.raw`C:\Users\someone\private\chair.glb`,
        },
      ],
    }),
  );

  assert.throws(() =>
    buildReceipt({
      appVersion: "0.1.0",
      kind: "blender-package",
      files: ["studio-scene.glb"],
      assets: [{ ...MODEL_ASSET, sourceUrl: "http://kenney.nl/assets/furniture-kit" }],
    }),
  );

  assert.throws(() =>
    buildReceipt({
      appVersion: "0.1.0",
      kind: "blender-package",
      files: ["studio-scene.glb"],
      assets: [{ ...MODEL_ASSET, sourceUrl: "file:///C:/Users/someone/private/chair.glb" }],
    }),
  );

  // no receipt this test successfully builds should ever be able to smuggle "private" through
  const acceptedReceipt = buildReceipt({
    appVersion: "0.1.0",
    kind: "blender-package",
    createdAt: "2026-09-04T12:00:00.000Z",
    files: ["studio-scene.glb"],
    assets: [MODEL_ASSET],
  });
  assert.doesNotMatch(JSON.stringify(acceptedReceipt), /private/i);
});

test("registry lists model then hdri, replaces on set, clears on null", () => {
  const registry = createProvenanceRegistry();
  assert.deepEqual(registry.list(), []);

  registry.setModel(MODEL_ASSET);
  assert.deepEqual(registry.list(), [MODEL_ASSET]);

  registry.setEnvironment(HDRI_ASSET);
  assert.deepEqual(registry.list(), [MODEL_ASSET, HDRI_ASSET]);

  const otherModel: ProvenanceAsset = { ...MODEL_ASSET, id: "kenney-table-02", name: "Coffee Table" };
  registry.setModel(otherModel);
  assert.deepEqual(registry.list(), [otherModel, HDRI_ASSET]);

  registry.setModel(null);
  assert.deepEqual(registry.list(), [HDRI_ASSET]);

  registry.setEnvironment(null);
  assert.deepEqual(registry.list(), []);

  registry.setModel(MODEL_ASSET);
  registry.setEnvironment(HDRI_ASSET);
  registry.clear();
  assert.deepEqual(registry.list(), []);
});
