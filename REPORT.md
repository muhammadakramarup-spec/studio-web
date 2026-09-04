# REPORT — one-day multi-agent build of the free web 3D studio

**Repo:** `C:\3D-Studio\02_projects\studio-web` · **Lock SHA-256:** `26ec2bb3c07dd54269dab2303bc72e166145f49be3612e60c2a232d744791261`
**Warden:** Opus main thread · **Decisions:** 21, all in `DECISIONS.md` · **Evidence:** `status/final_qa.md` (85 PASS rows)
**Status:** built, tested, verified, and deployed to Cloudflare Pages.

**Public URL:** https://studio-web-6ms.pages.dev

The current build adds real browser downloads for PNG, GLB, GLTF JSON, and a Blender-compatible ZIP
package, alongside the existing PNG turntable ZIP and best-effort WebM export. Native `.blend` and
GIF are not fabricated; the UI explains the supported workflow and limitations.

---

## 1. What shipped

A working browser 3D studio. Load a model or pick one from a 2,280-asset CC0 library, light it with
real Poly Haven HDRIs, edit it with gizmos/outliner/materials/mirror/array/bloom, keyframe a turn on
a timeline, and export a 24-frame 1024×1024 turntable as a ZIP.

| Silo | Shipped | Tests |
|---|---|---|
| **S1 Viewer core** | three r170 port of the verified r128 reference: renderer, camera framing, env + PMREM + rotation, shadow catcher, PNG/GLB/GLTF/Blender ZIP/turntable export, `metallicFactor` hint, `setRenderHook` seam | 6/6 |
| **S2 Editor** | undo/redo command stack, raycast + outliner selection, `TransformControls` gizmos, add light/camera/primitive, PBR material panel, mirror + array modifiers, bloom | 9/9 |
| **S3 Library** | 2,268 Kenney GLBs + 12 Poly Haven HDRIs manifested with licence + source, independent triangle gate, 20 kit thumbnails, library panel | 5/5 |
| **S4 Timeline** | 8 easing presets, pure deterministic sampler, exact-count export, scrub, 50-key round-trip, 3-key turntable | 7/7 |
| **S5 Account** | synchronous signed-out `useAccount()`, account panel, house ad slot, sandbox checkout stub, opt-in telemetry — all with **zero env vars** | 8/8 |
| **S6 AI + avatars** | mock Worker gate, generation panel (5 states), session credits gate, local CC0 avatar tile — **no paid calls, no keys** | 4/4 |
| **Assembly** | app shell wiring S1→S3→S2→S4→S5→S6, end-to-end acceptance script | 3/3 |

**43/43 tests pass** per-file (6+9+5+7+8+4 silo, 4 e2e; re-verified 2026-09-04 after the export work). `tsc --noEmit` clean project-wide. `npm run build` clean: 2,321 files,
80 MB, **0 secrets in `dist`**.

## 2. The day's definition of done (`SCOPE.md` §6) — measured

Load a Draco GLB from the private client folder → pick a library asset → add a light → keyframe a
turn → export 24 frames → assert counts and dimensions:

```
load 513 ms (<3000)          picked kenney/car-kit/ambulance of 2,280
light +1, 31.37% pixels moved turntable 3 keys, angle exactly π (diff 0)
export 24 frames, 0 t-mismatches, ZIP 3,956,206 B
assert 24 entries, names exact, every frame 1024×1024
```

Other headline numbers: 60 fps through ANGLE (2 fps on SwiftShader — a harness artefact, not the
app); framing 0/10 files fail across 50 measurements; shadow catcher 61.6% fully-transparent;
metallic hint 0/10 false negatives; undo/redo exact after 50 ops; gizmo deltas ~1e-13 against an
independent oracle; `sampleAt` 0.018 ms against a 2 ms budget; 0/2,268 triangle-gate failures;
100% CC0 licence coverage with `https` source URLs; 0 requests to ethicalads.io or lemonsqueezy.com.

## 3. Two bugs that green tests did not catch

Both were found by opening the app and looking at it. Both are the same class: **a passing check over
a wrong artefact.**

1. **`exportWebM()` returned a 110-byte Blob** — not a video, but a file a browser would download and
   fail to play. Its test passed because it only asserted "did not throw". Now gated on
   frame-completeness and returns an honest `null` (measured `null` 3/3). Decision #21.
