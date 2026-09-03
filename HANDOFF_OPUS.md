# HANDOFF — one-session multi-agent build of the free web 3D studio

**To:** a fresh Claude Code session running **Opus** (orchestrator + reviewer)
**From:** the session that built and verified `reference/lamp360viewer.html` (78/78 measured checks)
**Owner:** Akram. **Duration:** one working day. **Everything runs in parallel.**

Read in this order: this file → `CONTEXT.lock.md` → `PRODUCT_PLAN.md`. Do not read anything else before spawning.

---

## 1. The shape of the day

```
 09:00  WAVE 0  Warden boots, locks context, opens the progress page              15 min
 09:15  WAVE 1  SCOPE SPRINT   6 scouts in parallel  ->  Codex reviews each  ->  Assembly writes SCOPE.md   60 min
 10:15  WAVE 2  BUILD          6 silos in parallel, each: Sonnet dev + Codex dev + QA          4.5 h
 14:45  WAVE 3  ASSEMBLY       2 assembly agents merge, integrate, run the full suite, Codex independent review   90 min
 16:15  WAVE 4  SHIP           deploy, final report, progress page frozen                      30 min
```

Wave 1 is where the agents **decide the actual scope of the day**. Nothing in `PRODUCT_PLAN.md` is a commitment;
it is the north star. `SCOPE.md`, written at 10:15 and signed by the Warden, is the commitment.

---

## 2. Roles (who exists, what each may touch)

| Role | Model | Count | Owns | Never does |
|---|---|---|---|---|
| **Warden** | Opus (this session, main thread) | 1 | `CONTEXT.lock.md`, `status/`, `DECISIONS.md`; spawns and kills agents; signs SCOPE.md; arbitrates | writes product code |
| **Scout** | Sonnet | 6 (one per silo) | its silo's `SPEC.md` in Wave 1 | code |
| **Silo dev (Claude)** | Sonnet | 6 | its silo's `src/<silo>/` + UI | other silos' files |
| **Silo dev (Codex)** | Codex CLI, `-s workspace-write` | 6 | its silo's tests + ports of reference code | UI files |
| **Silo QA** | Haiku runs, Sonnet judges | 6 | `src/<silo>/qa/` — measurements only | product code |
| **Codex reviewer** | Codex CLI, `-s read-only` | on demand | review reports in `reviews/` | edits |
| **Assembly** | Sonnet ×2, Opus reviews | 2 | `src/app/` shell, integration, `SCOPE.md`, final suite | silo internals (it files issues instead) |
| **Progress clerk** | Haiku | 1 | renders `status/PROGRESS.html` every 10 min | anything else |

Token split: Claude and Codex each carry roughly half the build. Codex takes **tests, reference-code ports, and
independent review**; Claude takes **UI, integration, and judgement**. If one provider rate-limits, the Warden shifts
work to the other — never waits.

---

## 3. The Warden (the one agent that keeps everything running)

The Warden is **this Opus session's main thread**. It never leaves; it never builds. It:

1. **Locks context.** Reads `CONTEXT.lock.md` once, quotes its hash into `DECISIONS.md`, and re-reads it before every
   decision. Agents receive a copy of the lock in every prompt. The lock is never edited during the day.
2. **Spawns with budgets.** Every agent prompt ends with: *time box, attempt limit (3), deliverable path, and the
   sentence "if you are stuck after 3 attempts, write BLOCKED.md and stop."*
3. **Watches heartbeats.** Every agent appends one line to `status/heartbeat.log` every 10 minutes
   (`<time> <agent> <silo> <state> <one-line>`). No heartbeat for 20 min → agent is killed and respawned with the last
   good state. Same failing test three times → agent is stopped and the failure is routed to the Codex reviewer.
4. **Breaks loops.** Two agents editing the same file, an agent re-opening a decided question, a QA/dev ping-pong past
   three rounds — the Warden decides, writes the decision to `DECISIONS.md` with a number, and every later prompt
   cites that number. Decisions are not re-litigated.
