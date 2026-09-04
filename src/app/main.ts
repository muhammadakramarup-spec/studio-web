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

import { useAccount, AccountPanel, AdSlot, track, setTelemetryOptIn } from "../account/index.ts";

import { GenerationPanel, AvatarPanel } from "../ai/index.ts";

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

// ============================================================== 1) S1 viewer

const canvas = byId<HTMLCanvasElement>("viewport");
const viewportHint = byId<HTMLDivElement>("viewport-hint");
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
resizeViewport();

// The viewport hint must always reflect real state (Wave 3 finding): it must never be a static
// "Loading studio…" string left in the DOM forever with nothing tied to it. Three real states:
// "idle" (studio ready, nothing loaded yet — tells the visitor what to do), "loading" (a model
// is actively being fetched/parsed), and "loaded" (hidden entirely — a model is in the scene).
const HINT_IDLE = "Drop a .glb, or pick one from the library";
const HINT_LOADING = "Loading model…";

function setHint(state: "idle" | "loading" | "loaded", text?: string): void {
  viewportHint.dataset.state = state;
  if (state === "loaded") {
    viewportHint.hidden = true;
    return;
  }
  viewportHint.hidden = false;
  viewportHint.textContent = text ?? (state === "loading" ? HINT_LOADING : HINT_IDLE);
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
studio.loadModel = (async (source: File | Blob | string, name?: string) => {
  setHint("loading");
  try {
    const handle = await rawLoadModel(source, name);
    setHint("loaded");
    return handle;
  } catch (err) {
    setHint("idle");
    throw err;
  }
}) as StudioHandle["loadModel"];

// ============================================================ 2) S2 editor

// StudioHandle is structurally a superset of S2's local StudioLike (scene, camera, renderer,
// controls, setRenderHook) — passed directly, no adapter needed.
const editor: EditorHandle = attachEditor(studio);

// -------- outliner (#panel-outliner)
const outlinerRoot = byId<HTMLElement>("panel-outliner");
outlinerRoot.appendChild(el("div", "panel-title", "Outliner"));
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
    const li = el("li", "outliner-row");
    if (editor.selection === row.object) li.classList.add("selected");
    li.appendChild(el("span", undefined, row.name || row.type));
    li.appendChild(el("span", "type-badge", row.type));
    li.addEventListener("click", () => {
      editor.select(row.object);
      refreshOutliner();
      refreshMaterialPanel();
    });
    outlinerList.appendChild(li);
  }
}

// -------- material panel (#panel-material)
const materialRoot = byId<HTMLElement>("panel-material");
materialRoot.appendChild(el("div", "panel-title", "Material"));
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
  colorRow.appendChild(el("label", undefined, "Color"));
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = `#${std.color?.getHexString() ?? "ffffff"}`;
  colorInput.addEventListener("input", () => {
    editor.ops.setMaterial(sel, { color: parseInt(colorInput.value.slice(1), 16) });
    track({ type: "effect_applied", effect: "material-color" });
  });
  colorRow.appendChild(colorInput);
  materialBody.appendChild(colorRow);

  function slider(labelText: string, value: number, onInput: (v: number) => void): void {
    const row = el("div", "row");
    row.appendChild(el("label", undefined, labelText));
    const input = document.createElement("input");
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
});

refreshOutliner();
refreshMaterialPanel();

// -------- toolbar (#toolbar) — editor ops, viewer view/export controls
const toolbar = byId<HTMLElement>("toolbar");

function tbGroup(): HTMLDivElement {
  const g = el("div", "tb-group");
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

const histGroup = tbGroup();
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

const addGroup = tbGroup();
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

const modGroup = tbGroup();
let mirrorOn = false;
const mirrorBtn = tbButton(modGroup, "Mirror X", () => {
  if (!editor.selection) return;
  mirrorOn = !mirrorOn;
  editor.ops.setMirror(editor.selection, "x", mirrorOn);
  mirrorBtn.classList.toggle("active", mirrorOn);
  refreshOutliner();
});
tbButton(modGroup, "Array x5", () => {
  if (!editor.selection) return;
  editor.ops.setArray(editor.selection, 5, [1.2, 0, 0]);
  refreshOutliner();
});

const fxGroup = tbGroup();
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
  track({ type: "effect_applied", effect: "bloom" });
});

const viewGroup = tbGroup();
for (const preset of [0, 90, 180, 270, "top"] as const) {
  tbButton(viewGroup, typeof preset === "number" ? `${preset}°` : "Top", () => studio.setView(preset));
}
let spinOn = false;
const spinBtn = tbButton(viewGroup, "Spin", () => {
  spinOn = !spinOn;
  studio.setSpin(spinOn, 30);
  spinBtn.classList.toggle("active", spinOn);
});

