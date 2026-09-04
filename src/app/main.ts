// src/app/main.ts — Assembly (Wave 3) shell.
//
// Wires the six silos into one studio, in the SCOPE.md §3 build order:
// S1 (viewer) -> S3 (library) -> S2 (editor) -> S4 (timeline) -> S5 (account) -> S6 (AI).
// Every silo's frozen public surface (SCOPE.md §2) is consumed exactly as signed; nothing here
// reaches into a silo's internals. Ownership: src/app/**, index.html (DECISIONS.md #20).
import "./style.css";

import type * as THREE from "three";
import { createStudio } from "../viewer/studio.ts";
import type { StudioHandle } from "../viewer/studio.ts";

import { attachEditor } from "../editor/index.ts";
import type { EditorHandle } from "../editor/index.ts";
import type { ModifierRecord } from "../editor/state.ts";

import { mountLibraryPanel } from "../library/index.ts";
import type { LibraryAsset } from "../library/manifest";

import { attachTimeline } from "../timeline/index.ts";
import type { TimelineHandle, TimelineSceneAdapter, SampledFrame } from "../timeline/index.ts";
import { planSequence, type ExportPlanMode } from "../timeline/export-plan.ts";

import { track } from "../account/index.ts";
import {
  blobToBase64,
  createProjectDocument,
  parseProjectDocument,
  projectModelBlob,
} from "../project/format.ts";
import type { ProjectAsset, ProjectEnvironment, ProjectHDRI, ProjectDocumentV2 } from "../project/format.ts";
import { captureScene, restoreScene } from "../project/scene.ts";

import { openRecoveryStore, createAutosaver } from "./persist.ts";
import type { RecoveryStore, Autosaver } from "./persist.ts";

import {
  buildReceipt,
  createProvenanceRegistry,
  receiptFiles,
  type ProvenanceAsset,
} from "../viewer/receipt.ts";

// -------------------------------------------------------------------- helpers

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`[app] missing mount point #${id} — index.html was edited?`);
  return found as T;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function showFatalBootError(error: unknown): void {
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = "";
  const card = el("main", "fatal-card");
  card.setAttribute("role", "alert");
  card.setAttribute("aria-labelledby", "fatal-title");
  const title = el("h1", undefined, "This browser cannot start the 3D studio");
  title.id = "fatal-title";
  card.appendChild(title);
  card.appendChild(
    el(
      "p",
      undefined,
      "Studio Web needs WebGL 2 and hardware acceleration. Enable graphics acceleration or try a current Chrome, Edge, Firefox, or Safari browser.",
    ),
  );
  const detail = el("p", "fatal-detail", error instanceof Error ? error.message : "WebGL initialization failed");
  card.appendChild(detail);
  app.appendChild(card);
}

// Runtime-only surface S2 attaches at src/editor/index.ts:221 (EditorTestHooks), not part of the
// frozen EditorHandle type (src/editor/types.ts). This is the only way to reach the modifier
// reader / bloom state needed to build a v2 project document — see status/evidence/f2/requests.md.
interface EditorRuntimeHooks {
  bloomState(): { enabled: boolean; strength: number; radius: number; threshold: number };
  serializeState(): { objects: { uuid: string; modifiers: ModifierRecord | null }[] };
}

async function boot(): Promise<void> {

// ============================================================== 1) S1 viewer

const canvas = byId<HTMLCanvasElement>("viewport");
const viewportHint = byId<HTMLDivElement>("viewport-hint");
const viewportError = byId<HTMLDivElement>("viewport-error");
const appStatus = byId<HTMLDivElement>("app-status");
const openModelBtn = byId<HTMLButtonElement>("open-model-btn");
const emptyOpenModelBtn = byId<HTMLButtonElement>("empty-open-model-btn");
const modelFileInput = byId<HTMLInputElement>("model-file-input");
const saveProjectBtn = byId<HTMLButtonElement>("save-project-btn");
const studio: StudioHandle = createStudio({ canvas });
// Exposed for manual QA/devtools inspection AND for the two tests/e2e.spec.ts cases that must
// drive the real app shell rather than a synthetic instance: the export-format test and the
// bloom clip regression. The silo tests (s1..s6) and the SCOPE §6 acceptance run build their own
// studio via window.__e2e_studio instead. Do not remove this global — two tests read it.
(window as unknown as { __studio?: StudioHandle }).__studio = studio;

// Wave 3 Phase B: module-level state shared by save/autosave/export/provenance wiring below.
// Declared here — before any `await` in this function — so the WebGL context-loss listeners
// attached immediately below (which must survive a context loss arriving at any point after
// __studio is exposed to the page, including during the async recovery-store lookup a few lines
// down) always close over an already-initialized exportButtons/lastAutosaveAt, never one still in
// its temporal dead zone.
let currentAsset: ProjectAsset = null;
let currentHdri: ProjectHDRI | null = null;
let cachedModelBase64: { id: string; base64: string } | null = null;
let lastAutosaveAt: Date | null = null;
const exportButtons: HTMLButtonElement[] = [];
const provenance = createProvenanceRegistry();

canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault(); // three.js already does this internally; harmless to repeat here too.
  const savedTime = lastAutosaveAt
    ? lastAutosaveAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "not yet";
  setWorkspaceStatus(`Graphics context lost — your work was autosaved at ${savedTime}. Reload to restore.`, true);
  for (const button of exportButtons) button.disabled = true;
});
canvas.addEventListener("webglcontextrestored", () => {
  setWorkspaceStatus("Graphics context restored");
  studio.debug.renderOnce();
  for (const button of exportButtons) button.disabled = !studio.getActiveModel();
});

