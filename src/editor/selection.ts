// src/editor/selection.ts
//
// Target 2 (review-replaced, reviews/codex_review_S2.md Q3 / SCOPE.md §1): outliner list +
// canvas raycast selection against the fixed fixture (3 meshes + 1 light + 1 camera).

import * as THREE from "three";
import type { StudioLike, OutlinerRow } from "./types.ts";
import { walkScene, isOutlinerRow } from "./scene-utils.ts";

export interface SelectionApi {
  select(object: unknown | null): void;
  selection: unknown | null;
  outliner: { list(): OutlinerRow[] };
  /** Attach the canvas pointerdown listener that does raycast-to-select. Idempotent. */
  enableCanvasPicking(): void;
  dispose(): void;
  /** True while a TransformControls drag is in progress — canvas picking must not steal the click. */
  suppressPicking: boolean;
}

export function createSelection(studio: StudioLike, onSelectionChange?: (obj: unknown | null) => void): SelectionApi {
  const raycaster = new THREE.Raycaster();
  let current: unknown | null = null;
  let pickingEnabled = false;

  const api: SelectionApi = {
    get selection() {
      return current;
    },
    set selection(_v: unknown | null) {
      // selection is set only through select(); the frozen EditorHandle exposes `selection` as a
      // plain readable property (SCOPE.md §2), not a setter contract — this accessor pair keeps
      // `editor.selection` live-reading `current` for external readers.
    },
    suppressPicking: false,
    select(object: unknown | null): void {
      current = object;
      onSelectionChange?.(object);
    },
    outliner: {
      list(): OutlinerRow[] {
        const rows: OutlinerRow[] = [];
        walkScene(studio.scene, (obj) => {
          if (!isOutlinerRow(obj)) return;
          const o = obj as unknown as { isMesh?: boolean; isLight?: boolean };
          const type: OutlinerRow["type"] = o.isMesh ? "Mesh" : o.isLight ? "Light" : "Camera";
          rows.push({ id: obj.uuid, name: obj.name || obj.type, type, object: obj });
        });
        return rows;
      },
    },
    enableCanvasPicking(): void {
      if (pickingEnabled) return;
      pickingEnabled = true;
      studio.renderer.domElement.addEventListener("pointerdown", onPointerDown);
    },
    dispose(): void {
      if (!pickingEnabled) return;
      pickingEnabled = false;
      studio.renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    },
  };

  function onPointerDown(ev: PointerEvent): void {
    if (ev.button !== 0) return;
    if (api.suppressPicking) return; // a gizmo drag just grabbed this pointerdown
    const canvas = studio.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const ndcX = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), studio.camera);
    const meshes: THREE.Object3D[] = [];
    walkScene(studio.scene, (obj) => {
      const m = obj as unknown as { isMesh?: boolean };
      if (m.isMesh) meshes.push(obj);
    });
    const hits = raycaster.intersectObjects(meshes, false);
    api.select(hits.length > 0 ? hits[0].object : null);
  }

  return api;
}
