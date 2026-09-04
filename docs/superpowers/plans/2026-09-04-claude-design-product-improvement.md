# Studio Web Design and Product Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Research, redesign, extend, and validate Studio Web as a polished browser-based 3D product studio without regressing its working editor and export capabilities.

**Architecture:** Preserve the current Vite, TypeScript, Three.js, and plain-CSS application while improving it in reviewable vertical slices. Research and measured QA determine the visual direction and feature order; client-only capabilities remain functional without accounts or paid APIs, while future paid operations use documented server-side boundaries.

**Tech Stack:** Vite 5, TypeScript 5.6, Three.js r170, Playwright, Node test runner, Cloudflare Pages, and optional future Cloudflare Workers/R2/Queues integrations.

**Spec:** `CLAUDE.md`, `docs/handoffs/2026-09-04-studio-shell-1.0.md`, and `docs/handoffs/2026-09-04-full-control-development-handoff.md`

## Global Constraints

- Preserve valid GLB loading, scene editing, project save/load, timeline behavior, and PNG/GLB/GLTF/Blender ZIP/turntable exports.
- The signed-out, zero-environment-variable experience must remain useful.
- Never commit secrets, private user files, vendor tokens, or generated assets without provenance.
- Use the existing product language and dark visual foundation until a documented design decision changes it.
- Maintain usable layouts at 1536×864, 1280×720, 768×1024, and 390×844.
- Meet WCAG 2.2 AA for the primary load-edit-export journey.
- Validate all export claims from real downloaded artifacts.
- Run the broad Playwright suite serially because the 3D tests are GPU-intensive.
- Do not deploy to the stable Cloudflare site until the branch is reviewed or the owner explicitly requests deployment.

---

## Workstream map

- `docs/research/claude-design-audit.md`: evidence, screenshots, competitor patterns, and findings.
- `docs/design/studio-web-design-system.md`: selected direction, tokens, components, states, and responsive rules.
- `src/app/style.css`: existing application styling until extraction is justified by repeated component ownership.
- `src/app/main.ts`: shell composition and interaction wiring; split only after tests protect the behavior.
- `src/library/index.ts`: asset discovery, filters, and selection.
- `src/viewer/studio.ts`: viewer loading and export contracts.
- `src/project/format.ts`: versioned local project persistence.
- `tests/studio-shell.spec.ts`: shell, hierarchy, responsive, and discoverability regression coverage.
- `tests/e2e.spec.ts`: complete load-edit-export journey and real artifacts.
- `docs/qa/claude-design-release-report.md`: final evidence and release recommendation.

### Task 1: Establish a protected baseline

**Files:**
- Read: `README.md`, `REPORT.md`, `SCOPE.md`, `DECISIONS.md`
- Read: `src/*/SPEC.md`, `docs/handoffs/*.md`
- Create: `docs/research/claude-design-audit.md`

**Interfaces:**
- Consumes: current `master`, the public Cloudflare site, and existing test fixtures.
- Produces: a dated baseline with exact capabilities, failures, screenshots, and measurements.

- [ ] Create `claude/design-product-v1` from the latest `master` and record the starting commit.
- [ ] Run `npm ci`, `npm run build`, `npm run test:unit`, and `npx playwright test --workers=1`.
- [ ] Capture the empty state, loaded-model state, material editing, project save/load, and export controls at 1536×864, 1280×720, and 390×844.
- [ ] Record current load time, JavaScript/CSS transfer size, console errors, keyboard path, visible clipping, and export artifacts in `docs/research/claude-design-audit.md`.
- [ ] Commit only the baseline document with `docs: record Claude design baseline`.

### Task 2: Conduct source-backed design and product research

**Files:**
- Modify: `docs/research/claude-design-audit.md`
- Read: `docs/superpowers/plans/2026-09-04-studio-web-research-and-monetization.md`

**Interfaces:**
- Consumes: baseline evidence and current primary/official sources.
- Produces: a ranked pattern library and opportunity matrix.

