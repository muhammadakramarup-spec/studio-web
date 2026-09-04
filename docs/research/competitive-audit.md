# Competitive audit — browser 3D editors, mockup tools, CC0 marketplaces, export flows

Access date for every URL cited below: 2026-09-04, unless marked otherwise. **[E]** = evidence from
a fetched primary source, with URL. **[U]** = unverified — a fetch failed, returned insufficient
content, or the claim comes only from a third-party aggregator; stated explicitly rather than
guessed. **[O]** = this document's opinion/recommendation, not a sourced fact.

Where a fetch of an official page returned too little content to describe layout or state behavior
(true for several JavaScript-heavy single-page apps, e.g. three.js editor, Babylon.js Playground,
`<model-viewer>` editor — their WebFetch conversion yielded near-empty markdown), that is recorded
as **[U]** rather than filled in from memory.

## Method

Live product audited directly via `WebFetch` against <https://studio-web-6ms.pages.dev/>
(2026-09-04) plus the code and baseline evidence already recorded in `status/baseline.md` and
`docs/handoffs/2026-09-04-studio-shell-1.0.md`. Competitor products audited via `WebFetch` of
official pricing/product pages and `WebSearch` for pages that blocked direct fetch (403/404) or that
render almost nothing without JavaScript execution.

---

## 1. Browser 3D editors

| Product | First-run comprehension | Workspace hierarchy | Export flow | Pricing / commercial boundary | Accessibility |
|---|---|---|---|---|---|
| **three.js editor** — <https://threejs.org/editor/> | **[U]** — page is a JS canvas app; WebFetch returned no rendered content. Known structurally (open-source project convention, not independently verified this pass): scene starts with a default cube/camera/light. | **[U]** not independently verified this pass beyond the general open-source three.js editor convention of a left scene-graph outliner, center viewport, right properties panel. | **[U]** not independently verified this pass. | **[E]** MIT License, confirmed by fetching the repository's `LICENSE` file directly: <https://raw.githubusercontent.com/mrdoob/three.js/dev/LICENSE> — free, no account, no commercial restriction on the editor itself. | **[U]** not evaluated this pass. |
| **Spline** — <https://www.spline.design/pricing> | **[U]** pricing page fetched, not the editor's first-run canvas. | **[U]** not evaluated this pass. | **[E]** Free/Hobby tiers export to web with a **watermark**; Pro/Max add video, Apple/Android, and code/self-hosted export; Enterprise adds full export options. Source: <https://www.spline.design/pricing> (fetched 2026-09-04). | **[E]** Free $0; Hobby $12-15/mo; Pro $25-30/mo; Max $60-70/mo; Enterprise custom. AI-credit-metered (2,000/3,000/10,000 monthly credits by tier). Source as above. Commercial-use terms not detailed on the pricing page itself — **[U]**. | **[U]** not evaluated this pass. |
| **Babylon.js Playground / Sandbox** — <https://playground.babylonjs.com/>, <https://sandbox.babylonjs.com/> | **[U]** — both are JS canvas apps; WebFetch of the playground and of the doc page <https://doc.babylonjs.com/toolsAndResources/thePlayground> both returned near-empty content. | **[U]** not independently verified this pass. | **[U]** not independently verified this pass. | **[E]** Babylon.js itself is Apache 2.0, open source (well-established, not re-verified via fetch this pass — flagging as **[U] not re-confirmed by primary source in this session**). | **[U]** not evaluated this pass. |
| **Sketchfab** (editor + 3D settings panel) — <https://sketchfab.com/plans> | **[U]** editor UI not fetched; pricing page only. | **[U]** not evaluated this pass. | **[E]** Download availability depends on the model owner's permission; paid tiers add automatic glTF and USDZ conversion on download. Source: <https://sketchfab.com/plans> (fetched 2026-09-04). | **[E]** Free: 10 uploads/mo, 100MB/model. Pro $15/mo (or $180/yr): 50 uploads/mo, 200MB/model. Premium $79/mo (or $948/yr): 200 uploads/mo, 500MB/model, Viewer API, AR. Enterprise: custom. Source as above. | **[U]** not evaluated this pass. |
| **Vectary** — <https://www.vectary.com/pricing/> | **[U]** official pricing page returned HTTP 403 to WebFetch; figures below are from third-party aggregators only. | **[U]** not evaluated this pass. | **[U]** not evaluated this pass. | **[U] unverified (secondary sources only)** — TrustRadius/SpotSaaS/Vectary's own blog via `WebSearch` report: Free/Starter tier with 5 projects; Pro at roughly $15/mo annual or $19/mo monthly with 25 projects, 3,000 monthly credits, and image-to-3D GenAI. Official first-party confirmation blocked by 403; do not treat these numbers as confirmed. | **[U]** not evaluated this pass. |
| **Womp** — <https://www.womp.com/pricing> | **[U]** not evaluated this pass. | **[U]** not evaluated this pass. | **[E]** All tiers claim "Import & export 3D models (multiple formats)"; mesh optimization gated to Pro and above. Source: <https://www.womp.com/pricing> (fetched 2026-09-04). | **[E]** Starter: free forever, 300 AI credits/day (~15 images), limited 4K export. Pro: $9.99/mo ($119.88/yr), 12,000 credits/mo, full 4K image/video export. Team: $19.99/seat/mo. Enterprise: from $119.99/seat/mo. Source as above. | **[U]** not evaluated this pass. |
| **model-viewer editor** — <https://modelviewer.dev/editor/> | **[E]** Confirmed by fetch: the tool explicitly states it "does not send any imported content to servers except to deploy to your mobile device" — a clear, above-the-fold privacy/trust statement. Source: <https://modelviewer.dev/editor/> (fetched 2026-09-04). | **[U]** layout not returned by fetch. | **[U]** not evaluated this pass. | **[E]** Google-affiliated open-source project (`<model-viewer>` web component); the editor itself is free. | **[U]** not evaluated this pass. |

