# Studio Web — `claude/design-product-v1` release report

Assembled from existing evidence files only. Every number cites its source file. No new tests, builds, or servers were run to produce this report.

## 1. Scope and status

This branch delivers, starting from `9c010fe` (`master`), on top of the prior session's Wave 0 baseline at `b00edbd`, to final commit `ca2c72d`:

- A full research pass: competitive audit, accessibility triage, API/cost options (`docs/research/`).
- A completed Wave 0 executable baseline (build, unit, all browser tests, screenshots, real export-byte validation) — `status/baseline.md`.
- Three Wave 3 local-first functions: timeline-sampled export (F1), project v2 + local recovery (F2), export receipt/provenance (F3) — `status/warden-log.md` Gate 3 entry.
- Two defects found and fixed during this program: D-1 (canvas resize during export) and D-2 (autosave dropped during export) — `status/warden-log.md`.
- Full Wave 4 QA: accessibility/responsive (`docs/qa/accessibility-responsive-qa.md`) and performance/reliability (`docs/qa/performance-reliability-qa.md`).

**Explicitly not delivered:** Wave 1-visual (Design Foundation `src/app/style.css` token/type/spacing implementation, Shell visual redesign) and Wave 2 (Library/Editor/States journey work). Both remain blocked on the missing normative Darkroom design artifact (`Studio Web Redesign.dc.html`, direction "1a Darkroom") — see `docs/design/darkroom-request.md` for the full search record and three unblock paths. No visual redesign landed in this branch (`docs/qa/accessibility-responsive-qa.md` §2).

## 2. Commands

| Gate | Command | Source |
|---|---|---|
| Build | `npm run build` (`tsc --noEmit && vite build`) | `package.json`; `status/evidence/gate0/run.log`, `status/evidence/final/warden-final.log` |
| Unit | `npm run test:unit` (`node --test tests/unit/*.test.ts`) | `package.json`; `status/evidence/d2/red-unit.txt`, `green-unit.txt` |
| Per-file Playwright | `npx playwright test tests/<file>.spec.ts --workers=1 --reporter=line` | `status/warden-log.md` Gate 0/Gate 3 entries; `status/evidence/phase-b/summary.md` |
| Serial full run | `npx playwright test --workers=1 --reporter=line` | `status/baseline.md`; `status/evidence/phase-b/summary.md`; `status/evidence/final/warden-final.log` |
| Clean clone (perf QA) | `git clone --branch claude/design-product-v1 "C:/3D-Studio/02_projects/studio-web" "<scratchpad>/studio-web-clean" && cd studio-web-clean && npm ci` | `docs/qa/performance-reliability-qa.md` §"Clean-clone reproduction" |
| Clean clone (final Warden) | clean clone rebuilt at `HEAD=ca2c72d…`, GLB=2268 HDR=12 fixture copy | `status/evidence/final/warden-final.log` |
| Lighthouse | `npx --yes lighthouse@13.4.1 http://localhost:4175/ --output=json --output-path="status/lighthouse-after.json" --chrome-flags="--headless=new --disable-gpu" --quiet` | `docs/qa/performance-reliability-qa.md` §"Lighthouse" |
| axe (primary, failed) | `npx --yes @axe-core/cli http://localhost:4174 --chrome-options="--use-gl=angle,--use-angle=d3d11,--ignore-gpu-blocklist,--headless=new" --save status/evidence/wave4-a11y/axe-after-empty.json` | `docs/qa/accessibility-responsive-qa.md` §"Environment and commands" |
| axe (fallback, used) | `node status/tools/axe-run.mjs <axe.min.js> <out-empty> <out-loaded>` (axe-core 4.10.3 injected into Playwright Chromium) | same |
| Capture scripts | `node status/tools/capture-states.mjs` (before); `node status/tools/capture-after.mjs`, `diff-before-after.mjs`, `keyboard-journey.mjs`, `qa-checks.mjs <check>` (after) | `status/baseline.md`; `docs/qa/accessibility-responsive-qa.md` §1–§8 |
| Preview servers | `npx vite preview --port 4173 --strictPort` (Wave 0), `--port 4174 --strictPort` (a11y QA), `--port 4175` (perf QA) | `status/baseline.md`; both QA reports |

## 3. Measured results

### Tests

| Suite | Before (Gate 0 baseline) | After (final) | Source |
|---|---:|---:|---|
| Unit | 4 | 19 | `status/baseline.md`; `status/evidence/d2/green-unit.txt` |
| Browser (serial total) | 45 | 56 | `status/baseline.md`; `status/evidence/final/warden-final.log` |

