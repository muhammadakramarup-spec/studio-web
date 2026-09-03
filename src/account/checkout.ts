// Checkout stub. Real Lemon Squeezy checkout (even sandbox) needs Akram's account sign-up
// (CONTEXT.lock rule 4 — no sign-ups by agents) and is cut from today's tested surface
// (SPEC §3). This module only ever builds a labelled stub; it never talks to lemonsqueezy.com
// unless VITE_LEMONSQUEEZY_STORE_URL is explicitly set by a later, human sign-up.

const STUB_LABEL = 'SANDBOX / TEST MODE';

/** Pure, env-independent so it is directly testable without a real
 *  VITE_LEMONSQUEEZY_STORE_URL (which this project cannot set without restarting the shared dev
 *  server — out of scope for a Wave-2 silo). Appends `?test_mode=true`, or `&test_mode=true` if
 *  the store URL already carries a query string, per Lemon Squeezy's test-mode link contract
 *  (SPEC §1 Target 5, Evidence E5). */
export function appendTestMode(storeUrl: string): string {
  const separator = storeUrl.includes('?') ? '&' : '?';
  return `${storeUrl}${separator}test_mode=true`;
}

/** Returns null when VITE_LEMONSQUEEZY_STORE_URL is unset (true for every Wave-2 load) — in
 *  that case the caller must render the stub with no link at all, so 0 requests to
 *  lemonsqueezy.com are ever made. */
export function buildCheckoutHref(): string | null {
  const storeUrl = import.meta.env.VITE_LEMONSQUEEZY_STORE_URL;
  if (!storeUrl || storeUrl.length === 0) return null;
  return appendTestMode(storeUrl);
}

export function buildCheckoutPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'checkout-stub';
  panel.dataset.testid = 'checkout-modal';
  panel.hidden = true;

  const badge = document.createElement('strong');
  badge.dataset.testid = 'checkout-stub-label';
  badge.textContent = STUB_LABEL;
  panel.appendChild(badge);

  const copy = document.createElement('p');
  copy.textContent =
    'Pro checkout is a stub today — no real payment happens. ' +
    'Real checkout activates once a Lemon Squeezy sandbox store is configured.';
  panel.appendChild(copy);

  const href = buildCheckoutHref();
  if (href) {
    const link = document.createElement('a');
    link.dataset.testid = 'checkout-link';
    link.href = href;
    link.rel = 'noopener noreferrer';
    link.target = '_blank';
    link.textContent = 'Continue to sandbox checkout';
    panel.appendChild(link);
  } else {
    const note = document.createElement('span');
    note.dataset.testid = 'checkout-link-absent';
    note.textContent = 'No checkout link configured — this is a stub.';
    panel.appendChild(note);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.dataset.testid = 'checkout-close';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => {
    panel.hidden = true;
  });
  panel.appendChild(closeBtn);

  return panel;
}
