# S2 Editor — SPEC (Wave 1 scout)

Scope fence restated (binding, `CONTEXT.lock.md`): no mesh editing, no sculpting, no node editor, no
physics, no path tracing. This SPEC proposes; nothing here is frozen until `SCOPE.md` is signed
(DECISION #4).

`three` version proposal: **0.170.0** (r170). Verified via jsdelivr package listing for
`three@0.170.0` that everything S2 needs ships in `examples/jsm`: `controls/TransformControls.js`
(41,663 bytes), `postprocessing/EffectComposer.js`, `postprocessing/UnrealBloomPass.js`,
`postprocessing/OutputPass.js`, `environments/RoomEnvironment.js`. This is an external-registry
check, not a local file — no file:line available; source is `data.jsdelivr.com/v1/packages/npm/three@0.170.0`
queried during this scout pass. If S1 pins a different r17x release, re-verify these five files exist
in it before Wave 2 — the pin is a one-line check.

---

## 1. Targets (ordered; each has a numeric acceptance check)

Numeric convention matches the existing harness (`reference/harness/vlib.py:19-24,36-39`): a canvas
snapshot diff gives `mean` (per-channel delta), `max`, and `moved` (% of pixels with per-channel
delta > 2). `Report.changed()` at `reference/harness/vlib.py:36` passes when `moved >= 0.5`;
`Report.same()` at `reference/harness/vlib.py:39` passes when `mean <= 0.6`. S2's checks reuse these
floors so QA can drop them straight into a `Report`.

1. **Undo/redo command stack.** Foundational — every other target below is implemented as a
   command so it is undoable for free. `PRODUCT_PLAN.md` names this explicitly: *"undo/redo
   round-trips 50 random ops."*
   **Check:** generate 50 random ops from the op set in §2 (add/remove/transform/material/mirror/
   array/postFX), apply them, undo 50 times, compare final scene state to the initial snapshot —
   pixel diff `same()` with `mean <= 0.6` against the pre-op canvas snapshot, AND a serialized
   transform/material property diff of every object equals the initial serialization exactly
   (floats compared at 1e-5). Then redo 50 times and diff against the pre-undo snapshot the same
   way. Both round-trips must pass.

2. **Selection: raycast + outliner list.** Needed before gizmos/material panel/add have anything
   to act on.
   **Check:** outliner list length exactly equals `scene.traverse` count of
   `{Mesh, Light, Camera}` (excluding helpers/gizmo scaffolding) after any op; clicking outliner
   row *i* sets `selection` to the same object a raycast click on that object's on-screen bounding-box
   centre would return, for all *i* — 100% match required (deterministic, not a percentage floor).

3. **Gizmos (`TransformControls`), translate/rotate/scale modes.** Ships free from
   `examples/jsm/controls/TransformControls.js` in r170 (verified above) — this is UI wiring, not a
   new algorithm.
   **Check:** with an object selected, a synthetic drag on the translate gizmo along one axis
   changes the object's `position` component by the dragged delta (±1e-3) AND the canvas diff
   passes `changed()` (`moved >= 0.5%`) against the pre-drag snapshot. Same check repeated for
   rotate (angle delta) and scale (scale-factor delta).

4. **Add light / camera / primitive.** Cheap: `new THREE.PointLight/DirectionalLight/SpotLight`,
   `new THREE.PerspectiveCamera`, `BoxGeometry/SphereGeometry/CylinderGeometry/PlaneGeometry` +
   `MeshStandardMaterial`, each wrapped as an undoable add-op (§1).
   **Check:** after "Add", `scene` object count of the requested type increases by exactly 1;
   for lights and non-zero-size primitives, canvas diff passes `changed()` (`moved >= 0.5%`)
   against the pre-add snapshot (a camera add alone need not change pixels, so it is checked by
   count only).

5. **PBR material panel.** Ports directly from the reference's material bookkeeping — same fields,
   same reset-to-original pattern. `reference/lamp360viewer.html:511-539` (`prepMaterials`)
   already collects `color`, `roughness`, `metalness`, `emissive`, `emissiveIntensity` per material
   into `m.userData.__orig` for reset, and forces `side=DoubleSide` plus max anisotropy on maps —
   S2 reuses this shape for its slider panel instead of re-deriving it.
   **Check:** dragging the roughness slider from 0.9 → 0.1 (or metalness 0→1, or color hue swap)
   on the selected mesh, under a fixed HDRI, passes `changed()` (`moved >= 0.5%`) against the
   pre-drag snapshot; reset-to-original returns `mean <= 0.6` against the pre-edit snapshot
   (`same()`).

6. **Mirror modifier.** Cheap — a linked duplicate `Object3D`/`Group` whose local transform mirrors
   the source (`scale.x = -1` on the relevant axis, or an explicit reflection matrix), re-synced
   whenever the source's geometry/material reference changes. This is matrix work on a `Group`, not
   topology, so it fits the box; it is a live "linked" mirror (source edits propagate), not a
   destructively-merged mesh (destructive merge would be mesh editing, which is fenced).
   **Check:** enabling mirror on axis X doubles the visible triangle count exactly (own
   `prepMaterials`-style counter, pattern at `reference/lamp360viewer.html:511-521`, tri += ...),
   and the mirrored copy's world-space bounding box min/max are the source's negated on the mirror
   axis within 1e-4.

7. **Array modifier.** Cheap — `count` linked clones (or one `InstancedMesh` once count > ~20)
   offset along a vector, same live-linked model as mirror.
   **Check:** setting count = *N* yields exactly *N* visible instances (`object.count` for
   `InstancedMesh`, or scene child count for clones), and canvas diff passes `changed()`
   (`moved >= 0.5%`) between count = 1 and count = 5 at a fixed camera.

8. **Post FX: bloom + vignette + colour grade.** `EffectComposer` + `UnrealBloomPass` +
   `OutputPass` ship free in r170 (verified above); vignette and colour grade (exposure/contrast/
   saturation) are one small custom `ShaderPass` each (~20–30 lines, ports the "Studio light" /
   tone-mapping intent already in the reference's light rig at
   `reference/lamp360viewer.html:356-369`, which this silo does not re-derive, only extends with a
   post pass).
   **Check:** with a bright emissive test primitive in frame, toggling bloom on passes `changed()`
   (`moved >= 0.5%`) restricted to pixels within the emissive object's screen-space bounds; toggling
   vignette darkens the four corner 20×20-px samples by a measurable mean delta (`diff()` on the
   corner crop, `mean >= 3`) with the centre crop `same()` (`mean <= 0.6`); a grade preset change
   (e.g. saturation → 0) passes `changed()` globally.
   **VRAM note (estimate, not measured — flag for QA):** the reference caps pixel ratio at
   `Math.min(devicePixelRatio, 2)` (`reference/lamp360viewer.html:337`). On the 4 GB GTX 1650, an
   `EffectComposer` chain adds 2 ping-pong RGBA targets plus `UnrealBloomPass`'s 5-level mip chain;
   at a capped composer resolution this is tens of MB, not hundreds — but stacked with several
   4K PBR texture sets from a loaded GLB it is not free. Proposal: when any post FX pass is
   active, cap `renderer.setPixelRatio` at **1.5** instead of the reference's 2 (one-line change
   at the editor's own render-hook, not a change to S1's default). This is a proposal for
   Wave-2 QA to confirm with a measured VRAM/FPS number — it is explicitly not claimed as measured
   here.

