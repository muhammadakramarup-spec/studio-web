# Studio Web Claude Design Product V1 Execution Plan and Handoff

This document hands the current Studio Web repository to a Claude Design and Claude Code team for
research, design, implementation, testing, and pull-request delivery. It corrects stale claims in
the earlier draft, identifies the missing external design artifact, and defines the exact evidence
required at every gate.

## Handoff status

- Public repository: <https://github.com/muhammadakramarup-spec/studio-web>
- Production site: <https://studio-web-6ms.pages.dev/>
- Latest verified Cloudflare preview: <https://a69b984d.studio-web-6ms.pages.dev/>
- Default branch: `master`
- Starting commit: `494b69b`
- Required working branch: `claude/design-product-v1`
- Cloudflare Pages project: `studio-web`
- Handoff state: ready for Wave 0; no design or implementation wave has started
- Production rule: open a pull request but do not merge or replace production without owner approval

## Orchestration model

- Opus acts as Warden. It coordinates, resolves ownership conflicts, and reviews gates. It does not
  edit project files.
- Sonnet agents act as implementation silos. Each silo has one explicit file-ownership list.
- Only one agent may write a file at a time. Sequential waves may transfer ownership after the Warden
  records the handoff.
- An implementation agent never approves its own gate.
- Every behavioral change starts with a failing test, proves the failure, implements the smallest
  useful correction, and proves the test passes.
- Use conventional commits with one concern per commit. Push only the feature branch.

## Authority and read order

Read these sources in order before changing code:

1. `CLAUDE.md`
2. This document
3. `docs/handoffs/2026-09-04-studio-shell-1.0.md`
4. `docs/handoffs/2026-09-04-full-control-development-handoff.md`
5. `REPORT.md`, `SCOPE.md`, `DECISIONS.md`, and `status/final_qa.md`
6. Every relevant `src/*/SPEC.md`
7. `docs/superpowers/plans/2026-09-04-studio-web-research-and-monetization.md`

When documentation and executable behavior disagree, tests and measured runtime evidence determine
the current baseline. Record the discrepancy instead of silently choosing the more convenient claim.

## External design dependency

The earlier draft names `Studio Web Redesign.dc.html`, direction `1a Darkroom`, as the normative
design source. That file is not present in the public repository at the starting commit.

- If the artifact is available in the Claude Design project, export its screenshots and normative
  token, type, layout, component, and state specification into `docs/design/darkroom-spec.md` before
  Wave 1 begins.
- If it is unavailable, complete Wave 0 and the research portion of Wave 1, then ask the owner for the
  artifact. Do not invent or approximate the missing design.
- A screenshot alone is not the normative specification. Preserve the exact states and tokens from
  the design artifact when it becomes available.

## Corrected current baseline

Grounded in `master` at `494b69b` and the verification run immediately preceding this handoff:

| Area | Verified state |
|---|---|
| Stack | Vite 5, TypeScript 5.6, Three.js 0.170.0, Playwright, plain CSS |
| Browser tests | The repository contains 45 browser tests. A 44-test serial suite passed in 6.8 minutes, then both shell tests passed after the final desktop-layout regression was added. Wave 0 must rerun all 45 from the branch. |
| Unit tests | Four Node unit tests pass for project format and telemetry payload validation. |
| Production build | `npm run build` passed; JavaScript was about 737.36 kB minified and 195.39 kB gzip. The existing chunk-size warning remains a performance opportunity, not a build failure. |
| Deployment package | 2,323 files, no source maps, no common secret-pattern matches, largest file about 1.96 MB. |
| Public deployment | Stable and preview URLs returned HTTP 200 and contained the current Studio Shell controls. |
| File workflow | Open GLB, drag and drop, open project, and save project are implemented. |
| Library | 2,280 manifest entries are searchable and filtered; the interface renders at most 96 matching tiles at once. |
| Camera/view controls | 0°, 90°, 180°, 270°, Top, and Spin controls already exist. Framing reset and shortcut affordances remain candidates. |
| Exports | PNG, GLB, embedded GLTF, Blender ZIP, and a 24-frame PNG turntable ZIP produce real artifacts. WebM remains capability-gated. Native `.blend` and GIF are not fabricated. |
| Responsive shell | Export controls and the right inspector are protected at 1280 px; the toolbar is readable without horizontal scrolling at 1536 px. |
| Hidden modules | Account, advertising, AI generation, and avatar modules exist but are intentionally not mounted in the current focused shell. |

