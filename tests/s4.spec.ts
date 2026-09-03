// S4 — Timeline & motion. Vite serves TypeScript directly; every check below runs the real
// src/timeline/** module inside the page via dynamic import, per SCOPE.md's testing instructions.
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("1. easing: 8 presets x 5 samples within 1e-3 of the committed fixture, f(0)=0 and f(1)=1 exactly", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { EASING } = await import("/src/timeline/easing.ts");
    const fixtureRes = await fetch("/src/timeline/fixtures/easing_expected.json");
    const fixture = await fixtureRes.json();
    const points: number[] = fixture.samplePoints;
    const failures: string[] = [];
    let endpointFailures = 0;
    let withinTolerance = 0;
    let total = 0;
    for (const [preset, expectedValues] of Object.entries(fixture.presets) as [string, number[]][]) {
      const fn = (EASING as Record<string, (u: number) => number>)[preset];
      for (let i = 0; i < points.length; i++) {
        total++;
        const t = points[i];
        const got = fn(t);
        const expected = expectedValues[i];
        const diff = Math.abs(got - expected);
        if (diff <= 1e-3) withinTolerance++;
        else failures.push(`${preset}@${t}: got ${got}, expected ${expected}, diff ${diff}`);
        if (t === 0 && got !== 0) { endpointFailures++; failures.push(`${preset}@0 !== 0 exactly (got ${got})`); }
        if (t === 1 && got !== 1) { endpointFailures++; failures.push(`${preset}@1 !== 1 exactly (got ${got})`); }
      }
    }
    return { total, withinTolerance, endpointFailures, failures, presetCount: Object.keys(fixture.presets).length };
  });

  console.log(`MEASURED easing: total=${result.total} withinTolerance=${result.withinTolerance} endpointFailures=${result.endpointFailures}`);
  expect(result.presetCount).toBe(8);
  expect(result.total).toBe(40); // 8 presets x 5 sample points
  expect(result.failures).toEqual([]);
  expect(result.withinTolerance).toBe(40);
  expect(result.endpointFailures).toBe(0);
});

test("2. sampleAt(t) is pure: 100 calls at t=1.234 are byte-identical", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { sampleState } = await import("/src/timeline/sampler.ts");
    const state = {
      duration: 10,
      fps: 30,
      tracks: [
        {
          id: "t1",
          targetId: "obj1",
          channels: [
            {
              id: "position",
              keys: [
                { t: 0, value: [0, 0, 0], easing: "easeInOut" },
                { t: 2, value: [5, -3, 2], easing: "back" },
                { t: 5, value: [1, 1, 1], easing: "bounce" },
              ],
            },
            {
              id: "quaternion",
              keys: [
                { t: 0, value: [0, 0, 0, 1], easing: "linear" },
                { t: 5, value: [0, 0.707106781, 0, 0.707106781], easing: "sineInOut" },
              ],
            },
          ],
        },
      ],
    };
    const outputs: string[] = [];
    for (let i = 0; i < 100; i++) {
      outputs.push(JSON.stringify(sampleState(state as any, 1.234)));
    }
    const distinct = new Set(outputs);
    return { distinctCount: distinct.size, sample: outputs[0], callCount: outputs.length };
  });

  console.log(`MEASURED purity: distinctOutputs=${result.distinctCount} of ${result.callCount} calls`);
  expect(result.callCount).toBe(100);
  expect(result.distinctCount).toBe(1); // every call produced byte-identical JSON
});

test("3. exportRange(duration,36) yields exactly 36 frames at the exact expected t", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { attachTimeline } = await import("/src/timeline/index.ts");
    let renderCalls = 0;
    const timeline = attachTimeline({
      applySampledFrame() {},
      renderNow() { renderCalls++; },
    });
    timeline.addKey("obj1", "position", 0, [0, 0, 0], "linear");
    timeline.addKey("obj1", "position", 8, [10, 10, 10], "linear");
    const duration = 8;
    const frameCount = 36;
    const frames = timeline.exportRange(duration, frameCount);
    const tMismatches: number[] = [];
    for (let i = 0; i < frameCount; i++) {
      const expectedT = (i * duration) / frameCount;
      if (frames[i].t !== expectedT) tMismatches.push(i);
    }
    return { length: frames.length, tMismatches, renderCallsDuringExport: renderCalls };
  });

  console.log(`MEASURED exportRange: frames.length=${result.length} tMismatches=${result.tMismatches.length} renderCallsDuringExport=${result.renderCallsDuringExport}`);
  expect(result.length).toBe(36);
  expect(result.tMismatches).toEqual([]);
  expect(result.renderCallsDuringExport).toBe(0); // exportRange is pure, never touches the adapter
});

