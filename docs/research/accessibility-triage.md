# Accessibility triage — Studio Web

Access date for all WCAG/axe citations below: 2026-09-04. Evidence sources: `status/baseline.md`
(axe/Lighthouse run), and direct reads of `src/app/style.css`, `src/app/main.ts`, and
`src/library/index.ts` on this branch, done in this session.

Legend: **[E]** = evidence (verified fact, cited). **[O]** = opinion/recommendation.

## 1. Axe findings from `status/baseline.md`

### 1.1 `aria-required-children` / `aria-required-parent` — library grid

**[E]** `status/baseline.md` records two critical axe violations at 1536×864: one
`.library-panel__grid` node using a grid structure without required row children
(`aria-required-children`), and 96 asset buttons using `role="gridcell"` without a required row
parent (`aria-required-parent`).

**[E]** Confirmed in code: `src/library/index.ts:68-69` sets `grid.setAttribute("role", "grid")`
on the container, and `src/library/index.ts:126` sets `tile.setAttribute("role", "gridcell")` on
each of the up to 96 rendered `<button>` tiles. No element with `role="row"` sits between them —
the grid's children are gridcells directly, which is invalid ARIA grid structure.

- **WCAG 2.2 criterion:** [1.3.1 Info and Relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html) (Level A) — the grid's implied row/column
  structure is not programmatically exposed. Also implicated: [4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html) (Level A) — a `role="grid"` without valid row/cell children does not expose a
  correct role to assistive technology.
- **Axe rule references:** <https://dequeuniversity.com/rules/axe/4.13/aria-required-children>,
  <https://dequeuniversity.com/rules/axe/4.13/aria-required-parent> (both confirmed live 2026-09-04).
- **Fix owner:** Silo Library, Wave 2 (**deferred** — `src/library/index.ts` is out of scope for
  this Wave 1 research silo). Fix is either to wrap tiles in `role="row"` containers per grid row,
  or to drop `role="grid"`/`role="gridcell"` in favor of a plain `role="list"`/`listitem` or native
  button-grid pattern if a true 2D grid interaction model is not required.

### 1.2 `label-content-name-mismatch` — library tiles

**[E]** Confirmed by direct code read, `src/library/index.ts:124-150`. Each library tile is a
`<button>` whose accessible name is set explicitly:

```
tile.setAttribute("aria-label", `${asset.name}, ${asset.category}, ${asset.licence}`);
```