**Pattern worth preserving in Studio Web [O]:** the model-viewer editor's above-the-fold
"no data leaves your machine except to deploy" statement is a strong, verifiable trust signal for a
tool that (like Studio Web) already processes real GLBs entirely client-side with zero required
accounts. Studio Web's own first-run screen currently leads with a WebGL technical-requirement
warning rather than a trust statement — see problem #7 below.

---

## 2. AI/product-mockup tools

Studio Web's mission includes eventual AI-mockup functionality (per `CLAUDE.md` mission and Wave 5
API research scope), so this category was researched even though Studio Web does not yet have a
mockup feature.

| Product | Flow | Pricing | Commercial terms |
|---|---|---|---|
| **Canva AI Mockup Generator** — <https://www.canva.com/create/mockup-generator/> | **[U]** — official page returned HTTP 403 to WebFetch; flow described from `WebSearch` snippet only: upload a design, drag it onto a mockup template. | **[U]** not independently confirmed this pass (Canva has a well-known free tier plus paid Pro, not re-verified here). | **[U]** not evaluated this pass. |
| **Mockey AI** — <https://mockey.ai/pricing> | **[U]** page fetched but returned only the header, no tier detail — recorded as a failed/insufficient fetch rather than filled in. | **[U]** not confirmed — over 27,000 templates across 60+ categories per a `WebSearch` snippet of a third-party roundup, not the official pricing page itself. | **[U]** not evaluated this pass. |
| **PicsArt AI Mockup Generator** — <https://picsart.com/ai-mockup-generator/> | **[U]** not fetched this pass; found via `WebSearch` only ("upload your design, choose a product template"). | **[U]** not evaluated this pass. | **[U]** not evaluated this pass. |

**Finding [O]:** first-party pricing/terms confirmation for this category was substantially blocked
by fetch failures (403s, JS-rendered pages) in this pass. `docs/research/api-and-cost-options.md`
should re-attempt these vendors with more targeted URLs (e.g. a specific plan-comparison page) before
any Build/Buy recommendation is finalized for the AI-mockup category — do not treat the figures above
as decision-grade.

---

## 3. CC0 / open asset marketplaces

