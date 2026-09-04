# Studio Shell 1.0 handoff

Date: 2026-09-04

## Decision

The expert panel converged on the same priority: make the existing load → edit → export loop trustworthy before adding paid AI, accounts, checkout, ads, sharing, or new infrastructure. The public workspace is now explicitly labelled **Alpha** and the non-functional commercial/mock surfaces are no longer mounted in the authoring UI.

## Implemented

- Fixed production Draco loading by serving the three.js decoder from `/vendor/draco/`; the decoder, wrapper, and WASM are present in `dist`.
- Routed library HDRIs to `loadEnvironment()` instead of the GLB loader.
- Added real local `.glb` opening through a file picker and drag/drop, with type and 50 MB size checks.
- Added visible loading, success, and error messages. WebGL startup failure now produces a useful recovery screen instead of an empty shell.
- Reframed the first viewport around a three-step asset-finishing workflow.
- Removed the public account, Pro upsell, ad, avatar, and mock-generation panels from the authoring workspace. Their isolated modules remain for future work and existing contract tests.
- Added a versioned `.studio.json` project document with explicit Save/Open actions. Version 1 stores the active model GLB (including its material changes), viewer settings, and timeline. Custom HDR bytes and added scene lights/cameras/primitives are not embedded yet.
- Replaced prior loaded models on normal app loads and dispose geometry, material, and texture resources.
- Limited the rendered library to 96 results, with a prompt to narrow search, and added roving keyboard navigation.
- Added real labels, semantic panel headings, keyboard-operable outliner rows, toggle state announcements, focus-visible styling, higher contrast, live statuses, reduced-motion handling, and responsive phone/tablet layouts.
- Hardened telemetry to a fixed same-origin endpoint and event-specific payload allowlists. Opt-out now removes the anonymous identifier.
- Disabled production source maps.

## Validation completed

- `npm run test:unit`: 4/4 pass.
- `npm run build`: TypeScript and Vite production build pass.
- Production output contains all three Draco decoder files and no source maps.
- A production preview returned HTTP 200 for `/`, `/vendor/draco/draco_decoder.wasm`, and `/assets/manifest.json`; the WASM response used `application/wasm`.
- No paid provider, auth, entitlement, or public AI endpoint was added.

## Validation limitation

The managed browser could not reach the supervised preview (`ERR_BLOCKED_BY_CLIENT`) even though the preview service reported healthy. The local Playwright suite also could not run because Chromium was unavailable and its download endpoint timed out/returned 502. Therefore this handoff does **not** claim fresh pixel-level WebGL, responsive screenshot, or keyboard interaction certification. The prior handoff records 43/43 browser tests on its original revision; those are not substituted for current-run evidence.

## Deployment status

The handoff archive does not contain `.git`, a Cloudflare Pages/Wrangler configuration, or a persisted deployment credential. The existing target remains `studio-web` at `https://studio-web-6ms.pages.dev`; do not create a replacement project. Deployment requires restoring the original repository/branch or providing a write credential for that existing Cloudflare Pages project.

## Next priorities

1. Restore the original Git/Cloudflare connection, run the per-file Playwright suites against `vite preview`, then deploy this exact build.
2. Extend project format v2 to persist authored scene objects/modifiers and embed or reference custom HDRIs; add IndexedDB autosave and recovery.
3. Make timeline exports sample the timeline rather than using a hard-coded turntable rotation.
4. Move the viewer to invalidation-based rendering and add renderer memory budgets.
5. Improve provenance with upstream licence records, acquisition timestamps, and digests; include provenance in exports.
6. Only after measured activation, evaluate server-side auth/quota/AI architecture with D1, R2, Queues, provider adapters, spend caps, and kill switches.
