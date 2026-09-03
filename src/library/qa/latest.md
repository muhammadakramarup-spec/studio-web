# S3 Library + pipeline — QA (Wave 2)

Evidence: `pipeline/build-manifest.mjs`, `pipeline/verify-triangles.mjs`, `pipeline/verify-licence.mjs`,
`pipeline/verify-hdri-decode.mjs` (plain Node scripts, run directly) plus `npx playwright test
tests/s3.spec.ts --reporter=line` (5/5 passed) against the dev server already running at
`http://localhost:5173`.

| Check (quoted from SCOPE.md §1) | Target | Measured | PASS/FAIL |
|---|---|---|---|
| "All **2,268** existing Kenney `.glb` files extracted ... unchanged" (ingestion floor, decision #6) | 2,268 GLBs, 53.13 MB, 20 kits | 2,268 GLBs, **53,134,388 B (53.13 MB)** exactly matching Warden-verified total, across 20 kits | PASS |
| "`manifest.assets` has exactly **2,268** `source:"kenney"` entries, each with non-empty `licence:"CC0"` and `sourceUrl`" | 2,268 | 2,268 (`node pipeline/build-manifest.mjs` output: `assets written: 2268`) | PASS |
| "≥20 spot-checked across ≥10 kits open in `GLTFLoader` with 0 console errors" | ≥20 across ≥10 kits, 0 errors | 20 GLBs across 10 kits (2/kit), 0 `console.error` calls (`tests/s3.spec.ts` "GLB spot-check" — 1/5 initially FAILED here: 16 kits' GLBs reference an external sibling texture `Textures/colormap.png` not embedded in the GLB; fixed by extracting each kit's `Textures/colormap.png` alongside its GLBs. Re-run: 0 errors) | PASS |
| "**20** kit thumbnails, 256×256, ≤50 KB each" | 20 / 256×256 / ≤50 KB | 20 files, all 256×256 (ffprobe-verified), max 43,281 B, min 30,720 B (`public/assets/kenney/thumbs/*.png`) | PASS |
| Triangle gate: "independent GLB parse asserts `actualTriangles === asset.triangles && actualTriangles <= 500000` for all 2,268, 0 failures" | 0 failures / 2,268 | 0 failures / 2,268 (`node pipeline/verify-triangles.mjs`: re-parses every GLB fresh from disk, independent of `build-manifest.mjs`'s own computation) | PASS |
| Licence script: "`manifest.assets.every(a => a.licence==="CC0" && /^https?:\/\//.test(a.sourceUrl))` exits 0" | exit 0, 100% | exit 0, 100% coverage across **2,280** assets (2,268 models + 12 hdri) (`node pipeline/verify-licence.mjs`) | PASS |
| HDRI (decision #15 overrides SCOPE §5 gap 3): "S3 fetches **12** Poly Haven HDRIs at 1k ... acceptance floor is **6** that decode through `RGBELoader`" | 12 fetched, ≥6 decode | **12/12 fetched** (1k `.hdr`, CC0, `public/assets/hdri/*.hdr`, 19 MB total), **12/12 decoded** through three@0.170.0's actual `RGBELoader.parse()` (`node pipeline/verify-hdri-decode.mjs`, each producing valid 1024×512 float data) | PASS |
| Contractual asset ids (decision #16, blocks S6) | both ids present, licence CC0, correct bytes/triangles/clips | `kenney/mini-dungeon/character-human`: 218,072 B / 465 tri / 32 clips — exact match. `kenney/platformer-kit/character-oobi`: 236,392 B / 1,096 tri / 25 clips — exact match. Both `licence:"CC0"`, both have `sourceUrl`. Verified via `pipeline/glb-parse.mjs` fresh parse and asserted in `tests/s3.spec.ts` | PASS |
| `LibraryPanel` renders manifest + emits `onAssetPicked` | picking a tile calls the callback with the asset | `tests/s3.spec.ts` "S3 LibraryPanel" mounts `mountLibraryPanel`, clicks the first rendered tile, receives `asset.id` starting with `kenney/` | PASS |
| Hosting shape (decision #11) | same-origin Pages assets, not R2 | `public/assets/**` served at site root by Vite/Pages; **2,319 files**, **77 MB** total under `public/assets/` — well inside Pages' 20,000-file / 25 MiB-per-file limits | PASS |

## Playwright run

```
Running 5 tests using 1 worker
[1/5] manifest.assets root shape, counts, and licence coverage
[2/5] both S6-contractual asset ids are present (decision #16)
[3/5] 20 kit-level thumbnails: 256x256, <=50KB each
[4/5] ≥20 GLBs across ≥10 kits open in GLTFLoader with 0 console errors
[5/5] renders manifest grid and emits onAssetPicked on tile click
5 passed (2.7s)
```

## Notable finding during QA (fixed, not a residual defect)

Kenney's GLB exports for 16 of the 20 kits embed geometry (single self-contained BIN chunk) but
reference their **colour texture as an external sibling file** — `images[0].uri === "Textures/colormap.png"` —
rather than embedding it. The zip's `Models/GLB format/Textures/colormap.png` (or `GLTF format/...`
for the 4 differently-named kits) must sit next to the extracted `.glb` files or `GLTFLoader` logs a
console error per model and the colour texture is missing. Caught by the GLB spot-check test (which
failed on the first run with exactly this error), fixed by extracting each kit's `Textures/colormap.png`
alongside its models (`public/assets/kenney/<kit>/Textures/colormap.png`, 16 kits; the other 4 —
`furniture-kit`, `nature-kit`, `racing-kit`, `space-kit` — have no image references at all, confirmed
by scanning every GLB's `images[]` array). Does not change any GLB file's bytes or triangle count.

## Cut / not attempted

- Poly Haven models (0/250 renderable, descriptor-only bundle) — per decision #6, fetch-gated stretch,
  not attempted this wave.
- ambientCG materials — fetch-plan-only per SCOPE, not attempted.
- KTX2 — cut per decision #8 (no native binary installable within scope).
- R2 hosting — cut per decision #11; same-origin Pages assets ship instead.

No `BLOCKED.md` was needed — every blocking target (ingestion floor, triangle gate, licence gate, HDRI
floor, both contractual asset ids) passed within budget.