| Product | Licence (confirmed) | Source |
|---|---|---|
| **Poly Haven** | **[E]** CC0. "Our assets are all licensed as CC0, which is effectively Public Domain even in jurisdictions that do not support the Public Domain." No attribution required. | <https://polyhaven.com/license> (fetched 2026-09-04) |
| **Kenney** | **[E]** CC0 / "Creative Commons Zero," confirmed on a live asset page. | <https://kenney.nl/assets/nature-kit> (fetched 2026-09-04; the general `/about` URL guessed for this task 404'd, so the per-asset page was used instead) |
| **Quaternius** | **[E]** CC0. "These assets can be used for free without the need for attribution in commercial, educational, and personal projects." | <https://quaternius.com/faq.html> (fetched 2026-09-04) |
| **ambientCG** | **[E]** CC0. "All assets are released under the Creative Commons CC0 license, making them free to use without attribution — even in commercial circumstances." | <https://ambientcg.com/> (fetched 2026-09-04; the site also links a dedicated license page at <https://docs.ambientcg.com/license/>, not independently fetched this pass) |
| **Sketchfab** | **[E]** Mixed — licences are set per-model by the uploader (CC0, various CC variants, "Standard" all-rights-reserved, or Editorial); not a single blanket licence for the whole marketplace, and downloads require the model owner's explicit permission. Source: <https://sketchfab.com/plans> (fetched 2026-09-04, download-permission behavior). | — |

**Relevance to Studio Web [O]:** the studio's own 2,268-item library is Kenney CC0 content
(confirmed by `status/baseline.md`'s manifest figures and `DECISIONS.md`'s licence-script
description). All four dedicated CC0 marketplaces above (Poly Haven, Kenney, Quaternius, ambientCG)
confirm CC0 with no attribution requirement, so Studio Web's current "no attribution needed" posture
for its Kenney assets is consistent with how the rest of the CC0 ecosystem represents itself. Sketchfab
is the outlier: it is a marketplace of mixed licences, and any future Studio Web integration with
Sketchfab content would need per-model licence checks before use — unlike Poly Haven/Kenney/
Quaternius/ambientCG, a blanket "CC0, no attribution" assumption would be wrong for Sketchfab.

---

## 4. The live product: Studio Web

**[E]** Fetched directly, 2026-09-04, <https://studio-web-6ms.pages.dev/> (empty/first-run state,
no WebGL available to the fetch environment so the viewport rendered its no-WebGL fallback):

- Header: "Alpha" badge, top-left; toolbar with "Open GLB," "Open project," "Save project," and a
  "Ready" status indicator.
