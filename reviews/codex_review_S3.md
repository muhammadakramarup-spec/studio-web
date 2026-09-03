Q1. Target 1—processing all 2,268 GLBs through Draco plus thumbnail rendering (`src/library/SPEC.md:25–29`)—is the likeliest overrun because it creates 4,536 outputs and relies on an unmeasured “sub-second” rendering estimate. Replace it with extracting and manifesting all 2,268 existing GLBs unchanged, plus one shared 256×256 thumbnail per kit (20 total); defer per-model compression and thumbnails.

Q2. `LibraryAsset` exposes the model URL but no animation-clip metadata (`src/library/SPEC.md:66–79`); S4 explicitly needs clip names (`src/timeline/SPEC.md:107–108`). Add `animationClipNames?: readonly string[];` to `LibraryAsset`.

Q3. Yes: the triangle gate trusts the manifest’s own `triangles` value (`src/library/SPEC.md:34`), so writing `0` for every asset passes without enforcing the gate. Replace it with an independent GLB parse that counts decoded primitive triangles and asserts, for all 2,268 assets, `actualTriangles === asset.triangles && actualTriangles <= 500000`, with 0 failures.

Further findings, ranked:

1. Change Target 7 from fetch-plan-only to a blocking Wave-2 Poly Haven HDRI fetch-and-decode deliverable; keep ambientCG plan-only (`src/library/SPEC.md:52–55`).  
2. Change both checks from `manifest.json.every(...)` to `manifest.assets.every(...)`, matching the declared root shape (`src/library/SPEC.md:31–34`, `src/library/SPEC.md:81–86`).  
3. Change launch hosting from mandatory R2 to same-origin Pages assets; the SPEC’s own measurements show today’s floor fits Pages, while R2 may require a forbidden new account (`src/library/SPEC.md:49–51`, `src/library/SPEC.md:175–182`).

The descriptor-only Poly Haven handling, fetch-gated model stretch, and KTX2 cut are sound and match the binding Warden decisions (`src/library/SPEC.md:38–45`, `src/library/SPEC.md:115–130`).