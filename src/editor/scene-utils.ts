// src/editor/scene-utils.ts
//
// Shared traversal helper. Every S2 subsystem (outliner, raycast selection, canonical state
// serialization, mirror/array triangle counting) needs to walk the scene while skipping S2's own
// gizmo/helper scaffolding — TransformControls' helper root is tagged
// `userData.__editorHelper = true` where it is added to the scene (see gizmo.ts), and this walker
// never descends into a subtree carrying that flag. THREE.Object3D.traverse() cannot skip a
// subtree (it always recurses into every child), so this is a small hand-rolled replacement.

import type * as THREE from "three";

export function isEditorHelper(obj: THREE.Object3D): boolean {
  return obj.userData && obj.userData.__editorHelper === true;
}

/** Tag key modifiers.ts writes onto mirror/array clone objects (shared here to avoid a cycle
 * between state.ts and modifiers.ts — both need the literal, neither should own the other). */
export const MODIFIER_CLONE_TAG = "__editorModifierClone";

export function isModifierClone(obj: THREE.Object3D): boolean {
  return Boolean(obj.userData && obj.userData[MODIFIER_CLONE_TAG]);
}

/** Depth-first walk of obj's descendants (not obj itself), skipping any __editorHelper subtree. */
export function walkScene(root: THREE.Object3D, visit: (obj: THREE.Object3D) => void): void {
  for (const child of root.children) {
    if (isEditorHelper(child)) continue;
    visit(child);
    walkScene(child, visit);
  }
}

/** obj.isMesh || obj.isLight || obj.isCamera — DECISIONS.md #13, binding outliner predicate. */
export function isOutlinerRow(obj: THREE.Object3D): boolean {
  const o = obj as unknown as { isMesh?: boolean; isLight?: boolean; isCamera?: boolean };
  return Boolean(o.isMesh || o.isLight || o.isCamera);
}