but its *visible* text content is only two of those three fields, in a different order and with no
separators — a `label.textContent = asset.name` node followed by a `badge.textContent =
asset.licence` node. The visible category text is never rendered on the tile. Because the visible
label text ("name" … "licence") is not a contiguous substring of the accessible name ("name,
category, licence"), this fails the axe `label-content-name-mismatch` rule.

- **WCAG 2.2 criterion:** [2.5.3 Label in Name](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html) (Level A) — "For user interface components with
  labels that include text or images of text, the name contains the text that is presented
  visually." Confirmed AA-adjacent but formally **Level A**, and a MUST per the axe rule page
  (<https://dequeuniversity.com/rules/axe/4.13/label-content-name-mismatch>, confirmed live
  2026-09-04, mapped there to this same SC).
- **User impact:** speech-input users ("click nature kit tree") cannot reliably target a tile
  because the spoken visible text is not a match for the full accessible name.
- **Fix owner:** Silo Library, Wave 2 (**deferred**). Fix is to make the accessible name start with
  the exact visible text, e.g. `` `${asset.name} — ${asset.category}, ${asset.licence} license` ``
  with the visible label rendering as a prefix-matching substring, or to make the category visible
  on the tile so the two representations agree.

### 1.3 `target-size` — toolbar and library controls

Not named as a discrete axe rule string in `status/baseline.md`'s narrative (the file records "1
incomplete rule" without naming it), so this is reported here as **[E] code-verified**, not as a
confirmed axe violation, per the task's instruction to map "these code-verified gaps" in addition
to the recorded axe/Lighthouse findings.

**[E]** `src/app/style.css` sets these interactive-control heights, all below the handoff's 44 px
guideline and several below the WCAG AA 24 px floor:

| Selector | Line | Size | Control |
|---|---:|---|---|
| `#file-actions button`, `.viewport-hint button` | 78 | `min-height: 30px` | Open GLB / Save / Open project / empty-state CTA |
| `#toolbar button`, `#toolbar select` | 149-156 | `padding: 5px 9px` on ~11 px text, no explicit `min-height` (renders roughly 21-23 px tall) | Every camera preset (0°/90°/180°/270°/Top), Spin, Bloom, and export buttons |
| `input[type="color"]` | 411-417 | `width: 28px; height: 22px` | Material/light colour pickers |

- **WCAG 2.2 criterion:** [2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) (Level AA) — "The size of the target for
  pointer inputs is at least 24 by 24 CSS pixels," with exceptions for spacing, inline text
  targets, and essential/user-agent-controlled targets. Confirmed live 2026-09-04. Axe rule:
  <https://dequeuniversity.com/rules/axe/4.13/target-size> (confirmed live 2026-09-04, mapped to
  this SC).
  - The `input[type="color"]` swatch at 28×22 px is a direct **AA failure** (22 px < 24 px), unless
    an adjacent-spacing exception applies — not verified either way in this pass.
  - The toolbar buttons and `#file-actions` buttons at ~21-30 px are **below the handoff's stricter
    44×44 px guideline** (see `docs/handoffs/2026-09-04-claude-design-product-v1-execution-handoff.md`,
    "Priority 2 Accessibility," item 3), which is a product decision stricter than WCAG AA — WCAG's
    own 44×44 enhanced target is [2.5.5 Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html), **Level AAA**, not required for AA
    conformance. Do not conflate the two: failing 44 px is a handoff-guideline gap; failing 24 px
    is an AA conformance gap. Both are listed because the handoff explicitly asks for the stricter
    number at narrow breakpoints.
- **Fix owner:** `src/app/style.css`, **after the Darkroom spec** arrives (this silo does not own
  `style.css`; see `docs/design/darkroom-request.md`). Target sizing is exactly the kind of token
  (spacing/control-size scale) the missing Darkroom artifact is expected to define.

## 2. Lighthouse findings from `status/baseline.md`

**[E]** `status/lighthouse-local.json`, summarized in `status/baseline.md`: Performance 51,
Accessibility 87, Best Practices 96, LCP 1.8 s, **CLS 0.344**, **TBT 7,180 ms**, TTI reported
elsewhere in the handoff material as 13.8 s (not itself present as a discrete field in the
`status/baseline.md` Lighthouse table above, carried from the task brief; treat the 13.8 s TTI
figure as **unverified against this session's Lighthouse JSON** — `status/lighthouse-local.json`
was not re-parsed field-by-field in this pass beyond the table already in `status/baseline.md`).

None of CLS, TBT, or TTI map to a WCAG success criterion — they are Core Web Vitals / Lighthouse
performance metrics, not accessibility criteria, and WCAG 2.2 does not define numeric page-weight or
script-blocking budgets. Recording them here only to give each an explicit owner and to avoid
silently dropping a required baseline item:

| Metric | Value | WCAG mapping | Fix owner |
|---|---|---|---|
| CLS | 0.344 (target ≤0.1 "Good" per Core Web Vitals, not a WCAG number) | None directly. Large layout shift can indirectly harm [2.4.11 Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) (AA) if a shift moves focused content under a sticky layer — not confirmed to occur here. | Wave 3/4 Performance and reliability QA; likely caused by the 96-tile library grid and asset thumbnails loading after first paint. |
| TBT | 7,180 ms (target ≤200 ms "Good") | None directly. Long main-thread blocking can defeat [2.2.1 Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html) (AA) style expectations if it delays a user-triggered action's response, but that SC is about time limits, not raw latency — noted as a related concern, not a mapped failure. | Wave 3/4 Performance and reliability QA; the 737 kB main JS chunk (`status/baseline.md`, build baseline) is the likely driver. |
| TTI (13.8 s, unverified this pass) | — | None directly. | Wave 3/4 Performance and reliability QA. |