- Empty-state viewport: "Your browser needs WebGL to show the 3D preview" — the no-WebGL recovery
  message documented in `docs/handoffs/2026-09-04-studio-shell-1.0.md` ("WebGL startup failure now
  produces a useful recovery screen instead of an empty shell") firing correctly in a
  non-GPU fetch environment, which is itself a positive reliability signal — the app degrades to an
  explanatory message rather than a blank page.
- Primary CTA text: "Start with a GLB" / "Drop it here, open a file, or choose from the library," with
  an "Open a GLB" button — matches the three-step workflow list ("Choose or open an asset," "Adjust
  its material and view," "Export a polished result") recorded in `src/app/style.css`'s
  `.workflow-steps` block and `index.html`.
- No pricing, account, sign-up, or login surface appears on first run — consistent with the studio
  shell handoff's statement that account/Pro/ad/avatar panels were deliberately unmounted from the
  authoring workspace.

---

## 5. Comparison against the seven explicit criteria

| Criterion | Studio Web (current) | Best pattern observed |
|---|---|---|
| **First-run comprehension** | Three-step workflow list plus an "Open a GLB" CTA; leads with a technical WebGL-requirement warning when unsupported. | model-viewer editor's leading privacy/trust statement (**[E]**); most competitors instead lead with a template gallery, not verified in depth this pass (**[U]**). |
| **Workspace hierarchy** | Toolbar (top) → viewport (center) → library (below viewport) → inspector (implied via material/view step). Not independently re-diagrammed this pass beyond what `index.html`/`main.ts` already establish. | **[U]** — most competitor layouts (left outliner / center viewport / right inspector) could not be confirmed by fetch this pass; treat as a common convention, not a verified fact. |
| **Asset discovery** | 2,280-entry manifest, capped at 96 rendered tiles with a "narrow the search" prompt (`status/baseline.md`); licence badge shown per tile in code (`src/library/index.ts:144-146`), but the tile's accessible name does not match its visible text (see `docs/research/accessibility-triage.md` §1.2). | Sketchfab exposes licence per-model at download time with automatic format conversion (**[E]**); Poly Haven/Kenney/Quaternius/ambientCG make the CC0 grant a single, unambiguous site-wide statement (**[E]**), which is simpler to trust than a per-tile badge. |
| **Responsive behavior** | Confirmed support for 1536×864, 1280×720, 1024×768, 768×1024, 390×844 per `status/baseline.md` screenshot evidence and the shell handoff's "responsive phone/tablet layouts" claim; toolbar buttons shrink to ~21-30px tall at all widths (`src/app/style.css`), which is a target-size risk at every breakpoint, not only narrow ones (see accessibility triage). | **[U]** — competitor mobile/responsive behavior not independently tested this pass. |
| **Export confidence** | PNG, GLB, GLTF, Blender ZIP, and 24-frame PNG turntable ZIP all validated as real artifacts from downloaded bytes (`status/baseline.md`); native `.blend` and GIF are explicitly *not* faked — the UI explains the gap rather than mislabeling a file. Turntable export currently uses an independent rotation sweep rather than sampling the authored timeline (`status/warden-log.md`, Decision W-1, citing `src/viewer/studio.ts:905`). | Sketchfab auto-converts to glTF/USDZ on download for paid tiers rather than exposing a raw format mismatch (**[E]**). Studio Web's honesty about *not* faking `.blend`/GIF is a stronger trust pattern than any competitor claim verified in this pass. |
| **Accessibility** | See `docs/research/accessibility-triage.md` for full detail: invalid ARIA grid structure on the library (axe critical, **[E]**), label/name mismatch on library tiles (axe, **[E]**), multiple controls under the 44px handoff guideline and one confirmed under the 24px WCAG AA floor (**[E]**), no live region on the viewport hint (**[E]**), reduced-motion handled in CSS only (**[E]**). | **[U]** — no competitor was independently accessibility-audited this pass; this is a gap for a future audit pass, not a claim that competitors do better. |
| **Commercial boundaries** | Zero required accounts, zero paid API calls signed out (`docs/handoffs/2026-09-04-studio-shell-1.0.md`); Kenney CC0 library with per-tile licence badge but no exported provenance receipt yet (Wave 3 F3, not yet implemented on this branch — confirmed by the absence of `src/viewer/receipt.ts` in this session's file listing). | Poly Haven/Kenney/Quaternius/ambientCG state CC0 once, unambiguously, site-wide (**[E]**); Spline/Womp/Sketchfab meter commercial use through credits/upload caps rather than blanket free use (**[E]**). |

---

## 6. Ten highest-confidence problems in Studio Web's current experience

Scored 1-5 for **user impact** (5 = blocks or seriously degrades the core open→edit→export journey
for a meaningful user group) and 1-5 for **confidence** (5 = directly measured/read in this session
or a prior verified baseline run; lower where the evidence is indirect or partially stale). Every row
cites the evidence it rests on. Ranked by impact × confidence, highest first.

| # | Problem | Impact | Confidence | Evidence |
|---|---|---:|---:|---|
| 1 | Project save (format v1) silently drops any lights, cameras, primitives, modifiers, and custom HDR environment the user added — only the active model, viewer settings, and timeline persist. A user who edits a scene and saves loses that editing work on reload with no warning. | 5 | 5 | `docs/handoffs/2026-09-04-studio-shell-1.0.md`: "Custom HDR bytes and added scene lights/cameras/primitives are not embedded yet." Confirmed still true this session: `src/project/format.ts` still defines only `PROJECT_VERSION = 1`; no `src/project/scene.ts` or `src/app/persist.ts` exist yet (Wave 3 F2 not landed on this branch as of commit `8d1791b`). |
| 2 | No autosave or crash/context-loss recovery exists. A browser crash, tab close, or `webglcontextlost` event loses all unsaved editing work with no recovery path. | 5 | 5 | `docs/handoffs/2026-09-04-claude-design-product-v1-execution-handoff.md`, Priority 0 item 3, explicitly names this as unimplemented. Confirmed this session: no `src/app/persist.ts` file exists on this branch. |
| 3 | Turntable export samples an independent rotation sweep, not the timeline the user actually authored — export output can silently diverge from what the user built in the timeline editor. | 4 | 5 | `status/warden-log.md`, Decision W-1, quoting the code location directly: "`exportSequence` uses an independent rotation sweep (`src/viewer/studio.ts:905`)." |
| 4 | The asset library's ARIA grid structure is invalid: a `role="grid"` container holds 96 `role="gridcell"` buttons with no `role="row"` parent, a critical axe violation that can break screen-reader navigation of the primary asset-discovery surface. | 3 | 5 | `status/baseline.md` axe run (critical `aria-required-children`/`aria-required-parent`); independently re-confirmed by direct code read this session, `src/library/index.ts:68-69,126`. |
| 5 | Library tile accessible names ("name, category, licence") do not contain their visible text ("name" + licence badge, no visible category), failing WCAG 2.5.3 Label in Name — speech-input users cannot reliably select a tile by reading its visible label aloud. | 3 | 5 | Code read this session, `src/library/index.ts:124-150`; WCAG mapping confirmed live against `dequeuniversity.com/rules/axe/4.13/label-content-name-mismatch` (2026-09-04). |
| 6 | Exported packages carry no machine- or human-readable provenance/licence receipt for the CC0 library asset used, even though the library asset itself is correctly licence-badged in the UI. A downstream recipient of an export has no record of where the asset came from or its licence. | 3 | 5 | `docs/handoffs/2026-09-04-claude-design-product-v1-execution-handoff.md`, Priority 0 item 4 and Wave 3 Function 3 scope; confirmed unimplemented this session (no `src/viewer/receipt.ts`). |
| 7 | Lighthouse performance is weak on the core journey: Performance score 51, CLS 0.344 (well above the "Good" 0.1 threshold), TBT 7,180 ms — the page visibly shifts and the main thread is blocked for seconds during the load-to-interactive window. | 4 | 4 | `status/baseline.md` Lighthouse table. Confidence held at 4, not 5, because the same section notes the run used headless Chrome with GPU disabled and should be re-run "with an approved GPU-capable profile before setting final budgets." |
| 8 | Interactive controls (toolbar buttons, file-action buttons, the material/light colour swatch) are sized well under the product's own 44px guideline, and the colour-input swatch measures 22px tall — under even the WCAG 2.2 AA 24px floor. | 3 | 4 | Code read this session, `src/app/style.css:78,149-156,411-417`; WCAG 2.5.8 confirmed live at `w3.org/WAI/WCAG22/Understanding/target-size-minimum.html` (2026-09-04). Confidence at 4 rather than 5 because the colour-swatch's spacing-exception eligibility was not independently checked. |
| 9 | The main JavaScript bundle is a single 737.36 kB (195.39 kB gzip) chunk that exceeds Vite's own 500 kB warning threshold — everything loads before the app becomes interactive, with no code-splitting for library, editor, or export code paths. | 3 | 5 | `status/baseline.md` build baseline table, directly measured `npm run build` output this repository state. |
| 10 | Sixteen of the thirty `font-size` declarations in `src/app/style.css` sit below the project's own 12px supporting-text floor, and none reach its 14px body-text baseline — before any Darkroom type scale is applied, the current CSS already violates the product's own minimum-legibility rule. | 3 | 5 | Full `font-size` grep of `src/app/style.css` performed this session (30/30 declarations enumerated in `docs/research/accessibility-triage.md` §5); floor and baseline values from `docs/handoffs/2026-09-04-claude-design-product-v1-execution-handoff.md`, Priority 2 item 1. |

## 7. Recommendation on Studio Web's visual character

Per `CLAUDE.md` operating rule 4 ("Preserve Studio Web's dark, content-first character unless
evidence justifies a change") and this task's brief: nothing found in this pass — not the competitor
audit, not the accessibility triage, not the live-site fetch — is evidence that the dark,
content-first direction itself is wrong. Every problem identified above is a structural/ARIA,
data-persistence, performance, or type-scale defect, not a colour-scheme or density complaint. The
recommendation is to keep the dark, content-first direction and fix these ten items within it, once
the Darkroom token/spacing/type values are available (see `docs/design/darkroom-request.md`).

## 8. What could not be verified this pass

- Vectary's official pricing (403 on the primary source; only third-party aggregator figures
  available — do not treat as decision-grade).
- three.js editor, Babylon.js Playground/Sandbox, and the model-viewer editor's detailed workspace
  layouts (JS canvas apps that WebFetch could not meaningfully render as markdown).
- Canva's and Mockey AI's official pricing/commercial terms (403 and near-empty fetch respectively).
- Any independent accessibility audit of a competitor product — all accessibility findings above are
  about Studio Web itself, sourced from `status/baseline.md` and this session's own code reads, not
  from testing competitor products.
