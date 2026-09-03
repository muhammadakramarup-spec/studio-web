// workers/ai-gate/index.ts — the "AI gate" Worker stub.
//
// SCOPE.md build order item 1: takes a generation request, validates it, checks credits, returns
// a deterministic {jobId, status:'done', glbUrl:<mock asset id resolved>, mock:true, provider:'none'}.
// Must return HTTP 200 with 0 env vars in <200ms, 10/10 runs.
//
// This is a PLAIN exported handler function, not a wrangler deployment — DECISIONS.md #20 / the S6
// prompt: "your test calls the function, it does not run wrangler". `env` defaults to {} and is
// never read for a key: there is no free Meshy API tier (DECISIONS.md #10) so nothing is ever
// forwarded to a paid provider. Zero secrets, zero network calls, zero accounts.
import type { GenerateJobRequest, GenerateJobResponse } from './types';

// DECISIONS.md #16 — Warden-verified id. S3's manifest.json guarantees this id with
// licence:"CC0" and a sourceUrl; we reference it BY ID (never a hard-coded arbitrary path) and
// derive the on-disk/served path from the id's own source/kit/model segments, which matches the
// convention S3's pipeline uses for public/assets/<source>/<kit>/<model>.glb. This keeps the
// Worker independent of whether public/assets/manifest.json has finished building yet (SCOPE.md:
// "S3 may not have finished ... resolve by id at runtime").
export const MOCK_RESULT_ASSET_ID = 'kenney/platformer-kit/character-oobi';

export function assetIdToUrl(id: string): string {
  return `/assets/${id.split('/').join('/')}.glb`;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Session-less credit check: the Worker itself is stateless across requests (no KV/DB binding is
// wired — that would need an account, out of scope today). "Checks credits" here validates the
// shape of a caller-supplied credits hint if present, and otherwise always allows the mock path,
// since real charging never happens (creditsCharged is always 0). The authoritative per-session
// 3-credit gate lives client-side in src/ai/index.ts (SCOPE.md build order item 3), which is what
// the numeric acceptance check for the credits gate actually exercises.
function creditsOk(body: Partial<GenerateJobRequest> & { creditsRemaining?: unknown }): boolean {
  if (typeof body.creditsRemaining === 'number') return body.creditsRemaining > 0;
  return true;
}

export default {
  async fetch(request: Request, _env: Record<string, unknown> = {}): Promise<Response> {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method not allowed, expected POST' }, 405);
    }

    let body: Partial<GenerateJobRequest> = {};
    try {
      body = (await request.json()) as Partial<GenerateJobRequest>;
    } catch {
      return jsonResponse({ error: 'invalid JSON body' }, 400);
    }

    if (body.kind !== 'text-to-3d' && body.kind !== 'image-to-3d') {
      return jsonResponse({ error: "kind must be 'text-to-3d' or 'image-to-3d'" }, 400);
    }
    if (body.kind === 'text-to-3d' && body.prompt !== undefined && typeof body.prompt !== 'string') {
      return jsonResponse({ error: 'prompt must be a string when provided' }, 400);
    }
    if (
      body.kind === 'image-to-3d' &&
      body.imageDataUrl !== undefined &&
      typeof body.imageDataUrl !== 'string'
    ) {
      return jsonResponse({ error: 'imageDataUrl must be a string when provided' }, 400);
    }

    if (!creditsOk(body)) {
      return jsonResponse({ error: 'no credits' }, 402);
    }

    const jobId = `job_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;

    const response: GenerateJobResponse = {
      jobId,
      status: 'done',
      glbUrl: assetIdToUrl(MOCK_RESULT_ASSET_ID),
      mock: true,
      provider: 'none',
      creditsCharged: 0,
    };

    return jsonResponse(response, 200);
  },
};
