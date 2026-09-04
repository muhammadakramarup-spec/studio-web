import type { TimelineState } from "../timeline/index.ts";
import type { EnvKind, FocalMM } from "../viewer/studio.ts";

export const PROJECT_FORMAT = "studio-web-project" as const;
export const PROJECT_VERSION = 1 as const;
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

export interface ProjectDocumentV1 {
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
}

type ProjectInput = Omit<ProjectDocumentV1, "format" | "version">;

const FOCALS = new Set([24, 35, 50, 85, 135]);
const ENVIRONMENTS = new Set(["room", "studio", "hdr"]);
const CHANNELS = new Set(["position", "quaternion", "scale", "camera.fov", "camera.focalLength"]);
const EASINGS = new Set(["linear", "easeIn", "easeOut", "easeInOut", "sineInOut", "back", "bounce", "constant"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireFinite(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Project ${label} is invalid`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Project ${label} is invalid`);
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

export function createProjectDocument(input: ProjectInput): ProjectDocumentV1 {
  return parseProjectDocument(
    JSON.stringify({
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      ...input,
    }),
  );
}

export function parseProjectDocument(json: string): ProjectDocumentV1 {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("Project file is not valid JSON");
  }
  if (!isRecord(raw) || raw.format !== PROJECT_FORMAT) throw new Error("This is not a Studio Web project");
  if (raw.version !== PROJECT_VERSION) throw new Error("This project needs a newer version of Studio Web");
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
    viewer: parseViewer(raw.viewer),
    timeline: parseTimeline(raw.timeline),
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

export function projectModelBlob(project: ProjectDocumentV1): Blob {
  const binary = atob(project.model.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: project.model.mime });
}