---

## 2. Interface

```ts
// src/editor/index.ts — S2's exposed surface

export type EditorOpKind =
  | "add" | "remove" | "transform" | "material"
  | "mirror" | "array" | "postfx";

export interface EditorOp {
  id: string;
  kind: EditorOpKind;
  label: string;      // e.g. "Add point light", "Set roughness"
  do(): void;
  undo(): void;
}

export interface AddPayload {
  kind:
    | "light-point" | "light-directional" | "light-spot"
    | "camera"
    | "primitive-box" | "primitive-sphere" | "primitive-cylinder" | "primitive-plane";
  at?: [number, number, number];   // default: origin / camera target
}

export interface MaterialPatch {
  color?: number;             // hex
  roughness?: number;         // 0..1
  metalness?: number;         // 0..1
  emissive?: number;          // hex
  emissiveIntensity?: number;
}

export interface PostFXPatch {
  bloom?: { enabled: boolean; strength?: number; radius?: number; threshold?: number };
  vignette?: { enabled: boolean; amount?: number };   // 0..1
  grade?: { exposure?: number; contrast?: number; saturation?: number };
}

export interface OutlinerRow {
  id: string;
  name: string;
  type: "Mesh" | "Light" | "Camera" | "Group";
  object: unknown;   // THREE.Object3D, typed by S1's THREE re-export
}

export interface EditorHandle {
  undo(): boolean;
  redo(): boolean;
  ops: {
    add(payload: AddPayload): unknown;                       // returns THREE.Object3D
    remove(object: unknown): void;
    setTransform(object: unknown, patch: {
      position?: [number, number, number];
      rotation?: [number, number, number];
      scale?: [number, number, number];
    }): void;
    setMaterial(object: unknown, patch: MaterialPatch): void;
    setMirror(object: unknown, axis: "x" | "y" | "z", enabled: boolean): void;
    setArray(object: unknown, count: number, offset: [number, number, number]): void;
    setPostFX(patch: PostFXPatch): void;
  };
  select(object: unknown | null): void;
  selection: unknown | null;
  outliner: { list(): OutlinerRow[] };
}

export declare function attachEditor(studio: StudioHandle): EditorHandle;
```