- [ ] Research at least two current examples in each category: browser 3D editor, product mockup tool, 3D asset marketplace, and creator-oriented export workflow.
- [ ] For each example, record URL, access date, first-run pattern, hierarchy, workspace layout, asset discovery, mobile behavior, export flow, pricing boundary, and accessibility observations.
- [ ] Research WCAG 2.2 AA, Core Web Vitals, WebGL recovery guidance, glTF/GLB compatibility, and Cloudflare architectural options from primary sources.
- [ ] Score each opportunity from 1–5 for user value, evidence strength, implementation effort, performance risk, and commercial relevance.
- [ ] Select the ten highest-confidence problems and commit with `docs: add product and design research`.

### Task 3: Select and specify the visual direction

**Files:**
- Create: `docs/design/studio-web-design-system.md`
- Modify: `src/app/style.css`
- Test: `tests/studio-shell.spec.ts`

**Interfaces:**
- Consumes: the ranked audit and existing CSS variables.
- Produces: one implementable visual system with exact token values and responsive behavior.

- [ ] Define three directions—Precision Workbench, Gallery Studio, and Creator Console—and evaluate each for clarity, focus, density, differentiation, accessibility, and implementation risk.
- [ ] Select one direction and document exact colors, type scale, spacing, radii, borders, elevation, focus treatment, button hierarchy, panel hierarchy, empty/loading/error/success states, and breakpoint behavior.
- [ ] Add failing tests proving the primary Open GLB action, project controls, Export group, inspector, and workflow guidance remain visible and unclipped at 1536×864 and 1280×720.
- [ ] Implement only the foundation tokens and shell geometry required to pass those tests.
- [ ] Compare before/after screenshots at identical states and viewports; fix visible hierarchy, clipping, spacing, contrast, and alignment defects.
- [ ] Commit with `feat: establish Studio Web visual system`.

### Task 4: Improve the first-run and load-to-export journey

**Files:**
- Modify: `index.html`, `src/app/main.ts`, `src/app/style.css`
- Modify: `src/library/index.ts`
- Test: `tests/studio-shell.spec.ts`, `tests/e2e.spec.ts`

**Interfaces:**
- Consumes: existing `Studio` viewer API and library `onAssetPicked` callback.
- Produces: an understandable three-step journey with actionable states and preserved editor behavior.

- [ ] Add failing tests for empty, loading, loaded, export-running, export-success, recoverable-error, and unsupported-WebGL states.
- [ ] Make the empty state explain three choices: open a GLB, drop a GLB, or choose a licensed library asset.
- [ ] Make the selected asset, active step, save state, and export readiness obvious without modal interruption.
- [ ] Replace cryptic or crowded labels with concise task language while preserving accessible names and status announcements.
- [ ] Ensure keyboard users can reach Open, library search/results, material controls, camera presets, timeline, and exports in a logical order.
- [ ] Run the focused journey tests and commit with `feat: clarify the load-to-export journey`.

### Task 5: Improve asset discovery and trust

**Files:**
- Modify: `src/library/index.ts`, `src/app/style.css`
- Test: `tests/s3.spec.ts`, `tests/studio-shell.spec.ts`
- Create: `docs/design/asset-card-contract.md`

**Interfaces:**
- Consumes: the existing 2,280-item manifest.
- Produces: responsive, searchable, trustworthy asset results with clear provenance.

- [ ] Add failing tests for combined text/category/type filtering, zero results, visible result count, keyboard selection, and the 96-item rendering cap.
- [ ] Define the asset-card contract: title, category, licence, format, load state, and optional size/polycount when available.
- [ ] Improve thumbnail cropping, density, selected state, focus state, loading state, and empty search recovery.
- [ ] Keep all provenance and licence labels visible before an asset is loaded.
- [ ] Measure search responsiveness with the full manifest and commit with `feat: improve asset discovery`.

### Task 6: Add evidence-backed creator functions

**Files:**
- Modify only the modules owning each accepted function.
- Test: corresponding `tests/s*.spec.ts`, `tests/unit/*.test.ts`, and `tests/e2e.spec.ts`.
- Modify: `docs/research/claude-design-audit.md`