5. **Keeps production moving.** If a silo cannot ship by 14:45, the Warden cuts it (records the cut, the reason, and
   what would unblock it) rather than letting it stall Assembly.
6. **Escalates only to Akram for**: sign-ups, spending, public exposure, licence doubts. Everything else it decides.
7. **Does not stop until the product is ready.** The wave clock is a plan, not an exit condition. The Warden ends
   only when all four are true: `status/final_qa.md` is green with numbers; the deploy URL serves the app and loads a
   Draco GLB; `REPORT.md` is written; Akram has replied "accepted" (or has said to stop). If the day overruns, the
   Warden keeps cutting scope and re-running Assembly — it never leaves a half-merged tree behind.

Spawn mechanics in Claude Code: `Agent` with `run_in_background: true`, `model: "sonnet"` or `"haiku"`, and
**`isolation: "worktree"` for every silo dev** — each silo builds on its own git worktree/branch and Assembly merges.
Codex is spawned by a Haiku runner agent that executes the CLI commands in §6 and returns the output file.
If Akram types "use a workflow", the `Workflow` tool may run Wave 1 and Wave 2 as `parallel()` blocks instead of
individual Agent calls; the roles and files stay identical.

---

## 4. Silos (the parallel chunks)

Each silo is a directory, a scout, two devs, one QA, and one interface. Silos talk only through their interface
file and `SCOPE.md`. They do not import each other during Wave 2; Assembly wires them in Wave 3.

| Silo | Directory | Wave-1 scout answers | Wave-2 target (cut to fit) | Interface it exposes |
|---|---|---|---|---|
| **S1 Viewer core** | `src/viewer/` | which of the 78 verified behaviours port as-is; three version pin | Vite + TS port of `reference/lamp360viewer.html`: renderer, env/PMREM rotation, framing maths, shadow catcher, export (PNG/zip/WebM incl. warm-up), metallicFactor hint | `createStudio(canvas) -> {scene, load, setEnv, export…}` |
| **S2 Editor** | `src/editor/` | which Blender-like tools fit in 4.5 h | gizmos (TransformControls), outliner list, add light/camera/primitive, PBR material panel, mirror/array/subdivision, post FX (bloom, vignette, grade) | `attachEditor(studio) -> {undo, redo, ops}` |
| **S3 Library** | `src/library/` + `pipeline/` | asset counts achievable today, licence check | pipeline (`gltf-transform`: Draco, KTX2, ≤500k-tri gate, thumbnails, `manifest.json` with licence+source); browser UI; 250 Poly Haven models, ~40 HDRIs, ~50 ambientCG materials | `manifest.json` schema + `<LibraryPanel>` |
| **S4 Timeline & motion** | `src/timeline/` | how many easing presets + which CC0 clips | keyframes on transform/camera, easing presets from `blender-fcurve-craft`, scrub/play, Quaternius/Kenney animated characters, clip picker | `attachTimeline(studio) -> {addKey, play, exportRange}` |
| **S5 Accounts, Pro, ads** | `src/account/` + `workers/` | free-tier services confirmed usable; what Akram must sign up for today | Supabase auth, Pro flag, Lemon Squeezy checkout stub, ad slot component (free tier only), opt-in telemetry | `useAccount() -> {user, isPro}` |
| **S6 AI & avatars (stubs)** | `src/ai/` | Meshy free credits; RPM embed feasibility | UI + Worker stubs for image→3D (Meshy first) and a Ready Player Me embed; **no paid calls today** | `requestGeneration()`, `<AvatarPanel>` |

Scope rules the scouts must obey: the **Not-v1 list** in `CONTEXT.lock.md` is binding; every target has a numeric
acceptance check; a scout that cannot name the check cuts the item.

---

## 5. Waves in detail

