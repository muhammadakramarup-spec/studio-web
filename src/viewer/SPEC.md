# S1 — Viewer core — SPEC (Wave 1 scout)

Scope per `CONTEXT.lock.md`: renderer/canvas, environment+PMREM, camera framing, shadow catcher,
export (PNG/ZIP/WebM), metallicFactor hint. S1 ships an **engine, not UI chrome** — panels, buttons
and keyboard shortcuts are the editor/app silos' job; S1 exposes the API they call.

## `three` version pin

**`three@0.170.0`** with **`@types/three@0.170.0`**.

Why this exact pair:
- It is a real, published r17x release (the lock requires r17x): confirmed on the npm registry,
  `version` field = `0.170.0`, no runtime `dependencies`/`peerDependencies`.
- `@types/three@0.170.0` exists as an **exact** version match (confirmed via the npm registry
  `versions` list) — no drift between the runtime API and the type defs, which matters because
  0.170.0 does not ship its own `.d.ts` (its `package.json` `exports["."]` maps only to
  `build/three.module.js` / `build/three.cjs`, no `types` condition — checked directly against
  the published `package.json`).
- It is well past every r128→r17x breakage this spec has to port (color management rewrite at
  r152, `useLegacyLights` removed at r160) so none of those are still mid-migration.
- Its `exports` map defines **both** `"./addons/*": "./examples/jsm/*"` and
  `"./examples/jsm/*": "./examples/jsm/*"` (checked directly against the published
  `package.json`) — so addon imports can use the short modern `three/addons/...` form; if that
  import specifier ever fails to resolve in the chosen bundler config, `three/examples/jsm/...`
  is a verified fallback pointing at the identical files.

## 1. Targets

Ordered for a 4.5-hour build box; each row is one commit-sized unit of work.

1. **Renderer + canvas bootstrap.** Port `reference/lamp360viewer.html:336–344` (WebGLRenderer
   with `antialias:true, preserveDrawingBuffer:true, alpha:true`, capped pixel ratio, PCF soft
   shadows) to r170 color management (`outputColorSpace = THREE.SRGBColorSpace` replacing
   `outputEncoding = THREE.sRGBEncoding` at line 339).
   **Check:** loading `coffee-table-10.glb` from `furnishow-360/meshes` over `http://localhost:5173`
   reaches `debug.ready() === true` in **< 3000 ms** (matches `PRODUCT_PLAN.md`'s "loads in < 3 s
   on a 4 GB GPU"), and the tick loop sustains **≥ 30 fps mean** over a 5 s sample once idle
   (`debug.state().fps`-equivalent, same measurement window as `reference/lamp360viewer.html:1268–1274`).

2. **Camera framing maths.** Port `frameModel`/`idealDist`/`vfovDeg`/`setPhotoAngle`/`setView`
   verbatim (`reference/lamp360viewer.html:545–619`) — normalise-to-1-unit-tall, `halfW` from the
   horizontal diagonal so turntable spin never clips (line 558), focal-length-preserving zoom
   (`zoomFactor`/`setDistance`, lines 582–589).
   **Check:** run photo-angle framing on **10 GLBs** sampled from the 118 in
   `C:\3D-Studio\02_projects\furnishow-360\meshes` (test input only, never library/public per
   `CONTEXT.lock.md`); the model's rendered bounding-box height occupies **55–80% of frame
   height** at the default 50 mm photo angle, 0/10 fail on all 5 fixed views (front/right/back/
   left/top, `reference/lamp360viewer.html:612–619`).

3. **Environment + PMREM + rotation/intensity.** Port `buildEnvScene`/`rebuildEnvMap`/
   `setEnvKind`/`applyEnvIntensity` (`reference/lamp360viewer.html:435–473`) for the two built-in
   envs (`RoomEnvironment`, procedural `softboxRig`, lines 415–433) plus one HDR loaded via
   `RGBELoader` (`.hdr` only — see Cut list).
   **Check:** using the harness's own diff convention (`reference/harness/vlib.py:18–23`, mean
   per-channel delta + % pixels moved at threshold 2): Room→Softbox switch scores **≥0.5% pixels
   moved**; env rotation 0°→140° on the Softbox env scores **≥0.5% pixels moved**; `rebuildEnvMap`
   (one `pmrem.fromScene` call) completes in **< 250 ms** on the GTX 1650 for a 1k HDRI.

