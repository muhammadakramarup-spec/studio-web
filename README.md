# studio-web

Public repository: <https://github.com/muhammadakramarup-spec/studio-web>

Live application: <https://studio-web-6ms.pages.dev/>

For Claude Design or Claude Code, start with `CLAUDE.md` and execute the linked step-by-step plan on
the `claude/design-product-v1` branch.

Free web 3D studio, built in one multi-agent session from the verified viewer in `reference/`.

- `HANDOFF_OPUS.md` — start here. The one-day plan: Warden, six parallel silos, Codex CLI as developer + reviewer, assembly, ship.
- `CONTEXT.lock.md` — the locked context every agent receives verbatim. Never edited during the day.
- `PRODUCT_PLAN.md` — the north star (tiers, phases, stack, asset sources). The day's actual commitment is `SCOPE.md`, written by the agents in Wave 1.
- `status/PROGRESS.html` — open this to watch the day. Re-rendered from `status/events.jsonl` every 10 minutes.
- `reference/` — the working single-file studio, its 359-line original, the pixel-diff harness, and sample renders. Read-only.

To run the day: open a Claude Code session here with Opus and say *"Read HANDOFF_OPUS.md and run the day."*
