# Studio Web Wave 0 Baseline

Date: 2026-09-04  
Environment: Windows, Node 24.19.0, npm 11.17.0, Playwright 1.62.1  
Repository: <https://github.com/muhammadakramarup-spec/studio-web>  
Branch: `claude/design-product-v1`  
Starting commit: `9c010fe`

The execution handoff named `494b69b` as its starting commit. `master` advanced to `9c010fe` only to
add `.worktrees/` to `.gitignore`; no product source changed between those commits.

## Gate summary

Wave 0 has a real executable baseline and is ready for Warden review. The production build, all four
unit tests, all 45 browser tests per file, and the complete 45-test serial run pass. Wave 1 visual
implementation remains blocked on the missing normative Darkroom design artifact.

Two additional risks must be tracked rather than hidden: a clean public clone does not contain the
large GLB/HDR asset payload required by asset tests, and the current Vite 5 toolchain has one high and
one moderate npm advisory.

## Repository and fixture setup

- `npm ci`: passed; 25 packages installed.
- Public-clone fixture check: `0` GLB and `0` HDR files after clone because these extensions are
  intentionally gitignored.
- Local test fixture injection: copied `2,268` GLBs and `12` HDRIs from the existing licensed local
  asset store into the isolated worktree. Git status remained clean because these files are ignored.
- Reproducibility requirement: add a documented, licence-aware fixture fetch or release-artifact step
  before expecting outside CI or Claude Code runners to reproduce the asset suites.

## Build baseline

Command: `npm run build`

Result: passed.

| Output | Size | Gzip |
|---|---:|---:|
| `dist/index.html` | 3.59 kB | 1.35 kB |
| `dist/assets/index-V8chZ5rB.css` | 10.17 kB | 2.83 kB |
| `dist/assets/index-CCYwVa89.js` | 737.36 kB | 195.39 kB |

- Modules transformed: `48`
- Build time: `2.73 s`
- Distribution files: `2,323`
- Largest distribution file: `1,959,488` bytes
- Source maps: `0`
- Known warning: the main JavaScript chunk exceeds Vite's 500 kB warning threshold.

## Unit baseline

Command: `npm run test:unit`

Result: `4 passed, 0 failed` in about `204 ms`.

- Project round trip preserves active model, view, and timeline.
- Project parser rejects unsupported versions and malformed model data.
- Telemetry payload keeps only allowlisted fields.
- Telemetry payload rejects free text, non-finite durations, and unknown events.

## Browser baseline by file

Each file ran with `--workers=1`.

| File | Result |
|---|---:|
| `tests/e2e.spec.ts` | 4 passed |
| `tests/s1.spec.ts` | 6 passed |
| `tests/s2.spec.ts` | 9 passed |
| `tests/s3.spec.ts` | 5 passed |
| `tests/s4.spec.ts` | 7 passed |
| `tests/s5.spec.ts` | 8 passed |
| `tests/s6.spec.ts` | 4 passed on clean retry |
| `tests/studio-shell.spec.ts` | 2 passed |
| **Total** | **45 passed** |

The first grouped S6 run passed three tests and lost the browser execution context during the avatar
test navigation. A fresh isolated rerun passed all four; avatar load completed in about `404 ms`,
reported two meshes and 465 triangles, and changed 3,929 comparison pixels. Preserve this as flake
evidence and investigate navigation/server lifetime if it recurs.

## Complete serial cross-check

Command: `npx playwright test --workers=1 --reporter=line`

Result: `45 passed` in `3.0 min`.

Representative measured evidence:

- Manifest assets: `2,280`
- Representative model load: `735.8 ms` in the serial E2E run
- Renderer: ANGLE on Intel UHD Graphics using Direct3D 11
- Measured viewer rate: `60 fps`
- Added-light visual movement: `31.37%`
- Turntable: exactly `24` PNG frames, all `1024×1024`
- Bloom clipping check: `0.000%` fully clipped pixels in the tested bounds
- Timeline sample performance: about `0.0146 ms` mean over 1,000 iterations
- Signed-out and zero-environment account tests: passed with no account-module console or page errors
- Telemetry: zero pre-consent requests and schema-valid opt-in events
- Distribution secret-pattern test: passed

