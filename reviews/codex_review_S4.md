Q1. The deterministic imported-character `AnimationMixer` path is the likeliest box-breaker ([src/timeline/SPEC.md:204](C:/3D-Studio/02_projects/studio-web/src/timeline/SPEC.md:204)); it adds skeletal animation, clip wrapping, mixer-state control, and S3/S4 integration. Replace it today with object/camera transform sampling only, leaving character clips as non-frame-exact S3 playback, as the existing fallback permits ([src/timeline/SPEC.md:208](C:/3D-Studio/02_projects/studio-web/src/timeline/SPEC.md:208)).

Q2. S1 needs a typed scene application/render adapter, but `attachTimeline` accepts unresolved `unknown` ([src/timeline/SPEC.md:93](C:/3D-Studio/02_projects/studio-web/src/timeline/SPEC.md:93)). Add:

```ts
export interface TimelineSceneAdapter {
  applySampledFrame(frame: SampledFrame): void;
  renderNow(): void;
}
export declare function attachTimeline(
  studio: TimelineSceneAdapter
): TimelineHandle;
```

Q3. Yes—the scrub check is circular because it treats `sampleAt(t)` from the same implementation as ground truth ([src/timeline/SPEC.md:19](C:/3D-Studio/02_projects/studio-web/src/timeline/SPEC.md:19)). Replace it with two fixed linear position keys at `t=0 → [0,0,0]` and `t=2 → [2,4,6]`; after `scrubTo(1)`, independently assert the scene object is `[1,2,3] ± 1e-6` and `renderNow` was called exactly once.

Further findings, ranked:

1. Two quaternion keys cannot represent a full turn because the `0` and `2π` orientations are equivalent ([src/timeline/SPEC.md:29](C:/3D-Studio/02_projects/studio-web/src/timeline/SPEC.md:29)). Require three quaternion keys at `0`, `duration/2`, and `duration`, representing `0`, `π`, and `2π`.

2. The easing acceptance test references a table that the SPEC never supplies ([src/timeline/SPEC.md:10](C:/3D-Studio/02_projects/studio-web/src/timeline/SPEC.md:10)). Add the exact 8×5 expected-value table to the test fixture.

3. S2 cannot capture timeline-originated key changes as one undo step despite that promise ([src/timeline/SPEC.md:104](C:/3D-Studio/02_projects/studio-web/src/timeline/SPEC.md:104)). Add `onChange(listener: (state: TimelineState) => void): () => void` to `TimelineHandle`.