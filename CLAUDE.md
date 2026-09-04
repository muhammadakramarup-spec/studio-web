# Claude Design Mission: Make Studio Web Excellent

You have permission to research, design, edit, test, and improve this repository. Work on a feature
branch and leave the owner a reviewable pull request; do not expose credentials or purchase paid
services.

## Start here

- Public repository: `https://github.com/muhammadakramarup-spec/studio-web`
- Live product: `https://studio-web-6ms.pages.dev/`
- Detailed execution plan: `docs/superpowers/plans/2026-09-04-claude-design-product-improvement.md`
- Product/deployment handoff: `docs/handoffs/2026-09-04-full-control-development-handoff.md`
- Current shell handoff: `docs/handoffs/2026-09-04-studio-shell-1.0.md`
- Research and monetization plan: `docs/superpowers/plans/2026-09-04-studio-web-research-and-monetization.md`

## Mission

Turn Studio Web into a visually exceptional, trustworthy, fast browser-based 3D product studio.
Improve the complete experience: first-run understanding, visual hierarchy, asset discovery, 3D
editing, project persistence, exports, responsive behavior, accessibility, performance, failure
states, documentation, tests, and commercially useful product functions.

## Operating rules

1. Create and work on `claude/design-product-v1`; never force-push or rewrite `master`.
2. Audit the live product and current code before proposing a redesign. Capture the same important
   states at 1536×864, 1280×720, and 390×844.
3. Research current best-in-class 3D editors, product-mockup tools, asset libraries, and creator
   workflows. Cite sources and distinguish evidence from opinion.
4. Present three coherent visual directions, compare them against explicit criteria, select one,
   and record why. Preserve Studio Web's dark, content-first character unless evidence justifies a
   change.
5. Do not replace the working Three.js application with a static mock. Existing loading, editing,
   timeline, project, and export behavior must remain functional.
6. Use tests first for behavioral changes. Run focused tests during development and the full serial
   suite before declaring the branch ready.
7. Use real, licensed assets already in the repository. Never add unlicensed images, icons, models,
   fonts, or generated assets without provenance and commercial-use terms.
8. Keep provider keys and privileged Cloudflare credentials out of browser bundles and Git. Paid
   providers must be researched and costed before integration.
9. Do not fake `.blend`, GIF, or any other export by renaming another format. Validate downloaded
   bytes and clearly document compatibility boundaries.
10. Make small reviewable commits. Push the branch and open a pull request that includes screenshots,
    test results, performance measurements, risks, and follow-up recommendations.

## Required sequence

1. Establish the baseline and run the existing application and tests.
2. Complete source-backed product, usability, visual, accessibility, and performance research.
3. Write a prioritized audit and select a single design direction.
4. Implement the approved foundation and core journey in small tested tranches.
5. Add only the highest-value functions supported by evidence and compatible with the architecture.
6. Complete visual, functional, accessibility, responsive, performance, security, and export QA.
7. Update documentation, push the branch, and open the pull request.

Follow the detailed plan. If evidence changes a priority, record the decision before changing scope.
Ask the owner only when a choice would spend money, expose private data, grant external permissions,
or materially change the product's target customer.

