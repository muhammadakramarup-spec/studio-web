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

