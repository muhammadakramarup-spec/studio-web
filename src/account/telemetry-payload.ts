const SAFE_TOKEN = /^[a-z0-9][a-z0-9/_-]{0,79}$/;
const ASSET_KINDS = new Set(["model", "hdri", "material"]);
const EXPORT_KINDS = new Set(["still", "turntable", "glb", "gltf", "blender-package"]);

export interface TelemetryPayload extends Record<string, unknown> {
  type: string;
  anonId: string;
  ts: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function token(value: unknown): string | null {
  return typeof value === "string" && SAFE_TOKEN.test(value) ? value : null;
}

export function buildTelemetryPayload(
  event: unknown,
  anonId: string,
  timestamp: number,
): TelemetryPayload | null {
  const input = record(event);
  if (!input || typeof input.type !== "string") return null;
  const base = { type: input.type, anonId, ts: timestamp };

  switch (input.type) {
    case "session_started":
      return base;
    case "asset_loaded": {
      const assetId = token(input.assetId);
      if (!ASSET_KINDS.has(input.assetKind as string) || !assetId) return null;
      return { ...base, assetKind: input.assetKind, assetId };
    }
    case "effect_applied": {
      const effect = token(input.effect);
      return effect ? { ...base, effect } : null;
    }
    case "tool_used": {
      const tool = token(input.tool);
      return tool ? { ...base, tool } : null;
    }
    case "pro_cta_clicked": {
      const source = token(input.source);
      return source ? { ...base, source } : null;
    }
    case "export_completed": {
      if (!EXPORT_KINDS.has(input.exportKind as string)) return null;
      if (typeof input.ms !== "number" || !Number.isFinite(input.ms) || input.ms < 0 || input.ms > 3_600_000) {
        return null;
      }
      return { ...base, exportKind: input.exportKind, ms: Math.round(input.ms) };
    }
    default:
      return null;
  }
}
