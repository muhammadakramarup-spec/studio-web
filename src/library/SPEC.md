# S3 Library + pipeline — SPEC (Wave 1 scout)

Scout pass only. No code, no `npm install`, no bulk downloads were performed. All counts below are
measured from the local bundle at `C:\Users\muazz\Downloads\free_3d_assets_bundle` (its manifests and
the actual bytes on disk) plus two web checks for current platform limits. Every number has a citation
in §5.

## Headline finding (read this first)

The bundle's 250 `downloaded\polyhaven\*.gltf` files are **scene-descriptor JSON only** — every one of
them references an external `.bin` geometry buffer and 3–6 external texture `.jpg` files by relative
path (`textures/<name>_1k.jpg`), and **none of those files exist anywhere in the bundle**
(`find … -iname "*.bin"` → 0, `find … -iname "*.jpg" -o -iname "*.png"` under `downloaded\polyhaven` → 0).
So **0 of the 250 Poly Haven models are renderable today**. `asset_manifest.csv` marks all 299 of its
Poly Haven rows `downloaded_locally,Yes` — that field is wrong; do not trust it uncross-checked.

Kenney is the opposite story: all 2,268 models across the 20 usable kits ship complete `.glb` files
(geometry + textures embedded, self-contained), already on disk, already CC0, already under the
triangle gate by a wide margin. That is today's real, immediately-pipelineable library.

## 1. Targets

Ordered; each has a numeric acceptance check. Anything without a number is in §3 (Cut list).

1. **Kenney GLB library ingested and pipelined.** 2,268 source `.glb` files (from 20 kit zips) run
   through `gltf-transform` (Draco compress + thumbnail render) into `pipeline/out/kenney/`.
   *Check:* `manifest.json` contains exactly 2,268 entries with `source:"kenney"`; every one has a
   non-empty `licence` ("CC0") and `sourceUrl` field; every output `.glb` opens in three.js
   `GLTFLoader` without console errors (spot-check ≥20 across ≥10 different kits, 0 failures).
2. **100% licence + source coverage, machine-checked.** *Check:* a CI-style script
   (`pipeline/verify-manifest.mjs`, Wave 2) asserts `manifest.json.every(a => a.licence === "CC0" &&
   /^https?:\/\//.test(a.sourceUrl))` — exit code 0 means 100%, any failure prints the offending
   `id` and blocks the build. Target: 0 exceptions, i.e. 100% of shipped entries pass.
3. **Triangle gate enforced.** *Check:* `manifest.json.every(a => a.triangles <= 500000)`. Measured
   today: 0 of the 2,268 Kenney models are anywhere close (low-poly kit, tens–hundreds of tris per
   model — see §5). 23 of the 250 catalogued Poly Haven slugs exceed 500k tris and are excluded by
   name (list in §5), not decimated — decimation is out of scope for a one-day pass.
4. **Poly Haven hero subset actually fetched and pipelined (stretch, Wave 2, budget-gated).**
   Target: fetch full 1k packages (`.gltf` + `.bin` + textures) for a **curated 60-model subset**
   (props/furniture/electronics categories, all ≤500k tris, picked from the 227 already-under-gate
   candidates) via `dl.polyhaven.org`, run the same pipeline. *Check:* if elapsed fetch time for the
   first 10 models (measured, Wave 2) × 6 projects to > 45 min of pure download time, cut the subset
   to whatever completed rather than blocking the build — record the actual completed count in
   `manifest.json` and in the QA note. Do not commit to "250" or "227" — commit to the measured
   fetch throughput.
5. **Thumbnails.** *Check:* every shipped manifest entry has a `thumbnailUrl` pointing to a rendered
   PNG, 256×256, ≤50 KB each (Kenney models are simple enough that an orthographic three.js render at
   that size is sub-second per asset — see §4 estimate).
6. **Hosting shape decided.** *Check:* library assets (GLBs, thumbnails, `manifest.json`) are served
   from Cloudflare R2, not bundled into the Cloudflare Pages deploy — see §5 for the numbers that
   force this.
7. **HDRIs and ambientCG materials: fetch list only, not fetched.** *Check:* `pipeline/fetch-plan.json`
   (Wave 2 input) lists URL patterns and a per-file byte estimate for both sources (see §5), with 0
   files actually downloaded during this Wave-1 pass (verified: `find downloaded -newer
   <this-file>` returns nothing new).

## 2. Interface

### `manifest.json` schema