Per-file browser counts, baseline → final:

| File | Baseline | Final | Source |
|---|---:|---:|---|
| `e2e.spec.ts` | 4 | 4 | `status/baseline.md`; `status/evidence/d2/regression-e2e.txt` |
| `s1.spec.ts` | 6 | 6 | `status/baseline.md`; `docs/qa/performance-reliability-qa.md` |
| `s2.spec.ts` | 9 | 9 | `status/baseline.md`; `status/evidence/phase-b/summary.md` |
| `s3.spec.ts` | 5 | 5 | `status/baseline.md`; `status/evidence/phase-b/summary.md` |
| `s4.spec.ts` | 7 | 7 | `status/baseline.md`; `status/evidence/phase-b/summary.md` |
| `s5.spec.ts` | 8 | 8 | `status/baseline.md`; `status/evidence/d2/regression-s5.txt` |
| `s6.spec.ts` | 4 | 4 | `status/baseline.md`; `status/evidence/phase-b/summary.md` |
| `studio-shell.spec.ts` | 2 | 2 | `status/baseline.md`; `status/evidence/d2/regression-studio-shell.txt` |
| `exports.spec.ts` (new, F3) | — | 3 | `status/evidence/f3/green-exports.txt`; `status/evidence/d2/regression-exports.txt` |
| `export-timeline.spec.ts` (new, F1) | — | 3 | `status/evidence/f1/green-export-timeline.txt`; `status/evidence/d2/regression-export-timeline.txt` |
| `project-recovery.spec.ts` (new, F2; +P5 for D-2) | — | 5 | `status/evidence/f2/green-recovery.txt` (4); `status/evidence/d2/green-recovery.txt` (5) |
| **Total** | **45** | **56** | |

Note: `status/evidence/phase-b/summary.md` records the Gate-3 (pre-D-2) serial total as 55 and flags the execution handoff's "56 tests expected" as an apparent off-by-one at that point in time. That is resolved, not a live inconsistency: D-2's regression test (P5 in `project-recovery.spec.ts`) was added afterward, taking the file from 4→5 tests and the total from 55→56, exactly matching `status/evidence/final/warden-final.log`'s "56 passed (2.4m)". The two Wave 4 QA reports (`docs/qa/accessibility-responsive-qa.md`, `docs/qa/performance-reliability-qa.md`) were both run at `37884e5`, before the D-2 fix, so they correctly report 55/55 — not an error in those reports.

### Bundle and dist

| Metric | Before (baseline) | After (Phase B / QA) | After (final, post-D-2) | Source |
|---|---:|---:|---:|---|
| `dist/index.html` | 3.59 kB / 1.35 kB gz | 3.61 kB / 1.36 kB gz | 3.61 kB / 1.36 kB gz | `status/baseline.md`; `docs/qa/performance-reliability-qa.md`; `status/evidence/final/warden-final.log` |
| CSS | 10.17 kB / 2.83 kB gz (`index-V8chZ5rB.css`) | unchanged, same hash | unchanged, same hash | same |
| JS | 737.36 kB / 195.39 kB gz (`index-CCYwVa89.js`) | 754.38 kB / 200.15 kB gz (+17.02 kB / +2.3%) | 754.47 kB / 200.18 kB gz (`index-DD4zYsHI.js`) | `status/evidence/phase-b/summary.md`; `status/evidence/final/warden-final.log` |
| Dist files | 2,323 | 2,323 | 2,323 | `status/baseline.md`; `status/evidence/final/warden-final.log` |
| Source maps | 0 | 0 | 0 | same |
| Secrets / private paths | n/a | 0 / 0 | 0 / 0 | `docs/qa/performance-reliability-qa.md` §"dist scan"; `status/evidence/final/warden-final.log` |

The final clean-clone build (754.47 kB) is ~0.09 kB larger than the figure reported by Phase B and both Wave 4 QA passes (754.38 kB), consistent with the small amount of code D-2's fix added to `src/app/persist.ts` after those reports were written.

### Lighthouse (before → after)

