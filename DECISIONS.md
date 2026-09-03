# DECISIONS — numbered, final for the day. Every agent prompt cites the number it depends on.

Warden: Opus main thread. Lock: `CONTEXT.lock.md`
SHA-256 `26ec2bb3c07dd54269dab2303bc72e166145f49be3612e60c2a232d744791261`
Repo: `C:\3D-Studio\02_projects\studio-web` · git initialised Wave 0 · tag `wave0` = `06846db`

---

### #1 — Wave 0 boot accepted. The day's clock is a plan, not an exit condition.
Verified on this machine before spawning anything: node v24.19.0, npm 11.17.0, Python 3.12.10,
git 2.55.0, ffmpeg 9.0, codex-cli 0.151.0. Test inputs present: 118 GLBs in
`furnishow-360/meshes` (private client — test input only, never library, never public),
`free_3d_assets_bundle` with Poly Haven + Kenney manifests.
Silo directories, `pipeline/`, `workers/`, `reviews/`, `status/` created and committed.

### #2 — Wave clocks are re-read as agent batches, not wall-clock daemons.
HANDOFF §3 assumes agents that live for hours and heartbeat every 10 minutes. Claude Code
subagents are **bounded runs**: they start, do the work, return, and end. Adapting rather than
pretending:
- A silo's "heartbeat" is an event appended to `status/events.jsonl` at task start and at task end.
  An agent that returns without having appended an end event is treated as dead and respawned —
  this replaces the 20-minute silence rule.
- The Warden re-renders `status/PROGRESS.html` at every wave boundary and after every agent batch
  returns, rather than running a perpetual Haiku clerk. No watcher is left running after the day
  (global standing rule: nothing with a lifetime beyond its work).
- "Three attempts then BLOCKED.md" is unchanged and binding.

### #3 — Wave 1 scouts write specs only. No code, no package.json, no dependency installs.
Six scouts run in parallel in the shared tree; each writes exactly one file (`src/<silo>/SPEC.md`),
so the one-writer-per-file rule holds without worktrees. Worktree isolation begins at Wave 2,
where silos write source.

### #4 — `three` version pin and every interface signature are deferred to `SCOPE.md`.
Scouts propose; Assembly merges; the Warden signs. Until `SCOPE.md` is signed, no silo may assume
an interface shape.

### #5 — `three@0.170.0` + `@types/three@0.170.0` is the pin. Signed.
S1 proposed it and verified an exact-version `@types` match on the npm registry. r170 sits past the
r152 colour-management rewrite and the r160 `useLegacyLights` removal, so the reference's r128 idioms
are ported once, not twice. `three/addons/*` and `three/examples/jsm/*` both resolve under its
`exports` map, so import-path drift is not a risk. No silo may pin a different version.

### #6 — The library's committed floor is Kenney. Poly Haven models are a fetch-gated stretch.
S3 reported and the Warden independently verified on disk:
- `free_3d_assets_bundle/downloaded/polyhaven/` holds **250 `.gltf` descriptor files, 2.15 MB total**,
  each referencing an external `<slug>.bin` and `textures/*.jpg`. **Zero `.bin` files and zero model
  textures exist anywhere in the bundle.** All 250 are unrenderable as they stand. The product plan's
  "250 Poly Haven models already on disk" is false for this bundle — it is 250 descriptors.
- `asset_manifest.csv`'s `downloaded_locally` column claims 299 Poly Haven rows are present. It is
  wrong. **The pipeline verifies files on disk itself and never trusts that column.**
- Kenney is real: **2,268 `.glb` across 20 kits (21 zips; `animal-pack` contains 0 GLB), 53.13 MB
  uncompressed**, self-contained, CC0. Warden-verified by reading every zip index.
Therefore: Kenney ships. Poly Haven models are fetched in Wave 2 only if measured throughput allows,
newest-cut-first. Neither the day nor `SCOPE.md` may depend on them.

### #7 — HDRIs are a mandatory Wave-2 fetch, not a stretch.
The lock's goal sentence promises "light it with a free HDRI library". **No HDRI exists on disk.**
S3 must fetch Poly Haven HDRIs (CC0, 1k/2k) early in Wave 2 and treat that fetch as a blocking
dependency of S1's environment target, not as a nice-to-have. If the fetch fails three times, the
studio still ships with its built-in `room`/`studio` environments and the HDRI panel is cut with a
recorded reason.

