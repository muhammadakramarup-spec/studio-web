# S6 AI + avatars — QA (Wave 2)

Run: `npx playwright test tests/s6.spec.ts --reporter=line`, 3 consecutive full runs (12 test
executions total, 4 tests × 3 runs), all green. Measured column reports the worst (max) value seen
across the 3 runs for each numeric check. Worker handler called directly as a plain function
(no wrangler); browser checks run against the dev server already running at
`http://localhost:5173`.

| Check (quoted from SCOPE.md §1) | Target | Measured | PASS/FAIL |
|---|---|---|---|
| "Round-trip: `idle→queued→running→done` in **<3000 ms**" | < 3000 ms | 216.1 ms (max of 3 runs) | PASS |
| "all 5 states (`idle/queued/running/done/error`) reachable" | all 5 reachable | idle (panel init) → queued → running → done observed on submit; error observed on 4th (credit-gated) call — 5/5 reached | PASS |
| "0 network calls, `MESHY_API_KEY` unset" | 0 requests during round trip | 0 requests recorded (Playwright `page.on('request')` window spanning only the `submit()` call) | PASS |
| "Worker: `curl POST /generate` with 0 env vars → HTTP 200, `mock:true`, **<200 ms**, **10/10** runs" | 200, mock:true, <200 ms, 10/10 | status 200 10/10 all 3 runs; `mock:true`, `provider:'none'`, `creditsCharged:0` 10/10 all 3 runs; max single-call latency 3 ms (env passed as `{}`, 0 keys) | PASS |
| "Credits: 4th `requestGeneration()` call ... returns `state:'error'` synchronously in **<50 ms**, no state transition" | < 50 ms, no transition | 0.1 ms max; `error:'no credits'`, `creditsRemaining:0`; panel's displayed state unchanged by the call (panel never touched) | PASS |
| "Mock label: `isMock:true` + the literal string `\"MOCK — not a real generation\"` present in the DOM for every `state:'done'` result" | literal string present | `[data-testid="gen-result"]` textContent === `"MOCK — not a real generation"` and `data-mock="true"` on every done result (3/3 successful calls per session) | PASS |
| "Avatar: selecting the manifest-listed avatar tile calls `onAvatarReady`, loads via `studio.loadModel(...)`" | called, loads | `onAvatarReady` fired synchronously on tile click with `/assets/kenney/mini-dungeon/character-human.glb`; `studio.loadModel()` resolved with 2 meshes, 465 triangles (matches DECISIONS.md #16 exactly) | PASS |
| "within **2000 ms** the canvas contains **≥1** visible avatar mesh" | ≥1 mesh, <2000 ms | 2 meshes; 59.8 ms max elapsed (tile-select → loaded → rendered) | PASS |
| "256×256 capture differing from the empty-scene baseline by **≥1,000 px**" | ≥ 1000 px | 3,932 px differing (>8/255 per-channel threshold), stable across all 3 runs | PASS |

## Asset ids used (DECISIONS.md #16)

- Avatar tile: `kenney/mini-dungeon/character-human` → resolves to
  `/assets/kenney/mini-dungeon/character-human.glb` (465 triangles, 2 meshes measured — matches
  the Warden-verified 465 triangles exactly).
- Worker mock result: `kenney/platformer-kit/character-oobi` → resolves to
  `/assets/kenney/platformer-kit/character-oobi.glb`. Both files confirmed present on disk at
  `public/assets/kenney/...` before this QA ran; `public/assets/manifest.json` had not been
  written by S3 yet at build time, so ids are resolved deterministically from the id's own
  `source/kit/model` segments (never a hard-coded arbitrary path) rather than by fetching the
  manifest — this also keeps the generation round-trip's "0 network calls" check honest.

## Zero-network / zero-key confirmation

- `workers/ai-gate/index.ts`'s `fetch(request, env)` never reads any key from `env`; it is called
  in tests with `env = {}` (0 entries) and behaves identically. No `fetch`/`XMLHttpRequest`/
  `WebSocket` call exists anywhere in `src/ai/**` or `workers/ai-gate/**`.
- `src/ai/index.ts`'s mock state machine (`runGenerationJob`) uses only `setTimeout` delays; the
  Playwright network listener recorded 0 requests during the generation window in all 3 runs.
- No API key, token, or secret string appears in any file under `src/ai/**` or
  `workers/ai-gate/**`.

## Not measured / out of scope today

- The stretch column is empty for S6 by SCOPE.md's own commitment ("if the Worker stub +
  generation panel land early, no further S6 work is committed"). Nothing beyond the 5 build-order
  items above was attempted, per the lowest-priority-silo instruction.
- Real Meshy/RunPod calls, credits/paywall UI polish, prompt moderation, and progress-bar
  granularity beyond the 5 named states were not built — explicitly cut per SCOPE.md §1's Cut
  column for S6.

## Files

- `src/ai/types.ts` — frozen type surface (SCOPE.md §2)
- `src/ai/index.ts` — mock generation state machine, `GenerationPanel`, `AvatarPanel`
- `src/ai/testHarness.ts` — test-only minimal three.js scene (no import from `src/viewer/`)
- `workers/ai-gate/types.ts`, `workers/ai-gate/index.ts` — Worker stub, plain exported handler
- `tests/s6.spec.ts` — all 4 acceptance checks above, run with `--reporter=line`