4. **Shadow catcher / transparent export mode.** Port `applyTransparent`
   (`reference/lamp360viewer.html:661–675`) — `scene.background=null`, `renderer.setClearColor(0,0)`,
   floor swapped to `ShadowMaterial`.
   **Check:** a transparent 1024×1024 PNG export has **>20% fully-clear pixels** (alpha===0) and
   **>0.5% soft pixels** (0<alpha<255, i.e. the shadow), same thresholds as
   `reference/harness/t3_export.py:34–40`.

5. **Export: PNG / ZIP sequence / WebM with the warm-up+tail fix.** Port `beginOffscreen`/
   `endOffscreen`/`savePNG`/`exportZip` verbatim (`reference/lamp360viewer.html:960–1009`).
   Port `exportWebm` **exactly**, including the empirically-tuned pad
   (`reference/lamp360viewer.html:1011–1055`): `WARM=4` extra frames before angle 0 and `TAIL=5`
   after the last angle (line 1036), `await raf(); await raf();` before `track.requestFrame()`
   (lines 1043–1044) so the compositor picks up each frame before the encoder is asked for it,
   and a final `await sleep(300)` before `rec.stop()` (line 1048) so the last frame reaches the
   encoder — this is the fix for dropped/duplicated turntable angles at clip start/end.
   **Check:** PNG export dimensions equal the requested resolution exactly (e.g. 2048×2048); ZIP
   sequence has exactly N entries for N∈{24,36,72} named `frame_0001.png`…`frame_00NN.png`, all
   at the requested pixel size (`reference/harness/t3_export.py:43–58`); decoded WebM frames
   (`ffprobe`/`ffmpeg` frame-dump, per `reference/harness/t_webm_match.py`) cover **all N distinct
   turntable angles present in the ZIP baseline, 0 missing**.

6. **`metallicFactor` hint + override.** Port `matHint`/`bDeMetal`
   (`reference/lamp360viewer.html:803–814, 1164–1170`) — flag materials with `metalness>0.9` and
   no `metalnessMap` (glTF default when the exporter omits `metallicFactor`), expose a
   "de-metal all" action.
   **Check:** loading a 10-file sample of the 118 Furnishow test GLBs and calling
   `debug.matInfo()`, the flagged-material count matches a hand-count on the same 10 files
   (0 false negatives); invoking the de-metal action changes ≥0.5% of pixels
   (`reference/harness/vlib.py:36–38` convention) on any file where the flag fired.

## 2. Interface

S1 is engine-only: no HTML/CSS, no keyboard shortcuts, no localStorage — those are the editor,
app and account silos' job. S1 exposes the scene graph objects directly so editor gizmos and the
timeline can attach to them without S1 re-exposing every three.js feature through wrapper methods.

