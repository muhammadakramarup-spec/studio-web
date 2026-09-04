// src/viewer/studio.ts — S1 Viewer core public surface.
// Frozen interface per SCOPE.md §2 "S1 — src/viewer/studio.d.ts". Types below are
// byte-shape-identical to that block (plus the REVIEW-mandated setRenderHook).
// Behaviour ported from reference/lamp360viewer.html (never edited) per DECISIONS.md #12:
// the reviewed shape, not the original r128 SPEC shape, wherever the two differ.
//
// S1 is engine-only: no HTML/CSS, no keyboard shortcuts, no localStorage.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { buildZip } from "./zip.ts";

// ---------------------------------------------------------------- public types

export interface StudioOptions {
  canvas: HTMLCanvasElement;
  pixelRatioCap?: number; // default 2, matches reference/lamp360viewer.html:337
}

export interface ModelStats {
  tris: number;
  verts: number;
  meshes: number;
  materials: number;
  textures: number;
}

export interface MaterialInfo {
  index: number;
  name: string;
  color: string | null;
  roughness: number | null;
  metalness: number | null;
  metallicFactorFlagged: boolean;
}

export interface ModelHandle {
  id: string;
  name: string;
  stats: ModelStats;
  raw: { x: number; y: number; z: number };
  materials: MaterialInfo[];
}

export type EnvKind = "room" | "studio" | "hdr";
export type FocalMM = 24 | 35 | 50 | 85 | 135;
export type ViewPreset = 0 | 90 | 180 | 270 | "top";
export type ToneMappingName = "aces" | "filmic" | "reinhard" | "linear" | "none";
export type ExportResolution = "1024x1024" | "2048x2048" | "1920x1080" | "1080x1350" | "viewport";
export type FrameCount = 24 | 36 | 72;

export interface StudioHandle {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly pivot: THREE.Group;

  loadModel(source: File | Blob | string, name?: string): Promise<ModelHandle>;
  removeModel(id: string): void;
  selectModel(id: string): void;
  getActiveModel(): ModelHandle | null;

  loadEnvironment(source: File | Blob | string, label?: string): Promise<void>;
  setEnvironment(kind: EnvKind): void;
  setEnvRotation(deg: number): void;
  setEnvIntensity(factor: number): void;

  setFocalLength(mm: FocalMM): void;
  setView(preset: ViewPreset): void;
  frameActive(): void;

  setToneMapping(name: ToneMappingName): void;
  setExposure(factor: number): void;
  setTransparent(on: boolean): void;
  setSpin(on: boolean, degPerSec?: number): void;
  setShadows(on: boolean): void;
  setFloor(on: boolean): void;

  demetalizeActive(): void;

  exportPNG(res: ExportResolution): Promise<Blob>;
  exportGLB(): Promise<Blob>;
  exportGLTF(): Promise<Blob>;
  /** A Blender-friendly ZIP containing GLB, GLTF, and import instructions. */
  exportBlenderPackage(): Promise<Blob>;
  exportSequence(
    res: ExportResolution,
    frames: FrameCount,
    onProgress?: (fraction: number) => void,
  ): Promise<Blob>;
  exportWebM(
    res: ExportResolution,
    frames: FrameCount,
    fps: 24 | 30,
    onProgress?: (fraction: number) => void,
  ): Promise<Blob | null>;

  // REVIEW (reviews/codex_review_S1.md:7-16; reviews/codex_review_S2.md:3-7 — found
  // independently by both reviews): the render-loop seam S2's EffectComposer needs.
  setRenderHook(fn: ((deltaSeconds: number) => void) | null): void;

  cancelExport(): void;
  resize(): void;
  dispose(): void;

  readonly debug: {
    ready(): boolean;
    renderOnce(): void;
    snap(px?: number): string;
    state(): Record<string, unknown>;
    matInfo(): MaterialInfo[];
  };
}

// --------------------------------------------------------------- internal types

interface ModelEntry {
  id: string;
  name: string;
  root: THREE.Group;
  mats: THREE.Material[];
  stats: ModelStats;
  raw: { x: number; y: number; z: number };
  halfH: number;
  halfW: number; // worst-case (diagonal) horizontal half-extent — safe for continuous spin/orbit
  halfX: number; // per-axis half-extent, normalized-to-unit-height space
  halfZ: number;
  radius: number;
}

const FOCALS: FocalMM[] = [24, 35, 50, 85, 135];
const ELEV = (12 * Math.PI) / 180; // product-shot elevation above the target, reference:566

const TONE_MAP: Record<ToneMappingName, THREE.ToneMapping> = {
  aces: THREE.ACESFilmicToneMapping,
  filmic: THREE.CineonToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  linear: THREE.LinearToneMapping,
  none: THREE.NoToneMapping,
};