## Runtime warning evidence

The S1 rendering tests repeatedly logged these WebGL warnings while functional and visual assertions
passed:

- `INVALID_OPERATION: uniformMatrix4fv: location is not from the associated program`
- `GL_INVALID_OPERATION: glDrawElements: Must have element array buffer bound`

These are not baseline test failures, but they are reliability and diagnostic-noise findings. Wave 4
must identify whether they originate from test-context churn, renderer lifecycle, resource disposal,
or a real draw-path defect.

## Screenshot evidence

Twenty screenshots are stored in `status/before/`:

- Sources: local production preview and stable Cloudflare production
- Viewports: `1536×864`, `1280×720`, `1024×768`, `768×1024`, and `390×844`
- States: empty and first-library-asset loaded

The mobile loaded-state capture remains scrolled to the selected library tile after Playwright clicks
it. Treat that as scroll-state evidence, not as proof that the mobile viewport is missing. Later design
comparison captures must explicitly reset scroll position and capture the viewport, library, and
inspector sections separately.

## Lighthouse baseline

Report: `status/lighthouse-local.json`

| Category or metric | Result |
|---|---:|
| Performance | 51 |
| Accessibility | 87 |
| Best practices | 96 |
| Largest Contentful Paint | 1.8 s |
| Cumulative Layout Shift | 0.344 |
| Total Blocking Time | 7,180 ms |

Lighthouse produced a complete report, then exited with a Windows `EPERM` error while deleting its
temporary browser profile. The run used headless Chrome with GPU disabled, so use the results as a
directional baseline and rerun with an approved GPU-capable profile before setting final budgets.

## Axe baseline

Axe at `1536×864` reported `43` passed rules, `1` incomplete rule, and two critical violation groups:

1. `aria-required-children`: one `.library-panel__grid` node uses a grid structure without required
   row children.
2. `aria-required-parent`: 96 asset buttons use `role="gridcell"` without a required row parent.

Reference: <https://dequeuniversity.com/rules/axe/4.13/aria-required-children> and
<https://dequeuniversity.com/rules/axe/4.13/aria-required-parent>.

## Dependency audit

`npm audit` reports two development-toolchain vulnerabilities:

- High: Vite development-server path handling on affected versions.
- Moderate: esbuild development-server request exposure on affected versions.
- npm proposes Vite 8.2.2 as a semver-major fix.

Do not run `npm audit fix --force`. Create a scoped Vite upgrade task that verifies Node compatibility,
build output, local-server exposure, and all 49 current unit/browser checks before changing the lockfile.

## Darkroom artifact search

`Studio Web Redesign.dc.html` was not found in:

- the complete Studio Web project and repository
- `C:\3D-Studio`
- the user's Documents and Downloads folders
- Codex attachments
- the user's temporary-file directory

Only unrelated `.dc.html` logo-reveal files exist under `C:\3D-Studio`. The owner must attach the exact
file or provide the Claude Design project ID. Wave 0 and research can proceed; Wave 1 visual
implementation must not invent the missing specification.

## Warden review checklist

- [x] Isolated branch exists at a recorded commit.
- [x] Dependencies install in the coding runner.
- [x] Production build passes.
- [x] Four unit tests pass.
- [x] All 45 browser tests pass per file.
- [x] Complete 45-test serial cross-check passes.
- [x] Local and live screenshots exist at five target viewports for empty and loaded states.
- [x] Lighthouse and axe evidence is recorded with limitations.
- [x] Dependency and WebGL warnings are recorded.
- [ ] Normative `Studio Web Redesign.dc.html` artifact is available.
- [ ] Public-clone asset fixture installation is reproducible without the owner's private local tree.

## Recommended next action

Accept Gate 0 as a measured application baseline with two tracked infrastructure risks. Continue
read-only research and accessibility triage, but do not start Darkroom visual implementation until the
owner supplies the normative design artifact. In parallel, create a licence-aware fixture acquisition
task so external Claude Code and CI runners can reproduce the complete test suite.

