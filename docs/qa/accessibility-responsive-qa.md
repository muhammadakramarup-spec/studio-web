# Wave 4 — Accessibility and Responsive QA

Date: 2026-09-05
Agent: Wave 4 Accessibility and Responsive QA silo (measure/report only — no product code touched)
Worktree: `C:\3D-Studio\02_projects\studio-web\.worktrees\claude-design-product-v1`, branch
`claude/design-product-v1` at `37884e5c6e7114899cc91d41a261f52827514874` (tree clean before this
pass except the new files listed under Ownership below).

Read first, per the task brief: `status/warden-log.md` (all decisions, especially W-5, W-7, D-1),
`docs/handoffs/2026-09-04-claude-design-product-v1-execution-handoff.md` (Priority 2 Accessibility,
Wave 4, product rules 9-10), `docs/research/accessibility-triage.md`, `status/baseline.md`,
`status/tools/capture-states.mjs`, `index.html`, `src/app/main.ts`, `src/app/style.css`.

## Ownership / what changed on disk

Only new files, all inside this agent's allowed paths:

- `status/after/` — 45 new PNGs + `CAPTURE-NOTES.md`
- `status/tools/capture-after.mjs`, `diff-before-after.mjs`, `keyboard-journey.mjs`,
  `qa-checks.mjs`, `axe-run.mjs` — new scripts
