// src/editor/modifiers.ts
//
// Targets 6 (mirror) and 7 (array). Both are "live-linked" — clones share the source's geometry
// and material references (no destructive merge, which would be mesh-editing-class work and is
// fenced) — per src/editor/SPEC.md targets 6-7. Clone objects live directly under `scene`
// (siblings of the source), tagged with userData so callers can tell a clone from a real object.
//
// Design: setMirror/setArray each compute a full `before`/`after` ModifierRecord snapshot for the
// target object (merging in whatever the OTHER modifier's current state already was) and return
// an `apply(state)` function that rebuilds exactly the clones that record describes and writes it
// into the registry. The op's do() calls apply(after); undo() calls apply(before) — same function,
// same rebuild logic, so do/undo can never drift apart.

import * as THREE from "three";
import type { ModifierRecord, ModifierStateReader } from "./state.ts";
import { walkScene, MODIFIER_CLONE_TAG } from "./scene-utils.ts";

export interface ModifierEdit {
  before: ModifierRecord | undefined;
  after: ModifierRecord;
  apply(state: ModifierRecord | undefined): void;
}

export interface ModifiersApi {
  setMirror(scene: THREE.Scene, object: THREE.Object3D, axis: "x" | "y" | "z", enabled: boolean): ModifierEdit;
  setArray(scene: THREE.Scene, object: THREE.Object3D, count: number, offset: [number, number, number]): ModifierEdit;
  readModifier: ModifierStateReader;
  /** Total triangle count across visible meshes under `root` (source + any modifier clones). */
  countTriangles(root: THREE.Object3D): number;
  /** Total visible instances of `object` including the source itself (array target 7). */
  countArrayInstances(object: THREE.Object3D): number;
  /** Test/debug accessor: the live clone object references currently backing `object`'s modifiers. */
  getClones(object: THREE.Object3D): { mirror: THREE.Object3D | null; array: THREE.Object3D[] };
  disposeAllFor(sourceUuid: string): void;
}

interface CloneRecord {
  mirror: THREE.Object3D | null;
  array: THREE.Object3D[];
}

export function createModifiers(): ModifiersApi {
  const registry = new Map<string, ModifierRecord>();
  const clones = new Map<string, CloneRecord>();

  function record(sourceUuid: string): CloneRecord {
    let r = clones.get(sourceUuid);
    if (!r) {
      r = { mirror: null, array: [] };
      clones.set(sourceUuid, r);
    }
    return r;
  }

  function makeMirrorClone(source: THREE.Object3D, axis: "x" | "y" | "z"): THREE.Object3D {
    const mesh = source as THREE.Mesh;
    const clone = new THREE.Mesh(mesh.geometry, mesh.material);
    clone.position.copy(source.position);
    (clone.position as unknown as Record<string, number>)[axis] *= -1;
    clone.quaternion.copy(source.quaternion);
    clone.scale.copy(source.scale);
    (clone.scale as unknown as Record<string, number>)[axis] *= -1;
    clone.userData[MODIFIER_CLONE_TAG] = { sourceUuid: source.uuid, kind: "mirror" };
    clone.name = `${source.name || source.type} (mirror ${axis.toUpperCase()})`;
    return clone;
  }

  function makeArrayClones(
    source: THREE.Object3D,
    count: number,
    offset: [number, number, number],
  ): THREE.Object3D[] {
    const mesh = source as THREE.Mesh;
    const out: THREE.Object3D[] = [];
    for (let i = 1; i < count; i++) {
      const clone = new THREE.Mesh(mesh.geometry, mesh.material);
      clone.position.set(
        source.position.x + offset[0] * i,
        source.position.y + offset[1] * i,
        source.position.z + offset[2] * i,
      );
      clone.quaternion.copy(source.quaternion);
      clone.scale.copy(source.scale);
      clone.userData[MODIFIER_CLONE_TAG] = { sourceUuid: source.uuid, kind: "array" };
      clone.name = `${source.name || source.type} (array ${i + 1})`;
      out.push(clone);
    }
    return out;
  }

  function rebuild(scene: THREE.Scene, object: THREE.Object3D, state: ModifierRecord | undefined): void {
    const rec = record(object.uuid);

    if (rec.mirror) {
      rec.mirror.removeFromParent();
      rec.mirror = null;
    }
    if (state?.mirror?.enabled) {
      const clone = makeMirrorClone(object, state.mirror.axis);
      scene.add(clone);
      rec.mirror = clone;
    }

    if (rec.array.length) {
      rec.array.forEach((c) => c.removeFromParent());
      rec.array = [];
    }
    if (state?.array && state.array.count > 1) {
      const newClones = makeArrayClones(object, state.array.count, state.array.offset);
      newClones.forEach((c) => scene.add(c));
      rec.array = newClones;
    }

    if (state && (state.mirror || state.array)) registry.set(object.uuid, state);
    else registry.delete(object.uuid);
  }

  return {
    readModifier: (uuid: string) => registry.get(uuid),

    countTriangles(root: THREE.Object3D): number {
      // walkScene (not THREE's own .traverse()) so the TransformControls gizmo helper subtree
      // (tagged __editorHelper, scene-utils.ts) is never counted — .traverse() has no concept of
      // that flag and would otherwise fold the gizmo's own arrow/torus geometry into the total.
      let tris = 0;
      walkScene(root, (n) => {
        const m = n as THREE.Mesh;
        if (!m.isMesh || !m.visible) return;
        const g = m.geometry;
        if (!g) return;
        const pos = g.attributes && g.attributes.position ? g.attributes.position.count : 0;
        tris += (g.index ? g.index.count : pos) / 3;
      });
      return Math.round(tris);
    },

    countArrayInstances(object: THREE.Object3D): number {
      const state = registry.get(object.uuid);
      return state?.array ? Math.max(1, state.array.count) : 1;
    },

    getClones(object: THREE.Object3D) {
      const r = clones.get(object.uuid);
      return { mirror: r?.mirror ?? null, array: r?.array ?? [] };
    },

    disposeAllFor(sourceUuid: string): void {
      const r = clones.get(sourceUuid);
      if (r?.mirror) r.mirror.removeFromParent();
      r?.array.forEach((c) => c.removeFromParent());
      clones.delete(sourceUuid);
      registry.delete(sourceUuid);
    },

    setMirror(scene, object, axis, enabled): ModifierEdit {
      const before = registry.get(object.uuid);
      const after: ModifierRecord = { ...(before ?? {}), mirror: { axis, enabled } };
      return { before, after, apply: (state) => rebuild(scene, object, state) };
    },

    setArray(scene, object, count, offset): ModifierEdit {
      const before = registry.get(object.uuid);
      const clamped = Math.max(1, Math.floor(count));
      const after: ModifierRecord = { ...(before ?? {}), array: { count: clamped, offset } };
      return { before, after, apply: (state) => rebuild(scene, object, state) };
    },
  };
}