| Metric | Before | After | Delta | Source |
|---|---:|---:|---:|---|
| Performance | 51 | 61 | +10 | `status/baseline.md`; `docs/qa/performance-reliability-qa.md` |
| Accessibility | 87 | 87 | unchanged | same |
| Best Practices | 96 | 96 | unchanged | same |
| LCP | 1.8 s | 2.0 s | **+0.2 s (regression)** | same |
| CLS | 0.344 | 0.344 | unchanged | same |
| TBT | 7,180 ms | 843 ms | −6,337 ms | same |
| TTI | 13.8 s | 7.0 s | −6.8 s | `docs/qa/performance-reliability-qa.md` |

### Runtime measurements (after, `docs/qa/performance-reliability-qa.md`)

| Measurement | Result | Baseline comparison |
|---|---|---|
| Cold load (median) | 228 ms (wall-clock), 194 ms (`PerformanceNavigationTiming`) | No directly comparable baseline metric existed |
| First useful render (largest asset) | 197 ms median | Baseline's 735.8 ms is a different measurement point (dev-server E2E load, not prod preview) — not directly comparable |
| Orbit fps | 60 / 60 / 60 (spread 0) | Matches baseline's 60 fps exactly |
| Draw calls (all 3 representative assets) | flat 2 | No baseline figure |
| Memory delta (largest asset load) | 561,545 B median (0.26–0.59 MB spread) | No baseline figure (new metric) |
| Export durations | PNG 195 ms, GLB 130 ms, GLTF 110 ms, Blender ZIP 136 ms, Turntable 1,235 ms | No baseline figure |
| Turntable size | 6,253,518 B (26 ZIP entries: 24 frames + receipt + licence) | Baseline turntable had no receipt (F3 not yet built): exactly 24 entries |
| Recovery record size | 41,399 B (identical across 3 runs) | No baseline (autosave introduced in Wave 3 F2) |

### Accessibility results (`docs/qa/accessibility-responsive-qa.md`)

| Check | Result |
|---|---|
| Keyboard journey | 10/10 steps passed, visible focus ring on every checkpoint tested |
| Contrast | 0/12 failures (AA) |
| axe-core | 2 critical violations, both pre-existing (library grid ARIA), 0 new |
| Touch targets (390×844, 139 elements) | 43/139 fail the product's 44px guideline; 17/139 fail the WCAG 24px AA floor |
| Reduced motion | Spin and Timeline Play both still animate under `prefers-reduced-motion: reduce` (AAA-level gap, not an AA failure) |
| 200% zoom reflow | Both tested cases (640×360, 768×432 @ dsf2) pass — no page-level horizontal scroll |

### Export validation from real downloads (both bases, `status/baseline.md`)

| Format | Bytes (local = live) | Validation |
|---|---:|---|
| PNG | 253,238 | signature + IHDR 2048×2048 |
| GLB | 257,368 | magic `glTF`, version 2 |
| GLTF | 350,712 | valid JSON, `asset.version === "2.0"` |
| Blender ZIP | 608,802 | EOCD found; exactly glb+gltf+README |
| Turntable ZIP | 3,531,811 | EOCD found; exactly 24 frames, each 1024×1024 |

All 10/10 checks passed; local and live byte-identical.

## 4. Before/after screenshots

| Set | Files | Viewports | States | Source |
|---|---:|---|---|---|
| `status/before/` | 70 PNGs + `CAPTURE-NOTES.md` | 1536×864, 1280×720, 1024×768, 768×1024, 390×844 | empty, loaded (2 bases × 5 viewports) + editing, saving, exporting, completion, recoverable (2 bases × 5 viewports) | `status/baseline.md` |
| `status/after/` | 45 PNGs + `CAPTURE-NOTES.md` | same 5 viewports, local only | empty, loaded, editing, saving, exporting, completion, recoverable (7 states × 5 viewports) + 2 new states | `docs/qa/accessibility-responsive-qa.md` §1 |

**Two new states** (no `before/` counterpart): **restore-prompt** (idle hint shows "Unsaved work from HH:MM can be restored" with Restore/Discard) and **context-lost** (`#viewport-error` shows "Graphics context lost — your work was autosaved at … Reload to restore."). Both captured cleanly at all 5 viewports (`docs/qa/accessibility-responsive-qa.md` §1).

**15 of 35 comparable before/after pairs exceed 1%** (5 viewports × 7 shared states = 35; new states excluded). Every one was opened and visually confirmed as one of three causes, none a visual redesign:

