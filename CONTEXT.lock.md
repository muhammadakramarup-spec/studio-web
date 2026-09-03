# CONTEXT.lock — read-only for the whole day. Every agent gets this verbatim.

## Goal (one sentence)
Ship, today, a free web 3D studio at a public URL: load or pick a model, light it with a free HDRI library,
edit it with a small set of Blender-like tools, animate it on a timeline, export stills and turntables —
built from the verified reference viewer, with an asset library of CC0 content, and stubs for Pro, ads, AI and avatars.

## Who decides
The Warden (Opus main thread). Decisions are numbered in `DECISIONS.md` and are final for the day.
Akram decides only: sign-ups, spending, public exposure, licence doubts.

## Binding scope fence
IN today: viewer port · editor (gizmos, outliner, lights, materials, mirror/array/subdivision, post FX) ·
library (models, HDRIs, materials, CC0) · timeline (keyframes, easing, clips, characters) ·
accounts/Pro/ads/telemetry stubs · AI + avatar stubs with no paid calls.
NOT today, no exceptions: mesh editing, sculpting, node editor, physics, path tracing, paid AI calls,
anything that needs Rust/MSVC, any desktop packaging.

## Hard rules
1. One writer per file at a time. A silo edits only its own directory. `reference/` is never edited.
2. Done = a QA note with measured numbers (pixel diff, dimensions, counts, timings). Words are not evidence.
3. Free library = CC0 only; every asset records licence + source URL. Furnishow meshes are a private client's:
   test input only, never library, never public. Mixamo: link out, never redistribute.
4. No spending. No sign-ups by agents. No public deploy without Akram. Keys only in env vars.
5. Three attempts per failure, then write BLOCKED.md and stop. Never loop.
6. Heartbeat every 10 min to `status/heartbeat.log`. Silence for 20 min means you are replaced.
7. Cite file:line in every finding. One concrete change per finding. Do not invent problems.
8. Interfaces are frozen at 10:15 in `SCOPE.md`. Changing one is a Warden decision, not a silo choice.

## Fixed technical facts
Machine: Windows 11, Node 24, npm 11, Python 3.12 (PIL, numpy), git, ffmpeg 9, Intel UHD + GTX 1650 (4 GB).
Stack: Vite + TypeScript + three (pin one r17x release in SCOPE.md) + Playwright tests over http://localhost:5173.
Hosting target: Cloudflare Pages + R2 (free); fallback Vercel free.
Reference: `reference/lamp360viewer.html` — Three r128, 78/78 measured checks. Port behaviours, not the r128 API.
Codex CLI 0.151.0 is authenticated (chatgpt mode). Playwright MCP blocks file://; use http.
