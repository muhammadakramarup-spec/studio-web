# S1 Viewer core — QA report (Wave 2)

Run against `http://localhost:5173` via `npx playwright test tests/s1.spec.ts --reporter=line`,
Chromium routed through ANGLE/D3D11 (`--use-gl=angle --use-angle=d3d11 ...`) so fps numbers reflect
real GPU rendering rather than headless Chromium's default SwiftShader software fallback, which could
not clear 2fps on this scene. All 6 test cases pass. Full run: **6 passed, 33.0s**.
`npx tsc --noEmit` is clean project-wide (0 errors).

Test models: `C:\3D-Studio\02_projects\furnishow-360\meshes` (private client, test input only, never
copied into this repo). HDR fixture: one CC0 Poly Haven HDRI (`studio_small_09_1k.hdr`, the same file
`reference/lamp360viewer.html:381` names), fetched to an OS temp cache at test-run time — S3's own
12/12-HDRI library deliverable landed in parallel and isn't depended on here, so this check has its
own independent input.

| Check (quoted from SCOPE.md §1) | Target | Measured | PASS/FAIL |
|---|---|---|---|
| "Load `coffee-table-10.glb` → `debug.ready()===true` in **<3000 ms**" | <3000ms | **482.3 ms** (also 295.0ms / 809.5ms on earlier runs) | PASS |
| "**≥30 fps** mean over 5 s" | ≥30fps | **60 fps** (Intel UHD Graphics, D3D11) | PASS |
| "Framing: bbox height **55–80%** of frame on 10/118 Furnishow GLBs, 0/10 fail across 5 fixed views" | 0/10 files fail | **0/10 files fail** — 50/50 view measurements land 67.0–68.7% | PASS |
| "Env: Room→Softbox … **≥0.5% pixels moved**" | ≥0.5% | **47.66%** moved | PASS |
| "env rotation 0°→140° … **≥0.5% pixels moved**" | ≥0.5% | **47.50%** moved | PASS |
| "PMREM **<250 ms**" | <250ms | **3.70 ms** (procedural `fromScene`, studio env) / **0.70 ms** (`fromEquirectangular`, real HDR, texture cached) | PASS |
| "HDR path uses `pmrem.fromEquirectangular()` not `fromScene()`" | source-verified | Static check on `src/viewer/studio.ts`: hdr branch calls `fromEquirectangular`, never `fromScene` | PASS |
| "Shadow catcher: **≥20%** alpha=0" | ≥20% | **61.60%** | PASS |
| "**≥1%** alpha=255" | ≥1% | **19.39%** | PASS |
| "**≥0.5%** of pixels outside the opaque-model mask change alpha by >2 between shadows-on/off" | ≥0.5% | **18.73%** (845,287 px outside mask, of 1,048,576 total) | PASS |
| "ZIP: **exactly 24** entries `frame_0001…frame_0024.png`, each exactly **1024×1024**" | 24 entries, exact names, 1024×1024 each | **24/24 entries**, names exact match, **24/24 frames 1024×1024** | PASS |
| PNG export dimensions equal requested resolution (2048×2048 requested) | exact match | **2048×2048** | PASS |
| "Metallic hint: **0 false negatives** on a 10-file hand-count sample" | 0 false negatives | **0/10** — independent GLB-JSON parse (Node, no reuse of studio.ts logic) vs `debug.matInfo()` flagged count matches exactly on all 10 files (1 hand=1 flagged each) | PASS |
| "de-metal changes **≥0.5%** pixels" | ≥0.5% | **8.09% – 66.88%** across the 10 files (all ≥0.5%) | PASS |

## Not in the committed numeric table, verified anyway