| Cause | Pairs affected | Explanation |
|---|---:|---|
| Turntable rotation-angle race | 5 (exporting at every viewport) | Screenshots land at different progress-poll timings, catching a different rotation angle each run |
| Completion-text header shift | 6 (completion + recoverable at 1280×720, 1024×768, 768×1024, 390×844) | Wave 3 F1's longer status text — `"Turntable ready (default 360° sweep — add keys with Turn 360°)"` — wraps inside `#app-status`'s fixed 190px max-width and pushes the header down 15–20px at narrower widths |
| Pre-existing scroll-state capture limitation | 2 (loaded at 768×1024, 390×844) | `status/before/`'s mobile loaded capture was left scrolled to the selected tile (already flagged in `status/baseline.md`); `status/after/` resets scroll to (0,0) as designed |

Every other pair (empty, editing, saving at all 5 viewports; loaded/completion/recoverable at 1536×864) is under 1%; editing and saving are pixel-identical (0.000%) at every viewport. Full numeric table: `status/evidence/wave4-a11y/diff-before-after.json`.

## 5. Defects found in this program

### D-1 — resize during export

- **Found by:** F3's X1 export-artifact guard, real shell, default 1280×720 viewport.
- **Root cause:** `main.ts:101-109`'s `ResizeObserver` on the canvas wrapper calls `studio.resize()`; status-text/layout churn during the export loop fires it mid-sequence, resetting the drawing buffer while `exportSequence` is still running — producing a 1024×1024 first frame followed by viewport-sized (~840×463) later frames. `status/warden-log.md`, "F3 gate accepted" entry.
- **Fix commit:** `c63feb8` — `fix(viewer): defer viewport resize while an export is rendering frames` (`src/viewer/studio.ts`: `resize()` becomes a no-op that records a pending resize while `exportBusy`; the two `finally` blocks clear `exportBusy` before `endOffscreen` so a deferred resize applies correctly afterward).
- **Regression test:** X1 in `tests/exports.spec.ts`.
- **Verified state:** Confirmed fixed twice — (a) test-suite green in the final clean-clone run, and (b) `docs/qa/performance-reliability-qa.md`'s independent runtime check (hand-written ZIP reader, not `src/viewer/zip.ts`) shows all 24 Turntable frames at exactly 1024×1024 across 3 fresh sessions reproducing the original PNG→GLB→GLTF→Blender-ZIP→Turntable trigger sequence at 1280×720.

### D-2 — autosave dropped during export

- **Found by:** The accessibility QA agent, empirically, while building the keyboard-journey script — an unconfirmed reload after Save+Turntable found no IndexedDB recovery record (`docs/qa/accessibility-responsive-qa.md` §3, Findings #4).
- **Root cause:** `createAutosaver` (`src/app/persist.ts`) treats a `null` capture as "nothing to save." The shell's capture returns `null` while the viewer is exporting, so an edit followed within the 2s debounce by an export is never autosaved until another edit calls `markDirty()` again.
- **Fix commits:** `28191d2` (`test(app): prove an edit during an export is never autosaved`), `f5ad16c` (`fix(app): re-arm autosave while the viewer is exporting instead of dropping the save`). Change: capture may return `"busy"`, on which `createAutosaver` re-arms the debounce (guarded against dispose and quota); the shell returns `"busy"` when `studio.debug.state().busy`.
- **Regression test:** Unit tests "a busy capture re-arms the debounce…" and "dispose stops a pending busy retry" (`tests/unit/persist-autosaver.test.ts`); browser test P5 in `tests/project-recovery.spec.ts` ("an edit made while an export is rendering is still autosaved and restorable").
- **Verified state:** Red confirmed — unit 17/19 (2 failing exactly as expected: `status/evidence/d2/red-unit.txt`), browser P5 red (`Restore` button never appeared, `status/evidence/d2/red-recovery.txt`). Green confirmed — unit 19/19, project-recovery 5/5 (`status/evidence/d2/green-unit.txt`, `green-recovery.txt`); regressions exports 3/3, export-timeline 3/3, studio-shell 2/2, e2e 4/4, s5 8/8 all green (`status/evidence/d2/regression-*.txt`).

## 6. Regressions

- **LCP: 1.8 s → 2.0 s (+0.2 s, +11%).** Per `docs/qa/performance-reliability-qa.md` §"Explaining the one regression": FCP and LCP are identical in the after-report (1,954.3 ms), meaning the regression is page-load-time cost, not a late-loading hero element. Two audit-backed causes: (1) the +17.02 kB bundle — the `bootup-time` audit shows the main JS chunk accounting for 8,697 ms of simulated-throttled boot-up time, the largest single contributor; (2) a new boot-time `openRecoveryStore()` call added by Phase B's `persist.ts` wiring — made non-blocking to avoid delaying the library panel mount, but still additional async work contending for the main thread during the LCP measurement window. The restore prompt itself is confirmed **not** a factor (Lighthouse's fresh Chrome profile has no prior recovery record).
- **Bundle: +17.02 kB JS (+2.3%), +4.76 kB gzip** at Phase B / QA time, **+17.11 kB** (754.47 kB vs 737.36 kB baseline) at final HEAD after D-2's small addition. Documented, expected cost of wiring in the three previously-dead Wave 3 modules (`project/scene.ts`, `app/persist.ts`, `timeline/export-plan.ts`, `viewer/receipt.ts`) into `main.ts` — not a defect (`status/evidence/phase-b/summary.md`).

