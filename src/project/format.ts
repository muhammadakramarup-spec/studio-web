import type { TimelineState } from "../timeline/index.ts";
import type { EnvKind, FocalMM } from "../viewer/studio.ts";
// Type-only imports — format.ts must stay Node-testable (no runtime three.js import here).
import type { AddPayload } from "../editor/types.ts";
import type { ModifierRecord } from "../editor/state.ts";

export const PROJECT_FORMAT = "studio-web-project" as const;
// Wave 3 Function 2 (project v2 + local recovery): PROJECT_VERSION is the current/latest format
// version. createProjectDocument always stamps this on freshly built documents, and
// parseProjectDocument accepts any saved version from 1 up to this value, always returning the
// upgraded, current-shape document (a real "upgrade on load" — see the module doc below).
export const PROJECT_VERSION = 2 as const;
export const MAX_PROJECT_MODEL_BYTES = 50 * 1024 * 1024;

export interface ProjectViewerState {
  focal: FocalMM;
  exposure: number;
  environment: EnvKind;
  environmentRotation: number;
  environmentIntensity: number;
  transparent: boolean;
  spin: boolean;
  shadows: boolean;
  floor: boolean;
}

// Historical shape of a version-1 file on disk (tests/fixtures/project-v1.studio.json is pinned
// to exactly this). No code in this module returns this type anymore — parseProjectDocument
// always upgrades to ProjectDocumentV2 — it is kept only as documentation of what an old save
// file's bytes look like.
export interface ProjectDocumentV1 {
  format: typeof PROJECT_FORMAT;
  version: 1;
  name: string;
  savedAt: string;
  model: {
    name: string;
    mime: "model/gltf-binary";
    base64: string;
  };
  viewer: ProjectViewerState;
  timeline: TimelineState;
}

// ---------------------------------------------------------------------------------------------
// v2 additions: authored asset identity, environment/HDRI identity, saved camera view, and the
// authored scene graph (added lights/cameras/primitives, their materials, modifiers, and bloom).
// ---------------------------------------------------------------------------------------------

/** A model picked from the CC0 library. Never carries a local filesystem path. */
export interface ProjectAssetLibrary {
  origin: "library";
  id: string;
  name: string;
  kind: "model";
  source: string;
  sourceUrl: string;
  licence: "CC0";
  category: string;
}

/**
 * A model opened from the user's own filesystem. Deliberately carries NO name/path field at
 * all — not even a neutral one — so a local asset can never leak a local filename or path into a
 * saved project or the IndexedDB recovery record (see requests.md for the corresponding main.ts
 * contract: model.name must be a neutral string like "Local model", never the File's name).
 */
export interface ProjectAssetLocal {
  origin: "local";
}

export type ProjectAsset = ProjectAssetLibrary | ProjectAssetLocal | null;

/** A CC0 HDRI picked from the library, referenced by its packaged /assets/ URL, never embedded. */
export interface ProjectHDRI {
  id: string;
  name: string;
  source: string;
  sourceUrl: string;
  licence: "CC0";
  fileUrl: string; // must start with "/assets/"
}

export interface ProjectEnvironment {
  kind: EnvKind;
  rotation: number;
  intensity: number;
  hdri?: ProjectHDRI;
}

export interface ProjectView {
  position: [number, number, number];
  target: [number, number, number];
  focal: FocalMM;
  exposure: number;
}

export interface SceneObjectMaterial {
  color: string;
  roughness: number | null;
  metalness: number | null;
  emissive: string;
  emissiveIntensity: number | null;
}

export interface SceneObjectLight {
  color: string;
  intensity: number;
}

export interface SceneObjectV2 {
  kind: AddPayload["kind"];
  name: string;
  visible: boolean;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
  material?: SceneObjectMaterial;
  light?: SceneObjectLight;
  modifiers?: ModifierRecord | null;
}

export interface ScenePostFX {
  enabled: boolean;
  strength: number;
  radius: number;
  threshold: number;
}

export interface SceneV2 {
  objects: SceneObjectV2[];
  postFX: ScenePostFX;
}