### #8 — KTX2 is cut. Draco + resized JPEG/PNG instead.
`toktx`/`basisu` are not npm packages and are not installed; getting them means a native binary
outside `npm install`, which the lock's "nothing that needs Rust/MSVC" fence forbids. Cut, not deferred.

### #9 — EthicalAds is not applied for today. A house-ad placeholder ships in the slot.
S5 found EthicalAds explicitly targets sites with 50k+ monthly pageviews and vets traffic before
approval; a day-one site would stall or be rejected. This is a scope cut, not a sign-up, so it is the
Warden's call. The `AdSlot` component ships with a house ad and makes **0 requests to ethicalads.io**.

### #10 — Meshy ships as a mock. There is no free API tier to ship against.
S6 verified on the current pricing pages: the 100 free monthly credits are **web-app only**; API access
starts at the $20/mo Pro plan (~$0.60 per generation). The lock forbids paid AI calls and spending, so
S6 ships the Worker stub returning a fixed CC0 asset labelled `mock:true`, running with zero env vars.
Ready Player Me's `demo.readyplayer.me` subdomain is disallowed for public projects, so `three-vrm`
with a bundled sample is the default and the RPM path stays behind an absent env var.

### #11 — Launch hosting is same-origin Cloudflare Pages assets. R2 is deferred.
S3's Codex review is right and overrides S3's own SPEC: today's committed library is 2,268 files /
53.13 MB, comfortably inside Pages' verified 20,000-file and 25 MiB-per-file limits, while R2 adds an
API token and a bucket binding — more sign-up surface for no benefit at this size. Ship the library as
same-origin Pages assets. R2 becomes necessary when HDRIs + Poly Haven models push the file count, and
that is a later day's problem.

### #12 — Every Codex review finding (Q1–Q3 + ranked extras, all six silos) is ACCEPTED and binding.
The reviews are in `reviews/codex_review_S{1..6}.md`. They are not advisory; Wave-2 silos build the
reviewed shape, not the original SPEC shape, and no silo may re-litigate a finding. The ones that
change the product materially:
- **S1 gains a render-loop seam**: `setRenderHook(fn: ((dt:number)=>void)|null): void`. Both the S1 and
  S2 reviews found this independently — it is the single interface the whole editor depends on.
- **WebM export is demoted to stretch.** The committed export target is PNG plus one verified
  24-frame 1024×1024 ZIP turntable. `exportWebM()` may return `null` today. A third failed WebM attempt
  writes `BLOCKED.md` rather than silently disabling the button.
- **Post FX narrows to bloom** at fixed resolution with one screenshot-diff check. Vignette and grade
  are stretch, taken only if bloom lands early.
- **Frame-exact export of imported character clips is cut**; object and camera transform sampling is
  the committed path, which is what the end-to-end acceptance test actually exercises.
- **Three acceptance checks were circular or trivially passable and are replaced**: S4's scrub check
  used its own sampler as ground truth; S5's telemetry check never required delivery while opted in;
  S3's triangle gate trusted the manifest's own number. Each now has an independent oracle.
- **S3 ships all 2,268 GLBs unchanged with 20 per-kit thumbnails**; per-model Draco and per-model
  thumbnails are deferred. Independently sound: at a 23 KB mean file size, Draco would cost build time
  and buy nothing.
Warden note for Wave 2: `SimplifyModifier` **does** exist in three@0.170.0
(`node_modules/three/examples/jsm/modifiers/`), contrary to S3's SPEC. It is irrelevant today because
Poly Haven models are a fetch-gated stretch, but it is the decimation route if that stretch is taken.

## Wave-1 close: Assembly-1's six gaps, resolved. Wave 2 builds against these.

### #13 — Outliner predicate (gap 1). One predicate, used by both the code and its test.
A row exists for an object iff `obj.isMesh || obj.isLight || obj.isCamera`. `Group` is **traversed
through, never listed** — a loaded GLB's root Group is not a row, its meshes are. The acceptance count
uses this exact predicate, so the count and the list cannot drift apart.

### #14 — The easing table (gap 2) is a committed fixture, not a promise.
S4 writes `src/timeline/fixtures/easing_expected.json`: 8 presets × 5 sample points (t = 0, 0.25, 0.5,
0.75, 1) = 40 values, committed **before** the acceptance check runs. Invariants asserted for all eight:
`f(0) === 0` and `f(1) === 1` exactly. Back and Bounce may leave [0,1] in the interior — that is the
point of them — but they still hit both endpoints exactly.

