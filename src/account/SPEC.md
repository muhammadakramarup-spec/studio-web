# S5 SPEC — Accounts, Pro, Ads, Telemetry

Silo: S5. Wave: 1 (scout, spec only — no code, no package.json, no installs — DECISIONS #3).
Owns: `src/account/**` only. Never edits `reference/`.

## 0. One-line summary

Everything in this silo runs today as a **stub with zero external dependencies**: signed-out
account panel, `isPro:false` gate, a house-ad placeholder, and an opt-in anonymised telemetry
logger — all fully functional with **0 env vars set**. Real Supabase/Lemon Squeezy/EthicalAds
wiring is a Wave-2+ enhancement gated entirely behind env vars Akram supplies; absence of any
one of them must never break the app (§2). EthicalAds specifically should **not** be targeted
for day one — see §4 R1 and §5.

---

## 1. Targets (numeric acceptance checks)

Ordered; each cuttable line has been moved to §3 if it lacked a number.

1. **Zero-env boot** — with 0 of `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `VITE_LEMONSQUEEZY_STORE_URL`, `VITE_ETHICALADS_PUBLISHER_ID`, `VITE_TELEMETRY_ENDPOINT`
   set, `npm run dev` boots, the app renders, and 0 console errors are thrown by `src/account/**`
   code. Measured by a Playwright run that greps the browser console for `error` level messages
   originating from any `src/account` module: count must be 0.
2. **Signed-out auth panel** — the account panel renders a "Sign in" affordance and the text
   `Signed out` (or equivalent data-testid `account-status=signed-out`) in 100% of zero-env
   loads (1/1 manual + 1/1 Playwright check).
3. **`isPro` always resolves** — `useAccount().isPro === false` and `useAccount().status ===
   'ready'` (never `'loading'` forever) within 500 ms of mount when no backend is configured.
   Measured: Playwright waits max 500 ms then asserts.
4. **Ad slot never blank-crashes** — `<AdSlot />` renders the house placeholder (§2) in 100% of
   zero-env loads, occupies its reserved `300x250` (or `728x90`) box (no layout shift >0
   measured via a before/after bounding-box diff), and never fetches any third-party script when
   `VITE_ETHICALADS_PUBLISHER_ID` is unset (0 network requests to `ethicalads.io` in the
   Playwright network log).
5. **Checkout stub is provably a stub** — clicking "Upgrade to Pro" opens a modal/panel
   containing the literal string `SANDBOX` or `TEST MODE`, and (when
   `VITE_LEMONSQUEEZY_STORE_URL` is unset) makes 0 network requests to `lemonsqueezy.com`.
   When the var *is* set, the link target must contain `?test_mode=true` per Lemon Squeezy's
   test-mode contract (Evidence E5).
6. **Telemetry is opt-in and typed** — 0 events are sent before the user flips a visible
   opt-in toggle (checked via 0 network requests to `VITE_TELEMETRY_ENDPOINT` pre-consent);
   exactly **6** event types are defined in the type union (§2); toggling opt-in off stops all
   further sends within the same session (0 requests after toggle-off, verified over a 3-event
   burst).
7. **No secrets in the bundle** — `grep -r` over `dist/**/*.js` after a zero-env build finds 0
   occurrences of any literal string longer than 20 chars matching `sk_`, `service_role`, or
   `sb_secret` (there should be none to find, since none are ever read client-side — see §2).

Anything without one of the above numeric checks is cut — see §3.

---

## 2. Interface

S5 exposes exactly three surfaces to the rest of the app: a hook, a component, and a telemetry
function + type. **This is a proposal** (DECISIONS #4) for merge into `SCOPE.md` — not yet
frozen.

```ts
// src/account/types.d.ts  (proposed — pending SCOPE.md freeze)

/** Account/session state. Never throws; never rejects; always resolves. */
export interface AccountState {
  /** 'loading' only for the first tick while localStorage/env are read; must reach
   *  'ready' within 500ms even with 0 env vars (Target #3). */
  status: 'loading' | 'ready';
  /** null when signed out or when no auth backend is configured (default, 0-env state). */
  user: { id: string; email: string } | null;
  /** Always `false` when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are unset or when
   *  Supabase is unreachable. Never throws, never blocks app boot. There is no paid
   *  entitlement check today — this is a stub flag other silos may branch on for
   *  Pro-gated UI (e.g. S2 editor hiding a "Pro" watermark toggle). */
  isPro: boolean;
  /** Opens the signed-out panel's sign-in affordance. No-op (logs a console.info,
   *  does not throw) when Supabase env vars are absent. */
  signIn: () => void;
  signOut: () => void;
}

/** Consumed by any silo that needs to know sign-in/Pro state. Depends on nothing —
 *  reads only import.meta.env and localStorage. Other silos (S1 viewer, S2 editor,
 *  S3 library, S4 timeline) may call this read-only; only S5 code writes to it. */
export declare function useAccount(): AccountState;

/** Ad slot component contract. Renders the house placeholder unless
 *  VITE_ETHICALADS_PUBLISHER_ID is set AND the EthicalAds client script is confirmed
 *  reachable (checked once per session, fails closed to the placeholder — never
 *  blocks render waiting on network). */
export interface AdSlotProps {
  size?: '300x250' | '728x90' | '160x600';
  /** placement id passed straight through to EthicalAds once wired; ignored in
   *  house-placeholder mode. */
  placement?: string;
}
export declare function AdSlot(props: AdSlotProps): JSX.Element;

/** Telemetry: opt-in, anonymised, fire-and-forget. Every call is a no-op until the
 *  user has opted in via the visible toggle this silo owns (persisted in
 *  localStorage['telemetry-opt-in'] = 'true'). No PII is ever included — see the
 *  "never collected" list below. */
export type TelemetryEvent =
  | { type: 'asset_loaded'; assetKind: 'model' | 'hdri' | 'material'; assetId: string }
  | { type: 'effect_applied'; effect: string }
  | { type: 'export_completed'; exportKind: 'still' | 'turntable'; ms: number }
  | { type: 'tool_used'; tool: string }
  | { type: 'session_started'; anonId: string }
  | { type: 'pro_cta_clicked'; source: string };

export declare function track(event: TelemetryEvent): void;
export declare function setTelemetryOptIn(optIn: boolean): void;
export declare function getTelemetryOptIn(): boolean;
```

**How `isPro` behaves with no backend configured (binding today):** `isPro` is hardcoded to
`false` unless a Supabase session AND a paid-entitlement row are both present. With 0 env vars,
the Supabase client is never constructed — `useAccount()` short-circuits to
`{status:'ready', user:null, isPro:false, signIn:<no-op>, signOut:<no-op>}` synchronously on
mount (no network round-trip, so Target #3's 500 ms budget is trivially met). No silo should
gate a *core* Wave-1 feature (viewer/editor/library/timeline) behind `isPro` — only cosmetic
Pro-upsell UI may branch on it.

**What telemetry never collects:** IP address is not logged application-side (server/CDN logs
are outside this silo's control and outside scope); no filenames, no email, no user id beyond a
random client-generated `anonId` (a `crypto.randomUUID()` stored in localStorage, unrelated to
any auth `user.id`); no asset *content*, only its catalog id/kind; no free-text; no page URLs
with query strings attached.

**Dependencies on other silos:** none required for zero-env operation. Optional soft
dependencies once other silos exist: S3 (library) may pass `assetId`/`assetKind` into
`track()`; S2 (editor) may pass `tool`/`effect` names; S4 (timeline) may pass `export_completed`
timing. These are call-site integrations other silos add later — S5 does not import from them.

---

## 3. Cut list (moved here because no numeric check was possible today)

- **Real Supabase auth flow (magic link / OAuth)** — cut. Needs a live project (sign-up,
  §5 #1) and cannot be tested without Akram's project ref. Stub ships instead; wiring is a
  Wave-2+ task once `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` exist.
- **Real Lemon Squeezy checkout (even sandbox)** — cut from today's *tested* surface. A
  sandbox store technically requires a Lemon Squeezy account (§5 #2), which is a sign-up the
  Warden must route to Akram (DECISIONS: no sign-ups by agents). The checkout **stub** (Target
  #5) ships today; the live sandbox link only activates if Akram supplies the store URL.
- **EthicalAds live ad serving** — cut outright, not deferred. Evidence (§6, E3) shows
  EthicalAds targets sites with 50k+ monthly pageviews and vets traffic before payout; a
  same-day launch has 0 pageviews history. Applying today would predictably be rejected or sit
  in limbo. House-ad placeholder (§2 AdSlot) ships in its place; do not build UI that assumes
  EthicalAds approval.
- **Server-side telemetry ingestion/dashboard** — cut. This silo specs and emits the client-side
  event shape only; no backend exists today to receive `VITE_TELEMETRY_ENDPOINT` posts. `track()`
  is written to degrade to a no-op (or console-only in dev) if the endpoint var is unset, so it
  never blocks on a service that doesn't exist yet.
- **Pro entitlement enforcement / paywall** — cut. `isPro` is a read-only flag with no server
  authority behind it today; nothing in Wave 1 should treat it as security, only as UI hinting.
- **GDPR/consent-banner-grade telemetry compliance tooling** — cut; the opt-in toggle plus the
  "never collected" list (§2) is the whole of today's privacy surface. A real consent-management
  review is out of scope for a one-day build.

---

## 4. Risks (ranked)

**R1 — EthicalAds will very likely reject or ignore a same-day-launch application.**
Evidence: EthicalAds explicitly states it is "actively seeking developer-focused sites with
50k+ monthly pageviews" (E3). A brand-new studio-web site has no traffic history. This is a
*risk to the Pro/ads narrative*, not a Wave-1 target — mitigated by shipping the house-ad
placeholder (§2) so the ad slot's layout and behavior are fully testable without the vendor.
Fallback if Akram wants real ads sooner: house-ad self-promotion (link to Pro upgrade) in the
same slot indefinitely, or apply to EthicalAds once real traffic exists and treat approval as
a future, separate task.

**R2 — Supabase free-project auto-pause breaks auth silently after 7 days idle.**
Evidence: E1 ("Free projects are paused after 1 week of inactivity"). Mitigation: `useAccount()`
must treat a failed/unreachable Supabase call as "no backend configured" (falls back to
signed-out + `isPro:false`) rather than throwing — this is already Target #1/#3's contract, so
the failure mode is identical to the zero-env case and needs no special-case code. Fallback:
Akram (or a scheduled ping) hits the project dashboard periodically to keep it warm, or accepts
that auth silently degrades to signed-out after inactivity — acceptable for a stub.

**R3 — Lemon Squeezy sandbox checkout still requires a real account sign-up.**
Evidence: E5 confirms test mode is free and needs no live merchant application, but an account
must still exist. Per CONTEXT.lock rule 4 (no sign-ups by agents), this silo cannot create that
account. Mitigation: ship the checkout **stub** (Target #5) that works with 0 env vars; only
activate the live sandbox link after Akram completes sign-up #2 (§5).

**R4 — Telemetry endpoint doesn't exist yet, so "opt-in" has nothing real to send to.**
Mitigation: `track()`/`setTelemetryOptIn()` are fully testable today via a console-log fallback
or a local no-op; the event *shape* (Target #6) is what Wave 1 can actually prove, not delivery
to a live backend. Low risk — this is inherent to "stub," not a surprise.

**R5 — `isPro` UI accidentally becomes a hard gate for a core feature.**
Mitigation: called out explicitly in §2; Wave-2 code review should grep other silos for
`isPro` usage and flag any gate on viewer/editor/library/timeline core paths as a scope
violation.

---

## 5. SIGN-UPS FOR AKRAM

Read this section aloud to Akram. Nothing here has been done by any agent — no accounts exist,
no payment details were entered, nothing was spent (CONTEXT.lock rule 4).

1. **Supabase** — auth (optional today, needed only for real sign-in later).
   URL: https://supabase.com/dashboard/sign-up
   Payment method required: **No** (E2 — free tier confirmed card-free at signup).
   What it hands back: a **Project URL** and an **anon/public API key** from
   Project Settings → API.
   Env vars the code will read: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
   What breaks if skipped: nothing — the app already runs fully in signed-out/`isPro:false`
   mode with 0 env vars (Target #1). Skipping just means no one can actually sign in today.

2. **Lemon Squeezy** — checkout / Pro purchase (optional today; only needed to make the
   "Upgrade" button open a real sandbox checkout instead of the stub modal).
   URL: https://app.lemonsqueezy.com/register
   Payment method required: **No** to sign up and use test/sandbox mode (E5). A payment
   method is only needed later, when Akram activates the store for *live* sales.
   What it hands back: a **Store URL** (e.g. `yourstore.lemonsqueezy.com`) and, for a real
   integration beyond today's stub, an **API key** from Settings → API.
   Env var the code will read: `VITE_LEMONSQUEEZY_STORE_URL` (test-mode store URL only,
   suffixed `?test_mode=true` per Lemon Squeezy's own test-mode link contract).
   What breaks if skipped: nothing — Target #5's checkout stub already opens and is labelled
   `SANDBOX`/`TEST MODE` with 0 env vars. Skipping just means the button stays a labelled stub.

3. **EthicalAds — do NOT sign up today.**
   URL: https://www.ethicalads.io/publishers/
   Recommendation: **skip**. Evidence (E3) shows EthicalAds targets sites with 50k+ monthly
   pageviews and reviews traffic authenticity before approval/payout; a same-day launch has no
   traffic history and would likely be rejected or left pending indefinitely. Revisit only once
   the site has real, sustained traffic — this is a future task, not a Wave-1 or Wave-2 one.
   If/when revisited: no payment method required to apply; hands back a **Publisher ID** /
   ad-client snippet; env var `VITE_ETHICALADS_PUBLISHER_ID`. Until then the house-ad
   placeholder (§2) is what ships.

4. **Cloudflare Pages + R2** — hosting (needed for the public deploy at end of day; a separate
   concern from this silo, flagged here only because it shares the "sign-ups for Akram" list
   and CONTEXT.lock rule 4 forbids agents from doing it).
   URL: https://dash.cloudflare.com/sign-up
   Payment method required: **No** for the free tier (R2: 10 GB storage + zero egress, E6;
   Pages: 500 builds/month, 20 000 files/site, 25 MiB max file size, E7).
   What it hands back: an **Account ID**, and for R2 specifically an **S3-compatible API
   token** (Access Key ID / Secret) if programmatic upload is needed beyond the Pages Git
   integration.
   Env vars: outside S5's scope (owned by whichever silo/Warden task wires deploy) — flagging
   only so Akram sees the full sign-up list in one place. No public deploy happens without
   Akram regardless (CONTEXT.lock rule 4).

**Order recommendation:** if Akram wants the fullest demo today, do #1 (Supabase) first since
it is instant and free; #2 (Lemon Squeezy) next, also instant; skip #3 entirely; do #4
(Cloudflare) whenever ready to actually deploy publicly. None of the four block any Wave-1
target in this silo — the app is designed to run and be fully tested with **0 of these done**.

---

## 6. Evidence

| # | Claim | Source | Date read |
|---|---|---|---|
| E1 | Supabase free projects pause after 1 week (7 days) of inactivity | https://supabase.com/pricing | 2026-09-03 |
| E2 | Supabase free tier: 2 active projects, 500 MB DB, 1 GB file storage, 50,000 MAU, no credit card required to sign up | https://supabase.com/pricing ; corroborated https://dev.to/agws/setup-n8n-for-free-with-supabase-no-credit-card-verification-needed-4pej | 2026-09-03 |
| E3 | EthicalAds is "actively seeking developer-focused sites with 50k+ monthly pageviews"; reviews traffic authenticity before payout; ad must be the only ad on the page | https://www.ethicalads.io/publisher-guide/ | 2026-09-03 |
| E4 | EthicalAds publisher application is a 3-step process: apply → set up ad client → request paid-ad approval (no stated turnaround time) | https://www.ethicalads.io/publisher-guide/ | 2026-09-03 |
| E5 | New Lemon Squeezy stores start in Test Mode by default with full feature access; test mode uses dummy customer details/test cards and is fully separate from live store data; no live merchant application needed to use it | https://docs.lemonsqueezy.com/help/getting-started/test-mode | 2026-09-03 |
| E6 | No credit card required to sign up for Lemon Squeezy; payment details only needed to activate the *live* store | https://lemonsqueezy.nolt.io/478 ; https://www.lemonsqueezy.com/pricing | 2026-09-03 |
| E7 | Cloudflare R2 free tier: 10 GB-month storage, 1,000,000 Class A ops/month, 10,000,000 Class B ops/month, egress free (Standard storage only) | https://developers.cloudflare.com/r2/pricing/ | 2026-09-03 |
| E8 | Cloudflare Pages free tier: 500 builds/month, 1 concurrent build, 20-minute build timeout, up to 20,000 files per site, 25 MiB max individual file size, 100 custom domains/project | https://developers.cloudflare.com/pages/platform/limits/ | 2026-09-03 |

Uncited limits from other sources encountered during research (various pricing-aggregator blogs
claiming "180 build minutes" or "3,000 build minutes" for Cloudflare Pages) were **not** used
above because they conflicted with each other and could not be confirmed against Cloudflare's
own docs (E8), which specify build *count* and *timeout*, not a monthly minutes budget — per
this SPEC's own rule, an uncited/unconfirmable limit is deleted rather than guessed.