```ts
// One row per shippable asset. Written by the pipeline (S3), read by <LibraryPanel> (S3)
// and by S1's loader when an asset is picked.
type AssetKind = "model" | "hdri" | "material";

interface LibraryAsset {
  id: string;                 // stable slug, e.g. "kenney_furniture-kit_chairDesk" or "polyhaven_ArmChair_01"
  kind: AssetKind;
  name: string;                // display name, e.g. "Desk Chair"
  source: "kenney" | "polyhaven" | "ambientcg";
  licence: "CC0";               // literal — anything else is excluded before it reaches this file
  sourceUrl: string;            // the exact upstream download URL, for the licence audit and attribution
  category: string;             // e.g. "Furniture/Seating/Chairs" (Poly Haven) or "furniture-kit" (Kenney)
  triangles: number;            // measured post-Draco; must be <= 500000 (gate)
  fileUrl: string;              // R2 path/URL to the pipelined .glb (Draco-compressed)
  fileBytes: number;            // size of fileUrl, for UI weight/loading hints
  thumbnailUrl: string;         // R2 path/URL, 256x256 PNG
  dimensionsMeters?: [number, number, number]; // bounding box, if known (Poly Haven only)
}

// Root file shape:
interface LibraryManifest {
  generatedAt: string;          // ISO timestamp
  pipelineVersion: string;      // bump when gltf-transform args change, for cache-busting
  assets: LibraryAsset[];
}
```

HDRI and material rows reuse the same `LibraryAsset` shape with `kind:"hdri"|"material"` — `triangles`
is `0` for those and `fileUrl` points at the `.hdr`/texture set instead of a `.glb`. No HDRI/material
rows exist in `manifest.json` until Wave 2 fetches them (Target 7); the schema is defined now so S1/S2
can code against it without waiting.

### `<LibraryPanel>` contract

- **Renders:** a filterable grid (by `kind`, `category`, free-text on `name`) reading `manifest.json`,
  each tile showing `thumbnailUrl`, `name`, and a licence badge (always "CC0" today).
- **Emits on pick:** a single event `onAssetPicked(asset: LibraryAsset)` — no side effects inside
  `<LibraryPanel>` itself; it does not touch the three.js scene.