- `status/evidence/wave4-a11y/` — JSON results + screenshots (this report's raw evidence)
- `docs/qa/accessibility-responsive-qa.md` — this file

`src/`, `tests/`, `index.html`, `status/before/`, `status/baseline.md`, `status/warden-log.md` were
not edited. No git write commands were run.

## Environment and commands

- OS: Windows 11 (win32/x64). Node `v24.19.0`. npm `11.17.0`. `@playwright/test` `1.62.1` (already
  installed; no new npm packages installed into the project).
- Build: `npm run build` (from the worktree) → passed, `dist/assets/index-DaOQnR2w.js` 754.38 kB /
  200.15 kB gzip, 52 modules, 3.03 s. (Matches the 754.38 kB figure the Warden recorded at Gate 3;
  the JS filename hash differs run-to-run because Vite hashes are content+build-based, not because
  the bundle changed.)
- Server: `npx vite preview --port 4174 --strictPort`, started in the background before any check
  and stopped at the end of this session (verified free both before starting and after stopping —
  see "Server shutdown" at the end of this report). Port `5173` was never touched.
- Browser: real Chromium via `@playwright/test`'s `chromium` module (never `npx playwright test`),
  launched with `["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"]` in every script
  below, matching the mandated flags.
- Scripts run, in order:
  - `node status/tools/capture-after.mjs` — after-capture matrix
  - `node status/tools/diff-before-after.mjs` — before/after pixel diff
  - `node status/tools/keyboard-journey.mjs` — keyboard-only journey
  - `node status/tools/qa-checks.mjs live-regions|contrast|reduced-motion|zoom|touch-targets`
  - `npx --yes @axe-core/cli http://localhost:4174 --chrome-options="--use-gl=angle,--use-angle=d3d11,--ignore-gpu-blocklist,--headless=new" --save status/evidence/wave4-a11y/axe-after-empty.json`
    — **failed** (`SessionNotCreatedError: session not created: Chrome instance exited`, the CLI's
    own bundled ChromeDriver could not start a session with these flags on this machine). Fell back
    to the task's documented alternative: `node status/tools/axe-run.mjs <axe.min.js> <out-empty>
    <out-loaded>`, which injects axe-core 4.10.3 (fetched as a static asset from the axe-core
    package's own CDN distribution, not `npm install`ed into the project) into the same Playwright
    Chromium used everywhere else in this pass and calls `axe.run()` in-page.

## 1. After-capture matrix

`status/tools/capture-after.mjs` (adapted from `status/tools/capture-states.mjs`, which was not
edited) captured the same 7-state matrix as `status/before/` — **empty, loaded, editing, saving,
exporting, completion, recoverable** — at all 5 target viewports against `http://localhost:4174`
only, plus 2 new states (**restore-prompt**, **context-lost**). All **45/45 captures succeeded**;
`status/after/CAPTURE-NOTES.md` has zero failure lines.

| Viewport | empty | loaded | editing | saving | exporting | completion | recoverable | restore-prompt | context-lost |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1536×864 | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 1280×720 | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 1024×768 | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 768×1024 | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 390×844  | ok | ok | ok | ok | ok | ok | ok | ok | ok |

- **restore-prompt** method: load the first library tile, click "+ Light", wait 3 s (autosave
  debounce is 2000 ms, `src/app/persist.ts` `createAutosaver` default), reload, wait for
  `.restore-prompt` to become visible inside `#viewport-hint`, screenshot. Captured cleanly at all 5
  viewports — the idle hint shows "Unsaved work from HH:MM can be restored" with visible "Restore"
  and "Discard" buttons.
- **context-lost** method: load a model, then in-page
  `window.__studio.renderer.getContext().getExtension("WEBGL_lose_context").loseContext()`, wait for
  `#viewport-error` to become visible, screenshot. Captured cleanly at all 5 viewports; the error
  region reads "Graphics context lost — your work was autosaved at not yet. Reload to restore." (no
  prior edit had happened yet in that flow, so autosave legitimately had not run — see the Live
  Regions section for the full text set, including a case where a real timestamp is shown).

## 2. Before/after pixel-diff table

`status/tools/diff-before-after.mjs` decodes each PNG pair with a minimal, dependency-free inline
PNG decoder (Node's built-in `zlib.inflateSync` for DEFLATE; chunk parsing and PNG "unfilter"
implemented by hand — no package installed) and reports the percentage of pixels whose RGBA
Euclidean distance exceeds a threshold of 24. **15 of 35** comparable pairs (the 2 new states have
no `before/` counterpart, so 5 viewports × 7 states = 35 pairs) exceed 1%. Every one was opened and
visually inspected; none is a visual redesign — **no visual redesign landed in this branch**, and
the differences below are fully explained by (a) inherent timing non-determinism in the "exporting"
capture, (b) a pre-existing Gate‑0 capture-tooling limitation already documented in
`status/baseline.md`, and (c) one real, already-Warden-accepted Wave 3 wording change with a
layout side effect.

| Viewport | State | Diff % | Cause (verified by opening both PNGs) |
|---|---|---:|---|
| 1536×864 | exporting | 9.891% | Turntable spins during export; the two runs' screenshots were taken at different progress-poll timings ("Exporting 71%" vs "18%"), so the model is caught at a different rotation angle. Same race already documented in `status/baseline.md`'s Wave 0 capture-method notes ("observed poll matched... but the screenshot itself shows differing % by time taken"). All UI chrome is pixel-identical. |
| 1280×720 | exporting | 11.309% | Same cause as above. |
| 1280×720 | completion | 16.231% | `#app-status` text is now the longer Wave 3 F1 message — `"Turntable ready (default 360° sweep — add keys with Turn 360°)"` — vs. the Wave-0-baseline `"Turntable download ready"`. It wraps inside `#app-status`'s fixed `max-width: 190px` and grows the header row, shifting the whole page ~15-20 px down at this width. See "Findings" below. |
| 1280×720 | recoverable | 16.022% | Same header-shift cause; this state is captured immediately after the turntable export in the same page session (matching `status/before/`'s own flow), so it inherits the same wrapped completion text. |
| 1024×768 | exporting | 11.389% | Turntable rotation-angle race, as above. |
| 1024×768 | completion | 19.047% | Header-shift cause, as above. |
| 1024×768 | recoverable | 18.796% | Header-shift cause, as above. |
| 768×1024 | loaded | 33.658% | `status/before/local-768x1024-loaded.png` is scrolled down to the selected library tile — a pre-existing Gate‑0 capture-tooling limitation, already called out in `status/baseline.md`: "The mobile loaded-state capture remains scrolled to the selected library tile... Treat that as scroll-state evidence, not as proof that the mobile viewport is missing." `status/after/`'s capture resets scroll to (0,0) before every screenshot, as designed. Not a product change. |
| 768×1024 | exporting | 7.590% | Turntable rotation-angle race, as above. |
| 768×1024 | completion | 30.846% | Header-shift cause, as above. |
| 768×1024 | recoverable | 31.942% | Header-shift cause, as above. |
| 390×844 | loaded | 42.425% | Same pre-existing before-capture scroll-position limitation as 768×1024/loaded, confirmed by visual inspection (before: library grid mid-scroll; after: viewport model at top). |
| 390×844 | exporting | 18.560% | Turntable rotation-angle race, as above. |
| 390×844 | completion | 36.919% | Header-shift cause, as above. |
| 390×844 | recoverable | 37.706% | Header-shift cause, as above. |

All other pairs (empty, editing, saving at every viewport; loaded/completion/recoverable at
1536×864) are **under 1%** (editing and saving are 0.000% at every viewport — pixel-identical).
Full numeric table: `status/evidence/wave4-a11y/diff-before-after.json`.

**Note on the header-shift cause:** at 1536×864 the same longer completion text appears in both
before and after screenshots (visually confirmed — `status/before/local-1536x864-completion.png`
already shows a 2-line wrapped status by Gate 3), and completion/recoverable there stay under 1%
(0.400% / 0.254%), because the header already reserves enough room at that width. At narrower
widths the header's reserved height was not enough, so the same wording change produces a visible
downward shift there. This is a genuine (if minor) side effect of an already-accepted Wave 3
wording change, not new work from this QA pass, but it is a real CLS-adjacent finding — see Findings.

## 3. Keyboard-only journey

`status/tools/keyboard-journey.mjs` drove a fresh page at 1280×720 using **only** `page.keyboard`
(Tab / Shift+Tab / Enter / Arrow keys — never `.click()`). **10/10 steps passed.** Full JSON:
`status/evidence/wave4-a11y/keyboard-journey.json`; zoomed screenshots:
`status/evidence/wave4-a11y/focus-<step>.png`.

| # | Step | Direction (DOM-order reason) | Landed on | Focus ring visible | Result |
|---|---|---|---|:---:|---|
| 1 | Reach "Open GLB" | Tab (first focusable on a fresh page) | `button#open-model-btn` "Open GLB" | yes | PASS — not activated (would open a native OS file dialog `page.keyboard` cannot dismiss) |
| 2 | Reach library search box | Tab (forward, past disabled Save project / all disabled toolbar controls) | `input` "Search assets" | yes | PASS |
| 3 | Reach first library tile | Tab (forward; roving `tabindex=0`) | `button[role=gridcell]` "Ambulance, car-kit, CC0" | yes | PASS |
| 3b | Arrow-key nav inside the grid | ArrowRight then ArrowLeft | Right → "Box, car-kit, CC0"; Left → back to "Ambulance..." | n/a | PASS |
| 3c | Activate the tile | Enter | model loads (`#viewport-hint[data-state="loaded"]`) | n/a | PASS |
| 4 | Reach "+ Light" and activate | **Shift+Tab** (it is earlier in the DOM than the library panel) | `button` "+ Light" | yes | PASS |
| 5 | Reach "Save project" and activate | **Shift+Tab** (`#file-actions` is before `#toolbar`) | `button#save-project-btn` "Save project" | yes | PASS — download caught (`ambulance.studio.json`); `#app-status` → "Project saved — active model, view, materials, and timeline included" |
| 6 | Reach "Turntable" and activate | Tab (forward; Export group is later in `#toolbar`) | `button` "Turntable" | yes | PASS — download caught (`studio-turntable.zip`); `#export-status` ended at **"Turntable ready (default 360° sweep — add keys with Turn 360°)"** |
| 7 | Reload, reach "Restore" and activate | Tab (forward, fresh page) | `button` "Restore" | yes | PASS — `#app-status` → "Unsaved work restored." |

**Every tested checkpoint had a visible focus ring** — a `3px solid #b7d2ff` outline from the single
global `button:focus-visible, input:focus-visible, select:focus-visible, ...` rule in
`src/app/style.css:520-527`, confirmed by comparing each control's computed `outline`/`box-shadow`
focused vs. the same element immediately blurred. This directly answers WCAG 2.4.7 (Focus Visible)
for the 8 controls actually exercised (Open GLB, search box, a library tile, +Light, Save project,
Turntable, Restore) — it was not exhaustively checked against every one of the dozens of other
toolbar/library/outliner/material controls in the app, all of which share the same one CSS rule and
so are expected (not separately verified) to behave the same way.

**DOM-order note:** native Tab order follows document order and does not wrap. `#file-actions`
(Open GLB / Open project / Save project) comes before `#toolbar` (Undo…Turntable) comes before the
library panel comes before the viewport hint (Restore/Discard) comes before the right
sidebar/timeline — so reaching "Save project" from "+ Light" requires Shift+Tab, and reaching
"Turntable" from "Save project" requires Tab. This is normal, spec-compliant behavior, not a defect.

**Reliability finding while building this test (see Findings):** the autosave debounce
(`src/app/persist.ts` `createAutosaver`, 2000 ms) can be silently consumed by a `buildProjectDocument()`
call that returns `null` while the viewer is mid-export, with nothing to reschedule it until another
edit calls `markDirty()` again. The script confirms a real IndexedDB recovery record exists (step
"4b-autosave-confirmed") **before** proceeding to Save/Turntable, specifically to avoid this race —
a real user has no equivalent confirmation.

## 4. Live regions

DOM inspection (`status/evidence/wave4-a11y/live-regions.json`) confirms all four required
attributes exactly as specified in the task:

| Element | `role` | `aria-live` | Confirmed |
|---|---|---|:---:|
| `#app-status` | `status` | `polite` | yes (static, `index.html:28`) |
| `#export-status` | `status` | `polite` | yes (set in `src/app/main.ts:582-583`) |
| `#viewport-hint` | *(none)* | `polite` | yes (static, `index.html:51`) — matches the task's spec exactly (only `aria-live`, no `role` required) |
| `#viewport-error` | `alert` | *(none — implicit assertive)* | yes (static, `index.html:56`) |

Observed text per state (polled live from the DOM while driving the app):

| State | Region | Text |
|---|---|---|
| idle | `#viewport-hint` | "Start with a GLB / Drop it here, open a file, or choose from the library. / Open a GLB" |
| loading | `#viewport-hint` | "Loading model…" |
| loaded | `#app-status` | "Ambulance ready" |
| saving | `#app-status` | "Packing the active model and project settings…" → "Project saved — active model, view, materials, and timeline included" |
| exporting (progress) | `#export-status` **and** `#app-status` | `#export-status`: "Exporting 4%" · `#app-status`: "Exporting Turntable…" (different wording, same moment — see Findings) |
| completion | `#export-status` **and** `#app-status` | Both: **"Turntable ready (default 360° sweep — add keys with Turn 360°)"** (identical text, both regions — double announcement) |
| error (recoverable) | `#viewport-error` **and** `#app-status` | Both: "Choose a binary glTF file ending in .glb." |
| restore prompt | `#viewport-hint` (contains the message) and `#app-status` | Hint: "...Unsaved work from HH:MM can be restoredRestoreDiscard" (button text runs into the sentence in `innerText`, not visually — see screenshot) · `#app-status`: "Unsaved work from HH:MM can be restored" |
| context loss | `#viewport-error` **and** `#app-status` | Both: "Graphics context lost — your work was autosaved at not yet. Reload to restore." (or a real `HH:MM` timestamp once an autosave has actually run — confirmed separately in the keyboard-journey/restore-prompt flows) |

**Confirmed finding (task explicitly asked to check for this): both `#export-status` and
`#app-status` speak during export — progress and completion are announced twice**, once with
slightly different wording mid-progress ("Exporting 4%" vs "Exporting Turntable…") and with
byte-identical text at completion. Two separate `role=status` live regions updating with
overlapping content is not itself an SC 4.1.3 violation (both are correctly marked as status
messages), but it is a redundant-announcement usability finding.

## 5. Contrast (12 elements)

`status/tools/qa-checks.mjs contrast` computes WCAG contrast from computed `color` against an
**effective background** built by walking up ancestors and alpha-compositing every non-transparent
background found (needed for `.viewport-hint`'s `rgba(16, 21, 26, 0.88)` translucent panel, which
is composited over the viewport's dark gradient backdrop). All 12 **pass AA**; font sizes are
recorded alongside (below-floor sizes match `docs/research/accessibility-triage.md`'s prior
code-read finding, now independently re-confirmed by live measurement).

| # | Element | Sample text | Color | Effective background | Font size | Weight | Ratio | Threshold | AA |
|---|---|---|---|---|---:|---:|---:|---:|:---:|
| 1 | App status | "Ambulance ready" | rgb(197,204,211) | rgb(16,21,26) | 11px | 400 | 11.32 | 4.5 | PASS |
| 2 | Toolbar button ("Undo") | "Undo" | rgb(244,247,248) | rgb(16,21,26) | 12px | 400 | 17.05 | 4.5 | PASS |
| 3 | Export note | "GIF / native .blend: use PNG ZIP or Blender import" | rgb(156,166,177) | rgb(16,21,26) | **10px** | 400 | 7.43 | 4.5 | PASS |
| 4 | Library tile label | "Ambulance" | rgb(197,204,211) | rgb(23,29,35) | **10.5px** | 400 | 10.48 | 4.5 | PASS |
| 5 | Library licence badge | "CC0" | rgb(85,201,138) | rgb(23,29,35) | **9px** | 400 | 8.17 | 4.5 | PASS |
| 6 | Panel title ("Scene") | "SCENE" | rgb(197,204,211) | rgb(16,21,26) | 11px | 600 | 11.32 | 4.5 | PASS |
| 7 | Viewport hint text | "Drop it here, open a file, or choose from the library." | rgb(197,204,211) | rgb(15,20,25) *(composited)* | 12px | 400 | 11.42 | 4.5 | PASS |
| 8 | Restore prompt text | "Unsaved work from HH:MM can be restored" | rgb(197,204,211) | rgb(15,20,25) *(composited)* | 12px | 400 | 11.42 | 4.5 | PASS |
| 9 | Timeline control label ("Play") | "Play" | rgb(244,247,248) | rgb(16,21,26) | 12px | 400 | 17.05 | 4.5 | PASS |
| 10 | Material row label ("Color") | "Color" | rgb(197,204,211) | rgb(16,21,26) | 11px | 400 | 11.32 | 4.5 | PASS |
| 11 | Outliner row text | "HemisphereLight" | rgb(197,204,211) | rgb(16,21,26) | 12px | 400 | 11.32 | 4.5 | PASS |
| 12 | Error text | "Choose a binary glTF file ending in .glb." | rgb(255,213,210) | rgb(61,32,34) | 12px | 400 | 10.99 | 4.5 | PASS |

**0 of 12 contrast failures.** This corroborates `status/baseline.md`'s axe run (43 passed rules,
no `color-contrast` violation) and this session's own axe run (see §9). Font sizes below the
handoff's 12px/14px floors (rows 1, 3, 4, 5, 6, 10) are **not new** — they match
`docs/research/accessibility-triage.md` §5 exactly (that document already flagged 16/30 CSS
`font-size` declarations below 12px, 0/30 body text reaching 14px, deferred to `src/app/style.css`
pending the Darkroom spec, which this branch does not own).

## 6. Reduced motion

`page.emulateMedia({ reducedMotion: "reduce" })`; `window.matchMedia('(prefers-reduced-motion:
reduce)').matches` confirmed `true`.

| Control | Sampled twice, 500 ms apart | Still animating under reduced motion? |
|---|---|:---:|
| Spin (viewport auto-rotation) | `pivot.rotation.y`: `0` → `0.2184` | **Yes** |
| Timeline Play | `pivot.quaternion.y` (driven by an authored "Turn 360°" clip): `0.2334` → `0.2501` | **Yes** |

Both continue to animate — the **expected finding**, matching
`docs/research/accessibility-triage.md` §4: the only reduced-motion handling in the codebase is the
CSS-only `@media (prefers-reduced-motion: reduce)` block in `src/app/style.css:638-645` (zeroes
`transition-duration`/`animation-duration`), and neither Spin (`src/app/main.ts:570-577`) nor
`TimelineHandle.play()`'s `requestAnimationFrame` loop (`src/timeline/index.ts:127-147`) checks
`matchMedia`. This is **not a WCAG 2.2 AA failure** — Spin is a user-triggered, explicit-toggle
control, satisfying the applicable Level A criterion 2.2.2 Pause, Stop, Hide; the stricter criterion
that would require honoring reduced-motion for interaction-triggered animation is 2.3.3 Animation
from Interactions, **Level AAA**, not required for AA conformance. Recorded as a legitimate
AAA-adjacent UX gap, not a mapped AA violation, matching the triage doc's own conclusion.

*(Test-methodology note: `TimelineHandle.play()` drives the scene directly via
`adapter.applySampledFrame()`/`renderNow()` and never updates the `#timeline-scrubber` `<input>`'s
DOM `value` or calls `onChange` listeners — that input only updates from the user's own "input"
event. An earlier version of this check sampled the scrubber value and incorrectly read "not
playing"; the scrubber is not a valid playback signal and the check was corrected to sample the
driven object's own transform instead, exactly as the Spin check already did.)*

## 7. 200% zoom reflow

Emulated via `deviceScaleFactor: 2` at 640×360 (≈200% of 1280×720) and 768×432 (≈200% of 1536×864),
after loading a model.

| Case | `scrollWidth` vs `innerWidth` | No page-level horizontal scroll | Export group reachable | Inspector panels reachable |
|---|---|:---:|---|---|
| 640×360 @ dsf2 | 640 vs 640 | PASS | Extends past the viewport edge, but `#toolbar` has `overflow-x: auto` (CSS) — reachable by scrolling inside the toolbar, not clipped | `#panel-outliner`/`#panel-material` within viewport width; layout is in the `max-width: 800px` mobile stacked mode (`#app { overflow: visible }`, page scrolls vertically instead of per-panel) |
| 768×432 @ dsf2 | 768 vs 768 | PASS | Same as above | Same as above |

**Both cases pass**: `document.documentElement.scrollWidth <= window.innerWidth + 1` holds at both
extreme zoom levels (no page-level horizontal scrollbar), and the export controls/inspector are not
trapped by `overflow: hidden` + a fixed `100vh` — at these widths (≤800px) the CSS's own
`@media (max-width: 800px)` rule switches `#app` to `height: auto; overflow: visible` and the whole
page scrolls, while `#toolbar` independently scrolls horizontally for its own overflow. Screenshots:
`status/evidence/wave4-a11y/zoom-640x360.png`, `zoom-768x432.png`.

## 8. Touch targets at 390×844

139 interactive elements found (`button`, `input`, `select`, `[role=button]`, `[role=gridcell]`,
plus the range slider) after loading a model and adding a light (so Mirror X/Array x5 and the
export buttons are enabled, not skipped as hidden/zero-size).

- **43 of 139 (31%) fail the handoff's stricter 44×44 CSS-px guideline.**
- **17 of 139 (12%) fail the WCAG 2.2 SC 2.5.8 Target Size (Minimum) 24×24 CSS-px AA floor**
  (exceptions for inline/essential/equivalent targets were not individually checked against each of
  these 17 — flagged as candidate failures, not confirmed-with-no-exception failures, matching the
  triage doc's own hedge on this point).

| Category | Count failing 44px | Example sizes |
|---|---:|---|
| `BUTTON` (toolbar/file-action/library/timeline controls) | 39 | Open GLB 77.7×30, Undo 49.1×28, +Light 58.0×28, view-preset "0°" 31×28 |
| `INPUT[type=text]` (library search) | 1 | 119.3×22 → 366×22 depending on selector match (search box vs full-width outliner row) |
| `INPUT[type=range]` (timeline scrubber) | 1 | 180.6×16 |
| `SELECT` (asset type / category) | 2 | 119.3×22 each |

Every one of the 17 true sub-24px failures is an outliner row (366×22 — full width, but only 22px
tall) or a form control (search input, timeline scrubber, the two selects) at 16-22px tall. This is
**not new** — it matches `docs/research/accessibility-triage.md` §1.3 exactly (file-actions
`min-height: 30px`, toolbar `padding: 5px 9px` on ~11-12px text rendering ~21-28px tall, all owned
by `src/app/style.css`, deferred pending the Darkroom spec). This session's contribution is the
first **measured, exhaustive count** (139 total / 43 / 17), superseding the triage doc's
code-read-only sampling of 3 selector groups. Full list: `status/evidence/wave4-a11y/touch-targets.json`.

## 9. axe-core

Primary method (`npx --yes @axe-core/cli ... --save ...`) failed on this machine —
`SessionNotCreatedError: session not created: Chrome instance exited` from the CLI's bundled
ChromeDriver, with the exact flags the task specifies. Fell back to the documented alternative:
axe-core 4.10.3 (fetched as a static script, not npm-installed) injected into the same Playwright
Chromium as every other check in this pass, via `status/tools/axe-run.mjs`.

**At 1536×864, empty state:** 2 critical violations, 1 incomplete, 44 passes.
**At 1536×864, loaded state (first library tile picked):** 2 critical violations, 0 incomplete, 44 passes.

| Violation | Impact | Nodes | vs. baseline |
|---|---|---:|---|
| `aria-required-children` — `.library-panel__grid` uses `role="grid"` with no `role="row"` children | critical | 1 | **Unchanged** — present at Wave 0 baseline (`status/baseline.md`), owned by the deferred Library silo (`src/library/index.ts`, out of Wave 4's scope) |
| `aria-required-parent` — 96 `role="gridcell"` buttons with no `role="row"` parent | critical | 96 | **Unchanged**, same owner |

**Zero new violations.** `color-contrast` was flagged as **incomplete** (not a violation — axe could
not automatically resolve it) for 2 nodes in the empty state only (`<strong>Start with a GLB</strong>`
and its sibling `<span>` inside `#viewport-hint`), because axe could not determine the background
color of an element that sits over an image/canvas node. This was resolved manually in §5 above: the
same `.viewport-hint span` text scores a 11.42:1 contrast ratio against its correctly-composited
effective background — a clear pass. Raw reports: `status/evidence/wave4-a11y/axe-after-empty.json`,
`axe-after-loaded.json`.

## Findings, ranked by WCAG 2.2 AA impact

1. **[Pre-existing, unchanged, Level A]** Library grid ARIA structure invalid —
   `aria-required-children` / `aria-required-parent`, confirmed by axe (2 critical violations, same
   as Wave 0 baseline). Criteria:
   [1.3.1 Info and Relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html) (A),
   [4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html) (A).
   Owner: Silo Library (`src/library/index.ts`), deferred, out of this branch's Wave 4 scope.

2. **[Pre-existing, unchanged, Level A]** Library tile `aria-label` does not start with its visible
   text — re-confirmed by reading `src/library/index.ts:127-150` this session: `aria-label` is
   `"${name}, ${category}, ${licence}"` but the visible label/badge only render name + licence
   (category is never shown), so the accessible name is not a superset-prefix match of the visible
   text. Criterion:
   [2.5.3 Label in Name](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html) (A). Owner:
   Silo Library, deferred.

3. **[Pre-existing, unchanged, Level AA]** Target size — 17 of 139 interactive elements at 390×844
   measure under the WCAG 24×24 CSS-px floor (outliner rows, search input, timeline scrubber, two
   selects); 43 of 139 miss the handoff's stricter 44×44 guideline. Criterion:
   [2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
   (AA). This session's contribution is the first exhaustive measured count (§8); the underlying
   cause (`src/app/style.css` control sizing) is unchanged and was already flagged in
   `docs/research/accessibility-triage.md` §1.3, deferred pending the Darkroom spec.

4. **[NEW — found this session, no direct WCAG mapping, trust/reliability]** Autosave debounce race:
   `createAutosaver`'s single in-flight debounce timer (`src/app/persist.ts`) can fire while
   `buildProjectDocument()` returns `null` (viewer mid-export, or busy) and is then never
   rescheduled until another edit calls `markDirty()` again — so a user who edits once, then
   immediately exports, then loses the tab/context, can find no recovery record on reload purely
   from timing, even though "autosave... without transmitting private project data" is a Priority 0
   trust item in the handoff. Discovered empirically while building the keyboard-journey script
   (§3) — an unconfirmed reload after Save+Turntable found `IDB before reload: {"found":false}\`,
   traced to this race, and worked around in the test with an explicit IndexedDB poll before
   proceeding. Not independently re-verified against every possible interleaving; recorded as a
   confirmed-once reproduction, not an exhaustively characterized bug. Relevant to Priority 0 item 3
   in the execution handoff (autosave/crash recovery) and indirectly to the reliability of the
   "Restore" journey step tested for 4.1.3-style status communication.

5. **[NEW — found this session, no direct WCAG criterion, CLS-adjacent]** The Wave 3 F1 turntable
   completion message (`"Turntable ready (default 360° sweep — add keys with Turn 360°)"` /
   `"Turntable ready (timeline)"`, replacing the shorter Wave-0 text) wraps inside `#app-status`'s
   fixed `max-width: 190px` at narrower viewports and pushes the whole page down ~15-20px, producing
   16-38% pixel differences in the completion/recoverable states at 1280×720, 1024×768, 768×1024,
   and 390×844 (§2). Not a WCAG failure by itself, but a real layout-shift side effect of an
   already-accepted product-message change that the handoff's own accessibility rules would expect
   to be caught (status messages should not silently perturb layout). No direct SC mapping found;
   flagged for product awareness.

6. **[Pre-existing, unchanged, task-requested check]** Double announcement during export: both
   `#export-status` and `#app-status` are live regions that update with overlapping/duplicate text
   during progress and at completion (§4). Both are correctly marked `role="status"
   aria-live="polite"` (not a 4.1.3 violation on its own), but a screen-reader user hears the export
   outcome announced twice. No SC directly mandates single-sourcing status text; recorded as a
   usability finding, as the task explicitly asked to check for it.

7. **[Pre-existing, unchanged, Level AAA — not an AA failure]** Spin and Timeline Play both continue
   to animate under `prefers-reduced-motion: reduce` (§6); only CSS transitions/animations are
   gated, not `requestAnimationFrame`-driven scene motion. Criterion:
   [2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
   (AAA). Matches `docs/research/accessibility-triage.md` §4 exactly; not required for AA
   conformance.

8. **[Pre-existing, unchanged, product rule not a fixed WCAG minimum]** 16 of 30 `font-size`
   declarations in `src/app/style.css` sit below the handoff's 12px supporting-text floor; 0 reach
   its 14px body baseline. Re-confirmed by live measurement in §5 (app status 11px, export note
   10px, library label 10.5px, licence badge 9px, panel titles 11px, material labels 11px — all
   still pass contrast regardless of size). Related but distinct criterion:
   [1.4.4 Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) (AA, about
   zoomability to 200%, not a fixed minimum size — §7 above confirms 200% zoom itself reflows
   correctly). Owner: `src/app/style.css`, deferred pending the Darkroom spec.

## RESOLVED in this branch (positive change, not a current finding)

`docs/research/accessibility-triage.md` §3 flagged (at the Wave 0/1 baseline) that `#viewport-hint`
had **no live-region attribute at all**. This branch's Wave 3 Phase B integration
(`status/warden-log.md`, "Gate 3 accepted") added `aria-live="polite"` to `#viewport-hint` in
`index.html:51`, confirmed present and functioning in §4 above (idle/loading/restore-prompt text
changes are now programmatically announced). This closes that specific pre-existing gap.

## What this branch did and did not change for accessibility

**Did:** add `aria-live="polite"` to `#viewport-hint` (Wave 3 Phase B, resolving the finding above);
add the export receipt/provenance and project-v2/local-recovery functions (Wave 3 F1-F3), which
introduced the new Restore/Discard prompt and the longer turntable completion message measured in
§2 and §5 as a layout-shift side effect; fix defect D-1 (canvas resize during export). **Did not**
touch `src/app/style.css` typography/spacing/target-size tokens, `src/library/index.ts`'s ARIA grid
structure or tile labeling, or any visual design — all still pending the (still-missing) normative
Darkroom design artifact, per `status/warden-log.md`'s 2026-09-04 session-start note and Decision W-1.
Every pre-existing accessibility gap this report re-confirms (axe's 2 critical violations, the
label-in-name mismatch, sub-24px/44px targets, sub-12px/14px fonts, CSS-only reduced motion) was
already known and already correctly deferred to `src/app/style.css`/`src/library/index.ts` — none
of them are regressions introduced by this branch's Wave 3 work.

## Server shutdown

`npx vite preview --port 4174 --strictPort` (background PID `22540`) was stopped after all checks
completed. Verified with `netstat -ano | findstr :4174` — **no LISTENING entry** — before writing
this final section. Port `5173` was never started or touched by this agent.
