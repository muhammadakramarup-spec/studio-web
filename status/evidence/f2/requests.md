# F2 -> Shell integration requests (Wave 3 Function 2: project v2 + local recovery)

F2 owns `src/project/format.ts`, `src/project/scene.ts` (new), `src/app/persist.ts` (new), and the
one-line `userData.studioAdd` tag in `src/editor/add.ts`. Everything below is **not** F2's to
write — F2 must not touch `src/app/main.ts` or `index.html`. This file gives Shell exact snippets
and the reasoning behind them; adjust variable names to fit the surrounding code if it has moved.

New modules to import in `src/app/main.ts`:

```ts
import { captureScene, restoreScene } from "../project/scene.ts";
import { openRecoveryStore, createAutosaver } from "./persist.ts";
import type { RecoveryStore } from "./persist.ts";
import type { ProjectAsset, ProjectEnvironment, ProjectHDRI, ProjectDocumentV2 } from "../project/format.ts";
```

`format.ts`'s `createProjectDocument`/`parseProjectDocument` signatures are unchanged in shape —
same import line already in main.ts keeps working. `parseProjectDocument` now always returns a
`ProjectDocumentV2` (asset/environment/view/scene always present, defaulted when opening an old
v1 file), so the existing `project.viewer.*` reads in the open handler still work untouched.

## Module-level state to add (near `activeModelId`, around main.ts:155)

```ts
let currentAsset: ProjectAsset = null;
let currentHdri: ProjectHDRI | null = null;
let cachedModelBase64: { id: string; base64: string } | null = null;
```

