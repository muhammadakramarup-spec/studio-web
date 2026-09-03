// Pure sampler. sampleState(state, t) is a pure function of (state, t): same inputs in,
// byte-identical SampledFrame out, no dependence on wall clock, frame delta, or call order.
// No mutation, no allocation cached across calls, no Math.random / Date.now / performance.now.
//
// Runnable as plain Node (no DOM, no three.js, no adapter) — see the perf/round-trip checks in
// tests/s4.spec.ts, which import this module directly.

import type { Channel, ChannelId, Keyframe, SampledFrame, Track, TimelineState } from "./types";
import { ease } from "./easing";

type Vec3 = [number, number, number];
type Vec4 = [number, number, number, number];

function lerpScalar(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function lerpVec3(a: Vec3, b: Vec3, u: number): Vec3 {
  return [lerpScalar(a[0], b[0], u), lerpScalar(a[1], b[1], u), lerpScalar(a[2], b[2], u)];
}

// Shortest-path quaternion slerp, no allocation beyond the returned tuple, no external dependency.
function slerpVec4(a: Vec4, b: Vec4, u: number): Vec4 {
  let [ax, ay, az, aw] = a;
  let [bx, by, bz, bw] = b;

  let cosHalfTheta = ax * bx + ay * by + az * bz + aw * bw;
  if (cosHalfTheta < 0) {
    bx = -bx; by = -by; bz = -bz; bw = -bw;
    cosHalfTheta = -cosHalfTheta;
  }

  if (cosHalfTheta > 0.9995) {
    // Nearly parallel: linear-interpolate and re-normalize to avoid a divide-by-near-zero.
    const rx = ax + (bx - ax) * u;
    const ry = ay + (by - ay) * u;
    const rz = az + (bz - az) * u;
    const rw = aw + (bw - aw) * u;
    const len = Math.sqrt(rx * rx + ry * ry + rz * rz + rw * rw) || 1;
    return [rx / len, ry / len, rz / len, rw / len];
  }

  const clamped = cosHalfTheta > 1 ? 1 : cosHalfTheta < -1 ? -1 : cosHalfTheta;
  const halfTheta = Math.acos(clamped);
  const sinHalfTheta = Math.sqrt(1 - clamped * clamped);
  const ratioA = Math.sin((1 - u) * halfTheta) / sinHalfTheta;
  const ratioB = Math.sin(u * halfTheta) / sinHalfTheta;
  return [
    ax * ratioA + bx * ratioB,
    ay * ratioA + by * ratioB,
    az * ratioA + bz * ratioB,
    aw * ratioA + bw * ratioB,
  ];
}

const DEFAULT_POSITION: Vec3 = [0, 0, 0];
const DEFAULT_QUATERNION: Vec4 = [0, 0, 0, 1];
const DEFAULT_SCALE: Vec3 = [1, 1, 1];

/** Find the bracketing pair of keys for t within a sorted (ascending by .t) key array, and the
 * eased local progress within that segment — the left key's `.easing` governs the segment out of
 * it (blender-fcurve-craft Trap 1, ported as a data rule: left key owns the segment). */
function sampleChannelRaw(channel: Channel, t: number): Keyframe["value"] {
  const keys = channel.keys;
  const n = keys.length;
  if (n === 0) {
    return channel.id === "quaternion" ? DEFAULT_QUATERNION : channel.id === "scale" ? DEFAULT_SCALE : channel.id === "position" ? DEFAULT_POSITION : 0;
  }
  if (n === 1 || t <= keys[0].t) return keys[0].value;
  if (t >= keys[n - 1].t) return keys[n - 1].value;

  // Linear scan for the enclosing segment — n is bounded (<=50/channel per SCOPE's perf target),
  // so this comfortably clears the <2ms budget without a binary search.
  let i = 0;
  for (; i < n - 1; i++) {
    if (t >= keys[i].t && t <= keys[i + 1].t) break;
  }
  const left = keys[i];
  const right = keys[i + 1];
  const span = right.t - left.t;
  const u = span <= 0 ? 1 : (t - left.t) / span;
  const easedU = ease(left.easing, u);

  if (channel.id === "quaternion") {
    return slerpVec4(left.value as Vec4, right.value as Vec4, easedU);
  }
  if (channel.id === "position" || channel.id === "scale") {
    return lerpVec3(left.value as Vec3, right.value as Vec3, easedU);
  }
  // camera.fov / camera.focalLength — scalar
  return lerpScalar(left.value as number, right.value as number, easedU);
}

function ensureTransform(frame: SampledFrame, targetId: string) {
  if (!frame.transforms[targetId]) {
    frame.transforms[targetId] = {
      position: [...DEFAULT_POSITION],
      quaternion: [...DEFAULT_QUATERNION],
      scale: [...DEFAULT_SCALE],
    };
  }
  return frame.transforms[targetId];
}

/** Pure: same (state, t) in, byte-identical SampledFrame out. Never mutates `state`. */
export function sampleState(state: TimelineState, t: number): SampledFrame {
  const frame: SampledFrame = { t, transforms: {} };

  for (const track of state.tracks) {
    for (const channel of track.channels) {
      const value = sampleChannelRaw(channel, t);
      switch (channel.id as ChannelId) {
        case "position":
          ensureTransform(frame, track.targetId).position = value as Vec3;
          break;
        case "quaternion":
          ensureTransform(frame, track.targetId).quaternion = value as Vec4;
          break;
        case "scale":
          ensureTransform(frame, track.targetId).scale = value as Vec3;
          break;
        case "camera.fov":
          frame.camera = frame.camera ?? {};
          frame.camera.fov = value as number;
          break;
        case "camera.focalLength":
          frame.camera = frame.camera ?? {};
          frame.camera.focalLength = value as number;
          break;
      }
    }
  }

  return frame;
}

export function findTrack(state: TimelineState, targetId: string): Track | undefined {
  return state.tracks.find((tr) => tr.targetId === targetId);
}
