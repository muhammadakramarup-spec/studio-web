# S5 QA — Accounts, Pro, ads, telemetry (Wave 2)

Run: `npx playwright test tests/s5.spec.ts --reporter=line` against the already-running dev
server at `http://localhost:5173` (no server started by this silo). All 8 tests pass. 0 of the
five env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_LEMONSQUEEZY_STORE_URL`,
`VITE_ETHICALADS_PUBLISHER_ID`, `VITE_TELEMETRY_ENDPOINT`) were set for any run in this report.

## Checks (quoted from SCOPE.md §1 / `src/account/SPEC.md` §1)

| Check (quoted from SCOPE.md §1) | Target | Measured | PASS/FAIL |
|---|---|---|---|
| "Zero-env boot: 0 console errors from `src/account/**`" | 0 console errors | `consoleErrors=0`, `pageErrors=0` while mounting `useAccount()`, `AccountPanel()`, `AdSlot()` (test 1) | PASS |
| "`AccountPanel()` component" — signed-out panel renders "Sign in" affordance and `Signed out` text / `data-testid account-status=signed-out` | 1/1 zero-env loads | `statusAttr="signed-out"`, `statusText="Signed out"`, `signInText="Sign in"` (test 2) | PASS |
| "`useAccount` ... `status==='ready'` and `isPro===false` **synchronously** on mount, every load, env vars present or not" — see Finding 1 below for the exact status value | resolved, non-loading, ≤500 ms | `status="signed-out"`, `isPro=false`, `user=null`, resolved in `elapsedMs=11.0–12.3` (no `await`, called synchronously; test 3, 3 runs) | PASS |
| "`AdSlot`: house placeholder in **100%** of zero-env loads, no layout shift, **0** requests to `ethicalads.io`" | 100% house mode, 0 shift, 0 requests | 3/3 sizes rendered `mode="house"` at exact reserved boxes (300×250, 728×90, 160×600), 0px width/height delta before vs. after a settle tick, `ethicalAdsRequests=0` (test 4) | PASS |
| Checkout stub: `SANDBOX`/`TEST MODE` string present; **0** requests to `lemonsqueezy.com` when unset; when set, link carries `?test_mode=true` | label present, 0 requests, correct link contract | `labelText="SANDBOX / TEST MODE"`, `lemonSqueezyRequests=0`, no link element rendered (env unset — test 5); pure `appendTestMode()` verified: `...abc?test_mode=true` and `...abc?ref=x&test_mode=true` (see Finding 2) | PASS |
| Telemetry: 3 pre-consent events → **0** POSTs; 3 opted-in events → **exactly 3** schema-valid POSTs; 3 post-opt-out events → total stays at **exactly 3** | 0 / 3 / 3 | `afterPreConsent=0`, `afterOptIn=3`, `afterOptOut=3`, `schemaValidCount=3` (every POST body has a known `type`, string `anonId`, numeric `ts`, 0 PII fields found), `eventTypeUnionSize=6` (test 6) | PASS |
| Robustness (review finding 3): `localStorage` throws → `useAccount()` still returns the signed-out ready state and does not throw | no throw, correct state | `threw=false`, `status="signed-out"`, `isPro=false`, `pageErrors=0`, with `getTelemetryOptIn`/`setTelemetryOptIn`/`AccountPanel` also exercised against a fully-throwing `localStorage` shim (test 7) | PASS |
| "No secrets in the bundle: `grep -r` over `dist/**/*.js` ... finds 0 matches for `sk_` / `service_role` / `sb_secret` longer than 20 chars" | 0 matches | `secretMatches=0` over `jsFiles=1` (`account.js`) from an isolated zero-env build of `src/account/index.ts` — see Finding 3 for why this isn't yet the shared `dist/` (test 8) | PASS |

**8/8 Playwright tests pass.** Full run output (`--reporter=line`): `8 passed (8.7s)`.

## Findings (deviations from literal source text, each cited)

1. **`AccountState.status` union.** `SCOPE.md:300` and `src/account/SPEC.md:29,68` write
   `status: 'loading' | 'ready'` and the check text `status==='ready'`. `DECISIONS.md:144-146`
   (#18) explicitly overrides this: *"`useAccount()` resolves synchronously ... so a loading
   state is unreachable. An unreachable state is a bug waiting to be depended on. The union is
   `'signed-out' | 'signed-in'`."* `DECISIONS.md:155` (#19) states decisions #13–#18 override
   `SCOPE.md` §5 "wherever a gap is listed there" — gap 6 (`SCOPE.md:516-519`) is exactly this
   field. Per this task's own Warden brief, which quotes #18 verbatim as binding, `types.d.ts`
   implements `status: 'signed-out' | 'signed-in'`, resolving synchronously to `'signed-out'`.
   Tests assert `status==='signed-out'` (the non-loading, resolved state) as the equivalent of
   the literal SCOPE text's `'ready'`. Flagging so Assembly/Warden reconciles the SCOPE.md §2
   text, which was not mechanically updated after decision #18 was made.
2. **`AccountPanel()` / `AdSlot()` return type.** `SCOPE.md:311,319` write `JSX.Element`. This
   project has no React dependency and no `jsx` compiler option (`tsconfig.json` — no `jsx`
   field; `package.json` — no `react`/`react-dom`). Per this task's explicit instruction ("keep
   everything plain DOM and type it accordingly rather than inventing a JSX dependency"), both
   are typed and implemented as `(): HTMLElement` returning real DOM nodes built with
   `document.createElement`. Documented in `types.d.ts`.
3. **Secrets check measured against an isolated build, not the shared `dist/`.** The App shell
   (`src/app/main.ts`) is an Assembly-owned Wave-3 placeholder (`export {}` today, per
   `DECISIONS.md:158-172` #20) that imports nothing yet, so a literal `npm run build` would
   produce a `dist/` that does not contain `src/account/**` at all — a trivially-true but
   meaningless 0-matches result. Separately, `npm run build`'s `tsc --noEmit` gate over the
   *whole* project currently fails on `tests/s4.spec.ts`'s own `import("/src/timeline/...")`
   absolute-path browser imports (an S4/other-silo file, not owned by S5) — the exact same
   pattern this task's own testing instructions mandate for S5
   (`await page.evaluate(async () => { const m = await import('/src/account/index.ts'); ... })`),
   confirmed pre-existing and unrelated to this silo. Test 8 therefore builds `src/account/index.ts`
   alone (`vite build --config <throwaway lib-mode config>`, zero env vars, output to an OS temp
   directory, config file written under `src/account/` and deleted immediately after use) and
   greps the one resulting `.js` file. Recommend Assembly re-run the identical grep
   (`sk_`/`service_role`/`sb_secret`, >20 chars) over the real shared `dist/**/*.js` once Wave 3
   wires `src/app/main.ts` to import from `src/account`; this silo's code introduces no
   credential-shaped literals regardless (verified: `import.meta.env.VITE_*` reads resolve to
   `undefined` and inline to `null`/default-path fallbacks in the built output — see the bundled
   `checkout.ts` output, which reduces `buildCheckoutHref()` to `return null` with 0 env vars).
4. **`tsc --noEmit -p tsconfig.json` is not clean for the whole project right now**, for two
   reasons outside this silo's ownership: (a) other silos' in-progress files (e.g.
   `tests/s4.spec.ts`'s `/src/timeline/*.ts` absolute imports, confirmed present before this
   silo started any work) and (b) this project has no `@types/node` installed and this silo is
   forbidden from `npm install` — `tests/s5.spec.ts`'s test 8 uses `node:child_process`/`node:fs`/
   `node:path`/`node:os`, which resolve fine at Playwright's actual runtime (Node's native
   `node:` specifiers, no type-checking involved — confirmed: test 8 passes) but are flagged by a
   static `tsc --noEmit` scan lacking `@types/node`. **`src/account/**` itself is fully
   `tsc --strict`-clean in isolation** — verified via a scoped tsconfig covering only
   `src/account/**` (0 errors). This is reported as a finding, not silently worked around.

## What could not be measured

- **Live `?test_mode=true` link behavior with `VITE_LEMONSQUEEZY_STORE_URL` actually set.** The
  dev server is shared across six silos and was explicitly not to be restarted, and this silo may
  not edit `.env`/configs — so the "env var IS set" branch of Target 5 cannot be exercised through
  a real page load this wave. Substituted with a direct, deterministic test of the pure
  `appendTestMode(storeUrl)` function that `buildCheckoutHref()` calls (test 5), which is the
  entire string-building contract Target 5 specifies for that branch.
- **Full-repo `npm run build` → shared `dist/**/*.js` secrets grep.** Not measurable yet — see
  Finding 3. This silo's own code is proven secret-free by an isolated equivalent build.

## Zero third-party requests / zero secrets — confirmation

- 0 requests to `ethicalads.io` (test 4, `ethicalAdsRequests=0`; also true by construction — no
  code path in `src/account/ads.ts` references EthicalAds, `import.meta.env.VITE_ETHICALADS_PUBLISHER_ID`,
  or any external ad-client script).
- 0 requests to `lemonsqueezy.com` (test 5, `lemonSqueezyRequests=0`).
- Telemetry POSTs only go to the same-origin path `/api/telemetry` (or
  `VITE_TELEMETRY_ENDPOINT` if a future caller sets it) — never a third party, and never at all
  before opt-in (test 6).
- 0 secret-shaped strings (`sk_`/`service_role`/`sb_secret`, >20 chars) in the built
  `src/account/index.ts` bundle (test 8) — and by construction, no Supabase/Lemon Squeezy secret
  key is ever read: only public, non-secret env vars (`VITE_*`, which Vite exposes client-side by
  design) are referenced anywhere in this silo.

## Cut (per SPEC §3 / DECISIONS #9 — not built, no numeric check attempted)

Real Supabase auth flow; real Lemon Squeezy checkout (sandbox included); EthicalAds live ad
serving; server-side telemetry ingestion/dashboard; Pro entitlement enforcement/paywall;
GDPR-grade consent tooling.

## Files

- `src/account/types.d.ts` — frozen contract (2 corrections documented above)
- `src/account/env.d.ts` — ambient Vite env typing for the 5 vars this silo reads
- `src/account/storage.ts` — safe (never-throwing) `localStorage` wrappers
- `src/account/account.ts` — `useAccount()`
- `src/account/account-panel.ts` — `AccountPanel()`
- `src/account/ads.ts` — `AdSlot()`
- `src/account/checkout.ts` — checkout stub (`buildCheckoutHref`, `appendTestMode`, `buildCheckoutPanel`)
- `src/account/telemetry.ts` — `track`, `setTelemetryOptIn`, `getTelemetryOptIn`
- `src/account/index.ts` — public barrel, re-exports the frozen contract by name
- `tests/s5.spec.ts` — 8 Playwright tests, all passing