- **What it needs from S1 (`src/viewer/`):** S1's `createStudio(canvas).load(url: string, opts?)`
  entry point (per `HANDOFF_OPUS.md` §4 interface row for S1) is what `<LibraryPanel>`'s consumer
  (likely `src/app/`) calls with `asset.fileUrl` when `onAssetPicked` fires. `<LibraryPanel>` itself
  never imports from `src/viewer/` — it only emits the picked `LibraryAsset`; whoever wires it (S3's
  own demo harness in Wave 2, or Assembly's `src/app/`) is responsible for calling S1's `load()`.
- **What it needs from S2 (`src/editor/`):** nothing directly — material-kind assets are consumed by
  S2's PBR material panel the same way (`onAssetPicked` with `kind:"material"`), but that wiring is
  Assembly's job, not `<LibraryPanel>`'s.
- **Not yet decided (defer to `SCOPE.md`, per Decision #4):** whether `<LibraryPanel>` fetches
  `manifest.json` itself or receives it as a prop; whether R2 URLs are absolute or proxied through a
  Worker. Proposing the prop-based, absolute-URL version above as the simplest thing that works for a
  static Pages site with no server.

## 3. Cut list

- **All 250 Poly Haven models, today, as originally scoped.** Only stub JSON exists locally; real
  geometry+textures were never fetched into this bundle. Replaced by Target 4's curated, budget-gated
  60-model subset fetched in Wave 2. **Cutting the "250 models" headline number from the product plan
  — it was never true of this bundle and nothing in Wave 1 can make it true without a bulk fetch this
  pass explicitly forbids.**
- **KTX2 texture compression.** `gltf-transform`'s KTX2/Basis path shells out to an external `toktx` or
  `basisu` binary (KTX-Software project) that is not an npm package and is not installed on this
  machine (`where toktx`, `where basisu` → not found; global npm list shows no gltf-transform toolchain
  either). Installing it is a manual native-binary download outside `npm install`, which is exactly the
  kind of untested, time-uncertain external dependency the lock's Rust/MSVC fence exists to keep out of
  a one-day build. **Cut for today.** Ship Draco-compressed geometry + resized JPEG/PNG textures
  instead (plain `sharp`/`gltf-transform resize` — pure JS/WASM, no external binary).
  Note this differs from the product plan's assumption that KTX2 was in scope; flagging the delta
  explicitly rather than silently dropping it.
  Note: KTX2 is a Pro/Wave-2+ candidate once someone verifies the binary installs cleanly outside
  this pass — not attempted here.
- **Decimation of over-gate Poly Haven models.** 23 of 250 catalogued slugs exceed the 500k-tri gate
  (20 of those exceed 1M). Simplification/remeshing tooling (e.g. `meshoptimizer` simplify, or
  Blender-headless decimate) is not verified working in this environment this pass. **Excluded by
  name, not decimated** — see the list in §5. Revisit only if a Wave-2 silo has spare time and a
  verified decimation tool.
- **ambientCG materials and Poly Haven HDRIs — fetching.** Listed with URL patterns and byte estimates
  (§5) for Wave 2; **zero fetched** in this pass per the "no bulk downloading" rule.
- **`animal-pack` Kenney kit.** Confirmed empty (0 `.obj`/`.fbx`/`.glb` inside the zip despite 135
  files present — it's textures/docs only, a failed model download upstream). Excluded from the 2,268
  count already (2,268 = the other 20 kits only).
- **The 9 un-downloaded Kenney kits** (`weapon-pack`, `western-kit`, `conveyor-kit`, `construction-kit`,
  `alien-planet-kit`, `tank-kit`, `farm-building-pack`, `board-game-kit`, `mini-characters-1`) — their
  manifest rows carry `"error":"HTTP Error 404: Not Found"` instead of a licence, so there is nothing
  to audit or ship; they were never fetched into this bundle.
- **`.obj`/`.fbx` copies of the Kenney models.** Each Kenney model exists 3× in the zip (`.obj`, `.fbx`,
  `.glb`); shipping only `.glb` (already glTF-family, no conversion step) — cut the other two formats
  from the pipeline, they add no value for a Three.js web target.

## 4. Risks

Ranked. **Licence risk is deliberately first** — the lock says any doubt escalates to Akram.

1. **(Licence, low-probability but non-zero — flag, do not silently proceed)** 9 of 30 catalogued
   Kenney kit manifest rows have `license: null` (they 404'd on fetch, listed in §3). None of those 9
   kits are on disk, so nothing from them can ship — but if a future pass re-fetches them, their
   licence must be re-verified against kenney.nl directly before shipping, not assumed CC0 by
   association with the other 21 kits. **Escalate before fetching those 9, don't assume.**
   Separately: `asset_manifest.csv` claims 100% of its 320 rows are `downloaded_locally:"Yes"` and
   100% `license:"CC0"`, but the `downloaded_locally` claim is demonstrably false for ~50 Poly Haven
   rows (see Headline finding) — meaning **this manifest file is not a trustworthy source of truth on
   its own**; the pipeline's own manifest generator must stat real files on disk, never copy this
   CSV's `downloaded_locally` column verbatim. Low licence risk (license field itself checks out at
   100% CC0 across all three manifests I read), but the file-existence claims do not, so the trust
   boundary needs to move to "files verified on disk" not "manifest says so." **Mitigation:** the
   Wave-2 pipeline script must independently confirm every shipped `.glb`/`.gltf` exists and opens
   before writing its manifest row — never trust `asset_manifest.csv`'s `downloaded_locally` column.
2. **(Scope) Poly Haven headline count is unshippable today as scoped.** 0 of 250 have real geometry
   locally; fetching real packages is a Wave-2, budget-gated activity with unknown total bytes until
   the first 10 are actually measured. **Mitigation:** Target 4's throughput-gated cutoff; **Fallback:**
   ship Kenney-only (2,268 models) if Poly Haven fetch throughput is too slow to hit even 60 models —
   Kenney alone is a defensible, fully-CC0, fully-verified library for launch day.
3. **(Toolchain) KTX2 needs an unverified external binary.** Already cut in §3; risk is someone
   re-adding it under time pressure without checking it doesn't pull Rust/MSVC. **Mitigation:** this
   SPEC's cut list is the record; Wave-2 dev should not attempt KTX2 without a fresh check.
4. **(Hosting) Cloudflare Pages' 20,000-file/25 MiB-per-file cap plus the fact every Pages deploy
   re-uploads the whole build.** Not a hard blocker today (2,268 GLBs + thumbnails ≈ 4,600 files, well
   under 20k; every file is under 1 MB, far under 25 MiB) but it will bite the moment Poly Haven +
   HDRIs + materials are added, and it makes every unrelated app-code deploy slower for no reason.
   **Mitigation:** put the library (GLBs, thumbnails, `manifest.json`) in R2 from day one (Target 6),
   keep Pages to app code + a `manifest.json` URL reference. R2 free tier (10 GB storage, 1M Class A /
   10M Class B ops/month, zero egress) comfortably covers today's ~53 MB Kenney set plus a 60-model
   Poly Haven subset with room to spare.
5. **(Time) Triangle/format assumptions for the 60-model Poly Haven stretch target are estimates, not
   measurements**, because fetching even one full package was out of scope for this pass. **Mitigation:**
   Target 4 explicitly gates on measuring the first 10 real fetches before committing to a final count.

## 5. Evidence

All commands run from `C:\Users\muazz\Downloads\free_3d_assets_bundle` unless noted; Python one-liners
used for JSON/CSV field checks, quoted where the exact check matters.

- **250 Poly Haven `.gltf` files on disk, 2.15 MB total, JSON-only (no `.bin`/textures anywhere):**
  `find downloaded/polyhaven -type f | wc -l` → 250; `find downloaded/polyhaven -type f -exec du -cb {} + | tail -1`
  → `2150454 total`; `find . -iname "*.bin" | wc -l` → 0; `find downloaded/polyhaven -iname "*.jpg" -o -iname "*.png" | wc -l` → 0.
  Sample buffer/texture references confirmed external, unresolvable: `downloaded/polyhaven/*.gltf` →
  `d['buffers']` = `[{"byteLength": 284408, "uri": "alarm_clock_01.bin"}]` (that file does not exist in
  the bundle), `d['images'][0]['uri']` = `"textures/alarm_clock_01_nor_gl_1k.jpg"` (does not exist).
  Confirmed for all 250: 0 embedded (data-URI) buffers, 250 external-URI buffers, 0 with no buffer at
  all (script output: `embedded (data URI) buffers: 0`, `external (relative path) buffers: 250`).
- **`asset_manifest.csv`'s `downloaded_locally` column is unreliable for Poly Haven:** header at
  `asset_manifest.csv:1`; 320 data rows, `Counter({'Yes': 320})` for `downloaded_locally` and
  `Counter({'Poly Haven': 299, 'Kenney': 21})` for `source` — i.e. it claims 299 Poly Haven rows are
  downloaded, contradicting the 250 actually on disk confirmed above.
- **2,268 Kenney models, complete, self-contained `.glb` (+ matching `.obj`/`.fbx`), across 20 kits;
  `animal-pack` empty:** per-kit `zipfile.namelist()` counts (script output, one row per kit):
  `car-kit.zip` 50/50/50, `castle-kit.zip` 76/76/76, `city-kit-commercial.zip` 41/41/41,
  `city-kit-roads.zip` 95/95/95, `city-kit-suburban.zip` 40/40/40, `fantasy-town-kit.zip` 167/167/167,
  `food-kit.zip` 200/200/200, `furniture-kit.zip` 140/140/140, `graveyard-kit.zip` 91/91/91,
  `hexagon-kit.zip` 72/72/72, `holiday-kit.zip` 99/99/99, `mini-dungeon.zip` 30/30/30,
  `modular-buildings.zip` 108/108/108, `nature-kit.zip` 329/329/329, `pirate-kit.zip` 72/72/72,
  `platformer-kit.zip` 153/153/153, `racing-kit.zip` 112/112/112, `space-kit.zip` 153/153/153,
  `survival-kit.zip` 80/80/80, `tower-defense-kit.zip` 160/160/160 (obj/fbx/glb counts, all equal per
  kit) = 2,268 total each format; `animal-pack.zip` = 0/0/0 across 135 files (docs/preview only).
  `downloaded/kenney/*.zip` listing (21 files, `ls -la` output) confirms exactly these 21 zips present,
  matching `kenney_manifest.json`'s 21 rows with `license:"CC0"` (vs. 9 rows with
  `"error":"HTTP Error 404: Not Found"`, `license: null` — `kenney_manifest.json` full dump, script
  output above).
- **2,268 Kenney `.glb` files total 53,134,388 bytes (53.13 MB) uncompressed, avg 23,428 B, max 440,652 B,
  min 1,496 B:** `zipfile.ZipFile(...).infolist()` sum over all 20 usable kits (script output).
- **All 250 downloaded Poly Haven entries: `license:"CC0"`, non-empty `download_url`, non-empty
  `source`, 0 exceptions:** `polyhaven_downloaded.json` (250-entry list) — `license values seen: {'CC0'}`,
  `non-CC0 count: 0`, `missing download_url: 0`, `missing source: 0`.
- **All 320 `asset_manifest.csv` rows: `license == "CC0"`, 0 exceptions:**
  `Counter({'CC0': 320})` over `asset_manifest.csv` (320 data rows after the header at line 1).
- **All 300 `polyhaven_manifest.json` entries: `license:"CC0"`:** `Counter({'CC0': 300})`.
- **All 30 `kenney_manifest.json` rows are either `license:"CC0"` (21 rows, the kits on disk) or an
  explicit 404 fetch error with no license claimed (9 rows, not on disk)** — full per-row dump in the
  script output above; 0 rows assert a non-CC0 license.
- **Triangle-gate distribution for the 250 downloaded Poly Haven slugs, cross-referencing
  `polyhaven_models.json`'s `polycount` field by slug:** `<10k: 106, 10k-100k: 99, 100k-1M: 25, >1M: 20,
  no_polycount_meta: 0` (script output — matches the product-plan's "~20 exceed 1M" claim exactly).
  Against the actual ≤500,000-tri gate: **227 under-or-equal-gate, 23 over-gate** (script output:
  `under/equal 500k gate: 227`, `over 500k gate: 23`). The 20 over the 1M mark, by name and polycount
  (`polyhaven_models.json[slug]['polycount']`): pine_tree_01 17,427,094; pine_sapling_medium 9,784,670;
  fir_tree_01 7,853,731; island_tree_03 4,760,490; tree_small_02 4,652,585; island_tree_01 3,729,692;
  coastal_cliff_04 2,883,111; coast_land_rocks_02 2,420,895; fir_sapling_medium 2,308,249;
  coast_land_rocks_03 2,056,223; coast_land_rocks_04 2,037,497; coastal_cliff_02 1,768,655;
  island_tree_02 1,762,064; celandine_01 1,746,764; grass_medium_01 1,606,633; coast_rocks_03 1,525,242;
  coast_rocks_05 1,446,981; searsia_burchellii 1,427,042; sand_rocks_small_01 1,386,500;
  grass_medium_02 1,043,926. The 3 more that exceed 500k but not 1M: searsia_lucida 841,648;
  didelta_spinosa 694,671; othonna_cerarioides 651,641.
- **`gltf-transform`/`toktx`/`basisu` not installed on this machine (no evidence either needs
  Rust/MSVC, but neither is npm-installable, and neither is present):** `npm ls -g --depth=0` → only
  `@openai/codex` and `vercel` present, no gltf toolchain; `where gltf-transform` / `where toktx` /
  `where basisu` → all "Could not find files for the given pattern(s)."
- **Cloudflare Pages current limits (checked live, not from memory):** 25 MiB per file; 20,000 files
  per deployment on the free plan (paid plans raised to 100,000 files as of a Jan 23 2026 changelog —
  we are on free, per the lock's "no spending" rule, so 20,000 applies). Source:
  developers.cloudflare.com changelog "Increased Pages file limit to 100,000 for paid plans" (2026-01-23)
  and Cloudflare community threads confirming the pre-existing 25 MiB/20,000-file free-tier baseline.
- **Cloudflare R2 free tier (checked live):** 10 GB-month storage, 1,000,000 Class A ops/month,
  10,000,000 Class B ops/month, zero egress fees — Standard storage class only. Sourced from current
  Cloudflare R2 pricing summaries (searched 2026-09-03; cross-check against developers.cloudflare.com/r2
  before Wave-2 commit if a precise dollar figure is ever needed, since this pass used search-engine
  summaries rather than the primary pricing page directly).
- **HDRI/material fetch plan (not fetched, per rule) — URL pattern evidence:**
  `polyhaven_manifest.json`'s `download_url` pattern for models is
  `https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/<slug>/<slug>_1k.gltf` (e.g. row 1,
  `grass_medium_01`); Poly Haven's HDRI and ambientCG's material downloads follow the same
  `dl.polyhaven.org`-style per-asset URL convention documented on their public sites, but **no HDRI or
  material URL exists anywhere in this bundle's manifests** — confirmed by grep: none of
  `asset_manifest.csv`, `polyhaven_manifest.json`, `polyhaven_models.json`, `kenney_manifest.json`
  contain the string `hdri` or `ambientcg` (case-insensitive). This bundle is models-only; the fetch
  plan for HDRIs/materials in Target 7 has no local precedent to measure against and must be built
  fresh in Wave 2 from each site's own API docs, not from this bundle.
