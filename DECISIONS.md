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
