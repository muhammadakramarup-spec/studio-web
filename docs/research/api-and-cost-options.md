# API and cost options — Build / Buy / Prototype / Defer / Reject

Written after `docs/design/darkroom-request.md`, `docs/research/competitive-audit.md`, and
`docs/research/accessibility-triage.md`, per the task ordering. Access date for every citation
below: 2026-09-04, unless marked otherwise. **No account was created, no purchase was made, and no
provider was integrated in producing this document** — every figure below comes from a public
pricing/docs page fetch or a clearly labeled search-derived estimate.

**[E]** = evidence from a fetched primary source. **[U]** = unverified — fetch failed, page did not
render pricing, or figure is search-derived rather than confirmed on the primary page. **[O]** =
this document's judgment, not a sourced fact.

Per `docs/superpowers/plans/2026-09-04-studio-web-research-and-monetization.md` and the execution
handoff: every price/vendor statement in the earlier draft documents (`DECISIONS.md` #10's Meshy
figures in particular) is treated here as a hypothesis, re-verified independently below rather than
copied forward.

---

## 1. AI product mockups

| Option | Price/unit | Free allowance | Output rights | Privacy/training | Retention | Latency | Rate limits | Geo limits | Fallback | Cancellation |
|---|---|---|---|---|---|---|---|---|---|---|
| **Womp** — <https://www.womp.com/pricing> (fetched 2026-09-04) | **[E]** Pro $9.99/mo (annual) for 12,000 AI credits/mo (~600 images or ~48 3D models, i.e. roughly $0.017-$0.21/output depending on type) | **[E]** Starter free forever, 300 credits/day (~15 images/day) | **[U]** not stated on the pricing page | **[U]** not stated on the pricing page | **[U]** not stated | **[U]** not stated | **[U]** not stated | **[U]** not stated | **[U]** not stated | **[U]** not stated — self-serve monthly plan, cancellation mechanism not confirmed on this page |
| **Spline** — <https://www.spline.design/pricing> (fetched 2026-09-04) | **[E]** Hobby $12-15/mo for 2,000 AI credits/mo | **[E]** Free tier exists but AI-credit allowance on Free not itemized on this page — **[U]** | **[U]** not detailed on pricing page | **[U]** not stated | **[U]** not stated | **[U]** not stated | **[U]** not stated | **[U]** not stated | **[U]** not stated | **[U]** not stated |
| Canva AI Mockup Generator — <https://www.canva.com/create/mockup-generator/> | **[U]** page returned HTTP 403 to WebFetch; not confirmed this pass | **[U]** | **[U]** | **[U]** | **[U]** | **[U]** | **[U]** | **[U]** | **[U]** | **[U]** |
| Mockey AI — <https://mockey.ai/pricing> | **[U]** page fetched but returned no tier detail | **[U]** | **[U]** | **[U]** | **[U]** | **[U]** | **[U]** | **[U]** | **[U]** | **[U]** |

**Recommendation: Defer.** No vendor in this category returned decision-grade evidence for output
rights, training-data policy, or SLA/latency — the two things that matter most before committing a
paid wedge feature. `docs/research/competitive-audit.md` §2 already flags this as the weakest-evidence
category researched. Before buying, re-run this specific lookup against each vendor's Terms of
Service and API docs pages directly (not marketing pricing pages), and consider that "AI product
mockups" may be better served by composing Category 2 (image editing) primitives — background
removal + relight + compositing — rather than a single closed mockup vendor.

---

## 2. Image editing

| Option | Price/unit | Free allowance | Output rights | Privacy/training | Retention | Latency | Rate limits | Geo limits | Fallback | Cancellation |
|---|---|---|---|---|---|---|---|---|---|---|
| **Photoroom API** — <https://www.photoroom.com/api/pricing> (fetched 2026-09-04) | **[E]** Remove Background API $0.02/image; Image Editing API (advanced) $0.10/image; Enterprise volume discounts | **[E]** 10 free production calls (Remove Background), 1,000 sandbox calls/mo (watermarked, Image Editing) | **[U]** not stated on pricing page | **[U]** not stated on pricing page | **[U]** not stated | **[U]** not stated | **[U]** not stated | **[U]** not stated | **[U]** not stated | **[U]** not stated |
| **remove.bg API** — <https://www.remove.bg/api> (fetched 2026-09-04) | **[U]** credit-based, per-image credit cost for standard resolution not itemized on the fetched page; high-res (≤50MP) confirmed at 1 credit/image | **[E]** First 50 API calls/month free | **[U]** not stated on this page | **[E]** Optional opt-in "Improvement Program" to contribute images for model improvement — explicitly voluntary, not mandatory | **[U]** not stated | **[U]** not stated | **[E]** Up to 500 images/minute for 1MP images, scaling down for larger images | **[U]** not stated | **[U]** not stated | **[U]** not stated |

