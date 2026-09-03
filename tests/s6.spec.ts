// tests/s6.spec.ts — S6 AI + avatars acceptance tests (SCOPE.md's S6 row).
// Dev server already running at http://localhost:5173 --strictPort; this file starts nothing.
import { test, expect } from '@playwright/test';
import workerHandler, {
  MOCK_RESULT_ASSET_ID as WORKER_MOCK_ASSET_ID,
  assetIdToUrl as workerAssetIdToUrl,
} from '../workers/ai-gate/index';
import type { GenerateJobResponse } from '../workers/ai-gate/types';

test.describe('S6 — AI + avatars', () => {
  test('Worker stub: HTTP 200, mock:true, <200ms, 10/10 runs, 0 env vars', async () => {
    const durations: number[] = [];
    for (let i = 0; i < 10; i++) {
      const req = new Request('http://localhost/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'text-to-3d', prompt: `a chair, run ${i}` }),
      });
      const start = Date.now();
      // env is passed as {} — zero keys, exercising the "0 env vars" requirement directly.
      const res = await workerHandler.fetch(req, {});
      const elapsed = Date.now() - start;
      durations.push(elapsed);

      expect(res.status).toBe(200);
      const body = (await res.json()) as GenerateJobResponse;
      expect(body.status).toBe('done');
      expect(body.mock).toBe(true);
      expect(body.provider).toBe('none');
      expect(body.creditsCharged).toBe(0);
      expect(body.glbUrl).toBe(workerAssetIdToUrl(WORKER_MOCK_ASSET_ID));
      expect(typeof body.jobId).toBe('string');
      expect(body.jobId.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(200);
    }

    console.log('[S6] worker stub durations (ms):', durations, 'max:', Math.max(...durations));
  });

  test('Generation panel round-trip: idle→queued→running→done <3000ms, 0 network calls, MOCK label in DOM', async ({
    page,
  }) => {
    await page.goto('/');

    await page.evaluate(async () => {
      // @ts-expect-error — Vite dynamic import of a raw module path; resolved by the dev
      // server at runtime in the browser, not by tsc's module graph (Testing section pattern).
      const mod = await import('/src/ai/index.ts');
      (window as any).__s6 = mod;
      const container = document.createElement('div');
      document.body.appendChild(container);
      const readyUrls: string[] = [];
      const panel = mod.GenerationPanel({ onModelReady: (url: string) => readyUrls.push(url) });
      container.appendChild(panel.el);
      (window as any).__s6panel = panel;
      (window as any).__s6ready = readyUrls;
    });

    // Record network traffic ONLY across the generation round trip itself (module load already
    // happened above, so this window isolates what requestGeneration/submit actually does).
    const requestsDuringGen: string[] = [];
    const onRequest = (r: import('@playwright/test').Request) => requestsDuringGen.push(r.url());
    page.on('request', onRequest);

    const roundTrip = await page.evaluate(async () => {
      const panel = (window as any).__s6panel;
      const initialState = panel.currentState();
      const start = performance.now();
      const result = await panel.submit({ kind: 'text-to-3d', prompt: 'a red armchair' });
      const elapsed = performance.now() - start;
      const stateEl = panel.el.querySelector('[data-testid="gen-state"]') as HTMLElement;
      const resultEl = panel.el.querySelector('[data-testid="gen-result"]') as HTMLElement;
      return {
        initialState,
        elapsed,
        result,
        finalState: stateEl.textContent,
        labelText: resultEl.textContent,
        dataMock: resultEl.getAttribute('data-mock'),
        readyUrls: (window as any).__s6ready as string[],
      };
    });

    page.off('request', onRequest);

    expect(roundTrip.initialState).toBe('idle');
    expect(roundTrip.elapsed).toBeLessThan(3000);
    expect(roundTrip.result.state).toBe('done');
    expect(roundTrip.result.isMock).toBe(true);
    expect(roundTrip.finalState).toBe('done');
    expect(roundTrip.labelText).toBe('MOCK — not a real generation');
    expect(roundTrip.dataMock).toBe('true');
    expect(roundTrip.readyUrls.length).toBe(1);
    expect(requestsDuringGen).toEqual([]);

    console.log('[S6] generation round-trip elapsed (ms):', roundTrip.elapsed, 'network calls:', requestsDuringGen.length);
  });

  test('Credits gate: 4th requestGeneration() in-session returns error synchronously <50ms, no state transition', async ({
    page,
  }) => {
    await page.goto('/');

    const gate = await page.evaluate(async () => {
      // @ts-expect-error — Vite dynamic import of a raw module path; resolved by the dev
      // server at runtime in the browser, not by tsc's module graph (Testing section pattern).
      const mod = await import('/src/ai/index.ts');
      const container = document.createElement('div');
      document.body.appendChild(container);
      const panel = mod.GenerationPanel({ onModelReady: () => {} });
      container.appendChild(panel.el);

      // Spend the session's 3 credits through the panel (also exercises all 5 states across the
      // 3 successful trips before the 4th is denied).
      const r1 = await panel.submit({ kind: 'text-to-3d', prompt: 'a' });
      const r2 = await panel.submit({ kind: 'text-to-3d', prompt: 'b' });
      const r3 = await panel.submit({ kind: 'text-to-3d', prompt: 'c' });

      const stateBefore = panel.currentState();

      // The 4th call goes straight through the frozen requestGeneration() API — this is the
      // exact function named in the acceptance check, and it never touches the panel, so any
      // change to panel.currentState() below would prove a spurious state transition leaked out.
      const start = performance.now();
      const r4 = await mod.requestGeneration({ kind: 'text-to-3d', prompt: 'd' });
      const elapsed4 = performance.now() - start;

      const stateAfter = panel.currentState();

      return {
        r1state: r1.state,
        r2state: r2.state,
        r3state: r3.state,
        r4,
        elapsed4,
        stateBefore,
        stateAfter,
      };
    });

    expect(gate.r1state).toBe('done');
    expect(gate.r2state).toBe('done');
    expect(gate.r3state).toBe('done');
    expect(gate.r4.state).toBe('error');
    expect(gate.r4.error).toBe('no credits');
    expect(gate.r4.creditsRemaining).toBe(0);
    expect(gate.r4.isMock).toBe(true);
    expect(gate.elapsed4).toBeLessThan(50);
    // The panel was never called for the 4th (gated) request, so its displayed state must be
    // untouched by that call — proving the gate rejects before any state transition occurs.
    expect(gate.stateAfter).toBe(gate.stateBefore);

    console.log('[S6] credits gate 4th-call elapsed (ms):', gate.elapsed4);
  });

  test('Avatar tile: onAvatarReady → studio.loadModel → visible mesh <2000ms, 256×256 capture differs ≥1000px from baseline', async ({
    page,
  }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      // @ts-expect-error — Vite dynamic import of a raw module path; resolved by the dev
      // server at runtime in the browser, not by tsc's module graph (Testing section pattern).
      const mod = await import('/src/ai/index.ts');
      // @ts-expect-error — Vite dynamic import of a raw module path; resolved by the dev
      // server at runtime in the browser, not by tsc's module graph (Testing section pattern).
      const harness = await import('/src/ai/testHarness.ts');

      const canvas = document.createElement('canvas');
      document.body.appendChild(canvas);
      const studio = harness.createMiniStudio(canvas, 256);
      studio.renderOnce();
      const baseline = studio.capture(256);

      let readyUrl: string | null = null;
      const panel = mod.AvatarPanel({
        onAvatarReady: (url: string) => {
          readyUrl = url;
        },
        onCancel: () => {},
      });

      const start = performance.now();
      panel.selectTile();
      if (readyUrl === null) throw new Error('onAvatarReady was not invoked by tile selection');
      const finalUrl: string = readyUrl;
      const handle = await studio.loadModel(finalUrl, 'avatar-tile');
      studio.renderOnce();
      const elapsed = performance.now() - start;
      const after = studio.capture(256);

      let diffCount = 0;
      for (let i = 0; i < baseline.length; i += 4) {
        if (
          Math.abs(baseline[i] - after[i]) > 8 ||
          Math.abs(baseline[i + 1] - after[i + 1]) > 8 ||
          Math.abs(baseline[i + 2] - after[i + 2]) > 8
        ) {
          diffCount++;
        }
      }

      return {
        elapsed,
        readyUrl: finalUrl,
        requestedAssetId: (mod as any).AVATAR_TILE_ASSET_ID as string,
        meshes: handle.stats.meshes,
        tris: handle.stats.tris,
        diffCount,
      };
    });

    expect(result.requestedAssetId).toBe('kenney/mini-dungeon/character-human');
    expect(result.readyUrl).toBe('/assets/kenney/mini-dungeon/character-human.glb');
    expect(result.meshes).toBeGreaterThanOrEqual(1);
    expect(result.elapsed).toBeLessThan(2000);
    expect(result.diffCount).toBeGreaterThanOrEqual(1000);

    console.log(
      '[S6] avatar tile elapsed (ms):',
      result.elapsed,
      'meshes:',
      result.meshes,
      'tris:',
      result.tris,
      'diffCount:',
      result.diffCount,
    );
  });
});