export interface ProjectDocumentV2 {
  format: typeof PROJECT_FORMAT;
  version: typeof PROJECT_VERSION;
  name: string;
  savedAt: string;
  model: {
    name: string;
    mime: "model/gltf-binary";
    base64: string;
  };
  viewer: ProjectViewerState;
  timeline: TimelineState;
  asset: ProjectAsset;
  environment: ProjectEnvironment;
  view: ProjectView | null;
  scene: SceneV2;
}

// Matches src/editor/postfx.ts's DEFAULT_BLOOM exactly (kept as a literal copy, not a runtime
// import, so this module never pulls in three.js — see the type-only import comment above).
const DEFAULT_SCENE_POSTFX: ScenePostFX = { enabled: false, strength: 1.2, radius: 0.4, threshold: 0.85 };

type ProjectInput = Omit<ProjectDocumentV2, "format" | "version" | "asset" | "environment" | "view" | "scene"> & {
  asset?: ProjectAsset;
  environment?: ProjectEnvironment;
  view?: ProjectView | null;
  scene?: SceneV2;
};

const FOCALS = new Set([24, 35, 50, 85, 135]);
const ENVIRONMENTS = new Set(["room", "studio", "hdr"]);
const CHANNELS = new Set(["position", "quaternion", "scale", "camera.fov", "camera.focalLength"]);
const EASINGS = new Set(["linear", "easeIn", "easeOut", "easeInOut", "sineInOut", "back", "bounce", "constant"]);
const ADD_KINDS = new Set([
  "light-point",
  "light-directional",
  "light-spot",
  "camera",
  "primitive-box",
  "primitive-sphere",
  "primitive-cylinder",
  "primitive-plane",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireFinite(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Project ${label} is invalid`);
  }
  return value;
}

function requireNullableFinite(value: unknown, label: string, min: number, max: number): number | null {
  if (value === null) return null;
  return requireFinite(value, label, min, max);
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Project ${label} is invalid`);
  return value;
}

function requireVec3(value: unknown, label: string): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`Project ${label} is invalid`);
  const out = value.map((v, i) => requireFinite(v, `${label}[${i}]`, -100_000, 100_000));
  return [out[0], out[1], out[2]];
}

function requireVec4(value: unknown, label: string): [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4) throw new Error(`Project ${label} is invalid`);
  const out = value.map((v, i) => requireFinite(v, `${label}[${i}]`, -1.0001, 1.0001));
  return [out[0], out[1], out[2], out[3]];
}

function requireHexColor(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`Project ${label} is invalid`);
  }
  return value;
}

function normalizeBase64(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0) {
    throw new Error("Project model data is invalid");
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Project model data is invalid");
  }
  const estimatedBytes = (value.length * 3) / 4 - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);
  if (estimatedBytes > MAX_PROJECT_MODEL_BYTES) {
    throw new Error("Project model exceeds the 50 MB safety limit");
  }
  return value;
}

function parseViewer(value: unknown): ProjectViewerState {
  if (!isRecord(value)) throw new Error("Project viewer settings are invalid");
  if (!FOCALS.has(value.focal as number)) throw new Error("Project focal length is invalid");
  if (!ENVIRONMENTS.has(value.environment as string)) throw new Error("Project environment is invalid");
  return {
    focal: value.focal as FocalMM,
    exposure: requireFinite(value.exposure, "exposure", 0, 8),
    environment: value.environment as EnvKind,
    environmentRotation: requireFinite(value.environmentRotation, "environment rotation", -3600, 3600),
    environmentIntensity: requireFinite(value.environmentIntensity, "environment intensity", 0, 20),
    transparent: requireBoolean(value.transparent, "transparency"),
    spin: requireBoolean(value.spin, "spin"),
    shadows: requireBoolean(value.shadows, "shadows"),
    floor: requireBoolean(value.floor, "floor"),
  };
}

