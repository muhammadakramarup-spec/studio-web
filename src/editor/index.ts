// src/editor/index.ts
//
// S2 Editor. Frozen surface: SCOPE.md §2 "S2 — src/editor/index.ts". Build order followed exactly
// per HANDOFF: 1) undo/redo stack + execute(op) 2) selection 3) gizmos 4) add 5) material
// 6) mirror 7) array 8) bloom-only post FX.

import * as THREE from "three";
import type {
  StudioLike,
  EditorHandle,
  EditorOp,
  AddPayload,
  MaterialPatch,
  PostFXPatch,
  OutlinerRow,
} from "./types.ts";
import { createHistory, nextOpId } from "./history.ts";
import { createSelection } from "./selection.ts";
import { createGizmoController } from "./gizmo.ts";
import { createObjectFromPayload } from "./add.ts";
import { collectMaterials, snapshotMaterial, patchSnapshot, applyMaterialSnapshot } from "./material.ts";
import { createModifiers } from "./modifiers.ts";
import { createPostFX, DEFAULT_BLOOM, mergeBloomPatch, type BloomState } from "./postfx.ts";
import { serializeState, statesEqual, type CanonicalState } from "./state.ts";
import { isEditorHelper } from "./scene-utils.ts";

export type {
  StudioLike,
  EditorOpKind,
  EditorOp,
  AddPayload,
  MaterialPatch,
  PostFXPatch,
  OutlinerRow,
  EditorHandle,
} from "./types.ts";

// Runtime-only surface, layered on top of the frozen EditorHandle shape (not part of the frozen
// contract itself — see types.ts's comment on why this is not folded into EditorHandle). Kept
// separate so `attachEditor`'s declared return type matches SCOPE.md §2 exactly while
// tests/s2.spec.ts still has everything it needs to drive the numeric acceptance checks.
export interface EditorTestHooks {
  gizmo: { setMode(mode: "translate" | "rotate" | "scale"): void; simulateDrag: ReturnType<typeof createGizmoController>["simulateDrag"] };
  enableCanvasPicking(): void;
  serializeState(): CanonicalState;
  statesEqual(a: CanonicalState, b: CanonicalState, eps?: number): boolean;
  triangleCount(): number;
  arrayInstanceCount(object: unknown): number;
  getClones(object: unknown): { mirror: unknown | null; array: unknown[] };
  bloomState(): BloomState;
}

