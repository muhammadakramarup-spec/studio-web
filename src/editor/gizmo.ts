// src/editor/gizmo.ts
//
// Target 3: TransformControls gizmos (translate/rotate/scale). Ships free from
// examples/jsm/controls/TransformControls.js in three@0.170.0 (verified, src/editor/SPEC.md
// target 3). Standard three.js pattern for the OrbitControls/TransformControls pointer conflict
// (SPEC risk 4): listen for 'dragging-changed' and toggle studio.controls.enabled.

import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { StudioLike } from "./types.ts";
import type { HistoryApi } from "./history.ts";
import { nextOpId } from "./history.ts";
import type { SelectionApi } from "./selection.ts";

export type GizmoMode = "translate" | "rotate" | "scale";

export interface GizmoApi {
  setMode(mode: GizmoMode): void;
  dispose(): void;
  /** Attach/detach the gizmo to follow the current selection; index.ts wires this to select(). */
  attachToSelection(object: unknown | null): void;
  /**
   * Test-only synthetic drag: bypasses hover-based axis picking (which requires real screen-space
   * raycasting against the gizmo's picker meshes) by setting `.axis` directly, then drives the
   * same public pointerDown/pointerMove/pointerUp methods TransformControls' own DOM listeners
   * call — this is exactly the "synthetic drag" SCOPE.md's gizmo check calls for, using
   * TransformControls' real drag math (ray-vs-plane), not a stand-in.
   */
  simulateDrag(
    axis: "X" | "Y" | "Z",
    mode: GizmoMode,
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): void;
}

export function createGizmoController(studio: StudioLike, selection: SelectionApi, history: HistoryApi): GizmoApi {
  const controls = new TransformControls(studio.camera, studio.renderer.domElement);
  const helper = controls.getHelper();
  helper.userData.__editorHelper = true;
  studio.scene.add(helper);

  let dragBefore: { position: number[]; rotation: number[]; scale: number[] } | null = null;

  function snapshotObject(obj: THREE.Object3D) {
    return {
      position: obj.position.toArray() as number[],
      rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
      scale: obj.scale.toArray() as number[],
    };
  }

  controls.addEventListener("dragging-changed", (event: { value: unknown }) => {
    const dragging = Boolean(event.value);
    if (studio.controls) studio.controls.enabled = !dragging;
    selection.suppressPicking = dragging;

    const obj = controls.object as THREE.Object3D | undefined;
    if (dragging) {
      dragBefore = obj ? snapshotObject(obj) : null;
      return;
    }
    if (!obj || !dragBefore) return;
    const before = dragBefore;
    const after = snapshotObject(obj);
    dragBefore = null;
    const changed =
      before.position.some((v, i) => v !== after.position[i]) ||
      before.rotation.some((v, i) => v !== after.rotation[i]) ||
      before.scale.some((v, i) => v !== after.scale[i]);
    if (!changed) return;
    history.execute({
      id: nextOpId("transform"),
      kind: "transform",
      label: "Gizmo drag",
      do: () => {
        obj.position.fromArray(after.position);
        obj.rotation.set(after.rotation[0], after.rotation[1], after.rotation[2]);
        obj.scale.fromArray(after.scale);
      },
      undo: () => {
        obj.position.fromArray(before.position);
        obj.rotation.set(before.rotation[0], before.rotation[1], before.rotation[2]);
        obj.scale.fromArray(before.scale);
      },
    });
  });

  return {
    attachToSelection(object: unknown | null): void {
      if (object && (object as THREE.Object3D).isObject3D) {
        controls.attach(object as THREE.Object3D);
      } else {
        controls.detach();
      }
    },
    setMode(mode: GizmoMode): void {
      controls.setMode(mode);
    },
    dispose(): void {
      controls.dispose();
      studio.scene.remove(helper);
    },
    simulateDrag(axis, mode, start, end): void {
      controls.setMode(mode);
      // Establish fresh worldPosition/eye/plane orientation before driving the synthetic drag.
      studio.renderer.render(studio.scene, studio.camera);
      controls.axis = axis;
      // NOTE: @types/three declares pointerDown/Move/Up as taking a real `PointerEvent`, but
      // three@0.170.0's actual implementation duck-types a plain {x,y,button} NDC pointer (see
      // examples/jsm/controls/TransformControls.js `getPointer()`/pointerDown/pointerMove) — the
      // .d.ts is imprecise here, not the runtime. Cast to satisfy tsc; the shape below is exactly
      // what the library reads at runtime.
      controls.pointerDown({ x: start.x, y: start.y, button: 0 } as unknown as PointerEvent);
      controls.pointerMove({ x: end.x, y: end.y, button: -1 } as unknown as PointerEvent);
      controls.pointerUp({ x: end.x, y: end.y, button: 0 } as unknown as PointerEvent);
    },
  };
}
