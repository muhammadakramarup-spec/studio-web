// src/editor/state.ts
//
// Target 1's canonical state serializer (review finding #1, reviews/codex_review_S2.md:13,
// folded into SCOPE.md §1: "canonical serialization — hierarchy, types, visibility, transforms,
// materials, modifier params, post-FX state — not transforms/materials only"). Used by
// tests/s2.spec.ts as the ground truth for the 50-op undo/50-op redo round-trip check; not used
// internally by the command stack itself (that stays pure do()/undo() command pattern, see
// history.ts).

import type * as THREE from "three";
import { walkScene, isModifierClone } from "./scene-utils.ts";
import { collectMaterials, snapshotMaterial, type MaterialSnapshot } from "./material.ts";

export interface ModifierRecord {
  mirror?: { axis: "x" | "y" | "z"; enabled: boolean };
  array?: { count: number; offset: [number, number, number] };
}

/** Read-only accessor S2's editor instance hands to the serializer for modifier bookkeeping. */
export type ModifierStateReader = (uuid: string) => ModifierRecord | undefined;

export interface SerializedObject {
  uuid: string;
  parentUuid: string | null;
  type: string; // THREE's own Object3D.type string (Mesh, PointLight, PerspectiveCamera, Group, ...)
  name: string;
  visible: boolean;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
  materials: MaterialSnapshot[];
  modifiers: ModifierRecord | null;
}

export interface BloomSnapshot {
  enabled: boolean;
  strength: number;
  radius: number;
  threshold: number;
}

export interface CanonicalState {
  objects: SerializedObject[]; // sorted by uuid, deterministic
  postFX: BloomSnapshot;
}

export function serializeState(
  scene: THREE.Scene,
  readModifier: ModifierStateReader,
  postFXBloom: BloomSnapshot,
): CanonicalState {
  const objects: SerializedObject[] = [];
  walkScene(scene, (obj) => {
    // Mirror/array clones are regenerated (fresh uuid) on every apply() rebuild (modifiers.ts) —
    // they are a DERIVED, unstable-identity view of the source's modifier params, which are
    // already captured below via `modifiers`. Including the clone objects themselves here would
    // make the canonical state depend on clone-rebuild identity rather than editor state.
    if (isModifierClone(obj)) return;
    const mats = collectMaterials(obj).map((m) => snapshotMaterial(m));
    objects.push({
      uuid: obj.uuid,
      parentUuid: obj.parent ? obj.parent.uuid : null,
      type: obj.type,
      name: obj.name,
      visible: obj.visible,
      position: [obj.position.x, obj.position.y, obj.position.z],
      quaternion: [obj.quaternion.x, obj.quaternion.y, obj.quaternion.z, obj.quaternion.w],
      scale: [obj.scale.x, obj.scale.y, obj.scale.z],
      materials: mats,
      modifiers: readModifier(obj.uuid) ?? null,
    });
  });
  objects.sort((a, b) => (a.uuid < b.uuid ? -1 : a.uuid > b.uuid ? 1 : 0));
  return { objects, postFX: { ...postFXBloom } };
}

function numClose(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}

function vecClose(a: readonly number[], b: readonly number[], eps: number): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => numClose(v, b[i], eps));
}

function materialsClose(a: MaterialSnapshot[], b: MaterialSnapshot[], eps: number): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.color !== y.color) return false;
    if (x.emissive !== y.emissive) return false;
    if ((x.roughness === null) !== (y.roughness === null)) return false;
    if (x.roughness !== null && y.roughness !== null && !numClose(x.roughness, y.roughness, eps)) return false;
    if ((x.metalness === null) !== (y.metalness === null)) return false;
    if (x.metalness !== null && y.metalness !== null && !numClose(x.metalness, y.metalness, eps)) return false;
    if ((x.emissiveIntensity === null) !== (y.emissiveIntensity === null)) return false;
    if (
      x.emissiveIntensity !== null &&
      y.emissiveIntensity !== null &&
      !numClose(x.emissiveIntensity, y.emissiveIntensity, eps)
    )
      return false;
  }
  return true;
}

function modifiersEqual(a: ModifierRecord | null, b: ModifierRecord | null, eps: number): boolean {
  const am = a?.mirror ?? null;
  const bm = b?.mirror ?? null;
  if ((am === null) !== (bm === null)) return false;
  if (am && bm && (am.axis !== bm.axis || am.enabled !== bm.enabled)) return false;
  const aa = a?.array ?? null;
  const ba = b?.array ?? null;
  if ((aa === null) !== (ba === null)) return false;
  if (aa && ba) {
    if (aa.count !== ba.count) return false;
    if (!vecClose(aa.offset, ba.offset, eps)) return false;
  }
  return true;
}

/** Deep-equal comparison at float tolerance `eps` (default 1e-5, SCOPE.md target-1 tolerance). */
export function statesEqual(a: CanonicalState, b: CanonicalState, eps = 1e-5): boolean {
  if (a.objects.length !== b.objects.length) return false;
  for (let i = 0; i < a.objects.length; i++) {
    const x = a.objects[i];
    const y = b.objects[i];
    if (x.uuid !== y.uuid) return false;
    if (x.parentUuid !== y.parentUuid) return false;
    if (x.type !== y.type) return false;
    if (x.name !== y.name) return false;
    if (x.visible !== y.visible) return false;
    if (!vecClose(x.position, y.position, eps)) return false;
    if (!vecClose(x.quaternion, y.quaternion, eps)) return false;
    if (!vecClose(x.scale, y.scale, eps)) return false;
    if (!materialsClose(x.materials, y.materials, eps)) return false;
    if (!modifiersEqual(x.modifiers, y.modifiers, eps)) return false;
  }
  if (a.postFX.enabled !== b.postFX.enabled) return false;
  if (!numClose(a.postFX.strength, b.postFX.strength, eps)) return false;
  if (!numClose(a.postFX.radius, b.postFX.radius, eps)) return false;
  if (!numClose(a.postFX.threshold, b.postFX.threshold, eps)) return false;
  return true;
}