## Non-negotiable product rules

1. Preserve real GLB loading, scene editing, project save/load, camera controls, timeline behavior,
   and all verified exports.
2. Do not replace the working application with a static prototype.
3. Keep the signed-out product useful with zero environment variables and no paid API.
4. Never expose provider keys, Cloudflare credentials, user filenames, private assets, prompts, or
   personal data in client bundles, logs, commits, or telemetry.
5. Keep source maps disabled in production until the project has an intentional private error-reporting
   design.
6. Use only assets with documented provenance and redistribution rights.
7. Never claim support for an export format unless downloaded bytes validate as that format.
8. Preserve existing mount-point IDs unless the Warden approves a migration with updated tests.
9. Support 1536×864, 1280×720, 1024×768, 768×1024, and 390×844.
10. Meet WCAG 2.2 AA for the primary open, choose, edit, save, and export journey.

## Prioritized audit targets

### Priority 0 Trust and correctness

1. Prove whether turntable export samples authored timeline data or uses an independent rotation path.
   If it is independent, make the behavior explicit or implement timeline-sampled export.
2. Prove the complete project round trip for added lights, cameras, primitives, modifiers, selected
   asset identity, view state, timeline state, and custom environment metadata. Version the format
   before adding fields and preserve version 1 parsing.
3. Add autosave and crash/context-loss recovery without transmitting private project data.
4. Attach verifiable asset provenance to exported packages when a library asset is used.

### Priority 1 First-run usability

1. Make the asset library and Open GLB path visually prominent without reducing the viewport to a
   decorative preview.
2. Improve thumbnail distinction, selection, licence visibility, search recovery, and useful metadata.
3. Replace crowded toolbar behavior with a clear hierarchy while preserving every existing action.
4. Move export compatibility explanations into readable, contextual guidance.
5. Add visible undo depth, keyboard shortcut guidance, and framing reset only if research and tests
   show they improve the core journey.

### Priority 2 Accessibility

1. Set a 12 px minimum for supporting text and a 14 px body baseline unless the normative Darkroom
   specification provides a more readable value.
2. Make status, error, progress, and completion messages legible and programmatically announced.
3. Provide 44×44 CSS-pixel touch targets at narrow breakpoints.
4. Verify visible focus against every surface and state.
5. Respect reduced motion in CSS and viewport autorotation.
6. Verify 200 percent zoom reflow without trapping content inside `100vh` and `overflow: hidden`.

### Priority 3 Performance and reliability

1. Measure the continuous render loop before deciding whether invalidation-based rendering is safe.
2. Define renderer, texture, geometry, draw-call, and memory budgets from measured representative
   assets.
3. Add an intentional `webglcontextlost` and recovery path.
4. Reduce the main JavaScript chunk only when a measured loading benefit exceeds added complexity.

## Wave 0 Baseline and evidence

One agent owns documentation only. No production code changes are allowed.

- [ ] Fetch `origin/master` and verify starting commit `494b69b` or document the newer commit being used.
- [ ] Create `claude/design-product-v1` without force and record `git status --short`.
- [ ] Run `npm ci`. Install Playwright Chromium only if the existing browser is unavailable.
- [ ] Run `npm run build` and `npm run test:unit`.
- [ ] Run each browser file separately with one worker: `e2e.spec.ts`, `s1.spec.ts` through
  `s6.spec.ts`, and `studio-shell.spec.ts`.
- [ ] Run the complete serial browser suite once as a cross-check. If WebGL contexts exhaust, preserve
  the per-file results and record the exact full-suite failure instead of hiding it.
- [ ] Capture live and local empty, loaded, editing, saving, exporting, completion, and recoverable
  states at all five target viewports into `status/before/`.
- [ ] Record Lighthouse, axe, bundle sizes, load time, console/page errors, and actual export evidence
  in `status/baseline.md`.

**Gate 0:** The Warden accepts a reproducible baseline with no invented results. If browser setup or
WebGL blocks evidence, solve that blocker before implementation.

## Wave 1 Research and visual foundation

### Silo Design Research

**Owns:** `docs/research/` and `docs/design/`

- [ ] Research current browser 3D editors, product mockup tools, asset marketplaces, and creator export
  flows. Record official URLs and access dates.