Everything else measured either improved (Performance 51→61, TBT −88%, TTI −49%) or was unchanged (Accessibility 87, Best Practices 96, CLS 0.344, dist file count, 0 maps/secrets, orbit fps steady at 60). No other regression is recorded in either QA report.

## 7. Known limitations and deferred work

From `status/warden-log.md`, `docs/qa/accessibility-responsive-qa.md`, and `docs/qa/performance-reliability-qa.md`:

- **Undo depth after restore:** `restoreScene` replays through `editor.ops.add(...)`, so undo history after a restore is "one add per restored object," not the pre-reload undo/redo stack (`status/warden-log.md` F2 gate; `status/evidence/phase-b/summary.md`).
- **Cached GLB not invalidated by gizmo drags:** `cachedModelBase64` is invalidated by material/modifier/undo actions and model loads, but not by a direct-manipulation gizmo transform — no drag-complete hook exists on the frozen editor surface. Undetected by the current suite; documented gap (`status/evidence/phase-b/summary.md`).
- **Context-loss timestamp is approximate:** the WebGL-context-loss message shows the time `buildProjectDocument()` captured a document, not the time `store.save()` confirmed the write — only a same-tick IndexedDB failure would make the displayed time technically inaccurate (`status/evidence/phase-b/summary.md`).
- **Library grid ARIA invalid** (`aria-required-children`/`aria-required-parent`, 2 axe critical violations) — pre-existing, unchanged, owned by the deferred Silo Library (`docs/qa/accessibility-responsive-qa.md` Findings #1).
- **Library tile label-in-name mismatch** — `aria-label` includes category text never shown visibly — pre-existing, deferred (`docs/qa/accessibility-responsive-qa.md` Findings #2).
- **Sub-12px text:** 16 of 30 `font-size` declarations in `src/app/style.css` sit below the product's 12px floor; 0 reach the 14px body baseline — pre-existing, deferred pending the Darkroom spec (`docs/qa/accessibility-responsive-qa.md` Findings #8; `docs/research/accessibility-triage.md` §5).
- **Reduced motion not honored for Spin/Timeline Play:** only CSS transitions are gated by `prefers-reduced-motion`; `requestAnimationFrame`-driven scene motion is not. This is a Level AAA gap (2.3.3), not an AA failure (`docs/qa/accessibility-responsive-qa.md` §6, Findings #7).
- **Touch targets:** 43/139 interactive elements fail the product's 44px guideline; 17/139 fail the WCAG 24px AA floor at 390×844 — pre-existing, deferred pending the Darkroom spec (`docs/qa/accessibility-responsive-qa.md` §8, Findings #3).
- **Public-clone asset fixtures and private s1 meshes:** a clean public clone has 0 GLB/HDR (gitignored); asset-dependent suites need either a licence-aware fixture archive or the pipeline scripts plus a separate Kenney download. `tests/s1.spec.ts` and one e2e test additionally read private client meshes from `C:\3D-Studio\02_projects\furnishow-360\meshes` (118 files, this machine only) — a public/outside runner cannot run these at all (`docs/qa/performance-reliability-qa.md` §"Asset-fixture limitation").
- **Vite/esbuild advisories:** `npm audit` reports one high (Vite dev-server) and one moderate (esbuild dev-server) advisory, fixable only via a semver-major Vite 8 upgrade, scoped out as separate future work. `npm audit fix --force` was never run (`status/warden-log.md` Tracked risks; `docs/qa/performance-reliability-qa.md` Reliability findings #5).
- **Pre-existing s1/s6 flakes:** `s1.spec.ts` "setRenderHook — render-loop seam" is a timing-sensitive assertion (fixed 300ms sampling window) that failed twice then passed once across 3 isolated reruns; `s6.spec.ts`'s avatar-tile test loses browser execution context during grouped-run navigation, clean on isolated rerun — both reproduce exactly what `status/baseline.md` already recorded, confirmed environment-level and not introduced by this branch (`docs/qa/performance-reliability-qa.md` Reliability findings #3–4).
- **WebGL warnings in s1:** all 425 `INVALID_OPERATION`/`glDrawElements` warning lines in the full serial run originate exclusively from `tests/s1.spec.ts`'s repeated back-to-back model loads on one renderer instance; zero elsewhere. Hypothesized as a renderer-lifecycle/resource-disposal artifact, not a functional defect (every assertion in the affected tests passes); recommended follow-up is `renderer.compile()` or an explicit state-reset in `loadModel()`'s swap path (`docs/qa/performance-reliability-qa.md` Reliability findings #1).

## 8. Rollback

Rollback to either:

- **`b00edbd`** — the prior session's Wave 0 baseline commit on this same branch, or
- **`9c010fe`** — `master`, the starting commit for this program.

Production is untouched by this branch and matches `master`: `status/warden-log.md`'s 2026-09-04 session-start entry confirms the live bundle (`/assets/index-CCYwVa89.js`) equals local `dist/`, and no deployment was performed as part of this program (see §10).

## 9. Final verification

From `status/evidence/final/warden-final.log` (clean-clone run, completed 2026-09-05T01:35:43+05:00):

| Item | Result |
|---|---|
| HEAD | `ca2c72d5db5ffa33ebb6b23a2b7f877ed6cbafd8` |
| Fixture | GLB=2268, HDR=12 |
| Build | exit 0 — `dist/index.html` 3.61 kB/1.36 kB gz, css 10.17 kB/2.83 kB gz (`index-V8chZ5rB.css`, same hash), js 754.47 kB/200.18 kB gz (`index-DD4zYsHI.js`), built in 2.74s |
| Dist scan | 2,323 files, 0 source maps, 0 secrets, 0 private paths |
| Unit tests | 19 tests, 19 pass, 0 fail |
| Serial full run | 56 passed, 0 failed, 2.4 min, exit 0 |
| Port state | 5173 free after the run |

This exactly matches the `HEAD` named as this report's final commit, and the 56-test total is fully accounted for by §3's baseline-to-final per-file breakdown. The Warden's own Gate 4 log entry (`status/warden-log.md`, "2026-09-05 — Gate 4: final verification at ca2c72d") independently records the same HEAD, fixture counts, build/dist/unit/serial results, and additionally notes a pull request was opened against `master` (not merged; production untouched) — consistent with §10 below.

## 10. Merge recommendation

**Merge with conditions.**

Justification: every function this branch claims is red/green proven, independently re-verified from a clean clone (§9), and both defects found during the program (D-1, D-2) are fixed with passing regression tests and independent runtime re-verification (§5). The one measured regression (LCP +0.2s) is small, fully explained, and ships alongside much larger measured improvements (Performance score, TBT, TTI — §3, §6). No secrets, source maps, or private paths reach `dist` (§9). Export artifacts are validated from real downloaded bytes on both local and live bases (§3).

This is not an unconditional "Merge" because:
1. This branch delivers no visual design work — Wave 1-visual and Wave 2 are entirely undone, blocked on the missing Darkroom artifact (§1). Anyone expecting a redesign from this PR will not find one.
2. Two Level-A axe violations (library grid ARIA) and the touch-target/sub-12px-font gaps remain open and deferred (§7) — pre-existing, not regressions, but still real WCAG gaps in the shipped product.
3. Asset-dependent test suites cannot be reproduced by an outside CI runner or a fresh Claude Code session without either a licence-aware fixture archive or the owner's private local asset tree (§7) — a real reproducibility gap for future maintenance.

**Conditions for merge:** the receiving reviewer should be told explicitly that (a) no visual change shipped, (b) the pre-existing accessibility gaps in §7 are known and deferred, not hidden, and (c) the Vite/esbuild dev-toolchain advisories remain open pending a scoped major-version upgrade.

**Deployment is the owner's decision and was not performed as part of this program.** No `wrangler`, Cloudflare Pages, or production-deployment command appears in any evidence file read for this report; `status/warden-log.md` confirms production still matches `master`/`9c010fe`, and its Gate 4 entry records that a pull request was opened against `master` but not merged.