const exportGroup = tbGroup();
const exportStatus = el("span", undefined, "");
exportStatus.id = "export-status";
tbButton(exportGroup, "PNG", async () => {
  const t0 = performance.now();
  const blob = await studio.exportPNG("2048x2048");
  downloadBlob(blob, "studio-export.png");
  track({ type: "export_completed", exportKind: "still", ms: performance.now() - t0 });
});
tbButton(exportGroup, "GLB", async () => {
  const t0 = performance.now();
  const blob = await studio.exportGLB();
  downloadBlob(blob, "studio-scene.glb");
  track({ type: "export_completed", exportKind: "glb", ms: performance.now() - t0 });
});
tbButton(exportGroup, "GLTF", async () => {
  const t0 = performance.now();
  const blob = await studio.exportGLTF();
  downloadBlob(blob, "studio-scene.gltf");
  track({ type: "export_completed", exportKind: "gltf", ms: performance.now() - t0 });
});
tbButton(exportGroup, "Blender ZIP", async () => {
  const t0 = performance.now();
  const blob = await studio.exportBlenderPackage();
  downloadBlob(blob, "studio-blender-package.zip");
  track({ type: "export_completed", exportKind: "blender-package", ms: performance.now() - t0 });
});
tbButton(exportGroup, "Turntable ZIP", async () => {
  const t0 = performance.now();
  exportStatus.textContent = "Exporting…";
  const blob = await studio.exportSequence("1024x1024", 24, (frac) => {
    exportStatus.textContent = `Exporting ${Math.round(frac * 100)}%`;
  });
  downloadBlob(blob, "studio-turntable.zip");
  exportStatus.textContent = "Done";
  track({ type: "export_completed", exportKind: "turntable", ms: performance.now() - t0 });
});
exportGroup.appendChild(el("span", "export-note", "GIF / native .blend: use PNG ZIP or Blender import"));
exportGroup.appendChild(exportStatus);

// ============================================================ 3) S3 library
// Mounted before S2 in build-order terms per SCOPE.md §3 (S1 -> S3 -> S2 -> S4 -> S5 -> S6);
// its onAssetPicked wiring below is what actually calls back into S1 and S2, so it is written
// here, after both are declared, to keep the callback body straightforward.

const libraryRoot = byId<HTMLElement>("panel-library");
libraryRoot.appendChild(el("div", "panel-title", "Library"));
const libraryMount = el("div");
libraryRoot.appendChild(libraryMount);

mountLibraryPanel(libraryMount, {
  onAssetPicked: async (asset: LibraryAsset) => {
    try {
      await studio.loadModel(asset.fileUrl, asset.name);
      track({ type: "asset_loaded", assetKind: asset.kind, assetId: asset.id });
      refreshOutliner();
    } catch (err) {
      console.error("[app] failed to load library asset", asset.id, err);
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
timelineRoot.appendChild(el("div", "panel-title", "Timeline"));
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
scrubInput.type = "range";
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

// ============================================================= 5) S5 account

const accountRoot = byId<HTMLElement>("panel-account");
accountRoot.appendChild(el("div", "panel-title", "Account"));
accountRoot.appendChild(AccountPanel());
accountRoot.appendChild(AdSlot({ size: "300x250", placement: "sidebar" }));

// Resolves synchronously, signed-out (decision #18) — no loading branch to wait on.
void useAccount();
track({ type: "session_started" });

// ================================================================ 6) S6 AI

const aiRoot = byId<HTMLElement>("panel-ai");
aiRoot.appendChild(el("div", "panel-title", "AI Generate"));

const promptInput = document.createElement("textarea");
promptInput.className = "ai-prompt";
promptInput.placeholder = "Describe a 3D object…";
aiRoot.appendChild(promptInput);

const genPanel = GenerationPanel({
  onModelReady: async (glbUrl: string) => {
    await studio.loadModel(glbUrl, "AI generation");
    refreshOutliner();
  },
});
const genBtn = el("button", undefined, "Generate (mock)");
genBtn.type = "button";
genBtn.addEventListener("click", () => {
  void genPanel.submit({ kind: "text-to-3d", prompt: promptInput.value || "a simple prop" });
});
aiRoot.appendChild(genBtn);
aiRoot.appendChild(genPanel.el);

aiRoot.appendChild(el("div", "panel-title", "Avatar"));
const avatarPanel = AvatarPanel({
  onAvatarReady: async (glbUrl: string) => {
    await studio.loadModel(glbUrl, "Avatar");
    refreshOutliner();
  },
  onCancel: () => {},
});
aiRoot.appendChild(avatarPanel.el);

// ------------------------------------------------------------------- ready

console.info("[app] studio wired: S1 viewer, S2 editor, S3 library, S4 timeline, S5 account, S6 ai");