// -------------------------------------------------------------------- helpers

function parseRes(res: ExportResolution, canvasEl: HTMLCanvasElement, prCap: number): [number, number] {
  if (res === "viewport") {
    const pr = Math.min(devicePixelRatio || 1, prCap);
    return [
      Math.max(2, Math.round(canvasEl.clientWidth * pr)),
      Math.max(2, Math.round(canvasEl.clientHeight * pr)),
    ];
  }
  const [w, h] = res.split("x").map(Number);
  return [w, h];
}

function resolveSourceURL(source: File | Blob | string): { url: string; revoke: boolean } {
  if (typeof source === "string") return { url: source, revoke: false };
  return { url: URL.createObjectURL(source), revoke: true };
}

function raf(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const fin = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    requestAnimationFrame(fin);
    // rAF stalls in a background tab; race it against a timer so exports
    // finish either way (reference/lamp360viewer.html:948-951).
    setTimeout(fin, 60);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ------------------------------------------------------------------ createStudio

export function createStudio(opts: StudioOptions): StudioHandle {
  const canvasEl = opts.canvas;
  const pixelRatioCap = opts.pixelRatioCap ?? 2;

  // ---------------------------------------------------------- renderer + scene
  // alpha:true is needed for the transparent export mode (Target 4); it does
  // not change the opaque look since scene.background clears at alpha 1.
  // preserveDrawingBuffer stays on — every PNG export depends on it.
  const renderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, pixelRatioCap));
  renderer.setSize(canvasEl.clientWidth || 1, canvasEl.clientHeight || 1, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace; // r170: replaces outputEncoding=sRGBEncoding
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 0.3;
  controls.maxDistance = 6;

  let bgColor = new THREE.Color(0x101317);
  scene.background = bgColor;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 0.35);
  scene.add(hemi);
  const keyL = new THREE.DirectionalLight(0xfff4e6, 1.5);
  keyL.position.set(2.2, 3.2, 2.4);
  keyL.castShadow = true;
  keyL.shadow.mapSize.set(2048, 2048);
  keyL.shadow.camera.near = 0.5;
  keyL.shadow.camera.far = 12;
  keyL.shadow.camera.left = -1.4;
  keyL.shadow.camera.right = 1.4;
  keyL.shadow.camera.top = 1.4;
  keyL.shadow.camera.bottom = -1.4;
  keyL.shadow.bias = -0.0006;
  keyL.shadow.radius = 3;
  scene.add(keyL);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.45);
  fill.position.set(-3, 1.4, 1.6);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.7);
  rim.position.set(-1.2, 2.2, -3);
  scene.add(rim);

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1e22, roughness: 0.92, metalness: 0 });
  const catcherMat = new THREE.ShadowMaterial({ opacity: 0.36 });
  const floor = new THREE.Mesh<THREE.CircleGeometry, THREE.Material>(new THREE.CircleGeometry(6, 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const pivot = new THREE.Group();
  scene.add(pivot);

  // ----------------------------------------------------------------- loaders
  // Draco decoder served from the already-installed three package under
  // node_modules rather than a CDN (SPEC.md risk 3 mitigation) — no file may
  // be added outside src/viewer/** (SCOPE.md #20 ownership), and this path is
  // Vite-dev-served without needing a public/ asset.
  const draco = new DRACOLoader();
  draco.setDecoderPath("/node_modules/three/examples/jsm/libs/draco/gltf/");
  draco.setDecoderConfig({ type: "wasm" });
  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(draco);

  // -------------------------------------------------------------- environment
  const pmrem = new THREE.PMREMGenerator(renderer);
  try {
    pmrem.compileEquirectangularShader();
  } catch {
    /* non-fatal on WebGL contexts that don't need it */
  }

  let envKind: EnvKind = "room";
  let envRotDeg = 0;
  let envIntensity = 1;
  let hdrTexture: THREE.Texture | null = null;
  let envRT: THREE.WebGLRenderTarget | null = null;

  function buildProceduralEnvScene(kind: "room" | "studio"): THREE.Scene {
    if (kind === "room") return new RoomEnvironment() as unknown as THREE.Scene;
    // studio: procedural softbox rig, ported from reference/lamp360viewer.html:405-421
    const s = new THREE.Scene();
    const room = new THREE.Mesh(
      new THREE.BoxGeometry(20, 13, 20),
      new THREE.MeshBasicMaterial({ color: 0x0e0e10, side: THREE.BackSide }),
    );
    s.add(room);
    const panel = (w: number, h: number, x: number, y: number, z: number, intensity: number, tint?: number) => {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(intensity) });
      if (tint) m.color.multiply(new THREE.Color(tint));
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      p.position.set(x, y, z);
      p.lookAt(0, 0, 0);
      s.add(p);
    };
    panel(4.5, 4.5, 3.0, 2.6, 3.0, 20);
    panel(5.5, 3.2, -3.8, 1.4, 1.8, 5, 0xd8e4ff);
    panel(6.5, 1.6, 0.0, 4.2, -3.2, 11);
    panel(8.0, 8.0, 0.0, -2.2, 0.0, 1.4, 0xfff0dd);
    return s;
  }

  function rebuildEnvMap(): void {
    let rt: THREE.WebGLRenderTarget;
    // REVIEW (reviews/codex_review_S1.md:25): HDR path uses fromEquirectangular,
    // never fromScene — fromScene stays reserved for the procedural room/studio envs.
    if (envKind === "hdr") {
      if (!hdrTexture) return; // no HDR loaded yet — leave existing environment as-is
      rt = pmrem.fromEquirectangular(hdrTexture);
    } else {
      const envScene = buildProceduralEnvScene(envKind);
      rt = pmrem.fromScene(envScene, 0.02, 0.1, 100);
    }
    if (envRT) envRT.dispose();
    envRT = rt;
    scene.environment = rt.texture;
    // r170: rotation/intensity apply uniformly at render time, no re-bake needed.
    scene.environmentRotation.y = (envRotDeg * Math.PI) / 180;
    scene.environmentIntensity = envIntensity;
  }

  function setEnvironment(kind: EnvKind): void {
    envKind = kind;
    if (kind === "hdr" && !hdrTexture) return; // nothing to show yet
    rebuildEnvMap();
  }

  function setEnvRotation(deg: number): void {
    envRotDeg = deg;
    scene.environmentRotation.y = (deg * Math.PI) / 180;
  }

  function setEnvIntensity(factor: number): void {
    envIntensity = factor;
    scene.environmentIntensity = factor;
  }

  async function loadEnvironment(source: File | Blob | string, label?: string): Promise<void> {
    const { url, revoke } = resolveSourceURL(source);
    const loader = new RGBELoader(); // .hdr only, v1 — .exr cut per SPEC.md §3
    await new Promise<void>((resolve, reject) => {
      loader.load(
        url,
        (tex) => {
          tex.mapping = THREE.EquirectangularReflectionMapping;
          if (hdrTexture) hdrTexture.dispose();
          hdrTexture = tex;
          envKind = "hdr";
          rebuildEnvMap();
          if (revoke) URL.revokeObjectURL(url);
          resolve();
        },
        undefined,
        (err) => {
          if (revoke) URL.revokeObjectURL(url);
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    });
    void label; // reserved for UI display, not part of S1's engine-only surface
  }

  // seed a default environment so the very first render already has one
  setEnvironment("room");

  // ---------------------------------------------------------------- materials

  const MAX_ANISO = Math.min(16, renderer.capabilities.getMaxAnisotropy() || 8);

  function prepMaterials(root: THREE.Group): { mats: THREE.Material[]; stats: ModelStats } {
    const mats: THREE.Material[] = [];
    const seen = new Set<string>();
    const texSeen = new Set<string>();
    let meshes = 0;
    let tris = 0;
    let verts = 0;

    root.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (!(mesh as any).isMesh) return;
      meshes++;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const g = mesh.geometry;
      if (g) {
        const pos = g.attributes?.position;
        const pc = pos ? pos.count : 0;
        tris += (g.index ? g.index.count : pc) / 3;
        verts += pc;
      }
      const ms = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      ms.forEach((m) => {
        if (!m || seen.has(m.uuid)) return;
        seen.add(m.uuid);
        (m as any).side = THREE.DoubleSide;
        (["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"] as const).forEach((k) => {
          const tex = (m as any)[k] as THREE.Texture | undefined;
          if (!tex) return;
          tex.anisotropy = MAX_ANISO;
          tex.needsUpdate = true;
          if (!texSeen.has(tex.uuid)) texSeen.add(tex.uuid);
        });
        mats.push(m);
      });
    });

    return {
      mats,
      stats: { tris: Math.round(tris), verts, meshes, materials: mats.length, textures: texSeen.size },
    };
  }

  function materialInfo(m: THREE.Material, index: number): MaterialInfo {
    const anyM = m as any;
    const hasColor = !!anyM.color;
    const hasRough = "roughness" in anyM;
    const hasMetal = "metalness" in anyM;
    const flagged = hasMetal && !anyM.metalnessMap && anyM.metalness > 0.9;
    return {
      index,
      name: m.name && m.name.trim() ? m.name : `Material ${index + 1}`,
      color: hasColor ? `#${anyM.color.getHexString()}` : null,
      roughness: hasRough ? anyM.roughness : null,
      metalness: hasMetal ? anyM.metalness : null,
      metallicFactorFlagged: flagged,
    };
  }

  // -------------------------------------------------------------- framing maths

  function vfovDeg(aspect: number, mm: number): number {
    const fh = camera.filmGauge / Math.max(aspect, 1);
    return (2 * Math.atan((0.5 * fh) / mm) * 180) / Math.PI;
  }
  function applyFocalFor(aspect: number): void {
    camera.fov = vfovDeg(aspect, focalMM);
    camera.updateProjectionMatrix();
  }
  function idealDist(aspect: number): number {
    const hh = activeEntry ? activeEntry.halfH : 0.5;
    const hw = activeEntry ? activeEntry.halfW : 0.5;
    const vf = (vfovDeg(aspect, focalMM) * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    return Math.max(hh / Math.tan(vf / 2), hw / Math.tan(hf / 2)) * 1.25;
  }
  function zoomFactor(): number {
    const d = camera.position.distanceTo(controls.target);
    return d / idealDist(camera.aspect);
  }
  function setDistance(d: number): void {
    const v = new THREE.Vector3().subVectors(camera.position, controls.target).setLength(d);
    camera.position.copy(controls.target).add(v);
  }
  function clampRange(): void {
    const d = idealDist(camera.aspect);
    controls.minDistance = d * 0.12;
    controls.maxDistance = d * 3.2;
  }
  function setFocalInternal(mm: FocalMM, keepZoom = true): void {
    const k = keepZoom ? zoomFactor() : 1;
    focalMM = mm;
    applyFocalFor(camera.aspect);
    setDistance(idealDist(camera.aspect) * k);
    clampRange();
    controls.update();
  }

  // Distance to fit a SPECIFIC static view tightly (Target 2's framing check
  // measures exactly this: bbox height at 5 fixed views, 55-80% of frame).
  // idealDist() above stays diagonal-based/worst-case for continuous spin and
  // free-orbit zoom bounds (clampRange) so the object never clips
  // mid-rotation; this is only used to place the camera for a discrete
  // preset.
  //
  // A closed-form fit (reference/lamp360viewer.html's max(hh,hw)*1.25), and
  // even an exact analytic solve against the world-space AABB's 8 corners,
  // both turn out wrong here: real furniture geometry doesn't touch all 8
  // corners of its own bounding box at once (the tall part and the wide part
  // are rarely at the same X/Z), so a corner-projection estimate of "how
  // tall the object looks" can overstate the actual rendered silhouette by
  // a wide margin — verified against this GLB set, off by up to ~30
  // percentage points for some files/views. Solved by measurement instead:
  // binary-search the distance where an actual small offscreen render of the
  // model (alpha-channel silhouette, exactly how Target 2's own acceptance
  // check measures it) puts the bbox height at the band's midpoint. Exact
  // for any mesh shape because it renders the real mesh, not an idealisation
  // of it.
  const FRAMING_TARGET_FILL = 0.68; // midpoint of the committed 55-80% band
  const FRAMING_RT_W = 96;
  let framingRT: THREE.WebGLRenderTarget | null = null;

  function positionCameraForPreset(preset: ViewPreset, d: number): void {
    if (preset === "top") {
      camera.position.set(0, 0.5 + d, 0.001);
    } else {
      const a = (Number(preset) * Math.PI) / 180;
      camera.position.set(Math.sin(a) * d * Math.cos(ELEV), 0.5 + d * Math.sin(ELEV), Math.cos(a) * d * Math.cos(ELEV));
    }
    camera.lookAt(0, 0.5, 0);
    camera.updateMatrixWorld(true);
  }

  function measuredHeightFill(preset: ViewPreset, d: number, aspect: number): number {
    if (!activeEntry) return 0;
    const rtH = Math.max(2, Math.round(FRAMING_RT_W / aspect));
    if (!framingRT || framingRT.width !== FRAMING_RT_W || framingRT.height !== rtH) {
      if (framingRT) framingRT.dispose();
      framingRT = new THREE.WebGLRenderTarget(FRAMING_RT_W, rtH);
    }
    positionCameraForPreset(preset, d);

    const prevTarget = renderer.getRenderTarget();
    const prevBackground = scene.background;
    const prevClearColor = new THREE.Color();
    renderer.getClearColor(prevClearColor);
    const prevClearAlpha = renderer.getClearAlpha();
    const prevFloorVisible = floor.visible;

    scene.background = null;
    renderer.setClearColor(0x000000, 0);
    floor.visible = false;
    renderer.setRenderTarget(framingRT);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);

    const buf = new Uint8Array(FRAMING_RT_W * rtH * 4);
    renderer.readRenderTargetPixels(framingRT, 0, 0, FRAMING_RT_W, rtH, buf);

    renderer.setRenderTarget(prevTarget);
    scene.background = prevBackground;
    renderer.setClearColor(prevClearColor, prevClearAlpha);
    floor.visible = prevFloorVisible;

    let minRow = -1;
    let maxRow = -1;
    for (let y = 0; y < rtH; y++) {
      let rowHas = false;
      for (let x = 0; x < FRAMING_RT_W; x++) {
        if (buf[(y * FRAMING_RT_W + x) * 4 + 3] > 10) {
          rowHas = true;
          break;
        }
      }
      if (rowHas) {
        if (minRow < 0) minRow = y;
        maxRow = y;
      }
    }
    if (minRow < 0) return 0;
    return (maxRow - minRow + 1) / rtH;
  }

  function idealDistForPreset(aspect: number, preset: ViewPreset): number {
    if (!activeEntry) return idealDist(aspect);
    applyFocalFor(aspect); // camera.fov must reflect current focalMM/aspect before the measurement render
    let lo = 0.05;
    let hi = 1000;
    // measuredHeightFill is monotonically decreasing in d — plain bisection.
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (measuredHeightFill(preset, mid, aspect) > FRAMING_TARGET_FILL) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function setPhotoAngle(): void {
    controls.target.set(0, 0.5, 0);
    applyFocalFor(camera.aspect);
    const d = idealDistForPreset(camera.aspect, 0);
    camera.position.set(0, 0.5 + d * Math.sin(ELEV), d * Math.cos(ELEV));
    clampRange();
    controls.update();
  }
  function setView(preset: ViewPreset): void {
    controls.target.set(0, 0.5, 0);
    const d = idealDistForPreset(camera.aspect, preset);
    if (preset === "top") {
      camera.position.set(0, 0.5 + d, 0.001);
    } else {
      const a = (Number(preset) * Math.PI) / 180;
      const y = 0.5 + d * Math.sin(ELEV);
      const h = d * Math.cos(ELEV);
      camera.position.set(Math.sin(a) * h, y, Math.cos(a) * h);
      pivot.rotation.y = 0;
    }
    clampRange();
    controls.update();
  }

  function frameModel(entry: ModelEntry): void {
    const obj = entry.root;
    obj.position.set(0, 0, 0);
    obj.scale.setScalar(1);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    entry.raw = { x: size.x, y: size.y, z: size.z };
    const h = size.y || 1;
    const s = 1 / h;
    obj.scale.setScalar(s);
    obj.position.set(-ctr.x * s, -box.min.y * s, -ctr.z * s);
    entry.halfH = 0.5;
    entry.halfW = 0.5 * Math.sqrt(size.x * size.x + size.z * size.z) * s;
    entry.halfX = 0.5 * size.x * s;
    entry.halfZ = 0.5 * size.z * s;
    entry.radius = Math.max(entry.halfH, entry.halfW);
    floor.position.y = 0.0005;
    const ext = Math.max(entry.radius * 1.45, 0.9);
    keyL.shadow.camera.left = -ext;
    keyL.shadow.camera.right = ext;
    keyL.shadow.camera.top = ext;
    keyL.shadow.camera.bottom = -ext;
    keyL.shadow.camera.updateProjectionMatrix();
  }

  function frameActive(): void {
    if (activeEntry) frameModel(activeEntry);
    setPhotoAngle();
  }

  // ----------------------------------------------------------------- model state

  const models = new Map<string, ModelEntry>();
  let activeEntry: ModelEntry | null = null;
  let focalMM: FocalMM = 50;
  let transparentMode = false;
  let spinOn = false;
  let spinDegPerSec = 30;
  let idCounter = 0;

  function toHandle(entry: ModelEntry): ModelHandle {
    return {
      id: entry.id,
      name: entry.name,
      stats: entry.stats,
      raw: entry.raw,
      materials: entry.mats.map((m, i) => materialInfo(m, i)),
    };
  }

  function detachActive(): void {
    if (activeEntry && activeEntry.root.parent) pivot.remove(activeEntry.root);
  }

  function selectModel(id: string): void {
    const entry = models.get(id);
    if (!entry) return;
    detachActive();
    activeEntry = entry;
    pivot.add(entry.root);
    pivot.rotation.y = 0;
    frameModel(entry);
    setPhotoAngle();
  }

  function removeModel(id: string): void {
    const entry = models.get(id);
    if (!entry) return;
    if (entry === activeEntry && entry.root.parent) pivot.remove(entry.root);
    models.delete(id);
    entry.root.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if ((mesh as any).isMesh && mesh.geometry) mesh.geometry.dispose();
    });
    if (entry === activeEntry) {
      activeEntry = null;
      const remaining = [...models.values()];
      if (remaining.length) selectModel(remaining[remaining.length - 1].id);
    }
  }

  async function loadModel(source: File | Blob | string, name?: string): Promise<ModelHandle> {
    const { url, revoke } = resolveSourceURL(source);
    const displayName = name ?? (typeof source === "string" ? source.split("/").pop() ?? "model" : "model");

    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
      gltfLoader.load(
        url,
        (g) => resolve(g as unknown as { scene: THREE.Group }),
        undefined,
        (err) => reject(err instanceof Error ? err : new Error(String(err))),
      );
    });
    if (revoke) URL.revokeObjectURL(url);

    const { mats, stats } = prepMaterials(gltf.scene);
    const entry: ModelEntry = {
      id: `m${++idCounter}`,
      name: displayName,
      root: gltf.scene,
      mats,
      stats,
      raw: { x: 0, y: 0, z: 0 },
      halfH: 0.5,
      halfW: 0.5,
      halfX: 0.5,
      halfZ: 0.5,
      radius: 0.5,
    };
    models.set(entry.id, entry);
    selectModel(entry.id);
    return toHandle(entry);
  }

  function getActiveModel(): ModelHandle | null {
    return activeEntry ? toHandle(activeEntry) : null;
  }

  // --------------------------------------------------------------- transparency

  function applyTransparent(): void {
    if (transparentMode) {
      scene.background = null;
      renderer.setClearColor(0x000000, 0);
      floor.material = catcherMat;
    } else {
      scene.background = bgColor;
      renderer.setClearColor(0x000000, 1);
      floor.material = floorMat;
    }
  }
  function setTransparent(on: boolean): void {
    transparentMode = on;
    applyTransparent();
  }

  // -------------------------------------------------------------- tone/exposure

  function setToneMapping(name: ToneMappingName): void {
    renderer.toneMapping = TONE_MAP[name];
    scene.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (!(mesh as any).isMesh) return;
      const ms = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      ms.forEach((m) => {
        if (m) m.needsUpdate = true;
      });
    });
  }
  function setExposure(factor: number): void {
    renderer.toneMappingExposure = factor;
  }

  function setSpin(on: boolean, degPerSec?: number): void {
    spinOn = on;
    if (degPerSec !== undefined) spinDegPerSec = degPerSec;
  }
  function setShadows(on: boolean): void {
    renderer.shadowMap.enabled = on;
    keyL.castShadow = on;
    floor.receiveShadow = on;
  }
  function setFloor(on: boolean): void {
    floor.visible = on;
  }

  function demetalizeActive(): void {
    if (!activeEntry) return;
    activeEntry.mats.forEach((m) => {
      const anyM = m as any;
      if ("metalness" in anyM && !anyM.metalnessMap) {
        anyM.metalness = 0;
        m.needsUpdate = true;
      }
    });
  }

  // ------------------------------------------------------------------- export

  let exportBusy = false;
  let cancelFlag = false;

  function beginOffscreen(w: number, h: number) {
    const size = renderer.getSize(new THREE.Vector2());
    const st = {
      pr: renderer.getPixelRatio(),
      w: size.x,
      h: size.y,
      aspect: camera.aspect,
      fov: camera.fov,
      pos: camera.position.clone(),
      rot: pivot.rotation.y,
      spin: spinOn,
    };
    const k = zoomFactor();
    spinOn = false;
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    applyFocalFor(w / h);
    setDistance(idealDist(w / h) * k);
    camera.updateProjectionMatrix();
    return st;
  }
  function endOffscreen(st: ReturnType<typeof beginOffscreen>): void {
    renderer.setPixelRatio(st.pr);
    camera.aspect = st.aspect;
    camera.fov = st.fov;
    camera.position.copy(st.pos);
    camera.updateProjectionMatrix();
    pivot.rotation.y = st.rot;
    spinOn = st.spin;
    resize();
  }

  async function exportPNG(res: ExportResolution): Promise<Blob> {
    const [w, h] = parseRes(res, canvasEl, pixelRatioCap);
    const st = beginOffscreen(w, h);
    renderer.render(scene, camera);
    const blob = await new Promise<Blob | null>((resolve) => renderer.domElement.toBlob(resolve, "image/png"));
    endOffscreen(st);
    if (!blob) throw new Error("PNG export failed: canvas.toBlob returned null");
    return blob;
  }

  async function exportGLTF(): Promise<Blob> {
    const exporter = new GLTFExporter();
    const result = await exporter.parseAsync(scene, { binary: false, embedImages: true });
    if (result instanceof ArrayBuffer) {
      throw new Error("GLTF export returned binary data unexpectedly");
    }
    return new Blob([JSON.stringify(result, null, 2)], { type: "model/gltf+json" });
  }

  async function exportGLB(): Promise<Blob> {
    const exporter = new GLTFExporter();
    const result = await exporter.parseAsync(scene, { binary: true, embedImages: true });
    if (!(result instanceof ArrayBuffer)) {
      throw new Error("GLB export returned JSON data unexpectedly");
    }
    return new Blob([result], { type: "model/gltf-binary" });
  }

  async function exportBlenderPackage(): Promise<Blob> {
    const [glb, gltf] = await Promise.all([exportGLB(), exportGLTF()]);
    const readme = new Blob(
      [
        "Studio Web Blender package\n",
        "=========================\n\n",
        "Open studio-scene.glb in Blender with File > Import > glTF 2.0 (.glb/.gltf).\n",
        "The companion studio-scene.gltf is included for tools that prefer JSON glTF.\n\n",
        "This browser export is not a native .blend file. Blender's native .blend format\n",
        "must be saved from Blender after import so it can include Blender-specific data.\n",
      ],
      { type: "text/plain" },
    );
    return buildZip([
      { name: "studio-scene.glb", blob: glb },
      { name: "studio-scene.gltf", blob: gltf },
      { name: "README-Blender.txt", blob: readme },
    ]);
  }

  async function exportSequence(
    res: ExportResolution,
    frames: FrameCount,
    onProgress?: (fraction: number) => void,
  ): Promise<Blob> {
    exportBusy = true;
    cancelFlag = false;
    const [w, h] = parseRes(res, canvasEl, pixelRatioCap);
    const st = beginOffscreen(w, h);
    const base = st.rot;
    const files: { name: string; blob: Blob }[] = [];
    try {
      for (let i = 0; i < frames; i++) {
        if (cancelFlag) break;
        pivot.rotation.y = base + (i * Math.PI * 2) / frames;
        renderer.render(scene, camera);
        const blob = await new Promise<Blob | null>((resolve) => renderer.domElement.toBlob(resolve, "image/png"));
        if (!blob) throw new Error(`ZIP export failed: frame ${i + 1} toBlob returned null`);
        files.push({ name: `frame_${String(i + 1).padStart(4, "0")}.png`, blob });
        onProgress?.(((i + 1) / frames) * 0.85);
        await raf();
      }
    } finally {
      endOffscreen(st);
      exportBusy = false;
    }
    if (cancelFlag) throw new Error("Export cancelled");
    const zip = await buildZip(files);
    onProgress?.(1);
    return zip;
  }

  // exportWebM is a stretch target (DECISIONS.md #12 / SCOPE.md §1): the
  // committed export surface is PNG + the 24-frame ZIP turntable above. This
  // is a best-effort MediaRecorder port of reference/lamp360viewer.html:1011-1055;
  // it returns null rather than throwing whenever the browser can't do it,
  // per the frozen signature's own contract ("null if unsupported").
  async function exportWebM(
    res: ExportResolution,
    frames: FrameCount,
    fps: 24 | 30,
    onProgress?: (fraction: number) => void,
  ): Promise<Blob | null> {
    if (typeof MediaRecorder === "undefined") return null;
    const mimeCandidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported?.(m));
    if (!mime) return null;

    exportBusy = true;
    cancelFlag = false;
    const [w, h] = parseRes(res, canvasEl, pixelRatioCap);
    const st = beginOffscreen(w, h);
    const base = st.rot;
    const WARM = 4;
    const TAIL = 5;

    try {
      const stream = (renderer.domElement as HTMLCanvasElement).captureStream(0);
      const track = stream.getVideoTracks()[0] as any;
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream, { mimeType: mime });
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const stopped = new Promise<void>((resolve) => {
        rec.onstop = () => resolve();
      });
      // A periodic timeslice (rather than a single flush-on-stop) is what
      // makes the chunk-count gate below meaningful: it turns "did data
      // actually flow across the recording" into a signal we can check,
      // instead of one opaque blob that could be near-empty either way.
      const TIMESLICE_MS = 50;
      rec.start(TIMESLICE_MS);

      for (let i = -WARM; i < frames + TAIL; i++) {
        if (cancelFlag) break;
        const angleIndex = Math.min(Math.max(i, 0), frames - 1);
        pivot.rotation.y = base + (angleIndex * Math.PI * 2) / frames;
        renderer.render(scene, camera);
        await raf();
        await raf();
        if (typeof track.requestFrame === "function") track.requestFrame();
        onProgress?.(Math.min(1, Math.max(0, (i + WARM) / (frames + WARM + TAIL))));
      }
      await sleep(300);
      rec.stop();
      await stopped;
      stream.getTracks().forEach((t) => t.stop());

      if (cancelFlag) return null;

      // Frame-completeness plausibility gate (Warden-mandated, replaces a
      // bare "did it throw" check): a broken/truncated capture — e.g. the
      // 110-byte clip seen in QA, essentially an empty container — must
      // never be handed back as a working export. Without decoding the
      // WebM (no ffmpeg available to this suite, matching Q1's own
      // ffmpeg-verification cut), gate on two proxies for "did real encoded
      // video actually flow": enough distinct timeslice chunks to show data
      // was captured across the recording rather than one empty flush, and
      // a byte-size floor scaled to the requested frame count so a
      // one-or-two-keyframe stub can't pass as a complete clip.
      const totalBytes = chunks.reduce((n, c) => n + c.size, 0);
      const minChunks = 3;
      const minBytes = Math.max(20_000, frames * 3_000);
      if (chunks.length < minChunks || totalBytes < minBytes) return null;

      void fps;
      return new Blob(chunks, { type: "video/webm" });
    } catch {
      return null;
    } finally {
      endOffscreen(st);
      exportBusy = false;
    }
  }

  function cancelExport(): void {
    cancelFlag = true;
  }

  // ------------------------------------------------------------- render hook

  let renderHook: ((deltaSeconds: number) => void) | null = null;
  function setRenderHook(fn: ((deltaSeconds: number) => void) | null): void {
    renderHook = fn;
  }

  // --------------------------------------------------------------- resize/dispose

  function resize(): void {
    const w = canvasEl.clientWidth || 1;
    const h = canvasEl.clientHeight || 1;
    camera.aspect = w / h;
    applyFocalFor(camera.aspect);
    renderer.setSize(w, h, false);
    clampRange();
  }

  let disposed = false;
  let rafId = 0;

  function dispose(): void {
    disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    controls.dispose();
    renderer.dispose();
    if (envRT) envRT.dispose();
    if (framingRT) framingRT.dispose();
    pmrem.dispose();
    models.forEach((entry) => {
      entry.root.traverse((n) => {
        const mesh = n as THREE.Mesh;
        if ((mesh as any).isMesh && mesh.geometry) mesh.geometry.dispose();
      });
    });
    models.clear();
  }

  // -------------------------------------------------------------------- loop

  const clock = new THREE.Clock();
  let accT = 0;
  let accN = 0;
  let lastFps = 0;

  function tick(): void {
    if (disposed) return;
    rafId = requestAnimationFrame(tick);
    const dt = clock.getDelta();
    if (exportBusy) return; // export drives its own renders
    if (spinOn && activeEntry) pivot.rotation.y += dt * (spinDegPerSec * Math.PI) / 180;
    controls.update();
    if (renderHook) {
      renderHook(dt);
    } else {
      renderer.render(scene, camera);
    }
    accN++;
    accT += dt;
    if (accT > 0.5) {
      lastFps = Math.round(accN / accT);
      accN = 0;
      accT = 0;
    }
  }
  rafId = requestAnimationFrame(tick);

  // -------------------------------------------------------------------- debug

  const debug = {
    ready(): boolean {
      return !!activeEntry;
    },
    renderOnce(): void {
      controls.update();
      renderer.render(scene, camera);
    },
    snap(px = 160): string {
      const c = document.createElement("canvas");
      c.width = px;
      c.height = px;
      const g = c.getContext("2d")!;
      g.clearRect(0, 0, px, px);
      g.drawImage(renderer.domElement, 0, 0, px, px);
      return c.toDataURL("image/png").split(",")[1];
    },
    state(): Record<string, unknown> {
      return {
        models: [...models.values()].map((m) => m.name),
        active: activeEntry ? activeEntry.name : null,
        tris: activeEntry ? activeEntry.stats.tris : 0,
        mats: activeEntry ? activeEntry.mats.length : 0,
        raw: activeEntry ? activeEntry.raw : null,
        focal: focalMM,
        expo: renderer.toneMappingExposure,
        envKind,
        envRot: envRotDeg,
        envInt: envIntensity,
        transp: transparentMode,
        spin: spinOn,
        shadow: renderer.shadowMap.enabled,
        floorVisible: floor.visible,
        alpha: renderer.getContext().getContextAttributes()?.alpha ?? null,
        preserve: renderer.getContext().getContextAttributes()?.preserveDrawingBuffer ?? null,
        busy: exportBusy,
        fps: lastFps,
      };
    },
    matInfo(): MaterialInfo[] {
      if (!activeEntry) return [];
      return activeEntry.mats.map((m, i) => materialInfo(m, i));
    },
  };

  // seed initial camera framing before any model loads
  setPhotoAngle();

  return {
    scene,
    camera,
    renderer,
    controls,
    pivot,

    loadModel,
    removeModel,
    selectModel,
    getActiveModel,

    loadEnvironment,
    setEnvironment,
    setEnvRotation,
    setEnvIntensity,

    setFocalLength: (mm: FocalMM) => setFocalInternal(mm, true),
    setView,
    frameActive,

    setToneMapping,
    setExposure,
    setTransparent,
    setSpin,
    setShadows,
    setFloor,

    demetalizeActive,

    exportPNG,
    exportGLB,
    exportGLTF,
    exportBlenderPackage,
    exportSequence,
    exportWebM,

    setRenderHook,

    cancelExport,
    resize,
    dispose,

    debug,
  };
}
