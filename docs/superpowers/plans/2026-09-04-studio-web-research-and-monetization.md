# Studio Web Research & Monetization Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an evidence-backed product, API, deployment, and monetization decision package for turning Studio Web into a sustainable 3D asset and AI-mockup business.

**Architecture:** Run two independent research streams against one shared product baseline. Stream A evaluates the user journey, exports, integrations, costs, security, and Cloudflare architecture; Stream B evaluates customers, positioning, pricing, distribution, unit economics, and demand tests. ChatGPT coordinates the synthesis and uses Perplexity findings only as a separately attributed cross-check, never as the sole source for pricing, licensing, or platform-policy claims.

**Tech Stack:** Existing Three.js r170 + Vite + TypeScript application; Cloudflare Pages and Wrangler; candidate Cloudflare Workers, R2, D1, Queues, AI, and Turnstile services; candidate image/3D generation, auth, billing, email, analytics, and support APIs; Markdown decision report with source links.

**Spec:** `C:\3D-Studio\02_projects\studio-web\REPORT.md`, `SCOPE.md`, `DECISIONS.md`, and `status\final_qa.md`

## Global Constraints

- Preserve the current working baseline: 40/40 per-file tests, clean TypeScript check, clean production build, and the live Cloudflare Pages deployment.
- Keep the signed-out product fully usable with zero environment variables; paid services must be optional enhancements.
- Never place provider keys, billing secrets, privileged Cloudflare tokens, or user asset credentials in browser code.
- Verify current prices, quotas, licensing terms, export rights, rate limits, and data-retention policies from primary sources before recommending a vendor.
- Preserve CC0/source provenance for bundled assets and record provenance for every generated or imported asset.
- Label estimates, hypotheses, and Perplexity-only observations separately from verified facts.
- Do not add a paid API integration until a cost ceiling, abuse-control plan, fallback behavior, and kill switch are documented.
- The first commercial release must support GLB and Blender-oriented workflows without making unsupported claims about native `.blend` generation or compatibility.

---

## Research program

### Task 1: Freeze the product baseline and decision questions

**Files:**
- Read: `C:\3D-Studio\02_projects\studio-web\REPORT.md`
- Read: `C:\3D-Studio\02_projects\studio-web\SCOPE.md`
- Read: `C:\3D-Studio\02_projects\studio-web\DECISIONS.md`
- Read: `C:\3D-Studio\02_projects\studio-web\status\final_qa.md`
- Create: `C:\3D-Studio\02_projects\studio-web\research\baseline.md`

**Interfaces:**
- Consumes: the deployed Studio Web baseline and its measured test evidence.
- Produces: a one-page baseline containing current capabilities, known limitations, target users, research exclusions, and the exact decisions the two streams must answer.

- [ ] **Step 1: Record the current user journey**

  Document: open site → browse 2,280 assets → load asset → manipulate scene → export PNG/turntable ZIP. Add the signed-out account state, mock AI flow, current export formats, current Cloudflare URL, and the limitations already recorded in the project report.

- [ ] **Step 2: Define the decision questions**

  Use these questions verbatim in the baseline:

  1. Which creator segment has the most urgent problem and a reachable willingness to pay?
  2. Which feature should become the paid wedge: AI mockups, asset packs, advanced editing, export conversion, hosted projects, or team/API access?
  3. Which APIs can deliver acceptable quality at a sustainable gross margin?
  4. Which Cloudflare architecture keeps the public app fast, secure, and cheap at 1k, 10k, and 100k monthly active users?
  5. Which 30-day experiments can falsify the business before significant API spend?

- [ ] **Step 3: Define success criteria**

  The baseline is complete when every research claim can be mapped to a decision question, every open question has an owner stream, and the final package has explicit build, buy, test, defer, and reject outcomes.

### Task 2: Stream A — product and engineering research

**Files:**
- Create: `C:\3D-Studio\02_projects\studio-web\research\technical-research-brief.md`
- Create: `C:\3D-Studio\02_projects\studio-web\research\api-and-architecture-matrix.md`

**Interfaces:**
- Consumes: `research\baseline.md` and official vendor documentation/pricing.
- Produces: a scored technical matrix and an implementation sequence for the next release.

- [ ] **Step 1: Evaluate the product upgrades**

  Score each upgrade from 1–5 for user value, implementation effort, recurring cost, defensibility, and risk:

  - AI-generated product mockups from a selected 3D asset.
  - Background removal, relighting, and scene composition.
  - GLB optimization, preview rendering, and batch conversion.
  - `.blend` export support through a safe Blender-side or server-side conversion path, with a clear compatibility boundary.
  - Hosted project saves, version history, and share links.
  - Asset search by text, category, style, license, polycount, and format.
  - Creator upload, private libraries, and sellable asset packs.
  - Team review, comments, and approval workflows.

