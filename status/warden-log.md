# Warden log — claude/design-product-v1

Append-only record of gate reviews, ownership assignments, and decisions for the Claude Design
Product V1 program. The Warden writes only this file; silos never edit it.

## 2026-09-04 — Session start

- Starting point: `master` at `9c010fe` (handoff named `494b69b`; the two later commits are
  documentation only). Branch `claude/design-product-v1` already existed at `b00edbd` with the
  Wave 0 baseline from the previous session; this session does not re-create it.
- Production check: live bundle `/assets/index-CCYwVa89.js` equals local `dist/`; git and
  production agree.
- Darkroom artifact: `Studio Web Redesign.dc.html` (direction 1a) is not present anywhere reachable
  from this machine — repository, `C:\3D-Studio`, Documents, Downloads, the two repo-snapshot
  ZIPs in `OneDrive\Documents\3d 4d\website data`, the owner's published Claude artifacts, and the
  design-sync connector (needs a one-time `/design-login` from an interactive session).
  **Blocked.** Request recorded in `docs/design/darkroom-request.md` (Wave 1 research silo).
- Owner decision (this session): while the artifact is missing, proceed with Wave 1 research and
  the three Wave 3 local-first functions. Wave 1 Design Foundation / Shell visual work and Wave 2
  presentation work are deferred until the artifact arrives.

### Decision W-1 — Wave reorder

Wave 3 (timeline-sampled export, project v2 + local recovery, export receipt/provenance) does not
depend on the visual design and addresses every Priority 0 trust item. It runs before Waves 1-visual
and 2. Rationale: `exportSequence` uses an independent rotation sweep (`src/viewer/studio.ts:905`),
project v1 drops editor objects/modifiers/asset identity, no autosave or context-loss handling
exists, and exports carry no provenance — all verified by reading the code this session.

### Decision W-2 — Silo ownership for Wave 3 Phase A

| Silo | Writes | Never touches |
|---|---|---|
| F1 timeline export | `src/viewer/studio.ts` export section only, `src/timeline/sampler.ts`, `src/timeline/export-plan.ts` (new), `tests/export-timeline.spec.ts` (new), `tests/unit/export-plan.test.ts` (new), `src/viewer/qa/latest.md` | `src/app/main.ts`, `src/timeline/index.ts`, `src/viewer/zip.ts` |
| F2 project v2 + recovery | `src/project/format.ts`, `src/project/scene.ts` (new), `src/app/persist.ts` (new), `src/editor/add.ts` (userData tag only), `tests/unit/project-format.test.ts`, `tests/unit/project-v2.test.ts` (new), `tests/fixtures/project-v1.studio.json` (new), `tests/project-recovery.spec.ts` (new) | `src/app/main.ts`, other `src/editor/*`, `index.html`, `src/viewer/*` |
| F3 receipt + provenance | `src/viewer/receipt.ts` (new), `src/viewer/zip.ts` (only if required), `vite.config.ts` (define only), `tests/unit/receipt.test.ts` (new), `tests/exports.spec.ts` (new) | `src/viewer/studio.ts`, `src/app/main.ts`, `src/library/*` |

Phase B (after Phase A gates): one Shell agent owns `src/app/main.ts` and `index.html` (mount IDs
preserved) to integrate all three.

### Decision W-3 — Commits and evidence

Silos do not run git write commands. The Warden commits each silo's owned paths after reviewing
its gate, using conventional commits, and pushes after each accepted gate. Red and green test
output is stored under `status/evidence/<silo>/`.

### Tracked risks (not hidden)

1. A clean public clone has no GLB/HDR fixtures (gitignored); s3/e2e cannot run without the
   pipeline scripts or the owner's private asset store.
2. `npm audit` reports Vite/esbuild dev-server advisories; the semver-major Vite upgrade is a
   separate scoped task. Never `npm audit fix --force`.

## 2026-09-04 23:49 — Gate 0 accepted

Warden re-ran the baseline in this worktree (`status/evidence/gate0/run.log`): `npm run build`
exit 0 (bundle `index-CCYwVa89.js`, identical to production), `npm run test:unit` 4/4, browser
files per file with `--workers=1`: e2e 4, s1 6, s2 9, s3 5, s4 7, s5 8, s6 4, studio-shell 2 —
45/45 in 3 min 45 s. The previous session's `status/baseline.md` stands as the measured baseline.
Open Wave 0 items handed to the docs-only capture agent: editing / saving / exporting /
completion / recoverable state captures at five viewports and real-download export evidence.

### Decision W-4 — Shared dev server during Phase A

One dev server on http://localhost:5173 is started by the Warden for the whole of Phase A so
that concurrent silo Playwright runs reuse it (`reuseExistingServer: true`) instead of starting
and killing their own. Silos never start or stop servers. The Wave 0 capture agent uses
`vite preview --port 4173` against the already-built `dist/` and stops it when done. The Warden
stops the dev server when Phase A closes.

## 2026-09-05 — Gate 1 (research portion) accepted

Deliverables reviewed: `docs/design/darkroom-request.md` (89 lines; nine searched locations with
negative results; three unblock paths for the owner), `docs/research/competitive-audit.md`
(28 evidence-tagged vs 42 unverified claims; ten scored problems), `docs/research/accessibility-triage.md`
(13 evidence tags, 15 primary w3.org/deque URLs; 16 of 30 font-size declarations sit below the
12 px floor), `docs/research/api-and-cost-options.md` (53 evidence vs 91 unverified; several
vendor pricing pages returned 403 and are flagged as secondary). Unverified items are labelled,
not hidden. Design Foundation and Shell visual silos remain **not started** pending the artifact.

## 2026-09-05 — Wave 0 completion and F1 gate accepted

