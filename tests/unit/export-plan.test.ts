// tests/unit/export-plan.test.ts — Wave 3 Function 1 (F1) unit coverage for
// src/timeline/export-plan.ts. Pattern: node:test, exactly like tests/unit/project-format.test.ts.

import assert from "node:assert/strict";
import test from "node:test";

import { planSequence } from "../../src/timeline/export-plan.ts";
import { sampleState } from "../../src/timeline/sampler.ts";
import type { TimelineState } from "../../src/timeline/types";

function stateWithPivotKeysAndStaleDuration(): TimelineState {
  // Mirrors addTurntableClip(6): keys at t=0,3,6 but state.duration left at 10
  // (src/timeline/index.ts:39,116-125) — the defect export-plan.ts must route around.
  return {
    duration: 10,
    fps: 30,
    tracks: [
      {
        id: "track_pivot_0",
        targetId: "pivot",
        channels: [
          {
            id: "quaternion",
            keys: [
              { t: 0, value: [0, 0, 0, 1], easing: "linear" },
              { t: 3, value: [0, 1, 0, 0], easing: "linear" },
              { t: 6, value: [0, 0, 0, -1], easing: "linear" },
            ],
          },
        ],
      },
    ],
  };
}

test("planSequence samples over the max authored key time, not state.duration", () => {
  const state = stateWithPivotKeysAndStaleDuration();
  const plan = planSequence(state, 24);

  assert.equal(plan.mode, "timeline");
  assert.equal(plan.duration, 6);
  assert.equal(plan.times.length, 24);
  assert.equal(plan.frames.length, 24);

  for (let i = 0; i < 24; i++) {
    const expectedT = (i * 6) / 24;
    assert.equal(plan.times[i], expectedT);
    assert.deepEqual(plan.frames[i], sampleState(state, expectedT));
  }
});

test("planSequence on an empty timeline yields default-sweep with a full-length times array", () => {
  const state: TimelineState = { duration: 10, fps: 30, tracks: [] };
  const plan = planSequence(state, 24);

  assert.equal(plan.mode, "default-sweep");
  assert.equal(plan.times.length, 24);
  assert.equal(plan.frames.length, 24);
});

test("planSequence uses the max key t even when keys live only on a non-pivot track", () => {
  const state: TimelineState = {
    duration: 10,
    fps: 30,
    tracks: [
      {
        id: "track_camera_0",
        targetId: "camera",
        channels: [
          {
            id: "camera.fov",
            keys: [
              { t: 0, value: 35, easing: "linear" },
              { t: 8, value: 55, easing: "linear" },
            ],
          },
        ],
      },
    ],
  };

  const plan = planSequence(state, 24);
  assert.equal(plan.mode, "timeline");
  assert.equal(plan.duration, 8);
  assert.equal(plan.times[plan.times.length - 1], (23 * 8) / 24);
});
