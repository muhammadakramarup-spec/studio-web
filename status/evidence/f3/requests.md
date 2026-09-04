# F3 → Shell agent: exact `main.ts` snippets for receipt/provenance wiring

Silo F3 does not write `src/app/main.ts` (ownership table, status/warden-log.md Decision W-2).
Everything below is copy-paste-ready against `main.ts` as it stands today, plus two items that
depend on other silos' still-in-progress work (F1's `exportSequence` options param and F1's
`plan.mode`; F2's project v2 `asset`/`environment.hdri` fields) — those are marked explicitly.

`src/viewer/receipt.ts` is finished and green (`status/evidence/f3/green-unit.txt`). Its public
surface: `buildReceipt`, `buildLicenceText`, `receiptFiles`, `createProvenanceRegistry`, and the
`ProvenanceAsset`/`ExportReceipt` types.

## 1. Import (top of `main.ts`, near the other `../project/format.ts` import)

```ts
import {
  buildReceipt,
  createProvenanceRegistry,
  receiptFiles,
  type ProvenanceAsset,
} from "../viewer/receipt.ts";
```

## 2. Create the registry

Anywhere after `const studio: StudioHandle = createStudio({ canvas });` (main.ts:97) and before
the library panel is mounted (main.ts:~508):

```ts
const provenance = createProvenanceRegistry();

function libraryAssetToProvenance(asset: LibraryAsset): ProvenanceAsset {
  return {
    id: asset.id,
    name: asset.name,
    kind: asset.kind as "model" | "hdri", // only reached for kind "model" | "hdri", see below
    source: asset.source,
    sourceUrl: asset.sourceUrl,
    licence: asset.licence,
    category: asset.category,
    fileBytes: asset.fileBytes,
    triangles: asset.triangles,
  };
}
```

Every field `buildReceipt`'s privacy guard checks (`asset.id`, `asset.name`, `asset.sourceUrl`)
is safe to pass straight from `LibraryAsset` — verified against the live manifest: all 2,280
entries have an `https://` `sourceUrl` and an `id` like `kenney/car-kit/ambulance` with no
backslash, drive-letter prefix, or `file:` prefix (checked with a one-off node script against
`public/assets/manifest.json`, not committed).

## 3. `onAssetPicked` — set provenance after each successful load (main.ts:507-524)

Replace the body of `mountLibraryPanel(libraryMount, { onAssetPicked: ... })` with:

```ts
mountLibraryPanel(libraryMount, {
  onAssetPicked: async (asset: LibraryAsset) => {
    try {
      if (asset.kind === "hdri") {
        setWorkspaceStatus(`Loading ${asset.name} lighting…`);
        await studio.loadEnvironment(asset.fileUrl, asset.name);
        setWorkspaceStatus(`${asset.name} lighting applied`);
        provenance.setEnvironment(libraryAssetToProvenance(asset));
      } else if (asset.kind === "model") {
        await studio.loadModel(asset.fileUrl, asset.name);
        provenance.setModel(libraryAssetToProvenance(asset));
      } else {
        setWorkspaceStatus("Material-library application is not available in this alpha yet.", true);
        return;
      }
      track({ type: "asset_loaded", assetKind: asset.kind, assetId: asset.id });
      refreshOutliner();
    } catch (err) {
      console.error("[app] failed to load library asset", asset.id, err);
      setWorkspaceStatus(`Could not load ${asset.name}: ${err instanceof Error ? err.message : String(err)}`, true);
    }
  },
});
```

(Only the two `provenance.set…` lines are new; everything else is unchanged.)

## 4. `loadLocalModel` — clear model provenance (main.ts:177-190)

A locally opened file must never end up in a receipt (product rule 4 / test X3). Add
`provenance.setModel(null)` to the success branch:

```ts
void studio.loadModel(file, file.name).then(() => {
  provenance.setModel(null);
  refreshOutliner();
  refreshMaterialPanel();
}).catch(() => {});
```

