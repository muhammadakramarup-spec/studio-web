import type { TelemetryEvent } from './types';
import { safeGet, safeSet } from './storage';

// Opt-in, anonymised, fire-and-forget telemetry. The original SPEC's acceptance check was
// trivially passable by a permanently no-op track() — it only asserted 0 requests before/after
// consent, never that delivery actually happens while opted in (review Q3). This is the
// replacement: track() really posts while opted in, against a single fixed same-origin
// endpoint that a Playwright test can intercept with page.route without any real backend.

const OPT_IN_KEY = 'telemetry-opt-in';
const ANON_ID_KEY = 'telemetry-anon-id';

/** No real telemetry backend exists today (SPEC §3 cut list) — this relative path exists so a
 *  test can route it locally; it deliberately does not depend on any env var, so behaviour is
 *  identical with 0 env vars set. VITE_TELEMETRY_ENDPOINT, if a caller ever sets it, overrides
 *  the destination for a future real backend. */
const DEFAULT_ENDPOINT = '/api/telemetry';

function resolveEndpoint(): string {
  const configured = import.meta.env.VITE_TELEMETRY_ENDPOINT;
  return configured && configured.length > 0 ? configured : DEFAULT_ENDPOINT;
}

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

const EVENT_TYPES = [
  'asset_loaded',
  'effect_applied',
  'export_completed',
  'tool_used',
  'session_started',
  'pro_cta_clicked',
] as const;

function isValidTelemetryEvent(event: TelemetryEvent): boolean {
  return (
    typeof event === 'object' &&
    event !== null &&
    (EVENT_TYPES as readonly string[]).includes((event as { type?: unknown }).type as string)
  );
}

/** Never throws, never blocks the caller — fire-and-forget. No-op until the user has opted in.
 *  Attaches its own internally generated anonymous UUID; callers never supply one
 *  (reviews/codex_review_S5.md:14). No PII: no filenames, no email, no user id, no free text,
 *  no query-string URLs — only the typed event shape plus anonId + a timestamp. */
export function track(event: TelemetryEvent): void {
  if (!getTelemetryOptIn()) return;
  if (!isValidTelemetryEvent(event)) return;

  const payload = {
    ...event,
    anonId: getOrCreateAnonId(),
    ts: Date.now(),
  };

  try {
    void fetch(resolveEndpoint(), {
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
