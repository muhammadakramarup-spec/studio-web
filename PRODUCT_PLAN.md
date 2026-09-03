# PRODUCT_PLAN — the north star (not the day's commitment; `SCOPE.md` is)

## What it is
A **free web 3D studio** in the browser: drop a model or pick one from a library of hundreds, light it with real HDRIs,
edit it with a small set of Blender-like tools, animate it on a timeline with free motion clips, export stills and
turntables. Grows into a Pro tier, AI generation, and avatars. Seed: the verified viewer in `reference/`.

## Tiers and money
| Tier | Gets | Pays |
|---|---|---|
| **Free** | whole studio, CC0 library (models, HDRIs, materials, motion clips, characters), browser-side project save, exports up to 2048² | ads (unobtrusive, free tier only), opt-in anonymised usage research |
| **Pro** | premium *original* assets (Akram's own and AI packs he owns), 4k+ exports, cloud renders, AI credits | subscription via Lemon Squeezy (merchant of record, handles EU VAT, no monthly fee) |
| **Credits** | image/text → 3D (Meshy API; Hunyuan3D on RunPod), realistic avatar passes | pay-per-job, margin on API cost |

Licensing: free library is CC0 only with licence + source recorded per asset. Furnishow assets are a private client's and
never appear. Mixamo is not redistributable → link out. Premium must be original or Akram-owned generated content.

## Phases (each later phase is a stub in the one-day build)
1. **Studio + library + editor** — the one-day build (see HANDOFF). Blender-like means: gizmos, outliner, lights,
   PBR material panel + material library, mirror/array/subdivision, camera focal/DOF, post FX (bloom, vignette, grade),
   keyframe timeline with easing presets, "send to Blender" (glTF + import script). Not: mesh editing, sculpting,
   node editor, physics, path tracing.
2. **Accounts, Pro, ads, research** — Supabase (free tier) auth, Pro flag, Lemon Squeezy checkout, EthicalAds slot,
   opt-in telemetry that answers "which assets and effects do people reach for".
3. **AI generation** — Meshy first (free credits to start), then the existing Hunyuan3D-on-RunPod pipeline from
   `furnishow-360/docs/PIPELINE.md`, called from a Cloudflare Worker, gated by credits, cost per job logged.
4. **Avatars** — Ready Player Me embed (free) + VRM via three-vrm; realism later via AI texturing and retargeted motion.

## Free-only stack
Vite + TypeScript + three (one pinned r17x release) · Playwright tests over http · Cloudflare Pages (static, unlimited
bandwidth) + R2 (10 GB, zero egress) · Supabase free tier · Lemon Squeezy · EthicalAds → AdSense later · Meshy free
credits · RunPod (exists). No servers to babysit; Workers only for the paid-API gate.

## Asset sources already on disk or free
250 Poly Haven `.gltf` models + 21 Kenney kits (~2,268 models), indexed by the `existing-3d-assets` skill
(`C:\Users\muazz\Downloads\free_3d_assets_bundle`). Fetch at build time: Poly Haven HDRIs (1k/2k), ambientCG materials,
Quaternius + Kenney animated characters. Pipeline gate: ≤ 500k triangles per browser asset; 20 Poly Haven models exceed 1M
and are excluded or decimated.

## What "good" looks like (numbers the agents test against)
A Draco GLB from the furniture folder loads in < 3 s on a 4 GB GPU · every control changes pixels (mean ΔE and % moved
recorded, as in `reference/harness`) · exports have the requested dimensions and frame counts · library assets all carry
licence + source · undo/redo round-trips 50 random ops · exported sequence length equals timeline length.