**Cost model — 100 / 1,000 / 10,000 images/month, using Photoroom Remove Background API at
$0.02/image (assumption: simple background removal, not the $0.10 advanced-editing tier):**

| Volume | Calculation | Monthly cost |
|---|---|---|
| 100 | (100 − 10 free) × $0.02 | **$1.80** |
| 1,000 | (1,000 − 10 free) × $0.02 | **$19.80** |
| 10,000 | (10,000 − 10 free) × $0.02 | **$199.80** |

**Recommendation: Prototype.** Photoroom's per-image price is confirmed and cheap at low-to-mid
volume; the studio already needs *some* image post-processing path for any future mockup/export
feature. Prototype behind a server-side proxy (never call from the browser bundle, per `CLAUDE.md`
operating rule 8) with a hard per-user quota before any public launch. Output-rights and
training-data policy must be re-verified against Photoroom's actual Terms of Service (not the
pricing page) before Buy.

---

## 3. Image-to-3D

Earlier-draft claim to re-verify (`DECISIONS.md` #10): "100 free monthly credits are web-app only;
API access starts at the $20/mo Pro plan (~$0.60 per generation)." **Re-verified below — partially
confirmed, partially superseded.**

| Option | Price/unit | Free allowance | Output rights | Privacy/training | Latency | Rate limits | Fallback | Cancellation |
|---|---|---|---|---|---|---|---|---|
| **Meshy AI** — <https://www.meshy.ai/pricing> (fetched 2026-09-04) | **[E]** Pro $20/mo = 1,000 credits/mo (confirms the earlier draft's $20/mo Pro-plan claim; the draft's "~$0.60/generation" figure is **not independently re-derived here** — credit cost per generation depends on generation mode/quality and was not itemized on the pricing page fetched — mark that specific per-generation figure **[U] still unverified**) | **[E]** Free tier: 100 credits/mo | **[E]** Free-tier outputs: CC BY 4.0 (commercial use permitted with attribution). Paid (Premium+) outputs: "exclusively yours... full rights to distribute and sell." General ToS: user owns created assets if source materials don't infringe others' copyright | **[U]** not stated on pricing page | **[U]** not stated | **[U]** not stated | **[U]** not stated | **[U]** not stated |
| **Hyper3D (Rodin)** — <https://hyper3d.ai/pricing> (fetched 2026-09-04) | **[E]** Creator $30/mo (or $24/mo annual) ≈ 60 models/mo → **≈$0.40-$0.50/model**; Business $120/mo (or $96/mo annual) ≈ 416 models/mo → **≈$0.23-$0.29/model**; Free-tier direct credits $1.50/credit | **[E]** Free plan: pay-by-result before confirming, 10 private assets | **[E]** Paid plans include "broader export and usage rights"; Business tier includes ChatAvatar commercial license | **[U]** not stated on pricing page | **[U]** not stated | **[E]** Business plan: full API access at 120-240 requests/minute | **[U]** not stated | **[U]** not stated |
| Tripo3D — <https://www.tripo3d.ai/pricing>, <https://www.tripo3d.ai/> | **[U]** both URLs returned HTTP 403 to WebFetch; not confirmed this pass | **[U]** | **[U]** | **[U]** | **[U]** | **[U]** | **[U]** | **[U]** |

**Cost model — 100 / 1,000 / 10,000 image-to-3D generations/month:**

Assumption: Hyper3D Business plan ($120/mo, 416 models/mo, ≈$0.288/model average) is the
lowest-confirmed per-unit cost at moderate-to-high volume; Meshy Pro ($20/mo, 1,000 credits/mo,
per-generation credit cost not itemized) is shown separately because its exact per-model credit
cost was not confirmed this pass.

| Volume | Hyper3D (Business plan, pay overage at direct-credit rate above the ~416/mo included) | Meshy (Pro plan, credits — generation cost per model **[U] not confirmed**) |
|---|---|---|
| 100 | Fits within Creator plan (~60/mo is close but slightly under 100 — **[O]** likely needs Business, $120/mo flat) → **~$120/mo** | Likely fits within Pro's 1,000 credits/mo if 1 generation ≈ 1-5 credits (typical for this class of tool per general vendor pattern — **[U] not confirmed**) → **~$20/mo, unverified per-unit basis** |
| 1,000 | 1,000 − 416 included = 584 over-plan generations × $1.50/credit (assuming 1 credit ≈ 1 generation, **[U] not confirmed** this maps 1:1) + $120 base ≈ **$996/mo, [U] rough estimate only** | Likely requires Premium ($40/mo) or Ultra ($100/mo) tier — exact credit-per-generation cost **[U]** blocks a confident number |
| 10,000 | Enterprise custom pricing required — **[U]** no public per-unit rate at this volume | Enterprise custom pricing required — **[U]** |

**This cost model is explicitly low-confidence [O]** — neither vendor publishes a clean
credits-per-generation figure on the pages fetched this pass. Before committing budget, get the
exact credit cost of one generation at the target quality/resolution from each vendor's live
dashboard or a direct sales conversation (not marketing copy).

**Recommendation: Prototype, single vendor.** Hyper3D's Business tier is the only option in this
category with a confirmed API rate limit (120-240 RPM) and a confirmed commercial-license inclusion
(ChatAvatar), making it the stronger integration candidate over Meshy despite Meshy's lower entry
price — but confirm the true per-generation cost with the vendor before any spend commitment. Do not
buy both; prototype against one at low volume with a hard cost ceiling first.

---

## 4. Mesh optimization

| Option | Price/unit | Free allowance | License | Deployment | Notes |
|---|---|---|---|---|---|
| **meshoptimizer / gltfpack** — <https://github.com/zeux/meshoptimizer> (fetched 2026-09-04) | **[E]** $0 — free, open source | **[E]** Unlimited (self-hosted) | **[E]** MIT License | **[E]** Self-hosted / local — runs as a library or CLI on your own infrastructure, no API call, no network dependency, no per-use cost | Already conceptually compatible with the existing Draco-decoder pipeline the studio already ships (`docs/handoffs/2026-09-04-studio-shell-1.0.md`: "the decoder, wrapper, and WASM are present in `dist`") |
| **Simplygon** — <https://www.simplygon.com/> | **[U]** No public per-tier price found; search-derived: "licensed per game... pricing is tiered and depends on the kind and size (production budget) of the game," free 30-day evaluation license, contact-sales model | **[U]** 30-day evaluation only | **[U]** not confirmed this pass | **[E]** Has both a Unity cloud-service integration (assets sent to Simplygon's cloud) and UE4/UE5 plugin integration | Enterprise/studio-oriented; not a self-serve API for a web app the size of Studio Web today |

**Cost model:** meshoptimizer/gltfpack has **$0 marginal cost at any volume** (100, 1,000, or
10,000 jobs/month all cost $0 in vendor fees; only compute time on Studio Web's own
infrastructure/Worker applies, which was not separately budgeted here). Simplygon has **no public
per-unit price** at any volume — cannot be modeled without a sales conversation.

**Recommendation: Build.** This is the clearest Build decision in the whole matrix: gltfpack/
meshoptimizer is MIT-licensed, self-hosted, free at unlimited volume, and already
conceptually aligned with the existing client-side Draco pipeline. Reject Simplygon for Studio
Web's current scale — it's priced and packaged for game-studio production pipelines, not a
browser-based CC0-asset editor with a $0 infrastructure-spend mandate signed out.

---

## 5. Storage

| Option | Storage $/GB-month | Request/operation cost | Egress | Free tier |
|---|---|---|---|---|
| **Cloudflare R2** — <https://developers.cloudflare.com/r2/pricing/> (fetched 2026-09-04) | **[E]** $0.015/GB-month (Standard); $0.01/GB-month (Infrequent Access) | **[E]** Class A (writes): $4.50/million (Standard); Class B (reads): $0.36/million (Standard) | **[E]** **Free** egress via R2's native APIs (all storage classes) | **[E]** 10 GB-month storage, 1M Class A ops, 10M Class B ops, free egress — all per month |
| **AWS S3 Standard** — <https://aws.amazon.com/s3/pricing/> | **[E]** $0.023/GB-month for the first 50 TB/month, $0.022/GB-month for 500TB+ (figure independently confirmed via `WebSearch` against `aws.amazon.com`, since the pricing page's dynamic table did not render through `WebFetch`; treat as **[E] with a lower-confidence citation path** — re-verify against the live table before finalizing a budget) | **[U]** not itemized this pass | **[E]** First 100 GB/month free (aggregated across all AWS services/regions), then standard per-GB egress rates apply (exact post-100GB rate **[U]** not itemized this pass) | **[E]** New accounts: up to $200 in AWS Free Tier credits, valid 6 months |

**Cost model — 100 / 1,000 / 10,000 exported files/month, assumption: average 15 MB per export
package (GLB + textures + Blender ZIP, consistent with the ~1.96 MB largest single file and 2,323
total `dist` files recorded in `status/baseline.md`, scaled up for a generous per-export bundle
estimate), retained for one month, egress equal to storage volume (every export downloaded once):**

| Volume | Storage | R2 total (storage + Class A write + Class B read, free egress) | S3 total (storage + est. egress, requests not itemized) |
|---|---|---|---|
| 100 exports (1.5 GB) | 1.5 GB | 1.5 × $0.015 + negligible ops ≈ **$0.02/mo** | 1.5 × $0.023 + (1.5GB egress − 100GB free = $0) ≈ **$0.03/mo** |
| 1,000 exports (15 GB) | 15 GB | 15 × $0.015 + negligible ops ≈ **$0.23/mo** | 15 × $0.023 + $0 egress (under 100GB free) ≈ **$0.35/mo** |
| 10,000 exports (150 GB) | 150 GB | 150 × $0.015 + ops ≈ **$2.25/mo** + minor request fees | 150 × $0.023 + (150−100=50GB egress × est. $0.09/GB, **[U]** unconfirmed rate) ≈ **$3.45 + ~$4.50 = ~$7.95/mo, [U] egress rate unconfirmed** |

**Recommendation: Buy (R2), Defer wider adoption.** R2's free egress is a structural cost advantage
over S3 for a product whose entire value is downloadable export files, and R2 fits the existing
Cloudflare Pages deployment with no new vendor relationship. `status/warden-log.md`
Decision (referencing `DECISIONS.md` #11) already correctly defers R2 until file count/size outgrows
same-origin Pages assets — this cost model confirms that deferral is still cheap to reverse later:
R2 costs cents per month at all three modeled volumes.

---

## 6. Authentication

| Option | Free tier | Price beyond free tier | Notes |
|---|---|---|---|
| **Clerk** — <https://clerk.com/pricing> (fetched 2026-09-04) | **[E]** 50,000 Monthly Retained Users (MRUs) free on Hobby (and included at no extra cost on all paid tiers too) | **[E]** 50,001-100,000 MRUs: $0.02/user/mo; 100,001-1,000,000: $0.018/user/mo; 1,000,001-10,000,000: $0.015/user/mo; 10,000,001+: $0.012/user/mo. Pro plan itself: $25/mo ($20/mo annual) | Clerk's MRU definition ("returns ≥24h after signup") is narrower than raw signups — likely cheaper in practice than a MAU-billed competitor for a low-retention alpha product |
| **Auth0** — <https://auth0.com/pricing> (fetched 2026-09-04) | **[E]** 25,000 MAU free (both B2C/B2B), no credit card required | **[E]** B2C Essentials from $35/mo (500 MAU) up to $3,500/mo (50,000 MAU); B2B Essentials from $150/mo | Auth0's free tier ceiling (25,000 MAU) is lower than Clerk's (50,000 MRU) but Auth0's unit is MAU (any active user), a stricter definition than Clerk's MRU |

**Cost model — 100 / 1,000 / 10,000 signed-in users/month (both vendors' free tiers cover all
three volumes):**

| Volume | Clerk | Auth0 |
|---|---|---|
| 100 | **$0** (within 50,000 free MRUs) | **$0** (within 25,000 free MAU) |
| 1,000 | **$0** | **$0** |
| 10,000 | **$0** | **$0** |

**Recommendation: Defer.** Studio Web is explicitly required to stay "fully usable with zero
environment variables" signed out (`CLAUDE.md` operating rule 8; execution handoff non-negotiable
rule 3). Neither vendor is needed until a paid/account-gated feature exists, and both are free at
every volume modeled here. When that feature ships, Clerk's MRU definition is the better fit for a
product whose activity pattern is not yet known — defer the vendor choice itself until a Wave 5+
feature actually requires auth.

---

## 7. Billing

| Option | Fee | Included | Notes |
|---|---|---|---|
| **Stripe** — <https://stripe.com/pricing> (fetched 2026-09-04) | **[E]** 2.9% + $0.30 per successful domestic card charge; +1.5% international cards; +1% currency conversion; +0.5% manually-entered cards; in-person Terminal 2.7% + $0.05 | **[E]** No setup fee, no monthly fee, no hidden fees | Payment processing only — tax/VAT compliance, invoicing edge cases, and dunning are the merchant's responsibility unless additional Stripe products are added |
| **Paddle** — <https://www.paddle.com/pricing> (fetched 2026-09-04) | **[E]** 5% + $0.50 per checkout transaction (Pay-as-you-go) | **[E]** Global tax/VAT compliance, subscription management, fraud/chargeback protection, dunning, 24/7 support all bundled | Paddle is a Merchant of Record (Paddle, not Studio Web, is legally the seller) — meaningfully reduces the studio's own tax-compliance burden at a higher per-transaction cost than Stripe alone |

**Cost model — 100 / 1,000 / 10,000 paid transactions/month, assumption: $19 average transaction
value (mid Spline/Womp-style hobby-tier price point, for comparability with competitor pricing found
in `docs/research/competitive-audit.md`):**

| Volume | Stripe (2.9% + $0.30) | Paddle (5% + $0.50) |
|---|---|---|
| 100 | 100 × ($19×0.029+$0.30) = 100×$0.851 = **$85.10/mo** | 100 × ($19×0.05+$0.50) = 100×$1.45 = **$145.00/mo** |
| 1,000 | **$851.00/mo** | **$1,450.00/mo** |
| 10,000 | **$8,510.00/mo** | **$14,500.00/mo** |

**Recommendation: Defer, then Buy Stripe first.** No billing feature should be integrated before a
paid product exists (Wave 5 scope only). When it does, Stripe is cheaper per-transaction at every
volume modeled, but Paddle's bundled tax/VAT compliance has real value the raw percentage
difference doesn't capture, especially for a solo/small team selling internationally without its own
tax function — worth a second look once actual transaction volume and geography are known, not
before.

---

## 8. Analytics

| Option | Free tier | Price beyond free | Retention | Privacy |
|---|---|---|---|---|
| **Cloudflare Web Analytics** — <https://www.cloudflare.com/web-analytics/> (fetched 2026-09-04) | **[E]** Entirely free, no tier limit stated | **[E]** $0 — no paid tier exists for this product | **[U]** not stated | **[E]** No cookies, no localStorage, no IP/UA fingerprinting — "privacy-first" |
| **PostHog** — <https://posthog.com/pricing> (fetched 2026-09-04) | **[E]** 1M analytics events/mo, 5K session recordings/mo, 1M feature-flag requests/mo, 100K error-tracking exceptions/mo, 1,500 survey responses/mo, 1M data-warehouse rows/mo — all free, reset monthly | **[E]** Pay-as-you-go beyond free tier; exact per-unit overage price not itemized on the fetched page — **[U]** | **[E]** 1-year retention on free tier; 7-year retention on paid (card on file) | **[U]** not detailed this pass |

**Cost model — 100 / 1,000 / 10,000 tracked events/month:** both vendors are **$0/month at all
three volumes** — Cloudflare Web Analytics has no paid tier at all, and PostHog's 1,000,000
event/month free allowance is far above the 10,000-event ceiling modeled here.

**Recommendation: Build/Buy hybrid — Cloudflare Web Analytics now, PostHog if product analytics
(funnels, session replay, feature flags) become necessary.** Cloudflare Web Analytics costs nothing,
adds no new vendor relationship (the site is already on Cloudflare Pages), and its no-cookie design
avoids a consent-banner requirement. `docs/handoffs/2026-09-04-studio-shell-1.0.md` already records
telemetry hardened to "a fixed same-origin endpoint and event-specific payload allowlists" with
"zero pre-consent requests" — Cloudflare Web Analytics is consistent with that existing posture.
PostHog is Defer until a specific product question (activation funnel, feature-flag rollout) needs
it — its free tier easily covers Studio Web's current traffic when that day comes.

---

## 9. Monitoring / error reporting

| Option | Free tier | Price beyond free | Notes |
|---|---|---|---|
| **Sentry** — <https://sentry.io/pricing/> (fetched 2026-09-04) | **[E]** Developer plan free: 1 user max, 5,000 errors/mo, 5GB logs, 5GB metrics, 5M trace spans, 50 session replays, 1 uptime monitor, 1 cron monitor | **[E]** Team $26/mo (annual) or Business $80/mo (annual) for unlimited users; overages: +$0.50/GB logs, +$0.50/GB metrics, +$0.25/hr UI profiling, +$1.00/uptime alert, +$0.78/cron monitor | Single-user free tier is a real constraint the moment a second developer needs error visibility |
| **Cloudflare Workers Logs/Logpush** — <https://developers.cloudflare.com/workers/observability/logs/> | **[U]** page did not state whether logging is free or paid, or retention limits, in this pass | **[U]** not confirmed | Bundled with the Workers platform Studio Web would already need for any server-mediated API (per the research-and-monetization plan's minimal Cloudflare architecture); worth a direct pricing-page re-check before relying on it as the primary error-monitoring tool |

**Cost model — 100 / 1,000 / 10,000 error events/month:** Sentry's free tier (5,000 errors/mo)
covers the 100 and 1,000 volumes at **$0/month**; the 10,000-event volume exceeds the free
allowance and requires at minimum the Team plan at **$26/month** (annual billing) with additional
per-GB overage charges not modeled here because the exact bytes/error is unknown.

**Recommendation: Prototype with Sentry's free tier now; Buy Team plan only once a second
developer or >5,000 errors/month is real.** Confirm Cloudflare's own Workers Logs pricing/retention
directly before treating it as a no-cost substitute — this pass could not confirm it is actually
free.

---

## 10. Background jobs

| Option | Free tier | Price beyond free | Message limits |
|---|---|---|---|
| **Cloudflare Queues** — <https://developers.cloudflare.com/queues/platform/pricing/> (fetched 2026-09-04) | **[E]** Workers Free: 10,000 operations/day; Workers Paid: 1,000,000 operations/month included | **[E]** $0.40/million operations beyond included (Workers Paid) | **[E]** Billed per 64KB increment; typical message = 3 ops (write/read/delete); retention 24h (Free, fixed) or 4 days default / up to 14 days configurable (Paid) |
| **Upstash QStash** — <https://upstash.com/pricing/qstash> (fetched 2026-09-04) | **[E]** ~1,000 messages/day (~30,000/mo) free | **[E]** $1/100K messages pay-as-you-go beyond free tier, +$0.05/GB bandwidth beyond 50GB/mo; fixed plans: $180/mo (1M msgs/day), $420/mo (10M msgs/day) | **[U]** per-message size limit not itemized this pass |

**Cost model — 100 / 1,000 / 10,000 background jobs/month, assumption: 1 job = 1 message = 3
Cloudflare operations (write+read+delete):**

| Volume | Cloudflare Queues (Workers Paid, 1M ops/mo included) | Upstash QStash (pay-as-you-go beyond ~30,000/mo free) |
|---|---|---|
| 100 | 300 ops, well within 1M included → **$0/mo** (excluding the $5/mo Workers Paid base fee, not itemized here as it's a platform-wide cost, not per-category) | 100 msgs, within ~30,000/mo free → **$0/mo** |
| 1,000 | 3,000 ops, within included → **$0/mo** | 1,000 msgs, within free tier → **$0/mo** |
| 10,000 | 30,000 ops, within included → **$0/mo** | 10,000 msgs, within free tier → **$0/mo** |

**Recommendation: Build (Cloudflare Queues) if/when a server-mediated job exists.** Both options
are free at all three modeled volumes; Cloudflare Queues is the stronger fit because it sits in the
same platform as the existing Cloudflare Pages deployment and the minimal architecture already
described in `docs/superpowers/plans/2026-09-04-studio-web-research-and-monetization.md` (Task 2,
Step 4: "Minimal: Pages frontend + Worker API proxy + R2 asset storage..."). Defer actually building
this until a specific job (e.g. a queued AI generation) is approved.

---

## 11. Poly Haven: asset rights vs. live API terms

The task requires these recorded **separately**, because they are legally and operationally
different things.

### 11.1 Asset licence (downloaded files)

**[E]** Confirmed via <https://polyhaven.com/license> (fetched 2026-09-04): "Our assets are all
licensed as CC0, which is effectively Public Domain even in jurisdictions that do not support the
Public Domain." No attribution required, commercial use and redistribution both explicitly
permitted.

### 11.2 Live API terms (calling `api.polyhaven.com` at runtime)

**[E]** Confirmed via <https://raw.githubusercontent.com/Poly-Haven/Public-API/master/ToS.md>
(fetched 2026-09-04) and cross-checked against <https://polyhaven.com/our-api>:

- "The API is free to access and use by anyone... for any purpose, including commercial use, at no
  charge." No payment, licence, or key ever required.
- **Attribution IS required for live API use, even though it is not required for the CC0 assets
  themselves once downloaded**: "If you use the live API inside your software, website, or service
  to surface Poly Haven content, you must make it clear to your users where that content comes
  from."
- **A unique `Referer` header or user-agent matching the calling application's name is mandatory**
  on every API call.
- No published rate limit; the ToS instead prohibits any activity that "disrupts, interferes with,
  or degrades the performance of the API."
- "The API is provided on an 'as available' basis, without any service-level or uptime guarantee" —
  no SLA.

### 11.3 Commercial-use conflict check

**No commercial-use conflict found.** Both the CC0 asset licence and the live API ToS explicitly
permit commercial use at no charge. **The one real distinction to design around**: a Studio Web
feature that calls the live Poly Haven API at runtime (e.g. a "browse Poly Haven HDRIs live" panel)
takes on a UI obligation — visible attribution of the source — that a feature which instead
downloads and vendors CC0 files into the repository at build time (Studio Web's current approach for
its Kenney library, per `SCOPE.md`'s "licence+source coverage" description) does not carry in the
same way. `SCOPE.md` already records Poly Haven HDRI fetching as a "blocking Wave-2 deliverable"
using `RGBELoader` — whichever implementation path is chosen, if it calls the live API rather than
vendoring files, it must add a visible "Powered by Poly Haven" credit and a distinguishing
`Referer`/user-agent header to stay compliant with §11.2, independent of the CC0 grant covering the
assets themselves.

---

## 12. Category recommendation summary

| Category | Recommendation | Confidence |
|---|---|---|
| AI product mockups | **Defer** — evidence too thin to choose a vendor | Low |
| Image editing | **Prototype** (Photoroom API, behind a server proxy, hard quota) | Medium |
| Image-to-3D | **Prototype**, single vendor (Hyper3D Business), confirm true per-generation cost first | Low-Medium |
| Mesh optimization | **Build** (meshoptimizer/gltfpack, MIT, self-hosted, $0) | High |
| Storage | **Buy** R2 only once file volume outgrows Pages assets; **Defer** the migration itself | High |
| Authentication | **Defer** until a paid/account feature is approved; Clerk preferred when it is | High |
| Billing | **Defer** until a paid product exists; Stripe preferred on unit cost | High |
| Analytics | **Build/Buy hybrid** — Cloudflare Web Analytics now (free, no vendor addition); PostHog if product-analytics questions arise | High |
| Monitoring | **Prototype** with Sentry's free tier; re-verify Cloudflare Workers Logs pricing before relying on it | Medium |
| Background jobs | **Build** (Cloudflare Queues) only when a specific queued job is approved | High |

No category recommendation above requires any sign-up, purchase, or credential to be created — every
recommendation is a decision for a future wave to execute, consistent with this silo's read-only
mandate.

## 13. What could not be verified this pass

- Meshy's and Hyper3D's exact credits-per-generation cost at a specific quality tier (blocks a
  confident image-to-3D cost model at all three volumes).
- Tripo3D pricing entirely (both official URLs returned HTTP 403).
- Simplygon's numeric pricing (contact-sales-only, no public figure).
- remove.bg's standard-resolution per-image credit cost (only the ≤50MP high-res tier was itemized
  on the fetched page).
- Cloudflare Workers Logs/Logpush's actual price and retention limits (page did not state them).
- PostHog's exact pay-as-you-go overage rate per event beyond the free tier.
- AWS S3's exact post-free-tier egress rate and per-request pricing (dynamic pricing table did not
  render through the fetch tool; the $0.023/GB-month storage figure is corroborated by a
  `WebSearch` result citing `aws.amazon.com` but was not read directly off the live table in this
  session).
- Output-rights and data-training policies for Photoroom, remove.bg (beyond its voluntary
  improvement program), Womp, and Spline — none of the fetched pricing pages stated these terms;
  they would need a Terms-of-Service read before any Buy decision.