### What S2 needs FROM other silos

**From S1 Viewer core** (`src/viewer/`, interface `createStudio(canvas) -> {scene, load, setEnv,
export…}` per `HANDOFF_OPUS.md:83`) — S2 needs this widened to also expose:
- `scene: THREE.Scene` — to add/remove/traverse (outliner, add-ops, mirror/array clones).
- `camera: THREE.PerspectiveCamera` and `renderer: THREE.WebGLRenderer` — `TransformControls`
  needs both; post FX needs the renderer to build its `EffectComposer`.
- `canvas: HTMLCanvasElement` (or `renderer.domElement`) — pointer events for `TransformControls`
  and S2's own `THREE.Raycaster` picking. **Reference has no picking code to port** — grepped for
  `Raycaster`/`raycast` in `reference/lamp360viewer.html` and found none (it is a single-lamp
  viewer with no scene graph to pick from), so S1 does not need to hand S2 a raycast function,
  only `camera` + `scene` + `canvas` for S2 to build its own.
- a render-loop hook, e.g. `onFrame(cb: () => void)` or a `setRenderHook(fn)` S2 can install once
  to swap `renderer.render(scene, camera)` for `composer.render()` when post FX is active — the
  reference's own loop is `reference/lamp360viewer.html:1261-1262` (`requestAnimationFrame(tick)`),
  which S1 ports; S2 needs one seam in it, not a rewrite.
- a resize hook, e.g. `onResize(cb: (w, h) => void)`, so S2's `EffectComposer` render targets
  and `TransformControls` stay correctly sized — reference's resize handler is
  `reference/lamp360viewer.html:1235-1241` (`onResize` + `addEventListener('resize', onResize)`).

No dependency on S3 (Library), S4 (Timeline), S5 (Accounts), or S6 (AI) for Wave 2. S4 Timeline
will later call into S2's `ops.setTransform` to keyframe, and S2's `EditorOp` shape is designed so
S4 can reuse it (each timeline keyframe is also a command with `do`/`undo`) — flagged for Assembly,
not built here.

---

## 3. Cut list