## 3. Additional code-verified gap: `#viewport-hint` has no live region

**[E]** `src/app/main.ts:87` reads `const viewportHint = byId<HTMLDivElement>("viewport-hint")`.
The function that updates it (`src/app/main.ts:119-135`) toggles `viewportHint.hidden`, sets
`viewportHint.dataset.state`, and replaces its text via `viewportHint.textContent =` or
`viewportHint.innerHTML =` — but nowhere in that block, nor on the element in `index.html:51`
(`<div id="viewport-hint" class="viewport-hint" data-state="idle">`), is `role="status"`,
`aria-live`, or any live-region attribute set.

- **WCAG 2.2 criterion:** [4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) (Level AA) — "status messages can be
  programmatically determined through role or properties... without receiving focus." The hint text
  changes (e.g. from the empty-state "Start with a GLB" prompt to a loading/error message) are
  exactly this kind of status message, and a screen-reader user who is not focused on that region
  will not hear the change.
- **Fix owner:** Shell (`src/app/main.ts`, `index.html`) — the execution handoff already notes
  "Phase B adds aria-live" for this element (`docs/handoffs/2026-09-04-claude-design-product-v1-execution-handoff.md`,
  Decision W-2 Phase B). This triage confirms the gap exists in the code read at this commit and
  should stay tracked until that Phase B change lands and is tested.

## 4. Additional code-verified gap: reduced motion is CSS-only

**[E]** `src/app/style.css:638-645` contains the only reduced-motion handling in the codebase:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

**[E]** A repository-wide search for `matchMedia` or `prefers-reduced-motion` in `.ts` files
returned zero matches. Specifically:

- **Spin button**, `src/app/main.ts:439-445`: toggles `studio.setSpin(spinOn, 30)`, a continuous
  viewport auto-rotation, with no check of `window.matchMedia('(prefers-reduced-motion: reduce)')`
  before enabling it.
- **Timeline playback**: the timeline sampler/playback path (`src/timeline/`) drives object and
  camera animation independent of the CSS media query; it also has no reduced-motion gate.

- **WCAG 2.2 criterion:** the directly applicable **Level A** criterion is
  [2.2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) — Studio Web already satisfies the letter of this one, because Spin is a
  user-triggered toggle with an explicit on/off control (`spinBtn`, `aria-pressed`), not
  auto-starting, moving content. The stricter **[2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)** (respecting
  reduced-motion for interaction-triggered animation) is **Level AAA**, not required for AA
  conformance — do not report this as an AA failure. It is a legitimate UX/comfort gap (a user who
  has set `prefers-reduced-motion` at the OS level still gets a moving viewport if they click Spin,
  or moving timeline playback), consistent with why the handoff calls it out explicitly, but it
  should be labeled AAA-adjacent best practice, not a mapped AA violation.
- **Fix owner:** Shell (`src/app/main.ts`) for Spin; timeline silo/Shell for playback — both listed
  in the task brief as Shell-owned.

## 5. Minimum text size rule vs. current CSS

**[E]** The handoff's rule (`docs/handoffs/2026-09-04-claude-design-product-v1-execution-handoff.md`,
"Priority 2 Accessibility," item 1): "Set a 12 px minimum for supporting text and a 14 px body
baseline unless the normative Darkroom specification provides a more readable value." This is a
product rule, not itself a WCAG number — WCAG 2.2 has no absolute minimum font-size criterion (the
closest is [1.4.4 Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), Level AA, which requires text to be resizable up to 200% without loss of
content/function, not a fixed minimum size).

**[E]** Every `font-size` declaration in `src/app/style.css` (grepped this session), with the
handoff's two thresholds applied:

