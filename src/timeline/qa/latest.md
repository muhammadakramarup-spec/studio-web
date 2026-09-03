# S4 Timeline & Motion — QA (Wave 2)

Run: `npx playwright test tests/s4.spec.ts --reporter=line` against the already-running dev
server at `http://localhost:5173` (no server started by this silo). All 7 committed checks below
are exercised against the real `src/timeline/**` module via `page.evaluate(() => import('/src/timeline/...ts'))`,
per SCOPE.md's testing instructions — not mocked, not re-derived from the implementation's own
ground truth (Codex review finding, `reviews/codex_review_S4.md` Q3).

Fixture `src/timeline/fixtures/easing_expected.json` (8 presets × 5 sample points = 40 values,
DECISIONS.md #14) was written and committed before this run.

| Check (quoted from SCOPE.md §1) | Target | Measured | PASS/FAIL |
|---|---|---|---|
| "Easing: 8 presets × 5 `t`-values within **1e-3** of the reference table" + DECISIONS.md #14 (`f(0)===0`, `f(1)===1` exactly, all 8) | 40/40 samples ≤1e-3 diff; 0 endpoint failures across 8 presets × 2 endpoints (16 checks) | `total=40 withinTolerance=40 endpointFailures=0` | PASS |
| "`sampleAt`: 100 calls at `t=1.234` are byte-identical" | 100 calls → 1 distinct JSON-serialized output | `distinctOutputs=1 of 100 calls` | PASS |
| "`exportRange(duration,36)` → `frames.length===36`, `frames[i].t===i*duration/36` for every `i`" | length=36, 0 `t` mismatches, adapter untouched (pure) | `frames.length=36 tMismatches=0 renderCallsDuringExport=0` | PASS |
| "Scrub: fixed keys `[0,0,0]@t=0`, `[2,4,6]@t=2`; after `scrubTo(1)` the scene object is `[1,2,3] ±1e-6` and `renderNow()` was called **exactly once**" (non-circular, independent scene assertion per `reviews/codex_review_S4.md:15`) | position within 1e-6 of `[1,2,3]`, `renderCalls===1` | `position=[1,2,3] renderCalls=1` (all 3 axes diff = 0) | PASS |
| "Keys round-trip: 50 random keys bit-identical after JSON round-trip" | `serialize()` before === `serialize()` after `loadState(JSON.parse(...))` | `bitIdentical=true` (5117-char serialized state, deterministic mulberry32-seeded keys) | PASS |
| "Scrub perf: `sampleAt` **<2 ms** for 20 tracks × 4 channels × 50 keys" | mean < 2 ms | `meanMs=0.0218` over 1000 iterations (`totalMs=21.80`) — ~92x inside budget | PASS |
| "Turntable: **3** quaternion keys at `t = 0, duration/2, duration` representing `0, π, 2π`; sample at `duration/2` yields rotation **π within 1e-6**" | `keyCount===3`; `|angle−π|≤1e-6` | `keyCount=3 angle=3.141592653589793 diffFromPi=0` | PASS |

## What could not be measured / was not attempted

- **Stretch (non-frame-exact character-clip triggering)** — not attempted. SCOPE's build order
  is "8 easing presets → sampleAt → exportRange → scrub → round-trip → perf → turntable, **then
  stop**." All 7 committed rows above are green, but implementing `AnimationMixer`-driven clip
  triggering is real additional surface (risk #1 in `src/timeline/SPEC.md`'s own risk list) and
  the build-order instruction takes priority over opportunistically starting stretch work this
  late. Recorded here rather than silently skipped.
- **`play()`/`pause()`** are implemented (rAF-driven playhead advance calling `scrubTo`, guarded
  for non-browser hosts) but carry no numeric acceptance check in SCOPE.md §1 and were not
  separately measured — no committed row depends on them.

## Frozen-interface fidelity

`src/timeline/types.d.ts` was written verbatim from `SCOPE.md §2 "S4 — src/timeline/types.d.ts"`
(byte-for-byte, including the two `// REVIEW` comments). No frozen signature was changed.
`attachTimeline(adapter: TimelineSceneAdapter)` is implemented against a trivial local adapter in
every test (a plain object with `applySampledFrame`/`renderNow`, per SCOPE's "do not wait for
S1, do not import it" instruction) — never against `src/viewer/**`, which this silo never reads
into its runtime code and never imports.

## Ownership discipline

Files created/edited this run, all inside the S4 grant (DECISIONS.md #20):
`src/timeline/types.d.ts`, `src/timeline/easing.ts`, `src/timeline/sampler.ts`,
`src/timeline/index.ts`, `src/timeline/fixtures/easing_expected.json`,
`src/timeline/qa/latest.md`, `tests/s4.spec.ts`. No other path touched. No git command run
(the Warden commits per DECISIONS.md #20). No dev server started (reused the one already running
on :5173).

## Safe for Assembly to wire

Yes. `attachTimeline` exactly matches the frozen `TimelineSceneAdapter` shape S1 is expected to
implement (`applySampledFrame(frame)`, `renderNow()`); `onChange` is implemented and available for
S2's undo/redo fold-in. No frozen-interface problems found.