## Wave 0 completion — state captures and downloaded-export evidence (2026-09-04)

Closes the two Wave 0 gaps named in
`docs/handoffs/2026-09-04-claude-design-product-v1-execution-handoff.md` (Wave 0 checklist): editing /
saving / exporting / completion / recoverable state captures at all five target viewports for both the
local production build and the live site, and real downloaded-bytes export evidence. Documentation and
evidence only; no file outside `status/before/`, `status/tools/`, and this section of `status/baseline.md`
was touched.

### Method

`dist/` (already built, matches production per the Warden's 2026-09-04 23:49 gate note) was served with
`npx vite preview --port 4173 --strictPort`, run in the background from the worktree. Port 5173 (the
Warden's shared Phase A dev server, PID 23436) was left untouched throughout; port 4173 was confirmed
free both before starting the preview server and after stopping it. The live site
`https://studio-web-6ms.pages.dev/` was captured against production as-is, no server needed.

A new Node ESM script, `status/tools/capture-states.mjs`, drives Playwright's real Chromium
(chromium-1234, already installed) with `--use-gl=angle --use-angle=d3d11 --ignore-gpu-blocklist` so
WebGL actually renders (headless SwiftShader would be far too slow for 24-frame turntable exports). For
each of 2 bases x 5 viewports it opens one fresh browser context/page, loads the base, waits for
`#viewport-hint[data-state="idle"]`, then drives the five states in sequence on that same page: editing
(click first library tile, wait for `data-state="loaded"`, click "+ Light", wait 500 ms), saving (click
"Save project", capture the real download event, wait for `#app-status` to start with "Project saved"),
exporting (click "Turntable", poll `#export-status` every 50 ms up to 10 s for the pattern
"Exporting NN%", capture at first match), completion (await the same download finishing, wait for
`#export-status` to equal "Turntable ready"), and recoverable (setInputFiles on `#model-file-input` with a
temp `not-a-model.txt` containing "hello", wait for `#viewport-error` to become visible). Every screenshot
resets scroll to (0,0), waits 300 ms, and is a viewport-only PNG (fullPage: false) at
`status/before/<live|local>-<w>x<h>-<state>.png`. A separate pass at 1536x864 on both bases downloads PNG,
GLB, GLTF, Blender ZIP, and the Turntable ZIP via their real toolbar buttons and validates the actual
downloaded bytes with a hand-written STORE-only ZIP central-directory parser (`parseZipEntries` /
`extractStoredEntry` in the script) — deliberately not imported from `src/viewer/zip.ts` so the check does
not trust the code it is meant to verify.

One bug was found and fixed during this run: `#viewport-hint` is intentionally hidden once
`data-state="loaded"` (see `src/app/main.ts` `setHint()` — `state === "loaded"` sets
`viewportHint.hidden = true`), so the first attempt's default `waitForSelector` (state: "visible") never
resolved even though the model had loaded correctly; it was changed to state: "attached". The first
(broken) attempt's partial output was discarded (screenshots overwritten, CAPTURE-NOTES.md reset) before
the clean run recorded below.

Exact commands used, run from the worktree root:

```
npx vite preview --port 4173 --strictPort          # backgrounded; PID 28212 on this run
node status/tools/capture-states.mjs
taskkill /PID 28212 /F                             # after capture completed
netstat -ano | findstr ":4173"                     # verified no LISTENING entry remained
```

### Capture matrix

All 50 captures (2 bases x 5 viewports x 5 states) succeeded on the clean run. `status/before/CAPTURE-NOTES.md`
was created (per the task's failure-logging contract) but contains only its header — zero failure lines —
confirming nothing timed out or was skipped.

**local** (`http://localhost:4173`, production `dist/`)

| Viewport | editing | saving | exporting | completion | recoverable |
|---|:---:|:---:|:---:|:---:|:---:|
| 1536x864 | ok | ok | ok | ok | ok |
| 1280x720 | ok | ok | ok | ok | ok |
| 1024x768 | ok | ok | ok | ok | ok |
| 768x1024 | ok | ok | ok | ok | ok |
| 390x844 | ok | ok | ok | ok | ok |

**live** (`https://studio-web-6ms.pages.dev/`)

| Viewport | editing | saving | exporting | completion | recoverable |
|---|:---:|:---:|:---:|:---:|:---:|
| 1536x864 | ok | ok | ok | ok | ok |
| 1280x720 | ok | ok | ok | ok | ok |
| 1024x768 | ok | ok | ok | ok | ok |
| 768x1024 | ok | ok | ok | ok | ok |
| 390x844 | ok | ok | ok | ok | ok |

Every cell is a real file at `status/before/<live|local>-<w>x<h>-<editing|saving|exporting|completion|recoverable>.png`
(50 files total). Visual spot checks: the editing captures show a third DirectionalLight added to the
Scene outliner (the "+ Light" click registered); the recoverable captures show both the red `#app-status`
message and the `#viewport-error` alert box reading "Choose a binary glTF file ending in .glb." over the
still-loaded model; the exporting captures show a live "Exporting NN%" toolbar readout.

During saving, the downloaded `.studio.json` was 337,936 bytes at every viewport on both bases (same
active model, view, and timeline state each time — not committed, deleted with the rest of the temp
directory). During exporting/completion, the downloaded turntable ZIP size varied by viewport because
rendered pixel content changes PNG compression even though frame size is fixed at 1024x1024: observed
2,058,969-5,222,415 bytes across the ten state-matrix downloads; every one of those ZIPs still carried
exactly 24 STORE entries once parsed.

### Export evidence (real downloaded bytes, 1536x864, both bases)

| Format | Base | Bytes | Validation |
|---|---|---:|---|
| PNG | local | 253,238 | pass — signature 89 50 4E 47 0D 0A 1A 0A present; IHDR width/height = 2048x2048 |
| PNG | live | 253,238 | pass — same as local |
| GLB | local | 257,368 | pass — magic "glTF", version uint32 LE at offset 4 = 2 |
| GLB | live | 257,368 | pass — same as local |
| GLTF | local | 350,712 | pass — valid JSON, asset.version === "2.0" |
| GLTF | live | 350,712 | pass — same as local |
| Blender ZIP | local | 608,802 | pass — EOCD found; central directory lists exactly studio-scene.glb, studio-scene.gltf, README-Blender.txt |
| Blender ZIP | live | 608,802 | pass — same as local |
| Turntable ZIP | local | 3,531,811 | pass — EOCD found; exactly frame_0001.png ... frame_0024.png, each parsed frame's IHDR = 1024x1024 |
| Turntable ZIP | live | 3,531,811 | pass — same as local |

Local and live bytes are byte-size-identical per format, consistent with the Warden's prior confirmation
that the live bundle matches `dist/` exactly. All 10/10 checks passed; zero validation failures.

### Limitations

- The exporting capture is an inherent race: the script proceeds the instant `#export-status` first
  matches "Exporting NN%", but the required 300 ms scroll-settle wait before the actual screenshot means
  the visible percentage in the saved PNG is usually well past the percentage that satisfied the poll
  (observed: polls matched at "Exporting 4%" on every combination, but the 1536x864/local screenshot
  itself shows "Exporting 71%" by the time it was taken). Treat the captured percentage as illustrative of
  the in-progress state, not as a specific frame number.
- The turntable-ZIP byte sizes captured mid-sequence (saving/completion runs, listed above) vary by
  viewport/run because they depend on rendered pixel content, not because frame count or resolution
  changed — every downloaded ZIP in this pass, including all 10 dedicated export-evidence ZIPs, verified
  at exactly 24 frames of 1024x1024.
- saving and exporting/completion were captured after editing's "+ Light" click in the same page session,
  so every non-editing state in the matrix reflects a scene with the extra light already added — this
  matches the natural user flow the task describes (open, edit, save/export) rather than five independent
  blank-slate states.
- Per the task's explicit scope, only 1536x864 was used for export-evidence byte validation; the other
  four viewports were not re-validated for export bytes (only for the state-matrix screenshots).

