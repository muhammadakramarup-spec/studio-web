# Studio Web — Full-Control Development Handoff

Date: 2026-09-04

## Mission

Own the continued development of Studio Web as a production-quality, browser-based 3D asset
studio. Improve the product, add licensed assets and modules, keep the app usable, and deploy
validated changes to Cloudflare Pages.

## Project and deployment

- Local project: `C:\3D-Studio\02_projects\studio-web`
- Stable site: `https://studio-web-6ms.pages.dev`
- Latest preview: `https://5f6a868f.studio-web-6ms.pages.dev`
- Hosting: Cloudflare Pages project `studio-web`
- Existing Cloudflare setup: Wrangler authenticated; Cloudflare skills and MCP servers configured
  in the local Codex environment.
- Do not expose API keys or server credentials in browser code, `public/`, logs, or commits.

## Current product surface

- Three.js 3D viewer with model loading, framing, camera presets, environments, lighting,
  transparent output, shadows, spin, materials, timeline, AI mock panels, account/pro stub, and
  a licensed asset library.
- Browser export toolbar now supports:
  - PNG still image
  - GLB binary glTF
  - GLTF JSON (`.gltf`) with embedded data
  - Blender ZIP containing GLB, GLTF, and import instructions
  - PNG turntable ZIP
  - WebM when the browser can produce a verified recording
- Native `.blend` and animated GIF are deliberately not faked. The UI explains that Blender can
  import the Blender ZIP/GLB and save a native `.blend`; PNG sequences can be converted to GIF by
  desktop tools or a future server-side encoder.

## Non-negotiable working rules

1. Inspect the current code and tests before changing behavior.
2. Preserve user work and existing uncommitted changes. Never reset or overwrite unrelated work.
3. Add or update a failing test before implementing a new behavior; then prove it passes.
4. Use only assets with clear provenance and redistribution rights. Record source, license, and
   attribution in the asset manifest.
5. Keep private/client files out of the repository and `public/`.
6. Keep secrets server-side in Cloudflare bindings or environment variables. Never put secret keys
   into Vite client bundles.
7. Prefer progressive enhancement: the core viewer and local exports must work with zero API keys.
8. Do not claim a format is supported unless the downloaded bytes are a valid artifact.
9. Before deployment, run `npm run build` and the relevant Playwright tests. For broad changes run
   the full suite, accounting for known GPU-load timing variance by rerunning performance failures
   serially.
10. Deploy only the built `dist/` output to the existing Cloudflare Pages project after validation.
    Report the resulting preview URL and verify the stable URL returns HTTP 200.

## Next development priorities

### A. Asset and export system

- Add a clearly licensed starter library of furniture, product, architectural, and abstract assets.
- Add asset metadata: category, tags, source, license, attribution, file size, triangle count,
  texture size, and supported export notes.
- Add export progress/error states and download tests for PNG, GLB, GLTF, Blender ZIP, PNG ZIP, and
  WebM fallback behavior.
- Evaluate a real GIF encoder only after measuring bundle size, licensing, memory use, and quality.
- Evaluate native `.blend` generation as a server-side Blender job only if there is a safe, isolated
  worker/container path; do not rename GLB/GLTF files to `.blend`.

### B. Product modules

- Project save/load with a versioned JSON scene format.
- Material presets and a reusable preset library.
- Batch export and queued jobs with cancellation and clear quotas.
- Shareable read-only project links.
- Optional server-side generation and optimization jobs through Cloudflare Workers/R2/Queues.
- Analytics that remain opt-in, anonymized, and free of filenames, prompts, or PII.
- Paid entitlements only after the business research validates willingness to pay.

### C. Quality and operations

- Add visual regression snapshots for core viewer states and exports.
- Add bundle-size and load-time budgets after the export dependency is measured.
- Add basic accessibility checks for toolbar controls, progress, disabled states, and keyboard use.
- Maintain a concise `REPORT.md` with deployment, test, asset-license, and known-limit status.
- Update the research plan in `docs/superpowers/plans/` whenever evidence changes the roadmap.

## Delegation and research

Use the existing engineering/API research and business/monetization research tasks as inputs. If
using ChatGPT, Perplexity, or another research system, keep each source's findings labeled and
reconcile contradictions before buying APIs or committing to a business model. The engineering
stream should evaluate Cloudflare, storage, queues, auth, payments, 3D processing, generation,
observability, and licensing. The business stream should validate target customers, free-to-paid
conversion, creator/asset marketplace options, pricing, distribution, unit economics, and legal
risks.

## Handoff completion checklist

- [ ] Read `REPORT.md`, the research plan, and the relevant `src/*/SPEC.md` files.
- [ ] Inspect `git status` and preserve existing changes.
- [ ] Confirm the current site and export controls in Chrome.
- [ ] Create a scoped implementation plan for the next change.
- [ ] Implement with tests first and validate locally.
- [ ] Update documentation and asset provenance.
- [ ] Build and deploy to Cloudflare Pages.
- [ ] Verify the preview and stable URLs.
- [ ] Summarize changed files, tests, deployment URL, costs, and any decision requiring the owner.