Fenced by the lock (binding, not this scout's choice): **no mesh editing, no sculpting, no node
editor, no physics, no path tracing.**

This scout's own cut, with the reason it fails the "name a numeric check" test:

- **Subdivision modifier — CUT.** Verified three `0.170.0`'s `examples/jsm/modifiers/` contains
  only `CurveModifier.js`, `CurveModifierGPU.js`, `EdgeSplitModifier.js`, `SimplifyModifier.js`,
  `TessellateModifier.js` — no `SubdivisionModifier.js` or `LoopSubdivision.js` (checked via the
  jsdelivr package file listing for `three@0.170.0`, same external source as the version-pin note
  above; not a local file, so no file:line). Three.js no longer ships a subdivision-surface
  algorithm; building one (half-edge topology, Catmull-Clark/Loop vertex averaging) is a
  from-scratch mesh algorithm, which is itself the kind of work the lock's "no mesh editing" fence
  exists to keep out of a one-day build, and it has no honest numeric check I can name inside a 4.5 h
  box — a fake check (e.g. "triangle count increases") would pass for a broken implementation too.
  `TessellateModifier` (which does ship) only adds a midpoint vertex per triangle with no smoothing,
  so it is not subdivision and I am not proposing it as a disguised substitute. If a cheap "denser
  mesh" toggle is wanted later, `TessellateModifier` is the honest name for it, not "subdivision."
- **Camera focal length / DOF panel — CUT for Wave 2, not the lock.** `PRODUCT_PLAN.md`'s phase-1
  line lists "camera focal/DOF" alongside the north-star tools; it is cheap in isolation
  (`camera.fov` + a `BokehPass`) but is a ninth target competing with 8 already-committed ones for
  the same two devs in the same 4.5 h. Cutting it keeps every shipped target's numeric check honest
  rather than thinning all nine.
- **"Send to Blender" (glTF + import script) — CUT for Wave 2.** `PRODUCT_PLAN.md`'s phase-1 line
  also names this; it is an export-format concern that belongs with S1's `export…` surface
  (`HANDOFF_OPUS.md:83`) once S2's ops exist to export, not a new S2 build target today.
- **Multi-select — CUT.** Outliner + gizmos target single selection only. Multi-select multiplies
  the undo-stack testing surface (batched ops) for a feature the numeric checks above don't need to
  prove the tool "fits."

---

## 4. Risks (ranked)

1. **Undo/redo correctness is the whole product-plan check, and it's the one thing every other
   target depends on.** If the command stack has a bug, all 8 targets look broken even when their
   own logic is fine. *Mitigation:* build and test target 1 in isolation first, against a trivial
   op (transform-only) with the exact 50-op round-trip check, before any other target is wired
   through it. *Fallback:* if the full 50-random-op fuzz check doesn't stabilize in time, ship a
   fixed deterministic 50-op sequence (still 50, still round-tripped, just not randomly sampled)
   and say so plainly in the QA note — that is a weaker but still numeric and honest check.
2. **Post FX VRAM on the 4 GB card is an estimate, not a measurement** (see target 8's VRAM note).
   *Mitigation:* the 1.5-pixel-ratio cap proposal, applied only when post FX is active.
   *Fallback:* if Wave-2 QA measures a real budget problem, cut colour-grade or vignette (both are
   cheap custom passes, easiest to drop) before cutting bloom (the one explicitly named in the
   north-star list) or before touching S1's own render path.
3. **Live-linked mirror/array (targets 6, 7) touching the same `scene` S1 owns.** If S1's `load()`
   replaces the whole scene subtree on a new model load, S2's mirror/array clones will dangle.
   *Mitigation:* S2 listens for whatever "model replaced" signal S1 exposes (needs to be named in
   `SCOPE.md` — flagging this as an interface S1 must define, not assuming one here per DECISION
   #4) and clears its own clones/undo stack on that event. *Fallback:* if no such signal exists in
   time, mirror/array are scoped to primitives added by S2 itself (target 4), not to loaded library
   models, for Wave 2 — still satisfies targets 6/7's numeric checks, just on a narrower object set.
4. **`TransformControls` and `OrbitControls` (S1's camera control, ported from
   `reference/lamp360viewer.html:348`) fight over the same pointer events** when a gizmo is active.
   *Mitigation:* the standard three.js pattern — listen for `TransformControls`'
   `dragging-changed` event and toggle `orbitControls.enabled` off/on around it; this is a known,
   small amount of glue, not a research risk. *Fallback:* none needed; this is a solved pattern.

---

## 5. Evidence

- `reference/harness/vlib.py:19-24` — `diff()`: mean per-channel delta, max, and `moved` = % of
  pixels with per-channel delta > 2.
- `reference/harness/vlib.py:36-39` — `Report.changed()` passes at `moved >= 0.5` (default
  `floor_pct=0.5`); `Report.same()` passes at `mean <= 0.6` (default `ceil_mean=0.6`).
- `reference/lamp360viewer.html:511-539` — `prepMaterials()`: per-material `color`, `roughness`,
  `metalness`, `emissive`, `emissiveIntensity` captured into `m.userData.__orig`; `side` forced to
  `DoubleSide`; map anisotropy set to `MAXANISO`. Basis for S2's material panel field set and
  reset-to-original behaviour.
- `reference/lamp360viewer.html:511-521` — per-mesh triangle/vertex counting pattern
  (`tris += (g.index ? g.index.count : pc) / 3`), reused for the mirror-modifier triangle-count
  check.
- `reference/lamp360viewer.html:337` — `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`,
  cited for the post-FX VRAM budget proposal (cap at 1.5 when post FX active).
- `reference/lamp360viewer.html:1235-1241` — `onResize()` + `addEventListener('resize', onResize)`,
  the resize pattern S2 needs a hook into.
- `reference/lamp360viewer.html:1261-1262` — the `requestAnimationFrame(tick)` render loop, the
  loop S2 needs a render-hook seam in for `EffectComposer`.
- `reference/lamp360viewer.html:319-325` — reference loads three **r128** via CDN
  (`three@0.128.0`) using the old non-module `examples/js/*` build, with `OrbitControls`,
  `GLTFLoader`, `DRACOLoader`, `RGBELoader`, `EXRLoader`, `RoomEnvironment` — no
  `TransformControls`, no postprocessing, no raycasting. Confirms S2's tools (gizmos, post FX,
  picking) are new builds against the *current* `examples/jsm` module tree, not ports of anything
  already in the reference.
- Grep of `reference/lamp360viewer.html` for `Raycaster`/`raycast` — no matches. Cited above to
  support "S1 has no picking code to hand off; S2 builds its own raycast against `scene` + `camera`
  + `canvas`."
- `HANDOFF_OPUS.md:83` — the S2 row: directory, scout question, Wave-2 target list, and the
  `attachEditor(studio) -> {undo, redo, ops}` interface this SPEC's §2 expands.
- `PRODUCT_PLAN.md` ("What 'good' looks like" paragraph) — source of the "undo/redo round-trips 50
  random ops" requirement driving target 1.
- External (not on disk, no file:line): jsdelivr package file listing for `three@0.170.0`,
  queried live during this scout pass — confirms `examples/jsm/controls/TransformControls.js`,
  `examples/jsm/postprocessing/{EffectComposer,UnrealBloomPass,OutputPass}.js`,
  `examples/jsm/environments/RoomEnvironment.js` exist, and that
  `examples/jsm/modifiers/` contains no subdivision-surface file.
