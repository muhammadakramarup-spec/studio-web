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
  // Format v2 (see tests/unit/project-v2.test.ts): createProjectDocument now always stamps the
  // current PROJECT_VERSION (2) on freshly created documents, and parseProjectDocument always
  // returns the upgraded v2 shape — a document built moments ago from live app state is never
  // "version 1" once it has round-tripped through the parser. Only a file actually saved under
  // the old format (see tests/fixtures/project-v1.studio.json, pinned forever) still carries a
  // literal version:1 on disk; parsing that also upgrades it to version 2 in memory (proven by
  // the "committed v1 fixture parses and upgrades to v2 defaults" test).
  assert.equal(parsed.version, 2);
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

  // Format v2: version 2 is now the current, accepted version (PROJECT_VERSION), so the "needs a
  // newer version" rejection now has to reach one version past it — 3, not 2 — to still exercise
  // the same code path.
  assert.throws(
    () => parseProjectDocument(JSON.stringify({ ...valid, version: 3 })),
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