## 5. Environment control switching to room/studio — clear HDRI provenance

**Current state:** the only call site of `studio.setEnvironment(kind)` today is the project-open
path (main.ts:703): `studio.setEnvironment(project.viewer.environment === "hdr" ? "room" : project.viewer.environment)`.
There is no dedicated "Room"/"Studio" toggle button in `main.ts` yet — searched for `setEnvironment`,
`envKind`, and `"Room"`/`"Studio"` button labels across `src/app/main.ts` and `src/editor/*.ts` and
found none besides that one call site. Whichever call sets `kind` to `"room"` or `"studio"` (i.e.
not an HDRI) should also clear HDRI provenance:

```ts
studio.setEnvironment(project.viewer.environment === "hdr" ? "room" : project.viewer.environment);
if (project.viewer.environment !== "hdr") provenance.setEnvironment(null);
```

If a dedicated env toggle control is added later, add the same `provenance.setEnvironment(null)`
call at its "room"/"studio" branches.

## 6. Export buttons — attach receipts (main.ts:483-489)

Helper, placed near the export button definitions:

```ts
function buildExportExtras(
  kind: "blender-package" | "turntable",
  files: string[],
  frames?: { count: number; width: number; height: number; motion: "timeline" | "default-sweep" },
): { name: string; blob: Blob }[] {
  const assets = provenance.list();
  if (!assets.length) return [];
  const receipt = buildReceipt({ appVersion: __APP_VERSION__, kind, files, frames, assets });
  return receiptFiles(receipt);
}
```

Replace the two calls:

```ts
exportButton("Blender ZIP", "blender-package", "studio-blender-package.zip", () => {
  const extras = buildExportExtras("blender-package", [
    "studio-scene.glb",
    "studio-scene.gltf",
    "README-Blender.txt",
    "studio-web-receipt.json",
    "LICENCE.txt",
  ]);
  return studio.exportBlenderPackage(extras);
});

exportButton("Turntable", "turntable", "studio-turntable.zip", () => {
  const frameNames = Array.from({ length: 24 }, (_, i) => `frame_${String(i + 1).padStart(4, "0")}.png`);
  const extras = buildExportExtras(
    "turntable",
    [...frameNames, "studio-web-receipt.json", "LICENCE.txt"],
    { count: 24, width: 1024, height: 1024, motion: /* see coordination note below */ "default-sweep" },
  );
  return studio.exportSequence(
    "1024x1024",
    24,
    (fraction) => {
      exportStatus.textContent = `Exporting ${Math.round(fraction * 100)}%`;
    },
    { extraFiles: extras },
  );
});
```

**Coordination needed with F1** (`src/viewer/studio.ts`, `src/timeline/export-plan.ts`,
Decision W-2): `buildExportExtras`'s third argument needs the real `motion` value —
`"timeline"` when the export actually sampled authored timeline keys, `"default-sweep"` when it
used the independent rotation sweep. That value lives in whatever plan object F1's
`export-plan.ts` produces (referred to as `plan.mode` in the task brief). Once F1's Phase A gate
lands, swap the hardcoded `"default-sweep"` above for F1's real accessor (e.g. `plan.mode`) —
do not merge Phase B with the hardcoded value if F1 has already shipped the real one, since a
receipt claiming `"default-sweep"` for a timeline-sampled export would misrepresent the export.
`buildReceipt`'s empty-`assets` short-circuit (`if (!assets.length) return [];`) means
`exportBlenderPackage()`/`exportSequence(...)` are called with **no** `extraFiles` when nothing in
`provenance` was ever set — preserving the existing exact-3-entries / exact-24-frames contract
that `tests/exports.spec.ts` X1 and X3 (and F1's own turntable tests) depend on.

## 7. On project open — seed the registry (BLOCKED on F2's project v2 format)

Per the task brief: "seed the registry from `doc.asset` and `doc.environment.hdri` (silo F2
defines those v2 fields)." As of this evidence run, F2's Phase A work
(`src/project/format.ts` v2, `src/app/persist.ts`) is still red —
`tests/unit/project-v2.test.ts` and `tests/project-recovery.spec.ts` do not compile yet
(`status/evidence/f3/build.txt`), so the exact shape of `doc.asset` /
`doc.environment.hdri` is not committed. Intended wiring, to add once F2's format lands, near
main.ts:703 in the project-open handler:

