// src/project/scene.ts
//
// Wave 3 Function 2 (project v2 + local recovery). Bridges the live editor scene graph and the
// serializable SceneV2 shape in src/project/format.ts. Browser-only (imports three.js) — unlike
// format.ts, this module is not required to be Node-testable.

import * as THREE from "three";
import type { ModifierRecord, BloomSnapshot } from "../editor/state.ts";
import type { EditorHandle, AddPayload } from "../editor/types.ts";
import { walkScene, isModifierClone } from "../editor/scene-utils.ts";
import { collectMaterials, snapshotMaterial } from "../editor/material.ts";
import type { ProjectDocumentV2, SceneObjectV2, SceneV2 } from "./format.ts";

function hexNumberToString(value: number | null): string {
  const n = value ?? 0xffffff;
  return `#${n.toString(16).padStart(6, "0")}`;
}

function hexStringToNumber(value: string): number {
  return parseInt(value.slice(1), 16);
}

/**
 * Walks `scene`, capturing every editor-created object (tagged `userData.studioAdd` by
 * src/editor/add.ts) into the serializable SceneV2 shape: transform, visibility, material (via
 * snapshotMaterial), light color/intensity, and modifier state (via `readModifier`). Mirror/array
 * clones are excluded — they are a derived, unstable-identity view of the source's modifier
 * params, which are already captured through `modifiers` (same rule state.ts's serializeState
 * follows for the undo/redo canonical state).
 */
export function captureScene(
  scene: THREE.Scene,
  readModifier: (uuid: string) => ModifierRecord | undefined,
  postFX: BloomSnapshot,
): SceneV2 {
  const objects: SceneObjectV2[] = [];

  walkScene(scene, (obj) => {
    if (isModifierClone(obj)) return;
    const tag = obj.userData?.studioAdd as { kind?: unknown } | undefined;
    if (!tag || typeof tag.kind !== "string") return;

    const entry: SceneObjectV2 = {
      kind: tag.kind as AddPayload["kind"],
      name: obj.name,
      visible: obj.visible,
      position: [obj.position.x, obj.position.y, obj.position.z],
      quaternion: [obj.quaternion.x, obj.quaternion.y, obj.quaternion.z, obj.quaternion.w],
      scale: [obj.scale.x, obj.scale.y, obj.scale.z],
    };

    const materials = collectMaterials(obj);
    if (materials.length > 0) {
      const snap = snapshotMaterial(materials[0]);
      entry.material = {
        color: hexNumberToString(snap.color),
        roughness: snap.roughness,
        metalness: snap.metalness,
        emissive: hexNumberToString(snap.emissive),
        emissiveIntensity: snap.emissiveIntensity,
      };
    }

    const maybeLight = obj as unknown as { isLight?: boolean; color?: THREE.Color; intensity?: number };
    if (maybeLight.isLight && maybeLight.color) {
      entry.light = { color: `#${maybeLight.color.getHexString()}`, intensity: maybeLight.intensity ?? 0 };
    }

    entry.modifiers = readModifier(obj.uuid) ?? null;

    objects.push(entry);
  });

  return { objects, postFX: { ...postFX } };
}

/**
 * Replays `doc.scene.objects` through the frozen `editor.ops` surface, rebuilding lights,
 * cameras, and primitives (with their material, light, and modifier state) and restoring bloom.
 * Returns the count of objects restored.
 */
export function restoreScene(doc: ProjectDocumentV2, editor: EditorHandle): number {
  let restored = 0;

  for (const entry of doc.scene.objects) {
    const obj = editor.ops.add({ kind: entry.kind, at: entry.position }) as THREE.Object3D;

    const quat = new THREE.Quaternion(entry.quaternion[0], entry.quaternion[1], entry.quaternion[2], entry.quaternion[3]);
    const euler = new THREE.Euler().setFromQuaternion(quat);
    editor.ops.setTransform(obj, {
      position: entry.position,
      rotation: [euler.x, euler.y, euler.z],
      scale: entry.scale,
    });

    obj.name = entry.name;
    obj.visible = entry.visible;

    if (entry.material) {
      editor.ops.setMaterial(obj, {
        color: hexStringToNumber(entry.material.color),
        roughness: entry.material.roughness ?? undefined,
        metalness: entry.material.metalness ?? undefined,
        emissive: hexStringToNumber(entry.material.emissive),
        emissiveIntensity: entry.material.emissiveIntensity ?? undefined,
      });
    }

    if (entry.light) {
      const maybeLight = obj as unknown as { color?: THREE.Color; intensity?: number };
      if (maybeLight.color) maybeLight.color.set(entry.light.color);
      maybeLight.intensity = entry.light.intensity;
    }

    if (entry.modifiers?.mirror) {
      editor.ops.setMirror(obj, entry.modifiers.mirror.axis, entry.modifiers.mirror.enabled);
    }
    if (entry.modifiers?.array) {
      editor.ops.setArray(obj, entry.modifiers.array.count, entry.modifiers.array.offset);
    }

    restored += 1;
  }

  editor.ops.setPostFX({
    bloom: {
      enabled: doc.scene.postFX.enabled,
      strength: doc.scene.postFX.strength,
      radius: doc.scene.postFX.radius,
      threshold: doc.scene.postFX.threshold,
    },
  });

  return restored;
}
