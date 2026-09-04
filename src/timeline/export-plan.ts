// src/timeline/export-plan.ts — Wave 3 Function 1 (timeline-sampled export).
// Ownership: F1 (docs/handoffs/2026-09-04-claude-design-product-v1-execution-handoff.md).
// Pure planning helper: no DOM, no three.js — importable and runnable as plain Node, exactly like
// ./sampler.ts's own module contract (see tests/unit/export-plan.test.ts).

import type { SampledFrame, TimelineState } from "./types";
// Explicit .ts extension (tsconfig's allowImportingTsExtensions) — required so this module
// resolves under plain `node --test` (tests/unit/export-plan.test.ts), not only under Vite's
// browser bundler, which is more permissive about extension-less specifiers.
import { sampleState } from "./sampler.ts";

export type ExportPlanMode = "timeline" | "default-sweep";

export interface ExportPlan {
  mode: ExportPlanMode;
  duration: number;
  times: number[];
  frames: SampledFrame[];
}

function hasAnyKey(state: TimelineState): boolean {
  return state.tracks.some((track) => track.channels.some((channel) => channel.keys.length > 0));
}

// Duration is the maximum authored key `t` across ALL tracks/channels — deliberately NOT
// `state.duration`, which addTurntableClip leaves stale (src/timeline/index.ts:39,116-125 writes
// keys at t=0..duration but never touches state.duration itself). Sampling over state.duration
// instead of this would freeze the tail of every export past the last authored key.
function maxKeyTime(state: TimelineState): number {
  let max = 0;
  for (const track of state.tracks) {
    for (const channel of track.channels) {
      for (const key of channel.keys) {
        if (key.t > max) max = key.t;
      }
    }
  }
  return max;
}

/**
 * Pure: same (state, frames) in, byte-identical ExportPlan out. Never mutates `state`.
 *
 * `mode` is "default-sweep" when no channel on any track has a key (nothing authored to sample —
 * the caller should fall back to the built-in linear rotation sweep). Otherwise "timeline".
 *
 * `times[i] = i * duration / frames` for every i in [0, frames) — frame 0 at t=0, and the last
 * frame never duplicates the first (same semantics as the legacy sweep / TimelineHandle.exportRange).
 */
export function planSequence(state: TimelineState, frames: number): ExportPlan {
  const mode: ExportPlanMode = hasAnyKey(state) ? "timeline" : "default-sweep";
  const duration = maxKeyTime(state);
  const times: number[] = [];
  const sampled: SampledFrame[] = [];
  for (let i = 0; i < frames; i++) {
    const t = (i * duration) / frames;
    times.push(t);
    sampled.push(sampleState(state, t));
  }
  return { mode, duration, times, frames: sampled };
}