test("4. scrub is not circular: independent scene assertion + renderNow called exactly once", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { attachTimeline } = await import("/src/timeline/index.ts");
    // Trivial local adapter over a plain object, per SCOPE's instruction to not import S1.
    const sceneObject = { position: [NaN, NaN, NaN] as [number, number, number] };
    let renderCalls = 0;
    const adapter = {
      applySampledFrame(frame: any) {
        const t = frame.transforms["obj1"];
        if (t) sceneObject.position = t.position;
      },
      renderNow() { renderCalls++; },
    };
    const timeline = attachTimeline(adapter);
    // Fixed keys per reviews/codex_review_S4.md:15 — [0,0,0]@t=0, [2,4,6]@t=2, linear.
    timeline.addKey("obj1", "position", 0, [0, 0, 0], "linear");
    timeline.addKey("obj1", "position", 2, [2, 4, 6], "linear");
    timeline.scrubTo(1);
    return { position: sceneObject.position, renderCalls };
  });

  console.log(`MEASURED scrub: position=[${result.position.join(",")}] renderCalls=${result.renderCalls}`);
  expect(Math.abs(result.position[0] - 1)).toBeLessThanOrEqual(1e-6);
  expect(Math.abs(result.position[1] - 2)).toBeLessThanOrEqual(1e-6);
  expect(Math.abs(result.position[2] - 3)).toBeLessThanOrEqual(1e-6);
  expect(result.renderCalls).toBe(1);
});

test("5. 50-key JSON round-trip is bit-identical", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { attachTimeline } = await import("/src/timeline/index.ts");
    const timeline = attachTimeline({ applySampledFrame() {}, renderNow() {} });

    const easings = ["linear", "easeIn", "easeOut", "easeInOut", "sineInOut", "back", "bounce", "constant"];
    const channels = ["position", "quaternion", "scale", "camera.fov", "camera.focalLength"];
    // Deterministic PRNG (mulberry32) so the "random" 50 keys are reproducible, not Math.random.
    function mulberry32(seed: number) {
      return function () {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const rand = mulberry32(42);
    for (let i = 0; i < 50; i++) {
      const channel = channels[Math.floor(rand() * channels.length)];
      const easing = easings[Math.floor(rand() * easings.length)];
      const t = Math.round(rand() * 1000) / 100;
      let value: any;
      if (channel === "position" || channel === "scale") {
        value = [rand() * 20 - 10, rand() * 20 - 10, rand() * 20 - 10];
      } else if (channel === "quaternion") {
        value = [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1];
      } else {
        value = rand() * 100;
      }
      timeline.addKey(`obj${i % 5}`, channel as any, t, value, easing as any);
    }

    const before = timeline.serialize();
    const parsed = JSON.parse(before);
    timeline.loadState(parsed);
    const after = timeline.serialize();

    return { before, after, bitIdentical: before === after };
  });

  console.log(`MEASURED roundtrip: bitIdentical=${result.bitIdentical} beforeLen=${result.before.length}`);
  expect(result.bitIdentical).toBe(true);
  expect(result.before).toBe(result.after);
});

test("6. scrub performance: sampleAt < 2ms for 20 tracks x 4 channels x 50 keys", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { attachTimeline } = await import("/src/timeline/index.ts");
    const timeline = attachTimeline({ applySampledFrame() {}, renderNow() {} });

    const channelIds = ["position", "quaternion", "scale", "camera.fov"];
    for (let track = 0; track < 20; track++) {
      const targetId = `obj${track}`;
      for (const channel of channelIds) {
        for (let k = 0; k < 50; k++) {
          const t = (k / 49) * 30;
          let value: any;
          if (channel === "position" || channel === "scale") value = [k, k * 0.5, -k];
          else if (channel === "quaternion") {
            const theta = (k / 49) * Math.PI * 2;
            value = [0, Math.sin(theta / 2), 0, Math.cos(theta / 2)];
          } else value = 20 + k;
          const easing = ["linear", "easeIn", "easeOut", "easeInOut", "sineInOut", "back", "bounce", "constant"][
            k % 8
          ];
          timeline.addKey(targetId, channel as any, t, value, easing as any);
        }
      }
    }

    // Warm up (JIT), then measure.
    for (let i = 0; i < 20; i++) timeline.sampleAt(15.5);
    const iterations = 1000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      timeline.sampleAt((i % 300) / 10);
    }
    const elapsed = performance.now() - start;
    const meanMs = elapsed / iterations;
    return { meanMs, iterations, totalMs: elapsed };
  });

  console.log(`MEASURED perf: meanMs=${result.meanMs.toFixed(4)} over ${result.iterations} iterations, totalMs=${result.totalMs.toFixed(2)}`);
  expect(result.meanMs).toBeLessThan(2);
});

test("7. turntable: 3 quaternion keys, sample at duration/2 yields rotation pi within 1e-6", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { attachTimeline } = await import("/src/timeline/index.ts");
    const timeline = attachTimeline({ applySampledFrame() {}, renderNow() {} });
    const duration = 6;
    timeline.addTurntableClip(duration, "pivot");
    const state = timeline.getState();
    const track = state.tracks.find((tr: any) => tr.targetId === "pivot");
    const channel = track?.channels.find((c: any) => c.id === "quaternion");
    const keyCount = channel?.keys.length ?? 0;

    const frame = timeline.sampleAt(duration / 2);
    const q = frame.transforms["pivot"].quaternion;
    // angle = 2*acos(w), clamped for float safety
    const w = Math.max(-1, Math.min(1, q[3]));
    const angle = 2 * Math.acos(w);

    return { keyCount, angle, q };
  });

  console.log(`MEASURED turntable: keyCount=${result.keyCount} angle=${result.angle} diffFromPi=${Math.abs(result.angle - Math.PI)}`);
  expect(result.keyCount).toBe(3);
  expect(Math.abs(result.angle - Math.PI)).toBeLessThanOrEqual(1e-6);
});
