// src/editor/add.ts
//
// Target 4: add light / camera / primitive, each wrapped as an undoable add-op.

import * as THREE from "three";
import type { AddPayload } from "./types.ts";
import { prepMaterials } from "./material.ts";

export function createObjectFromPayload(payload: AddPayload, renderer?: THREE.WebGLRenderer): THREE.Object3D {
  const at = payload.at ?? [0, 0, 0];
  let obj: THREE.Object3D;

  switch (payload.kind) {
    case "light-point": {
      const l = new THREE.PointLight(0xffffff, 5, 0, 2);
      l.position.set(at[0], at[1], at[2]);
      obj = l;
      break;
    }
    case "light-directional": {
      const l = new THREE.DirectionalLight(0xffffff, 2);
      l.position.set(at[0] || 2, at[1] || 3, at[2] || 2);
      obj = l;
      break;
    }
    case "light-spot": {
      const l = new THREE.SpotLight(0xffffff, 8, 0, Math.PI / 6, 0.3, 1);
      l.position.set(at[0], at[1] || 3, at[2]);
      obj = l;
      break;
    }
    case "camera": {
      const c = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
      c.position.set(at[0], at[1], at[2]);
      obj = c;
      break;
    }
    case "primitive-box": {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.6, metalness: 0.0 }),
      );
      m.position.set(at[0], at[1], at[2]);
      obj = m;
      break;
    }
    case "primitive-sphere": {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 32, 16),
        new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.6, metalness: 0.0 }),
      );
      m.position.set(at[0], at[1], at[2]);
      obj = m;
      break;
    }
    case "primitive-cylinder": {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
        new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.6, metalness: 0.0 }),
      );
      m.position.set(at[0], at[1], at[2]);
      obj = m;
      break;
    }
    case "primitive-plane": {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }),
      );
      m.position.set(at[0], at[1], at[2]);
      obj = m;
      break;
    }
    default: {
      const _exhaustive: never = payload.kind;
      throw new Error(`Unknown AddPayload.kind: ${String(_exhaustive)}`);
    }
  }

  if (obj instanceof THREE.Mesh) prepMaterials(obj, renderer);
  // Wave 3 Function 2 (project v2 + local recovery): tags every editor-created object so
  // src/project/scene.ts's captureScene() can tell an authored light/camera/primitive apart from
  // a loaded model's own meshes (which must not be captured into the scene document — they are
  // already covered by the project's model/asset fields).
  obj.userData.studioAdd = { kind: payload.kind };
  return obj;
}
