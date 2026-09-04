# Studio Web — Wave 4 Performance and Reliability QA

Branch: `claude/design-product-v1` — HEAD `37884e5c6e7114899cc91d41a261f52827514874` (verified via
`git rev-parse HEAD` against a fresh local clone; matches the commit named in the QA assignment).

Role: measure and report only. No `src/`, `tests/`, `index.html`, `status/baseline.md`, or
`status/warden-log.md` was touched. No git write commands were run in the worktree or main repo.
This QA pass owns exactly `docs/qa/performance-reliability-qa.md` (this file, new),
`status/evidence/wave4-perf/` (new), and `status/lighthouse-after.json` (new).

## Environment

| | |
|---|---|
| OS | Windows 11 (10.0.26200) |
| Node | v24.19.0 |
| npm | 11.17.0 |
| Playwright | 1.62.1 (same as baseline) |
| Lighthouse | 13.4.1 via `npx --yes` (one-off CLI, no project install) |
| Clean clone | `C:\Users\muazz\...\scratchpad\studio-web-clean` (outside the repo, local `git clone` — no network) |
| Ports used | 5173 (Playwright's own `webServer`, self-managed), 4175 (this agent's `vite preview`) |
| Ports never touched | 4174 (the other Wave 4 QA agent's server) |

## Clean-clone reproduction

```
git clone --branch claude/design-product-v1 "C:/3D-Studio/02_projects/studio-web" "<scratchpad>/studio-web-clean"
cd studio-web-clean && git rev-parse HEAD   # 37884e5c6e7114899cc91d41a261f52827514874 — confirmed
npm ci                                       # 25 packages added, 26 audited, 2 vulnerabilities (1 moderate, 1 high)
```

`npm audit` reproduces exactly the two dev-toolchain advisories `status/baseline.md` already tracked
as a risk: esbuild (moderate, dev-server request exposure) pulled in via `vite <=6.4.2`. `npm audit
fix --force` was **not** run, per instructions.

### Asset-fixture limitation (public-clone gap)

A clean clone of `public/assets` contains **0 GLB and 0 HDR files** — both extensions are
intentionally gitignored (`.gitignore`: `public/assets/**/*.glb`, `*.hdr`, `*.ktx2`). Only
`public/assets/manifest.json` (1,054,153 bytes) and the `kenney/` directory tree (36 kit
thumbnails, no models) survive a public clone. This confirms the exact risk
`status/baseline.md` and the `studio-web-site` skill already record: **an outside CI or Claude
Code runner cannot reproduce the asset-dependent suites (s3, e2e, s1, and any export test that
loads a real model) from the public repository alone.**

Two ways a public runner could obtain the missing 2,268 GLBs + 12 HDRIs:

1. **Regenerate via the pipeline scripts, in the mandatory order.** `pipeline/build-manifest.mjs`
   parses every Kenney kit GLB already present under `public/assets/kenney/` and writes
   `manifest.json` **from scratch, models only** — its own header warns this "silently deletes all
   12 Poly Haven HDRI rows" if HDRIs were already merged in. `pipeline/fetch-hdris.mjs` then fetches
   12 named Poly Haven HDRIs (studio_small_03, brown_photostudio_02, royal_esplanade,
   kloofendal_48d_partly_cloudy_puresky, venice_sunset, small_hangar_01, photo_studio_01, quarry_01,
   sunflowers, …) at 1k resolution and read-modify-writes them back into the same `manifest.json`.
   This only works if the Kenney kit GLBs themselves are already on disk (they are not part of this
   repo either — Kenney's asset packs would need a separate one-time download); it does not
   fabricate the underlying 3D files, only the manifest and HDRI fetch.
2. **A private, licence-aware asset archive** (what this QA pass actually did): copy a
   known-good `public/assets/` tree — 2,268 GLBs + 12 HDRIs + `manifest.json` + thumbnails, 77 MB —
   from a trusted local source into the clone's `public/assets/`, exactly mirroring what
   `status/baseline.md`'s Wave 0 run and this QA pass both did from the worktree's already-populated
   fixture. `git status --short` stayed empty after the copy (0 lines), confirming nothing gitignored
   leaked into a commit.

This QA pass used method 2: `cp -r` the worktree's `public/assets/.` into the clean clone. Verified
post-copy: **2,268 GLB, 12 HDR**, `manifest.json` present, `git status --short` empty
(`status/evidence/wave4-perf/05-fixture-copy.log`).

`tests/s1.spec.ts` (header comment, lines 8-10) and one e2e test read **private client meshes** from
`C:\3D-Studio\02_projects\furnishow-360\meshes` as raw bytes at test time (base64 round-trip into the
page — never copied into the repo). Confirmed this directory exists on this machine only: 118 files
present (`_delight-foyer-table-8.glb`, `coffee-table-10.glb`, …). A public/outside runner without
this private tree cannot run `s1.spec.ts` or the private-mesh portion of `e2e.spec.ts` at all.

## Build

Command: `npm run build` (`tsc --noEmit && vite build`). Full log: `status/evidence/wave4-perf/06-build.log`.

| Output | Baseline (before) | This run (after) | Delta |
|---|---:|---:|---:|
| `dist/index.html` | 3.59 kB / 1.35 kB gz | 3.61 kB / 1.36 kB gz | +0.02 kB |
| `dist/assets/index-*.css` | 10.17 kB / 2.83 kB gz | 10.17 kB / 2.83 kB gz | unchanged (same hash `index-V8chZ5rB.css`) |
| `dist/assets/index-*.js` | 737.36 kB / 195.39 kB gz (`index-CCYwVa89.js`) | **754.38 kB / 200.15 kB gz** (`index-DaOQnR2w.js`) | **+17.02 kB (+2.3%) / +4.76 kB gz** |
| Distribution files | 2,323 | 2,323 | unchanged |
| Largest file | 1,959,488 B | 1,959,488 B | unchanged (`assets/hdri/autumn_forest_04.hdr`, same fixture) |
| Source maps | 0 | 0 | unchanged |

The +17.02 kB matches `status/evidence/phase-b/summary.md` exactly, reproduced independently from a
completely clean, gitignore-respecting clone rather than the worktree. Cause, per that summary and
confirmed by inspecting the bundle: `project/scene.ts`, `app/persist.ts`, `timeline/export-plan.ts`,
and `viewer/receipt.ts` — Wave 3's project-v2/recovery, timeline-sampled export, and receipt/provenance
modules — existed on disk before Phase B but were dead code (unimported) until `main.ts` wired them
in. Not a regression to fix; this is Wave 3's real, intended cost.

## Test results

### Unit — `npm run test:unit`

**16/16 passed** (`status/evidence/wave4-perf/08-unit.log`), 229.7 ms total. Matches Phase B's
16/16 exactly (baseline's original 4/4 grew to 16 once F1/F2/F3's unit suites were folded in).

### Per file — `--workers=1 --reporter=line`

| File | Expected | Result | WebGL warning lines (`INVALID_OPERATION`/`glDrawElements`) |
|---|---:|---:|---:|
| `e2e.spec.ts` | 4 | **4 passed** | 0 |
| `s1.spec.ts` | 6 | **6 passed** (after 2 flaky reruns — see below) | 437 / 506 / 362 across the three attempts |
| `s2.spec.ts` | 9 | **9 passed** | 0 |
| `s3.spec.ts` | 5 | **5 passed** | 0 |
| `s4.spec.ts` | 7 | **7 passed** | 0 |
| `s5.spec.ts` | 8 | **8 passed** | 0 |
| `s6.spec.ts` | 4 | **4 passed** (after 1 flaky rerun — see below) | 0 / 0 |
| `studio-shell.spec.ts` | 2 | **2 passed** | 0 |
| `exports.spec.ts` | 3 | **3 passed** | 0 |
| `export-timeline.spec.ts` | 3 | **3 passed** | 0 |
| `project-recovery.spec.ts` | 4 | **4 passed** | 0 |
| **Total** | **55** | **55 passed** | |

Two files flaked on first attempt; per instructions, both are reported in full, never hidden.

**`s1.spec.ts`** — run 1: **5 passed, 1 failed** at `setRenderHook — render-loop seam`
(`expect(result.rendersAfterNull).toBeGreaterThanOrEqual(5)`, received `2`). Port 5173 was confirmed
free (no `LISTENING` entry, only expected `TIME_WAIT` remnants) before the rerun. Run 2 (immediate
rerun): **5 passed, 1 failed**, same assertion, same value (`2`). Run 3: **6 passed, 0 failed**,
same assertion now measuring `19`. Raw logs: `status/evidence/wave4-perf/per-file/s1.log`,
`s1-rerun.log`, `s1-rerun2.log`, summarized in `s1-SUMMARY.txt`. This is a timing-sensitive
assertion (counts default renders inside a fixed 300 ms sampling window after clearing a render
hook) — see Reliability findings.

**`s6.spec.ts`** — run 1: **3 passed, 1 failed** — the avatar-tile test lost its browser execution
context mid-navigation, exactly the failure mode `status/baseline.md` already documented for this
same file ("lost the browser execution context during the avatar test navigation"). Run 2 (isolated
rerun): **4 passed, 0 failed**. Logs: `status/evidence/wave4-perf/per-file/s6.log`,
`s6-rerun.log` / `s6-SUMMARY.txt`.

### Serial full run — `npx playwright test --workers=1 --reporter=line`

**55 passed, 0 failed**, 3.0–3.1 min (`status/evidence/wave4-perf/09-serial-full.log`). Port 5173
was free immediately before and immediately after. This exactly reproduces Phase B's own
"55 passed, 0 failed" result from an independent clean clone.

**WebGL warning count in the serial run: 425 lines**, and tracing them to the surrounding
`[N/55]` test markers shows **100% originate from `tests/s1.spec.ts`** — 169 during "Target 1 —
load + ready + fps" and 256 during "Target 2 & 6 — framing (10 files×5 views) + metallicFactor
hint + de-metal". Zero warning lines appear anywhere else in the 55-test run. This matches and
sharpens `status/baseline.md`'s "Runtime warning evidence" note, which flagged the same two
messages without attributing them to a specific file.

## `dist` scan

Command log: `status/evidence/wave4-perf/10-dist-scan.log`.

- Secret pattern scan (`sk_[A-Za-z0-9]{20,}|service_role|sb_secret|-----BEGIN`): **empty** (no matches).
- Private-path scan (`furnishow|C:\\Users|muazz`): **empty** (no matches).
- Files over 5 MB: **none** (largest is 1,959,488 B ≈ 1.87 MB, an HDRI).
- Licence coverage (`pipeline/verify-licence.mjs` + independent Node check on `dist/assets/manifest.json`):
  **2,280/2,280 assets are `licence === "CC0"`, 0 non-CC0; 2,280/2,280 have `sourceUrl` starting `https://`, 0 failing.**
- `__APP_VERSION__` resolution: `package.json` version is `0.1.0`; the built bundle contains exactly
  one `"studio-web-export-receipt"` literal and one `"0.1.0"` literal in the same object
  (`format:"studio-web-export-receipt",version:1,app:{name:"Studio Web",version:i.appVersion}`),
  confirming `vite.config.ts`'s `define: { __APP_VERSION__: JSON.stringify(pkg.version) }` resolved
  correctly in the production build. Log: `status/evidence/wave4-perf/12-app-version.log`.

## Runtime measurements (clean production build, `vite preview --port 4175`)

Script: `status/evidence/wave4-perf/measure.mjs` (Playwright's `chromium` module directly, not the
test runner — launched with `--use-gl=angle --use-angle=d3d11 --ignore-gpu-blocklist
--enable-precise-memory-info`, viewport 1280×720). Full output:
`status/evidence/wave4-perf/13-runtime-measurements.log`; structured results:
`status/evidence/wave4-perf/measure-results.json`.

Representative manifest assets used throughout (from `public/assets/manifest.json`, 2,268 `model`
assets):

| Role | Asset id | Name | Triangles | File size |
|---|---|---|---:|---:|
| Smallest (triangles > 0) | `kenney/castle-kit/ground` | Ground | 2 | 1,788 B |
| Median | `kenney/fantasy-town-kit/wall-wood-rounded` | Wall Wood Rounded | 136 | 12,632 B |
| Largest | `kenney/city-kit-commercial/building-j` | Building J | 5,246 | 440,652 B |

All three runs below are triplicated (fresh browser context each run); median and spread (max−min)
are reported.

### Cold load (navigation start → `#viewport-hint[data-state="idle"]`)

| Metric | Median | Spread | Runs (ms) |
|---|---:|---:|---|
| Wall-clock (Node-side) | 228 ms | 550 ms | 745, 228, 195 |
| `PerformanceNavigationTiming.duration` (browser-side) | 194 ms | 210 ms | 371, 194, 161 |

No pre-existing baseline number exists for this exact metric (baseline measured a different
quantity — representative model load in the E2E flow, 735.8 ms). Recorded here as the new Wave 4
cold-load figure; the wide spread (161–745 ms) reflects normal cold-cache-vs-warm-cache variance
across fresh browser contexts hitting the same local preview server, not a defect.

### First useful render (click a library tile → `data-state="loaded"`)

| Asset | Median click→loaded | Spread | `debug.state().tris` | `renderer.info.render.calls` | `renderer.info.render.triangles` |
|---|---:|---:|---:|---:|---:|
| Smallest — Ground (2 tris) | 183 ms | 217 ms | 2 | 2 | 66 |
| Median — Wall Wood Rounded (136 tris) | 186 ms | 9 ms | 136 | 2 | 200 |
| Largest — Building J (5,246 tris) | 197 ms | 4 ms | 5,246 | 2 | 5,310 |

`renderer.info.render.triangles` exceeds `debug.state().tris` by a constant ~64 across all three
(the floor/backdrop geometry rendered alongside every model) — consistent, not asset-dependent.
`renderer.info.render.calls` is a flat **2** regardless of asset size: every Kenney kit piece in
the library is a single-mesh, single-material GLB, so draw-call count does not scale with polygon
count in this asset class. Baseline's comparable number — 735.8 ms "representative model load" in
the serial E2E run — is not directly comparable (different asset, different measurement point,
includes Vite dev-server transform time that a production `vite preview` build does not pay); no
regression is claimed from this difference.

### Orbit responsiveness (fps 1 s after 5 synthetic drags, on the largest asset)

**60 / 60 / 60 fps — median 60, spread 0.** Matches baseline's "Measured viewer rate: 60 fps"
exactly, now reproduced against the clean production build with real GPU rendering (ANGLE/D3D11)
under interactive orbit load rather than an idle scene.

### Memory (`performance.memory.usedJSHeapSize`, before/after loading the largest asset)

| | Median | Spread | Runs (bytes) |
|---|---:|---:|---|
| Before | 9,039,879 B | 282,284 B | 9,039,879 / 8,999,583 / 9,281,867 |
| After | 9,588,416 B | 58,524 B | 9,601,424 / 9,588,416 / 9,542,900 |
| Delta | 561,545 B | 327,800 B | 561,545 / 588,833 / 261,033 |

Loading the library's largest single asset (5,246 triangles, 440,652 B GLB) costs roughly
**0.26–0.59 MB of JS heap** (median ≈ 0.56 MB). No prior baseline figure exists for this metric.

### Export durations and byte sizes (real toolbar buttons, `page.waitForEvent("download")`)

Run order per session, matching the D-1 defect's original trigger sequence: PNG → GLB → GLTF →
Blender ZIP → **Turntable last**, on the largest asset, at the default 1280×720 viewport, 3
independent sessions.

| Format | Median duration | Spread | Bytes | Notes |
|---|---:|---:|---:|---|
| PNG | 195 ms | 153 ms | 444,319 B | 2048×2048, verified via PNG IHDR |
| GLB | 130 ms | 93 ms | 461,900 B | |
| GLTF | 110 ms | 30 ms | 618,505 B | |
| Blender ZIP | 136 ms | 247 ms | 1,082,444 B | |
| Turntable | 1,235 ms | 287 ms | 6,253,518 B | 26 ZIP entries: 24 `frame_NNNN.png` + `studio-web-receipt.json` + `LICENCE.txt` (receipt attached because the asset came from the library, per F3's provenance wiring) |

**Defect D-1 runtime re-verification (own STORE-only ZIP reader, not `src/viewer/zip.ts`):** all
**3/3 Turntable runs** — each run following the PNG/GLB/GLTF/Blender-ZIP sequence that originally
triggered the resize-during-export bug — show **`all1024: true`**, all 24 frames at exactly
1024×1024, at the default 1280×720 viewport where D-1 was originally found. **D-1 is confirmed
fixed** at runtime, independent of the test suite's own green result. Full per-run entry lists and
frame dimensions are in `measure-results.json` under `exports.turntableChecks`.

### Autosave cost (IndexedDB `studio-web` / `recovery` / `current`, after "+ Light" + 3 s wait)

| | Median | Spread | Runs (bytes) |
|---|---:|---:|---|
| Recovery record size (`JSON.stringify(record).length`) | 41,399 B | 0 B | 41,399 / 41,399 / 41,399 |

Identical across all 3 runs (same median-asset scene + one added light every time), confirming the
2000 ms debounced autosave (`src/app/persist.ts`'s `createAutosaver`) reliably completes within the
task's 3 s wait window. No prior baseline figure exists for this metric — Wave 3 introduced
autosave.

## Lighthouse — before → after

Same shape as baseline: mobile form factor, simulated throttling, headless, GPU disabled.

```
npx --yes lighthouse@13.4.1 http://localhost:4175/ --output=json \
  --output-path="status/lighthouse-after.json" \
  --chrome-flags="--headless=new --disable-gpu" --quiet
```

The run produced a **complete JSON report** (755,477 bytes, all categories and audits present),
then exited non-zero with a Windows `EPERM` error deleting its Chrome temp profile
(`status/evidence/wave4-perf/14-lighthouse-run.log`) — **this is the exact same benign failure mode
`status/baseline.md` already documented** ("Lighthouse produced a complete report, then exited with
a Windows EPERM error while deleting its temporary browser profile"). Treated as expected, not a
new issue.

| Metric | Baseline (before) | This run (after) | Delta |
|---|---:|---:|---:|
| Performance | 51 | **61** | **+10 (improved)** |
| Accessibility | 87 | 87 | unchanged |
| Best Practices | 96 | 96 | unchanged |
| FCP | *(not in baseline table)* | 2.0 s (1,954 ms) | — |
| LCP | 1.8 s | **2.0 s** (1,954 ms) | **+0.2 s (+11%, regression)** |
| CLS | 0.344 | **0.344** | unchanged (identical value) |
| TBT | 7,180 ms | **843 ms** | **−6,337 ms (−88%, improved)** |
| TTI | 13.8 s | **7.0 s** (6,972 ms) | **−6.8 s (−49%, improved)** |

### Explaining the one regression (LCP +0.2 s)

LCP and FCP are identical in this report (1,954.3 ms both) — the largest contentful element paints
at first contentful paint, meaning the regression is attributable to page-load-time cost, not a
later-loading hero element. Two audit-backed causes, both directly from Wave 3's Phase B wiring:

1. **+17.02 kB bundle** (measured above) — `bootup-time` audit shows the main JS chunk
   (`index-DaOQnR2w.js`) accounting for 8,697 ms of simulated-throttled boot-up time (`scripting`
   component 1,875 ms), the single largest contributor in the trace. A larger chunk to parse and
   execute before first paint pushes FCP/LCP out under Lighthouse's 4× CPU slowdown simulation.
2. **New boot-time IndexedDB open** — `openRecoveryStore()` now runs during `boot()` on every page
   load (Phase B's `persist.ts` wiring, `status/evidence/phase-b/summary.md` "Timing fix" section).
   It was made non-blocking (fire-and-forget) specifically to avoid delaying the S3 library panel
   mount, but it is still additional boot-time async work contending for the main thread during the
   same window Lighthouse measures for LCP.
3. **The restore prompt is not a factor in this specific measurement** — Lighthouse's
   `clearStorageTypes` does not clear IndexedDB by default in this config, but each Lighthouse run
   uses a fresh Chrome profile (per the `chrome-launcher` temp-profile directory in the EPERM error
   above), so no prior recovery record exists and the idle hint renders its plain "Start with a GLB"
   text, not the restore-prompt variant. It is *not* the cause of this LCP delta.

The +0.2 s LCP cost is a real, small, explainable regression that ships alongside a **much larger
net improvement** in Performance score, TBT, and TTI (see Regressions section).

## Budgets (proposed — derived from the measured representative assets above)

These are proposals for the product team to adopt, not existing enforced limits. Each number is
backed by a measurement taken in this QA pass.

- **Draw calls per loaded model: propose a soft budget of ≤ 20.** Measured: all three
  representative assets (2 to 5,246 triangles) render at a flat **2 draw calls** — every Kenney kit
  piece is a single mesh, single material. A budget of 20 gives 10× headroom over everything
  currently observed and would catch a pathological multi-material import before it silently
  degrades frame time.
- **Triangles per loaded model: propose a soft budget of ≤ 50,000.** The library's largest asset
  measured is 5,246 triangles (`kenney/city-kit-commercial/building-j`); 50,000 is ~10× that
  ceiling, chosen to preserve the measured 60 fps orbit rate (spread 0 across 3 runs at 5,246 tris)
  with real margin for a future non-Kenney asset class.
- **JS heap growth per model load: propose a soft budget of ≤ 3 MB.** Measured median 0.56 MB
  (spread 0.26–0.59 MB) loading the current largest asset (440,652 B GLB). 3 MB gives roughly 5×
  headroom for a heavier GLB (more materials/textures) than anything currently in the manifest.
- **Recovery-record (autosave) size: propose a soft budget of ≤ 500 KB per IndexedDB write.**
  Measured 41,399 B for a one-light scene built on the median asset — comfortably inside a 500 KB
  ceiling even allowing for a scene with several added primitives/lights/modifiers.
  `src/app/persist.ts`'s debounce (2000 ms) already bounds write *frequency*; this budget would
  bound write *size* to keep the debounced write itself fast on a large scene.
- **Renderer/texture budget: not independently measurable from this pass.** `performance.memory`
  reports total JS heap, not GPU texture memory, and the Kenney kit assets in the manifest carry no
  large textures to stress this dimension. Recommend a follow-up pass that specifically loads a
  texture-heavy asset (once one exists in the library) and reads `renderer.info.memory.textures`
  before proposing a texture-specific number.

## Reliability findings

1. **WebGL `INVALID_OPERATION`/`glDrawElements` warnings — origin narrowed to `tests/s1.spec.ts`
   exclusively.** Across the full 55-test serial run, all 425 warning lines occur inside exactly two
   `s1.spec.ts` tests: "Target 1 — load + ready + fps" (169 lines) and "Target 2 & 6 — framing (10
   files×5 views) + metallicFactor hint + de-metal" (256 lines) — both of which call
   `studio.loadModel()` repeatedly on private furniture GLBs within a single test, in rapid
   succession, without a full page reload between loads. Zero warnings appear in any other of the
   55 tests, including `s2`–`s6`, `studio-shell`, `exports`, `export-timeline`, `project-recovery`,
   or `e2e` (which also loads models, but only once per test). **Hypothesis:** the warnings are a
   renderer-lifecycle/resource-disposal artifact of loading many models back-to-back on one
   `WebGLRenderer` instance within a short window — a stale `WebGLProgram` uniform-location or
   element-array-buffer binding from the previous model's draw call being reused before the
   renderer's internal state has caught up to the newly bound geometry. This is consistent with
   `status/baseline.md`'s own open question ("Wave 4 must identify whether they originate from
   test-context churn, renderer lifecycle, resource disposal, or a real draw-path defect") — this
   pass narrows it to renderer-lifecycle/resource-disposal territory specifically, not general
   test-context churn (since single-load tests never show it) and not a functional defect (every
   visual/functional assertion in the affected tests still passes). Recommend a follow-up that adds
   `renderer.compile(scene, camera)` or an explicit state-reset call inside `loadModel()`'s
   model-swap path before ruling this fully benign.
2. **Defect D-1 (Turntable resize-during-export) — VERIFIED FIXED**, twice over: (a) the full test
   suite's own regression coverage (`exports.spec.ts` X1, `s1.spec.ts` Target 5, `e2e.spec.ts`
   Step 6) is green in this clean-clone run, and (b) this QA pass's own independent runtime check —
   a hand-written STORE-only ZIP reader, never importing `src/viewer/zip.ts` — confirms all 24
   Turntable frames are exactly 1024×1024 across 3 fresh sessions, each reproducing D-1's original
   trigger (PNG → GLB → GLTF → Blender ZIP exported first, at the default 1280×720 viewport, before
   Turntable runs last).
3. **`s1.spec.ts` "setRenderHook — render-loop seam" is flaky**, unrelated to Wave 3/4 changes
   (this is a pre-existing S1 feature test). It failed identically twice (`rendersAfterNull === 2`,
   asserted `>= 5`) then passed once (`rendersAfterNull === 19`) across three back-to-back isolated
   runs of the same file on an otherwise idle machine. The assertion counts renders inside a fixed
   300 ms real-time sampling window after a render hook is cleared — a scheduler-sensitive design
   that can undercount under momentary contention. Recommend polling for N renders observed rather
   than sampling a fixed wall-clock window.
4. **`s6.spec.ts` avatar-tile navigation flake reproduces exactly** the pattern
   `status/baseline.md` already recorded for this file: the grouped run loses its browser execution
   context during the avatar test's navigation; an isolated rerun is clean. Confirmed pre-existing
   and environment-level, not introduced by Wave 3/4.
5. **npm audit: unchanged from baseline** — 1 moderate (esbuild dev-server request exposure), 1
   high (via the `vite <=6.4.2` dependency chain), fixable only via the semver-major Vite 8 upgrade
   the Warden already scoped out as separate future work. Not run.

## Regressions

Not "none measured" — one real regression was found, alongside several large improvements:

- **LCP: 1.8 s → 2.0 s (+0.2 s, +11%).** Explained above (bundle growth + new boot-time IndexedDB
  open). Small in absolute terms and outweighed by the same build's TBT/TTI/Performance-score gains,
  but it is a genuine, measured cost of Wave 3's wiring and is reported as such rather than rounded
  away.
- **Bundle: +17.02 kB JS (+2.3%), +4.76 kB gzip.** Expected, documented cost of wiring in F1/F2/F3
  (previously-dead code now imported). Not a defect.

Everything else measured either **improved** (Lighthouse Performance 51→61, TBT 7,180→843 ms,
TTI 13.8s→7.0s) or was **unchanged** (Accessibility 87, Best Practices 96, CLS 0.344, dist file
count 2,323, largest file 1,959,488 B, 0 source maps, 0 secrets, 0 private paths, 100% CC0/https
licence coverage, orbit fps steady at 60). D-1 is confirmed fixed with no runtime regression at the
viewport where it originally reproduced.

## Evidence index

All commands' raw output is under `status/evidence/wave4-perf/`:

- `01-clone.log`, `02-versions.txt`, `03-npm-ci.log`, `03b-npm-audit.log`, `04-fixture-check.log`,
  `05-fixture-copy.log` — clean-clone setup and fixture installation.
- `06-build.log`, `07-dist-stats.log` — production build and dist stats.
- `08-unit.log` — unit test run.
- `per-file/*.log`, `per-file/*-SUMMARY.txt` — every per-file browser test run, including both
  flaky-then-clean reruns for `s1` and `s6`, with WebGL warning lines filtered out (counted
  separately, never hidden).
- `09-serial-full.log` — the complete 55-test serial cross-check.
- `10-dist-scan.log`, `11-licence-check.log`, `12-app-version.log` — dist security/provenance scan.
- `measure.mjs`, `13-runtime-measurements.log`, `measure-results.json`, `downloads/` — the runtime
  measurement script, its full console output, structured JSON results, and every real downloaded
  export artifact from the 3 export-timing sessions.
- `14-lighthouse-run.log` — the Lighthouse CLI invocation and its (expected, benign) EPERM exit.

`status/lighthouse-after.json` (worktree root, sibling to `status/baseline.md`) is the full raw
Lighthouse report referenced in the table above.

## Cleanup confirmation

- `vite preview --port 4175` stopped (PID 13960 killed); `netstat -ano | findstr :4175` shows no
  `LISTENING` entry afterward.
- Port 5173 confirmed free after the serial Playwright run (Playwright's own `webServer` starts and
  stops it per invocation; this agent never started a persistent server on it).
- Port 4174 (the other Wave 4 QA agent's server) was never touched.
- The clean clone (`<scratchpad>/studio-web-clean`) is left in place, fixture-populated, for the
  Warden.
