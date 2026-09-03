import { useAccount } from './account';
import { buildCheckoutPanel } from './checkout';
import { getTelemetryOptIn, setTelemetryOptIn } from './telemetry';

/** The signed-out account panel (review Q2 — required by S2/App-shell chrome, absent from the
 *  original SPEC's exported surface). Plain DOM: no JSX/React in this project. Renders:
 *   - the sign-in affordance + a `Signed out` status (SPEC §1 Target 2), exposed both as visible
 *     text and as `data-testid="account-status" data-status="signed-out"`;
 *   - the "Upgrade to Pro" checkout stub (SPEC §1 Target 5);
 *   - the visible, opt-in telemetry toggle this silo owns (SPEC §1 Target 6). */
export function AccountPanel(): HTMLElement {
  const account = useAccount();

  const root = document.createElement('div');
  root.className = 'account-panel';
  root.dataset.testid = 'account-panel';

  const status = document.createElement('div');
  status.dataset.testid = 'account-status';
  status.dataset.status = account.status;
  status.textContent = account.status === 'signed-in' ? 'Signed in' : 'Signed out';
  root.appendChild(status);

  const signInBtn = document.createElement('button');
  signInBtn.type = 'button';
  signInBtn.dataset.testid = 'sign-in-btn';
  signInBtn.textContent = 'Sign in';
  signInBtn.addEventListener('click', () => account.signIn());
  root.appendChild(signInBtn);

  const upgradeBtn = document.createElement('button');
  upgradeBtn.type = 'button';
  upgradeBtn.dataset.testid = 'upgrade-btn';
  upgradeBtn.textContent = 'Upgrade to Pro';
  root.appendChild(upgradeBtn);

  const checkoutPanel = buildCheckoutPanel();
  upgradeBtn.addEventListener('click', () => {
    checkoutPanel.hidden = false;
  });
  root.appendChild(checkoutPanel);

  const telemetryLabel = document.createElement('label');
  telemetryLabel.dataset.testid = 'telemetry-opt-in-label';

  const telemetryCheckbox = document.createElement('input');
  telemetryCheckbox.type = 'checkbox';
  telemetryCheckbox.dataset.testid = 'telemetry-opt-in';
  telemetryCheckbox.checked = getTelemetryOptIn();
  telemetryCheckbox.addEventListener('change', () => {
    setTelemetryOptIn(telemetryCheckbox.checked);
  });

  telemetryLabel.appendChild(telemetryCheckbox);
  telemetryLabel.appendChild(document.createTextNode('Share anonymous usage data'));
  root.appendChild(telemetryLabel);

  return root;
}
