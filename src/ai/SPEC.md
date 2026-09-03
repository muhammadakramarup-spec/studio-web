# S6 AI & avatars — SPEC (Wave 1 scout)

Scope per `CONTEXT.lock.md`: AI + avatar **stubs with no paid calls**. This file is a spec only —
no code, no `package.json`, no installs (DECISIONS.md #3). Interfaces below are **proposed**, not
frozen — SCOPE.md owns the final shape (DECISIONS.md #4).

---

## 1. Targets

Ordered; every target has a numeric acceptance check. Anything without one is cut to §3.

1. **Generation panel round-trips a mock job with 0 env vars.**
   `requestGeneration()` → state sequence `idle → queued → running → done` completes in
   **< 3000 ms** wall clock, entirely client-side (no network call leaves the browser).
   **5 request states** are rendered: `idle | queued | running | done | error`.
   Acceptance: a Playwright test asserts all 5 states are reachable and total round-trip
   time is under 3000 ms, with `MESHY_API_KEY` unset in the test environment.

2. **Worker stub is safe with zero keys.**
   `workers/ai-gate` (Cloudflare Worker) responds to `POST /generate` in **< 200 ms** locally
   (mock path, no upstream fetch), returns **HTTP 200** with a body labeled `"mock": true`,
   and does not throw or 500 when `MESHY_API_KEY` / `RUNPOD_API_KEY` are absent.
   Acceptance: `curl -X POST` against the local Worker dev server with no env vars set
   returns a valid `GenerateJobResponse` (§2) in under 200 ms, 10/10 runs.

3. **Avatar embed loads and returns a GLB URL, or is cut.**
   `<AvatarPanel mode="rpm-iframe">` embedded via `https://demo.readyplayer.me/avatar?frameApi`
   loads in the Playwright harness and the `v1.avatar.exported` postMessage event fires with a
   `data.url` string within **10 s**, 2/3 attempts. If it does not (cross-origin/CSP/iframe
   issues under the test harness — a known risk, see §4), this target is CUT after 3 attempts
   per the hard rules, and `mode="vrm-fallback"` becomes the shipped default:
   a bundled sample `.vrm` (CC0/self-authored placeholder, not a real user avatar) loads via
   `@pixiv/three-vrm` and renders one frame in **< 2000 ms**, with **0 env vars** and
   **0 network requests** after the initial page load.

4. **Credits gate is enforced, even as a stub.**
   `requestGeneration()` refuses to run (returns `state:'error'`, `error:'no credits'`) once a
   session-local counter reaches 0. Free stub grants **3 mock credits per session**.
   Acceptance: a 4th call in the same session returns `state:'error'` synchronously
   (< 50 ms, no state transition through `queued`/`running`).

5. **Mock is unmistakably a mock.** Every result carries `isMock: true` and a visible
   `"MOCK — not a real generation"` label rendered in the UI adjacent to the result.
   Acceptance: the label string is present in the DOM for every `state:'done'` result,
   checked by a Playwright text-content assertion.

---

## 2. Interface

Proposed `.d.ts`-shape. Not frozen — S6 will not build against this until `SCOPE.md` signs it
(DECISIONS.md #4). Silo dependencies named per HANDOFF_OPUS.md's silo table.

```ts
// src/ai/types.ts — PROPOSED

export type GenerationKind = 'text-to-3d' | 'image-to-3d';
export type GenerationState = 'idle' | 'queued' | 'running' | 'done' | 'error';

export interface GenerationRequest {
  kind: GenerationKind;
  prompt?: string;          // required for text-to-3d; Meshy caps this at 800 chars
                             // (docs.meshy.ai/en/api/text-to-3d, fetched 2026-09-03)
  imageDataUrl?: string;    // required for image-to-3d; data: URL, <=5MB (client-side cap)
  userId: string;           // from S5's useAccount().user.id
}

export interface GenerationResult {
  state: GenerationState;
  jobId: string;
  glbUrl?: string;          // present only when state === 'done'
  isMock: true;              // always true until a provider key is wired in — see §3
  label: 'MOCK — not a real generation';
  error?: string;
  creditsRemaining: number;  // session-local counter today; S5 credits later
}

/** Client-side entry point. Drives the mock state machine; never calls a paid API today. */
export function requestGeneration(req: GenerationRequest): Promise<GenerationResult>;
export function pollGeneration(jobId: string): Promise<GenerationResult>;

export interface AvatarPanelProps {
  mode: 'rpm-iframe' | 'vrm-fallback';   // resolved at build/runtime per §1 target 3
  onAvatarReady: (glbUrl: string) => void; // hand off to S1: studio.load(glbUrl)
  onCancel: () => void;
}
// Framework-agnostic signature; the app shell (src/app/) wires the real component type.
declare function AvatarPanel(props: AvatarPanelProps): unknown;
```

```ts
// workers/ai-gate/types.ts — PROPOSED (the paid-API gate Worker)

export interface GenerateJobRequest {
  kind: 'text-to-3d' | 'image-to-3d';
  prompt?: string;
  imageDataUrl?: string;
  userId: string;
}

export interface GenerateJobResponse {
  jobId: string;
  status: 'done';        // mock path always resolves synchronously
  glbUrl: string;         // e.g. "/library/models/stub/mock-cube.glb" — a real CC0 asset from S3's manifest
  mock: true;
  provider: 'none';       // real values later: 'meshy' | 'hunyuan3d-runpod'
  creditsCharged: 0;      // mock never charges
}
```

**What S6 needs from other silos:**

- **S5** (`src/account/`, `workers/`): `useAccount() -> {user, isPro}` is already frozen at
  HANDOFF_OPUS.md:86. S6 additionally *wants* `credits` / `spendCredit(n): boolean` on the same
  hook — **proposed, not frozen**. If S5 does not ship it, S6 falls back to its own in-memory
  session counter (target 4 above) and drops the S5 dependency entirely — no blocking risk.
- **S1** (`src/viewer/`): `createStudio(canvas) -> {scene, load, setEnv, export…}` is frozen at
  HANDOFF_OPUS.md:82. S6 only calls the existing `load(glbUrl)` to place a generated/avatar GLB
  into the scene — no new S1 surface requested.
- **S3** (`src/library/`, `pipeline/`): the Worker's mock `glbUrl` must point at one fixed,
  already-licensed CC0 asset from S3's `manifest.json` (HANDOFF_OPUS.md:84 schema). S6 does not
  pick the asset — S3 names one at Assembly time; until then S6 uses a placeholder path.

---

## 3. Cut list

Aggressive on purpose — S6 is the least important silo and must not eat S1–S4's time.

- **Real Meshy API calls.** Cut outright today. Confirmed by research (§7): Meshy's API is
  **not available on the Free plan at all** — API access starts at the $20/mo Pro plan. There is
  no free-tier API path to even test against, so there is nothing to wire up today regardless of
  budget. The Worker stub is the entire deliverable here.
- **Real Hunyuan3D-on-RunPod calls.** Cut. No pod is started today (hard rule). The Worker's
  provider-swap shape (§2, `provider: 'meshy' | 'hunyuan3d-runpod'`) documents how it slots in
  later behind the same `POST /generate` contract described in `furnishow-360/docs/PIPELINE.md`
  (private, read-only — cited, not copied: PIPELINE.md's stage 1 image→mesh step is the same job
  shape as `GenerateJobRequest.kind: 'image-to-3d'`).
- **RPM production/partner embed.** Cut unless Akram signs up. RPM's own docs say the free
  `demo.readyplayer.me` subdomain is for testing only and **"not allowed for public projects"**
  (§7). A public deploy cannot legally point at it. Ships as a dev-only path; production defaults
  to the VRM fallback (§1 target 3) unless Akram provides a partner subdomain (§6).
- **Credits/paywall UI polish, prompt moderation, image-upload validation beyond a size cap,
  generation-progress percentage bars beyond the 5 named states.** Cut — cosmetic, not load-bearing
  for the stub's purpose (proving the gate architecture works with zero spend).
- **If the Warden cuts S6's budget further, drop in this order:**
  1. **RPM iframe path first** — it is the riskiest (cross-origin postMessage inside the
     Playwright harness, §4 risk 3) and the least essential (VRM fallback covers the "avatar"
     promise with zero external dependency).
  2. **`<AvatarPanel>` entirely (both modes)** next — avatars are explicitly the least-scoped
     part of the least-important silo; the generation-panel mock alone still demonstrates the
     Pro/credits-gated-AI story the product plan needs.
  3. Keep the **Worker stub + generation panel mock** last — it is the cheapest to build
     (no iframe, no external asset), and it is what proves "stubs for AI with no paid calls"
     to a reviewer.

---

## 4. Risks

Ranked by likelihood × impact on today's ship.

1. **RPM's demo subdomain is disallowed for public/production use** (confirmed, §7).
   *Mitigation:* ship VRM fallback as the production default; gate `rpm-iframe` mode behind a
   `PUBLIC_RPM_SUBDOMAIN` env var that is absent today, so the panel silently uses VRM.
   *Fallback:* if VRM also fails to fit the time budget, cut `<AvatarPanel>` entirely (§3).
2. **Meshy has zero free API tier** (confirmed, §7) — not a today-risk (nothing was planned
   against it) but a **planning risk**: any future "just flip on Meshy" assumption is wrong;
   the real cost floor is $20/mo before a single API call is possible.
   *Mitigation:* documented in §5/§6 so Assembly/Akram don't assume a free path exists.
3. **iframe + postMessage may not fire reliably inside the Playwright test harness**
   (cross-origin frame, potential CSP/sandbox interaction with `reference/`'s known
   `Playwright MCP blocks file://` quirk noted in CONTEXT.lock.md).
   *Mitigation:* 3 attempts (hard rule), then cut to VRM-only and note in BLOCKED.md if even
   VRM's Playwright coverage is blocked — unlikely, since VRM has no iframe/postMessage surface.
4. **S5's `credits`/`spendCredit` API is not frozen yet** — S6 built the wrong assumption.
   *Mitigation:* S6 owns a self-contained in-memory fallback (§2) so nothing blocks on S5.
5. **A user could mistake the mock for a real generation**, which the top-level rules explicitly
   forbid ("a user must never think they generated something real").
   *Mitigation:* `isMock: true` + hard-coded visible label is a target with its own acceptance
   check (§1 target 5), not an afterthought.

---

## 5. Cost table (planning only — nothing is spent today)

### Meshy (credits → USD)

Source: meshy.ai/pricing and meshy.ai/tutorials/meshy-credits-guide, fetched 2026-09-03 (§7).

| Plan | Price | Credits/mo | $/credit |
|---|---|---|---|
| Free | $0 | 100/mo (**web app only — no API access**) | n/a for API use |
| Pro | $20/mo | 1,000 | $0.02 |
| Premium | $40/mo | 3,000 | $0.0133 |
| Ultra | $100/mo | 8,000 | $0.0125 |

| Job type | Credits | Cost at Pro rate ($0.02/credit) |
|---|---|---|
| Text-to-3D, mesh only (preview) | 20 | $0.40 |
| Image-to-3D, mesh only | 20 | $0.40 |
| Texture pass, 2K/4K | 10 | $0.20 |
| Texture pass, 8K | 15 | $0.30 |
| Full generation (mesh + 2K/4K texture) | 30 | **$0.60/job** |

### RunPod (Hunyuan3D route — GPU-seconds → USD)

Source: `C:\3D-Studio\02_projects\furnishow-360\docs\PIPELINE.md` (private, cited not copied),
"Cost and time" section, and `runpod-ops` skill guidance (community cloud ≈ half of secure cloud).

| | Rate | Time/job | Cost/job |
|---|---|---|---|
| Secure cloud RTX 4090 | ~$0.44/hr (PIPELINE.md figure, marked "verify, prices move") | 2–4 min | **$0.015–$0.029** |
| Community cloud (≈ half) | ~$0.22/hr | 2–4 min | **$0.007–$0.015** |

RunPod is roughly **20–80× cheaper per job** than Meshy's Pro-plan credit cost, but requires a
GPU pod (ops overhead, cold-start time, and the `runpod-ops` money rules: state GPU/rate/runtime
and get explicit approval before every launch — no pod is started today).

---

## 6. Sign-ups for Akram

All **optional today** — nothing here blocks the mock stub shipping with zero env vars.

| What | Env var | What breaks without it |
|---|---|---|
| Meshy account + Pro plan ($20/mo minimum — no free API tier exists) | `MESHY_API_KEY` | Worker stays in mock mode forever (this is fine for today; real generation is out of scope regardless per CONTEXT.lock.md) |
| RPM Studio (Developer Dashboard) account → free partner subdomain | `PUBLIC_RPM_SUBDOMAIN` | `<AvatarPanel mode="rpm-iframe">` cannot legally run in production (demo subdomain is test-only per RPM's own docs); panel falls back to VRM, which needs no sign-up at all |
| RunPod account/API key | `RUNPOD_API_KEY` | Already exists per DECISIONS.md #1 ("RunPod (exists)"); no pod is started today regardless |

---

## 7. Evidence

- Meshy free plan: 100 credits/mo, resets 1st of month UTC, free output is CC BY 4.0, free plan
  is **web-app only — API requires a paid plan**. https://www.meshy.ai/pricing (fetched 2026-09-03)
- Meshy credit costs per job type (20/10/15/30 credits by generation type), rollover policy
  ("resets top up to plan maximum, does not stack"). https://www.meshy.ai/tutorials/meshy-credits-guide
  (fetched 2026-09-03)
- Meshy API auth: Bearer token, key format `msy-<random>`, created from the API page after login.
  https://docs.meshy.ai/en/api/quick-start , https://docs.meshy.ai/en/api/text-to-3d (fetched 2026-09-03)
- Meshy API rate limits are published only for paid tiers (Pro: 20 RPS / 10 queued;
  Premium: 20 RPS / 30 queued; Ultra: 20 RPS / 100 queued) — free plan has none because it has no
  API access. https://docs.meshy.ai/en/api/rate-limits (fetched 2026-09-03)
- Ready Player Me iframe embed format `https://${subdomain}.readyplayer.me/avatar?frameApi`;
  `demo.readyplayer.me` usable for testing, **"not allowed to use it for public projects"**;
  commercial/public apps need a Partner (Studio) subdomain, free to register.
  https://docs.readyplayer.me/ready-player-me/integration-guides/web-and-native-integration/quickstart
  (search-result cache, fetched 2026-09-03 — direct WebFetch to docs.readyplayer.me failed DNS
  resolution in this environment; content corroborated via web search of the same page)
- RPM `v1.avatar.exported` postMessage event carries `data.url`, a GLB URL of the form
  `https://api.readyplayer.me/v1/avatars/<id>.glb`.
  https://docs.readyplayer.me/ready-player-me/customizing-guides/avatar-creator/avatar-urls
  (search-result cache, fetched 2026-09-03)
- `@pixiv/three-vrm` is the actively maintained VRM loader for three.js; loads local `.vrm` files
  fully client-side, no service dependency. https://github.com/pixiv/three-vrm ,
  https://www.npmjs.com/package/three-vrm (fetched 2026-09-03)
- Hunyuan3D-on-RunPod pipeline shape, GPU cost figures ($0.44/hr RTX 4090, 2–4 min/job,
  "verify, prices move"): `C:\3D-Studio\02_projects\furnishow-360\docs\PIPELINE.md`
  ("Stage 1 — image to mesh (GPU)" and "Cost and time" sections) — read-only, private, cited only.
- RunPod cost-discipline rules (state cost before launching, terminate after, community cloud
  ≈ half of secure cloud, prefer smallest GPU that fits): `runpod-ops` skill,
  `C:\Users\muazz\.claude\skills\runpod-ops\SKILL.md`.
- S1 interface frozen: `createStudio(canvas) -> {scene, load, setEnv, export…}` —
  `C:\3D-Studio\02_projects\studio-web\HANDOFF_OPUS.md:82`
- S5 interface frozen: `useAccount() -> {user, isPro}` —
  `C:\3D-Studio\02_projects\studio-web\HANDOFF_OPUS.md:86`
- S3 interface: `manifest.json` schema + `<LibraryPanel>` —
  `C:\3D-Studio\02_projects\studio-web\HANDOFF_OPUS.md:84`
- Product plan's own AI/avatar framing ("Meshy first (free credits to start)... Ready Player Me
  embed (free) + VRM via three-vrm; realism later") —
  `C:\3D-Studio\02_projects\studio-web\PRODUCT_PLAN.md:25-27`
  (note: this scout's research found the "free credits" framing needs the caveat that free
  credits do not include API access — see §7 first bullet)
- Scope fence and hard rules (no paid calls, no sign-ups by agents, no spending, stubs must run
  with 0 env vars): `C:\3D-Studio\02_projects\studio-web\CONTEXT.lock.md`
- Wave-1 scout constraints (specs only, interfaces deferred to SCOPE.md):
  `C:\3D-Studio\02_projects\studio-web\DECISIONS.md` #2, #3, #4
