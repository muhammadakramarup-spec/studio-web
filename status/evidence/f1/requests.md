# F1 → Shell agent — requests for `src/app/main.ts`

F1 owns `src/viewer/studio.ts` (export section), `src/timeline/sampler.ts`, and the new
`src/timeline/export-plan.ts` — not `src/app/main.ts`. This file has the exact snippet the Shell
agent (Wave 3 Phase B) needs to wire the Turntable button to `planSequence`, per
`docs/handoffs/2026-09-04-claude-design-product-v1-execution-handoff.md` Wave 3 Function 1.

## 1. New import

Add alongside the existing timeline import (`src/app/main.ts:19-20`):

```ts
import { planSequence } from "../timeline/export-plan.ts";
```

## 2. Replace `src/app/main.ts` lines 488-492 (the Turntable button)

Current code:

```ts
exportButton("Turntable", "turntable", "studio-turntable.zip", () =>
  studio.exportSequence("1024x1024", 24, (fraction) => {
    exportStatus.textContent = `Exporting ${Math.round(fraction * 100)}%`;
  }),
);
```

Replacement:

```ts
let lastTurntableMode: "timeline" | "default-sweep" = "default-sweep";

exportButton(
  "Turntable",
  "turntable",
  "studio-turntable.zip",
  () => {
    const plan = planSequence(timeline.getState(), 24);
    lastTurntableMode = plan.mode;
    const options =
      plan.mode === "timeline"
        ? { applyFrame: (i: number) => sceneAdapter.applySampledFrame(plan.frames[i]) }
        : undefined;
    return studio.exportSequence(
      "1024x1024",
      24,
      (fraction) => {
        exportStatus.textContent = `Exporting ${Math.round(fraction * 100)}%`;
      },
      options,
    );
  },
  () =>
    lastTurntableMode === "timeline"
      ? "Turntable ready (timeline)"
      : "Turntable ready (default 360° sweep — add keys with Turn 360°)",
);
```

`plan.mode` is `"timeline"` whenever any track/channel in `timeline.getState()` has at least one
authored key (per `src/timeline/export-plan.ts`'s `planSequence`); it is `"default-sweep"` for an
untouched timeline (e.g. before the user ever presses "Turn 360°"). `plan.duration` is deliberately
the max authored key `t`, not `state.duration` (see `src/timeline/export-plan.ts`'s comment — the
turntable clip leaves `state.duration` stale at 10 while writing keys at t=0..6).

`sceneAdapter` (declared at `src/app/main.ts:543`) already implements
`applySampledFrame(frame: SampledFrame): void`, so `plan.frames[i]` (each a `SampledFrame`) can be
passed straight through — no new adapter code needed.

## 3. Small addition to the `exportButton` helper (`src/app/main.ts:456-482`)

The generic helper always sets the completion message to `${label} ready`. The Turntable button
needs a completion message that depends on which sweep actually ran, decided only at click time —
so it needs one new optional 5th parameter, a thunk evaluated after the export blob resolves. This
keeps every OTHER `exportButton(...)` call site (PNG/GLB/GLTF/Blender ZIP) byte-identical.

Current signature (`src/app/main.ts:456-461`):

```ts
function exportButton(
  label: string,
  kind: ExportKind,
  filename: string,
  makeBlob: () => Promise<Blob>,
): void {
```

Replacement:

```ts
function exportButton(
  label: string,
  kind: ExportKind,
  filename: string,
  makeBlob: () => Promise<Blob>,
  readyText?: () => string,
): void {
```

And inside the button's click handler (`src/app/main.ts:468-471`), current code:

```ts
      const blob = await makeBlob();
      downloadBlob(blob, filename);
      exportStatus.textContent = `${label} ready`;
      setWorkspaceStatus(`${label} download ready`);
```

Replacement:

```ts
      const blob = await makeBlob();
      downloadBlob(blob, filename);
      const message = readyText ? readyText() : `${label} ready`;
      exportStatus.textContent = message;
      setWorkspaceStatus(readyText ? message : `${label} download ready`);
```

## 4. `extraFiles` — not requested here, noted for the receipt silo (F3)

`studio.exportSequence(res, frames, onProgress?, options?)` and
`studio.exportBlenderPackage(extraFiles?)` both accept `extraFiles: { name: string; blob: Blob }[]`
now (appended after the frame images / after `README-Blender.txt` respectively — see
`src/viewer/qa/latest.md`'s 2026-09-05 entry for the full signature and why it's non-breaking).
F1 is not wiring `extraFiles` into `main.ts` — that plugs in wherever F3's receipt/provenance
registry lands (Wave 3 Function 3, `src/viewer/zip.ts`/export-receipt helpers per the warden log's
Phase A ownership table). Whichever silo integrates F3's registry should extend the `options`
object literal above with `extraFiles: registry.filesFor(...)` (or similar) rather than adding a
separate export call.

## Evidence this snippet is safe

- `tests/export-timeline.spec.ts` (F1, new) — Test A proves `applyFrame`-driven export follows
  authored timeline keys within `1e-6` and restores the pivot transform exactly; Test C proves an
  `exportSequence` call with no 4th argument (what every OTHER export button still does) yields the
  unmodified legacy sweep. `status/evidence/f1/green-export-timeline.txt`.
- `tests/s1.spec.ts` Target 5 and `tests/e2e.spec.ts` Steps 5-6 (both call `exportSequence` with
  exactly 3 arguments, same as today) rerun unchanged and pass:
  `status/evidence/f1/regression-s1.txt`, `status/evidence/f1/regression-e2e.txt`.
