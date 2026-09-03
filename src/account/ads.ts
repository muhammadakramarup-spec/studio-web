import type { AdSlotProps } from './types';

// The "configured EthicalAds" live-serving execution path is removed entirely, not merely
// disabled (reviews/codex_review_S5.md:12; DECISIONS.md #9). There is no code path in this file
// that reads VITE_ETHICALADS_PUBLISHER_ID, constructs an ad-client script tag, or fetches
// anything from ethicalads.io — AdSlot always renders the house placeholder.

const SIZE_BOX: Record<NonNullable<AdSlotProps['size']>, { w: number; h: number }> = {
  '300x250': { w: 300, h: 250 },
  '728x90': { w: 728, h: 90 },
  '160x600': { w: 160, h: 600 },
};

export function AdSlot(props: AdSlotProps): HTMLElement {
  const size = props.size ?? '300x250';
  const box = SIZE_BOX[size];

  const el = document.createElement('div');
  el.className = 'ad-slot ad-slot--house';
  el.dataset.testid = 'ad-slot';
  el.dataset.adMode = 'house';
  el.dataset.adSize = size;
  if (props.placement) el.dataset.placement = props.placement;

  // Reserve the full box up front so the placeholder never causes layout shift once it mounts.
  el.style.width = `${box.w}px`;
  el.style.height = `${box.h}px`;
  el.style.boxSizing = 'border-box';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.textAlign = 'center';
  el.style.border = '1px dashed currentColor';
  el.style.fontSize = '12px';
  el.style.opacity = '0.75';

  const label = document.createElement('span');
  label.dataset.testid = 'ad-slot-label';
  label.textContent = 'House ad — Upgrade to Pro to remove';
  el.appendChild(label);

  return el;
}