### #15 — HDRI fetch target (gap 3): 12 at 1k, floor 6.
S3 fetches **12 Poly Haven HDRIs at 1k**, CC0, each with licence + source URL in the manifest. The
acceptance floor is **6 that decode through `RGBELoader` and produce a visibly different frame**
(≥0.5% pixels moved, the harness convention). Fewer than 6 after three attempts → the HDRI panel is
cut per decision #7 and the built-in `room`/`studio` environments carry the feature.

### #16 — The avatar and mock asset ids (gap 4 — Assembly-1's hard blocker). Named and verified.
Warden-verified by parsing the GLB JSON chunks directly:
- **S6 avatar tile** → `kenney/mini-dungeon/character-human` — `Models/GLB format/character-human.glb`,
  218,072 B, 2 meshes, **465 triangles, 32 animation clips** (`static, idle, walk, sprint, jump, fall,
  crouch, sit, …`).
- **S6 mock generation result** → `kenney/platformer-kit/character-oobi` —
  `Models/GLB format/character-oobi.glb`, 236,392 B, 1 mesh, **1,096 triangles, 25 clips**.
  Deliberately a different model from the avatar tile, so a mock result is visibly a mock.
Both are Kenney CC0, self-contained, already on disk. S3 guarantees both ids exist in `manifest.assets`
with `licence:"CC0"` and a `sourceUrl`; S6 references them by id and never hard-codes a path.
This also confirms S4's finding against the `existing-3d-assets` skill index: **rigged, animated CC0
characters do exist in this bundle** — the skill's "no characters" claim is wrong.

### #17 — `studio.load()` does not exist (gap 5). It is `studio.loadModel()` everywhere.
The name appears in S3's SPEC prose only. No code may use it.

### #18 — `AccountState.status` drops `'loading'` (gap 6).
`useAccount()` resolves synchronously (decision #12, S5 review Q1), so a loading state is unreachable.
An unreachable state is a bug waiting to be depended on. The union is `'signed-out' | 'signed-in'`.

### #19 — `SCOPE.md` is SIGNED. It is the day's commitment.
Warden-verified before signing: every review-mandated interface addition is present
(`setRenderHook`, `execute(op)`, `animationClipNames`, `manifest.assets` root, `TimelineSceneAdapter`
+ `applySampledFrame` + `onChange`, `AccountPanel`, `onModelReady`, optional `userId`), `studio.load(`
appears nowhere except in the line forbidding it, and four citations sampled at random
(`src/viewer/SPEC.md:36-38`, `reviews/codex_review_S4.md:19`, `src/library/SPEC.md:25-29`,
`reviews/codex_review_S5.md:8`) resolve exactly to what `SCOPE.md` claims they say.
**Decisions #13–#18 override `SCOPE.md` §5** wherever a gap is listed there — in particular the HDRI
count (#15: 12 fetched, floor 6) and the avatar/mock asset ids (#16).

### #20 — Wave 2 builds in the shared tree. No worktrees, and no silo runs git.
The handoff called for a worktree per silo. That exists to prevent write collisions, and `SCOPE.md`
already prevents them a cheaper way: each silo owns a disjoint directory and one writer per file
already holds. Six worktrees would mean six `npm install`s and a six-way merge in Wave 3 for no gain.
Instead:
- **Ownership is absolute.** S1 `src/viewer/**` · S2 `src/editor/**` · S3 `src/library/**` +
  `pipeline/**` · S4 `src/timeline/**` · S5 `src/account/**` · S6 `src/ai/**` + `workers/ai-gate/**`.
  Each silo also owns `tests/<silo>.spec.ts` and `src/<silo>/qa/latest.md`. Nothing else. `src/app/`,
  `index.html`, the configs and `reference/` are off limits to every silo.
- **No agent runs any git command.** The Warden commits after each silo returns. This removes
  index-lock contention entirely, and it removes Wave 3's merge step with it.
- The shared harness (`tsconfig.json`, `vite.config.ts`, `playwright.config.ts`, `index.html`,
  `src/app/main.ts` placeholder) is Warden-built infrastructure, already in place and `tsc`-clean, so
  all six silos can run `npm run dev` and Playwright from the first minute.