function parseTimeline(value: unknown): TimelineState {
  if (!isRecord(value) || !Array.isArray(value.tracks)) throw new Error("Project timeline is invalid");
  if (value.tracks.length > 100) throw new Error("Project timeline is invalid");
  const tracks: TimelineState["tracks"] = value.tracks.map((trackValue) => {
    if (!isRecord(trackValue) || typeof trackValue.id !== "string" || typeof trackValue.targetId !== "string" || !Array.isArray(trackValue.channels)) {
      throw new Error("Project timeline is invalid");
    }
    if (trackValue.id.length > 160 || trackValue.targetId.length > 160 || trackValue.channels.length > 20) {
      throw new Error("Project timeline is invalid");
    }
    return {
      id: trackValue.id,
      targetId: trackValue.targetId,
      channels: trackValue.channels.map((channelValue) => {
        if (!isRecord(channelValue) || !CHANNELS.has(channelValue.id as string) || !Array.isArray(channelValue.keys) || channelValue.keys.length > 1000) {
          throw new Error("Project timeline is invalid");
        }
        return {
          id: channelValue.id as TimelineState["tracks"][number]["channels"][number]["id"],
          keys: channelValue.keys.map((keyValue) => {
            if (!isRecord(keyValue) || !EASINGS.has(keyValue.easing as string)) throw new Error("Project timeline is invalid");
            const t = requireFinite(keyValue.t, "timeline key time", 0, 3600);
            const rawValue = keyValue.value;
            const validValue = typeof rawValue === "number"
              ? Number.isFinite(rawValue)
              : Array.isArray(rawValue) && [3, 4].includes(rawValue.length) && rawValue.every((part) => typeof part === "number" && Number.isFinite(part));
            if (!validValue) throw new Error("Project timeline is invalid");
            return {
              t,
              value: rawValue as TimelineState["tracks"][number]["channels"][number]["keys"][number]["value"],
              easing: keyValue.easing as TimelineState["tracks"][number]["channels"][number]["keys"][number]["easing"],
            };
          }),
        };
      }),
    };
  });
  return {
    tracks,
    duration: requireFinite(value.duration, "timeline duration", 0.01, 3600),
    fps: requireFinite(value.fps, "timeline fps", 1, 240),
  };
}

function parseAsset(value: unknown): ProjectAsset {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw new Error("Project asset is invalid");
  if (value.origin === "local") {
    return { origin: "local" };
  }
  if (value.origin === "library") {
    if (typeof value.id !== "string" || value.id.length === 0 || value.id.length > 120) {
      throw new Error("Project asset id is invalid");
    }
    if (typeof value.name !== "string" || value.name.length === 0 || value.name.length > 200) {
      throw new Error("Project asset name is invalid");
    }
    if (value.kind !== "model") throw new Error("Project asset kind is invalid");
    if (typeof value.source !== "string" || value.source.length === 0 || value.source.length > 120) {
      throw new Error("Project asset source is invalid");
    }
    if (typeof value.sourceUrl !== "string" || value.sourceUrl.length > 2000 || !value.sourceUrl.startsWith("https://")) {
      throw new Error("Project asset sourceUrl must be https");
    }
    if (value.licence !== "CC0") throw new Error("Project asset licence is invalid");
    if (typeof value.category !== "string" || value.category.length === 0 || value.category.length > 120) {
      throw new Error("Project asset category is invalid");
    }
    return {
      origin: "library",
      id: value.id,
      name: value.name,
      kind: "model",
      source: value.source,
      sourceUrl: value.sourceUrl,
      licence: "CC0",
      category: value.category,
    };
  }
  throw new Error("Project asset origin is invalid");
}