- [ ] **Step 2: Build the API buy/build matrix**

  Research at least two viable vendors or open-source alternatives for each category, then record official price, free allowance, billing unit, latency, output rights, commercial-use rights, training/data policy, API stability, region limits, rate limits, moderation requirements, and fallback option:

  - Image generation and editing.
  - Text-to-3D and image-to-3D generation.
  - 3D mesh repair, retopology, decimation, and format conversion.
  - Embeddings/search and asset tagging.
  - Authentication and database.
  - Billing and tax handling.
  - Object storage, image transforms, queues, and background jobs.
  - Product analytics, error monitoring, email, and support.

  Use first-party docs and pricing pages for every recommendation. Treat marketplace reviews and Perplexity summaries as discovery leads until independently verified.

- [ ] **Step 3: Model unit economics**

  Create three usage cases—light, normal, and heavy—with explicit assumptions for generations per user, output size, storage, bandwidth, queue time, and support load. Calculate cost per active user and gross margin at prices of $9, $19, and $49 per month plus pay-as-you-go credits. Mark all assumptions as estimates and show break-even active users for each API bundle.

- [ ] **Step 4: Design the Cloudflare architecture**

  Compare a minimal path and a scalable path:

  - Minimal: Pages frontend + Worker API proxy + R2 asset storage + Turnstile abuse gate + billing webhook endpoint.
  - Scalable: the minimal path plus D1 or an external relational database, Queues for generation jobs, durable job status, per-user quotas, cache layers, observability, and signed download URLs.

  For every component specify the data it stores, retention period, failure behavior, authentication boundary, expected cost driver, and rollback path.

- [ ] **Step 5: Define the integration contract**

  Specify browser-safe interfaces such as `POST /api/generate`, `GET /api/jobs/:id`, `POST /api/exports`, and `GET /api/assets/:id/download` with request limits, authenticated identity, idempotency key, status values, error codes, provider timeout, and provider fallback. The frontend must never call a paid provider directly.

- [ ] **Step 6: Produce the technical recommendation**

  End the stream with a ranked next-release backlog, vendor shortlist, monthly cost ceiling, security checklist, migration risks, and a recommendation for what to build now, buy now, prototype, or defer.

### Task 3: Stream B — business model and go-to-market research

**Files:**
- Create: `C:\3D-Studio\02_projects\studio-web\research\business-research-brief.md`
- Create: `C:\3D-Studio\02_projects\studio-web\research\monetization-and-go-to-market-matrix.md`

**Interfaces:**
- Consumes: `research\baseline.md` and current competitor, customer, pricing, and licensing evidence.
- Produces: a customer-backed business model and a sequence of demand experiments.

- [ ] **Step 1: Segment the customers**

  Compare indie game developers, 3D artists, agencies, ecommerce marketers, product designers, educators, and social-media creators. For each segment document job-to-be-done, current workaround, buying trigger, budget owner, acceptable output format, collaboration need, acquisition channel, and reason they might not pay.

- [ ] **Step 2: Map the competitive alternatives**

  Compare browser 3D editors, asset marketplaces, AI mockup tools, image generators, Blender workflows, and hosted design tools. Record their free limits, paid tiers, export restrictions, asset licenses, collaboration features, and positioning using direct links to official pages where possible.

- [ ] **Step 3: Test monetization models**

  Score these models against customer value, implementation complexity, support burden, fraud/abuse risk, and margin:

  - Free editor and CC0 library with paid AI credits.
  - Freemium editor with Pro exports, private projects, and higher limits.
  - Paid asset packs and curated scene kits.
  - Creator marketplace with a platform commission.
  - Team workspace subscriptions.
  - Agency/API plans with white-label or batch generation.
  - Sponsored or affiliate discovery, kept separate from the core editing experience.

- [ ] **Step 4: Define the free-to-paid funnel**

  Design one complete path: discover free asset → create a useful mockup → save/share → hit a meaningful limit → see a concrete paid outcome → pay → receive the export. Specify which actions remain free, which limits are fair, and which watermark or attribution rules preserve trust.

- [ ] **Step 5: Design demand tests before API spend**

  Plan a landing-page test, five customer interviews, a clickable mockup test, and a paid-preorder or waitlist test. Define sample size, success threshold, exact offer, acquisition channel, and stop condition for each. Do not treat page views or likes as purchase validation.

