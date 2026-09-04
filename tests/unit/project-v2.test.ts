import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createProjectDocument, parseProjectDocument, PROJECT_VERSION } from "../../src/project/format.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MODEL_BASE64 = "Z2xURgECAwQ="; // base64 of the 8-byte "glTF" fixture, matches project-format.test.ts
const MODEL_BYTES = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2, 3, 4]);

const viewer = {
  focal: 50 as const,
  exposure: 1.05,
  environment: "hdr" as const,
  environmentRotation: 45,
  environmentIntensity: 1.3,
  transparent: false,
  spin: false,
  shadows: true,
  floor: true,
};

const timeline = { duration: 6, fps: 30, tracks: [] };

function baseInput() {
  return {
    name: "Coffee table study",
    savedAt: "2026-09-04T12:00:00.000Z",
    model: { name: "coffee-table.glb", mime: "model/gltf-binary" as const, base64: MODEL_BASE64 },
    viewer,
    timeline,
  };
}

test("v2 round-trips scene objects, modifiers, asset identity, environment, and view", () => {
  const input = {
    ...baseInput(),
    asset: {
      origin: "library" as const,
      id: "kenney-chair-01",
      name: "Wooden chair",
      kind: "model" as const,
      source: "kenney",
      sourceUrl: "https://kenney.nl/assets/furniture-kit",
      licence: "CC0" as const,
      category: "furniture",
    },
    environment: {
      kind: "hdr" as const,
      rotation: 45,
      intensity: 1.3,
      hdri: {
        id: "studio-small-03",
        name: "Studio Small 03",
        source: "polyhaven",
        sourceUrl: "https://polyhaven.com/a/studio_small_03",
        licence: "CC0" as const,
        fileUrl: "/assets/hdri/studio-small-03.hdr",
      },
    },
    view: {
      position: [1.5, 2, 3] as [number, number, number],
      target: [0, 0.5, 0] as [number, number, number],
      focal: 85 as const,
      exposure: 1.2,
    },
    scene: {
      objects: [
        {
          kind: "light-point" as const,
          name: "Key light",
          visible: true,
          position: [2.5, 3, 2.5] as [number, number, number],
          quaternion: [0, 0, 0, 1] as [number, number, number, number],
          scale: [1, 1, 1] as [number, number, number],
          light: { color: "#ffffff", intensity: 5 },
        },
        {
          kind: "primitive-box" as const,
          name: "Riser",
          visible: true,
          position: [0, 0.5, 0] as [number, number, number],
          quaternion: [0, 0.7071, 0, 0.7071] as [number, number, number, number],
          scale: [1, 1, 1] as [number, number, number],
          material: { color: "#cccccc", roughness: 0.6, metalness: 0, emissive: "#000000", emissiveIntensity: 0 },
          modifiers: { mirror: { axis: "x" as const, enabled: true }, array: { count: 5, offset: [1.2, 0, 0] as [number, number, number] } },
        },
      ],
      postFX: { enabled: true, strength: 0.15, radius: 0.15, threshold: 0.99 },
    },
  };

  const parsed = parseProjectDocument(JSON.stringify(createProjectDocument(input)));
  assert.equal(parsed.version, PROJECT_VERSION);
  assert.equal(parsed.version, 2);
  assert.deepEqual(parsed.asset, input.asset);
  assert.deepEqual(parsed.environment, input.environment);
  assert.deepEqual(parsed.view, input.view);
  assert.deepEqual(parsed.scene, input.scene);
  assert.deepEqual(parsed.viewer, viewer);
  assert.deepEqual(parsed.timeline, timeline);
  assert.equal(parsed.name, "Coffee table study");
});

test("committed v1 fixture parses and upgrades to v2 defaults", () => {
  const fixturePath = path.join(__dirname, "..", "fixtures", "project-v1.studio.json");
  const raw = readFileSync(fixturePath, "utf8");
  const fixtureJson = JSON.parse(raw) as { version: number; viewer: { environment: string } };
  assert.equal(fixtureJson.version, 1, "fixture must stay pinned to v1 forever");

  const parsed = parseProjectDocument(raw);
  assert.equal(parsed.version, 2);
  assert.equal(parsed.asset, null);
  assert.deepEqual(parsed.scene.objects, []);
  assert.equal(parsed.environment.kind, fixtureJson.viewer.environment);
  assert.equal(parsed.view, null);
  assert.deepEqual(
    new Uint8Array(Buffer.from(parsed.model.base64, "base64")),
    MODEL_BYTES,
  );
});

test("rejects version 3 as newer and version 0 or 'x' as not a project", () => {
  const valid = createProjectDocument(baseInput());
  assert.throws(
    () => parseProjectDocument(JSON.stringify({ ...valid, version: 3 })),
    /needs a newer version of Studio Web/,
  );
  assert.throws(
    () => parseProjectDocument(JSON.stringify({ ...valid, version: 0 })),
    /This is not a Studio Web project/,
  );
  assert.throws(
    () => parseProjectDocument(JSON.stringify({ ...valid, version: "x" })),
    /This is not a Studio Web project/,
  );
});

test("rejects an hdri fileUrl outside /assets/ and a non-https sourceUrl", () => {
  const validHdri = {
    id: "studio-small-03",
    name: "Studio Small 03",
    source: "polyhaven",
    sourceUrl: "https://polyhaven.com/a/studio_small_03",
    licence: "CC0" as const,
    fileUrl: "/assets/hdri/studio-small-03.hdr",
  };
  const withBadFileUrl = {
    ...baseInput(),
    environment: { kind: "hdr" as const, rotation: 0, intensity: 1, hdri: { ...validHdri, fileUrl: "https://evil.example/leak.hdr" } },
  };
  assert.throws(
    () => createProjectDocument(withBadFileUrl),
    /fileUrl|assets/i,
  );

  const withBadSourceUrl = {
    ...baseInput(),
    environment: { kind: "hdr" as const, rotation: 0, intensity: 1, hdri: { ...validHdri, sourceUrl: "http://polyhaven.com/a/studio_small_03" } },
  };
  assert.throws(
    () => createProjectDocument(withBadSourceUrl),
    /sourceUrl|https/i,
  );
});
