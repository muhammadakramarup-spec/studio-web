// src/editor/material.ts
//
// Target 5 (PBR material panel). Ports the reference's material bookkeeping shape verbatim —
// reference/lamp360viewer.html:511-539 (`prepMaterials`) — per src/editor/SPEC.md target 5:
// "S2 reuses this shape for its slider panel instead of re-deriving it." Never edits the
// reference file itself.

import * as THREE from "three";
import type { MaterialPatch } from "./types.ts";

export interface MaterialSnapshot {
  color: number | null;
  roughness: number | null;
  metalness: number | null;
  emissive: number | null;
  emissiveIntensity: number | null;
}

type PBRMaterial = THREE.Material & Partial<{
  color: THREE.Color;
  roughness: number;
  metalness: number;
  emissive: THREE.Color;
  emissiveIntensity: number;
  map: THREE.Texture | null;
  normalMap: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
  metalnessMap: THREE.Texture | null;
  aoMap: THREE.Texture | null;
  emissiveMap: THREE.Texture | null;
  side: THREE.Side;
}>;

const MAP_KEYS = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"] as const;

/**
 * Ported from reference/lamp360viewer.html:511-539 (prepMaterials): walks a subtree, forces
 * DoubleSide + max anisotropy on any texture maps, and captures each unique material's original
 * PBR fields into `material.userData.__orig` for later reset. Called once per object S2 adds to
 * the scene (primitives) and may be called by a consumer on a freshly loaded model too.
 */
export function prepMaterials(root: THREE.Object3D, renderer?: THREE.WebGLRenderer): {
  meshes: number;
  tris: number;
  verts: number;
} {
  let meshes = 0;
  let tris = 0;
  let verts = 0;
  const seen = new Set<string>();
  const maxAniso = renderer ? Math.min(16, renderer.capabilities.getMaxAnisotropy() || 8) : 1;

  root.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes += 1;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const g = mesh.geometry;
    if (g) {
      const pos = g.attributes && g.attributes.position ? g.attributes.position.count : 0;
      tris += (g.index ? g.index.count : pos) / 3;
      verts += pos;
    }
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as PBRMaterial[];
    mats.forEach((m) => {
      if (!m || seen.has(m.uuid)) return;
      seen.add(m.uuid);
      m.side = THREE.DoubleSide;
      for (const k of MAP_KEYS) {
        const tex = m[k];
        if (!tex) continue;
        tex.anisotropy = maxAniso;
        tex.needsUpdate = true;
      }
      if (!m.userData.__orig) {
        m.userData.__orig = snapshotMaterial(m) satisfies MaterialSnapshot;
      }
    });
  });

  return { meshes, tris: Math.round(tris), verts };
}

export function snapshotMaterial(m: PBRMaterial): MaterialSnapshot {
  return {
    color: m.color ? m.color.getHex() : null,
    roughness: "roughness" in m ? (m.roughness ?? null) : null,
    metalness: "metalness" in m ? (m.metalness ?? null) : null,
    emissive: m.emissive ? m.emissive.getHex() : null,
    emissiveIntensity: "emissiveIntensity" in m ? (m.emissiveIntensity ?? null) : null,
  };
}

export function applyMaterialSnapshot(m: PBRMaterial, snap: MaterialSnapshot): void {
  if (m.color && snap.color !== null) m.color.setHex(snap.color);
  if ("roughness" in m && snap.roughness !== null) m.roughness = snap.roughness;
  if ("metalness" in m && snap.metalness !== null) m.metalness = snap.metalness;
  if (m.emissive && snap.emissive !== null) m.emissive.setHex(snap.emissive);
  if ("emissiveIntensity" in m && snap.emissiveIntensity !== null) m.emissiveIntensity = snap.emissiveIntensity;
}

export function patchSnapshot(base: MaterialSnapshot, patch: MaterialPatch): MaterialSnapshot {
  return {
    color: patch.color !== undefined ? patch.color : base.color,
    roughness: patch.roughness !== undefined ? patch.roughness : base.roughness,
    metalness: patch.metalness !== undefined ? patch.metalness : base.metalness,
    emissive: patch.emissive !== undefined ? patch.emissive : base.emissive,
    emissiveIntensity: patch.emissiveIntensity !== undefined ? patch.emissiveIntensity : base.emissiveIntensity,
  };
}

/** Collects the unique material list for one object (mesh materials only; array-material safe). */
export function collectMaterials(object: unknown): PBRMaterial[] {
  const mesh = object as THREE.Mesh;
  if (!mesh || !mesh.isMesh || !mesh.material) return [];
  return (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as PBRMaterial[];
}
