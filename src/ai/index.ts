// src/ai/index.ts — S6 AI + avatars, Wave-2 mock implementation.
//
// Zero paid API calls. Zero account creation. Zero keys anywhere. Zero env vars required to boot.
// Every mock result is unmistakably labelled (MOCK_LABEL) so nobody can mistake it for a real
// generation. See SCOPE.md's S6 row and DECISIONS.md #10/#16/#17 for the contract this file builds.
import type {
  GenerationKind,
  GenerationRequest,
  GenerationResult,
  GenerationState,
  GenerationPanelProps,
  AvatarPanelProps,
} from './types';
import { MOCK_LABEL } from './types';

export type {
  GenerationKind,
  GenerationState,
  GenerationRequest,
  GenerationResult,
  GenerationPanelProps,
  AvatarPanelProps,
};
export { MOCK_LABEL };

// ---------------------------------------------------------------------------------------------
// Asset ids — DECISIONS.md #16, Warden-verified to exist on disk. Referenced BY ID, never a
// hard-coded arbitrary path: the served URL is derived from the id's own source/kit/model
// segments, which matches the public/assets/<source>/<kit>/<model>.glb convention S3's pipeline
// uses. This lets S6 resolve correctly whether or not public/assets/manifest.json has finished
// building yet (SCOPE.md: "S3 may not have finished ... resolve by id at runtime").
export const AVATAR_TILE_ASSET_ID = 'kenney/mini-dungeon/character-human';
export const MOCK_RESULT_ASSET_ID = 'kenney/platformer-kit/character-oobi';

export function assetIdToUrl(id: string): string {
  return `/assets/${id.split('/').join('/')}.glb`;
}

// ---------------------------------------------------------------------------------------------
// Session credits gate — SCOPE.md build order item 3: 3 mock credits per session (module
// instantiation = one page load = one session). The 4th call in the same session must return
// state:'error' synchronously (<50ms) with no state transition through queued/running.
let credits = 3;
export function getCreditsRemaining(): number {
  return credits;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeJobId(): string {
  return `job_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

const jobs = new Map<string, GenerationResult>();

// Core mock state machine. `onState` lets GenerationPanel drive its DOM through every
// intermediate state; the frozen requestGeneration() below just discards that stream and returns
// the terminal result. No fetch/XHR/WebSocket anywhere in this function — the round trip is
// entirely client-side timers, so it makes 0 network calls, MESHY_API_KEY unset or not.
async function runGenerationJob(
  req: GenerationRequest,
  onState: (s: GenerationState) => void,
): Promise<GenerationResult> {
  if (credits <= 0) {
    // Gate rejection: no onState(...) call at all, so the panel's displayed state never moves.
    return {
      state: 'error',
      jobId: makeJobId(),
      isMock: true,
      label: MOCK_LABEL,
      error: 'no credits',
      creditsRemaining: 0,
    };
  }
  credits -= 1;

  onState('queued');
  await delay(80);
  onState('running');
  await delay(120); // total mock latency well inside the <3000ms round-trip budget

  const jobId = makeJobId();
  const result: GenerationResult = {
    state: 'done',
    jobId,
    glbUrl: assetIdToUrl(MOCK_RESULT_ASSET_ID),
    isMock: true,
    label: MOCK_LABEL,
    creditsRemaining: credits,
  };
  jobs.set(jobId, result);
  onState('done');
  return result;
}

// ---------------------------------------------------------------------------------------------
// Frozen surface (SCOPE.md §2, src/ai/types.ts)

export async function requestGeneration(req: GenerationRequest): Promise<GenerationResult> {
  return runGenerationJob(req, () => {});
}

export async function pollGeneration(jobId: string): Promise<GenerationResult> {
  const found = jobs.get(jobId);
  if (found) return found;
  return {
    state: 'error',
    jobId,
    isMock: true,
    label: MOCK_LABEL,
    error: 'unknown jobId',
    creditsRemaining: credits,
  };
}

export interface GenerationPanelHandle {
  el: HTMLElement;
  submit(req: GenerationRequest): Promise<GenerationResult>;
  currentState(): GenerationState;
}

// REVIEW (reviews/codex_review_S6.md:3-9): the model-ready handoff into S1 — onModelReady is
// called with the mock glbUrl once state reaches 'done'. Caller wires this to
// studio.loadModel(glbUrl) (never studio.load — DECISIONS.md #17).
export function GenerationPanel(props: GenerationPanelProps): GenerationPanelHandle {
  const el = document.createElement('div');
  el.className = 'ai-generation-panel';

  const stateEl = document.createElement('div');
  stateEl.setAttribute('data-testid', 'gen-state');
  stateEl.textContent = 'idle';
  el.appendChild(stateEl);

  const resultEl = document.createElement('div');
  resultEl.setAttribute('data-testid', 'gen-result');
  el.appendChild(resultEl);

  let current: GenerationState = 'idle';
  function setState(s: GenerationState): void {
    current = s;
    stateEl.textContent = s;
    stateEl.setAttribute('data-state', s);
  }

  async function submit(req: GenerationRequest): Promise<GenerationResult> {
    resultEl.textContent = '';
    resultEl.removeAttribute('data-mock');
    const result = await runGenerationJob(req, setState);
    setState(result.state);
    if (result.state === 'done') {
      resultEl.textContent = result.label; // literal "MOCK — not a real generation"
      resultEl.setAttribute('data-mock', String(result.isMock));
      if (result.glbUrl) props.onModelReady(result.glbUrl);
    } else if (result.state === 'error') {
      resultEl.textContent = result.error ?? 'error';
    }
    return result;
  }

  return { el, submit, currentState: () => current };
}

export interface AvatarPanelHandle {
  el: HTMLElement;
  selectTile(): void;
}

// REVIEW (reviews/codex_review_S6.md:1): RPM iframe cut entirely. One manifest-listed local CC0
// GLB avatar tile (DECISIONS.md #16). Selecting it calls onAvatarReady with the resolved glbUrl;
// caller wires that to studio.loadModel(...).
export function AvatarPanel(props: AvatarPanelProps): AvatarPanelHandle {
  const el = document.createElement('div');
  el.className = 'ai-avatar-panel';

  const tile = document.createElement('button');
  tile.type = 'button';
  tile.setAttribute('data-testid', 'avatar-tile');
  tile.setAttribute('data-asset-id', AVATAR_TILE_ASSET_ID);
  tile.textContent = `Avatar — ${AVATAR_TILE_ASSET_ID}`;
  tile.addEventListener('click', () => {
    props.onAvatarReady(assetIdToUrl(AVATAR_TILE_ASSET_ID));
  });
  el.appendChild(tile);

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.setAttribute('data-testid', 'avatar-cancel');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => props.onCancel());
  el.appendChild(cancelBtn);

  return {
    el,
    selectTile(): void {
      tile.click();
    },
  };
}
