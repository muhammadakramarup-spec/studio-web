// src/editor/postfx.ts
//
// Target 8, narrowed to bloom-only by review (reviews/codex_review_S2.md Q1 / SCOPE.md §1):
// "bloom on/off via UnrealBloomPass only, at fixed resolution, with one screenshot-diff check."
// Vignette/grade are stretch, not built here (PostFXPatch keeps the fields for forward-compat
// only — see types.ts).
//
// Hangs off S1's setRenderHook seam (DECISIONS.md #12 / reviews/codex_review_S1.md:7-16): when
// bloom is enabled this installs a render hook that calls composer.render() instead of S1's
// default renderer.render(scene, camera); disabling bloom calls setRenderHook(null) to restore
// the default path exactly — no composer artifacts leak into the plain render.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { StudioLike, PostFXPatch } from "./types.ts";

export interface BloomState {
  enabled: boolean;
  strength: number;
  radius: number;
  threshold: number;
}

export const DEFAULT_BLOOM: BloomState = { enabled: false, strength: 1.2, radius: 0.4, threshold: 0.85 };

export interface PostFXApi {
  readonly state: BloomState;
  apply(state: BloomState): void;
  dispose(): void;
}

export function createPostFX(studio: StudioLike): PostFXApi {
  let composer: EffectComposer | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  let current: BloomState = { ...DEFAULT_BLOOM };

  function buildComposer(): void {
    const size = new THREE.Vector2();
    studio.renderer.getSize(size);
    // "Fixed composer resolution" (SCOPE.md target 8): sized once at build time, not re-synced on
    // resize this wave — S2 owns no resize hook in Wave 2 (src/editor/SPEC.md "What S2 needs").
    const width = Math.max(1, Math.round(size.x));
    const height = Math.max(1, Math.round(size.y));

    composer = new EffectComposer(studio.renderer);
    composer.setSize(width, height);
    composer.addPass(new RenderPass(studio.scene, studio.camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), current.strength, current.radius, current.threshold);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }

  function syncBloomParams(): void {
    if (!bloomPass) return;
    bloomPass.strength = current.strength;
    bloomPass.radius = current.radius;
    bloomPass.threshold = current.threshold;
  }

  return {
    get state() {
      return current;
    },
    apply(state: BloomState): void {
      current = { ...state };
      if (current.enabled) {
        if (!composer) buildComposer();
        syncBloomParams();
        studio.setRenderHook(() => {
          composer!.render();
        });
      } else {
        studio.setRenderHook(null);
      }
    },
    dispose(): void {
      studio.setRenderHook(null);
      composer = null;
      bloomPass = null;
    },
  };
}

export function mergeBloomPatch(base: BloomState, patch: PostFXPatch): BloomState {
  if (!patch.bloom) return base;
  return {
    enabled: patch.bloom.enabled,
    strength: patch.bloom.strength ?? base.strength,
    radius: patch.bloom.radius ?? base.radius,
    threshold: patch.bloom.threshold ?? base.threshold,
  };
}
