import type { TelemetryEvent } from './types';
import { safeGet, safeRemove, safeSet } from './storage';
import { buildTelemetryPayload } from './telemetry-payload';

// Opt-in, anonymised, fire-and-forget telemetry. The original SPEC's acceptance check was
// trivially passable by a permanently no-op track() — it only asserted 0 requests before/after
// consent, never that delivery actually happens while opted in (review Q3). This is the
// replacement: track() really posts while opted in, against a single fixed same-origin
// endpoint that a Playwright test can intercept with page.route without any real backend.

const OPT_IN_KEY = 'telemetry-opt-in';
const ANON_ID_KEY = 'telemetry-anon-id';

/** No real telemetry backend exists today. Keep the destination same-origin so a build-time
 *  setting cannot redirect consented data to an arbitrary third party. */
const DEFAULT_ENDPOINT = '/api/telemetry';

let optInMemo: boolean | null = null;

export function getTelemetryOptIn(): boolean {
  if (optInMemo !== null) return optInMemo;
  const stored = safeGet(OPT_IN_KEY);
  optInMemo = stored === 'true';
  return optInMemo;
}

export function setTelemetryOptIn(optIn: boolean): void {
  optInMemo = optIn;
  safeSet(OPT_IN_KEY, optIn ? 'true' : 'false');
  if (!optIn) safeRemove(ANON_ID_KEY);
}

function getOrCreateAnonId(): string {
  const existing = safeGet(ANON_ID_KEY);
  if (existing) return existing;
  const generated =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `anon-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  safeSet(ANON_ID_KEY, generated);
  return generated;
}

/** Never throws, never blocks the caller — fire-and-forget. No-op until the user has opted in.
 *  Attaches its own internally generated anonymous UUID; callers never supply one
 *  (reviews/codex_review_S5.md:14). No PII: no filenames, no email, no user id, no free text,
 *  no query-string URLs — only the typed event shape plus anonId + a timestamp. */
export function track(event: TelemetryEvent): void {
  if (!getTelemetryOptIn()) return;
  const payload = buildTelemetryPayload(event, getOrCreateAnonId(), Date.now());
  if (!payload) return;

  try {
    void fetch(DEFAULT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // No backend exists today (SPEC §3) — a failed/unreachable send is expected and must
      // never surface as a console error.
    });
  } catch {
    // fetch itself throwing synchronously (unsupported environment) must not propagate.
  }
}