- Wave 0 completion: 50 new captures (saving, editing, exporting, completion, recoverable × five
  viewports × live/local) in `status/before/`, reusable `status/tools/capture-states.mjs`, and
  real-download validation of all five export formats on both bases (bytes identical local vs
  live) appended to `status/baseline.md`. Preview port 4173 released. Wave 0 is now complete.
- F1 (timeline-sampled export) accepted: red evidence shows `frame 0 was never reported to
  onFrameRendered` and `expect(25) received 24` against the starting code; green shows 3/3 with
  worst quaternion/position/pivot-restore differences of 0; regressions s1 6/6, s4 7/7, e2e 4/4
  unchanged (24-entry turntable assertions intact). Frozen signatures gained optional trailing
  parameters only, recorded in `src/viewer/qa/latest.md`. Shell integration snippet is in
  `status/evidence/f1/requests.md` for Phase B. Found defect confirmed: `addTurntableClip`
  leaves `state.duration` stale; the planner uses the maximum authored key time instead.

## 2026-09-05 — F3 gate accepted; resize-during-export defect assigned to Phase B

- F3 (receipt + provenance) accepted: 5/5 receipt unit tests red (module missing) then green;
  `tests/exports.spec.ts` X3 (local file leaks nothing) green; X2 (receipt in packages) red as
  expected until Phase B wires the registry. `__APP_VERSION__` is injected from package.json by
  `vite.config.ts` and never read from the environment. Snippets in `status/evidence/f3/requests.md`.
- **Defect D-1 (found by F3's X1 guard, real shell, default 1280×720 viewport):** after the
  export-button click cycle, a Turntable export returns `frame_0001.png` at 1024×1024 but later
  frames at the viewport size (~840×463). Cause: `main.ts:101-109` observes the canvas wrapper with
  a `ResizeObserver` that calls `studio.resize()`; status-text/layout churn during the export loop
  fires it between frames, and `resize()` resets the drawing buffer while `exportSequence` is still
  running. The synthetic-studio tests (s1 Target 5, e2e Step 6) never see it because they have no
  observer. Fix assigned to Phase B in `src/viewer/studio.ts`: `resize()` becomes a no-op that
  records a pending resize while `exportBusy` is true; the `finally` blocks in `exportSequence` and
  `exportWebM` clear `exportBusy` **before** calling `endOffscreen` so the restoring `resize()`
  still applies, and a pending resize is applied afterwards. X1 is the regression test.

## 2026-09-05 — F2 gate accepted; Phase A closed

- F2 (project v2 + recovery) accepted: unit red (`1 !== 2`, wrong message for version 0, missing
  URL-scheme rejections) then green 16/16 across the whole tree; P1 persistence round trip green;
  P2/P3/P4 red by design until Phase B; s2 9/9 and e2e 4/4 unchanged with the `studioAdd` tag.
  One documented deviation: `tests/unit/project-format.test.ts` now asserts the parsed version is
  2, because the parser always upgrades. `npx tsc --noEmit` is clean on the combined tree.
- Known limitation carried forward: `restoreScene` replays through `editor.ops`, so undo depth
  after a restore is "one add per restored object", not the pre-reload history.

### Decision W-5 — Where a local filename may live

The user's own filename may appear in their local project file and in the local IndexedDB
recovery record (both stay on the user's machine and are the user's data). It must never appear
in exports, receipts, licence files, or telemetry. Phase B therefore keeps `model.name` for
local files and adjusts recovery test P4 to assert: `asset.origin === "local"`, no path
separator or drive letter anywhere in the stored record, and no filename in any export
(`tests/exports.spec.ts` X3 already enforces the export side).

### Decision W-6 — Phase B ownership

One Shell agent owns `src/app/main.ts`, `index.html` (mount IDs preserved; `aria-live` on
`#viewport-hint` allowed), `src/viewer/studio.ts` for defect D-1 only (`resize()` deferral and
the two `finally` blocks), and may align wording/selectors in `tests/export-timeline.spec.ts`,
`tests/project-recovery.spec.ts`, and `tests/exports.spec.ts` to the integrated contract without
weakening any assertion; every such edit is listed in its evidence. The shared dev server on
5173 stays up for Phase B (extends Decision W-4).

## 2026-09-05 — Gate 3 accepted (Wave 3 complete)

Phase B integrated all three functions into `src/app/main.ts` (427 insertions), added
`aria-live` to `#viewport-hint`, and fixed defect D-1 in `src/viewer/studio.ts` exactly as
assigned. All 26 `index.html` ids are unchanged. Agent evidence: per-file counts exports 3,
export-timeline 3, project-recovery 4, e2e 4, s1 6, s2 9, s3 5, s4 7, s5 8, s6 4, studio-shell 2;
serial full run 55 passed, 0 failed; bundle 754.38 kB vs 737.36 kB baseline (+17.02 kB, +2.3 %),
no source maps, no secret patterns. Warden re-ran tsc, unit (16/16) and the exports,
export-timeline, project-recovery, studio-shell and e2e files independently: all green
(`status/evidence/phase-b/warden-verify.log`). Four test edits reviewed and accepted as
documented in `status/evidence/phase-b/summary.md` (two were latent test bugs, one is a stronger
check, one applies Decision W-5). Carried limitations: shallow undo depth after restore, the
cached GLB is not invalidated by gizmo drags (no hook on the frozen editor surface), and the
context-loss message shows the last capture time rather than a confirmed write time.

### Decision W-7 — Wave 4 servers

The shared dev server on 5173 is stopped at Gate 3. The performance/reliability QA agent works
from a clean clone in the session scratchpad and lets Playwright start and stop its own server;
the accessibility/responsive QA agent serves the worktree's production build with
`vite preview --port 4174` and stops it when done.
