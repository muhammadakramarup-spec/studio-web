# Phase B Shell -- summary

Wave 3 Phase B: wired F1 (timeline-sampled export), F2 (project v2 + local recovery), and F3
(export receipt + provenance) into the app shell, fixed defect D-1, and got every browser test
green.

## Files changed

- `src/viewer/studio.ts` -- defect D-1 only: `resizePending` flag, `resize()` deferral while
  `exportBusy`, and the two `finally` blocks in `exportSequence`/`exportWebM` reordered
  (`exportBusy = false; endOffscreen(st); resizePending = false;`). Nothing else in this file
  changed.
- `src/app/main.ts` -- full rewrite of the integration wiring: F1's Turntable/`planSequence`
  wiring and the `readyText` param on `exportButton`; F2's `buildProjectDocument`/
  `captureForAutosave`/`getActiveModelBase64`/`applyProjectDocument`/`restoreFromRecord`, the
  Save/Open handlers rebuilt on top of them, the boot-time restore prompt in `setHint`'s idle
  branch, autosave `markDirty()` wiring across editor/viewer/timeline controls, and the
  `webglcontextlost`/`webglcontextrestored` handlers; F3's `provenance` registry,
  `libraryAssetToProvenance`/`projectAssetToProvenance`/`hdriToProvenance`, and
  `buildExportExtras` wired into the Blender ZIP and Turntable buttons. Every other button/label/
  behaviour not covered by the four work items is unchanged.
- `index.html` -- one attribute added: `aria-live="polite"` on `#viewport-hint`. No id added,
  removed, or renamed (full list confirmed below).
- `tests/exports.spec.ts`, `tests/project-recovery.spec.ts` -- see "Test edits" below. No other
  spec files were touched.

## Confirmed unchanged index.html ids

`app`, `app-body`, `app-brand`, `app-brand-dot`, `app-header`, `app-status`,
`empty-open-model-btn`, `file-actions`, `library-title`, `model-file-input`, `open-model-btn`,
`open-project-btn`, `panel-account`, `panel-ai`, `panel-library`, `panel-material`,
`panel-outliner`, `panel-start`, `panel-timeline`, `project-file-input`, `save-project-btn`,
`start-title`, `toolbar`, `viewport`, `viewport-error`, `viewport-hint` -- all 26 present before
and after; `git diff index.html` shows exactly one line changed (the `aria-live` addition).

## Verification results (all commands tee'd into this directory)

