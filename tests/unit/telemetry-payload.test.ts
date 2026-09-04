import assert from "node:assert/strict";
import test from "node:test";

import { buildTelemetryPayload } from "../../src/account/telemetry-payload.ts";

test("telemetry payload keeps only the allowlisted fields for its event", () => {
  const payload = buildTelemetryPayload(
    {
      type: "tool_used",
      tool: "add-light-point",
      prompt: "private customer prompt",
      email: "person@example.com",
    },
    "anon-fixture",
    1_788_523_200_000,
  );

  assert.deepEqual(payload, {
    type: "tool_used",
    tool: "add-light-point",
    anonId: "anon-fixture",
    ts: 1_788_523_200_000,
  });
});

test("telemetry payload rejects free text, non-finite durations, and unknown events", () => {
  assert.equal(
    buildTelemetryPayload({ type: "tool_used", tool: "../../customer/file.glb" }, "anon", 1),
    null,
  );
  assert.equal(
    buildTelemetryPayload(
      { type: "export_completed", exportKind: "still", ms: Number.POSITIVE_INFINITY },
      "anon",
      1,
    ),
    null,
  );
  assert.equal(buildTelemetryPayload({ type: "made_up" }, "anon", 1), null);
});