| Line | Value | vs. 12 px supporting floor | vs. 14 px body baseline |
|---:|---|---|---|
| 35 | 13px | above | below |
| 71 | 9px | **below** | below |
| 106 | 11px | **below** | below |
| 156 | 12px | at floor | below |
| 182 | 11px | **below** | below |
| 189 | 10px | **below** | below |
| 235 | 11px | **below** | below |
| 249 | 18px | above | above |
| 257 | 10px | **below** | below |
| 270 | 11px | **below** | below |
| 317 | 12px | at floor | below |
| 325 | 17px | above | above |
| 343 | 16px | above | above |
| 357 | 12px | at floor | below |
| 386 | 11px | **below** | below |
| 397 | 12px | at floor | below |
| 434 | 11px | **below** | below |
| 441 | 11px | **below** | below |
| 482 | 10.5px | **below** | below |
| 490 | 9px | **below** | below |
| 513 | 12px | at floor | below |
| 541 | 24px | above | above |
| 547 | 11px | **below** | below |
| 658 | 9px | **below** | below |
| 667 | 11px | **below** | below |
| 723 | 12px | at floor | below |
| 730 | 11px | **below** | below |
| 756 | 12px | at floor | below |
| 763 | 11px | **below** | below |
| 769 | 10.5px | **below** | below |
| 779 | 12px | at floor | below |

**[E]** Count: **16 of 30** `font-size` declarations (9px, 9px, 10px, 10.5px ×2, 11px ×9) sit below
the handoff's own 12 px supporting-text floor; **none** of the 30 declarations meet the 14 px body
baseline (the largest sub-heading-scale values are 16-18px, which are display/heading sizes, not
body text — no body-copy declaration reaches 14px in this file).

- **Fix owner:** `src/app/style.css`, **after the Darkroom spec** arrives — this is precisely a
  type-scale question the missing artifact is meant to settle definitively (see
  `docs/design/darkroom-request.md`). This silo does not modify `style.css`.

## 6. Summary table

| Finding | Source | WCAG 2.2 SC | Level | Fix owner |
|---|---|---|---|---|
| Library grid: gridcells without row parent | axe, `status/baseline.md` | 1.3.1 Info and Relationships / 4.1.2 Name, Role, Value | A | Silo Library (Wave 2, deferred) |
| Library tile aria-label ≠ visible text | axe + code (`src/library/index.ts:127,142,145`) | 2.5.3 Label in Name | A | Silo Library (Wave 2, deferred) |
| Toolbar/file-action/colour-input targets below size floor | code (`src/app/style.css:78,149-156,411-417`) | 2.5.8 Target Size (Minimum) | AA | `src/app/style.css`, after Darkroom spec |
| `#viewport-hint` text changes with no live region | code (`src/app/main.ts:87,119-135`) | 4.1.3 Status Messages | AA | Shell (Phase B) |
| Spin button / timeline ignore `prefers-reduced-motion` | code (`src/app/style.css:638-645`, `src/app/main.ts:440-446`) | 2.3.3 Animation from Interactions (AAA, best-practice, not an AA failure) | AAA | Shell |
| CLS 0.344 / TBT 7,180 ms / TTI ~13.8 s (unverified this pass) | Lighthouse, `status/baseline.md` | No direct WCAG mapping (Core Web Vitals) | — | Wave 3/4 Performance QA |
| 16/30 font-size values below 12px supporting floor; 0/30 body text reaches 14px | code (`src/app/style.css`, all `font-size` lines) | No fixed WCAG minimum (related: 1.4.4 Resize Text, AA) | Product rule, not WCAG-mandated | `src/app/style.css`, after Darkroom spec |

## 7. What was not verified in this pass

- The exact TTI figure (13.8 s) was not re-derived field-by-field from `status/lighthouse-local.json`
  in this session; it is carried from the task brief and flagged **unverified against this
  session's JSON** above.
- Whether the `input[type="color"]` 28×22px swatch qualifies for a WCAG 2.5.8 spacing exception was
  not checked against its neighbouring elements' offsets — flagged as a direct failure candidate,
  not a confirmed one.
- Contrast ratios were not independently recomputed in this pass; `status/baseline.md`'s axe run
  reported 43 passed rules with no colour-contrast violation listed, which this document treats as
  the current evidence and does not re-verify.