- `npx tsc --noEmit` -- clean (`tsc-after-d1.txt`, `tsc-after-main.txt`, both exit 0).
- `npm run test:unit` -- 16/16 (`unit.txt`).
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173` -- `200`.
- Per-file `--workers=1 --reporter=line`:
  - `tests/exports.spec.ts` -- X1, X2, X3 green (3/3, `exports.txt`).
  - `tests/export-timeline.spec.ts` -- 3/3 green (`export-timeline.txt`).
  - `tests/project-recovery.spec.ts` -- P1-P4 green (4/4, `project-recovery.txt`).
  - `tests/e2e.spec.ts` -- 4/4 (`e2e.txt`).
  - `tests/s1.spec.ts` -- 6/6 (`s1.txt`).
  - `tests/s2.spec.ts` -- 9/9 (`s2.txt`).
  - `tests/s3.spec.ts` -- 5/5 (`s3.txt`).
  - `tests/s4.spec.ts` -- 7/7 (`s4.txt`).
  - `tests/s5.spec.ts` -- 8/8 (`s5.txt`).
  - `tests/s6.spec.ts` -- 4/4 (`s6.txt`; see "Timing fix" below -- an intermediate version of the
    wiring flaked this file until corrected).
  - `tests/studio-shell.spec.ts` -- 2/2 (`studio-shell.txt`).
- One serial full run, `npx playwright test --workers=1 --reporter=line`: 55 passed, 0 failed
  (`full-serial.txt`). No flake occurred; no per-file rerun was needed. Note: the task brief's
  VERIFY section says "56 tests expected", but the per-file counts it itself specifies
  (e2e 4, s1 6, s2 9, s3 5, s4 7, s5 8, s6 4, studio-shell 2 = 45, plus the three new files'
  X1-X3/3 + A-C/3 + P1-P4/4 = 10) sum to exactly 55, which is what both the per-file runs and the
  serial run independently produced -- the total is complete and accounted for; "56" appears to be
  an off-by-one in the brief, not a missing test.
- `npm run build` -- exit 0 (`build.txt`). `dist` has zero `.map` files. `grep -rIl -E
  'sk_[A-Za-z0-9]{20,}|service_role|sb_secret' dist` prints nothing (exit 1, no matches).
- Bundle size: 754.38 kB (gzip 200.15 kB) vs the baseline 737.36 kB -- +17.02 kB
  (+2.3%), from the newly-wired `project/scene.ts`, `app/persist.ts`, `timeline/export-plan.ts`,
  and `viewer/receipt.ts` modules now actually being imported by `main.ts` (they existed on disk
  before Phase B but were dead code until this wiring).

## Timing fix (not a red gate, recorded for completeness)

An intermediate version of this wiring awaited `openRecoveryStore()`/`recoveryStore.load()`
synchronously early in `boot()`, before the S3 library panel mounts. That delayed the panel's
thumbnail image requests enough to shift them into `tests/s6.spec.ts`'s "0 network calls during
generation" monitoring window, flaking that pre-existing test (not owned/editable by this agent).
Fixed by making the recovery-store lookup non-blocking (a fire-and-forget async IIFE that
populates `recoveryStore`/`pendingRestore`/`autosaver`, re-rendering the idle hint only if it is
still idle when the lookup resolves) so the rest of `boot()`'s synchronous flow -- including
library panel mounting -- runs on its original timing. Confirmed green afterward, including in the
full serial run.

## Test edits (all in the three files the ownership rule permits; the eight pre-existing spec
files were not touched)

1. `tests/exports.spec.ts` X1 -- Turntable ZIP entry count changed from `toBe(24)` to
   `toBe(26)`. Reason: X1 loads the ambulance via a real library-panel tile click (same as X2's
   scenario a few lines down), which legitimately seeds F3's provenance registry for that model.
   Per F3's own design (`src/viewer/receipt.ts`, wired in this phase), any package export made
   after a library pick now correctly carries a receipt (`studio-web-receipt.json` +
   `LICENCE.txt`), so 24 frames + 2 receipt files = 26. The original 24 assumed no receipt could
   ever attach -- true only before this Phase-B wiring landed. Every per-frame name/size assertion
   is unchanged and still exact; nothing was loosened.
2. `tests/project-recovery.spec.ts` P2 -- two changes:
   - The restored-outliner-row-count assertion changed from `rowsBeforeAdd + 2` to a captured
     `rowsBeforeReload` (the actual count measured right before `page.reload()`). Reason: Mirror X
     creates a live clone object that S2's outliner correctly lists as its own row -- verified this
     is true even before any reload, so the original hardcoded `+2` (accounting only for the
     "+ Light"/"+ Box" adds) never matched reality once Mirror X was clicked. Comparing against
     the real pre-reload count is a strictly equivalent-or-stronger check ("does the restored
     scene have exactly as many outliner rows as it did before reload"), not a weaker one.
   - The active-model-name assertion changed from comparing against the library tile's
     `aria-label` (`"Ambulance, car-kit, CC0"`, `src/library/index.ts:127`) to comparing against
     `studio.debug.state().active` captured before reload (`"Ambulance"`). Reason: the tile's
     aria-label was never equal to the model's plain name even immediately after the initial pick,
     before any reload was involved -- that assertion could not have passed regardless of restore
     correctness. The new comparison directly verifies model identity survived the reload/restore
     round trip.
3. `tests/project-recovery.spec.ts` P3 -- both `page.evaluate()` calls that fetch
   `WEBGL_lose_context` now share one extension reference (cached on `window` before the
   simulated loss) instead of each re-fetching it via `getExtension()`. Reason: confirmed
   empirically (and consistent with the WebGL spec) that `getExtension()` returns `null` for
   every extension, including `WEBGL_lose_context` itself, once the context is already lost -- the
   original second `page.evaluate()` re-fetched it after `loseContext()`, so its
   `ext?.restoreContext()` call was a silent no-op via optional chaining, regardless of app
   wiring. No real page could ever have satisfied the `toBeHidden()` assertion as originally
   written. All three assertions (visible, `/context lost/i` text, then hidden) are unchanged.
4. `tests/project-recovery.spec.ts` P4 -- aligned to Decision W-5
   (`status/warden-log.md`), exactly as the task brief specifies: removed
   `.not.toContain("private-client")` (the local file's own basename -- never a path -- is now
   expected in the local-only recovery record, per W-5's "keep the real `model.name` for local
   files" ruling); kept and added explicit checks that `recordText` contains no backslash, no
   `/[A-Za-z]:[\\/]/` drive-letter pattern, and never contains the temp directory path itself; kept
   `asset.origin === "local"`.

## Known limitations

- Undo depth after restore (carried forward from F2's own gate notes): `restoreScene` replays
  captured objects through `editor.ops.add(...)`, so undo history after a restore is "one add per
  restored object," not the pre-reload undo/redo stack. Unchanged by this phase.
- Cached GLB invalidation points: `cachedModelBase64` is explicitly invalidated at the three
  material-panel handlers (color/roughness/metalness inputs, Reset material), Mirror X, Array x5,
  Undo/Redo (added defensively beyond the minimum spec, since undo/redo can revert a material or
  modifier change), and on every model load (via the `activeModelId` key mismatch). It is not
  invalidated by gizmo drags -- `EditorHandle`'s frozen surface exposes no drag-complete hook to
  `main.ts`, so a direct-manipulation transform edit via the gizmo will not by itself refresh the
  cached export bytes used by the next autosave/save until some other invalidating action (or a
  model swap) happens first. No test currently exercises gizmo-drag-then-autosave, so this is
  undetected by the suite but is a real, documented gap.
- Autosave timestamp is an approximation: the WebGL-context-loss message ("your work was
  autosaved at HH:MM") uses the time `buildProjectDocument()` successfully captured a document
  for the autosaver, not the time `store.save()` itself confirmed a write -- `src/app/persist.ts`
  (F2's file, not in this agent's ownership) exposes no post-write success hook. In the ordinary
  case these are effectively the same moment; only a same-tick IndexedDB failure between capture
  and write would make the displayed time technically inaccurate.
- `buildExportExtras`'s `frames.motion` for the Blender ZIP: intentionally omitted (`frames`
  is only passed for Turntable) -- the Blender ZIP is a single static snapshot, not a frame
  sequence, so there is no motion mode to report; this matches `receipt.ts`'s `frames` field being
  optional.

Nothing in scope stayed red; no BLOCKED.md was needed.
