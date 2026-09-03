// src/ai/types.ts — FROZEN shape, SCOPE.md §2 "S6 — src/ai/types.ts + workers/ai-gate/types.ts".
// Do not change a frozen signature. Report problems as findings, not by editing this file's shape.

export type GenerationKind = 'text-to-3d' | 'image-to-3d';
export type GenerationState = 'idle' | 'queued' | 'running' | 'done' | 'error';

export interface GenerationRequest {
  kind: GenerationKind;
  prompt?: string;
  imageDataUrl?: string;
  // REVIEW (reviews/codex_review_S6.md:17-18): optional — S5's zero-env AccountState permits user:null.
  userId?: string;
}

export const MOCK_LABEL = 'MOCK — not a real generation' as const;

export interface GenerationResult {
  state: GenerationState;
  jobId: string;
  glbUrl?: string;
  isMock: true;
  label: 'MOCK — not a real generation';
  error?: string;
  creditsRemaining: number;
}

// Ambient signatures only — the real implementation lives in src/ai/index.ts, the module the
// harness dynamic-imports (Testing §, HANDOFF: `await import('/src/ai/index.ts')`).
export declare function requestGeneration(req: GenerationRequest): Promise<GenerationResult>;
export declare function pollGeneration(jobId: string): Promise<GenerationResult>;

// REVIEW (reviews/codex_review_S6.md:3-9): S1 handoff was missing from the generation path.
export interface GenerationPanelProps {
  onModelReady: (glbUrl: string) => void;
}
export declare function GenerationPanel(props: GenerationPanelProps): unknown;

// REVIEW (reviews/codex_review_S6.md:1): RPM iframe mode removed entirely. AvatarPanel now
// shows one manifest-listed local CC0 GLB avatar tile (an S3 asset with licence:"CC0" and a
// sourceUrl, reviews/codex_review_S6.md:18 — asset id fixed by DECISIONS.md #16).
export interface AvatarPanelProps {
  onAvatarReady: (glbUrl: string) => void;
  onCancel: () => void;
}
export declare function AvatarPanel(props: AvatarPanelProps): unknown;
