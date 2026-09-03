// Safe localStorage wrappers. Every account-panel/telemetry read or write goes through these so
// a throwing localStorage (private-mode Safari, a hostile shim, storage quota errors, etc.) can
// never propagate into useAccount() or any other S5 export — reviews/codex_review_S5.md:16
// ("localStorage throws" robustness finding).

export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
