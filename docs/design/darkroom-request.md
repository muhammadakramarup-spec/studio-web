# Request: the normative Darkroom design artifact

Status: **blocked**. This document is a request to the owner, not a design specification. No
design implementation should start from this document.

## What is missing

`Studio Web Redesign.dc.html`, direction **"1a Darkroom"**, is the normative design artifact named
in the earlier project draft as the source of truth for Studio Web's visual system. It is not
present anywhere reachable from this machine or this repository.

## What it is needed for

Wave 1 Design Foundation (`src/app/style.css`) and Wave 1 Shell (`index.html`, `src/app/main.ts`)
cannot implement a visual system without it. Specifically the artifact is the only accepted source
for:

- Colour tokens (background/surface/border/text/accent scale, dark-theme values)
- Type scale (heading, body, supporting/label sizes, line-height, weight steps)
- Spacing scale and layout grid
- Corner radii
- Border weights and colours
- Focus treatment (focus-visible outline style, colour, offset)
- Control states: default, hover, active/pressed, focus, disabled
- Responsive breakpoint behaviour at 1536×864, 1280×720, 1024×768, 768×1024, and 390×844
- Reduced-motion rules (what animates, what must not, fallback presentation)
- The exact product states the redesign must render: **empty, loading, loaded, selected, editing,
  saving, exporting, completed, disabled, unsupported, context-lost, recovered**

Without these exact values, any implementation is an invented approximation, which the project's
handoff rule explicitly forbids (see `docs/handoffs/2026-09-04-claude-design-product-v1-execution-handoff.md`,
"External design dependency": *"A screenshot alone is not the normative specification... Do not
invent or approximate the missing design."*). The team will not invent or approximate the Darkroom
design. Wave 1 visual implementation stays deferred until one of the paths below closes this gap.

## Locations already searched, with negative result

All searched 2026-09-04. Every search returned no `.dc.html` file matching `Studio Web Redesign` or
the "1a Darkroom" direction.

| Location | Result |
|---|---|
| Public repository, commit `9c010fe`, and the `claude/design-product-v1` branch | Not present |
| The complete `C:\3D-Studio` tree | Not present |
| The owner's Documents folder | Not present |
| The owner's Downloads folder | Not present |
| `C:\Users\muazz\OneDrive\Documents\3d 4d\website data\studio-web-chatgpt-handoff-2026-09-04.zip` | Repository snapshot; no `.dc.html` inside |
| `C:\Users\muazz\OneDrive\Documents\3d 4d\website data\studio-web-cloudflare-ready-2026-09-04.zip` | Repository snapshot; no `.dc.html` inside |
| The owner's published Claude artifacts list | Not present |
| The design-sync connector | Cannot query yet — needs a one-time `/design-login` from an interactive Claude Code session on this machine |

Only unrelated `.dc.html` logo-reveal files exist elsewhere under `C:\3D-Studio`; none match this
artifact or direction. This matches the search already recorded in `status/baseline.md`
("Darkroom artifact search") and `status/warden-log.md` (2026-09-04 session start entry) — this
document does not repeat that search, it reports the same negative result for the owner.

## Three ways to unblock this, in order of speed

**(a) Copy the file into the repository.**
Place `Studio Web Redesign.dc.html` at `docs/design/Studio Web Redesign.dc.html` on the
`claude/design-product-v1` branch (or hand it to the Warden to place there). This is the fastest
path — implementation can start the same session.

**(b) Run `/design-login` once.**
From an interactive Claude Code session on this machine, run `/design-login` a single time so the
design-sync connector can authenticate and pull the Claude Design project containing the Darkroom
artifact. This is a one-time action; it cannot be performed from this non-interactive research
session.

**(c) Use Claude Design's "Send to Claude Code."**
From inside the Claude Design project holding the "1a Darkroom" direction, use the built-in "Send to
Claude Code" action to push the artifact directly into a session with write access to this branch.

## What will not substitute for the artifact

A screenshot, a verbal description, or a second-hand summary of "1a Darkroom" is not the normative
specification and will not be used to derive token values, spacing, or state treatments. If the
owner can only supply a screenshot in the short term, Wave 1 research and the non-visual Wave 3
functions (timeline-sampled export, project v2 + recovery, export receipt/provenance) can continue
in parallel, per the owner decision recorded in `status/warden-log.md` (2026-09-04, "Owner decision
(this session)"), but no CSS token, spacing, or radius value will be written from a screenshot
alone.

## Requested owner action

Choose (a), (b), or (c) above and confirm which one you are doing. Once the artifact (or design-sync
access) is available, the Design Foundation and Shell silos can extract the token, type,
spacing, radii, border, focus, control-state, breakpoint, and reduced-motion specification and
begin Wave 1 visual implementation the same session.
