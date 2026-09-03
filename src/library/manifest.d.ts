// Frozen interface — SCOPE.md §2 "S3 — src/library/manifest.d.ts". Do not edit
// this shape; if a problem is found, record it, don't change the signature.

export type AssetKind = "model" | "hdri" | "material";

export interface LibraryAsset {
  id: string;
  kind: AssetKind;
  name: string;
  source: "kenney" | "polyhaven" | "ambientcg";
  licence: "CC0";
  sourceUrl: string;
  category: string;
  triangles: number; // must equal an independent GLB parse, reviews/codex_review_S3.md:5
  fileUrl: string;
  fileBytes: number;
  thumbnailUrl: string;
  dimensionsMeters?: [number, number, number];
  // REVIEW (reviews/codex_review_S3.md:3 — S4 needs clip names, src/timeline/SPEC.md:107-108):
  animationClipNames?: readonly string[];
}

// REVIEW (reviews/codex_review_S3.md:10): root is { assets: [...] }, never the array itself —
// checks read manifest.assets, never `manifest` as an array.
export interface LibraryManifest {
  generatedAt: string;
  pipelineVersion: string;
  assets: LibraryAsset[];
}