```ts
// src/viewer/studio.d.ts  (S1's public surface — PROPOSED, frozen by SCOPE.md)
import type * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

export interface StudioOptions {
  canvas: HTMLCanvasElement;
  pixelRatioCap?: number;              // default 2, matches reference/lamp360viewer.html:337
}

export interface ModelStats {
  tris: number; verts: number; meshes: number; materials: number; textures: number;
}

export interface MaterialInfo {
  index: number;
  name: string;
  color: string | null;                // '#rrggbb'
  roughness: number | null;
  metalness: number | null;
  metallicFactorFlagged: boolean;       // Target 6 heuristic hit
}

export interface ModelHandle {
  id: string;
  name: string;
  stats: ModelStats;
  raw: { x: number; y: number; z: number };   // un-normalised bbox size, reference:551
  materials: MaterialInfo[];
}

export type EnvKind = "room" | "studio" | "hdr";
export type FocalMM = 24 | 35 | 50 | 85 | 135;
export type ViewPreset = 0 | 90 | 180 | 270 | "top";
export type ToneMappingName = "aces" | "filmic" | "reinhard" | "linear" | "none";
export type ExportResolution = "1024x1024" | "2048x2048" | "1920x1080" | "1080x1350" | "viewport";
export type FrameCount = 24 | 36 | 72;

export interface StudioHandle {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly pivot: THREE.Group;          // turntable pivot — editor/timeline hang gizmos/clips off this

  loadModel(source: File | Blob | string, name?: string): Promise<ModelHandle>;
  removeModel(id: string): void;
  selectModel(id: string): void;
  getActiveModel(): ModelHandle | null;

  loadEnvironment(source: File | Blob | string, label?: string): Promise<void>; // .hdr only, v1
  setEnvironment(kind: EnvKind): void;   // 'room'/'studio' need no source, built-in
  setEnvRotation(deg: number): void;
  setEnvIntensity(factor: number): void; // 0..3, matches reference envInt slider 0-300%

  setFocalLength(mm: FocalMM): void;
  setView(preset: ViewPreset): void;
  frameActive(): void;                   // re-run fit-to-view maths (Target 2)

  setToneMapping(name: ToneMappingName): void;
  setExposure(factor: number): void;
  setTransparent(on: boolean): void;     // shadow-catcher export mode (Target 4)
  setSpin(on: boolean, degPerSec?: number): void;
  setShadows(on: boolean): void;
  setFloor(on: boolean): void;

  demetalizeActive(): void;              // Target 6 override action

  exportPNG(res: ExportResolution): Promise<Blob>;
  exportSequence(res: ExportResolution, frames: FrameCount,
                 onProgress?: (fraction: number) => void): Promise<Blob>;   // zip
  exportWebM(res: ExportResolution, frames: FrameCount, fps: 24 | 30,
             onProgress?: (fraction: number) => void): Promise<Blob | null>; // null if unsupported
  cancelExport(): void;

  resize(): void;
  dispose(): void;

  // ported verification hook, reference/lamp360viewer.html:1278-1313
  readonly debug: {
    ready(): boolean;
    renderOnce(): void;
    snap(px?: number): string;                 // base64 PNG, matches reference:1282-1288
    state(): Record<string, unknown>;
    matInfo(): MaterialInfo[];
  };
}

export function createStudio(opts: StudioOptions): StudioHandle;
```

**What S1 needs FROM another silo:** nothing blocking. `loadModel`/`loadEnvironment` accept a
bare `File | Blob | string` so S1 can ship without waiting on anyone else's types. The one
**soft** dependency: if the **library silo** defines a shared `AssetRef` (url + licence + source)
type in `SCOPE.md`, S1 should accept that as a fourth overload rather than every silo inventing
its own — but this is a nice-to-have, not a blocker, since a `string` URL already satisfies it.

## 3. Cut list

- **Full material edit panel** (colour/roughness/metalness sliders,
  `reference/lamp360viewer.html:181–195, 1158–1163`). `CONTEXT.lock.md`'s scope fence puts
  "materials" under the **editor** silo. S1 exposes read-only `MaterialInfo[]` plus the one
  override action (`demetalizeActive`) needed for Target 6; editor owns per-material writes.
- **Lamp module** (bulb mesh + emissive-shade heuristic, `reference/lamp360viewer.html:696–784`).
  Not named in the "behaviours S1 must own" list. It is a per-model materials hack (shade
  detection by Y-position heuristic), so it belongs with editor's materials work later, not core
  viewer, and there's no time budget for it today.
- **Viewport display modes** — wire/normals/UV checker (`reference/lamp360viewer.html:621–651`).
  These are material overrides across the whole active model, same category as the material
  panel above — cut to editor for the same reason.
- **`.exr` HDR loading** (`reference/lamp360viewer.html:481–484`, `EXRLoader`). `.hdr` via
  `RGBELoader` covers Poly Haven's distribution format, which is what the library silo will
  actually serve; dropping `.exr` support removes one loader class and one untested code path for
  no loss against today's asset source.
- **Full state persistence** (`reference/lamp360viewer.html:1057–1099`, the `pstudio.v1`
  localStorage blob). Cross-cuts every silo's own state (materials, timeline clips, account
  prefs) — ownership belongs with the app/account silo's persistence design, not viewer core.
  S1 stays stateless between page loads for today.
