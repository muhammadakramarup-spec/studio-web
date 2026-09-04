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
