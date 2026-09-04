// S5 — Accounts, Pro, ads, telemetry — frozen interface contract.
//
// Origin: SCOPE.md section 2 ("S5 — src/account/types.d.ts"), with two corrections applied
// per explicit Warden instruction for Wave 2 (both documented as findings in qa/latest.md):
//
//   1. AccountState.status — DECISIONS.md #18 overrides SCOPE.md's literal `'loading' | 'ready'`
//      union: "useAccount() resolves synchronously ... so a loading state is unreachable. An
//      unreachable state is a bug waiting to be depended on. The union is
//      'signed-out' | 'signed-in'." useAccount() resolves synchronously to 'signed-out' on every
//      mount in Wave 2 (no real Supabase session/entitlement attempt — decision #12 Q1).
//
//   2. AccountPanel() / AdSlot() return type — SCOPE.md wrote `JSX.Element`, but there is no
//      React installed in this project (no react/react-dom dependency, no jsx compiler option in
//      tsconfig.json). Both are implemented as plain DOM factories and typed as `HTMLElement`.
//
// This file is the type-only contract. Runtime implementations live in the sibling .ts files in
// this directory and are re-exported, name-for-name, from ./index.ts.

/** Account/session state. Never throws; never rejects; always resolves synchronously. */
export interface AccountState {
  /** Wave 2 has no real Supabase session/entitlement attempt (decision #12 Q1), so this is
   *  always 'signed-out' — every load, with or without env vars. 'signed-in' stays in the union
   *  for API stability (a future real-auth wiring reads/writes it) but no Wave-2 code path
   *  enters it. See decision #18. */
  status: 'signed-out' | 'signed-in';
  /** null when signed out or when no auth backend is configured (default, 0-env state). */
  user: { id: string; email: string } | null;
  /** Always `false` when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are unset or when Supabase
   *  is unreachable. Never throws, never blocks app boot. There is no paid entitlement check
   *  today — this is a stub flag other silos may branch on for Pro-gated UI. */
  isPro: boolean;
  /** Opens the signed-out panel's sign-in affordance. No-op (logs console.info, never throws)
   *  when Supabase env vars are absent — true for every Wave-2 load. */
  signIn: () => void;
  /** No-op (logs console.info, never throws). */
  signOut: () => void;
}

/** Consumed by any silo that needs to know sign-in/Pro state. Depends on nothing — reads no
 *  network, and any storage access is wrapped so it can never throw. Resolves synchronously:
 *  callers never need to await or poll a loading state. */
export declare function useAccount(): AccountState;

/** The signed-out account panel. Required by S2/App-shell chrome (reviews/codex_review_S5.md:3-6
 *  Q2) — absent from the original SPEC's exported surface, added here. Plain DOM: no JSX/React
 *  in this project. */
export declare function AccountPanel(): HTMLElement;

export interface AdSlotProps {
  size?: '300x250' | '728x90' | '160x600';
  /** placement id; accepted for future wiring, ignored in house-placeholder mode (the only mode
   *  Wave 2 ships — see below). */
  placement?: string;
}

/** Ad slot component contract. Renders the house placeholder unconditionally in Wave 2 — the
 *  "configured EthicalAds" live-serving code path is removed entirely, not merely disabled
 *  (reviews/codex_review_S5.md:12; DECISIONS.md #9). Makes 0 requests to ethicalads.io. Plain
 *  DOM, no layout shift: the returned element always reserves its full `size` box up front. */
export declare function AdSlot(props: AdSlotProps): HTMLElement;

/** Telemetry: opt-in, anonymised, fire-and-forget. Every call is a no-op until the user has
 *  opted in via the visible toggle this silo owns (persisted in
 *  localStorage['telemetry-opt-in'] = 'true'). No PII is ever included. `track()` attaches its
 *  own internally generated anonymous UUID — callers never supply an anonId
 *  (reviews/codex_review_S5.md:14). */
export type TelemetryEvent =
  | { type: 'asset_loaded'; assetKind: 'model' | 'hdri' | 'material'; assetId: string }
  | { type: 'effect_applied'; effect: string }
  | { type: 'export_completed'; exportKind: 'still' | 'turntable' | 'glb' | 'gltf' | 'blender-package'; ms: number }
  | { type: 'tool_used'; tool: string }
  | { type: 'session_started' }
  | { type: 'pro_cta_clicked'; source: string };

export declare function track(event: TelemetryEvent): void;
export declare function setTelemetryOptIn(optIn: boolean): void;
export declare function getTelemetryOptIn(): boolean;
