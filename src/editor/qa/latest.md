# S2 Editor — QA report (Wave 2)

Run: `npx playwright test tests/s2.spec.ts --reporter=line` — **9/9 passed**, deterministic across
repeated runs (seeded PRNG for the 50-op fuzz sequence; identical MEASURED numbers on rerun).

Every fixture is a minimal local three scene built by `tests/s2.spec.ts` itself (Scene,
PerspectiveCamera, WebGLRenderer with a real canvas, `setRenderHook` stub) — per HANDOFF, S2 does
not import `src/viewer/**`; S1's `StudioHandle` is consumed structurally via the local `StudioLike`
type in `src/editor/types.ts`. Assembly wires the real `StudioHandle` in Wave 3.

| Check (quoted from SCOPE.md §1) | Target | Measured | PASS/FAIL |
|---|---|---|---|
| Undo/redo build-order isolation gate: history stack built and tested alone, before any other target is wired through it (HANDOFF build order item 1) | execute/undo/redo round-trips a trivial op | afterExecute=5, afterUndo=0, afterRedo=5 | PASS |
| "Undo/redo: canonical serialization (hierarchy, types, visibility, transforms, materials, modifier params, post-FX state) round-trips exactly after 50 ops undo and 50 redo" | undo x50 == initial state; redo x50 == pre-undo state | undoCount=50/50, redoCount=50/50, undoMatchesInitial=true, redoMatchesPreUndo=true (afterOps had 3 objects from 1 seed mesh) | PASS |
| Selection — "outliner UUID set matches 5/5" | 5/5 | outlinerSetMatches=true, rows=5/5 | PASS |
| Selection — "each row selects its UUID 5/5" | 5/5 | rowSelectHits=5/5 | PASS |
| Selection — "3 fixed canvas coords select their mesh 3/3" | 3/3 | canvasPickHits=3/3 | PASS |
| Selection — "1 blank coord returns null" | true | blankReturnsNull=true | PASS |
| Gizmo translate — "position... delta within ±1e-3" | ≤1e-3 | \|0.6994614872324979 − 0.6994614872324978\| = 1.1e-16 | PASS |
| Gizmo translate — "canvas changed() ≥0.5% moved" | ≥0.5% | moved=8.07% | PASS |
| Gizmo rotate — "rotation... delta within ±1e-3" | ≤1e-3 | \|−2.7978459489299916 − (−2.7978459489299916)\| = 0 | PASS |
| Gizmo rotate — "canvas changed() ≥0.5% moved" | ≥0.5% | moved=6.02% | PASS |
| Gizmo scale — "scale... delta within ±1e-3" | ≤1e-3 | \|2 − 2.0000000000000004\| = 4.4e-16 | PASS |
| Gizmo scale — "canvas changed() ≥0.5% moved" | ≥0.5% | moved=3.75% | PASS |
| Add light — "object count of the requested type increases by exactly 1" | +1 | lightCountDelta=1 | PASS |
| Add light — "canvas diff passes changed() ≥0.5%" | ≥0.5% | lightMoved=13.20% | PASS |
| Add primitive — "object count... increases by exactly 1" | +1 | meshCountDelta=1 | PASS |
| Add primitive — "canvas diff passes changed() ≥0.5%" | ≥0.5% | primMoved=5.68% | PASS |
| Add camera — "count only" | +1 | camCountDelta=1 | PASS |
| Material — "roughness/metalness/colour drag → changed() ≥0.5%" | ≥0.5% | editMoved=9.28% | PASS |
| Material — "reset → same() ≤0.6 mean" | ≤0.6 | resetMean=0.000 | PASS |
| Mirror — "exactly 2× triangle count" | exact 2x | triBefore=12, triAfter=24 (24/12 = 2) | PASS |
| Mirror — "mirrored bbox negated within 1e-4" | ≤1e-4 | min-axis and max-axis both within 1e-4 (negatedMin=true, negatedMax=true); non-mirror axis unchanged | PASS |
| Array — "count = total visible instances incl. source" — count=1 | exactly 1 | countAt1=1, sceneCountAt1=1 | PASS |
| Array — count=5 | exactly 5 | countAt5=5, sceneCountAt5=5 | PASS |
| Array — "changed() between count=1 and count=5" | ≥0.5% | moved=5.45% | PASS |
| Bloom — "on/off passes changed() ≥0.5% moved, restricted to the emissive object's screen-space bounds, at fixed composer resolution" | ≥0.5% within bounds | movedInBounds=94.32% over a 256×256 region (padded emissive-object screen bbox); composer built once at renderer's current size, never resynced (fixed resolution, no S2-owned resize hook this wave) | PASS |