**Interfaces:**
- Consumes: the opportunity matrix from Task 2.
- Produces: no more than three complete, tested functions in the first branch.

- [ ] Select at most three functions whose evidence score is highest; prefer material presets, background/environment controls, export presets, project autosave recovery, or clearer asset metadata because they can work locally without paid APIs.
- [ ] For each selected function, record the user problem, acceptance criteria, data contract, error behavior, performance budget, and why lower-ranked functions were deferred.
- [ ] Write a failing unit or Playwright test for the complete user outcome.
- [ ] Implement the smallest usable version, including loading, success, empty, disabled, and error states.
- [ ] Validate that saved projects remain versioned and older supported projects still parse.
- [ ] Commit each function separately with a descriptive `feat:` commit.

### Task 7: Research APIs without exposing or buying credentials

**Files:**
- Create: `docs/research/api-product-options.md`
- Read: `docs/superpowers/plans/2026-09-04-studio-web-research-and-monetization.md`

**Interfaces:**
- Consumes: official vendor pricing, terms, quotas, data policies, and Cloudflare documentation.
- Produces: a build/buy/defer matrix; no production integration.

- [ ] Compare at least two options for image editing/mockups, image-to-3D, mesh optimization/conversion, authentication, billing, analytics, storage, queues, and error monitoring.
- [ ] Record official price, billing unit, free allowance, commercial output rights, retention/training policy, latency, rate limits, geographic limits, fallback, and cancellation path.
- [ ] Model light, normal, and heavy usage at $9, $19, and $49 plans with explicit assumptions and gross-margin estimates.
- [ ] Recommend Build, Buy, Prototype, Defer, or Reject for every category; do not install or purchase providers.
- [ ] Commit with `docs: evaluate product API options`.

### Task 8: Complete release-grade QA

**Files:**
- Create: `docs/qa/claude-design-release-report.md`
- Modify: tests required to prevent discovered regressions.

**Interfaces:**
- Consumes: all branch changes.
- Produces: reproducible evidence for merge or a clear blocked recommendation.

- [ ] Run `npm run test:unit`, focused changed-module tests, `npx playwright test --workers=1`, and `npm run build` from a clean checkout.
- [ ] Validate real PNG, GLB, GLTF, Blender ZIP, and turntable downloads; inspect names, MIME types, dimensions/entries, and parseability.
- [ ] Test Chrome at 1536×864, 1280×720, 768×1024, and 390×844 with empty, loaded, editing, exporting, and error states.
- [ ] Audit keyboard access, focus visibility, landmarks, labels, live regions, zoom at 200%, reduced motion, and WCAG AA contrast.
- [ ] Record LCP, INP, CLS, bundle sizes, model-load time, console/page errors, and any WebGL warnings with reproducible steps.
- [ ] Scan the production bundle for source maps, common secret patterns, accidental private files, oversized assets, and unknown licences.
- [ ] Write the release report with passed checks, known limits, before/after screenshots, rollback commit, and merge recommendation.
- [ ] Commit with `test: complete Claude design release QA`.

### Task 9: Publish a reviewable GitHub handoff

**Files:**
- Modify: `README.md`, `REPORT.md`
- Create: pull-request description through GitHub.

**Interfaces:**
- Consumes: final branch and QA report.
- Produces: a public branch and pull request the owner can inspect and merge.

- [ ] Update the README with the current workflow, supported formats, local commands, architecture map, and Cloudflare deployment boundary.
- [ ] Push `claude/design-product-v1` without force.
- [ ] Open a pull request to `master` summarizing research, selected direction, functions, screenshots, tests, performance, API recommendations, risks, and deferred work.
- [ ] Confirm the repository and pull request are publicly readable without sharing passwords, tokens, or login details.
- [ ] Do not merge or deploy to the stable Cloudflare site unless the owner explicitly requests it after review.

## Completion definition

The work is complete only when the public branch and pull request contain source-backed research, a
coherent visual system, a materially improved core journey, no more than three evidence-backed new
functions, reproducible QA, updated documentation, and no regression in the existing editor or real
export artifacts.