### Wave 0 — Warden boot (15 min)
- `git init` the repo at `C:\3D-Studio\02_projects\studio-web` if not one; create `src/app/`, six silo dirs, `status/`, `reviews/`.
- Copy `reference/` as read-only input. Nobody edits `reference/`.
- Start the progress clerk (Haiku, loop: every 10 min run `python status/render_progress.py`).
- Write `DECISIONS.md` line 1: the lock hash and the day's clock.

### Wave 1 — Scope sprint (60 min, all parallel)
1. Six scouts, each: read the lock, `PRODUCT_PLAN.md`, its silo row, and (S1 only) the reference file. Produce
   `src/<silo>/SPEC.md`: targets, cut candidates, interface, numeric acceptance checks, risks. 25 min hard stop.
2. Six Codex reviews in parallel (`-s read-only`, §6): *"find the item most likely to blow the 4.5 h box; find any
   interface that another silo will also need; do not invent problems."* 10 min.
3. Assembly-1 merges the six specs + reviews into **`SCOPE.md`**: the day's commitment, one table, interfaces
   frozen, cut list explicit. Assembly-2 checks every interface is consumed by exactly the silos that need it.
4. Warden signs `SCOPE.md` (decision #1). Progress page shows the six targets.

### Wave 2 — Build (4.5 h, six silos in parallel)
Per silo, in its own worktree:
- **Sonnet dev** builds UI and glue against the frozen interface.
- **Codex dev** ports reference behaviours and writes the tests (Playwright over `http://localhost:5173`; the CDP
  harness in `reference/harness/` shows the pixel-diff method to copy).
- **QA**: Haiku runs the silo suite every 30 min and writes numbers to `src/<silo>/qa/latest.md`; Sonnet judges
  pass/fail against the SPEC's numeric checks. A green QA note is the only way a silo turns "done" on the page.
- Checkpoints at 12:00 and 13:30: Codex reviewer reads the silo diff, files ≤5 findings ranked, dev fixes or Warden
  decides. Findings without a line number are discarded.

### Wave 3 — Assembly (90 min)
- Assembly-1 merges worktrees into `main` in order S1 → S3 → S2 → S4 → S5 → S6, building `src/app/` (shell, routing,
  panels, keyboard map). Integration failures are fixed in `src/app/` or filed back to the silo dev (still alive,
  30 min budget).
- Assembly-2 runs the **full suite**: all silo suites + the ported 78 checks + one end-to-end script (load a Draco GLB
  from `C:\3D-Studio\02_projects\furnishow-360\meshes`, pick a library HDRI, add a light, keyframe a turn, export
  36 frames, assert counts and dimensions). Numbers into `status/final_qa.md`.
- Codex independent review of the integrated build (`codex review`, then `-s read-only` exec on the diff since Wave 0):
  blockers only. Warden decides ship / cut per finding (decisions logged).

### Wave 4 — Ship (30 min)
- Build → Cloudflare Pages (Akram creates the account/project; the agent only runs `wrangler pages deploy` with the
  token in an env var). Fallback: Vercel, which Furnishow already uses.
- Final report `REPORT.md`: what shipped, what was cut and why, every number from final QA, sign-ups still pending.
- Progress clerk renders the last page and stops. Warden kills every remaining agent and confirms `status/heartbeat.log`
  is silent. Nothing keeps running after the day — except the Warden itself, which stays until §3 rule 7 is satisfied.

---

## 6. Codex CLI — exact commands (verified interface, `codex-cli 0.151.0`, auth mode `chatgpt`)

Codex is authenticated on this machine (`~/.codex/auth.json`). Agents never touch keys.

```bash
# developer task inside one silo (writes allowed only in that dir)
codex exec --skip-git-repo-check -C "src/timeline" -s workspace-write --ephemeral \
  -o "reviews/codex_dev_S4_<time>.md" "<task prompt: lock + SPEC + concrete deliverable + acceptance numbers>"

# read-only review of a silo (no edits possible)
codex exec --skip-git-repo-check -C "src/editor" -s read-only --ephemeral \
  -i "status/latest_render_S2.png" -o "reviews/codex_review_S2_<time>.md" "<review prompt>"

# integrated review at Wave 3
codex review --skip-git-repo-check "Review the diff since tag wave0 for correctness blockers only; cite file:line; rank; max 8."
```

Prompt skeleton for every Codex call (keeps it from drifting): lock text → silo SPEC → the single deliverable →
numeric acceptance → *"cite file:line; one concrete change per finding; do not invent problems; stop when done."*
Runs are launched from a Haiku runner agent with `run_in_background`; output is the `-o` file, never the console.

---

## 7. The progress page (`status/PROGRESS.html`) — kept current all day

- Source of truth: `status/progress.json` (one object per silo + waves + decisions + blockers). Agents **append
  events** to `status/events.jsonl`; the clerk folds events into `progress.json` and renders `PROGRESS.html` every
  10 min with `python status/render_progress.py`. Humans open the HTML; agents never edit the HTML by hand.
- Event line: `{"t":"14:02","agent":"S3-dev-codex","silo":"S3","state":"building|blocked|qa-pass|qa-fail|done|cut","msg":"…","n":{"assets":212}}`
- The page shows: wave clock, six silo cards (state, last heartbeat, last QA numbers), decisions list, blockers,
  sign-ups pending for Akram. `status/render_progress.py` is already written and renders the seed page.

---

## 8. Hard rules (also in the lock; repeated here because agents skim)

- One writer per file at a time. Silos own their directory only. `reference/` is read-only.
- "Done" means a QA note with numbers. No numbers, not done.
- Licence: free library is **CC0 only**, every asset carries licence + source URL. Furnishow meshes are a private
  client's — test inputs only, never in the library, never public. Mixamo: link out, never redistribute.
- No spending, no sign-ups, no public deploy without Akram. Keys live in env vars, never in prompts or files.
- Not-v1 (binding): mesh editing, sculpting, node editor, physics, path tracing, paid AI calls.
- Three attempts, then BLOCKED.md. Warden decides. Decisions are numbered and final for the day.

---

## 9. What Akram does today (the only human actions)

1. Start the Opus session in `C:\3D-Studio\02_projects\studio-web` and paste: *"Read HANDOFF_OPUS.md and run the day."*
2. When the Warden asks (Wave 1 will list them): create free accounts — Cloudflare (Pages + R2), Supabase, Lemon
   Squeezy (sandbox), EthicalAds, Meshy — and put tokens in env vars. RunPod already exists.
3. Open `status/PROGRESS.html` whenever you like. Answer Warden escalations; ignore everything else.

---

## 10. Reference material (all inside this folder, self-contained)

| Path | What it is |
|---|---|
| `reference/lamp360viewer.html` | the verified single-file studio; S1 ports it. Behaviours worth keeping are commented in the source |
| `reference/lamp360viewer.ORIGINAL-before-studio.html` | the 359-line starting point, for diffing intent |
| `reference/harness/` | `cdp.py` (drive Edge over DevTools on `file://`), `vlib.py` (pixel diff), `t1…t6` suites, `t_webm_match.py` (frame matching). Paths are relative; run `python t1_smoke.py` from that folder |
| `reference/renders/` | showcase (credenza, 85 mm, Poly Haven HDRI), alpha export, lamp module, de-metalled table |
| Skills to hand to agents by name | `existing-3d-assets` (250 Poly Haven + 21 Kenney kits, indexed), `3d-photoreal`, `blender-fcurve-craft`, `runpod-ops`, `sharing-html-with-team` |
| `C:\3D-Studio\02_projects\furnishow-360\docs\PIPELINE.md` | the Hunyuan3D-on-RunPod route for the AI phase (read-only, private) |

Known facts that save an hour: 89 of the 90 Furnishow GLBs omit `metallicFactor` (glTF defaults it to 1.0 → dark
metal; the hint + override in the reference handles it). Playwright MCP blocks `file://` but works on `http://`.
MediaRecorder drops frames at start and end; the reference's warm-up/tail fix is measured and should be ported verbatim.