## Additional integration check run inline (not a separate SCOPE row)
Mirror undo restores the exact pre-mirror triangle count: triAfterUndo=12 (matches triBefore=12
exactly), confirming the mirror op's do()/undo() round-trips through the same history stack as
every other target (test 6, `tests/s2.spec.ts`).

## Build order followed exactly (HANDOFF)
1. Undo/redo command stack + `execute(op)` — built and isolation-tested first (`src/editor/history.ts`).
2. Selection (raycast + outliner) — `src/editor/selection.ts`.
3. `TransformControls` gizmos — `src/editor/gizmo.ts`.
4. Add light/camera/primitive — `src/editor/add.ts`.
5. PBR material panel — `src/editor/material.ts` (ports `reference/lamp360viewer.html:511-539`'s
   `prepMaterials` field set verbatim; reference file never edited).
6. Mirror modifier — `src/editor/modifiers.ts`.
7. Array modifier (count = total visible instances **including** the source, per
   `reviews/codex_review_S2.md:15`) — `src/editor/modifiers.ts`.
8. Bloom only via `UnrealBloomPass`, fixed composer resolution — `src/editor/postfx.ts`, hung off
   S1's `setRenderHook` seam (frozen in `src/editor/types.ts`'s local `StudioLike`).

Vignette/grade (stretch) were **not** built — bloom was the last committed target reached in the
time available, and per SCOPE.md the stretch is taken "only if bloom lands early." `PostFXPatch`
keeps the `vignette`/`grade` fields for forward-compat only (frozen shape, unused).

## Findings for Assembly / the Warden

1. **Frozen-interface note, not a deviation:** `EditorHandle` is implemented and exported from
   `src/editor/index.ts` exactly as SCOPE.md §2 specifies (`undo`, `redo`, `execute`, `ops.*`,
   `select`, `selection`, `outliner`) — no member added or removed. The object `attachEditor()`
   actually returns at runtime additionally carries a `__test` property (documented in
   `src/editor/types.ts` and `src/editor/index.ts`'s `EditorTestHooks`) so `tests/s2.spec.ts` can
   reach the canonical-state serializer, the gizmo's synthetic-drag driver, and modifier-clone
   accessors without re-implementing them. `__test` is not part of the frozen contract; no other
   silo's interface references it, and every typed consumer sees exactly `EditorHandle`.
2. **Outliner predicate (DECISIONS.md #13) implemented literally:** `outliner.list()` uses
   `obj.isMesh || obj.isLight || obj.isCamera`; `Group` objects are traversed through and never
   listed, and this is the exact predicate the selection fixture's 5/5 counts rely on
   (`src/editor/selection.ts`). Mirror/array clone meshes DO satisfy `isMesh` and so DO appear as
   outliner rows when present (not exercised by the fixed 5-object selection fixture, which has
   no modifiers applied) — a deliberate design choice, documented in `src/editor/state.ts`, that
   the canonical-state serializer used for undo/redo excludes those same clone objects (they are
   regenerated with a fresh uuid on every modifier rebuild, so including them in state equality
   would make undo/redo compare unstable derived identities instead of editor state; the
   modifier's params — axis/enabled/count/offset — are what the canonical state actually tracks).
3. **`setRenderHook` (S1) was not available to build against** — S1 had not yet produced
   `src/viewer/**` as of this run (only `src/viewer/SPEC.md` exists in the tree). Built and tested
   entirely against the local `StudioLike` structural type per HANDOFF instructions; nothing here
   depends on S1's file existing. No blocker filed — this is the intended Wave-2 build order, not
   an error.
4. **VRAM pixel-ratio cap (SPEC target 8's proposal)** was not implemented — `postfx.ts` does not
   special-case `renderer.setPixelRatio` when bloom is active. Flagged, not measured (SPEC itself
   labels this "an estimate, not measured — flag for QA"); no VRAM regression was observed in this
   session's headless runs, but that is not a real GPU/VRAM measurement.

## Safe for Assembly to wire
Yes. `attachEditor(studio: StudioLike)` (`src/editor/index.ts`) takes any object satisfying the
local `StudioLike` shape — a structural subset of S1's real `StudioHandle` — and every numeric
target above is green against that shape. No file outside `src/editor/**`, `tests/s2.spec.ts`, or
this QA note was touched.