| Check | Measured | PASS/FAIL |
|---|---|---|
| `setRenderHook(fn)` — hook invoked instead of default render | **20 calls** in 300ms (~66/s); **0** default `renderer.render()` calls observed while hooked | PASS |
| `setRenderHook(null)` — restores default render path | **18** default `renderer.render()` calls observed in 300ms after clearing the hook | PASS |
| `exportWebM()` — stretch target, may return `null` | **`null`** (Warden-required fix, see finding #2 below) | Contract honoured (resolves, `Blob\|null`, never throws, and now honest — never an unverified small Blob) — **not a BLOCKED.md case**: it never silently disabled anything or threw, it correctly reports "not produced" |

## Frozen-interface / methodology findings for the Warden

1. **Camera framing required departing from `reference/lamp360viewer.html`'s exact ported formula.**
   The reference's `idealDist = max(hh/tan(vf/2), hw/tan(hf/2)) * 1.25` (verbatim-ported first) could not
   land any file in the 55–80% band at the 5 fixed views once actually measured against the real
   Furnishow GLBs: the `ELEV=12°` product-shot tilt makes the fill fraction a non-linear function of
   distance (no single scalar slop constant works for both width-dominant flat furniture and
   height-dominant views), and a corner-based analytic fix still overstated real silhouettes by up to
   ~30 percentage points on some files/views (real meshes don't touch all 8 AABB corners
   simultaneously — a table's wide top and its narrow legs are rarely at the same X/Z). Replaced with a
   numeric binary search that renders a small offscreen alpha-silhouette at each candidate distance and
   solves for the actual measured 68% (band midpoint) — this is what the 0/10-fail number above reflects.
   `idealDist()` itself (diagonal-based, worst-case) is unchanged and still governs `clampRange()`/
   free-orbit zoom bounds so the object can't clip mid-spin; only the discrete `setView`/`frameActive`
   placement uses the new solve. Public `StudioHandle` signature is untouched.
2. **`exportWebM()` now gates on frame-completeness before returning a Blob (Warden-required fix).**
   The first pass returned a `Blob` unconditionally whenever `MediaRecorder` didn't throw, which
   produced a 110-byte "video" — an empty container, not a 24-frame clip — that would have looked like
   a successful export to a caller and then failed to play. Without `ffmpeg` available to this suite to
   decode and frame-count the result (the SCOPE-mandated verification method,
   `reference/harness/t_webm_match.py`, needs it, and Q1's own review already cut that dependency),
   `exportWebM()` now gates on two proxies for "did real encoded video actually flow": `MediaRecorder`
   is started with a 50ms timeslice instead of a single flush-on-stop, and the export requires **≥3**
   non-empty timeslice chunks and **≥72,000 bytes total** (`max(20_000, frames*3_000)`, i.e. ≥3KB/frame
   for a 24-frame request) before returning the `Blob`; failing that gate returns `null` instead.
   Measured on this machine across 3 consecutive runs: **`null` every time** — `MediaRecorder`'s output
   here never clears the size/chunk floor, so the honest answer today is "not produced," not a broken
   Blob. `tests/s1.spec.ts`'s Target 5 case asserts exactly this: `threw===false` and
   (`result===null` **or** `blob.size >= 72000`) — an unverified small Blob can no longer pass the test.
   PNG + the 24-frame ZIP turntable remain the real, fully-verified export deliverable.
3. **Draco decoder** is served from the already-installed `node_modules/three/examples/jsm/libs/draco/gltf/`
   via Vite's dev-server static file serving, not a CDN and not a `public/` asset (S1 may not write
   outside `src/viewer/**`) — confirmed reachable at `/node_modules/three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js`.
4. **Headless Chromium defaults to SwiftShader** (software rendering) unless launched with
   `--use-gl=angle --use-angle=d3d11`, which `tests/s1.spec.ts` sets via `test.use({ launchOptions })`.
   Without it, fps measured ~2 (GPU-stall-on-readback warnings), nothing to do with the renderer code —
   confirmed by toggling the flags and re-measuring. If the Warden's real Playwright run doesn't carry
   these flags forward (e.g. a different project config overrides `launchOptions`), the fps check may
   read low for environmental, not code, reasons.

## What could not be measured

Nothing — every committed row above carries a real measured number from an actual test run.

## Ownership honoured

Created/edited only: `src/viewer/studio.ts`, `src/viewer/zip.ts`, `tests/s1.spec.ts`,
`src/viewer/qa/latest.md`. No other file touched, no git command run, no `package.json`/`npm install`.

## Answer for the Warden: promoting `--use-gl=angle --use-angle=d3d11` etc. to `playwright.config.ts`

Safe to promote for this environment, with one portability caveat and one thing I didn't directly test:

- **Confirmed safe here.** Across ~15+ runs of this suite (including the fix verification above),
  these flags never caused a crash, a flaky launch, or any GPU-process instability — every run
  reported the same real `ANGLE (Intel, Intel(R) UHD Graphics ...) D3D11` renderer and rendered
  correctly. They only change which WebGL backend Chromium uses; a page that never opens a
  `<canvas>`/WebGL context (most of S5's account/DOM-only checks, for instance) isn't touched by them
  either way, so I'd expect zero effect on non-GPU suites.
- **`--use-angle=d3d11` is Windows-only.** ANGLE's D3D11 backend doesn't exist on Linux/macOS; if
  Assembly's e2e run (or a future CI) ever executes on a non-Windows box, this exact flag would likely
  fail WebGL context creation outright rather than falling back gracefully. Fine for today's machine
  (confirmed Windows 11); worth a comment in `playwright.config.ts` if it's promoted, so a future
  cross-platform run doesn't silently regress to 2fps (or fail) without an obvious cause.
- **`--ignore-gpu-blocklist` / `--disable-gpu-sandbox` are broad "trust the GPU" flags.** They didn't
  cause any observed instability in my runs, but they do bypass Chromium's own known-bad-driver
  denylist and reduce a sandbox layer — a reasonable trade on a local/CI box running only our own app,
  worth naming explicitly rather than adopting silently.
- **Not directly tested:** I only ran `tests/s1.spec.ts` (WebGL-heavy) with these flags — I did not run
  S2/S3/S4/S5/S6's suites under them myself, so "no effect on non-GPU suites" above is an architectural
  expectation, not something I measured.

## 2026-09-05 — F1 signature deviation: `exportSequence`/`exportBlenderPackage` gain optional trailing parameters

Wave 3 Function 1 (timeline-sampled turntable export,
`docs/handoffs/2026-09-04-claude-design-product-v1-execution-handoff.md`) needed a way for the
export loop to sample the S4 timeline instead of always driving the built-in linear rotation sweep,
and a way to append provenance/receipt files (the F3 silo's deliverable) after the frame images. Both
needs are met by adding a 4th, **optional** parameter rather than changing any existing parameter:

```ts
export interface FrameSnapshot {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
  fov: number;
}
export interface SequenceOptions {
  applyFrame?: (index: number, frames: number) => void;      // replaces the linear sweep for frame i
  onFrameRendered?: (index: number, snapshot: FrameSnapshot) => void; // what actually rendered
  extraFiles?: { name: string; blob: Blob }[];                // appended to the ZIP after the frames
}
// exportSequence(res, frames, onProgress?, options?): Promise<Blob>
// exportBlenderPackage(extraFiles?): Promise<Blob>
```

Why this is not a breaking change to the frozen `StudioHandle` shape: every existing 3-argument
`exportSequence(res, frames, onProgress)` call and every 0-argument `exportBlenderPackage()` call is
untouched — `options`/`extraFiles` default to `undefined`, and `undefined?.applyFrame` etc. all fall
through to exactly today's code path (linear `pivot.rotation.y = base + i*2π/frames` sweep, no extra
ZIP entries). Verified by `tests/export-timeline.spec.ts`'s "legacy 3-argument exportSequence call
still yields the linear sweep" test (guard) and by rerunning `tests/s1.spec.ts` Target 5 and
`tests/e2e.spec.ts` Steps 5-6 unmodified — both still assert exactly 24 `frame_0001..0024.png`
entries at 1024×1024 and pass unchanged (see `status/evidence/f1/regression-s1.txt`,
`status/evidence/f1/regression-e2e.txt`).

Also fixed as part of the same change (not a signature change, a correctness fix): `beginOffscreen`/
`endOffscreen` previously saved and restored only `pivot.rotation.y`. A sampled timeline frame can
translate or scale the pivot too (position/scale keys, not just rotation), so both functions now
save+restore the full pivot transform (`position`, `quaternion`, `scale`) via `THREE.Vector3/
Quaternion.clone()`/`.copy()`, in addition to the existing camera fov/aspect/position/pixel-ratio
restore. Verified by `tests/export-timeline.spec.ts`'s Test A: pivot transform after export equals
pivot transform before export within 1e-9 (`pivotRestoreDiff=0` measured,
`status/evidence/f1/green-export-timeline.txt`).
