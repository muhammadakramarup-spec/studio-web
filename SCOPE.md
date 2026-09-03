# SCOPE.md — Wave 2 commitment

Written by Assembly-1. Merges six Wave-1 specs against six Codex reviews under `DECISIONS.md` #12:
**where a SPEC and its review disagree, the review wins.** Every target below is the reviewed
shape. `three@0.170.0` / `@types/three@0.170.0` (`DECISIONS.md:37-42`, #5) is pinned in
`package.json` and unchanged here.

---

## 1. The commitment

| Silo | Ships today | Numeric acceptance check | Stretch (only if committed work lands early) | Cut |
|---|---|---|---|---|
| **S1 Viewer core** | Renderer/canvas bootstrap (r170 colour mgmt); camera framing maths; environment+PMREM (room/studio built-ins + 1 real HDR); shadow-catcher/transparent export; PNG export + one verified 24-frame 1024×1024 ZIP turntable; `metallicFactor` hint + de-metal action; `setRenderHook` render-loop seam. | Load `coffee-table-10.glb` → `debug.ready()===true` in **<3000 ms**, **≥30 fps** mean over 5 s (`src/viewer/SPEC.md:36-38`). Framing: bbox height **55–80%** of frame on 10/118 Furnishow GLBs, 0/10 fail across 5 fixed views (`src/viewer/SPEC.md:44-48`). Env: Room→Softbox and 0°→140° rotation both **≥0.5% pixels moved**; PMREM **<250 ms**, HDR path uses `pmrem.fromEquirectangular()` not `fromScene()` (`src/viewer/SPEC.md:54-57`; `reviews/codex_review_S1.md:25`). Shadow catcher (review-replaced, `reviews/codex_review_S1.md:17-21`): **≥20%** alpha=0, **≥1%** alpha=255, **≥0.5%** of pixels outside the opaque-model mask change alpha by >2 between shadows-on/off. ZIP: **exactly 24** entries `frame_0001…frame_0024.png`, each exactly **1024×1024** (`src/viewer/SPEC.md:75-76`; export target replaced per `reviews/codex_review_S1.md:3-5`). Metallic hint: 0 false negatives on a 10-file hand-count sample; de-metal changes **≥0.5%** pixels (`src/viewer/SPEC.md:84-87`). | `exportWebM()` — three tuning attempts permitted, then `BLOCKED.md` per `reviews/codex_review_S1.md:29` (never a silently disabled button); light-intensity calibration pass against a saved reference (foreground median-luminance ratio **0.80–1.25**, `reviews/codex_review_S1.md:27`). | Full material edit panel, lamp module, viewport display modes (wire/normals/UV), `.exr` loading, full `localStorage` state persistence, all HTML/CSS chrome + shortcuts, drag-and-drop UI (`src/viewer/SPEC.md:192-219`). |
| **S2 Editor** | Undo/redo command stack (canonical state serialization, not transforms/materials-only) + `execute(op)`; selection (raycast + outliner) on a fixed fixture; `TransformControls` gizmos; add light/camera/primitive; PBR material panel; mirror modifier; array modifier; post FX narrowed to **bloom only**. | Undo/redo: canonical serialization (hierarchy, types, visibility, transforms, materials, modifier params, post-FX state) round-trips exactly after 50 ops undo and 50 redo (`src/editor/SPEC.md:26-33`, extended by `reviews/codex_review_S2.md:13`). Selection (review-replaced, `reviews/codex_review_S2.md:9`): fixed fixture of 3 meshes + 1 light + 1 camera — outliner UUID set matches **5/5**, each row selects its UUID **5/5**, 3 fixed canvas coords select their mesh **3/3**, 1 blank coord returns `null`. Gizmo: position/rotation/scale delta within **±1e-3** + canvas `changed()` **≥0.5%** moved (`src/editor/SPEC.md:45-48`). Add: object count **+1**; canvas `changed()` **≥0.5%** for lights/non-zero primitives (`src/editor/SPEC.md:53-56`). Material: roughness/metalness/colour drag → `changed()` **≥0.5%**; reset → `same()` **≤0.6** mean (`src/editor/SPEC.md:63-66`). Mirror: exactly **2×** triangle count; mirrored bbox negated within **1e-4** (`src/editor/SPEC.md:73-76`). Array (review-clarified count = total visible incl. source, `reviews/codex_review_S2.md:15`): exactly **N** visible instances; `changed()` between count=1 and count=5 (`src/editor/SPEC.md:80-82`). Bloom (review-replaced, `reviews/codex_review_S2.md:1`): `UnrealBloomPass` on/off passes `changed()` **≥0.5%** moved, restricted to the emissive object's screen-space bounds, at fixed composer resolution. | Vignette + colour grade `ShaderPass`es, only if bloom lands early (`DECISIONS.md:96`, #12). | Mesh editing/sculpting/node editor/physics/path tracing (lock fence); subdivision modifier (no three.js algorithm exists, `src/editor/SPEC.md:211-222`); camera focal/DOF panel; "Send to Blender"; multi-select (`src/editor/SPEC.md:223-234`). |
| **S3 Library** | All **2,268** existing Kenney `.glb` files extracted and manifested **unchanged** (no per-model Draco/thumbnail); **20** shared kit-level thumbnails (1 per kit); machine-checked licence+source coverage; triangle gate enforced by an **independent** GLB parse; `manifest.assets` root shape; `LibraryAsset.animationClipNames?`; Poly Haven HDRI fetch is a **blocking** Wave-2 deliverable; hosting is same-origin Cloudflare Pages assets. | `manifest.assets` has exactly **2,268** `source:"kenney"` entries, each with non-empty `licence:"CC0"` and `sourceUrl`; ≥20 spot-checked across ≥10 kits open in `GLTFLoader` with 0 console errors (`src/library/SPEC.md:25-29`, ingestion scope reduced per `reviews/codex_review_S3.md:1`). **20** kit thumbnails, 256×256, ≤50 KB each (`src/library/SPEC.md:46-48`, count reduced per same finding). Triangle gate (review-replaced, `reviews/codex_review_S3.md:5`): independent GLB parse asserts `actualTriangles === asset.triangles && actualTriangles <= 500000` for **all 2,268**, 0 failures. Licence script: `manifest.assets.every(a => a.licence==="CC0" && /^https?:\/\//.test(a.sourceUrl))` exits 0, using `.assets` not the manifest-as-array (`src/library/SPEC.md:30-33`; `reviews/codex_review_S3.md:10`). HDRI (review-upgraded from plan-only to blocking, `reviews/codex_review_S3.md:9`, matches `DECISIONS.md:56-61` #7): **≥1** Poly Haven HDRI actually fetched and successfully decoded via `RGBELoader`, feeding S1's Target-3 env check — **no spec or review states a target count beyond "≥1"; see §5 gap.** | Curated 60-model Poly Haven subset, throughput-gated on the first-10-fetch measurement (`src/library/SPEC.md:38-45`, `DECISIONS.md:43-54` #6); ambientCG materials fetch-plan-only (`src/library/SPEC.md:52-55`, unchanged by review). | KTX2 (`DECISIONS.md:63-65` #8); decimation of the 23 over-gate Poly Haven slugs; `animal-pack` (empty); the 9 un-fetched Kenney kits; `.obj`/`.fbx` duplicate copies; per-model Draco + per-model thumbnails (explicit review cut, `reviews/codex_review_S3.md:1`); R2 hosting (`DECISIONS.md:79-84` #11; `reviews/codex_review_S3.md:11`). |
| **S4 Timeline** | 8 named easing presets; pure/deterministic `sampleAt(t)`; `exportRange(duration, frameCount)`; scrub-to-frame on a fixed two-key fixture; 50-key JSON round-trip; scrub performance budget; turntable clip generation; object/camera transform sampling only (no frame-exact character-clip export). | Easing: 8 presets × 5 `t`-values within **1e-3** of the reference table (`src/editor/SPEC.md` n/a — `src/timeline/SPEC.md:8-11`; table itself does not yet exist anywhere — **see §5 gap**, `reviews/codex_review_S4.md:21`). `sampleAt`: 100 calls at `t=1.234` are byte-identical (`src/timeline/SPEC.md:12-14`). `exportRange(duration,36)` → `frames.length===36`, `frames[i].t===i*duration/36` for every `i` (`src/timeline/SPEC.md:15-18`). Scrub (review-replaced, no longer circular, `reviews/codex_review_S4.md:15`): fixed keys `[0,0,0]@t=0`, `[2,4,6]@t=2`; after `scrubTo(1)` the scene object is `[1,2,3] ±1e-6` and `renderNow()` was called **exactly once**. Keys round-trip: 50 random keys bit-identical after JSON round-trip (`src/timeline/SPEC.md:22-24`). Scrub perf: `sampleAt` **<2 ms** for 20 tracks × 4 channels × 50 keys (`src/timeline/SPEC.md:26-28`). Turntable (review-replaced — 2 keys cannot represent a full turn since 0 and 2π are equivalent orientations, `reviews/codex_review_S4.md:19`): **3** quaternion keys at `t=0/duration÷2/duration` representing `0/π/2π`; sample at `duration/2` yields rotation **π within 1e-6**. | Non-frame-exact character-clip *triggering* (start-at-t only, via `AnimationMixer` sampled with `mixer.update(0)`) if transform-sampling lands early (`src/timeline/SPEC.md:204-210`, risk 1 fallback). | Full Bézier curve editor; EXPO/ELASTIC presets; per-key asymmetric easing; noise modifiers; stagger/multi-object timing; `AnimationMixer`-driven object/camera tracks; Quaternius characters; **frame-exact export of imported character clips** (`DECISIONS.md:97-98`, #12). |
| **S5 Account** | `useAccount()` resolves **synchronously** to the signed-out state (`status:'ready', user:null, isPro:false`) regardless of env vars — no real Supabase session/entitlement attempt in Wave 2; `AccountPanel()` component; ad slot house placeholder with 0 `ethicalads.io` requests; checkout stub labelled SANDBOX/TEST MODE; opt-in typed telemetry verified against a routed local endpoint; 0 secrets in the built bundle. | Zero-env boot: 0 console errors from `src/account/**` (`src/account/SPEC.md:21-25`). `useAccount` (review-replaced, real-backend attempt removed, `reviews/codex_review_S5.md:1`): `status==='ready'` and `isPro===false` **synchronously** on mount, every load, env vars present or not. `AdSlot`: house placeholder in **100%** of zero-env loads, no layout shift, **0** requests to `ethicalads.io` (`src/account/SPEC.md:32-36`; live-serving path removed, `reviews/codex_review_S5.md:12`). Checkout stub: `SANDBOX`/`TEST MODE` string present; **0** requests to `lemonsqueezy.com` when unset (`src/account/SPEC.md:37-41`). Telemetry (review-replaced routed test, `reviews/codex_review_S5.md:8`): 3 pre-consent events → **0** POSTs; 3 opted-in events → **exactly 3** schema-valid POSTs; 3 post-opt-out events → total stays at **3**. Secrets: `grep -r` over `dist/**/*.js` finds **0** matches for `sk_`/`service_role`/`sb_secret` >20 chars (`src/account/SPEC.md:47-49`). | None — real Supabase/Lemon Squeezy wiring is gated behind env vars only Akram can supply (sign-ups, out of agent scope today regardless of time remaining, `src/account/SPEC.md:139-146`). | Real Supabase auth flow; real Lemon Squeezy checkout (even sandbox — needs Akram's sign-up); EthicalAds live ad serving (`DECISIONS.md:67-70` #9); server-side telemetry ingestion/dashboard; Pro entitlement enforcement/paywall; GDPR consent-tooling. |
| **S6 AI + avatars** | Generation panel mock round-trip (5 states, 0 env vars); `GenerationPanelProps.onModelReady`; Worker stub (`workers/ai-gate`) safe with 0 keys; avatar target replaced with **one manifest-listed local CC0 GLB avatar tile**, not the RPM iframe; session credits gate (3/session); every mock result unmistakably labelled. | Round-trip: `idle→queued→running→done` in **<3000 ms**, all 5 states (`idle/queued/running/done/error`) reachable, 0 network calls, `MESHY_API_KEY` unset (`src/ai/SPEC.md:13-18`). Worker: `curl POST /generate` with 0 env vars → HTTP 200, `mock:true`, **<200 ms**, **10/10** runs (`src/ai/SPEC.md:20-25`). Avatar (RPM iframe cut, review-replaced, `reviews/codex_review_S6.md:1,11-12`): selecting the manifest-listed avatar tile calls `onAvatarReady`, loads via `studio.loadModel(...)` (never `studio.load`, `reviews/codex_review_S6.md:15`), and within **2000 ms** the canvas contains **≥1** visible avatar mesh with a 256×256 capture differing from the empty-scene baseline by **≥1,000 px**. Credits: 4th `requestGeneration()` call in-session returns `state:'error'` synchronously in **<50 ms**, no state transition (`src/ai/SPEC.md:37-41`). Mock label: `isMock:true` + the literal string `"MOCK — not a real generation"` present in the DOM for every `state:'done'` result (`src/ai/SPEC.md:43-46`). | None named — S6 is explicitly the lowest-priority silo; if the Worker stub + generation panel land early, no further S6 work is committed (`src/ai/SPEC.md:147-156`). | Real Meshy API calls (no free API tier exists, `DECISIONS.md:72-77` #10); real Hunyuan3D-on-RunPod calls; the RPM iframe path entirely, dev or production (`reviews/codex_review_S6.md:1`, supersedes `DECISIONS.md` #10's dev-only RPM note); credits/paywall UI polish; prompt moderation; image-upload validation beyond a size cap; progress bars beyond the 5 named states. |

---

## 2. Frozen interfaces

Every review-mandated addition listed in the assignment is folded in below and marked `// REVIEW`.

### S1 — `src/viewer/studio.d.ts`

```ts
import type * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

export interface StudioOptions {
  canvas: HTMLCanvasElement;
  pixelRatioCap?: number;              // default 2
}

export interface ModelStats {
  tris: number; verts: number; meshes: number; materials: number; textures: number;
}

export interface MaterialInfo {
  index: number;
  name: string;
  color: string | null;
  roughness: number | null;
  metalness: number | null;
  metallicFactorFlagged: boolean;
}

export interface ModelHandle {
  id: string;
  name: string;
  stats: ModelStats;
  raw: { x: number; y: number; z: number };
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
  readonly pivot: THREE.Group;

  loadModel(source: File | Blob | string, name?: string): Promise<ModelHandle>;
  removeModel(id: string): void;
  selectModel(id: string): void;
  getActiveModel(): ModelHandle | null;

  loadEnvironment(source: File | Blob | string, label?: string): Promise<void>;
  setEnvironment(kind: EnvKind): void;
  setEnvRotation(deg: number): void;
  setEnvIntensity(factor: number): void;

  setFocalLength(mm: FocalMM): void;
  setView(preset: ViewPreset): void;
  frameActive(): void;

  setToneMapping(name: ToneMappingName): void;
  setExposure(factor: number): void;
  setTransparent(on: boolean): void;
  setSpin(on: boolean, degPerSec?: number): void;
  setShadows(on: boolean): void;
  setFloor(on: boolean): void;

  demetalizeActive(): void;

  exportPNG(res: ExportResolution): Promise<Blob>;
  exportSequence(res: ExportResolution, frames: FrameCount,
                 onProgress?: (fraction: number) => void): Promise<Blob>;   // zip
  exportWebM(res: ExportResolution, frames: FrameCount, fps: 24 | 30,
             onProgress?: (fraction: number) => void): Promise<Blob | null>; // stretch; null if not attempted/unsupported

  // REVIEW (reviews/codex_review_S1.md:7-16; reviews/codex_review_S2.md:3-7 — found independently by both reviews):
  setRenderHook(fn: ((deltaSeconds: number) => void) | null): void;

  cancelExport(): void;
  resize(): void;
  dispose(): void;

  readonly debug: {
    ready(): boolean;
    renderOnce(): void;
    snap(px?: number): string;
    state(): Record<string, unknown>;
    matInfo(): MaterialInfo[];
  };
}

export function createStudio(opts: StudioOptions): StudioHandle;
```

### S2 — `src/editor/index.ts`

```ts
export type EditorOpKind =
  | "add" | "remove" | "transform" | "material"
  | "mirror" | "array" | "postfx";

export interface EditorOp {
  id: string;
  kind: EditorOpKind;
  label: string;
  do(): void;
  undo(): void;
}

export interface AddPayload {
  kind:
    | "light-point" | "light-directional" | "light-spot"
    | "camera"
    | "primitive-box" | "primitive-sphere" | "primitive-cylinder" | "primitive-plane";
  at?: [number, number, number];
}

export interface MaterialPatch {
  color?: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
}

export interface PostFXPatch {
  bloom?: { enabled: boolean; strength?: number; radius?: number; threshold?: number };
  // vignette/grade fields kept for forward-compat; not exercised by any committed check today —
  // see commitment table Stretch column and reviews/codex_review_S2.md:1.
  vignette?: { enabled: boolean; amount?: number };
  grade?: { exposure?: number; contrast?: number; saturation?: number };
}

export interface OutlinerRow {
  id: string;
  name: string;
  type: "Mesh" | "Light" | "Camera" | "Group";   // NOTE: "Group" inclusion is unresolved — see §5 gap
  object: unknown;
}

export interface EditorHandle {
  undo(): boolean;
  redo(): boolean;
  // REVIEW (reviews/codex_review_S2.md:3-7): lets S4 (and any future silo) submit an
  // externally-constructed command to the same undo/redo history.
  execute(op: EditorOp): void;
  ops: {
    add(payload: AddPayload): unknown;
    remove(object: unknown): void;
    setTransform(object: unknown, patch: {
      position?: [number, number, number];
      rotation?: [number, number, number];
      scale?: [number, number, number];
    }): void;
    setMaterial(object: unknown, patch: MaterialPatch): void;
    setMirror(object: unknown, axis: "x" | "y" | "z", enabled: boolean): void;
    setArray(object: unknown, count: number, offset: [number, number, number]): void; // count = total visible incl. source, reviews/codex_review_S2.md:15
    setPostFX(patch: PostFXPatch): void;
  };
  select(object: unknown | null): void;
  selection: unknown | null;
  outliner: { list(): OutlinerRow[] };
}

export declare function attachEditor(studio: StudioHandle): EditorHandle;
```

### S3 — `src/library/manifest.d.ts`

```ts
export type AssetKind = "model" | "hdri" | "material";

export interface LibraryAsset {
  id: string;
  kind: AssetKind;
  name: string;
  source: "kenney" | "polyhaven" | "ambientcg";
  licence: "CC0";
  sourceUrl: string;
  category: string;
  triangles: number;            // must equal an independent GLB parse, reviews/codex_review_S3.md:5
  fileUrl: string;
  fileBytes: number;
  thumbnailUrl: string;
  dimensionsMeters?: [number, number, number];
  // REVIEW (reviews/codex_review_S3.md:3 — S4 needs clip names, src/timeline/SPEC.md:107-108):
  animationClipNames?: readonly string[];
}

// REVIEW (reviews/codex_review_S3.md:10): root is { assets: [...] }, never the array itself —
// checks read manifest.assets, never `manifest` as an array.
export interface LibraryManifest {
  generatedAt: string;
  pipelineVersion: string;
  assets: LibraryAsset[];
}
```

### S4 — `src/timeline/types.d.ts`

```ts
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
```

### S5 — `src/account/types.d.ts`

```ts
export interface AccountState {
  // REVIEW (reviews/codex_review_S5.md:1): 'ready' is reached synchronously, every mount,
  // with or without env vars — no real Supabase session/entitlement attempt in Wave 2.
  // 'loading' remains in the union for API stability but is not entered by any Wave-2 code path.
  status: 'loading' | 'ready';
  user: { id: string; email: string } | null;
  isPro: boolean;
  signIn: () => void;
  signOut: () => void;
}

export declare function useAccount(): AccountState;

// REVIEW (reviews/codex_review_S5.md:3-6): required by S2/App-shell chrome, absent from the
// original SPEC's exported surface.
export declare function AccountPanel(): JSX.Element;

export interface AdSlotProps {
  size?: '300x250' | '728x90' | '160x600';
  placement?: string;
}
// REVIEW (reviews/codex_review_S5.md:12): the "configured EthicalAds" execution path is removed;
// AdSlot renders the house placeholder unconditionally in Wave 2 (DECISIONS.md #9).
export declare function AdSlot(props: AdSlotProps): JSX.Element;

export type TelemetryEvent =
  | { type: 'asset_loaded'; assetKind: 'model' | 'hdri' | 'material'; assetId: string }
  | { type: 'effect_applied'; effect: string }
  | { type: 'export_completed'; exportKind: 'still' | 'turntable'; ms: number }
  | { type: 'tool_used'; tool: string }
  // REVIEW (reviews/codex_review_S5.md:14): no caller-supplied anonId — track() attaches its
  // own internally generated UUID.
  | { type: 'session_started' }
  | { type: 'pro_cta_clicked'; source: string };

export declare function track(event: TelemetryEvent): void;
export declare function setTelemetryOptIn(optIn: boolean): void;
export declare function getTelemetryOptIn(): boolean;
```

### S6 — `src/ai/types.ts` + `workers/ai-gate/types.ts`

```ts
export type GenerationKind = 'text-to-3d' | 'image-to-3d';
export type GenerationState = 'idle' | 'queued' | 'running' | 'done' | 'error';

export interface GenerationRequest {
  kind: GenerationKind;
  prompt?: string;
  imageDataUrl?: string;
  // REVIEW (reviews/codex_review_S6.md:17): optional — S5's zero-env AccountState permits user:null.
  userId?: string;
}

export interface GenerationResult {
  state: GenerationState;
  jobId: string;
  glbUrl?: string;
  isMock: true;
  label: 'MOCK — not a real generation';
  error?: string;
  creditsRemaining: number;
}

export function requestGeneration(req: GenerationRequest): Promise<GenerationResult>;
export function pollGeneration(jobId: string): Promise<GenerationResult>;

// REVIEW (reviews/codex_review_S6.md:3-9): S1 handoff was missing from the generation path.
export interface GenerationPanelProps {
  onModelReady: (glbUrl: string) => void;
}
declare function GenerationPanel(props: GenerationPanelProps): unknown;

// REVIEW (reviews/codex_review_S6.md:1): RPM iframe mode removed entirely. AvatarPanel now
// shows one manifest-listed local CC0 GLB avatar tile (an S3 asset with licence:"CC0" and a
// sourceUrl, reviews/codex_review_S6.md:18 — no specific asset id has been named, see §5 gap).
export interface AvatarPanelProps {
  onAvatarReady: (glbUrl: string) => void;
  onCancel: () => void;
}
declare function AvatarPanel(props: AvatarPanelProps): unknown;
```

```ts
// workers/ai-gate/types.ts
export interface GenerateJobRequest {
  kind: 'text-to-3d' | 'image-to-3d';
  prompt?: string;
  imageDataUrl?: string;
  userId?: string;   // REVIEW, same as GenerationRequest.userId
}

export interface GenerateJobResponse {
  jobId: string;
  status: 'done';
  glbUrl: string;     // an S3 manifest asset — id not yet named, see §5 gap
  mock: true;
  provider: 'none';
  creditsCharged: 0;
}
```

**Every call from S6 into S1 uses `studio.loadModel(...)`, never `studio.load(...)`**
(`reviews/codex_review_S6.md:15`, matching S1's actual interface, `src/viewer/SPEC.md:140`).

### Consumption table

| Interface | Owner | Consumed by | Where it is used |
|---|---|---|---|
| `StudioHandle` / `createStudio` | S1 | S2 (`attachEditor(studio)` — scene/camera/renderer/`setRenderHook`); S3 (`LibraryPanel`'s `onAssetPicked` consumer calls `studio.loadModel(asset.fileUrl)`); S4 (via `TimelineSceneAdapter` wrapping the same scene for export); S6 (`onModelReady`/`onAvatarReady` call `studio.loadModel`); App shell (load/env/export UI). | `src/editor/SPEC.md:179-195`; `src/library/SPEC.md:100-104`; `reviews/codex_review_S4.md:3-13`; `reviews/codex_review_S6.md:1,15`. |
| `EditorHandle` / `attachEditor` | S2 | App shell (outliner, gizmos, material panel, add-tools, post-FX toggle). `execute(op)` has **no confirmed cross-silo consumer this wave** — S4's reuse of `EditorOp` for keyframe commands is flagged, not built (`src/editor/SPEC.md:197-200`). Kept, not deleted: mandated by `reviews/codex_review_S2.md:3-7` under decision #12 regardless of today's caller count. | `src/editor/SPEC.md:107-200`. |
| `LibraryAsset` / `LibraryManifest` | S3 | App shell / `LibraryPanel` (renders grid, emits `onAssetPicked`); S1 (`fileUrl` fed to `loadModel`); S4 (`animationClipNames` identifies which picked models can drive character-clip tracks); S6 (Worker's mock `glbUrl` and the avatar tile both point at a manifest entry — no specific `id` chosen yet, see §5). | `src/library/SPEC.md:94-111`; `reviews/codex_review_S3.md:3`; `src/ai/SPEC.md:112-124`. |
| `TimelineHandle` / `TimelineSceneAdapter` / `attachTimeline` | S4 | App shell (keyframe UI, playhead, "Turn 360°" button); S1 (export loop calls `sampleAt`/`exportRange` then `applySampledFrame`+`renderNow` through the adapter each frame); S2 (`onChange` listener snapshots `timeline.serialize()` into the undo stack). | `src/timeline/SPEC.md:96-109`; `reviews/codex_review_S4.md:3-13,23`. |
| `useAccount` / `AccountPanel` / `AdSlot` | S5 | App shell (renders `AccountPanel`, `AdSlot`); S2 (optional — a Pro-only cosmetic watermark toggle may branch on `isPro`, `src/account/SPEC.md:121-122`); S6's original `credits`/`spendCredit` soft-dependency was dropped by S6 itself in favour of a self-contained counter (`src/ai/SPEC.md:114-117`) — **no consumer for that specific extension today**. | `src/account/SPEC.md:82-134`. |
| `TelemetryEvent` / `track` / `setTelemetryOptIn` | S5 | App shell wires call sites: S3 (`asset_loaded`), S2 (`tool_used`/`effect_applied`), S4 (`export_completed`) — all "call-site integrations other silos add later," per `src/account/SPEC.md:131-133`; **no confirmed caller exists in any Wave-2 silo's own committed targets today.** | `src/account/SPEC.md:99-114,131-133`. |
| `GenerationPanelProps` / `AvatarPanelProps` | S6 | App shell only (renders the AI panel, wires `onModelReady`/`onAvatarReady` to `studio.loadModel`). | `src/ai/SPEC.md:112-124`; `reviews/codex_review_S6.md:3-9`. |

---

## 3. Build order and worktree map

Per `DECISIONS.md` #3, Wave-2 worktree isolation begins now (Wave-1 scouts shared the tree).

| Silo | Worktree / directory |
|---|---|
| S1 | `src/viewer/` |
| S3 | `src/library/` + `pipeline/` |
| S2 | `src/editor/` |
| S4 | `src/timeline/` |
| S5 | `src/account/` |
| S6 | `src/ai/` + `workers/ai-gate/` |

**Merge order: S1 → S3 → S2 → S4 → S5 → S6.**

S1's `setRenderHook` and S3's `manifest.json` (with `.assets` root and `animationClipNames`) are
the two things every other silo blocks on — S2 needs the render hook for its `EffectComposer`
bloom pass, and S3's manifest is what the App shell's `LibraryPanel` and S4's character-clip
lookup both read. Both must be stable before S2/S4 start integration, hence they merge first.
S5 and S6 have no blocking dependency on S2/S4 (S5 is fully self-contained; S6's only hard
dependency is `studio.loadModel`, already available at S1's merge), so they land last and can be
built in parallel with S2/S4 if capacity allows, merged after.

---

## 4. The cut list, explicit

**Lock's Not-v1 fence (`CONTEXT.lock.md:16-17`), binding all day, no exceptions:**
mesh editing · sculpting · node editor · physics · path tracing · paid AI calls · anything needing
Rust/MSVC · any desktop packaging.

**Today's cuts, reviewed:**

- **KTX2** — `toktx`/`basisu` are not npm packages, not installed, and installing them means a
  native binary outside `npm install` (`DECISIONS.md:63-65` #8; `src/library/SPEC.md:120-130`).
- **Subdivision modifier** — three.js ships no subdivision-surface algorithm in `examples/jsm/modifiers/`
  as of r170; building one from scratch is itself mesh-editing-class work with no honest numeric
  check inside the box (`src/editor/SPEC.md:211-222`).
- **WebM as a committed target** — demoted to stretch; the committed export is PNG + one verified
  24-frame 1024×1024 ZIP (`reviews/codex_review_S1.md:3-5`, matching `DECISIONS.md:92-94` #12).
- **Frame-exact export of imported character clips** — cut; object/camera transform sampling is
  the committed path (`reviews/codex_review_S4.md:1`; `DECISIONS.md:97-98` #12).
- **RPM iframe** — cut entirely, dev and production, not merely gated behind an env var; replaced
  by one manifest-listed local CC0 GLB avatar tile (`reviews/codex_review_S6.md:1`, which
  supersedes the RPM dev-only allowance in `DECISIONS.md:76-77` #10).
- **EthicalAds live serving** — cut outright; the house-ad placeholder ships instead, and the
  "configured" execution path is removed from `AdSlot`, not merely unset by default
  (`DECISIONS.md:67-70` #9; `reviews/codex_review_S5.md:12`).
- **Poly Haven models** — 0 of 250 are renderable as scene-descriptor-only stubs; a curated
  60-model subset is a throughput-gated Wave-2 stretch, not committed (`DECISIONS.md:43-54` #6).
- **R2** — launch hosting is same-origin Cloudflare Pages assets; today's 2,268-file/53.13 MB
  library fits Pages' 20,000-file/25 MiB limits comfortably (`DECISIONS.md:79-84` #11;
  `reviews/codex_review_S3.md:11`).

**Also cut, unchanged by any review:** full material edit panel/lamp module/viewport display
modes/`.exr` loading/full state persistence (S1, `src/viewer/SPEC.md:192-219`); camera focal/DOF
panel, "Send to Blender," multi-select (S2, `src/editor/SPEC.md:223-234`); decimation of
over-gate Poly Haven slugs, `animal-pack`, the 9 un-fetched Kenney kits, `.obj`/`.fbx` duplicate
copies (S3, `src/library/SPEC.md:113-147`); full Bézier curve editor, EXPO/ELASTIC presets,
per-key asymmetric easing, noise modifiers, stagger timing, Quaternius characters (S4,
`src/timeline/SPEC.md:120-145`); real Supabase auth, real Lemon Squeezy checkout, server-side
telemetry ingestion, Pro entitlement enforcement, GDPR consent tooling (S5,
`src/account/SPEC.md:139-159`); real Meshy/RunPod calls, credits/paywall UI polish, prompt
moderation, image-upload validation beyond a size cap (S6, `src/ai/SPEC.md:127-156`).

---

## 5. Gaps and open risks

Named for the Warden to decide. Not fixed here.

1. **S2 outliner inclusion predicate is still contradictory.** `OutlinerRow.type` includes
   `"Group"` (`src/editor/SPEC.md:149`) but the selection-check fixture and the undo/redo
   serialization both define "outliner contents" by excluding helper/gizmo scaffolding only,
   never stating whether `Group` counts (`src/editor/SPEC.md:37`). The review flagged this
   ("use one outliner inclusion predicate consistently," `reviews/codex_review_S2.md:17`) but did
   **not** pick one. Both the frozen `EditorHandle` type and the acceptance checks above carry
   the ambiguity forward unresolved.
2. **The 8×5 easing expected-value table does not exist in any spec or review.** Target 1's
   numeric check depends on it (`src/timeline/SPEC.md:8-11`); the review says to "add the exact
   8×5 expected-value table to the test fixture" (`reviews/codex_review_S4.md:21`) but supplies
   no values. Someone must author this table — with a citable derivation (e.g. standard
   cubic-bezier/back/bounce formulas at t={0,.25,.5,.75,1}) — before Wave-2 QA can run this check
   at all.
3. **S3's blocking HDRI fetch has no committed number.** The review upgrades Target 7 from
   "fetch-plan-only" to "blocking" (`reviews/codex_review_S3.md:9`, matching `DECISIONS.md:56-61`
   #7's intent) but states no count, resolution, or format check beyond "fetch-and-decode." The
   commitment table above proposes "≥1 HDRI, loads via `RGBELoader`" as the minimum that satisfies
   S1's own Target 3 env check — this is Assembly's inference, not a number either source states.
4. **No spec or review names the specific S3 manifest asset id for S6's avatar tile or Worker mock
   `glbUrl`.** S6's SPEC explicitly punts this ("S3 names one at Assembly time,"
   `src/ai/SPEC.md:121-123`); the review only adds the constraint that it must carry
   `licence:"CC0"` and a `sourceUrl` (`reviews/codex_review_S6.md:18`). Candidates exist (S4's
   scout found 7 rigged Kenney characters, `src/timeline/SPEC.md:154-163`) but nothing in Wave 1
   commits to one. This blocks S6's Worker stub and avatar-tile targets from being fully specified.
5. **S3's own prose still cites a stale S1 method name.** `src/library/SPEC.md:101` says
   `createStudio(canvas).load(url)`, quoting the old `HANDOFF_OPUS.md:83` naming. S1's actual SPEC
   has always been `loadModel` (`src/viewer/SPEC.md:140`), and `reviews/codex_review_S6.md:15`
   independently confirms `loadModel` is the frozen name. Functionally resolved in this SCOPE (§2
   uses `loadModel` throughout) — flagged only so whoever wires the App shell's `LibraryPanel`
   consumer doesn't copy the stale name out of S3's SPEC text.
6. **S5's `AccountState.status` retains a `'loading'` union member that Wave 2 never enters.**
   Per the review's synchronous-resolution replacement (`reviews/codex_review_S5.md:1`), every
   Wave-2 code path reaches `'ready'` on the same tick. `'loading'` stays in the type for API
   stability (real Supabase wiring is Wave-2+/env-gated) but nothing in today's acceptance surface
   exercises it — low-priority, noted for completeness.

---

## 6. Definition of done for the day

End-to-end acceptance script, numbers only, run against `http://localhost:5173` via Playwright:

1. **Load.** `studio.loadModel('C:\3D-Studio\02_projects\furnishow-360\meshes\<any .glb>')`
   (private client test input — never library, never public, `DECISIONS.md:11-12`;
   `CONTEXT.lock.md:22-23`) → `debug.ready()===true` within **3000 ms** (S1 Target 1,
   `src/viewer/SPEC.md:36-38`).
2. **Pick.** `LibraryPanel`'s `onAssetPicked` fires for one `manifest.assets[i]` (S3) → the
   consumer calls `studio.loadModel(asset.fileUrl)` → resolves without throwing (S3 §2 contract,
   `src/library/SPEC.md:94-104`).
3. **Light.** `editor.ops.add({kind:"light-point"})` (S2 Target 4) → scene light count **+1**,
   canvas `changed()` **≥0.5%** moved (`src/editor/SPEC.md:53-56`).
4. **Keyframe a turn.** `timeline.addTurntableClip(duration)` (S4) → exactly **3** quaternion keys
   at `t=0/duration÷2/duration`; `sampleAt(duration/2)` yields rotation **π within 1e-6**
   (review-replaced turntable check, `reviews/codex_review_S4.md:19`).
5. **Export.** `timeline.exportRange(duration, 24)` → `frames.length===24` (S4 Target 3 shape,
   `src/timeline/SPEC.md:15-18`) drives S1's `exportSequence("1024x1024", 24)` → resolves to a
   ZIP.
6. **Assert.** ZIP contains **exactly 24** entries named `frame_0001.png`…`frame_0024.png`; every
   decoded frame is **exactly 1024×1024 px** (S1 Target 5, review-reduced to the ZIP-only
   deliverable, `src/viewer/SPEC.md:75-76`; `reviews/codex_review_S1.md:3-5`).

Pass condition: all six steps complete with 0 thrown errors and every number above matches
exactly — file count `===24`, every frame `1024×1024`, turntable sample `π ±1e-6`, load
`<3000 ms`.