- **All HTML/CSS panel chrome and keyboard shortcuts**
  (`reference/lamp360viewer.html:8–98, 103–261, 1205–1232`). UI is explicitly not S1's job per
  the interface split above — editor/app own it and call the API in §2.
- **Multi-file drag-and-drop UI + the on-canvas drop zone**
  (`reference/lamp360viewer.html:307–317, 912–922, 1197–1202`). `loadModel`/`loadEnvironment`
  already accept `File`; wiring `<input type=file>` / `dragover` listeners to them is UI-layer
  glue for the app silo, not an engine concern.

## 4. Risks

1. **r128→r170 lighting-intensity drift.** `useLegacyLights` was removed entirely by r160 (three
   is physically-correct-lights-only now); the reference's hand-tuned intensities
   (`reference/lamp360viewer.html:356–366, 415–433`, e.g. `keyL` intensity `1.5`,
   `HemisphereLight` `.35`) were tuned against the *old* (non-physically-correct) light model at
   r128, so the same numbers will render visibly brighter/dimmer under r170's physical
   falloff. **Mitigation:** treat Target 1's fps/load check as necessary but not sufficient;
   before Wave 2 hands off, render one fixed test scene (`coffee-table-10.glb`, photo angle,
   default lights) and eyeball it against a saved reference screenshot, adjusting the light
   intensity constants by a single calibration multiplier if it reads noticeably off. **Fallback:**
   if calibration is inconclusive within one attempt, ship the ported numbers as-is and file it as
   a known visual-tuning follow-up rather than blocking the build — nothing in the numeric checks
   above depends on absolute light intensity, only on pixels *changing* when controls change.