function resizeViewport(): void {
  const wrap = canvas.parentElement as HTMLElement;
  canvas.style.width = `${wrap.clientWidth}px`;
  canvas.style.height = `${wrap.clientHeight}px`;
  studio.resize();
}
window.addEventListener("resize", resizeViewport);
const viewportResizeObserver = new ResizeObserver(resizeViewport);
viewportResizeObserver.observe(canvas.parentElement as HTMLElement);
resizeViewport();

// The viewport hint must always reflect real state (Wave 3 finding): it must never be a static
// "Loading studio…" string left in the DOM forever with nothing tied to it. Three real states:
// "idle" (studio ready, nothing loaded yet — tells the visitor what to do), "loading" (a model
// is actively being fetched/parsed), and "loaded" (hidden entirely — a model is in the scene).
const HINT_LOADING = "Loading model…";

function setHint(state: "idle" | "loading" | "loaded", text?: string): void {
  viewportHint.dataset.state = state;
  if (state === "loaded") {
    viewportHint.hidden = true;
    return;
  }
  viewportHint.hidden = false;
  if (state === "loading") {
    viewportHint.textContent = text ?? HINT_LOADING;
    return;
  }
  viewportHint.innerHTML = "";
  viewportHint.appendChild(el("strong", undefined, "Start with a GLB"));
  viewportHint.appendChild(el("span", undefined, text ?? "Drop it here, open a file, or choose from the library."));
  const button = el("button", undefined, "Open a GLB");
  button.type = "button";
  button.addEventListener("click", () => modelFileInput.click());
  viewportHint.appendChild(button);
  // Wave 3 Phase B: a pending local-recovery record re-appends this line on every idle render
  // (not just the first) so it survives a later setHint("idle") call — e.g. after a failed model
  // load — until the visitor actually acts on it.
  if (pendingRestore) {
    const savedTime = new Date(pendingRestore.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const message = `Unsaved work from ${savedTime} can be restored`;
    const restoreLine = el("p", "restore-prompt");
    restoreLine.appendChild(el("span", undefined, message));
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
    setWorkspaceStatus(message);
  }
}

function setWorkspaceStatus(message: string, error = false): void {
  appStatus.textContent = message;
  appStatus.dataset.state = error ? "error" : "status";
  viewportError.hidden = !error;
  if (error) viewportError.textContent = message;
}

// Wave 3 Phase B: local recovery store / pending-restore / autosaver state. Declared as `let`
// (not `const`) and initialized to null HERE — before setHint's first call below and before
// refreshOutliner()/refreshMaterialPanel() make their first call further down (both of which call
// autosaver?.markDirty(), safe as a no-op while still null) — then populated by the IIFE below
// without blocking the rest of boot(). Blocking here (an early `await openRecoveryStore()`) was
// tried and reverted: it measurably delayed every later synchronous step of boot(), including
// mounting the S3 library panel, enough to shift its thumbnail image requests later — into the
// network-recording window of an unrelated existing test (tests/s6.spec.ts's generation
// round-trip, which asserts zero network calls during generation). IndexedDB opens fast enough
// that the tiny delay before a real pending-restore record can show up costs nothing in practice.
let recoveryStore: RecoveryStore | null = null;
let pendingRestore: { savedAt: string; doc: ProjectDocumentV2 } | null = null;
let autosaver: Autosaver | null = null;
void (async () => {
  recoveryStore = await openRecoveryStore();
  if (!recoveryStore) return;
  pendingRestore = await recoveryStore.load();
  autosaver = createAutosaver({
    store: recoveryStore,
    capture: captureForAutosave,
    onStatus: (message) => setWorkspaceStatus(message, true),
  });
  // Re-render the idle hint now that a pending restore is known, in case the first setHint("idle")
  // call below already ran before this resolved. Guarded on the hint still being idle so this
  // never clobbers a "loading"/"loaded" transition that happened in the meantime.
  if (pendingRestore && viewportHint.dataset.state === "idle") setHint("idle");
})();

// createStudio() has no real async boot step — no network fetch happens until loadModel is
// called — so the studio is genuinely ready as soon as this line runs. The hint reflects that
// immediately instead of the old static "Loading studio…" text that nothing ever cleared.
setHint("idle");

// Every load path (library pick, AI generation, avatar tile — and anything wired later) goes
// through this one wrapped loadModel, so "a model is in the scene" can never drift out of sync
// with one call site forgetting to update the hint — the wave-3 bug the Warden found: the
// static hint text was never tied to any real state at all, so it read "Loading studio…"
// forever even after the studio finished booting and was actively rendering.
const rawLoadModel = studio.loadModel.bind(studio);
let activeModelId: string | null = null;
studio.loadModel = (async (source: File | Blob | string, name?: string) => {
  setHint("loading");
  setWorkspaceStatus(`Loading ${name ?? "model"}…`);
  try {
    const previousId = activeModelId;
    const handle = await rawLoadModel(source, name);
    activeModelId = handle.id;
    if (previousId && previousId !== handle.id) studio.removeModel(previousId);
    setHint("loaded");
    saveProjectBtn.disabled = false;
    for (const button of exportButtons) button.disabled = false;
    setWorkspaceStatus(`${handle.name} ready`);
    autosaver?.markDirty();
    return handle;
  } catch (err) {
    setHint("idle");
    setWorkspaceStatus(`Could not load ${name ?? "that model"}: ${err instanceof Error ? err.message : String(err)}`, true);
    throw err;
  }
}) as StudioHandle["loadModel"];

function loadLocalModel(file: File): void {
  const isGlb = file.name.toLowerCase().endsWith(".glb") || file.type === "model/gltf-binary";
  if (!isGlb) {
    setWorkspaceStatus("Choose a binary glTF file ending in .glb.", true);
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    setWorkspaceStatus("That file is over the 50 MB local import limit.", true);
    return;
  }
  // Decision W-5 (status/warden-log.md): a locally opened file's own name may live in the local
  // project file / local recovery record (both stay on the user's machine) — File.name never
  // carries a directory, only the basename — but the asset it came from is not a library pick, so
  // it must never contribute provenance to an export receipt.
  currentAsset = { origin: "local" };
  currentHdri = null;
  cachedModelBase64 = null;
  void studio.loadModel(file, file.name).then(() => {
    provenance.setModel(null);
    refreshOutliner();
    refreshMaterialPanel();
  }).catch(() => {});
}

openModelBtn.addEventListener("click", () => modelFileInput.click());
emptyOpenModelBtn.addEventListener("click", () => modelFileInput.click());
modelFileInput.addEventListener("change", () => {
  const file = modelFileInput.files?.[0];
  if (file) loadLocalModel(file);
  modelFileInput.value = "";
});
for (const eventName of ["dragenter", "dragover"] as const) {
  canvas.parentElement?.addEventListener(eventName, (event) => {
    event.preventDefault();
    canvas.parentElement?.classList.add("is-dragging");
  });
}
canvas.parentElement?.addEventListener("dragleave", () => canvas.parentElement?.classList.remove("is-dragging"));
canvas.parentElement?.addEventListener("drop", (event) => {
  event.preventDefault();
  canvas.parentElement?.classList.remove("is-dragging");
  const file = event.dataTransfer?.files[0];
  if (file) loadLocalModel(file);
});

// ============================================================ 2) S2 editor

// StudioHandle is structurally a superset of S2's local StudioLike (scene, camera, renderer,
// controls, setRenderHook) — passed directly, no adapter needed.
const editor: EditorHandle = attachEditor(studio);

// -------- outliner (#panel-outliner)
const outlinerRoot = byId<HTMLElement>("panel-outliner");
const outlinerTitle = el("h2", "panel-title", "Scene");
outlinerTitle.id = "outliner-title";
outlinerRoot.appendChild(outlinerTitle);
const outlinerList = el("ul", "outliner-list");
outlinerRoot.appendChild(outlinerList);

function refreshOutliner(): void {
  outlinerList.innerHTML = "";
  const rows = editor.outliner.list();
  if (rows.length === 0) {
    outlinerList.appendChild(el("li", "empty-hint", "Nothing in the scene yet"));
  } else {
    for (const row of rows) {
      const li = el("li");
      const button = el("button", "outliner-row");
      button.type = "button";
      if (editor.selection === row.object) button.classList.add("selected");
      button.appendChild(el("span", undefined, row.name || row.type));
      button.appendChild(el("span", "type-badge", row.type));
      button.addEventListener("click", () => {
        editor.select(row.object);
        refreshOutliner();
        refreshMaterialPanel();
        setSelectionActionState();
      });
      li.appendChild(button);
      outlinerList.appendChild(li);
    }
  }
  // Cheapest-correct autosave trigger (status/evidence/f2/requests.md (c)): refreshOutliner runs
  // after nearly every scene-mutating action (add, undo/redo, mirror/array, project open/restore),
  // so marking dirty here covers all of them from one place instead of every call site.
  autosaver?.markDirty();
}

// -------- material panel (#panel-material)
const materialRoot = byId<HTMLElement>("panel-material");
const materialTitle = el("h2", "panel-title", "Material");
materialTitle.id = "material-title";
materialRoot.appendChild(materialTitle);
const materialBody = el("div");
materialRoot.appendChild(materialBody);

function refreshMaterialPanel(): void {
  materialBody.innerHTML = "";
  const sel = editor.selection as (THREE.Object3D & { isMesh?: boolean; material?: unknown }) | null;
  if (!sel || !sel.isMesh) {
    materialBody.appendChild(el("div", "empty-hint", "Select a mesh to edit its material"));
    autosaver?.markDirty();
    return;
  }
  const mat = Array.isArray(sel.material) ? sel.material[0] : sel.material;
  const std = mat as { color?: { getHexString(): string }; roughness?: number; metalness?: number };

  const colorRow = el("div", "row");
  const colorLabel = el("label", undefined, "Color");
  const colorInput = document.createElement("input");
  colorInput.id = "material-color";
  colorInput.type = "color";
  colorLabel.htmlFor = colorInput.id;
  colorRow.appendChild(colorLabel);
  colorInput.value = `#${std.color?.getHexString() ?? "ffffff"}`;
  colorInput.addEventListener("input", () => {
    editor.ops.setMaterial(sel, { color: parseInt(colorInput.value.slice(1), 16) });
    cachedModelBase64 = null;
    autosaver?.markDirty();
    track({ type: "effect_applied", effect: "material-color" });
  });
  colorRow.appendChild(colorInput);
  materialBody.appendChild(colorRow);

  function slider(labelText: string, value: number, onInput: (v: number) => void): void {
    const row = el("div", "row");
    const label = el("label", undefined, labelText);
    const input = document.createElement("input");
    input.id = `material-${labelText.toLowerCase()}`;
    label.htmlFor = input.id;
    row.appendChild(label);
    input.type = "range";
    input.min = "0";
    input.max = "1";
    input.step = "0.01";
    input.value = String(value);
    input.addEventListener("input", () => {
      onInput(parseFloat(input.value));
      cachedModelBase64 = null;
      autosaver?.markDirty();
    });
    row.appendChild(input);
    materialBody.appendChild(row);
  }
  slider("Roughness", std.roughness ?? 0.5, (v) => editor.ops.setMaterial(sel, { roughness: v }));
  slider("Metalness", std.metalness ?? 0, (v) => editor.ops.setMaterial(sel, { metalness: v }));

  const resetBtn = el("button", "field-btn", "Reset material");
  resetBtn.addEventListener("click", () => {
    editor.ops.setMaterial(sel, { color: 0xffffff, roughness: 0.5, metalness: 0, emissiveIntensity: 0 });
    cachedModelBase64 = null;
    refreshMaterialPanel();
  });
  materialBody.appendChild(resetBtn);
  autosaver?.markDirty();
}

// Editor's own canvas picking listens on 'pointerdown'; a 'pointerup' listener added after
// attachEditor() runs strictly later in the same synchronous dispatch order, so selection is
// already updated by the time this fires.
canvas.addEventListener("pointerup", () => {
  refreshOutliner();
  refreshMaterialPanel();
  setSelectionActionState();
});

refreshOutliner();
refreshMaterialPanel();

// -------- toolbar (#toolbar) — editor ops, viewer view/export controls
const toolbar = byId<HTMLElement>("toolbar");

function tbGroup(label: string): HTMLDivElement {
  const g = el("div", "tb-group");
  g.setAttribute("role", "group");
  g.setAttribute("aria-label", label);
  toolbar.appendChild(g);
  return g;
}
function tbButton(group: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", onClick);
  group.appendChild(b);
  return b;
}

const histGroup = tbGroup("History");
tbButton(histGroup, "Undo", () => {
  editor.undo();
  cachedModelBase64 = null;
  refreshOutliner();
  refreshMaterialPanel();
});
tbButton(histGroup, "Redo", () => {
  editor.redo();
  cachedModelBase64 = null;
  refreshOutliner();
  refreshMaterialPanel();
});

const addGroup = tbGroup("Add to scene");
tbButton(addGroup, "+ Light", () => {
  const obj = editor.ops.add({ kind: "light-point", at: [2.5, 3, 2.5] });
  editor.select(obj);
  track({ type: "tool_used", tool: "add-light-point" });
  refreshOutliner();
  refreshMaterialPanel();
});
tbButton(addGroup, "+ Camera", () => {
  editor.ops.add({ kind: "camera" });
  track({ type: "tool_used", tool: "add-camera" });
  refreshOutliner();
});
tbButton(addGroup, "+ Box", () => {
  const obj = editor.ops.add({ kind: "primitive-box", at: [0, 0.5, 0] });
  editor.select(obj);
  track({ type: "tool_used", tool: "add-primitive-box" });
  refreshOutliner();
  refreshMaterialPanel();
});
tbButton(addGroup, "+ Sphere", () => {
  const obj = editor.ops.add({ kind: "primitive-sphere", at: [0, 0.5, 0] });
  editor.select(obj);
  track({ type: "tool_used", tool: "add-primitive-sphere" });
  refreshOutliner();
  refreshMaterialPanel();
});

const modGroup = tbGroup("Modifiers");
let mirrorOn = false;
const mirrorBtn = tbButton(modGroup, "Mirror X", () => {
  if (!editor.selection) {
    setWorkspaceStatus("Select an object before adding a mirror modifier.", true);
    return;
  }
  mirrorOn = !mirrorOn;
  editor.ops.setMirror(editor.selection, "x", mirrorOn);
  cachedModelBase64 = null;
  mirrorBtn.classList.toggle("active", mirrorOn);
  mirrorBtn.setAttribute("aria-pressed", String(mirrorOn));
  refreshOutliner();
});
mirrorBtn.setAttribute("aria-pressed", "false");
const arrayBtn = tbButton(modGroup, "Array x5", () => {
  if (!editor.selection) {
    setWorkspaceStatus("Select an object before creating an array.", true);
    return;
  }
  editor.ops.setArray(editor.selection, 5, [1.2, 0, 0]);
  cachedModelBase64 = null;
  refreshOutliner();
});
mirrorBtn.disabled = true;
arrayBtn.disabled = true;

function setSelectionActionState(): void {
  const hasSelection = editor.selection !== null;
  mirrorBtn.disabled = !hasSelection;
  arrayBtn.disabled = !hasSelection;
}

const fxGroup = tbGroup("Effects");
let bloomOn = false;
// Retuned (Warden finding, Wave 3): a plain white/light Kenney model under the default studio
// lighting already reads bright, so S2's own demo-fixture-tuned defaults (threshold 0.6-0.88,
// strength 0.6-1.2 -- deliberately hot in src/editor/postfx.ts's own DEFAULT_BLOOM and its test's
// synthetic emissive box) blow the whole body out to near-solid white here. High threshold (only
// genuinely near-clipped highlights qualify) + low strength/radius (glow stays tight, doesn't
// bleed across the frame) keeps the silhouette, panel lines, and colour details readable while
// still visibly glowing. Measured on kenney/car-kit/ambulance (tests/e2e.spec.ts's own numeric
// guard): 25.50% of in-bounds pixels fully clipped (>=250 R/G/B) at the old 0.6/0.4/0.88 values,
// 0.00% at these. Tune by eye against that model, not by chasing a number.
const bloomBtn = tbButton(fxGroup, "Bloom", () => {
  bloomOn = !bloomOn;
  editor.ops.setPostFX({ bloom: { enabled: bloomOn, strength: 0.15, radius: 0.15, threshold: 0.99 } });
  bloomBtn.classList.toggle("active", bloomOn);
  bloomBtn.setAttribute("aria-pressed", String(bloomOn));
  track({ type: "effect_applied", effect: "bloom" });
  autosaver?.markDirty();
});
bloomBtn.setAttribute("aria-pressed", "false");

const viewGroup = tbGroup("View");
for (const preset of [0, 90, 180, 270, "top"] as const) {
  tbButton(viewGroup, typeof preset === "number" ? `${preset}°` : "Top", () => {
    studio.setView(preset);
    autosaver?.markDirty();
  });
}
let spinOn = false;
const spinBtn = tbButton(viewGroup, "Spin", () => {
  spinOn = !spinOn;
  studio.setSpin(spinOn, 30);
  spinBtn.classList.toggle("active", spinOn);
  spinBtn.setAttribute("aria-pressed", String(spinOn));
  autosaver?.markDirty();
});
spinBtn.setAttribute("aria-pressed", "false");

const exportGroup = tbGroup("Export");
const exportStatus = el("span", undefined, "");
exportStatus.id = "export-status";
exportStatus.setAttribute("role", "status");
exportStatus.setAttribute("aria-live", "polite");
type ExportKind = "still" | "turntable" | "glb" | "gltf" | "blender-package";

function exportButton(
  label: string,
  kind: ExportKind,
  filename: string,
  makeBlob: () => Promise<Blob>,
  readyText?: () => string,
): void {
  const button = tbButton(exportGroup, label, async () => {
    const t0 = performance.now();
    for (const item of exportButtons) item.disabled = true;
    exportStatus.textContent = `Exporting ${label}…`;
    setWorkspaceStatus(`Exporting ${label}…`);
    try {
      const blob = await makeBlob();
      downloadBlob(blob, filename);
      const message = readyText ? readyText() : `${label} ready`;
      exportStatus.textContent = message;
      setWorkspaceStatus(readyText ? message : `${label} download ready`);
      track({ type: "export_completed", exportKind: kind, ms: performance.now() - t0 });
    } catch (error) {
      exportStatus.textContent = "Export failed";
      setWorkspaceStatus(`Could not export ${label}: ${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      for (const item of exportButtons) item.disabled = !studio.getActiveModel();
    }
  });
  button.disabled = true;
  exportButtons.push(button);
}

// Wave 3 Function 3 (F3, status/evidence/f3/requests.md §6): attaches a machine- and
// human-readable receipt (studio-web-receipt.json + LICENCE.txt) to a package export whenever it
// used at least one CC0 library asset (model and/or HDRI). Returns [] — contributing zero extra
// ZIP entries — when nothing in `provenance` was ever set, preserving the exact-3-entries /
// exact-24-frames contract for a purely local/default session (tests/exports.spec.ts X3).
function buildExportExtras(
  kind: "blender-package" | "turntable",
  files: string[],
  frames?: { count: number; width: number; height: number; motion: ExportPlanMode },
): { name: string; blob: Blob }[] {
  const assets = provenance.list();
  if (!assets.length) return [];
  const receipt = buildReceipt({ appVersion: __APP_VERSION__, kind, files, frames, assets });
  return receiptFiles(receipt);
}

exportButton("PNG", "still", "studio-export.png", () => studio.exportPNG("2048x2048"));
exportButton("GLB", "glb", "studio-scene.glb", () => studio.exportGLB());
exportButton("GLTF", "gltf", "studio-scene.gltf", () => studio.exportGLTF());
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

// F1 wiring (status/evidence/f1/requests.md): the Turntable export samples the authored timeline
// when any track/channel has a key, falling back to the built-in linear sweep otherwise. The
// completion message reports which sweep actually ran, decided only at click time.
let lastTurntableMode: ExportPlanMode = "default-sweep";
exportButton(
  "Turntable",
  "turntable",
  "studio-turntable.zip",
  () => {
    const plan = planSequence(timeline.getState(), 24);
    lastTurntableMode = plan.mode;
    const frameNames = Array.from({ length: 24 }, (_, i) => `frame_${String(i + 1).padStart(4, "0")}.png`);
    const extras = buildExportExtras(
      "turntable",
      [...frameNames, "studio-web-receipt.json", "LICENCE.txt"],
      { count: 24, width: 1024, height: 1024, motion: plan.mode },
    );
    return studio.exportSequence(
      "1024x1024",
      24,
      (fraction) => {
        exportStatus.textContent = `Exporting ${Math.round(fraction * 100)}%`;
      },
      {
        applyFrame: plan.mode === "timeline" ? (i: number) => sceneAdapter.applySampledFrame(plan.frames[i]) : undefined,
        extraFiles: extras,
      },
    );
  },
  () =>
    lastTurntableMode === "timeline"
      ? "Turntable ready (timeline)"
      : "Turntable ready (default 360° sweep — add keys with Turn 360°)",
);
exportGroup.appendChild(el("span", "export-note", "GIF / native .blend: use PNG ZIP or Blender import"));
exportGroup.appendChild(exportStatus);
// Keep the primary completion action visible before the optional camera presets
// when the toolbar needs to scroll on laptop-sized screens.
toolbar.insertBefore(exportGroup, viewGroup);

// ============================================================ 3) S3 library
// Mounted before S2 in build-order terms per SCOPE.md §3 (S1 -> S3 -> S2 -> S4 -> S5 -> S6);
// its onAssetPicked wiring below is what actually calls back into S1 and S2, so it is written
// here, after both are declared, to keep the callback body straightforward.

const libraryRoot = byId<HTMLElement>("panel-library");
const libraryMount = el("div");
libraryRoot.appendChild(libraryMount);

// F3 wiring (status/evidence/f3/requests.md §2): every field buildReceipt's privacy guard checks
// (id, name, sourceUrl) is safe to pass straight from a LibraryAsset — verified against the live
// manifest (status/evidence/f3/requests.md).
function libraryAssetToProvenance(asset: LibraryAsset): ProvenanceAsset {
  return {
    id: asset.id,
    name: asset.name,
    kind: asset.kind as "model" | "hdri", // only reached for kind "model" | "hdri" below
    source: asset.source,
    sourceUrl: asset.sourceUrl,
    licence: asset.licence,
    category: asset.category,
    fileBytes: asset.fileBytes,
    triangles: asset.triangles,
  };
}

mountLibraryPanel(libraryMount, {
  onAssetPicked: async (asset: LibraryAsset) => {
    try {
      if (asset.kind === "hdri") {
        setWorkspaceStatus(`Loading ${asset.name} lighting…`);
        await studio.loadEnvironment(asset.fileUrl, asset.name);
        setWorkspaceStatus(`${asset.name} lighting applied`);
        currentHdri = {
          id: asset.id,
          name: asset.name,
          source: asset.source,
          sourceUrl: asset.sourceUrl,
          licence: asset.licence,
          fileUrl: asset.fileUrl,
        };
        provenance.setEnvironment(libraryAssetToProvenance(asset));
      } else if (asset.kind === "model") {
        await studio.loadModel(asset.fileUrl, asset.name);
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

// ============================================================ 4) S4 timeline

function findObjectByUuid(root: THREE.Object3D, uuid: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  root.traverse((o) => {
    if (o.uuid === uuid) found = o;
  });
  return found;
}

// The adapter S1's Wave-2 surface is expected to satisfy (SCOPE.md §2 REVIEW note on
// TimelineSceneAdapter): "pivot" resolves to studio.pivot (the turntable group S1 exports),
// any other targetId is looked up by uuid in the live scene graph.
const sceneAdapter: TimelineSceneAdapter = {
  applySampledFrame(frame: SampledFrame): void {
    for (const [targetId, xf] of Object.entries(frame.transforms)) {
      const obj = targetId === "pivot" ? studio.pivot : findObjectByUuid(studio.scene, targetId);
      if (!obj) continue;
      obj.position.set(xf.position[0], xf.position[1], xf.position[2]);
      obj.quaternion.set(xf.quaternion[0], xf.quaternion[1], xf.quaternion[2], xf.quaternion[3]);
      obj.scale.set(xf.scale[0], xf.scale[1], xf.scale[2]);
    }
    if (frame.camera?.fov !== undefined) {
      studio.camera.fov = frame.camera.fov;
      studio.camera.updateProjectionMatrix();
    }
  },
  renderNow(): void {
    studio.debug.renderOnce();
  },
};

const timeline: TimelineHandle = attachTimeline(sceneAdapter);

const timelineRoot = byId<HTMLElement>("panel-timeline");
const timelineTitle = el("h2", "panel-title", "Timeline");
timelineTitle.id = "timeline-title";
timelineRoot.appendChild(timelineTitle);
const timelineBar = el("div", "timeline-bar");
timelineRoot.appendChild(timelineBar);
const timelineTrackEl = el("div", "timeline-track");
timelineRoot.appendChild(timelineTrackEl);
const playhead = el("div", "timeline-playhead");
timelineTrackEl.appendChild(playhead);

const TIMELINE_DURATION = 6;

const turnBtn = el("button", "field-btn", "Turn 360°");
turnBtn.type = "button";
turnBtn.addEventListener("click", () => {
  timeline.addTurntableClip(TIMELINE_DURATION, "pivot");
  track({ type: "tool_used", tool: "add-turntable-clip" });
});
timelineBar.appendChild(turnBtn);

const playBtn = el("button", "field-btn", "Play");
playBtn.type = "button";
playBtn.addEventListener("click", () => timeline.play());
timelineBar.appendChild(playBtn);

const pauseBtn = el("button", "field-btn", "Pause");
pauseBtn.type = "button";
pauseBtn.addEventListener("click", () => timeline.pause());
timelineBar.appendChild(pauseBtn);

const scrubInput = document.createElement("input");
scrubInput.id = "timeline-scrubber";
scrubInput.type = "range";
scrubInput.setAttribute("aria-label", "Timeline position in seconds");
scrubInput.min = "0";
scrubInput.max = String(TIMELINE_DURATION);
scrubInput.step = "0.01";
scrubInput.value = "0";
scrubInput.addEventListener("input", () => {
  const t = parseFloat(scrubInput.value);
  timeline.scrubTo(t);
  updatePlayhead(t);
});
timelineBar.appendChild(scrubInput);

function updatePlayhead(t: number): void {
  const frac = Math.max(0, Math.min(1, t / TIMELINE_DURATION));
  playhead.style.left = `${frac * 100}%`;
}

function renderTimelineKeys(): void {
  timelineTrackEl.querySelectorAll(".timeline-key").forEach((n) => n.remove());
  const state = timeline.getState();
  const dur = state.duration || TIMELINE_DURATION;
  for (const trk of state.tracks) {
    for (const channel of trk.channels) {
      for (const key of channel.keys) {
        const dot = el("div", "timeline-key");
        const frac = Math.max(0, Math.min(1, key.t / dur));
        dot.style.left = `${frac * 100}%`;
        timelineTrackEl.appendChild(dot);
      }
    }
  }
}
timeline.onChange(() => {
  renderTimelineKeys();
  autosaver?.markDirty();
});
renderTimelineKeys();

// ===================================================== local project lifecycle

const openProjectBtn = byId<HTMLButtonElement>("open-project-btn");
const projectFileInput = byId<HTMLInputElement>("project-file-input");

function currentViewerState() {
  const state = studio.debug.state();
  return {
    focal: state.focal as 24 | 35 | 50 | 85 | 135,
    exposure: state.expo as number,
    environment: state.envKind as "room" | "studio" | "hdr",
    environmentRotation: state.envRot as number,
    environmentIntensity: state.envInt as number,
    transparent: state.transp as boolean,
    spin: state.spin as boolean,
    shadows: state.shadow as boolean,
    floor: state.floorVisible as boolean,
  };
}

// F3 wiring (status/evidence/f3/requests.md §7): map a saved v2 project's asset/HDRI identity
// back to the receipt/provenance shape. Only a "library" origin asset carries provenance — a
// local file's asset is `{ origin: "local" }` and must never seed a receipt.
function projectAssetToProvenance(asset: ProjectAsset): ProvenanceAsset | null {
  if (!asset || asset.origin !== "library") return null;
  return {
    id: asset.id,
    name: asset.name,
    kind: "model",
    source: asset.source,
    sourceUrl: asset.sourceUrl,
    licence: asset.licence,
    category: asset.category,
  };
}

function hdriToProvenance(hdri: ProjectHDRI): ProvenanceAsset {
  return {
    id: hdri.id,
    name: hdri.name,
    kind: "hdri",
    source: hdri.source,
    sourceUrl: hdri.sourceUrl,
    licence: hdri.licence,
  };
}

// F2 wiring (status/evidence/f2/requests.md "getActiveModelBase64"): avoids re-running
// studio.exportActiveGLB() (a real geometry re-serialize) on every autosave tick when nothing
// about the active model's own bytes has changed. Keyed by activeModelId (a model swap
// invalidates it automatically) and explicitly cleared at every call site above that can change
// the exported model's own bytes (material edits, mirror/array, undo/redo, model change).
async function getActiveModelBase64(): Promise<string | null> {
  const active = studio.getActiveModel();
  if (!active) return null;
  if (cachedModelBase64 && cachedModelBase64.id === active.id) return cachedModelBase64.base64;
  const blob = await studio.exportActiveGLB();
  const base64 = await blobToBase64(blob);
  cachedModelBase64 = { id: active.id, base64 };
  return base64;
}

// F2 wiring (status/evidence/f2/requests.md "(a) Shared document builder"): the one place that
// builds a v2 project document, reused by the explicit Save button and by autosave so the two can
// never drift apart. Skips capture while an export is in flight and returns null when no model is
// loaded (both per the task brief's capture contract).
async function buildProjectDocument(): Promise<ProjectDocumentV2 | null> {
  const active = studio.getActiveModel();
  if (!active) return null;
  const vstate = studio.debug.state();
  if (vstate.busy) return null;
  const base64 = await getActiveModelBase64();
  if (base64 === null) return null;

  const envKind = vstate.envKind as "room" | "studio" | "hdr";
  const environment: ProjectEnvironment = {
    kind: envKind,
    rotation: vstate.envRot as number,
    intensity: vstate.envInt as number,
    ...(envKind === "hdr" && currentHdri ? { hdri: currentHdri } : {}),
  };

  const hooks = (editor as unknown as { __test?: EditorRuntimeHooks }).__test;
  const bloomState = hooks?.bloomState() ?? { enabled: false, strength: 1.2, radius: 0.4, threshold: 0.85 };
  const canonical = hooks?.serializeState();
  const modifierByUuid = new Map<string, ModifierRecord | undefined>(
    (canonical?.objects ?? []).map((o) => [o.uuid, o.modifiers ?? undefined]),
  );
  const scene = captureScene(studio.scene, (uuid: string) => modifierByUuid.get(uuid), bloomState);

  return createProjectDocument({
    // Decision W-5 (status/warden-log.md): keep the real model.name for local files too — it is
    // the user's own local data, and File.name never carries a filesystem path — never a
    // placeholder here. The privacy boundary is enforced at the export/receipt layer instead
    // (provenance.setModel(null) for local files, see loadLocalModel above).
    name: active.name.replace(/\.glb$/i, ""),
    savedAt: new Date().toISOString(),
    model: { name: active.name, mime: "model/gltf-binary", base64 },
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

// Wraps buildProjectDocument for the autosaver only, so a successful capture can be timestamped
// for the WebGL-context-loss message ("your work was autosaved at HH:MM") without the explicit
// Save button's flow (which does not need that bookkeeping) sharing the same wrapper.
async function captureForAutosave(): Promise<ProjectDocumentV2 | null> {
  const doc = await buildProjectDocument();
  if (doc) lastAutosaveAt = new Date();
  return doc;
}

// F2 wiring (status/evidence/f2/requests.md "(b) Open handler" + "(d) Restore prompt"): the one
// place that applies a ProjectDocumentV2 to the live studio/editor/timeline, shared by "Open
// project" and the local-recovery "Restore" button so the two flows can never drift apart.
async function applyProjectDocument(project: ProjectDocumentV2): Promise<void> {
  await studio.loadModel(projectModelBlob(project), project.model.name);

  let appliedHdri: ProjectHDRI | null = null;
  if (project.environment.hdri && project.environment.hdri.fileUrl.startsWith("/assets/")) {
    await studio.loadEnvironment(project.environment.hdri.fileUrl, project.environment.hdri.name);
    appliedHdri = project.environment.hdri;
  } else {
    // Preserves the pre-v2 downgrade behavior for a v1 file upgraded in memory (its
    // environment.hdri is always undefined) and for any HDRI whose fileUrl isn't a packaged
    // /assets/ path.
    studio.setEnvironment(project.environment.kind === "hdr" ? "room" : project.environment.kind);
  }
  currentHdri = appliedHdri;
  studio.setEnvRotation(project.environment.rotation);
  studio.setEnvIntensity(project.environment.intensity);

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
  studio.setTransparent(project.viewer.transparent);
  studio.setSpin(project.viewer.spin, 30);
  studio.setShadows(project.viewer.shadows);
  studio.setFloor(project.viewer.floor);
  timeline.loadState(project.timeline);

  currentAsset = project.asset;
  cachedModelBase64 = null;
  const restoredCount = restoreScene(project, editor);
  console.info(`[app] restored ${restoredCount} authored scene object(s)`);

  // Seed provenance from what was ACTUALLY applied above (not merely what the document claims),
  // so a receipt built from a later export can never assert an HDRI that was in fact downgraded
  // to Room/Studio lighting.
  provenance.setModel(projectAssetToProvenance(project.asset));
  provenance.setEnvironment(appliedHdri ? hdriToProvenance(appliedHdri) : null);

  refreshOutliner();
  refreshMaterialPanel();
  renderTimelineKeys();
}

async function restoreFromRecord(record: { savedAt: string; doc: ProjectDocumentV2 }): Promise<void> {
  pendingRestore = null;
  try {
    await applyProjectDocument(record.doc);
    setWorkspaceStatus("Unsaved work restored.");
  } catch (error) {
    setWorkspaceStatus(`Could not restore: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}

saveProjectBtn.addEventListener("click", () => {
  void (async () => {
    if (!studio.getActiveModel()) {
      setWorkspaceStatus("Load a model before saving a project.", true);
      return;
    }
    saveProjectBtn.disabled = true;
    setWorkspaceStatus("Packing the active model and project settings…");
    try {
      const project = await buildProjectDocument();
      if (!project) {
        setWorkspaceStatus("Load a model before saving a project.", true);
        return;
      }
      const blob = new Blob([JSON.stringify(project)], { type: "application/json" });
      const safeName = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "studio-project";
      downloadBlob(blob, `${safeName}.studio.json`);
      setWorkspaceStatus("Project saved — active model, view, materials, and timeline included");
    } catch (error) {
      setWorkspaceStatus(`Could not save project: ${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      saveProjectBtn.disabled = !studio.getActiveModel();
    }
  })();
});

openProjectBtn.addEventListener("click", () => projectFileInput.click());
projectFileInput.addEventListener("change", () => {
  const file = projectFileInput.files?.[0];
  projectFileInput.value = "";
  if (!file) return;
  if (file.size > 70 * 1024 * 1024) {
    setWorkspaceStatus("That project file exceeds the 70 MB safety limit.", true);
    return;
  }
  void (async () => {
    setWorkspaceStatus(`Opening ${file.name}…`);
    try {
      const project = parseProjectDocument(await file.text());
      await applyProjectDocument(project);
      setWorkspaceStatus(`${project.name} restored.`);
    } catch (error) {
      setWorkspaceStatus(`Could not open project: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  })();
});

// ------------------------------------------------------------------- ready

track({ type: "session_started" });
console.info("[app] studio ready: load, edit, save, and export");
}

void boot().catch(showFatalBootError);