- [ ] Compare first-run comprehension, workspace hierarchy, asset discovery, responsive behavior,
  export confidence, accessibility, and commercial boundaries.
- [ ] Verify all pricing, rights, privacy, retention, and rate-limit claims from primary sources.
- [ ] Treat every price and vendor statement from the earlier draft as a hypothesis until verified.
- [ ] Copy the accessible Darkroom design specification into the repository or record the blocking
  artifact request.

### Silo Design Foundation

**Owns:** `src/app/style.css` only after the research gate

- [ ] Write failing responsive and state-visibility tests before changing layout behavior.
- [ ] Implement the normative Darkroom tokens, type scale, spacing, radii, borders, focus treatment,
  control states, responsive breakpoints, and reduced-motion rules.
- [ ] Compare before and after screenshots in the same state and viewport.

### Silo Shell

**Owns:** `index.html` and `src/app/main.ts`

- [ ] Preserve every existing mount-point ID.
- [ ] Improve asset-first onboarding, file actions, toolbar hierarchy, status placement, progress, and
  export guidance.
- [ ] Keep every existing control reachable by keyboard and represented by an accessible name.

**Gate 1:** All baseline tests pass per file, no mount point disappears, contrast passes, and reviewed
screenshots match the normative design at all five widths.

## Wave 2 Journey and state system

### Silo Library

**Owns:** `src/library/` and its focused tests

- [ ] Preserve combined type, category, and text filtering plus the 96-result cap.
- [ ] Improve asset identity, selection, licence, provenance, source, file size, triangle count, and
  loading/error presentation when data is available.
- [ ] Preserve fast keyboard navigation with 2,280 manifest entries.

### Silo Editor

**Owns:** `src/editor/` and its focused tests

- [ ] Improve material, environment, light, camera, selection, modifier, and undo presentation.
- [ ] Add unit-labelled values, framing reset, visible undo depth, and shortcut affordances only with
  acceptance tests.

### Silo States

**Owns:** new `src/app/states.ts`, `src/timeline/index.ts`, and their focused tests

- [ ] Implement explicit empty, loading, loaded, selected, editing, saving, exporting, completed,
  disabled, unsupported, context-lost, and recovered states.
- [ ] Make loading and export progress report real evidence rather than simulated percentages.
- [ ] Keep the non-WebGL parts of the application usable when WebGL is unsupported.

**Gate 2:** Every state is reachable through a test that asserts state-specific evidence, keyboard
behavior, and an accessible status message.

## Wave 3 Three local-first functions

Each silo proves its new test fails against the starting behavior before implementation.

### Function 1 Timeline-sampled export

**Owns:** `src/viewer/studio.ts`, `src/timeline/sampler.ts`, and focused tests

- [ ] Author rotation and translation keys with non-linear easing.
- [ ] Export a fixed frame count and assert every sampled transform matches `sampleAt(t)` within
  `1e-6`.
- [ ] Preserve the existing exact frame count, dimensions, filenames, and progress contract.

### Function 2 Project version 2 and local recovery

**Owns:** `src/project/format.ts`, new `src/app/persist.ts`, and unit/integration tests

- [ ] Round-trip an added light, camera, primitive, modifier, selected asset identity, environment
  metadata, view, and timeline.
- [ ] Preserve parsing for valid version 1 files and reject unsupported future versions clearly.
- [ ] Save recovery data locally, simulate context loss or interrupted editing, and prove Restore
  reconstructs the same supported state.

### Function 3 Export receipt and provenance

**Owns:** `src/viewer/zip.ts`, export-receipt helpers, and focused artifact tests

- [ ] Validate PNG, GLB, GLTF, Blender ZIP, and turntable ZIP from their downloaded bytes.
- [ ] Add a machine-readable receipt and human-readable licence file to package exports when a library
  asset is used.
- [ ] Include source URL, licence, asset ID, app version, export kind, dimensions or frame count, and
  creation timestamp without including private local filenames.

**Gate 3:** Each function has recorded red and green test evidence, valid artifacts, migration behavior,
and no network or paid-service dependency.

## Wave 4 Release QA

### Silo Accessibility and responsive QA

- [ ] Traverse the complete journey using only the keyboard.
- [ ] Verify focus visibility, labels, live regions, contrast values, reduced motion, 200 percent zoom,
  and 44 px narrow-screen targets.
- [ ] Compare all critical states at all five viewports.

### Silo Performance and reliability QA

