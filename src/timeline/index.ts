// S4 — Timeline & motion. Public entry point: attachTimeline(adapter) -> TimelineHandle.
// Ownership: src/timeline/** only (DECISIONS.md #20). Frozen interface: ./types.d.ts.

import type {
  ChannelId,
  Channel,
  EasingPreset,
  Keyframe,
  SampledFrame,
  Track,
  TimelineHandle,
  TimelineSceneAdapter,
  TimelineState,
} from "./types";
import { sampleState } from "./sampler";

export type {
  ChannelId,
  Channel,
  EasingPreset,
  Keyframe,
  SampledFrame,
  Track,
  TimelineHandle,
  TimelineSceneAdapter,
  TimelineState,
} from "./types";
export { sampleState } from "./sampler";
export { EASING, ease } from "./easing";

function cloneState(state: TimelineState): TimelineState {
  // structuredClone is available in every browser this project targets (r170/ES2022) and in
  // Node >=17; JSON round-trip is a safe fallback for any other host.
  if (typeof structuredClone === "function") return structuredClone(state);
  return JSON.parse(JSON.stringify(state));
}

function makeEmptyState(): TimelineState {
  return { tracks: [], duration: 10, fps: 30 };
}

function findOrCreateTrack(state: TimelineState, targetId: string): Track {
  let track = state.tracks.find((tr) => tr.targetId === targetId);
  if (!track) {
    track = { id: `track_${targetId}_${state.tracks.length}`, targetId, channels: [] };
    state.tracks.push(track);
  }
  return track;
}

function findOrCreateChannel(track: Track, channelId: ChannelId): Channel {
  let channel = track.channels.find((c) => c.id === channelId);
  if (!channel) {
    channel = { id: channelId, keys: [] };
    track.channels.push(channel);
  }
  return channel;
}

function insertKeySorted(channel: Channel, key: Keyframe) {
  const keys = channel.keys;
  const existingIdx = keys.findIndex((k) => k.t === key.t);
  if (existingIdx !== -1) {
    keys[existingIdx] = key;
    return;
  }
  let i = 0;
  while (i < keys.length && keys[i].t < key.t) i++;
  keys.splice(i, 0, key);
}

// Turntable quaternion at angle theta about the Y axis: (0, sin(theta/2), 0, cos(theta/2)).
function quatY(theta: number): [number, number, number, number] {
  return [0, Math.sin(theta / 2), 0, Math.cos(theta / 2)];
}

export function attachTimeline(adapter: TimelineSceneAdapter): TimelineHandle {
  let state: TimelineState = makeEmptyState();
  let playing = false;
  let currentT = 0;
  let rafHandle: number | null = null;
  const listeners = new Set<(s: TimelineState) => void>();

  function notify() {
    for (const l of listeners) l(state);
  }

  function addKey(
    trackTarget: string,
    channel: ChannelId,
    t: number,
    value: Keyframe["value"],
    easing: EasingPreset = "linear"
  ): void {
    const track = findOrCreateTrack(state, trackTarget);
    const ch = findOrCreateChannel(track, channel);
    insertKeySorted(ch, { t, value, easing });
    notify();
  }

  function removeKey(trackTarget: string, channel: ChannelId, t: number): void {
    const track = state.tracks.find((tr) => tr.targetId === trackTarget);
    if (!track) return;
    const ch = track.channels.find((c) => c.id === channel);
    if (!ch) return;
    const idx = ch.keys.findIndex((k) => k.t === t);
    if (idx !== -1) {
      ch.keys.splice(idx, 1);
      notify();
    }
  }

  // 3 quaternion keys, not 2: 0 and 2π are the same orientation, so two keys describe no
  // rotation at all (reviews/codex_review_S4.md:19). Keys at t = 0, duration/2, duration
  // representing rotation 0, π, 2π about Y.
  function addTurntableClip(duration: number, target = "pivot"): void {
    const track = findOrCreateTrack(state, target);
    const ch = findOrCreateChannel(track, "quaternion");
    ch.keys = [
      { t: 0, value: quatY(0), easing: "linear" },
      { t: duration / 2, value: quatY(Math.PI), easing: "linear" },
      { t: duration, value: quatY(2 * Math.PI), easing: "linear" },
    ];
    notify();
  }

  function play(): void {
    if (playing) return;
    playing = true;
    if (typeof requestAnimationFrame !== "function") return; // no-op outside a browser
    const startWall = typeof performance !== "undefined" ? performance.now() : Date.now();
    const startT = currentT;
    const tick = () => {
      if (!playing) return;
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const elapsed = (now - startWall) / 1000;
      const t = startT + elapsed;
      if (t >= state.duration) {
        scrubTo(state.duration);
        playing = false;
        return;
      }
      scrubTo(t);
      rafHandle = requestAnimationFrame(tick);
    };
    rafHandle = requestAnimationFrame(tick);
  }

  function pause(): void {
    playing = false;
    if (rafHandle !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(rafHandle);
    }
    rafHandle = null;
  }

  // scrubTo moves the playhead, applies the sampled state to the scene via the adapter, and
  // renders exactly once. It reuses sampleAt/sampleState as ground truth — the scrub check's own
  // independence comes from the test asserting against the scene object directly, not from this
  // function using a different sampler (reviews/codex_review_S4.md:15).
  function scrubTo(t: number): void {
    currentT = t;
    const frame = sampleState(state, t);
    adapter.applySampledFrame(frame);
    adapter.renderNow();
  }

  // PURE — same (state, t) in, byte-identical SampledFrame out. Does not mutate playhead/UI,
  // does not touch the adapter. Used directly by exportRange.
  function sampleAt(t: number): SampledFrame {
    return sampleState(state, t);
  }

  function exportRange(duration: number, frameCount: number): SampledFrame[] {
    const frames: SampledFrame[] = [];
    for (let i = 0; i < frameCount; i++) {
      frames.push(sampleAt((i * duration) / frameCount));
    }
    return frames;
  }

  function getState(): TimelineState {
    return cloneState(state);
  }

  function loadState(next: TimelineState): void {
    state = cloneState(next);
    notify();
  }

  function serialize(): string {
    return JSON.stringify(state);
  }

  function onChange(listener: (s: TimelineState) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    addKey,
    removeKey,
    addTurntableClip,
    play,
    pause,
    scrubTo,
    sampleAt,
    exportRange,
    getState,
    loadState,
    serialize,
    onChange,
  };
}