export function attachEditor(studio: StudioLike): EditorHandle {
  const history = createHistory();
  const modifiers = createModifiers();
  const postfx = createPostFX(studio);

  const selection = createSelection(studio, (obj) => {
    gizmo.attachToSelection(obj);
  });
  const gizmo = createGizmoController(studio, selection, history);
  selection.enableCanvasPicking();

  // ---- ops.add / ops.remove -------------------------------------------------------------
  function opAdd(payload: AddPayload): unknown {
    const obj = createObjectFromPayload(payload, studio.renderer);
    const op: EditorOp = {
      id: nextOpId("add"),
      kind: "add",
      label: `Add ${payload.kind}`,
      do: () => studio.scene.add(obj),
      undo: () => {
        if (selection.selection === obj) selection.select(null);
        obj.removeFromParent();
      },
    };
    history.execute(op);
    return obj;
  }

  function opRemove(object: unknown): void {
    const obj = object as THREE.Object3D;
    if (!obj || isEditorHelper(obj)) return;
    const parent = obj.parent;
    if (!parent) return;
    const wasSelected = selection.selection === obj;
    const op: EditorOp = {
      id: nextOpId("remove"),
      kind: "remove",
      label: `Remove ${obj.name || obj.type}`,
      do: () => {
        if (selection.selection === obj) selection.select(null);
        obj.removeFromParent();
      },
      undo: () => {
        parent.add(obj);
        if (wasSelected) selection.select(obj);
      },
    };
    history.execute(op);
  }

  // ---- ops.setTransform -------------------------------------------------------------------
  function opSetTransform(
    object: unknown,
    patch: { position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] },
  ): void {
    const obj = object as THREE.Object3D;
    if (!obj) return;
    const before = {
      position: obj.position.toArray() as [number, number, number],
      rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z] as [number, number, number],
      scale: obj.scale.toArray() as [number, number, number],
    };
    const after = {
      position: patch.position ?? before.position,
      rotation: patch.rotation ?? before.rotation,
      scale: patch.scale ?? before.scale,
    };
    const op: EditorOp = {
      id: nextOpId("transform"),
      kind: "transform",
      label: "Set transform",
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
    };
    history.execute(op);
  }

  // ---- ops.setMaterial ---------------------------------------------------------------------
  function opSetMaterial(object: unknown, patch: MaterialPatch): void {
    const mats = collectMaterials(object);
    if (mats.length === 0) return;
    const beforeList = mats.map((m) => snapshotMaterial(m));
    const afterList = beforeList.map((s) => patchSnapshot(s, patch));
    const op: EditorOp = {
      id: nextOpId("material"),
      kind: "material",
      label: "Set material",
      do: () => mats.forEach((m, i) => applyMaterialSnapshot(m, afterList[i])),
      undo: () => mats.forEach((m, i) => applyMaterialSnapshot(m, beforeList[i])),
    };
    history.execute(op);
  }

  // ---- ops.setMirror / ops.setArray ---------------------------------------------------------
  function opSetMirror(object: unknown, axis: "x" | "y" | "z", enabled: boolean): void {
    const obj = object as THREE.Object3D;
    if (!obj) return;
    const edit = modifiers.setMirror(studio.scene, obj, axis, enabled);
    const op: EditorOp = {
      id: nextOpId("mirror"),
      kind: "mirror",
      label: `Mirror ${axis.toUpperCase()} ${enabled ? "on" : "off"}`,
      do: () => edit.apply(edit.after),
      undo: () => edit.apply(edit.before),
    };
    history.execute(op);
  }

  function opSetArray(object: unknown, count: number, offset: [number, number, number]): void {
    const obj = object as THREE.Object3D;
    if (!obj) return;
    const edit = modifiers.setArray(studio.scene, obj, count, offset);
    const op: EditorOp = {
      id: nextOpId("array"),
      kind: "array",
      label: `Array x${count}`,
      do: () => edit.apply(edit.after),
      undo: () => edit.apply(edit.before),
    };
    history.execute(op);
  }

  // ---- ops.setPostFX ------------------------------------------------------------------------
  function opSetPostFX(patch: PostFXPatch): void {
    if (!patch.bloom) return; // vignette/grade: stretch, not built (see types.ts PostFXPatch comment)
    const before = postfx.state;
    const after = mergeBloomPatch(before, patch);
    const op: EditorOp = {
      id: nextOpId("postfx"),
      kind: "postfx",
      label: `Bloom ${after.enabled ? "on" : "off"}`,
      do: () => postfx.apply(after),
      undo: () => postfx.apply(before),
    };
    history.execute(op);
  }

  postfx.apply({ ...DEFAULT_BLOOM }); // establishes the default (disabled) render hook state

  const handle: EditorHandle = {
    undo: () => history.undo(),
    redo: () => history.redo(),
    execute: (op: EditorOp) => history.execute(op),
    ops: {
      add: opAdd,
      remove: opRemove,
      setTransform: opSetTransform,
      setMaterial: opSetMaterial,
      setMirror: opSetMirror,
      setArray: opSetArray,
      setPostFX: opSetPostFX,
    },
    select: (object: unknown | null) => selection.select(object),
    get selection() {
      return selection.selection;
    },
    outliner: selection.outliner,
  };

  // Runtime-only test hooks — see EditorTestHooks doc comment above.
  (handle as EditorHandle & { __test: EditorTestHooks }).__test = {
    gizmo: { setMode: (m) => gizmo.setMode(m), simulateDrag: gizmo.simulateDrag.bind(gizmo) },
    enableCanvasPicking: () => selection.enableCanvasPicking(),
    serializeState: () => serializeState(studio.scene, modifiers.readModifier, postfx.state),
    statesEqual: (a, b, eps) => statesEqual(a, b, eps),
    triangleCount: () => modifiers.countTriangles(studio.scene),
    arrayInstanceCount: (object: unknown) => modifiers.countArrayInstances(object as THREE.Object3D),
    getClones: (object: unknown) => modifiers.getClones(object as THREE.Object3D),
    bloomState: () => postfx.state,
  };

  return handle;
}
