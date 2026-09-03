// src/ai/testHarness.ts — TEST-ONLY minimal three.js scene for tests/s6.spec.ts.
//
// SCOPE.md: "S1 is being built in parallel: do not import it, take the studio as a parameter
// typed against the frozen StudioHandle shape, and test against a minimal local three scene."
// This file contains no import from src/viewer anywhere — it is a self-contained scene good
// enough to prove studio.loadModel(...) places a visible mesh, nothing more. It is not shipped
// as part of the AI feature surface; it exists purely so tests/s6.spec.ts can exercise the
// avatar-tile handoff without a runtime dependency on S1.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Minimal shape matching the bits of the frozen StudioHandle (SCOPE.md §2) that S6 actually
// calls: loadModel(source, name?) -> Promise<{ id, name, stats }>. Defined locally rather than
// imported from src/viewer/studio.d.ts, per the instruction above.
export interface MiniModelHandle {
  id: string;
  name: string;
  stats: { tris: number; verts: number; meshes: number; materials: number; textures: number };
}

export interface MiniStudio {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  loadModel(source: string, name?: string): Promise<MiniModelHandle>;
  renderOnce(): void;
  capture(size: number): Uint8Array;
}

export function createMiniStudio(canvas: HTMLCanvasElement, size = 256): MiniStudio {
  canvas.width = size;
  canvas.height = size;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x11151c);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  camera.position.set(0, 1.4, 3.2);
  camera.lookAt(0, 1, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x333344, 1.2);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.5);
  dir.position.set(2, 3, 2);
  scene.add(dir);

  const loader = new GLTFLoader();

  function renderOnce(): void {
    renderer.render(scene, camera);
  }

  function capture(captureSize: number): Uint8Array {
    const gl = renderer.getContext() as WebGLRenderingContext;
    const buf = new Uint8Array(captureSize * captureSize * 4);
    gl.readPixels(0, 0, captureSize, captureSize, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return buf;
  }

  async function loadModel(source: string, name = 'model'): Promise<MiniModelHandle> {
    const gltf = await loader.loadAsync(source);
    const root = gltf.scene;

    let tris = 0;
    let verts = 0;
    let meshes = 0;
    const materials = new Set<unknown>();
    const textures = new Set<unknown>();
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      // isMesh is true for Mesh AND its subclasses (e.g. SkinnedMesh, used by rigged
      // characters) — comparing .type alone misses SkinnedMesh, which is exactly what the
      // Kenney rigged avatar tile (32 animation clips) uses.
      if ((obj as unknown as { isMesh?: boolean }).isMesh && mesh.geometry) {
        meshes += 1;
        const geo = mesh.geometry;
        const posAttr = geo.getAttribute('position');
        if (posAttr) verts += posAttr.count;
        if (geo.index) tris += geo.index.count / 3;
        else if (posAttr) tris += posAttr.count / 3;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (!m) continue;
          materials.add(m);
          const mm = m as THREE.MeshStandardMaterial;
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const) {
            const tex = mm[key];
            if (tex) textures.add(tex);
          }
        }
      }
    });

    // Frame the loaded model roughly so it is visible in a 256x256 capture.
    const box = new THREE.Box3().setFromObject(root);
    const centre = box.getCenter(new THREE.Vector3());
    const sizeVec = box.getSize(new THREE.Vector3());
    const height = Math.max(sizeVec.y, 0.01);
    root.position.x -= centre.x;
    root.position.z -= centre.z;
    root.position.y -= box.min.y;
    camera.position.set(0, height * 0.6, height * 2.2 + 1);
    camera.lookAt(0, height * 0.5, 0);
    camera.updateProjectionMatrix();

    scene.add(root);

    return {
      id: `${name}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      stats: { tris: Math.round(tris), verts, meshes, materials: materials.size, textures: textures.size },
    };
  }

  return { scene, camera, renderer, loadModel, renderOnce, capture };
}