2. **WebM warm-up/tail constants are GPU/driver-tuned.** The `WARM=4`/`TAIL=5` pad and the
   double-`raf()`-then-`requestFrame()` sequence (`reference/lamp360viewer.html:1036–1044`) were
   tuned against the exact rAF/compositor timing on this machine's Intel UHD + GTX 1650 under
   Three r128; a different renderer init path in r170 (or a different browser build under
   Playwright/CDP) could need different constants to hit "0 missing angles" in Target 5.
   **Mitigation:** port the algorithm unchanged first and run the `t_webm_match.py`-style check
   verbatim — most likely it just works, since the pad logic doesn't touch renderer internals.
   **Fallback (3-attempt budget, per the lock's hard rule):** if angles are still missing after
   porting unchanged, try increasing `WARM`/`TAIL` by 2 each attempt (up to 3 attempts total); if
   still failing on attempt 3, disable the WebM export button and ship PNG-sequence-only —
   the lock already treats the PNG sequence as "the real deliverable"
   (`reference/lamp360viewer.html:244`).

3. **Draco decoder path.** The reference points the Draco decoder at a jsdelivr CDN wasm build
   (`reference/lamp360viewer.html:397`, `three@0.128.0/examples/js/libs/draco/`); this is needed
   because "the 90 furniture GLBs are KHR_draco_mesh_compression and fail on a plain GLTFLoader"
   (`reference/lamp360viewer.html:394–395`). A CDN fetch at runtime is a build-day risk (network
   flake, CSP, offline QA). **Mitigation:** vendor the r170 Draco decoder's wasm files into
   `public/draco/` at build time instead of fetching from a CDN, and point
   `DRACOLoader.setDecoderPath()` at the local copy. **Fallback:** if vendoring the wasm build
   breaks (wrong decoder version for the loader), fall back to the jsdelivr CDN path pinned to
   `three@0.170.0`'s own decoder build, accepting the network dependency for today.

4. **`three/addons/...` import specifier.** Confirmed to resolve today (three@0.170.0's
   `package.json` `exports` maps `"./addons/*"` to `"./examples/jsm/*"`), but Vite/TS resolution
   of package `exports` maps is a known source of build-tool version sensitivity.
   **Mitigation:** if `three/addons/controls/OrbitControls.js` (etc.) fails to resolve under the
   pinned Vite/TS toolchain, switch every such import to `three/examples/jsm/...` — verified to
   point at the identical files in this version, so it's a pure find-and-replace, not a rewrite.
   **Fallback:** none needed beyond that — both paths are confirmed present in the published
   package.

## 5. Evidence

- Renderer setup, color management, shadows: `reference/lamp360viewer.html:336–344`.
- CDN script tags naming the r128 pin and addon paths being ported away from:
  `reference/lamp360viewer.html:319–326`.
- Scene lights (hemi/key/fill/rim) and their tuned intensities: `reference/lamp360viewer.html:356–366`.
- Draco requirement for the 90 furniture GLBs and decoder setup: `reference/lamp360viewer.html:393–400`.
- PMREM generator setup: `reference/lamp360viewer.html:403–404`.
- Built-in environments (Room via `RoomEnvironment`, procedural Softbox rig) and env rebuild:
  `reference/lamp360viewer.html:415–473`.
- HDR/EXR env file loading (`RGBELoader`/`EXRLoader`, `HalfFloatType`): `reference/lamp360viewer.html:481–499`.
- Camera framing maths (`frameModel`, `vfovDeg`, `idealDist`, `zoomFactor`, `setDistance`,
  `clampRange`, `setFocal`, `setPhotoAngle`, `setView`): `reference/lamp360viewer.html:545–619`.
- Viewport display-mode materials (wire/normals/UV), cut to editor: `reference/lamp360viewer.html:621–651`.
- Transparent/shadow-catcher toggle: `reference/lamp360viewer.html:661–675`.
- Lamp module (bulb + shade heuristic), cut: `reference/lamp360viewer.html:696–784`.
- Material inspector and reset, cut to editor except the hint: `reference/lamp360viewer.html:786–836`.
- `metallicFactor` hint text and de-metal-all action: `reference/lamp360viewer.html:803–814, 1164–1170`.
- Multi-model load/select/remove data ops (kept) vs. chip UI (cut):
  `reference/lamp360viewer.html:852–922`.
- Offscreen render begin/end for exports: `reference/lamp360viewer.html:960–979`.
- PNG export: `reference/lamp360viewer.html:981–987`.
- ZIP sequence export: `reference/lamp360viewer.html:989–1009`.
- WebM export incl. the warm-up/tail fix and its inline rationale comments:
  `reference/lamp360viewer.html:1011–1055` (pad constants and raf-before-requestFrame at
  1036–1044, final settle sleep before `rec.stop()` at 1048).
- Full localStorage persistence blob, cut: `reference/lamp360viewer.html:1057–1099`.
- Panel HTML/CSS and keyboard shortcuts, cut (UI chrome, not S1): `reference/lamp360viewer.html:8–98, 103–261, 1205–1232`.
- Drag-and-drop / file input wiring, cut (UI glue, not S1): `reference/lamp360viewer.html:307–317, 912–922, 1197–1202`.
- Render tick loop and FPS sampling window (0.5 s): `reference/lamp360viewer.html:1260–1275`.
- Verification hook `window.__studio` being ported into `debug`: `reference/lamp360viewer.html:1278–1313`.
- Harness diff/threshold convention (mean channel delta, % pixels moved at threshold 2,
  `changed`/`same` floor/ceiling): `reference/harness/vlib.py:11–41`.
- Export dimension/frame-count/alpha checks this spec's numeric targets mirror:
  `reference/harness/t3_export.py:23–58`.
- WebM-vs-ZIP frame-matching method (ffmpeg frame dump + nearest-neighbour match) this spec's
  Target 5 WebM check mirrors: `reference/harness/t_webm_match.py:1–33`.
- Test input set: `C:\3D-Studio\02_projects\furnishow-360\meshes`, 118 `.glb` files (`ls` count
  during this scouting pass), private client — test input only, never library, never public
  (binding per `CONTEXT.lock.md`).
- `three@0.170.0` / `@types/three@0.170.0`: confirmed exact-version match and no bundled
  `types` field on the npm registry (`registry.npmjs.org/three/0.170.0`,
  `registry.npmjs.org/@types/three` versions list, and the published `package.json`'s `exports`
  map showing `"./addons/*"` and `"./examples/jsm/*"` both resolving to `./examples/jsm/*`) —
  checked live against npm during this scouting pass, 2026-09-03.
