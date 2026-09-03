# S4 Timeline & Motion — SPEC (Wave 1 scout)

Silo: S4. Status: spec only, no code, per DECISIONS.md #3. Interfaces below are a PROPOSAL for
`SCOPE.md` per DECISIONS.md #4 — not yet binding.

## 1. Targets (ordered, each with a numeric acceptance check)

1. **8 named easing presets ship, no curve editor.** `Linear, EaseIn, EaseOut, EaseInOut,
   SineInOut, Back, Bounce, Constant`. Check: each preset's sampler evaluated at
   t = {0, 0.25, 0.5, 0.75, 1} matches its reference table value within `1e-3`; `Constant`
   returns exactly the left key's value for every `t < 1`.
2. **Frame-exact sampling.** `sampleAt(t)` is a pure function of `t` — calling it twice at the
   same `t` produces bit-identical transform output. Check: call `sampleAt(1.234)` 100 times,
   assert `position/quaternion/scale` bytes are identical across all 100 calls (0 drift).
3. **Exported frame count equals requested frame count.** Check (per PRODUCT_PLAN.md:43 and the
   e2e test named in this brief): `exportRange(duration, frameCount)` invoked with
   `frameCount=36` yields exactly 36 sampled states, no dropped/duplicated frame, i.e.
   `frames.length === 36` and `frames[i].t === i * duration / 36` for every `i`.
4. **Scrub-to-frame accuracy.** Dragging the playhead to a target time `t` renders the state for
   that exact `t`, not the nearest previous rAF tick. Check: `scrubTo(t)` then read back scene
   transform; error vs. `sampleAt(t)` ground truth is `0` (same function, no separate scrub path).
