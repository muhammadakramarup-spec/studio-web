import type { AccountState } from './types';
import { safeGet } from './storage';

// Wave 2 makes no real Supabase session/entitlement attempt (decision #12 Q1, review Q1) — the
// most likely overrun in the original SPEC. useAccount() resolves synchronously to the
// signed-out state on every mount, env vars present or not (decision #18).

/** Placeholder read for a future real session cache. Currently unused for anything but proving
 *  the "never throws even if localStorage throws" contract by construction: if this call
 *  throws, safeGet() swallows it and returns null, and useAccount() below never sees it. */
function probeSessionCacheSafely(): void {
  safeGet('account:session-cache');
}

function stubSignIn(): void {
  try {
    console.info('[account] signIn() is a stub — no auth backend is configured in Wave 2.');
  } catch {
    // console itself should never be missing, but never let this throw either.
  }
}

function stubSignOut(): void {
  try {
    console.info('[account] signOut() is a stub — already signed out.');
  } catch {
    // ignore
  }
}

export function useAccount(): AccountState {
  probeSessionCacheSafely();
  return {
    status: 'signed-out',
    user: null,
    isPro: false,
    signIn: stubSignIn,
    signOut: stubSignOut,
  };
}
