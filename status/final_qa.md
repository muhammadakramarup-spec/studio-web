# Final QA — Wave 3 (Assembly)

One table for the whole day. Rows 1–75 carry each silo's own numbers forward from its QA note
(cited per row group); rows 76–83 are Assembly's own end-to-end run against the assembled shell
(`tests/e2e.spec.ts`), the day's definition of done (`SCOPE.md` §6). Every row has a measured
number — per the lock rule, a row with none is a FAIL.

Suite pass counts, Warden-given and re-verified fresh by Assembly (each suite run alone against
the shared dev server after the shell was wired): **s1 6/6 · s2 9/9 · s3 5/5 · s4 7/7 · s5 8/8 ·
s6 4/4 · e2e 1/1** — 40/40. See "Integration findings" for what happened when all 41 tests ran
back-to-back in one browser session instead.

## S1 — Viewer core (`src/viewer/qa/latest.md`, 6/6 tests passed, 32.4s / re-verified 40.7s)

| Silo | Check | Target | Measured | PASS/FAIL |
|---|---|---|---|---|
| S1 | Load `coffee-table-10.glb` → `debug.ready()===true` | <3000 ms | 482.3 ms (295.0 / 809.5 ms other runs) | PASS |
| S1 | fps mean over 5s | ≥30 fps | 60 fps (ANGLE/D3D11) | PASS |
| S1 | Framing bbox 55–80% of frame, 10 files × 5 views | 0/10 files fail | 0/10 fail, 50/50 views 67.0–68.7% | PASS |
| S1 | Env Room→Softbox pixels moved | ≥0.5% | 47.66% | PASS |
| S1 | Env rotation 0°→140° pixels moved | ≥0.5% | 47.50% | PASS |
| S1 | PMREM build time | <250 ms | 3.70 ms (scene) / 0.70 ms (HDR, cached) | PASS |
| S1 | HDR path uses `fromEquirectangular`, never `fromScene` | source-verified | confirmed by static check | PASS |
| S1 | Shadow catcher alpha=0 | ≥20% | 61.60% | PASS |
| S1 | Shadow catcher alpha=255 | ≥1% | 19.39% | PASS |
| S1 | Shadow toggle alpha change outside opaque mask | ≥0.5% | 18.73% (845,287/1,048,576 px) | PASS |
| S1 | ZIP: 24 entries, exact names, 1024×1024 each | 24/24, exact | 24/24 entries, names exact, 24/24 frames 1024×1024 | PASS |
| S1 | PNG export dims match requested (2048×2048) | exact | 2048×2048 | PASS |
| S1 | Metallic hint false negatives, 10-file hand sample | 0 | 0/10 | PASS |
| S1 | De-metal pixel change | ≥0.5% | 8.09%–66.88% across 10 files | PASS |
| S1 | `setRenderHook(fn)` invoked instead of default render | non-zero hook calls, 0 default renders while hooked | 20 calls/300ms, 0 default renders | PASS |
| S1 | `setRenderHook(null)` restores default render path | non-zero default renders after clear | 17–18 default renders/300ms | PASS |
| S1 | `exportWebM()` contract (stretch, decision #21 fix) | resolves, never throws, `null` or a frame-complete Blob (≥3 chunks, ≥max(20000,frames×3000) bytes) | `null`, 3/3 runs — MediaRecorder here never clears the floor | PASS (honest null, not a broken small Blob) |

## S2 — Editor (`src/editor/qa/latest.md`, 9/9 tests passed, deterministic reruns / re-verified 16/16 combined with S4)

| Silo | Check | Target | Measured | PASS/FAIL |
|---|---|---|---|---|
| S2 | History isolation gate (execute/undo/redo, no editor wiring) | round-trips | afterExecute=5, afterUndo=0, afterRedo=5 | PASS |
| S2 | Undo/redo 50-op canonical-state round trip | undo×50==initial, redo×50==pre-undo | undoCount=50/50, redoCount=50/50, both match | PASS |
| S2 | Selection: outliner UUID set | 5/5 | 5/5 | PASS |
| S2 | Selection: each row selects its UUID | 5/5 | 5/5 | PASS |
| S2 | Selection: 3 fixed canvas coords select their mesh | 3/3 | 3/3 | PASS |
| S2 | Selection: 1 blank coord returns null | true | true | PASS |
| S2 | Gizmo translate delta vs oracle | ≤1e-3 | 1.1e-16 | PASS |
| S2 | Gizmo translate canvas changed() | ≥0.5% | 8.07% | PASS |
| S2 | Gizmo rotate delta vs oracle | ≤1e-3 | 0 | PASS |
| S2 | Gizmo rotate canvas changed() | ≥0.5% | 6.02% | PASS |
| S2 | Gizmo scale delta vs oracle | ≤1e-3 | 4.4e-16 | PASS |
| S2 | Gizmo scale canvas changed() | ≥0.5% | 3.75% | PASS |
| S2 | Add light: object count delta | +1 | +1 | PASS |
| S2 | Add light: canvas changed() | ≥0.5% | 13.20% | PASS |
| S2 | Add primitive: object count delta | +1 | +1 | PASS |
| S2 | Add primitive: canvas changed() | ≥0.5% | 5.68% | PASS |
| S2 | Add camera: object count delta | +1 | +1 | PASS |
| S2 | Material drag: canvas changed() | ≥0.5% | 9.28% | PASS |
| S2 | Material reset: same() | ≤0.6 mean | 0.000 | PASS |
| S2 | Mirror: triangle count | exactly 2× | 12→24 (2×) | PASS |
| S2 | Mirror: bbox negated | ≤1e-4 | within 1e-4 both axes | PASS |
| S2 | Array count=1 (total incl. source) | exactly 1 | 1 | PASS |
| S2 | Array count=5 (total incl. source) | exactly 5 | 5 | PASS |
| S2 | Array changed() between count 1→5 | ≥0.5% | 5.45% | PASS |
| S2 | Bloom on/off changed() within emissive screen bounds | ≥0.5% | 94.32% over 256×256 region | PASS |

## S3 — Library + pipeline (`src/library/qa/latest.md`, 5/5 tests passed / re-verified 9/9 combined with S6)

| Silo | Check | Target | Measured | PASS/FAIL |
|---|---|---|---|---|
| S3 | Kenney GLBs extracted unchanged | 2,268 GLBs, 53.13 MB, 20 kits | 2,268 GLBs, 53,134,388 B exact match, 20 kits | PASS |
| S3 | `manifest.assets` kenney entries with licence+sourceUrl | 2,268 | 2,268 | PASS |
| S3 | GLB spot-check across kits, 0 console errors | ≥20 across ≥10 kits | 20 across 10 kits, 0 errors (after fixing 16 kits' missing sibling `colormap.png`) | PASS |
| S3 | Kit thumbnails: 256×256, ≤50KB | 20 | 20/20, max 43,281 B | PASS |
| S3 | Independent triangle-gate re-parse | 0 failures/2,268 | 0/2,268 | PASS |
| S3 | Licence script (`licence==="CC0"` + `sourceUrl` regex) | exit 0, 100% | exit 0, 100% of 2,280 assets | PASS |
| S3 | HDRI fetch + decode (decision #15: 12 fetched, floor 6) | 12 fetched, ≥6 decode | 12/12 fetched, 12/12 decoded via `RGBELoader` | PASS |
| S3 | Contractual asset ids (decision #16) present, correct bytes/tri/clips | both, exact | `mini-dungeon/character-human` 218,072 B/465 tri/32 clips; `platformer-kit/character-oobi` 236,392 B/1,096 tri/25 clips — exact | PASS |
| S3 | `LibraryPanel` renders + emits `onAssetPicked` | callback fires with asset | fires with `kenney/...` id on tile click | PASS |
| S3 | Hosting shape: same-origin Pages assets, not R2 | within Pages limits | 2,319 files, 77 MB under `public/assets/` | PASS |

## S4 — Timeline & motion (`src/timeline/qa/latest.md`, 7/7 tests passed / re-verified 7/7 combined with S2)

| Silo | Check | Target | Measured | PASS/FAIL |
|---|---|---|---|---|
| S4 | Easing: 8 presets × 5 t-values vs committed fixture | 40/40 ≤1e-3, 0 endpoint failures | 40/40 within tolerance, 0 endpoint failures | PASS |
| S4 | `sampleAt` purity: 100 calls at t=1.234 | 1 distinct output | 1 distinct output of 100 | PASS |
| S4 | `exportRange(duration,36)` shape | length=36, 0 t mismatches | 36, 0 mismatches, adapter untouched | PASS |
| S4 | Scrub: non-circular scene assertion + renderNow count | position ±1e-6 of [1,2,3], renderCalls===1 | [1,2,3] exact, renderCalls=1 | PASS |
| S4 | 50-key JSON round trip | bit-identical | bit-identical, 5,117-char state | PASS |
| S4 | Scrub perf: sampleAt for 20×4×50 keys | mean <2 ms | 0.0218–0.0278 ms mean (~80–90× inside budget) | PASS |
| S4 | Turntable: 3 quaternion keys, sample at duration/2 | keyCount=3, angle π ±1e-6 | keyCount=3, angle=3.141592653589793, diff=0 | PASS |

## S5 — Account, Pro, ads, telemetry (`src/account/qa/latest.md`, 8/8 tests passed / re-verified 8/8 standalone)

| Silo | Check | Target | Measured | PASS/FAIL |
|---|---|---|---|---|
| S5 | Zero-env boot console errors | 0 | 0 console errors, 0 page errors | PASS |
| S5 | `AccountPanel()` signed-out affordance | present | `statusAttr=signed-out`, "Sign in" shown | PASS |
| S5 | `useAccount()` synchronous resolve (decision #18: `status==='signed-out'`) | resolved, non-loading, ≤500 ms | `signed-out`, `isPro=false`, `user=null`, ~11–216 ms sync | PASS |
| S5 | `AdSlot` house placeholder, no shift, 0 ethicalads.io requests | 100%, 0 shift, 0 requests | 3/3 sizes exact boxes, 0px shift, 0 requests | PASS |
| S5 | Checkout stub label + 0 lemonsqueezy.com requests | present, 0 requests | "SANDBOX / TEST MODE", 0 requests | PASS |
| S5 | Telemetry: pre-consent / opt-in / post-opt-out POST counts | 0 / 3 / 3 | 0 / 3 / 3, schema-valid | PASS |
| S5 | Robustness: throwing `localStorage` doesn't break `useAccount()` | no throw | threw=false, still signed-out | PASS |
| S5 | Secrets grep over built bundle (`sk_`/`service_role`/`sb_secret` >20 chars) | 0 matches | 0 matches (isolated `src/account` build — see finding 3 below) | PASS |

## S6 — AI + avatars (`src/ai/qa/latest.md`, 4/4 tests × 3 runs / re-verified 4/4 combined with S3)

| Silo | Check | Target | Measured | PASS/FAIL |
|---|---|---|---|---|
| S6 | Generation round trip idle→queued→running→done | <3000 ms | 216.1 ms max of 3 runs | PASS |
| S6 | All 5 states reachable, 0 network calls | 5/5, 0 requests | 5/5 reached, 0 requests | PASS |
| S6 | Worker `POST /generate`, 0 env vars | HTTP 200, `mock:true`, <200 ms, 10/10 | 200/`mock:true`/`provider:none`/`creditsCharged:0` 10/10 all 3 runs, max 3 ms | PASS |
| S6 | Credits gate: 4th call in-session | error, <50 ms, no transition | 0.1 ms max, `error:'no credits'`, panel untouched | PASS |
| S6 | Mock label in DOM for every `done` result | literal string present | present, `data-mock="true"` 3/3 | PASS |
| S6 | Avatar tile → `onAvatarReady` → `studio.loadModel` | called, loads | fires, resolves 2 meshes/465 tri (decision #16 exact) | PASS |
| S6 | Avatar visible within budget | ≥1 mesh, <2000 ms | 2 meshes, 59.8 ms max | PASS |
| S6 | Avatar 256×256 capture diff vs empty baseline | ≥1,000 px | 3,932 px, stable 3/3 | PASS |

## Assembly — end-to-end (`tests/e2e.spec.ts`, the day's definition of done, SCOPE.md §6)

Run repeatedly in isolation, identical results each time (loadMs varied 483–918 ms across runs
— always well inside the 3000 ms budget; every other number was bit-identical run to run). GPU
launch flags (`--use-gl=angle --use-angle=d3d11`) applied per decision #21's explicit instruction
that the end-to-end run is one of the two suites that needs them. `tests/e2e.spec.ts` now holds
**two** tests: the SCOPE.md §6 definition-of-done script below, and a Wave-3 regression test (see
row "Hint state" and integration finding 0) that drives the real `src/app/main.ts` shell through
normal page navigation and DOM clicks, rather than an isolated dynamic-imported studio.

| Silo | Check | Target | Measured | PASS/FAIL |
|---|---|---|---|---|
| E2E | Step 1 Load: private-client Draco GLB → `debug.ready()===true` | <3000 ms | 483.1–591.8 ms across 3 runs, `ready=true` | PASS |
| E2E | Step 2 Pick: `LibraryPanel.onAssetPicked` fires for a real `manifest.assets[i]` → `studio.loadModel(asset.fileUrl)` resolves | fires, resolves, no throw | fired for `kenney/car-kit/ambulance` (of 2,280 manifest assets), `loadResolved=true`, `loadError=null` | PASS |
| E2E | Step 3 Light: `editor.ops.add({kind:"light-point"})` object count + canvas changed() | +1, ≥0.5% moved | lightCountDelta=1, movedPct=31.37% | PASS |
| E2E | Step 4 Keyframe: `timeline.addTurntableClip(duration)` key shape + `sampleAt(duration/2)` | 3 keys at 0/d÷2/d, angle π ±1e-6 | keyCount=3, keyTs=[0,3,6], angle=3.141592653589793, diff=0 | PASS |
| E2E | Step 4b (Assembly addition): adapter actually drives S1's `pivot` via `scrubTo` + `renderNow` | ≥1 render call, pivot angle π ±1e-6 | renderCallsAfterScrub≥1, pivotAngleAfterScrub diff=0 | PASS |
| E2E | Step 5 Export shape: `timeline.exportRange(duration,24)` | frames.length=24, 0 t mismatches | 24, 0 mismatches | PASS |
| E2E | Step 5b Export artefact: `studio.exportSequence("1024x1024",24)` resolves to a ZIP | resolves, non-empty | resolved, 3,956,206 bytes | PASS |
| E2E | Step 6 Assert: ZIP entry count + names | exactly 24, `frame_0001…frame_0024.png` | 24 entries, names exact match | PASS |
| E2E | Step 6 Assert: every frame's decoded dimensions | 1024×1024 | 24/24 frames 1024×1024 | PASS |
| E2E | Hint state (Warden finding, real app shell, not an isolated studio): `#viewport-hint` before any load / after a real library-tile click loads a model | visible+idle text before, fully hidden after | before: `hidden=false state=idle text="Drop a .glb, or pick one from the library"`; after: `hidden=true state=loaded` | PASS |
| E2E | Bloom readability (Warden finding, real app shell): fully-clipped pixels (R,G,B all ≥250) inside the model's screen bounds, default Bloom on a loaded `kenney/car-kit/ambulance` | <25% clipped | region=[146,110,546,580] totalPx=188,000 clippedPx=0 → **0.000%** (was near-total blow-out before the retune) | PASS |

**All 6 SCOPE.md §6 steps complete with 0 thrown errors; every number matches exactly** — file
count `===24`, every frame `1024×1024`, turntable sample `π ±1e-6` (diff measured as exactly 0),
load `918.3 ms <3000 ms` (worst run measured). **The real app shell's viewport hint now correctly
reflects idle/loading/loaded state** (Warden-reported bug, fixed and regression-tested — see
integration finding 0).

---

## Integration findings

0. **Viewport hint permanently read "Loading studio…" — Warden-caught, not caught by any of the
   40 silo tests or the original end-to-end script.** Root cause: `src/app/main.ts` only cleared
   `#viewport-hint` from three scattered call sites (the library/AI/avatar `onModelReady`-style
   callbacks each calling a `hideHintOnce()`), and the hint's *initial* text was a static string in
   `index.html` never tied to any real state — so a visitor who opened the app and picked nothing
   saw a permanent, false "Loading studio…" over an app that had already finished booting and was
   actively rendering (confirmed live: canvas present, WebGL context up, `[app] studio wired...`
   logged, 0 console errors — the studio was fine, only the hint lied). **Why the existing 40 tests
   and the original `tests/e2e.spec.ts` test missed it:** every one of them (this file's own
   original test included) builds its own isolated `studio`/`editor`/etc. via
   `page.evaluate(() => import('/src/viewer/studio.ts'))`-style dynamic imports, matching
   `tests/s1..s6.spec.ts`'s own pattern (SCOPE.md §6 is written in terms of the frozen interfaces,
   not the shell's DOM) — none of them ever loaded the real page through
   `<script src="/src/app/main.ts">` and inspected what it actually rendered, so `main.ts`'s own
   wiring bugs were structurally invisible to that whole test style. **Fix, entirely inside
   `src/app/**`:** replaced the static text + scattered `hideHintOnce()` calls with one `setHint("idle"
   | "loading" | "loaded")` state machine, set to `"idle"` immediately after `createStudio()`
   returns (it has no real async boot step — nothing to wait on), and centralized by wrapping
   `studio.loadModel` once so *every* load path (library pick, AI generation, avatar tile, and
   anything wired later) can never drift out of sync with the hint again. `index.html`'s static
   fallback text was updated to match the idle copy. **Test added:** a second test in
   `tests/e2e.spec.ts`, "E2E regression — real app shell: `#viewport-hint` reflects actual
   ready/loaded state" — real `page.goto('/')`, reads the live DOM's `hidden`/`dataset.state`/
   `textContent`, clicks a real rendered library tile, and asserts the hint transitions
   idle→loaded. **Verified this test would have caught the original bug**: temporarily reverted
   `src/app/main.ts` and `index.html` to the pre-fix behavior and re-ran the regression test alone
   — it failed with `Expected substring: not "loading studio" / Received: "loading studio…"`,
   exactly reproducing the Warden's report; then restored the fix and re-ran (2/2 passed, repeated
   for stability). Measured before/after: `hidden=false state=idle
   text="Drop a .glb, or pick one from the library"` → `hidden=true state=loaded`.

1. **Nothing broke at the interface boundaries.** Every frozen `SCOPE.md` §2 signature was
   consumed exactly as signed: `createStudio`, `studio.loadModel` (never `.load`, decision #17),
   `attachEditor(studio)` — S1's real `StudioHandle` satisfies S2's local `StudioLike` structurally
   with no adapter needed, `mountLibraryPanel`, `attachTimeline(adapter)` with a real
   `TimelineSceneAdapter` wired to `studio.pivot` and `studio.debug.renderOnce()`, `useAccount`/
   `AccountPanel`/`AdSlot`/`track`, `GenerationPanel`/`AvatarPanel`. No silo directory was edited.

2. **`AccountState.status` reconciliation (per the Warden's brief).** `SCOPE.md` §2/§5 still reads
   `status: 'loading' | 'ready'`; decision #18 overrides this to `'signed-out' | 'signed-in'`, and
   S5 built the override (confirmed in `src/account/types.d.ts` and `qa/latest.md` finding 1). The
   app shell and this report both treat `'signed-out'` as the resolved, non-loading state — no code
   change was needed, only this note. `SCOPE.md` itself was left unedited (it is signed).

3. **WebGL context exhaustion when all 41 tests run back-to-back in one Playwright worker.**
   Running `npx playwright test` with no file filter (40 silo tests + this file's 1) produced 3
   flaky failures — `tests/s1.spec.ts` Target 1, `tests/s5.spec.ts` test 3, and `tests/e2e.spec.ts`
   itself — each surrounded by a flood of `WebGL: INVALID_OPERATION: uniformMatrix4fv: location is
   not from the associated program` console warnings and a final `WebGL: too many errors, no more
   errors will be reported to the console for this context`. Every one of these 3 tests passed
   immediately on an isolated re-run (`--last-failed`, then `tests/s1.spec.ts` alone: 6/6). This is
   the browser's WebGL context limit (Chrome caps live contexts per page/process) being exhausted
   by dozens of `WebGLRenderer` instances created across 40+ sequential tests in one browser
   process — a pre-existing characteristic of running every silo's own fresh-renderer-per-test
   suite together, not something introduced by the shell or `tests/e2e.spec.ts`, and not a defect
   in any silo's code. **Recommendation for whoever runs this suite next: run `npx playwright test`
   per file (as this report's numbers were gathered) rather than as one 41-test batch, or add
   `renderer.dispose()`/context-loss cleanup to the shared test harness if a single-batch run
   becomes a hard requirement.** Every number in this report comes from a run where the affected
   suite passed cleanly, run alone or in a small group — see each section's byline above.

4. **Bloom + the toolbar's default "+Light" position needed one cosmetic tuning pass.** S2's
   default `light-point` (`intensity=5, decay=2`, `src/editor/add.ts:15`) placed close to a loaded
   model overexposes the frame once bloom is also on — not a bug in S2 (its own bloom acceptance
   check uses a fixed, already-tuned scene) and not touched. Fixed entirely inside
   `src/app/main.ts`: the toolbar's "+ Light" button now places the demo light farther from the
   model (`[2.5,3,2.5]` instead of `[1.5,2,1.5]`), and the toolbar's own bloom defaults were tuned
   down (`strength 0.6, radius 0.4, threshold 0.88` instead of `1.2/0.5/0.6`). Verified visually via
   the browser preview after the fix. No silo file was touched.

5. **`tsc --noEmit` is clean project-wide, 0 errors**, including the new `src/app/main.ts` and
   `tests/e2e.spec.ts` — re-verified after every edit in this wave. This matches decision #21's
   note that S1's earlier single `tests/s1.spec.ts` error was fixed before Assembly started; no
   outstanding tsc error exists anywhere in the tree.

6. **`exportWebM()` is correctly `null` in this environment (decision #21), not exercised by the
   end-to-end script.** SCOPE.md §6 only commits to the PNG-export-adjacent ZIP path
   (`exportSequence`), which is what step 5/6 above measure. WebM stays stretch-only and untouched
   by Assembly.

7. **No `BLOCKED.md` was needed.** No blocker was hit three times (or at all) during shell wiring,
   end-to-end test authoring, or verification.

8. **Default Bloom blew the model out to near-solid white — Warden-caught by looking at the app,
   and invisible to every numeric check that existed.** S2's own acceptance check is "≥0.5% of
   pixels moved within the emissive object's screen bounds" and it measured **94.32% — a
   comfortably passing number produced by an unusable image**. S2's defaults were tuned against a
   synthetic emissive box fixture (`src/editor/postfx.ts` `DEFAULT_BLOOM`, threshold 0.6–0.88,
   strength 0.6–1.2), which is a fair fixture for S2's own suite but far too hot for the app's real
   lighting on a plain white Kenney model. Fixed in `src/app/main.ts` only (S2's silo and its
   passing suite untouched): the app now passes `strength 0.15, radius 0.15, threshold 0.99`, so
   only genuinely near-clipped highlights bloom and the glow stays tight. Measured after the
   retune: **0.000% clipped** (0 of 188,000 pixels), and visually confirmed the effect is still
   present — a soft halo, with body panels, orange stripes and blue lights all still legible, so
   this is a retune and not a silent disable. A clipped-pixel guard (<25%) is now asserted in
   `tests/e2e.spec.ts` so it cannot regress.
   *Class of bug:* same as the 110-byte `exportWebM()` Blob (decision #21) — **a green check over a
   wrong artefact.** Both were found by a human-equivalent look, not by a measurement.

## What Assembly touched

- `index.html` — extended markup around the six frozen mount-point ids (`#viewport`,
  `#panel-outliner`, `#panel-library`, `#panel-material`, `#panel-account`, `#panel-ai`,
  `#panel-timeline`), all ids preserved exactly. Added a header/toolbar row.
- `src/app/main.ts` — the real shell, replacing the Wave-2 placeholder. Wires S1→S3→S2→S4→S5→S6
  per `SCOPE.md` §3, plus a usable toolbar (undo/redo, add light/camera/box/sphere, mirror/array,
  bloom, view presets/spin, PNG/turntable-ZIP export) and an outliner/material panel synced to
  S2's selection.
- `src/app/style.css` — dark, quiet chrome (three-column grid: library/ai/account left, viewport
  center, outliner/material right, timeline footer).
- `tests/e2e.spec.ts` — the end-to-end acceptance script (this report's final rows).
- `status/final_qa.md` — this file.
- No silo directory (`src/viewer/**`, `src/editor/**`, `src/library/**`, `src/timeline/**`,
  `src/account/**`, `src/ai/**`, `workers/**`, `pipeline/**`) was edited. No git command was run.
  `package.json` was not edited.

## Ready to deploy

**Yes.** All 40 silo-owned tests pass (individually/per-suite, 40/40) and the end-to-end script
passes 3/3 runs with every SCOPE.md §6 number exact. `tsc --noEmit` is clean project-wide. Bloom was retuned after a Warden review (finding 8) and is now guarded by a clipped-pixel
assertion. The one outstanding item is finding 3 above (run tests per-file rather than as one 41-test batch, or treat
it as a future harness hardening task) — it affects local CI ergonomics only, not the shipped app.
