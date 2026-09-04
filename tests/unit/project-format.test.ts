import assert from "node:assert/strict";
import test from "node:test";

import {
  blobToBase64,
  createProjectDocument,
  parseProjectDocument,
  projectModelBlob,
} from "../../src/project/format.ts";

const viewer = {
  focal: 50 as const,
  exposure: 1.05,
  environment: "room" as const,
  environmentRotation: 0,
  environmentIntensity: 1,
  transparent: false,
  spin: false,
  shadows: true,
  floor: true,
};

test("project round-trip preserves the active model, view, and timeline", async () => {
  const model = new Blob([new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2, 3, 4])], {
    type: "model/gltf-binary",
  });
  const document = createProjectDocument({
    name: "Coffee table study",
    model: {
      name: "coffee-table.glb",
      mime: "model/gltf-binary",
      base64: await blobToBase64(model),
    },
    viewer,
    timeline: { duration: 6, fps: 30, tracks: [] },
    savedAt: "2026-09-04T12:00:00.000Z",
  });

  const parsed = parseProjectDocument(JSON.stringify(document));
  assert.equal(parsed.format, "studio-web-project");
  assert.equal(parsed.version, 1);
  assert.equal(parsed.name, "Coffee table study");
  assert.deepEqual(parsed.viewer, viewer);
  assert.deepEqual(parsed.timeline, { duration: 6, fps: 30, tracks: [] });
  assert.deepEqual(
    new Uint8Array(await projectModelBlob(parsed).arrayBuffer()),
    new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2, 3, 4]),
  );
});

test("project parser rejects unsupported versions and malformed model data", () => {
  const valid = createProjectDocument({
    name: "Fixture",
    model: { name: "fixture.glb", mime: "model/gltf-binary", base64: "Z2xURg==" },
    viewer,
    timeline: { duration: 6, fps: 30, tracks: [] },
    savedAt: "2026-09-04T12:00:00.000Z",
  });

  assert.throws(
    () => parseProjectDocument(JSON.stringify({ ...valid, version: 2 })),
    /newer version of Studio Web/,
  );
  assert.throws(
    () => parseProjectDocument(JSON.stringify({ ...valid, model: { ...valid.model, base64: "***" } })),
    /model data is invalid/,
  );
  assert.throws(
    () => parseProjectDocument(JSON.stringify({ ...valid, timeline: { duration: 6, fps: 30, tracks: [{}] } })),
    /timeline is invalid/,
  );
});
