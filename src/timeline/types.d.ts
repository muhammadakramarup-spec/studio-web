// FROZEN — src/timeline/types.d.ts, verbatim from SCOPE.md §2 "S4 — src/timeline/types.d.ts".
// Do not change a frozen signature. If a problem is found, record it in qa/latest.md instead.

export type EasingPreset =
  | "linear" | "easeIn" | "easeOut" | "easeInOut"
  | "sineInOut" | "back" | "bounce" | "constant";

export type ChannelId =
  | "position" | "quaternion" | "scale"
  | "camera.fov" | "camera.focalLength";

export interface Keyframe<V = number | [number, number, number] | [number, number, number, number]> {
  t: number;
  value: V;
  easing: EasingPreset;
}

export interface Channel {
  id: ChannelId;
  keys: Keyframe[];
}

export interface Track {
  id: string;
  targetId: string;
  channels: Channel[];
}

export interface TimelineState {
  tracks: Track[];
  duration: number;
  fps: number;
}

export interface SampledFrame {
  t: number;
  transforms: Record<string, { position: [number,number,number]; quaternion: [number,number,number,number]; scale: [number,number,number] }>;
  camera?: { fov?: number; focalLength?: number };
}

// REVIEW (reviews/codex_review_S4.md:3-13): replaces the unresolved `unknown` studio param
// with a typed adapter S1 (or its App-shell wrapper) implements.
export interface TimelineSceneAdapter {
  applySampledFrame(frame: SampledFrame): void;
  renderNow(): void;
}

export interface TimelineHandle {
  addKey(trackTarget: string, channel: ChannelId, t: number, value: Keyframe["value"], easing?: EasingPreset): void;
  removeKey(trackTarget: string, channel: ChannelId, t: number): void;
  addTurntableClip(duration: number, target?: string): void;   // 3 quaternion keys, reviews/codex_review_S4.md:19
  play(): void;
  pause(): void;
  scrubTo(t: number): void;
  sampleAt(t: number): SampledFrame;
  exportRange(duration: number, frameCount: number): SampledFrame[];
  getState(): TimelineState;
  loadState(state: TimelineState): void;
  serialize(): string;
  // REVIEW (reviews/codex_review_S4.md:23): lets S2 capture a timeline-originated key change
  // as one undo step, per src/timeline/SPEC.md:104-106's unmet promise.
  onChange(listener: (state: TimelineState) => void): () => void;
}

// REVIEW (reviews/codex_review_S4.md:3-13):
export declare function attachTimeline(adapter: TimelineSceneAdapter): TimelineHandle;