function parseHDRI(value: unknown): ProjectHDRI {
  if (!isRecord(value)) throw new Error("Project HDRI is invalid");
  if (typeof value.id !== "string" || value.id.length === 0 || value.id.length > 120) {
    throw new Error("Project HDRI id is invalid");
  }
  if (typeof value.name !== "string" || value.name.length === 0 || value.name.length > 200) {
    throw new Error("Project HDRI name is invalid");
  }
  if (typeof value.source !== "string" || value.source.length === 0 || value.source.length > 120) {
    throw new Error("Project HDRI source is invalid");
  }
  if (typeof value.sourceUrl !== "string" || value.sourceUrl.length > 2000 || !value.sourceUrl.startsWith("https://")) {
    throw new Error("Project HDRI sourceUrl must be https");
  }
  if (value.licence !== "CC0") throw new Error("Project HDRI licence is invalid");
  if (typeof value.fileUrl !== "string" || value.fileUrl.length > 2000 || !value.fileUrl.startsWith("/assets/")) {
    throw new Error("Project HDRI fileUrl must be a packaged /assets/ path");
  }
  return {
    id: value.id,
    name: value.name,
    source: value.source,
    sourceUrl: value.sourceUrl,
    licence: "CC0",
    fileUrl: value.fileUrl,
  };
}

function parseEnvironment(value: unknown): ProjectEnvironment {
  if (!isRecord(value)) throw new Error("Project environment is invalid");
  if (!ENVIRONMENTS.has(value.kind as string)) throw new Error("Project environment kind is invalid");
  const env: ProjectEnvironment = {
    kind: value.kind as EnvKind,
    rotation: requireFinite(value.rotation, "environment rotation", -3600, 3600),
    intensity: requireFinite(value.intensity, "environment intensity", 0, 20),
  };
  if (value.hdri !== undefined && value.hdri !== null) env.hdri = parseHDRI(value.hdri);
  return env;
}

function deriveEnvironmentFromViewer(viewer: ProjectViewerState): ProjectEnvironment {
  return { kind: viewer.environment, rotation: viewer.environmentRotation, intensity: viewer.environmentIntensity };
}

function parseView(value: unknown): ProjectView | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw new Error("Project view is invalid");
  if (!FOCALS.has(value.focal as number)) throw new Error("Project view focal length is invalid");
  return {
    position: requireVec3(value.position, "view position"),
    target: requireVec3(value.target, "view target"),
    focal: value.focal as FocalMM,
    exposure: requireFinite(value.exposure, "view exposure", 0, 8),
  };
}

function parseModifierRecord(value: unknown): ModifierRecord | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw new Error("Scene object modifiers are invalid");
  const record: ModifierRecord = {};
  if (value.mirror !== undefined && value.mirror !== null) {
    if (!isRecord(value.mirror) || !["x", "y", "z"].includes(value.mirror.axis as string) || typeof value.mirror.enabled !== "boolean") {
      throw new Error("Scene object mirror modifier is invalid");
    }
    record.mirror = { axis: value.mirror.axis as "x" | "y" | "z", enabled: value.mirror.enabled };
  }
  if (value.array !== undefined && value.array !== null) {
    if (!isRecord(value.array)) throw new Error("Scene object array modifier is invalid");
    const count = requireFinite(value.array.count, "array modifier count", 1, 1000);
    const offset = requireVec3(value.array.offset, "array modifier offset");
    record.array = { count, offset };
  }
  return record.mirror || record.array ? record : null;
}

function parseSceneObject(value: unknown): SceneObjectV2 {
  if (!isRecord(value)) throw new Error("Scene object is invalid");
  if (typeof value.kind !== "string" || !ADD_KINDS.has(value.kind)) throw new Error("Scene object kind is invalid");
  if (typeof value.name !== "string" || value.name.length > 120) throw new Error("Scene object name is invalid");
  if (typeof value.visible !== "boolean") throw new Error("Scene object visibility is invalid");
  const obj: SceneObjectV2 = {
    kind: value.kind as AddPayload["kind"],
    name: value.name,
    visible: value.visible,
    position: requireVec3(value.position, "scene object position"),
    quaternion: requireVec4(value.quaternion, "scene object quaternion"),
    scale: requireVec3(value.scale, "scene object scale"),
  };
  if (value.material !== undefined && value.material !== null) {
    if (!isRecord(value.material)) throw new Error("Scene object material is invalid");
    obj.material = {
      color: requireHexColor(value.material.color, "material color"),
      roughness: requireNullableFinite(value.material.roughness, "material roughness", 0, 1),
      metalness: requireNullableFinite(value.material.metalness, "material metalness", 0, 1),
      emissive: requireHexColor(value.material.emissive, "material emissive"),
      emissiveIntensity: requireNullableFinite(value.material.emissiveIntensity, "material emissive intensity", 0, 100),
    };
  }
  if (value.light !== undefined && value.light !== null) {
    if (!isRecord(value.light)) throw new Error("Scene object light is invalid");
    obj.light = {
      color: requireHexColor(value.light.color, "light color"),
      intensity: requireFinite(value.light.intensity, "light intensity", 0, 100_000),
    };
  }
  if (value.modifiers !== undefined) {
    obj.modifiers = parseModifierRecord(value.modifiers);
  }
  return obj;
}

