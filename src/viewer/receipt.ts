// src/viewer/receipt.ts — export receipt + provenance (Wave 3 Function 3).
// Ownership: silo F3 only (status/warden-log.md Decision W-2). Pure TypeScript: no DOM, no
// three.js — importable and testable from plain Node (Blob exists in Node 18+).
//
// A receipt is attached to package exports (Blender ZIP, turntable ZIP) whenever the export
// used a library asset, so the artifact carries machine-readable + human-readable provenance
// (source, licence, app version, export kind, creation time) without leaking anything local —
// see the privacy guard below, product rule 4 ("never expose ... user filenames ... in client
// bundles ... or telemetry") and product rule 7 (verifiable asset provenance, Priority 0 #4).

export interface ProvenanceAsset {
  id: string;
  name: string;
  kind: "model" | "hdri";
  source: string;
  sourceUrl: string;
  licence: "CC0";
  category?: string;
  fileBytes?: number;
  triangles?: number;
}

export interface ExportReceipt {
  format: "studio-web-export-receipt";
  version: 1;
  app: { name: "Studio Web"; version: string };
  export: {
    kind: "blender-package" | "turntable";
    createdAt: string;
    files: string[];
    frames?: { count: number; width: number; height: number; motion: "timeline" | "default-sweep" };
    dimensions?: { width: number; height: number };
  };
  assets: ProvenanceAsset[];
}

export interface BuildReceiptInput {
  appVersion: string;
  kind: ExportReceipt["export"]["kind"];
  /** Defaults to `new Date().toISOString()`. */
  createdAt?: string;
  files: string[];
  frames?: ExportReceipt["export"]["frames"];
  dimensions?: ExportReceipt["export"]["dimensions"];
  assets: ProvenanceAsset[];
}

// ------------------------------------------------------------------ privacy guard
// A receipt travels inside a downloaded ZIP, so it must never carry a local filesystem path or
// a non-public source URL. Every string that could plausibly hold one is checked before the
// receipt is built at all — the function throws rather than silently redacting, so a caller
// that trips this learns about it immediately instead of shipping a quietly-wrong artifact.

function looksLikeLocalPath(value: string): boolean {
  return value.includes("\\") || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("file:");
}

function assertNoLocalPath(value: string, field: string): void {
  if (looksLikeLocalPath(value)) {
    throw new Error(
      `buildReceipt: ${field} looks like a local file path or file:// URL and cannot be included ` +
        `in an export receipt: "${value}"`,
    );
  }
}

function assertHttpsSourceUrl(value: string, field: string): void {
  if (!value.startsWith("https://")) {
    throw new Error(`buildReceipt: ${field} must be an https:// URL, got: "${value}"`);
  }
}

export function buildReceipt(input: BuildReceiptInput): ExportReceipt {
  for (const file of input.files) {
    assertNoLocalPath(file, "files[]");
  }
  for (const asset of input.assets) {
    assertNoLocalPath(asset.id, `assets[].id ("${asset.name}")`);
    assertNoLocalPath(asset.name, "assets[].name");
    assertHttpsSourceUrl(asset.sourceUrl, `assets[].sourceUrl ("${asset.name}")`);
  }

  const receipt: ExportReceipt = {
    format: "studio-web-export-receipt",
    version: 1,
    app: { name: "Studio Web", version: input.appVersion },
    export: {
      kind: input.kind,
      createdAt: input.createdAt ?? new Date().toISOString(),
      files: [...input.files],
      ...(input.frames ? { frames: { ...input.frames } } : {}),
      ...(input.dimensions ? { dimensions: { ...input.dimensions } } : {}),
    },
    assets: input.assets.map((asset) => ({ ...asset })),
  };
  return receipt;
}

// ------------------------------------------------------------------ human-readable licence

export function buildLicenceText(receipt: ExportReceipt): string {
  const lines: string[] = [];
  lines.push(`${receipt.app.name} export licence`);
  lines.push("");
  lines.push("Third-party assets included in this export are licensed CC0 1.0 Universal");
  lines.push("(Public Domain Dedication): https://creativecommons.org/publicdomain/zero/1.0/");
  if (receipt.assets.length) {
    lines.push("");
    lines.push("Assets:");
    for (const asset of receipt.assets) {
      lines.push(`- ${asset.name} — source: ${asset.source} — ${asset.sourceUrl} — licence: CC0`);
    }
  }
  lines.push("");
  lines.push(`Exported by ${receipt.app.name} ${receipt.app.version}`);
  lines.push(`Export kind: ${receipt.export.kind}`);
  lines.push(`Created: ${receipt.export.createdAt}`);
  return lines.join("\n");
}

// ------------------------------------------------------------------ package files

export function receiptFiles(receipt: ExportReceipt): { name: string; blob: Blob }[] {
  return [
    {
      name: "studio-web-receipt.json",
      blob: new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" }),
    },
    {
      name: "LICENCE.txt",
      blob: new Blob([buildLicenceText(receipt)], { type: "text/plain" }),
    },
  ];
}

// ------------------------------------------------------------------ provenance registry
// Tracks the two provenance-bearing slots the shell exposes today (the active model and the
// active HDRI environment). list() order is fixed (model, then environment) so receipts are
// deterministic; a null set clears that slot without disturbing the other.

export interface ProvenanceRegistry {
  setModel(asset: ProvenanceAsset | null): void;
  setEnvironment(asset: ProvenanceAsset | null): void;
  list(): ProvenanceAsset[];
  clear(): void;
}

export function createProvenanceRegistry(): ProvenanceRegistry {
  let model: ProvenanceAsset | null = null;
  let environment: ProvenanceAsset | null = null;
  return {
    setModel(asset) {
      model = asset;
    },
    setEnvironment(asset) {
      environment = asset;
    },
    list() {
      const out: ProvenanceAsset[] = [];
      if (model) out.push(model);
      if (environment) out.push(environment);
      return out;
    },
    clear() {
      model = null;
      environment = null;
    },
  };
}
