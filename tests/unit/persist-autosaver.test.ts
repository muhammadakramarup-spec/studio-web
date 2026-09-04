// tests/unit/persist-autosaver.test.ts — D-2 (status/warden-log.md "defect D-2 opened").
//
// createAutosaver's debounce/re-arm behavior against a fake RecoveryStore. Node has no
// `document`/`window`, which createAutosaver already guards (see the `typeof document !==
// "undefined"` / `typeof window !== "undefined"` checks around its visibilitychange/pagehide
// listeners), so this runs the same module unmodified.

import assert from "node:assert/strict";
import test from "node:test";

import { createAutosaver } from "../../src/app/persist.ts";
import type { ProjectDocumentV2 } from "../../src/project/format.ts";
import type { RecoveryRecord, RecoveryStore } from "../../src/app/persist.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeStore(): { store: RecoveryStore; saves: (ProjectDocumentV2 | "busy")[] } {
  const saves: (ProjectDocumentV2 | "busy")[] = [];
  const store: RecoveryStore = {
    async save(doc: ProjectDocumentV2): Promise<void> {
      saves.push(doc);
    },
    async load(): Promise<RecoveryRecord | null> {
      return null;
    },
    async clear(): Promise<void> {},
  };
  return { store, saves };
}

test("a busy capture re-arms the debounce and saves once the viewer is free", async () => {
  const { store, saves } = fakeStore();
  const minimalDoc = { name: "fixture" } as unknown as ProjectDocumentV2;
  let call = 0;
  const autosaver = createAutosaver({
    store,
    capture: async () => {
      call += 1;
      if (call <= 2) return "busy";
      return minimalDoc;
    },
    debounceMs: 10,
  });

  autosaver.markDirty();
  await sleep(120);

  assert.equal(saves.length, 1);
  assert.equal(saves[0], minimalDoc);
  assert.ok(!saves.includes("busy" as unknown as ProjectDocumentV2), 'the string "busy" must never be saved');

  autosaver.dispose();
});

test("a null capture does not save and does not re-arm", async () => {
  const { store, saves } = fakeStore();
  let captureCalls = 0;
  const autosaver = createAutosaver({
    store,
    capture: async () => {
      captureCalls += 1;
      return null;
    },
    debounceMs: 10,
  });

  autosaver.markDirty();
  await sleep(80);

  assert.equal(saves.length, 0);
  assert.equal(captureCalls, 1);

  autosaver.dispose();
});

test("dispose stops a pending busy retry", async () => {
  const { store, saves } = fakeStore();
  let captureCalls = 0;
  const autosaver = createAutosaver({
    store,
    capture: async () => {
      captureCalls += 1;
      return "busy" as const;
    },
    debounceMs: 10,
  });

  autosaver.markDirty();
  setTimeout(() => autosaver.dispose(), 15);
  await sleep(80);

  assert.ok(captureCalls <= 2, `expected capture to be called at most twice, got ${captureCalls}`);
  assert.equal(saves.length, 0);
});