2. **Default bloom blew the model to near-solid white.** S2's check — "≥0.5% of pixels moved" —
   measured **94.32%**, comfortably passing, on an unusable image. Retuned in the app shell only;
   now **0.000% clipped pixels**, effect still visibly present. Finding 8.

A third, `#viewport-hint` reading "Loading studio…" forever over a working studio, was missed by all
40 tests because none loaded the real page shell. All three now have regression tests; the bloom and
hint tests were each proven to fail against the un-fixed code.

## 4. What was cut, and why

**Lock fence (never in scope):** mesh editing, sculpting, node editor, physics, path tracing, paid AI
calls, anything needing Rust/MSVC, desktop packaging.

**Cut during the day, with reasons:**
- **KTX2** — `toktx`/`basisu` are not npm packages; a native binary is fenced out. Draco + JPEG/PNG instead. (#8)
- **Subdivision modifier** — no algorithm ships in r170's `examples/jsm/modifiers/`; building Catmull-Clark has no honest numeric check and edges into the mesh-editing fence.
- **WebM export** — demoted to stretch; returns honest `null`. (#12, #21)
- **250 Poly Haven models** — the bundle's `.gltf` files are descriptor-only: **zero `.bin` files exist on disk**, so all 250 are unrenderable. Must be re-fetched from the API. (#6)
- **Per-model Draco + per-model thumbnails** — at a 23 KB mean file size, compression costs build time and buys nothing. 20 kit-level thumbnails instead. Library tiles are therefore distinguished by name, not picture. (#12)
- **EthicalAds** — they want 50k+ monthly pageviews and vet traffic; a day-one site would be rejected. House-ad placeholder ships instead. (#9)
- **Real Meshy calls** — there is **no free API tier**; API access starts at $20/mo. Mock only. (#10)
- **Ready Player Me iframe** — `demo.readyplayer.me` is disallowed for public projects. Local CC0 avatar tile instead. (#12)
- **R2 hosting** — 2,268 files / 53 MB fits comfortably inside Pages' limits; R2 adds sign-up surface for no benefit at this size. (#11)
- **Frame-exact export of imported character clips** — object/camera transform sampling is what the acceptance test exercises. (#12)
- **Vignette + colour grade, real Supabase session, Lemon Squeezy live checkout** — stretch, not reached.

## 5. Still pending for Akram

**Sign-ups — three, none require a payment method.** The app boots and functions fully with **zero env
vars**, so none of these are blocking; they unlock features rather than fix breakage.

| Service | Hands back | Env var(s) | Without it |
|---|---|---|---|
| [Supabase](https://supabase.com/dashboard/sign-up) | Project URL + anon key | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Account panel stays signed-out |
| [Lemon Squeezy](https://app.lemonsqueezy.com/register) | Test-mode store URL | `VITE_LEMONSQUEEZY_STORE_URL` | Checkout stays a labelled SANDBOX stub |
| [Cloudflare](https://dash.cloudflare.com/sign-up) | Account ID / Pages project | — | Public Pages deployment is live |

**Deployment completed:** `studio-web` is live at https://studio-web-6ms.pages.dev. The latest
preview is https://5f6a868f.studio-web-6ms.pages.dev.

## 6. Known limitations, stated plainly

- **Library tiles share one thumbnail per kit** (20 thumbnails for 2,268 models). Names differentiate them.
- **Running every test in one Playwright worker exhausts WebGL contexts** and flakes three. Per-file is 43/43. CI must run per-file.
- **GPU launch flags (`--use-gl=angle --use-angle=d3d11`) are per-suite, not global** — Windows-only, and validated only under the WebGL-heavy suites. Linux CI would need a fallback. (#21)
- **`SCOPE.md` §2/§5 prose still says `AccountState.status` is `'loading' | 'ready'`** — decision #18 replaced it with `'signed-out' | 'signed-in'`. The code is correct; the signed document lagged and was deliberately not edited.
- **`exportWebM()` returns `null` on this machine.** MediaRecorder never clears the frame-completeness floor here.
- **The 12 HDRIs and 2,268 GLBs are gitignored**, served as static assets. A fresh clone re-runs `pipeline/`.
