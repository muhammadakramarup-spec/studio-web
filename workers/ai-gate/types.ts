// workers/ai-gate/types.ts — FROZEN shape, SCOPE.md §2.
export interface GenerateJobRequest {
  kind: 'text-to-3d' | 'image-to-3d';
  prompt?: string;
  imageDataUrl?: string;
  userId?: string; // REVIEW, same as GenerationRequest.userId
}

export interface GenerateJobResponse {
  jobId: string;
  status: 'done';
  glbUrl: string; // an S3 manifest asset — DECISIONS.md #16 fixes the id
  mock: true;
  provider: 'none';
  creditsCharged: 0;
}
