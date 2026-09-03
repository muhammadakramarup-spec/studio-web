// src/editor/types.ts
//
// S2 owns this file. It declares:
//   1. The frozen `EditorHandle` surface exactly as signed in SCOPE.md §2 ("S2 — src/editor/index.ts").
//   2. A LOCAL type for the slice of S1's `StudioHandle` that S2 actually consumes.
//
// Per HANDOFF: "declare the shape you need as a local type in src/editor/ and take the studio as
// a parameter" — S2 does not import src/viewer/** (S1 is being built in parallel and its file may
// not exist yet). `StudioLike` below is structurally compatible with S1's real `StudioHandle`
// (src/viewer/studio.d.ts per SCOPE.md §2) for every member S2 uses; assembly wires the real one
// in Wave 3 by passing it where `StudioLike` is expected — that's the whole point of a frozen,
// structural interface.

import type * as THREE from "three";

// ---------------------------------------------------------------------------
// Local shape of S1's StudioHandle that S2 actually needs.
// ---------------------------------------------------------------------------
export interface StudioLike {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  // OrbitControls or any object exposing `.enabled` — S2 only needs to toggle it off/on
  // while a TransformControls gizmo drag is in progress.
  readonly controls?: { enabled: boolean };

  // REVIEW (reviews/codex_review_S1.md:7-16; reviews/codex_review_S2.md:3-7): S1 invokes this
  // hook instead of its own `renderer.render(...)` each frame; `null` restores the default.
  // S2's post-FX composer hangs its render call off this seam.
  setRenderHook(fn: ((deltaSeconds: number) => void) | null): void;
}

// ---------------------------------------------------------------------------
// Frozen EditorHandle surface — SCOPE.md §2, "S2 — src/editor/index.ts". Do not change shapes.
// ---------------------------------------------------------------------------

export type EditorOpKind =
  | "add" | "remove" | "transform" | "material"
  | "mirror" | "array" | "postfx";

export interface EditorOp {
  id: string;
  kind: EditorOpKind;
  label: string;
  do(): void;
  undo(): void;
}

export interface AddPayload {
  kind:
    | "light-point" | "light-directional" | "light-spot"
    | "camera"
    | "primitive-box" | "primitive-sphere" | "primitive-cylinder" | "primitive-plane";
  at?: [number, number, number];
}

export interface MaterialPatch {
  color?: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
}

export interface PostFXPatch {
  bloom?: { enabled: boolean; strength?: number; radius?: number; threshold?: number };
  // vignette/grade fields kept for forward-compat; not exercised by any committed check today —
  // see SCOPE.md commitment table Stretch column and reviews/codex_review_S2.md:1.
  vignette?: { enabled: boolean; amount?: number };
  grade?: { exposure?: number; contrast?: number; saturation?: number };
}

export interface OutlinerRow {
  id: string;
  name: string;
  type: "Mesh" | "Light" | "Camera" | "Group"; // NOTE: "Group" kept for type-shape compat only —
  // DECISIONS.md #13 is the binding predicate: a row exists iff
  // obj.isMesh || obj.isLight || obj.isCamera. Group is traversed through, never listed. list()
  // below never emits a "Group" row; the union member exists solely because the frozen type says
  // so (a frozen signature is implemented as frozen, not edited — see CLAUDE.md "Rules").
  object: unknown;
}

export interface EditorHandle {
  undo(): boolean;
  redo(): boolean;
  // REVIEW (reviews/codex_review_S2.md:3-7): lets S4 (and any future silo) submit an
  // externally-constructed command to the same undo/redo history.
  execute(op: EditorOp): void;
  ops: {
    add(payload: AddPayload): unknown;
    remove(object: unknown): void;
    setTransform(object: unknown, patch: {
      position?: [number, number, number];
      rotation?: [number, number, number];
      scale?: [number, number, number];
    }): void;
    setMaterial(object: unknown, patch: MaterialPatch): void;
    setMirror(object: unknown, axis: "x" | "y" | "z", enabled: boolean): void;
    setArray(object: unknown, count: number, offset: [number, number, number]): void; // count = total visible incl. source, reviews/codex_review_S2.md:15
    setPostFX(patch: PostFXPatch): void;
  };
  select(object: unknown | null): void;
  selection: unknown | null;
  outliner: { list(): OutlinerRow[] };
}

// Test/debug-only escape hatch, NOT part of the frozen EditorHandle surface above (SCOPE.md §2's
// signed text has no such member) — attachEditor() still returns exactly EditorHandle for every
// typed consumer, but the actual runtime object also carries a `__test` property of this shape so
// tests/s2.spec.ts can reach the raycast/gizmo internals and the canonical-state serializer
// without re-implementing them. See index.ts's EditorTestHooks + the `(handle as ...).__test =`
// assignment there for where this is attached.