function parseScene(value: unknown): SceneV2 {
  if (!isRecord(value) || !Array.isArray(value.objects)) throw new Error("Project scene is invalid");
  if (value.objects.length > 200) throw new Error("Project scene has too many objects");
  const objects = value.objects.map(parseSceneObject);
  if (!isRecord(value.postFX)) throw new Error("Project scene postFX is invalid");
  const postFX: ScenePostFX = {
    enabled: requireBoolean(value.postFX.enabled, "postFX enabled"),
    strength: requireFinite(value.postFX.strength, "postFX strength", 0, 10),
    radius: requireFinite(value.postFX.radius, "postFX radius", 0, 5),
    threshold: requireFinite(value.postFX.threshold, "postFX threshold", 0, 2),
  };
  return { objects, postFX };
}

export function createProjectDocument(input: ProjectInput): ProjectDocumentV2 {
  return parseProjectDocument(
    JSON.stringify({
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      ...input,
      asset: input.asset ?? null,
      environment: input.environment ?? deriveEnvironmentFromViewer(input.viewer),
      view: input.view ?? null,
      scene: input.scene ?? { objects: [], postFX: { ...DEFAULT_SCENE_POSTFX } },
    }),
  );
}

export function parseProjectDocument(json: string): ProjectDocumentV2 {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("Project file is not valid JSON");
  }
  if (!isRecord(raw) || raw.format !== PROJECT_FORMAT) throw new Error("This is not a Studio Web project");

  const version = raw.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new Error("This is not a Studio Web project");
  }
  if (version > PROJECT_VERSION) throw new Error("This project needs a newer version of Studio Web");

  if (typeof raw.name !== "string" || raw.name.trim().length === 0 || raw.name.length > 120) {
    throw new Error("Project name is invalid");
  }
  if (typeof raw.savedAt !== "string" || !Number.isFinite(Date.parse(raw.savedAt))) {
    throw new Error("Project save date is invalid");
  }
  if (!isRecord(raw.model) || typeof raw.model.name !== "string" || raw.model.name.length > 200) {
    throw new Error("Project model is invalid");
  }
  if (raw.model.mime !== "model/gltf-binary") throw new Error("Project model type is unsupported");

  const viewer = parseViewer(raw.viewer);
  const timeline = parseTimeline(raw.timeline);

  // A file saved under format v1 never had these fields — upgrade it to current defaults. A
  // file saved under v2+ always carries them and they are validated as written.
  const isUpgradeFromV1 = version < 2;
  const asset = isUpgradeFromV1 ? null : parseAsset(raw.asset);
  const environment = isUpgradeFromV1 ? deriveEnvironmentFromViewer(viewer) : parseEnvironment(raw.environment);
  const view = isUpgradeFromV1 ? null : parseView(raw.view);
  const scene = isUpgradeFromV1 ? { objects: [], postFX: { ...DEFAULT_SCENE_POSTFX } } : parseScene(raw.scene);

  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: raw.name.trim(),
    savedAt: raw.savedAt,
    model: {
      name: raw.model.name,
      mime: "model/gltf-binary",
      base64: normalizeBase64(raw.model.base64),
    },
    viewer,
    timeline,
    asset,
    environment,
    view,
    scene,
  };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  if (blob.size > MAX_PROJECT_MODEL_BYTES) throw new Error("Project model exceeds the 50 MB safety limit");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function projectModelBlob(project: ProjectDocumentV2): Blob {
  const binary = atob(project.model.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: project.model.mime });
}