`cachedModelBase64` avoids re-running `studio.exportActiveGLB()` (a real geometry re-serialize) on
every autosave tick when nothing about the active model's own bytes has changed. It is keyed by
`activeModelId` so a model swap invalidates it automatically; **also clear it explicitly** at every
call site that can change the exported model's own bytes — the three material-panel handlers
(`materialBody`'s color/roughness/metalness inputs and the "Reset material" button) and the Mirror
X / Array x5 button handlers below — by adding `cachedModelBase64 = null;` alongside the existing
`editor.ops.setMaterial/setMirror/setArray(...)` call. (Viewer-only controls — exposure, env
rotation, spin, focal — do not touch the exported model bytes and do not need to invalidate it.)

```ts
async function getActiveModelBase64(): Promise<string | null> {
  const active = studio.getActiveModel();
  if (!active) return null;
  if (cachedModelBase64 && cachedModelBase64.id === active.id) return cachedModelBase64.base64;
  const blob = await studio.exportActiveGLB();
  const base64 = await blobToBase64(blob);
  cachedModelBase64 = { id: active.id, base64 };
  return base64;
}
```

## (a) Shared document builder — used by both explicit Save and autosave

Extract the body of the current `saveProjectBtn` click handler into a standalone function so
autosave's `capture` callback can reuse it exactly (design requirement: "capture reusing the save
builder with the cached model base64 per activeModelId"):

```ts
async function buildProjectDocument(): Promise<ProjectDocumentV2 | null> {
  const active = studio.getActiveModel();
  if (!active) return null;
  const base64 = await getActiveModelBase64();
  if (base64 === null) return null;

  const vstate = studio.debug.state();
  const envKind = vstate.envKind as "room" | "studio" | "hdr";
  const environment: ProjectEnvironment = {
    kind: envKind,
    rotation: vstate.envRot as number,
    intensity: vstate.envInt as number,
    ...(envKind === "hdr" && currentHdri ? { hdri: currentHdri } : {}),
  };

  const bloomState = (editor as unknown as { __test?: { bloomState(): { enabled: boolean; strength: number; radius: number; threshold: number } } })
    .__test?.bloomState() ?? { enabled: false, strength: 1.2, radius: 0.4, threshold: 0.85 };
  const canonical = (editor as unknown as { __test?: { serializeState(): { objects: { uuid: string; modifiers: unknown }[] } } })
    .__test?.serializeState();
  const modifierByUuid = new Map((canonical?.objects ?? []).map((o) => [o.uuid, o.modifiers ?? undefined]));
  const scene = captureScene(studio.scene, (uuid: string) => modifierByUuid.get(uuid) as never, bloomState);

  return createProjectDocument({
    // Never persist the real filename for a locally opened model — see ProjectAssetLocal's doc
    // comment in format.ts and P4 in tests/project-recovery.spec.ts.
    name: currentAsset?.origin === "local" ? "Local model".replace(/\.glb$/i, "") : active.name.replace(/\.glb$/i, ""),
    savedAt: new Date().toISOString(),
    model: {
      name: currentAsset?.origin === "local" ? "Local model" : active.name,
      mime: "model/gltf-binary",
      base64,
    },
    viewer: currentViewerState(),
    timeline: timeline.getState(),
    asset: currentAsset,
    environment,
    view: {
      position: studio.camera.position.toArray() as [number, number, number],
      target: studio.controls.target.toArray() as [number, number, number],
      focal: vstate.focal as 24 | 35 | 50 | 85 | 135,
      exposure: vstate.expo as number,
    },
    scene,
  });
}
```

Notes:
- `captureScene`'s second parameter is typed `(uuid: string) => ModifierRecord | undefined`
  (`src/editor/state.ts`'s `ModifierRecord`) — the `as never` cast above is a placeholder because
  main.ts cannot import that type without also importing three.js-adjacent editor internals; feel
  free to replace it with a proper `import type { ModifierRecord } from "../editor/state.ts";` and
  drop the cast.
- `editor.__test` is not part of the frozen `EditorHandle` type (see `src/editor/types.ts`'s
  comment on `EditorTestHooks`) but S2 does attach it at runtime (`src/editor/index.ts:221`) and
  `tests/s2.spec.ts` already relies on it the same way — this is the only way to reach
  `readModifier`/bloom state through S2's frozen public surface.
- Replace the `saveProjectBtn` click handler's body with a call to `buildProjectDocument()`,
  keeping its existing disabled-state/status-message wrapping and the `downloadBlob(...)` call
  unchanged (it now downloads `JSON.stringify(project)` where `project` may be `null` — guard with
  the existing "Load a model before saving" early return).

## (b) Open handler — restore environment, view, and scene

After `await studio.loadModel(projectModelBlob(project), project.model.name);` and the existing
`studio.setFocalLength/setExposure` calls, replace the environment block:

```ts
if (project.environment.hdri) {
  await studio.loadEnvironment(project.environment.hdri.fileUrl, project.environment.hdri.name);
  currentHdri = project.environment.hdri;
} else {
  studio.setEnvironment(project.environment.kind === "hdr" ? "room" : project.environment.kind);
  currentHdri = null;
}
studio.setEnvRotation(project.environment.rotation);
studio.setEnvIntensity(project.environment.intensity);
```

This preserves the exact old downgrade behavior (`"hdr" -> "room"`) for a v1 file upgraded in
memory (its `environment.hdri` is always undefined, per format.ts's upgrade rule), while a real v2
save with a captured HDRI now restores the actual lighting.

Replace the two `studio.setFocalLength(project.viewer.focal)` / `studio.setExposure(...)` calls
(they can stay as a fallback) with a `view`-aware version:

```ts
if (project.view) {
  studio.camera.position.set(...project.view.position);
  studio.controls.target.set(...project.view.target);
  studio.controls.update();
  studio.setFocalLength(project.view.focal);
  studio.setExposure(project.view.exposure);
} else {
  studio.setFocalLength(project.viewer.focal);
  studio.setExposure(project.viewer.exposure);
}
```

Then, before `refreshOutliner(); refreshMaterialPanel();`, restore the scene and remember asset
identity:

```ts
currentAsset = project.asset;
cachedModelBase64 = null;
const restoredCount = restoreScene(project, editor);
console.info(`[app] restored ${restoredCount} authored scene object(s)`);
```

Drop the now-redundant `environmentNote` string (`"Custom HDR lighting is not embedded..."`) —
HDR lighting is embedded now when the project was saved after this change ships.

Also set `currentAsset = { origin: "local" };` at the top of `loadLocalModel(file)` (main.ts's
local `.glb` file-picker/drop path), and clear `currentHdri`/reset `cachedModelBase64` there too
since the model identity changed. In `onAssetPicked`'s `model` branch, set:

```ts
currentAsset = {
  origin: "library",
  id: asset.id,
  name: asset.name,
  kind: "model",
  source: asset.source,
  sourceUrl: asset.sourceUrl,
  licence: asset.licence,
  category: asset.category,
};
cachedModelBase64 = null;
```

and in the `hdri` branch:

```ts
currentHdri = {
  id: asset.id,
  name: asset.name,
  source: asset.source,
  sourceUrl: asset.sourceUrl,
  licence: asset.licence,
  fileUrl: asset.fileUrl,
};
```

## (c) Autosave wiring

Near boot, after `studio`/`editor`/`timeline` exist:

```ts
const recoveryStore: RecoveryStore | null = await openRecoveryStore();
const autosaver = recoveryStore
  ? createAutosaver({
      store: recoveryStore,
      capture: buildProjectDocument,
      onStatus: (message) => setWorkspaceStatus(message, true),
    })
  : null;
```

Call `autosaver?.markDirty()` after every editor op button (`+ Light`, `+ Camera`, `+ Box`,
`+ Sphere`, Mirror X, Array x5, Bloom, Undo, Redo), every viewer control that changes saved state
(view presets, Spin, and any exposure/environment/transparency/shadow/floor controls this wave
already has), every material-panel input, and every timeline change (`timeline.onChange(...)` if
available, else after `addTurntableClip`/scrub/play/pause). The cheapest correct approach: call it
once inside `refreshOutliner()` and `refreshMaterialPanel()` (already invoked after nearly every
mutating action in the current code) plus explicitly after `timeline.addTurntableClip(...)` and
inside `sceneAdapter.applySampledFrame`/scrub handlers if those aren't already covered.

`autosaver.dispose()` is not needed at any point in this wave (the studio never tears down its own
app shell today) — no cleanup call site to add.

## (d) Restore prompt on boot

Right after `setHint("idle");` near the top of `boot()`:

```ts
let pendingRestore: { savedAt: string; doc: ProjectDocumentV2 } | null = null;
if (recoveryStore) {
  pendingRestore = await recoveryStore.load();
}
```

Extend `setHint`'s `"idle"` branch (it currently clears and rebuilds `viewportHint` from scratch)
to re-append a restore line whenever `pendingRestore` is still set — put this check at the very end
of the `"idle"` branch, after the existing `button` is appended, so any later call to
`setHint("idle")` (e.g. after a failed load) keeps showing it until the user acts:

```ts
if (pendingRestore) {
  const savedTime = new Date(pendingRestore.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const restoreLine = el("div", "restore-prompt");
  restoreLine.appendChild(el("span", undefined, `Unsaved work from ${savedTime} can be restored`));
  const restoreBtn = el("button", undefined, "Restore");
  restoreBtn.type = "button";
  const discardBtn = el("button", undefined, "Discard");
  discardBtn.type = "button";
  restoreBtn.addEventListener("click", () => void restoreFromRecord(pendingRestore!));
  discardBtn.addEventListener("click", () => {
    pendingRestore = null;
    void recoveryStore?.clear();
    setHint("idle");
  });
  restoreLine.appendChild(restoreBtn);
  restoreLine.appendChild(discardBtn);
  viewportHint.appendChild(restoreLine);
  setWorkspaceStatus(`Unsaved work from ${savedTime} is available to restore.`);
}
```

`restoreFromRecord` should run exactly the same steps as the project-file open handler (b) above —
factor the open handler's body (from `await studio.loadModel(projectModelBlob(project), ...)`
through `restoreScene(project, editor)` and the final `refreshOutliner()`/`refreshMaterialPanel()`/
`renderTimelineKeys()`) into a shared `async function applyProjectDocument(project: ProjectDocumentV2)`
that both the file-input handler and `restoreFromRecord` call, so Restore and "Open project" can
never drift apart:

```ts
async function restoreFromRecord(record: { savedAt: string; doc: ProjectDocumentV2 }): Promise<void> {
  pendingRestore = null;
  try {
    await applyProjectDocument(record.doc);
    setWorkspaceStatus("Unsaved work restored.");
  } catch (error) {
    setWorkspaceStatus(`Could not restore: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}
```

## (e) WebGL context loss / restoration

Near the S1 viewport wiring (canvas is already `byId<HTMLCanvasElement>("viewport")`):

```ts
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault(); // required so the browser will actually fire webglcontextrestored later
  const savedTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  setWorkspaceStatus(`Graphics context lost — your work was autosaved at ${savedTime}. Reload to restore.`, true);
  viewportError.textContent = `Graphics context lost — your work was autosaved at ${savedTime}. Reload to restore.`;
  for (const button of exportButtons) button.disabled = true;
});
canvas.addEventListener("webglcontextrestored", () => {
  setWorkspaceStatus("Graphics context restored.");
  viewportError.hidden = true;
  studio.debug.renderOnce();
  for (const button of exportButtons) button.disabled = !studio.getActiveModel();
});
```

`tests/project-recovery.spec.ts`'s P3 asserts `#viewport-error` becomes visible and contains
"context lost" (case-insensitive) on `webglcontextlost`, then hides again on
`webglcontextrestored` — `setWorkspaceStatus(message, true)` already sets
`viewportError.hidden = false` and `viewportError.textContent = message`, so the explicit
`viewportError.textContent = ...` line above is redundant with that call but kept for clarity; feel
free to drop it if `setWorkspaceStatus` already covers it exactly.

An actual autosave flush on context loss (rather than relying on the last debounced save) would be
even safer — consider calling `autosaver?.flush()` at the top of the `webglcontextlost` handler
before the status message, if `capture()`'s reads (`studio.scene`, `studio.debug.state()`) are
still safe to call after context loss (F2 did not verify this against F1/S1's internals — Shell
should check before relying on it).

## Concurrency note

`tests/unit/export-plan.test.ts` (F1) and `tests/unit/receipt.test.ts` (F3) were both transiently
failing when F2's red-unit.txt was captured (concurrent silos still mid-edit); by green-unit.txt
both had resolved on their own with no action from F2. Not an F2 defect.