- [ ] Measure cold load, first useful render, orbit responsiveness, frame rate, memory, triangle count,
  draw calls, and export duration with representative assets.
- [ ] Compare before and after numbers and explain every regression.
- [ ] Scan `dist` for source maps, common secret patterns, private files, oversized files, and unknown
  asset licences.
- [ ] Run all unit tests, every browser file separately, the complete serial suite, and the production
  build from a clean checkout.

**Gate 4:** `docs/qa/claude-design-release-report.md` contains commands, measured results, before/after
screenshots, known limitations, rollback commit, and an explicit merge recommendation.

## Wave 5 API and commercial research

One research agent owns `docs/research/` and makes no code changes.

- [ ] Compare at least two current options for AI mockups, image editing, image-to-3D, mesh optimization,
  storage, authentication, billing, analytics, monitoring, and background jobs.
- [ ] Record official price per unit, free allowance, output rights, privacy/training policy, retention,
  latency, rate limits, geographic limits, fallback, and cancellation path.
- [ ] Model costs at 100, 1,000, and 10,000 monthly jobs with explicit assumptions.
- [ ] Record Poly Haven asset rights separately from its live API terms. Do not add a live Poly Haven
  integration until any commercial-use conflict is resolved in writing.
- [ ] Recommend Build, Buy, Prototype, Defer, or Reject. Do not sign up, buy, or integrate a paid
  provider.

## Pull request and delivery protocol

- Push after every accepted gate using conventional commits such as
  `feat(library): add provenance details`.
- Never force-push and never merge `master`.
- Give each failed gate no more than three evidence-based correction attempts. After the third, create
  `BLOCKED.md` with the failure, evidence, attempted corrections, and exact owner action required.
- The pull request must include research links with access dates, Darkroom source evidence, before and
  after screenshots at five widths, files and functions changed, red/green test proof, complete QA,
  performance measurements, export validation, known limitations, API costs, and next steps.

## Escalation boundary

Escalate to the owner only before spending money, disclosing private data, creating new accounts,
granting new permissions, changing the target customer, adding an asset with uncertain rights,
merging to `master`, or replacing the production Cloudflare deployment.

## Explicitly out of scope

Mesh sculpting, node editing, physics, path tracing, paid AI calls, native binaries, desktop packaging,
private client assets, Mixamo redistribution, live checkout, live advertising, and replacing the
Three.js application with a static mock.

## Handoff to the next Claude Design session

### Required first checkpoint

The next session must return these items before any implementation wave begins:

1. Confirmed repository URL, starting commit, and feature branch.
2. Clean `git status` before edits.
3. Wave 0 command results with exact pass/fail counts.
4. Before screenshots for live and local builds at all five target viewports.
5. Measured Lighthouse, axe, bundle, load, console, and export evidence.
6. Confirmation that `Studio Web Redesign.dc.html` is accessible, or a precise request for it.
7. A list of documentation/runtime discrepancies and the evidence used to resolve them.

### Copy-paste launch prompt

```text
Take over Studio Web from this public repository:
https://github.com/muhammadakramarup-spec/studio-web

Read CLAUDE.md and docs/handoffs/2026-09-04-claude-design-product-v1-execution-handoff.md completely.
Follow the orchestration model, ownership rules, waves, tests-first discipline, and review gates exactly.

Start from master at commit 494b69b, or report the newer origin/master commit if it has advanced. Create
claude/design-product-v1 without force. Execute Wave 0 only first. Do not change production code until
the Warden accepts the measured baseline and confirms access to the normative Studio Web Redesign.dc.html
Darkroom design artifact.

After Gate 0, continue wave by wave. Preserve the functioning Three.js editor and real exports. Use one
writer per file, record failing tests before fixes, compare identical before/after states and viewports,
and push small conventional commits. Open a pull request to master, but do not merge or deploy production.

Ask the owner only for money, private-data disclosure, new account permissions, target-customer changes,
uncertain asset licences, merge approval, or production deployment approval. If blocked after three
evidence-based attempts, create BLOCKED.md and stop that workstream.
```

### Definition of done

The handoff is complete when a public feature branch and pull request contain a source-backed audit,
the normative Darkroom design specification, an improved and responsive core journey, the three verified
local-first functions or documented evidence for rejecting one, complete accessibility and performance
QA, valid export artifacts, API and cost research, updated documentation, and no regression in the
existing application.

