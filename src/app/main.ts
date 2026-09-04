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

import { mountLibraryPanel } from "../library/index.ts";
import type { LibraryAsset } from "../library/manifest";

import { attachTimeline } from "../timeline/index.ts";
import type { TimelineHandle, TimelineSceneAdapter, SampledFrame } from "../timeline/index.ts";

import { track } from "../account/index.ts";
import {
  blobToBase64,
  createProjectDocument,
  parseProjectDocument,
  projectModelBlob,
} from "../project/format.ts";

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
}

function setWorkspaceStatus(message: string, error = false): void {
  appStatus.textContent = message;
  appStatus.dataset.state = error ? "error" : "status";
  viewportError.hidden = !error;
  if (error) viewportError.textContent = message;
}

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
  void studio.loadModel(file, file.name).then(() => {
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
    return;
  }
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
    input.addEventListener("input", () => onInput(parseFloat(input.value)));
    row.appendChild(input);
    materialBody.appendChild(row);
  }
  slider("Roughness", std.roughness ?? 0.5, (v) => editor.ops.setMaterial(sel, { roughness: v }));
  slider("Metalness", std.metalness ?? 0, (v) => editor.ops.setMaterial(sel, { metalness: v }));

  const resetBtn = el("button", "field-btn", "Reset material");
  resetBtn.addEventListener("click", () => {
    editor.ops.setMaterial(sel, { color: 0xffffff, roughness: 0.5, metalness: 0, emissiveIntensity: 0 });
    refreshMaterialPanel();
  });
  materialBody.appendChild(resetBtn);
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
  refreshOutliner();
  refreshMaterialPanel();
});
tbButton(histGroup, "Redo", () => {
  editor.redo();
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
});
bloomBtn.setAttribute("aria-pressed", "false");

const viewGroup = tbGroup("View");
for (const preset of [0, 90, 180, 270, "top"] as const) {
  tbButton(viewGroup, typeof preset === "number" ? `${preset}°` : "Top", () => studio.setView(preset));
}
let spinOn = false;
const spinBtn = tbButton(viewGroup, "Spin", () => {
  spinOn = !spinOn;
  studio.setSpin(spinOn, 30);
  spinBtn.classList.toggle("active", spinOn);
  spinBtn.setAttribute("aria-pressed", String(spinOn));
});
spinBtn.setAttribute("aria-pressed", "false");

const exportGroup = tbGroup("Export");
const exportStatus = el("span", undefined, "");
exportStatus.id = "export-status";
exportStatus.setAttribute("role", "status");
exportStatus.setAttribute("aria-live", "polite");
type ExportKind = "still" | "turntable" | "glb" | "gltf" | "blender-package";
const exportButtons: HTMLButtonElement[] = [];

function exportButton(
  label: string,
  kind: ExportKind,
  filename: string,
  makeBlob: () => Promise<Blob>,
): void {
  const button = tbButton(exportGroup, label, async () => {
    const t0 = performance.now();
    for (const item of exportButtons) item.disabled = true;
    exportStatus.textContent = `Exporting ${label}…`;
    setWorkspaceStatus(`Exporting ${label}…`);
    try {
      const blob = await makeBlob();
      downloadBlob(blob, filename);
      exportStatus.textContent = `${label} ready`;
      setWorkspaceStatus(`${label} download ready`);
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

exportButton("PNG", "still", "studio-export.png", () => studio.exportPNG("2048x2048"));
exportButton("GLB", "glb", "studio-scene.glb", () => studio.exportGLB());
exportButton("GLTF", "gltf", "studio-scene.gltf", () => studio.exportGLTF());
exportButton("Blender ZIP", "blender-package", "studio-blender-package.zip", () => studio.exportBlenderPackage());
exportButton("Turntable", "turntable", "studio-turntable.zip", () =>
  studio.exportSequence("1024x1024", 24, (fraction) => {
    exportStatus.textContent = `Exporting ${Math.round(fraction * 100)}%`;
  }),
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

mountLibraryPanel(libraryMount, {
  onAssetPicked: async (asset: LibraryAsset) => {
    try {
      if (asset.kind === "hdri") {
        setWorkspaceStatus(`Loading ${asset.name} lighting…`);
        await studio.loadEnvironment(asset.fileUrl, asset.name);
        setWorkspaceStatus(`${asset.name} lighting applied`);
      } else if (asset.kind === "model") {
        await studio.loadModel(asset.fileUrl, asset.name);
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
timeline.onChange(() => renderTimelineKeys());
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

saveProjectBtn.addEventListener("click", () => {
  void (async () => {
    const active = studio.getActiveModel();
    if (!active) {
      setWorkspaceStatus("Load a model before saving a project.", true);
      return;
    }
    saveProjectBtn.disabled = true;
    setWorkspaceStatus("Packing the active model and project settings…");
    try {
      const model = await studio.exportActiveGLB();
      const project = createProjectDocument({
        name: active.name.replace(/\.glb$/i, ""),
        savedAt: new Date().toISOString(),
        model: {
          name: active.name,
          mime: "model/gltf-binary",
          base64: await blobToBase64(model),
        },
        viewer: currentViewerState(),
        timeline: timeline.getState(),
      });
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
      await studio.loadModel(projectModelBlob(project), project.model.name);
      studio.setFocalLength(project.viewer.focal);
      studio.setExposure(project.viewer.exposure);
      studio.setEnvironment(project.viewer.environment === "hdr" ? "room" : project.viewer.environment);
      studio.setEnvRotation(project.viewer.environmentRotation);
      studio.setEnvIntensity(project.viewer.environmentIntensity);
      studio.setTransparent(project.viewer.transparent);
      studio.setSpin(project.viewer.spin, 30);
      studio.setShadows(project.viewer.shadows);
      studio.setFloor(project.viewer.floor);
      timeline.loadState(project.timeline);
      refreshOutliner();
      refreshMaterialPanel();
      renderTimelineKeys();
      const environmentNote = project.viewer.environment === "hdr" ? " Custom HDR lighting is not embedded; Room lighting was restored." : "";
      setWorkspaceStatus(`${project.name} restored.${environmentNote}`);
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