5. **Keys round-trip.** Serialise a `TimelineState` with 50 random keys across tracks/channels to
   JSON and back. Check: every key's `{t, value, easing}` is bit-identical after round-trip
   (feeds S2's undo/redo, which needs an exact-equality check to detect no-op edits).
6. **Scrub performance.** Dragging the playhead re-samples and re-renders one frame. Check:
   `sampleAt(t)` for a timeline with 20 tracks × 4 channels × 50 keys completes in `< 2 ms` on
   the dev machine (pure math over sorted key arrays, no allocation in the hot path) — budget
   leaves headroom inside a 16 ms (60 fps) scrub frame shared with S1's render.
7. **Turntable is inherited, not rebuilt.** A "Turn 360°" clip auto-generates one rotation
   channel key pair (`0`, `2π`) on the selected object (or camera-orbit pivot) with `Linear`
   easing. Check: `addTurntableClip(duration)` produces exactly 2 keys, and sampling at
   `t = duration/2` yields rotation `π` within `1e-6`.

Anything below this line without a number attached is a cut, moved to §3.

## 2. Interface (proposed for `SCOPE.md`)

```ts
// src/timeline/types.d.ts — PROPOSED, not frozen until SCOPE.md signs it.

export type EasingPreset =
  | "linear" | "easeIn" | "easeOut" | "easeInOut"
  | "sineInOut" | "back" | "bounce" | "constant";

export type ChannelId =
  | "position" | "quaternion" | "scale"      // object transform (vec3 / quat(vec4, slerp) / vec3)
  | "camera.fov" | "camera.focalLength";     // camera-only scalars

export interface Keyframe<V = number | [number, number, number] | [number, number, number, number]> {
  t: number;            // seconds, timeline-absolute, >= 0
  value: V;
  easing: EasingPreset;  // interpolation OUT of this key, into the NEXT key (left-key-owns-segment,
                          // per blender-fcurve-craft Trap 1 — ported as a rule, not a Blender runtime)
}

export interface Channel {
  id: ChannelId;
  keys: Keyframe[];      // sorted ascending by t; caller (addKey) maintains order
}

export interface Track {
  id: string;            // uuid
  targetId: string;      // object uuid from S2 selection, or the literal "camera"
  channels: Channel[];
}

export interface TimelineState {
  tracks: Track[];
  duration: number;      // seconds
  fps: number;           // default 30, used only for UI grid + addTurntableClip default
}

export interface SampledFrame {
  t: number;
  transforms: Record<string, { position: [number,number,number]; quaternion: [number,number,number,number]; scale: [number,number,number] }>;
  camera?: { fov?: number; focalLength?: number };
}

export interface TimelineHandle {
  addKey(trackTarget: string, channel: ChannelId, t: number, value: Keyframe["value"], easing?: EasingPreset): void;
  removeKey(trackTarget: string, channel: ChannelId, t: number): void;
  addTurntableClip(duration: number, target?: string): void;   // target defaults to orbit pivot
  play(): void;
  pause(): void;
  scrubTo(t: number): void;             // moves playhead, calls sampleAt(t), applies to scene NOW
  sampleAt(t: number): SampledFrame;    // PURE — does not mutate playhead/UI, used by export
  exportRange(duration: number, frameCount: number): SampledFrame[]; // the S1 export hook
  getState(): TimelineState;
  loadState(state: TimelineState): void;
  serialize(): string;   // JSON, for S2 undo/redo snapshots
}

export declare function attachTimeline(studio: unknown /* S1's studio/scene handle, shape TBD in SCOPE.md */): TimelineHandle;
```

**What S4 needs FROM other silos (deferred to `SCOPE.md` per DECISIONS.md #4):**
- **From S1 (viewer/export silo):** a deterministic per-frame render hook that calls
  `timeline.sampleAt(t)` then applies the returned `SampledFrame` to the three.js scene graph
  and calls `renderer.render(...)` — mirroring the reference viewer's existing offscreen-export
  loop (`reference/lamp360viewer.html:989-1005`, `beginOffscreen`/`endOffscreen` at
  `:960`/`:973`), NOT real-time capture (`:1011-1054`, the WebM path, which the reference file's
  own comment at `:244` calls non-frame-exact). S1 owns pixel capture; S4 owns "what does the
  scene look like at time t".
- **From S2 (editor silo):** which object is currently selected (so `addKey` without an explicit
  target applies to it) and an undo/redo stack that snapshots `timeline.serialize()` alongside
  scene-graph edits, so a keyframe add/delete is one undo step.
- **From S3 (library silo):** clip/character asset paths and their animation-clip names (see §4)
  so `addKey`/a future "apply clip" convenience can reference `character-oobi.glb#walk` etc.
  S4 does not fetch or bundle assets itself.

**Why a custom sampler instead of three's `AnimationMixer`/`KeyframeTrack`:** three's built-in
interpolants (`InterpolateLinear`, `InterpolateSmooth`/Catmull-Rom, `InterpolateDiscrete`) cannot
express the Back/Bounce/overshoot presets target #1 requires, and `AnimationMixer` is a
delta-time accumulator (`mixer.update(delta)`) rather than an absolute-time-in, state-out
function, which fights target #2's "same t twice, identical output" requirement — so S4 writes
a small `sampleAt(t)` evaluator over plain sorted key arrays and leaves `AnimationMixer` to S3
only for *playing back* imported character clips (walk/idle/etc.) inside a channel, not for the
object/camera transform tracks this silo owns.

## 3. Cut list

- **Full Bézier curve editor (draggable handles, per-key custom tangents).** The
  `blender-fcurve-craft` skill's entire premise is hand-tuned handles (`carry`/`rest` helpers,
  boost-scaled slopes) — that is real curve-editor work and belongs to a desktop Blender-like
  tool, not a one-day web ship. Cut. The 8 presets in §1.1 are pre-baked cubic-bezier / piecewise
  functions chosen to cover the skill's guidance (see §5) without exposing handle math to the user.
- **Raw `EXPO` and `ELASTIC` presets.** Skill Trap 3: EXPO delivers only 3% of the distance in
  the first half over 24 frames and should never be used under ~40 frames — too easy to ship a
  broken-feeling default in a tool aimed at short web clips. Skill Trap 2: ELASTIC discards handle
  positions entirely, which conflicts with this silo's decision to implement everything as
  pre-baked curves rather than a mode-switched engine. Cut both; `Back`/`Bounce` cover the
  "punchy/game-like" motion need `Elastic` would have served.
- **Per-key custom easing beyond the 8 presets** (e.g., asymmetric in/out on the same key). Only
  the OUT-easing of a key is stored (§2, Trap 1 rule); a symmetric model only. Cut for today.
- **Noise modifiers (handheld camera shake, scale-as-period noise).** Real and useful (skill has
  a full section on it) but is a "nice motion" feature, not a shipping-today keyframe/export
  requirement. Cut, revisit post-launch.
- **Stagger / multi-object pair timing helpers.** Same reasoning — valuable for polish, not for
  "keyframe a turn, export 36 frames" acceptance test. Cut.
- **Driving `AnimationMixer` for the object/camera tracks.** See §2 justification. `AnimationMixer`
  may still be used narrowly by S3-provided character clips; S4's own tracks bypass it.
- **Quaternius characters.** CONTEXT.lock names Quaternius as a free CC0 source, but §4 shows
  Kenney already provides 7 rigged/animated characters on disk with 25-32 clips each — sufficient
  for today's ship. Fetching Quaternius is cut to keep S4 spec-only and avoid a live download
  during Wave 1 (scouts write specs only, DECISIONS.md #3).

## 4. Animated characters / clips — what's actually on disk

Ran the bundle scan myself (the `existing-3d-assets` skill's own text says "No characters —
`mini-characters-1` was not downloaded" — that line is **stale**; it missed the character models
bundled inside two other Kenney kits that were already fetched). Verified by parsing the GLB JSON
chunk of each file directly:

| Kit (on disk) | Character models | Anim clips per model | Skins |
|---|---|---|---|
| `downloaded/kenney/platformer-kit.zip` → `Models/GLB format/` | `character-oobi.glb`, `-oodi`, `-ooli`, `-oopi`, `-oozi` (5) | **25** each (`idle, walk, sprint, jump, fall, crouch, sit, die, pick-up, emote-yes/no, holding-*, attack-melee/kick-*, interact-*`) | 1 each |
| `downloaded/kenney/mini-dungeon.zip` → `Models/GLB format/` | `character-human.glb`, `character-orc.glb` (2) | **32** each (the 25 above + `wheelchair-sit/look-left/right/move-forward/back/left/right`) | 2 each |

**Total: 7 rigged, CC0-licensed, animated character models already on disk**, 25-32 baked clips
each, all `.glb` (glTF binary, three-loadable with no conversion). No download needed for a
character + walk-clip demo today. Both kits are already inventoried in
`C:\Users\muazz\Downloads\free_3d_assets_bundle\kenney_manifest.json`; CC0 licence per the
`existing-3d-assets` skill's blanket statement ("everything here is CC0 — both sources").

**Mixamo**: per CONTEXT.lock rule 3 and this brief, link out only (e.g. from the library UI's
"more characters" panel) — never fetch/bundle/redistribute a Mixamo FBX. Not attempted.

**Quaternius**: named in the brief as a possible CC0 source; not present anywhere in the bundle
(`polyhaven_models.json`, `kenney_manifest.json` have no Quaternius entries) and not fetched —
cut per §3, since Kenney already covers the need.

## 5. Reference viewer — what S4 inherits vs. builds

The reference viewer already implements a correct, deterministic turntable + export loop; S4
should drive its `sampleAt`/`exportRange` through the *same shape* of loop rather than inventing
a new one:

- **Deterministic per-frame state, not real-time capture.** `exportZip` (PNG path) sets
  `pivot.rotation.y` directly from the frame index — `pivot.rotation.y=base+i*Math.PI*2/n`
  (`reference/lamp360viewer.html:997`) — then renders and captures via `toBlob`, one frame per
  loop iteration, `n` iterations for `n` frames. This is exactly target #3's model: frame count
  in loop === frame count out. S4's `exportRange(duration, frameCount)` should be called from
  inside an equivalent loop, replacing the single rotation assignment with
  `timeline.sampleAt(i * duration / frameCount)` applied to the full scene, not just one pivot.
- **Offscreen render state save/restore.** `beginOffscreen`/`endOffscreen`
  (`reference/lamp360viewer.html:960`, `:973`) swap renderer size/pixel-ratio/camera for the
  export resolution and restore afterward, and explicitly set `spin=false` during export so the
  live idle-spin loop (`:1265`, `if(spin&&active) pivot.rotation.y+=d*(spd/100)*Math.PI`) can't
  race the export. S4 inherits this: the timeline's own `scrubTo`/live playback must be paused
  the same way while `exportRange` runs, for the same reason.
  **Frame-exact vs. real-time is a documented, deliberate split** in the reference file itself —
  the export panel's own note (`:244`) says PNG-sequence export is "lossless and frame-exact...
  use it for the real deliverable," while WebM is "real-time browser capture... carries no
  duration metadata." S4's `exportRange` targets the PNG/frame-exact contract only; WebM (if S1
  offers it) is out of scope for "exported sequence length equals timeline length."
- **What S4 does NOT rebuild:** camera framing (`frameModel`/`idealDist`, referenced but not
  owned here — S1's job), the offscreen resolution/pixel-ratio switch, the PNG/ZIP packaging, and
  the busy/cancel/progress UI (`setBusy`, `prog`, `cancelFlag` around `:944-955`). S4 only needs
  to hand S1 a pure `t -> SampledFrame` function per frame index; S1's existing loop shape does
  the rest.

## 6. Risks (ranked, with mitigation and fallback)

1. **`AnimationMixer` still ends up needed for character clips inside a channel, and its
   delta-time model collides with S4's absolute-time `sampleAt`.** Mitigation: S3's character
   clip playback is sampled the same way — call `action.time = t (mod clipDuration); mixer.update(0)`
   for zero-delta, deterministic evaluation, never `update(realDelta)` during export. Fallback: if
   that proves unreliable under measurement, S4 exposes only clip *triggers* (start-at-t) for
   Wave 1 and treats frame-exact character-clip export as a cut, keeping object/camera transform
   export (the acceptance test's actual subject, per PRODUCT_PLAN.md:43) solid.
2. **8 presets is a judgment call, not a spec-mandated number** — could be seen as over- or
   under-scoped once S2's editor UI is built (e.g. no room for 8 buttons). Mitigation: presets are
   a plain enum in `types.d.ts`; trimming to fewer is a one-line UI change, not a data-model
   change, so the risk is cheap to absorb late. Fallback: ship the 4 non-controversial ones
   (Linear, EaseIn, EaseOut, EaseInOut) first if the editor silo is tight on time; Back/Bounce/
   Sine/Constant are additive.
3. **Bounce is not representable as a single cubic-bezier** (needs a piecewise function per Blender
   convention) — slightly more code than the other 7 presets, and the one preset most likely to
   have an off-by-one/discontinuity bug at segment boundaries. Mitigation: target #1's numeric
   check (5 sample points within 1e-3 of reference table) specifically catches this. Fallback: cut
   Bounce to 7 presets if it can't be verified in time; Back already covers "playful overshoot."
4. **`sampleAt` performance target (<2 ms for 20×4×50 keys) is unmeasured until real code exists**
   — this scout did not implement or benchmark it. Mitigation: the data shape (sorted arrays,
   binary/linear search for the enclosing segment) is deliberately simple math with no allocation,
   so the risk is low, but Wave 2 must measure it, not assume it. Fallback: if scrub is janky,
   cache the last-found segment index and search outward from it (scrubbing is usually
   monotonic), a well-known cheap win.
5. **Interfaces here are unfrozen (DECISIONS.md #4) until `SCOPE.md` signs at 10:15** — S1/S2/S3
   SPEC.md files did not exist yet at scan time (checked `src/{viewer,editor,library,app,account,ai}/SPEC.md`,
   all absent), so the "FROM S1/S2/S3" needs in §2 are this silo's best guess, not confirmed
   against sibling specs. Mitigation: kept the surface area small (one render hook, one selection
   getter, one clip-path convention) specifically so it's cheap to reconcile at merge time.

## 7. Evidence

- `blender-fcurve-craft` skill (Traps 1-4, amplitude table, noise-scale section) — basis for the
  left-key-owns-segment rule in §2's `Keyframe.easing` field, the EXPO/ELASTIC cuts in §3, and the
  "no curve editor" framing of §1.1/§3.
- `reference/lamp360viewer.html:960` `beginOffscreen` — offscreen render-state save.
- `reference/lamp360viewer.html:973` `endOffscreen` — restore + `onResize()`.
- `reference/lamp360viewer.html:989-1005` `exportZip` — deterministic per-frame loop, `n` in ==
  `n` out; `:997` sets `pivot.rotation.y` per frame index (the pattern §5/target #3 generalises).
- `reference/lamp360viewer.html:244` export-panel note — PNG sequence "lossless and frame-exact,"
  WebM "real-time browser capture... no duration metadata."
- `reference/lamp360viewer.html:1011-1054` `exportWebm` — real-time capture path, explicitly out
  of scope for target #3's numeric check.
- `reference/lamp360viewer.html:1260,1265` idle-spin loop (`clock`, `if(spin&&active)`) — why
  live playback must pause during export (§5).
- `existing-3d-assets` skill — "No characters — `mini-characters-1` was not downloaded" (stale;
  contradicted by §4's direct GLB scan).
- `C:\Users\muazz\Downloads\free_3d_assets_bundle\downloaded\kenney\platformer-kit.zip` and
  `...\mini-dungeon.zip` — GLB JSON-chunk scan performed by this scout (`animations`/`skins`
  arrays read directly, not from the skill's index), producing the 7-character, 25-32-clip counts
  in §4.
- `C:\3D-Studio\02_projects\studio-web\PRODUCT_PLAN.md:43` — "exported sequence length equals
  timeline length" (the acceptance test target #3 is written against) and "keyframe timeline with
  easing presets" (`:21`).
- `C:\3D-Studio\02_projects\studio-web\CONTEXT.lock.md` — scope fence (timeline in-scope,
  physics/mesh-editing/node-editor out), Mixamo link-out-only rule.
- `C:\3D-Studio\02_projects\studio-web\DECISIONS.md` #2 (heartbeat = events.jsonl), #3
  (spec-only, no code/installs this wave), #4 (interfaces deferred to SCOPE.md, proposed not
  assumed).
- Checked and found absent at scan time: `src/viewer/SPEC.md`, `src/editor/SPEC.md`,
  `src/library/SPEC.md`, `src/app/SPEC.md`, `src/account/SPEC.md`, `src/ai/SPEC.md` — §2's
  "FROM S1/S2/S3" needs are this silo's proposal, unconfirmed against siblings.