```ts
provenance.setModel(project.asset ?? null);
provenance.setEnvironment(project.environment?.hdri ?? null);
```

Adjust field names/paths to match F2's final `ProjectDocumentV2` shape — if F2 stores something
other than a `ProvenanceAsset`-shaped object (e.g. a `LibraryAsset` or a partial record), map it
through `libraryAssetToProvenance` or an equivalent adapter first, and note that any imported
project's `doc.asset`/`doc.environment.hdri` must pass `buildReceipt`'s privacy guard the same as
a live library pick — a project saved on someone else's machine could otherwise smuggle a local
path into a later export.

---

# Baseline defect found while proving X1 (not F3's to fix)

**`tests/exports.spec.ts` "X1 — all five exports download as valid artifacts" fails today, before
any F3 code runs** (`status/evidence/f3/red-exports.txt`, reproduced again after F3's own changes
in `status/evidence/f3/green-exports.txt` — identical failure, confirming F3's work did not cause
or fix it):

```
Expected: 1024
Received: 840
```

Reproduced and root-caused in isolation (throwaway node scripts, not committed): when the
Turntable export runs **after** the PNG/GLB/GLTF/Blender-ZIP buttons have already been clicked in
the same page session, `frame_0001.png` comes out at the correct 1024×1024, but `frame_0002.png`
onward come out at ~840×463 — the live on-screen canvas size, not the fixed offscreen export
size. Calling `studio.exportSequence("1024x1024", N, onProgress)` directly (including with a real
`onProgress` that writes into `#export-status` on every frame) produces correct 1024×1024 frames
for every frame when nothing preceded it. The corruption only appears after the export-button
click cycle (`for (const item of exportButtons) item.disabled = true` / re-enable, on every
export) has run at least once first.

Root cause, as far as F3 could trace without editing `main.ts` or `studio.ts`:
`src/app/main.ts:101-109` registers a `ResizeObserver` on `canvas.parentElement` whose callback
(`resizeViewport`) calls `studio.resize()`, which re-derives the renderer size from the live
`canvas.clientWidth`/`clientHeight`. `beginOffscreen()`/`endOffscreen()` in `studio.ts` change the
renderer's drawing-buffer size without touching CSS layout, so they should not by themselves
trigger that observer — but the disable/re-enable churn of five toolbar buttons plus the changing
`exportStatus`/`appStatus` text on every prior export click appears to cause a layout size change
on `canvas.parentElement` that the browser only delivers to the `ResizeObserver` on a later
animation frame — one that lands *inside* the Turntable export's own `for` loop, between
`frame_0001` and `frame_0002`, exactly where `await raf()` yields. `studio.resize()` firing there
clobbers the fixed 1024×1024 set by `beginOffscreen()` for the remainder of that export.

This sits inside `src/viewer/studio.ts` (F1's file) and `src/app/main.ts`'s `ResizeObserver`
wiring (Shell's file) — outside F3's ownership, so F3 recorded it rather than fixing it, per the
task's "do not weaken the assertion" instruction. `tests/exports.spec.ts` X1 keeps the real
1024×1024-per-frame assertion; it is expected to stay red until F1 or Shell either (a) makes
`beginOffscreen`/`endOffscreen` resilient to an intervening resize (e.g. re-applying the offscreen
size after each `renderer.render` call, or temporarily unobserving/ignoring resize while
`exportBusy` is true), or (b) changes the per-frame progress UI so it can't perturb layout mid-export.