- [ ] **Step 6: Produce the business recommendation**

  End the stream with the primary customer, sharp positioning statement, first paid feature, price hypothesis, free limits, acquisition plan, 30-day experiment sequence, and the evidence that would justify spending on production APIs.

### Task 4: Cross-stream evidence reconciliation

**Files:**
- Create: `C:\3D-Studio\02_projects\studio-web\research\claim-source-ledger.md`
- Create: `C:\3D-Studio\02_projects\studio-web\research\research-synthesis.md`

**Interfaces:**
- Consumes: both stream matrices plus ChatGPT and Perplexity research outputs.
- Produces: one reconciled decision package with confidence levels and explicit gaps.

- [ ] **Step 1: Normalize evidence**

  For every material claim record source title, publisher, publication/update date, URL, geography, product/version scope, claim, confidence, contradiction, and next verification step. Keep ChatGPT browsing evidence and Perplexity evidence in separate source columns.

- [ ] **Step 2: Resolve disagreements**

  Recheck claims where pricing, commercial rights, output ownership, rate limits, or platform terms differ. Prefer current first-party documentation; if a primary source is unavailable, retain the uncertainty instead of choosing the most optimistic number.

- [ ] **Step 3: Apply the stop test**

  Stop discovery when each decision question has a supported answer, unresolved claims have an explicit limitation, and another broad search is unlikely to change the recommendation. Record the searches performed and why further research was stopped.

- [ ] **Step 4: Write the executive decision**

  The synthesis must answer: who to serve first, what to sell first, which APIs to buy first, what to keep free, what Cloudflare components to add, what not to build, the maximum initial monthly spend, and the next seven implementation tasks.

### Task 5: Convert research into a 30-day execution program

**Files:**
- Create: `C:\3D-Studio\02_projects\studio-web\research\30-day-execution-program.md`
- Modify: `C:\3D-Studio\02_projects\studio-web\REPORT.md`

**Interfaces:**
- Consumes: `research\research-synthesis.md` and the claim-source ledger.
- Produces: an ordered build-and-test program with measurable gates.

- [ ] **Step 1: Define Week 1 validation**

  Ship the landing-page offer, instrument activation, recruit interviews, and test the mockup/export value proposition with no paid generation dependency.

- [ ] **Step 2: Define Week 2 prototype**

  Implement the smallest server-mediated AI mockup proof with a hard per-user quota, cost cap, provider timeout, logged job status, and a manual fallback image path.

- [ ] **Step 3: Define Week 3 conversion test**

  Add a real checkout or payment-link experiment only after the offer has a measured activation event. Test one Pro plan and one credit pack with transparent export and asset-license terms.

- [ ] **Step 4: Define Week 4 go/no-go gate**

  Continue only if the activation rate, qualified-interest rate, paid conversion, cost per successful output, refund/support rate, and gross-margin estimate meet the thresholds chosen in the synthesis. Otherwise revise the segment or offer before increasing infrastructure/API spend.

- [ ] **Step 5: Update the project report**

  Add the selected business wedge, chosen providers, monthly spend ceiling, deployment architecture, experiment results, and remaining risks to `REPORT.md` without removing the existing limitations.

## Handoff package

Two separate ChatGPT research tasks should run from the same baseline but must not duplicate one another:

1. **Engineering and deployment research:** evaluate product improvements, API vendors, Cloudflare architecture, security, integration contracts, costs, and export feasibility.
2. **Business and monetization research:** evaluate customer segments, competitors, offers, pricing, free-to-paid funnel, distribution, unit economics, and demand experiments.

Each handoff must return compact source provenance, primary-source links, current pricing/terms, confidence, contradictions, and remaining gaps. ChatGPT remains the orchestrator and reconciles Perplexity results as cross-check evidence rather than silently merging unsupported claims.

## Verification checklist

- [ ] `research\baseline.md` exists and matches the current deployed product.
- [ ] Both stream briefs define concrete answer slots and stopping criteria.
- [ ] Every recommended API has first-party price, quota, rights, and policy evidence.
- [ ] Cost model includes light, normal, and heavy usage cases.
- [ ] Free and paid product boundaries are explicit.
- [ ] Cloudflare design has authentication, abuse controls, secrets boundaries, failure paths, and rollback.
- [ ] Final synthesis distinguishes fact, inference, estimate, and unresolved uncertainty.
- [ ] The 30-day program has measurable gates before adding material recurring spend.
